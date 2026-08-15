import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { db, dbHelper } from './database';
import { computeSalesVelocity, getLowStockView, getMarginView, getZeroStockView } from './metrics';

const missingMetadataTypeId = 910000003;
const sparseHistoryTypeId = 910000004;
const stalePriceTypeId = 910000005;
const originalSettings = dbHelper.getSettings();

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function removeFixtures(): void {
  const typeIds = [missingMetadataTypeId, sparseHistoryTypeId, stalePriceTypeId];
  const placeholders = typeIds.map(() => '?').join(', ');
  db.prepare(`DELETE FROM snapshots WHERE type_id IN (${placeholders})`).run(...typeIds);
  db.prepare(`DELETE FROM baseline_items WHERE type_id IN (${placeholders})`).run(...typeIds);
  db.prepare(`DELETE FROM items WHERE type_id IN (${placeholders})`).run(...typeIds);
  db.prepare(`DELETE FROM jita_prices WHERE type_id IN (${placeholders})`).run(...typeIds);
}

afterEach(() => {
  removeFixtures();
  const { id: _id, ...settings } = originalSettings;
  dbHelper.updateSettings(settings);
});

test('uses fallback metadata and ignores a baseline with no snapshots', () => {
  dbHelper.addBaselineItem(missingMetadataTypeId, daysAgo(1));
  assert.equal(getZeroStockView().some(item => item.type_id === missingMetadataTypeId), false);
  assert.equal(getLowStockView().some(item => item.type_id === missingMetadataTypeId), false);

  const pollId = dbHelper.createPoll(daysAgo(0));
  dbHelper.insertSnapshot(pollId, missingMetadataTypeId, 0, null, daysAgo(0));
  const [entry] = getZeroStockView().filter(item => item.type_id === missingMetadataTypeId);

  assert.equal(entry.name, `Type ID ${missingMetadataTypeId}`);
  assert.equal(entry.category_name, 'Uncategorized');
  assert.equal(entry.last_seen_quantity, 0);
});

test('does not trust sparse sales history below the configured sample size', () => {
  const first = daysAgo(2);
  const second = daysAgo(1);
  dbHelper.addBaselineItem(sparseHistoryTypeId, first);
  const pollId = dbHelper.createPoll(first);
  dbHelper.insertSnapshot(pollId, sparseHistoryTypeId, 10, 100, first);
  dbHelper.insertSnapshot(pollId, sparseHistoryTypeId, 5, 100, second);

  const velocity = computeSalesVelocity(sparseHistoryTypeId, 14, 3);

  assert.equal(velocity.avgDailySales, 5);
  assert.equal(velocity.sampleCount, 1);
  assert.equal(velocity.trusted, false);
  assert.equal(getLowStockView().some(item => item.type_id === sparseHistoryTypeId), false);
});

test('keeps a stale Jita price available as a margin fallback', () => {
  dbHelper.addBaselineItem(stalePriceTypeId, daysAgo(1));
  dbHelper.upsertItemMeta({
    type_id: stalePriceTypeId,
    name: 'Stale Price Test Item',
    group_id: 1,
    group_name: 'Test Group',
    category_id: 2,
    category_name: 'Test Category',
    packaged_volume: 1,
    meta_updated_at: new Date().toISOString(),
  });
  const pollId = dbHelper.createPoll(daysAgo(0));
  dbHelper.insertSnapshot(pollId, stalePriceTypeId, 10, 100, daysAgo(0));
  dbHelper.cacheJitaPrice({
    type_id: stalePriceTypeId,
    sell_price: 50,
    buy_price: null,
    last_updated: daysAgo(2),
  });

  const [entry] = getMarginView().filter(item => item.type_id === stalePriceTypeId);

  assert.equal(entry.source_cost, 50);
  assert.equal(entry.current_price, 100);
});