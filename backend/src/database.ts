import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'keepstar.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    structure_id TEXT NOT NULL DEFAULT '',
    structure_name TEXT,
    poll_interval_minutes INTEGER NOT NULL DEFAULT 60,
    time_to_empty_threshold_hours REAL NOT NULL DEFAULT 48,
    sales_lookback_days INTEGER NOT NULL DEFAULT 14,
    min_sample_size INTEGER NOT NULL DEFAULT 3,
    hauling_isk_per_m3 REAL NOT NULL DEFAULT 1000,
    sales_tax_pct REAL NOT NULL DEFAULT 3.6,
    broker_fee_pct REAL NOT NULL DEFAULT 2.5,
    discord_webhook TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS auth_token (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT,
    refresh_token TEXT,
    expires_at TEXT,
    character_id INTEGER,
    character_name TEXT,
    scopes TEXT
  );

  CREATE TABLE IF NOT EXISTS items (
    type_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    group_id INTEGER,
    group_name TEXT,
    category_id INTEGER,
    category_name TEXT,
    packaged_volume REAL,
    meta_updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS baseline_items (
    type_id INTEGER PRIMARY KEY,
    first_seen_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    order_count INTEGER,
    item_count INTEGER,
    error_message TEXT
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id INTEGER NOT NULL,
    type_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    min_sell_price REAL,
    polled_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_snapshots_type_time ON snapshots(type_id, polled_at);
  CREATE INDEX IF NOT EXISTS idx_snapshots_poll ON snapshots(poll_id);

  CREATE TABLE IF NOT EXISTS jita_prices (
    type_id INTEGER PRIMARY KEY,
    sell_price REAL,
    buy_price REAL,
    last_updated TEXT
  );
`);

// Seed the single settings row on first run
const settingsRow = db.prepare('SELECT id FROM settings WHERE id = 1').get();
if (!settingsRow) {
  db.prepare(`
    INSERT INTO settings (id, structure_id, structure_name, poll_interval_minutes, time_to_empty_threshold_hours,
      sales_lookback_days, min_sample_size, hauling_isk_per_m3, sales_tax_pct, broker_fee_pct, discord_webhook, is_active)
    VALUES (1, '1051567430261', NULL, 60, 48, 14, 3, 1000, 3.6, 2.5, NULL, 1)
  `).run();
}

const authRow = db.prepare('SELECT id FROM auth_token WHERE id = 1').get();
if (!authRow) {
  db.prepare(`INSERT INTO auth_token (id, access_token, refresh_token, expires_at, character_id, character_name, scopes)
    VALUES (1, NULL, NULL, NULL, NULL, NULL, NULL)`).run();
}

export interface Settings {
  id: number;
  structure_id: string;
  structure_name: string | null;
  poll_interval_minutes: number;
  time_to_empty_threshold_hours: number;
  sales_lookback_days: number;
  min_sample_size: number;
  hauling_isk_per_m3: number;
  sales_tax_pct: number;
  broker_fee_pct: number;
  discord_webhook: string | null;
  is_active: number;
}

export interface AuthToken {
  id: number;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  character_id: number | null;
  character_name: string | null;
  scopes: string | null;
}

export interface ItemMeta {
  type_id: number;
  name: string;
  group_id: number | null;
  group_name: string | null;
  category_id: number | null;
  category_name: string | null;
  packaged_volume: number | null;
  meta_updated_at: string | null;
}

export interface Poll {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  order_count: number | null;
  item_count: number | null;
  error_message: string | null;
}

export interface Snapshot {
  id: number;
  poll_id: number;
  type_id: number;
  quantity: number;
  min_sell_price: number | null;
  polled_at: string;
}

export interface JitaPrice {
  type_id: number;
  sell_price: number | null;
  buy_price: number | null;
  last_updated: string;
}

export const dbHelper = {
  getSettings(): Settings {
    return db.prepare('SELECT * FROM settings WHERE id = 1').get() as Settings;
  },

  updateSettings(partial: Partial<Omit<Settings, 'id'>>): void {
    const current = dbHelper.getSettings();
    const merged = { ...current, ...partial };
    db.prepare(`
      UPDATE settings SET structure_id = ?, structure_name = ?, poll_interval_minutes = ?, time_to_empty_threshold_hours = ?,
        sales_lookback_days = ?, min_sample_size = ?, hauling_isk_per_m3 = ?, sales_tax_pct = ?, broker_fee_pct = ?,
        discord_webhook = ?, is_active = ?
      WHERE id = 1
    `).run(
      merged.structure_id, merged.structure_name, merged.poll_interval_minutes, merged.time_to_empty_threshold_hours,
      merged.sales_lookback_days, merged.min_sample_size, merged.hauling_isk_per_m3, merged.sales_tax_pct, merged.broker_fee_pct,
      merged.discord_webhook, merged.is_active
    );
  },

  getAuthToken(): AuthToken {
    return db.prepare('SELECT * FROM auth_token WHERE id = 1').get() as AuthToken;
  },

  setAuthToken(token: Partial<Omit<AuthToken, 'id'>>): void {
    const current = dbHelper.getAuthToken();
    const merged = { ...current, ...token };
    db.prepare(`
      UPDATE auth_token SET access_token = ?, refresh_token = ?, expires_at = ?, character_id = ?, character_name = ?, scopes = ?
      WHERE id = 1
    `).run(merged.access_token, merged.refresh_token, merged.expires_at, merged.character_id, merged.character_name, merged.scopes);
  },

  clearAuthToken(): void {
    db.prepare(`UPDATE auth_token SET access_token = NULL, refresh_token = NULL, expires_at = NULL,
      character_id = NULL, character_name = NULL, scopes = NULL WHERE id = 1`).run();
  },

  getItemMeta(typeId: number): ItemMeta | undefined {
    return db.prepare('SELECT * FROM items WHERE type_id = ?').get(typeId) as ItemMeta | undefined;
  },

  upsertItemMeta(meta: ItemMeta): void {
    db.prepare(`
      INSERT INTO items (type_id, name, group_id, group_name, category_id, category_name, packaged_volume, meta_updated_at)
      VALUES (@type_id, @name, @group_id, @group_name, @category_id, @category_name, @packaged_volume, @meta_updated_at)
      ON CONFLICT(type_id) DO UPDATE SET name = excluded.name, group_id = excluded.group_id, group_name = excluded.group_name,
        category_id = excluded.category_id, category_name = excluded.category_name, packaged_volume = excluded.packaged_volume,
        meta_updated_at = excluded.meta_updated_at
    `).run(meta);
  },

  getAllItemMeta(): ItemMeta[] {
    return db.prepare('SELECT * FROM items').all() as ItemMeta[];
  },

  isBaseline(typeId: number): boolean {
    return !!db.prepare('SELECT type_id FROM baseline_items WHERE type_id = ?').get(typeId);
  },

  addBaselineItem(typeId: number, firstSeenAt: string): void {
    db.prepare('INSERT OR IGNORE INTO baseline_items (type_id, first_seen_at) VALUES (?, ?)').run(typeId, firstSeenAt);
  },

  getBaselineItems(): { type_id: number; first_seen_at: string }[] {
    return db.prepare('SELECT * FROM baseline_items').all() as { type_id: number; first_seen_at: string }[];
  },

  getBaselineCount(): number {
    const row = db.prepare('SELECT COUNT(*) as c FROM baseline_items').get() as { c: number };
    return row.c;
  },

  createPoll(startedAt: string): number {
    const result = db.prepare(`INSERT INTO polls (started_at, status) VALUES (?, 'running')`).run(startedAt);
    return result.lastInsertRowid as number;
  },

  finishPoll(pollId: number, finishedAt: string, status: string, orderCount: number, itemCount: number, errorMessage: string | null): void {
    db.prepare(`UPDATE polls SET finished_at = ?, status = ?, order_count = ?, item_count = ?, error_message = ? WHERE id = ?`)
      .run(finishedAt, status, orderCount, itemCount, errorMessage, pollId);
  },

  getLatestPoll(): Poll | undefined {
    return db.prepare('SELECT * FROM polls ORDER BY id DESC LIMIT 1').get() as Poll | undefined;
  },

  getRecentPolls(limit: number): Poll[] {
    return db.prepare('SELECT * FROM polls ORDER BY id DESC LIMIT ?').all(limit) as Poll[];
  },

  insertSnapshot(pollId: number, typeId: number, quantity: number, minSellPrice: number | null, polledAt: string): void {
    db.prepare('INSERT INTO snapshots (poll_id, type_id, quantity, min_sell_price, polled_at) VALUES (?, ?, ?, ?, ?)')
      .run(pollId, typeId, quantity, minSellPrice, polledAt);
  },

  getLatestSnapshot(typeId: number): Snapshot | undefined {
    return db.prepare('SELECT * FROM snapshots WHERE type_id = ? ORDER BY polled_at DESC LIMIT 1').get(typeId) as Snapshot | undefined;
  },

  getAllLatestSnapshots(): Snapshot[] {
    // For every type_id, the single most recent snapshot row
    return db.prepare(`
      SELECT s.* FROM snapshots s
      INNER JOIN (SELECT type_id, MAX(polled_at) AS max_time FROM snapshots GROUP BY type_id) latest
        ON s.type_id = latest.type_id AND s.polled_at = latest.max_time
    `).all() as Snapshot[];
  },

  getSnapshotsSince(typeId: number, sinceIso: string): Snapshot[] {
    return db.prepare('SELECT * FROM snapshots WHERE type_id = ? AND polled_at >= ? ORDER BY polled_at ASC')
      .all(typeId, sinceIso) as Snapshot[];
  },

  getSnapshotHistory(typeId: number, limit: number): Snapshot[] {
    return db.prepare('SELECT * FROM snapshots WHERE type_id = ? ORDER BY polled_at DESC LIMIT ?').all(typeId, limit) as Snapshot[];
  },

  getLastPositiveSnapshot(typeId: number): Snapshot | undefined {
    return db.prepare('SELECT * FROM snapshots WHERE type_id = ? AND quantity > 0 ORDER BY polled_at DESC LIMIT 1')
      .get(typeId) as Snapshot | undefined;
  },

  getCachedJitaPrice(typeId: number): JitaPrice | undefined {
    return db.prepare('SELECT * FROM jita_prices WHERE type_id = ?').get(typeId) as JitaPrice | undefined;
  },

  cacheJitaPrice(price: JitaPrice): void {
    db.prepare(`
      INSERT INTO jita_prices (type_id, sell_price, buy_price, last_updated)
      VALUES (@type_id, @sell_price, @buy_price, @last_updated)
      ON CONFLICT(type_id) DO UPDATE SET sell_price = excluded.sell_price, buy_price = excluded.buy_price,
        last_updated = excluded.last_updated
    `).run(price);
  },
};

process.on('exit', () => db.close());
process.on('SIGINT', () => { db.close(); process.exit(0); });
process.on('SIGTERM', () => { db.close(); process.exit(0); });
