import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import axios from 'axios';
import { resetDiscordNotificationState, sendDiscordNotification } from './discord';

afterEach(() => {
  resetDiscordNotificationState();
});

test('sends a bounded Discord webhook payload', async () => {
  const post = async () => ({ data: {} });
  const originalPost = axios.post;
  axios.post = post as typeof axios.post;

  try {
    assert.equal(await sendDiscordNotification('https://discord.com/api/webhooks/test', 'Inventory alert'), true);
    assert.equal(await sendDiscordNotification('http://discord.com/api/webhooks/test', 'Invalid URL'), false);
  } finally {
    axios.post = originalPost;
  }
});

test('ignores missing or non-Discord webhook URLs', async () => {
  const originalPost = axios.post;
  let called = false;
  axios.post = (async () => {
    called = true;
    return { data: {} };
  }) as typeof axios.post;

  try {
    assert.equal(await sendDiscordNotification(null, 'No webhook'), false);
    assert.equal(await sendDiscordNotification('https://example.com/webhook', 'Wrong host'), false);
    assert.equal(called, false);
  } finally {
    axios.post = originalPost;
  }
});