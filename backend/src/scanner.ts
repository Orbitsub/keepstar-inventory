import axios from 'axios';
import { dbHelper, ItemMeta } from './database';
import { getValidAccessToken } from './esiAuth';

const ESI_BASE_URL = 'https://esi.evetech.net/latest';
const USER_AGENT = 'Keepstar-Inventory-Tracker/1.0.0 (chris@gemini-agent.local)';
const JITA_REGION_ID = 10000002; // The Forge
const JITA_STATION_ID = 60003760; // Jita IV - Moon 4 - Caldari Navy Assembly Plant
const JITA_PRICE_CACHE_MS = 6 * 60 * 60 * 1000; // 6 hours

const api = axios.create({
  baseURL: ESI_BASE_URL,
  headers: { 'User-Agent': USER_AGENT },
  timeout: 20000,
});

export const scannerStatus = {
  isRunning: false,
  lastPollTime: null as string | null,
  lastPollStatus: null as string | null,
  lastError: null as string | null,
  ordersSeen: 0,
  itemsTracked: 0,
  baselineCount: 0,
};

function logError(error: any, context: string) {
  const msg = `${new Date().toISOString()} - [${context}]: ${error.message || error}`;
  console.error(msg);
  scannerStatus.lastError = msg;
}

interface StructureOrder {
  order_id: number;
  type_id: number;
  is_buy_order: boolean;
  price: number;
  volume_remain: number;
}

async function fetchAllStructureOrders(structureId: string, accessToken: string): Promise<StructureOrder[]> {
  const orders: StructureOrder[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await api.get(`/markets/structures/${structureId}/`, {
      params: { datasource: 'tranquility', page },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    orders.push(...(response.data as StructureOrder[]));
    totalPages = parseInt(response.headers['x-pages'] || '1', 10);
    page += 1;
  } while (page <= totalPages);

  return orders;
}

// In-memory caches so repeated polls don't re-fetch group/category names for the same items
const groupNameCache = new Map<number, { name: string; category_id: number }>();
const categoryNameCache = new Map<number, string>();

async function resolveItemMetaIfStale(typeId: number): Promise<void> {
  const existing = dbHelper.getItemMeta(typeId);
  if (existing && existing.meta_updated_at) {
    const ageMs = Date.now() - new Date(existing.meta_updated_at).getTime();
    if (ageMs < 30 * 24 * 60 * 60 * 1000) return; // metadata rarely changes - refresh monthly at most
  }

  try {
    const typeResp = await api.get(`/universe/types/${typeId}/`, { params: { datasource: 'tranquility' } });
    const name: string = typeResp.data.name;
    const groupId: number = typeResp.data.group_id;
    const packagedVolume: number = typeResp.data.packaged_volume ?? typeResp.data.volume ?? 0;

    let groupInfo = groupNameCache.get(groupId);
    if (!groupInfo) {
      const groupResp = await api.get(`/universe/groups/${groupId}/`, { params: { datasource: 'tranquility' } });
      groupInfo = { name: groupResp.data.name, category_id: groupResp.data.category_id };
      groupNameCache.set(groupId, groupInfo);
    }

    let categoryName = categoryNameCache.get(groupInfo.category_id);
    if (!categoryName) {
      const categoryResp = await api.get(`/universe/categories/${groupInfo.category_id}/`, { params: { datasource: 'tranquility' } });
      categoryName = categoryResp.data.name;
      categoryNameCache.set(groupInfo.category_id, categoryName!);
    }

    const meta: ItemMeta = {
      type_id: typeId,
      name,
      group_id: groupId,
      group_name: groupInfo.name,
      category_id: groupInfo.category_id,
      category_name: categoryName!,
      packaged_volume: packagedVolume,
      meta_updated_at: new Date().toISOString(),
    };
    dbHelper.upsertItemMeta(meta);
  } catch (error: any) {
    logError(error, `resolveItemMetaIfStale(${typeId})`);
  }
}

export async function getJitaSellPrice(typeId: number): Promise<number | null> {
  const cached = dbHelper.getCachedJitaPrice(typeId);
  if (cached && Date.now() - new Date(cached.last_updated).getTime() < JITA_PRICE_CACHE_MS) {
    return cached.sell_price;
  }

  try {
    const response = await api.get(`/markets/${JITA_REGION_ID}/orders/`, {
      params: { datasource: 'tranquility', order_type: 'sell', type_id: typeId },
    });
    const orders = response.data as { location_id: number; price: number; volume_remain: number }[];
    const jitaOrders = orders.filter(o => o.location_id === JITA_STATION_ID && o.volume_remain > 0);
    const minSell = jitaOrders.length > 0 ? Math.min(...jitaOrders.map(o => o.price)) : null;

    dbHelper.cacheJitaPrice({
      type_id: typeId,
      sell_price: minSell,
      buy_price: cached?.buy_price ?? null,
      last_updated: new Date().toISOString(),
    });
    return minSell;
  } catch (error: any) {
    logError(error, `getJitaSellPrice(${typeId})`);
    return cached?.sell_price ?? null;
  }
}

/**
 * Runs one full poll cycle: fetch every sell order in the structure, update the baseline
 * item set, and record a snapshot (quantity + price) for every baseline item, treating any
 * baseline item absent from this poll's results as quantity 0.
 */
export async function pollMarket(): Promise<void> {
  if (scannerStatus.isRunning) return;

  const settings = dbHelper.getSettings();
  if (!settings.structure_id) {
    scannerStatus.lastPollStatus = 'error';
    scannerStatus.lastError = 'No structure ID configured in Settings.';
    return;
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    scannerStatus.lastPollStatus = 'error';
    scannerStatus.lastError = 'Not authenticated - complete SSO login in Settings.';
    return;
  }

  scannerStatus.isRunning = true;
  const startedAt = new Date().toISOString();
  const pollId = dbHelper.createPoll(startedAt);

  try {
    const orders = await fetchAllStructureOrders(settings.structure_id, accessToken);
    const sellOrders = orders.filter(o => !o.is_buy_order);

    // Aggregate sell orders per type_id: total quantity for sale, and the lowest asking price
    const perItem = new Map<number, { quantity: number; minPrice: number }>();
    for (const order of sellOrders) {
      const existing = perItem.get(order.type_id);
      if (existing) {
        existing.quantity += order.volume_remain;
        existing.minPrice = Math.min(existing.minPrice, order.price);
      } else {
        perItem.set(order.type_id, { quantity: order.volume_remain, minPrice: order.price });
      }
    }

    const finishedAt = new Date().toISOString();
    const isFirstPoll = dbHelper.getBaselineCount() === 0;

    // Establish/extend the baseline with every item observed for sale in this poll
    for (const typeId of perItem.keys()) {
      if (!dbHelper.isBaseline(typeId)) {
        dbHelper.addBaselineItem(typeId, finishedAt);
      }
    }

    // Snapshot every baseline item: its observed quantity/price this poll, or 0 if it's gone
    const baselineItems = dbHelper.getBaselineItems();
    for (const baseline of baselineItems) {
      const observed = perItem.get(baseline.type_id);
      dbHelper.insertSnapshot(pollId, baseline.type_id, observed?.quantity ?? 0, observed?.minPrice ?? null, finishedAt);
      await resolveItemMetaIfStale(baseline.type_id);
      await getJitaSellPrice(baseline.type_id); // no-op if already cached within the last 6 hours
    }

    dbHelper.finishPoll(pollId, finishedAt, 'success', orders.length, baselineItems.length, null);

    scannerStatus.lastPollTime = finishedAt;
    scannerStatus.lastPollStatus = 'success';
    scannerStatus.lastError = null;
    scannerStatus.ordersSeen = orders.length;
    scannerStatus.itemsTracked = baselineItems.length;
    scannerStatus.baselineCount = baselineItems.length;

    if (isFirstPoll) {
      console.log(`Baseline established with ${baselineItems.length} items.`);
    }
  } catch (error: any) {
    const finishedAt = new Date().toISOString();
    logError(error, 'pollMarket');
    dbHelper.finishPoll(pollId, finishedAt, 'error', 0, 0, error.message || String(error));
    scannerStatus.lastPollTime = finishedAt;
    scannerStatus.lastPollStatus = 'error';
  } finally {
    scannerStatus.isRunning = false;
  }
}

let schedulerHandle: NodeJS.Timeout | null = null;

export function startScheduler(): void {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }

  const settings = dbHelper.getSettings();
  if (!settings.is_active) return;

  const intervalMs = Math.max(settings.poll_interval_minutes, 5) * 60 * 1000;
  schedulerHandle = setInterval(() => {
    pollMarket().catch(err => console.error('Scheduled poll failed', err));
  }, intervalMs);
}
