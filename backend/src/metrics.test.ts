import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { db, dbHelper } from './database';
import { getLowStockView, getZeroStockView } from './metrics';

const zeroStockTypeId = 910000001;
const lowStockTypeId = 910000002;
const originalSettings = dbHelper.getSettings();

function snapshotTime(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

function removeFixtures(): void {
  db.prepare('DELETE FROM snapshots WHERE type_id IN (?, ?)').run(zeroStockTypeId, lowStockTypeId);
  db.prepare('DELETE FROM baseline_items WHERE type_id IN (?, ?)').run(zeroStockTypeId, lowStockTypeId);
  db.prepare('DELETE FROM items WHERE type_id IN (?, ?)').run(zeroStockTypeId, lowStockTypeId);
}

afterEach(() => {
  removeFixtures();
  const { id: _id, ...settings } = originalSettings;
  dbHelper.updateSettings(settings);
});

test('reports zero-stock items with their last positive snapshot and metadata', () => {
  const firstSeen = snapshotTime(3);
  dbHelper.addBaselineItem(zeroStockTypeId, firstSeen);
  dbHelper.upsertItemMeta({
    type_id: zeroStockTypeId,
    name: 'Test Isotopes',
    group_id: 1,
    group_name: 'Test Group',
    category_id: 2,
    category_name: 'Test Category',
    packaged_volume: 0.15,
    meta_updated_at: new Date().toISOString(),
  });
  const pollId = dbHelper.createPoll(firstSeen);
  dbHelper.insertSnapshot(pollId, zeroStockTypeId, 25, 120, firstSeen);
  dbHelper.insertSnapshot(pollId, zeroStockTypeId, 0, null, snapshotTime(1));

  const [entry] = getZeroStockView().filter(item => item.type_id === zeroStockTypeId);

  assert.equal(entry.name, 'Test Isotopes');
  assert.equal(entry.category_name, 'Test Category');
  assert.equal(entry.last_seen_quantity, 25);
  assert.equal(entry.last_seen_price, 120);
  assert.equal(entry.sales_trusted, false);
});

test('calculates trusted low-stock velocity and critical severity', () => {
  dbHelper.updateSettings({ min_sample_size: 3, time_to_empty_threshold_hours: 48, sales_lookback_days: 14 });
  const times = [snapshotTime(3), snapshotTime(2), snapshotTime(1), snapshotTime(0)];
  dbHelper.addBaselineItem(lowStockTypeId, times[0]);
  const pollId = dbHelper.createPoll(times[0]);
  [40, 30, 20, 10].forEach((quantity, index) => {
    dbHelper.insertSnapshot(pollId, lowStockTypeId, quantity, 500, times[index]);
  });

  const [entry] = getLowStockView().filter(item => item.type_id === lowStockTypeId);

  assert.equal(entry.current_quantity, 10);
  assert.equal(entry.avg_daily_sales, 10);
  assert.equal(entry.time_to_empty_hours, 24);
  assert.equal(entry.severity, 'critical');
});