import assert from 'node:assert/strict';
import { after, before, describe, mock, test } from 'node:test';

import { dbHelper } from './database';
import { buildAuthorizeUrl, exchangeCodeForToken, getAuthStatus, getValidAccessToken, isValidState, logout } from './esiAuth';
import axios from 'axios';

function accessToken(payload: Record<string, unknown>): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encodedPayload}.signature`;
}

describe('EVE SSO smoke flow', () => {
  before(() => logout());
  after(() => logout());

  test('builds an authorize URL with the required scope and one-time state', () => {
    const authorizeUrl = new URL(buildAuthorizeUrl());
    const state = authorizeUrl.searchParams.get('state');

    assert.equal(authorizeUrl.origin, 'https://login.eveonline.com');
    assert.equal(authorizeUrl.pathname, '/v2/oauth/authorize');
    assert.equal(authorizeUrl.searchParams.get('client_id'), 'smoke-test-client');
    assert.equal(authorizeUrl.searchParams.get('redirect_uri'), process.env.ESI_CALLBACK_URL);
    assert.equal(authorizeUrl.searchParams.get('scope'), 'esi-markets.structure_markets.v1');
    assert.ok(state);
    assert.equal(isValidState(state), true);
    assert.equal(isValidState(state), false);
  });

  test('persists login metadata and refreshes an expired token', async () => {
    const initialToken = accessToken({
      sub: 'CHARACTER:EVE:123456789',
      name: 'Smoke Pilot',
      scp: ['esi-markets.structure_markets.v1'],
    });
    const refreshedToken = accessToken({
      sub: 'CHARACTER:EVE:123456789',
      name: 'Smoke Pilot',
      scp: ['esi-markets.structure_markets.v1'],
    });
    const post = mock.method(axios, 'post', async (_url: string, body: string) => {
      if (body.includes('grant_type=authorization_code')) {
        return { data: { access_token: initialToken, refresh_token: 'refresh-1', expires_in: 3600 } };
      }
      assert.match(body, /grant_type=refresh_token/);
      return { data: { access_token: refreshedToken, refresh_token: 'refresh-2', expires_in: 3600 } };
    });

    await exchangeCodeForToken('authorization-code');
    const loggedInStatus = getAuthStatus();
    assert.equal(loggedInStatus.authenticated, true);
    assert.equal(loggedInStatus.characterId, 123456789);
    assert.equal(loggedInStatus.characterName, 'Smoke Pilot');
    assert.equal(loggedInStatus.scopes, 'esi-markets.structure_markets.v1');

    dbHelper.setAuthToken({ access_token: initialToken, expires_at: new Date(Date.now() - 1000).toISOString() });
    assert.equal(await getValidAccessToken(), refreshedToken);
    assert.equal(dbHelper.getAuthToken().refresh_token, 'refresh-2');
    assert.equal(post.mock.callCount(), 2);
    post.mock.restore();
  });

  test('reports an unauthenticated state after logout', () => {
    logout();
    const status = getAuthStatus();
    assert.equal(status.authenticated, false);
    assert.equal(status.characterId, null);
    assert.equal(status.scopes, null);
  });
});