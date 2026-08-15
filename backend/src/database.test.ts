import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { dbHelper } from './database';

const originalSettings = dbHelper.getSettings();

afterEach(() => {
  const { id: _id, ...settings } = originalSettings;
  dbHelper.updateSettings(settings);
});

test('merges partial settings updates without resetting other values', () => {
  dbHelper.updateSettings({ structure_name: 'Test Keepstar', discord_webhook: 'https://discord.com/api/webhooks/test' });
  const updated = dbHelper.getSettings();

  assert.equal(updated.structure_name, 'Test Keepstar');
  assert.equal(updated.discord_webhook, 'https://discord.com/api/webhooks/test');
  assert.equal(updated.poll_interval_minutes, originalSettings.poll_interval_minutes);
  assert.equal(updated.sales_lookback_days, originalSettings.sales_lookback_days);
});