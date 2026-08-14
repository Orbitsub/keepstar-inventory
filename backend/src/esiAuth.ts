import axios from 'axios';
import crypto from 'crypto';
import { dbHelper } from './database';

const SSO_AUTHORIZE_URL = 'https://login.eveonline.com/v2/oauth/authorize';
const SSO_TOKEN_URL = 'https://login.eveonline.com/v2/oauth/token';
const REQUIRED_SCOPE = 'esi-markets.structure_markets.v1';

const CLIENT_ID = process.env.ESI_CLIENT_ID || '';
const CLIENT_SECRET = process.env.ESI_CLIENT_SECRET || '';
const CALLBACK_URL = process.env.ESI_CALLBACK_URL || '';

// In-memory pending-state store for CSRF protection during the OAuth redirect round-trip
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;

function pruneExpiredStates() {
  const now = Date.now();
  for (const [state, createdAt] of pendingStates) {
    if (now - createdAt > STATE_TTL_MS) pendingStates.delete(state);
  }
}

export function isSsoConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET && CALLBACK_URL);
}

export function buildAuthorizeUrl(): string {
  pruneExpiredStates();
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now());

  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: CALLBACK_URL,
    client_id: CLIENT_ID,
    scope: REQUIRED_SCOPE,
    state,
  });
  return `${SSO_AUTHORIZE_URL}?${params.toString()}`;
}

export function isValidState(state: string): boolean {
  pruneExpiredStates();
  if (!pendingStates.has(state)) return false;
  pendingStates.delete(state);
  return true;
}

function decodeJwtPayload(token: string): any {
  const parts = token.split('.');
  if (parts.length < 2) return {};
  const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
  return JSON.parse(payload);
}

function basicAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
}

export async function exchangeCodeForToken(code: string): Promise<void> {
  const response = await axios.post(
    SSO_TOKEN_URL,
    new URLSearchParams({ grant_type: 'authorization_code', code }).toString(),
    {
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Host: 'login.eveonline.com',
      },
    }
  );

  await persistTokenResponse(response.data);
}

async function refreshAccessToken(refreshToken: string): Promise<void> {
  const response = await axios.post(
    SSO_TOKEN_URL,
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
    {
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Host: 'login.eveonline.com',
      },
    }
  );

  await persistTokenResponse(response.data);
}

async function persistTokenResponse(data: { access_token: string; refresh_token: string; expires_in: number }): Promise<void> {
  const payload = decodeJwtPayload(data.access_token);
  const sub: string = payload.sub || '';
  const characterId = sub.startsWith('CHARACTER:EVE:') ? parseInt(sub.split(':')[2], 10) : null;
  const characterName: string | null = payload.name || null;
  const scopes: string | null = Array.isArray(payload.scp) ? payload.scp.join(' ') : (typeof payload.scp === 'string' ? payload.scp : null);
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  dbHelper.setAuthToken({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
    character_id: characterId,
    character_name: characterName,
    scopes,
  });
}

/**
 * Returns a currently-valid access token, transparently refreshing it if it's expired or
 * about to expire. Returns null if the app has never completed the SSO login flow.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const token = dbHelper.getAuthToken();
  if (!token.refresh_token) return null;

  const expiresAt = token.expires_at ? new Date(token.expires_at).getTime() : 0;
  const needsRefresh = !token.access_token || Date.now() > expiresAt - 60 * 1000; // refresh 1 min early

  if (needsRefresh) {
    await refreshAccessToken(token.refresh_token);
    return dbHelper.getAuthToken().access_token;
  }

  return token.access_token;
}

export function getAuthStatus() {
  const token = dbHelper.getAuthToken();
  return {
    ssoConfigured: isSsoConfigured(),
    authenticated: !!token.refresh_token,
    characterId: token.character_id,
    characterName: token.character_name,
    scopes: token.scopes,
  };
}

export function logout(): void {
  dbHelper.clearAuthToken();
}
