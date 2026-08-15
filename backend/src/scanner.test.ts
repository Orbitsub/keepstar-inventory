import assert from 'node:assert/strict';
import { afterEach, test, mock } from 'node:test';
import { dbHelper } from './database';
import { logout } from './esiAuth';
import { pollMarket, scannerStatus, startScheduler, stopScheduler } from './scanner';

const originalSettings = dbHelper.getSettings();

afterEach(() => {
  stopScheduler();
  dbHelper.updateSettings({
    structure_id: originalSettings.structure_id,
    poll_interval_minutes: originalSettings.poll_interval_minutes,
    is_active: originalSettings.is_active,
  });
  scannerStatus.isRunning = false;
  scannerStatus.lastPollStatus = null;
  scannerStatus.lastError = null;
});

test('does not schedule polling when the scanner is inactive', () => {
  dbHelper.updateSettings({ is_active: 0, poll_interval_minutes: 5 });
  const setIntervalMock = mock.method(global, 'setInterval');

  try {
    startScheduler();
    assert.equal(setIntervalMock.mock.callCount(), 0);
  } finally {
    setIntervalMock.mock.restore();
  }
});

test('schedules polling at the configured interval and enforces the five-minute minimum', () => {
  dbHelper.updateSettings({ is_active: 1, poll_interval_minutes: 1 });
  const setIntervalMock = mock.method(global, 'setInterval');

  try {
    startScheduler();
    assert.equal(setIntervalMock.mock.callCount(), 1);
    assert.equal(setIntervalMock.mock.calls[0].arguments[1], 5 * 60 * 1000);
  } finally {
    setIntervalMock.mock.restore();
  }
});

test('surfaces an unauthenticated poll failure and clears the running state', async () => {
  dbHelper.updateSettings({ structure_id: 'test-structure', is_active: 0 });
  logout();

  await pollMarket();

  assert.equal(scannerStatus.isRunning, false);
  assert.equal(scannerStatus.lastPollStatus, 'error');
  assert.equal(scannerStatus.lastError, 'Not authenticated - complete SSO login in Settings.');
});