import { dbHelper, ItemMeta, Snapshot } from './database';

export interface SalesVelocity {
  avgDailySales: number | null;
  sampleCount: number;
  trusted: boolean;
}

/**
 * Estimates average daily sales for an item by summing quantity drops between consecutive
 * snapshots (restocks/quantity increases are ignored, not subtracted) over the lookback window.
 */
export function computeSalesVelocity(typeId: number, lookbackDays: number, minSampleSize: number): SalesVelocity {
  const sinceIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const snapshots = dbHelper.getSnapshotsSince(typeId, sinceIso);

  if (snapshots.length < 2) {
    return { avgDailySales: null, sampleCount: 0, trusted: false };
  }

  let totalSold = 0;
  let sampleCount = 0;
  for (let i = 1; i < snapshots.length; i++) {
    const delta = snapshots[i - 1].quantity - snapshots[i].quantity;
    if (delta > 0) {
      totalSold += delta;
    }
    sampleCount += 1;
  }

  const firstTime = new Date(snapshots[0].polled_at).getTime();
  const lastTime = new Date(snapshots[snapshots.length - 1].polled_at).getTime();
  const elapsedDays = (lastTime - firstTime) / (24 * 60 * 60 * 1000);

  if (elapsedDays <= 0) {
    return { avgDailySales: null, sampleCount, trusted: false };
  }

  const avgDailySales = totalSold / elapsedDays;
  const trusted = sampleCount >= minSampleSize;

  return { avgDailySales, sampleCount, trusted };
}

function emptyMeta(typeId: number): ItemMeta {
  return {
    type_id: typeId,
    name: `Type ID ${typeId}`,
    group_id: null,
    group_name: null,
    category_id: null,
    category_name: 'Uncategorized',
    packaged_volume: null,
    meta_updated_at: null,
  };
}

export interface ZeroStockEntry {
  type_id: number;
  name: string;
  category_name: string;
  last_seen_quantity: number;
  last_seen_price: number | null;
  last_seen_at: string | null;
  days_since_stockout: number;
  avg_daily_sales: number | null;
  sales_trusted: boolean;
}

export function getZeroStockView(): ZeroStockEntry[] {
  const settings = dbHelper.getSettings();
  const baselineItems = dbHelper.getBaselineItems();
  const results: ZeroStockEntry[] = [];

  for (const baseline of baselineItems) {
    const latest = dbHelper.getLatestSnapshot(baseline.type_id);
    if (!latest || latest.quantity !== 0) continue;

    const meta = dbHelper.getItemMeta(baseline.type_id) || emptyMeta(baseline.type_id);
    const lastPositive = dbHelper.getLastPositiveSnapshot(baseline.type_id);
    const velocity = computeSalesVelocity(baseline.type_id, settings.sales_lookback_days, settings.min_sample_size);

    const stockoutSinceMs = lastPositive ? Date.now() - new Date(lastPositive.polled_at).getTime() : Date.now() - new Date(baseline.first_seen_at).getTime();

    results.push({
      type_id: baseline.type_id,
      name: meta.name,
      category_name: meta.category_name || 'Uncategorized',
      last_seen_quantity: lastPositive?.quantity ?? 0,
      last_seen_price: lastPositive?.min_sell_price ?? null,
      last_seen_at: lastPositive?.polled_at ?? null,
      days_since_stockout: Math.max(0, stockoutSinceMs / (24 * 60 * 60 * 1000)),
      avg_daily_sales: velocity.avgDailySales,
      sales_trusted: velocity.trusted,
    });
  }

  results.sort((a, b) => b.days_since_stockout - a.days_since_stockout);
  return results;
}

export interface LowStockEntry {
  type_id: number;
  name: string;
  category_name: string;
  current_quantity: number;
  current_price: number | null;
  avg_daily_sales: number;
  time_to_empty_hours: number;
  estimated_stockout_at: string;
  severity: 'critical' | 'warning' | 'stable';
}

export function getLowStockView(): LowStockEntry[] {
  const settings = dbHelper.getSettings();
  const baselineItems = dbHelper.getBaselineItems();
  const results: LowStockEntry[] = [];

  for (const baseline of baselineItems) {
    const latest = dbHelper.getLatestSnapshot(baseline.type_id);
    if (!latest || latest.quantity <= 0) continue;

    const velocity = computeSalesVelocity(baseline.type_id, settings.sales_lookback_days, settings.min_sample_size);
    if (!velocity.trusted || !velocity.avgDailySales || velocity.avgDailySales <= 0) continue;

    const meta = dbHelper.getItemMeta(baseline.type_id) || emptyMeta(baseline.type_id);
    const timeToEmptyHours = (latest.quantity / velocity.avgDailySales) * 24;

    let severity: LowStockEntry['severity'] = 'stable';
    if (timeToEmptyHours <= 24) severity = 'critical';
    else if (timeToEmptyHours <= settings.time_to_empty_threshold_hours) severity = 'warning';

    if (timeToEmptyHours > settings.time_to_empty_threshold_hours * 2) continue; // not yet worth surfacing

    results.push({
      type_id: baseline.type_id,
      name: meta.name,
      category_name: meta.category_name || 'Uncategorized',
      current_quantity: latest.quantity,
      current_price: latest.min_sell_price,
      avg_daily_sales: velocity.avgDailySales,
      time_to_empty_hours: timeToEmptyHours,
      estimated_stockout_at: new Date(Date.now() + timeToEmptyHours * 60 * 60 * 1000).toISOString(),
      severity,
    });
  }

  results.sort((a, b) => a.time_to_empty_hours - b.time_to_empty_hours);
  return results;
}

export interface MarginEntry {
  type_id: number;
  name: string;
  category_name: string;
  current_quantity: number;
  current_price: number | null;
  source_cost: number | null;
  hauling_cost_per_unit: number | null;
  fees_per_unit: number | null;
  net_profit_per_unit: number | null;
  margin_pct: number | null;
  profit_per_m3: number | null;
  avg_daily_sales: number | null;
  est_daily_profit: number | null;
  time_to_empty_hours: number | null;
}

export function getMarginView(): MarginEntry[] {
  const settings = dbHelper.getSettings();
  const baselineItems = dbHelper.getBaselineItems();
  const results: MarginEntry[] = [];

  for (const baseline of baselineItems) {
    const latest = dbHelper.getLatestSnapshot(baseline.type_id);
    if (!latest) continue;

    const meta = dbHelper.getItemMeta(baseline.type_id) || emptyMeta(baseline.type_id);
    const jita = dbHelper.getCachedJitaPrice(baseline.type_id);
    const velocity = computeSalesVelocity(baseline.type_id, settings.sales_lookback_days, settings.min_sample_size);

    const currentPrice = latest.min_sell_price;
    const sourceCost = jita?.sell_price ?? null;
    const packagedVolume = meta.packaged_volume ?? null;
    const haulingCostPerUnit = packagedVolume !== null ? packagedVolume * settings.hauling_isk_per_m3 : null;

    let feesPerUnit: number | null = null;
    let netProfitPerUnit: number | null = null;
    let marginPct: number | null = null;
    let profitPerM3: number | null = null;
    let estDailyProfit: number | null = null;

    if (currentPrice !== null && sourceCost !== null && haulingCostPerUnit !== null) {
      feesPerUnit = currentPrice * ((settings.sales_tax_pct + settings.broker_fee_pct) / 100);
      netProfitPerUnit = currentPrice - sourceCost - haulingCostPerUnit - feesPerUnit;
      marginPct = currentPrice > 0 ? (netProfitPerUnit / currentPrice) * 100 : null;
      profitPerM3 = packagedVolume && packagedVolume > 0 ? netProfitPerUnit / packagedVolume : null;
      if (velocity.trusted && velocity.avgDailySales) {
        estDailyProfit = netProfitPerUnit * velocity.avgDailySales;
      }
    }

    results.push({
      type_id: baseline.type_id,
      name: meta.name,
      category_name: meta.category_name || 'Uncategorized',
      current_quantity: latest.quantity,
      current_price: currentPrice,
      source_cost: sourceCost,
      hauling_cost_per_unit: haulingCostPerUnit,
      fees_per_unit: feesPerUnit,
      net_profit_per_unit: netProfitPerUnit,
      margin_pct: marginPct,
      profit_per_m3: profitPerM3,
      avg_daily_sales: velocity.trusted ? velocity.avgDailySales : null,
      est_daily_profit: estDailyProfit,
      time_to_empty_hours: velocity.trusted && velocity.avgDailySales ? (latest.quantity / velocity.avgDailySales) * 24 : null,
    });
  }

  results.sort((a, b) => (b.est_daily_profit ?? -Infinity) - (a.est_daily_profit ?? -Infinity));
  return results;
}

export function getCategories(): string[] {
  const items = dbHelper.getAllItemMeta();
  const set = new Set<string>();
  for (const item of items) {
    set.add(item.category_name || 'Uncategorized');
  }
  return Array.from(set).sort();
}

export interface ArbitrageEntry {
  type_id: number;
  name: string;
  category_name: string;
  primary_quantity: number;
  primary_price: number;
  secondary_quantity: number;
  secondary_price: number;
  buy_at: 'primary' | 'secondary';
  sell_at: 'primary' | 'secondary';
  buy_price: number;
  sell_price: number;
  fees_per_unit: number;
  net_profit_per_unit: number;
  margin_pct: number;
  tradable_quantity: number;
  total_potential_profit: number;
  packaged_volume: number | null;
}

/**
 * Compares current sell prices between the primary structure and the alliance's secondary
 * keepstar for every item listed in both, and surfaces buy-low/sell-high opportunities.
 * Hauling cost is assumed to be zero (self-transported); only sales tax + broker fee apply.
 */
export function getArbitrageView(): ArbitrageEntry[] {
  const settings = dbHelper.getSettings();
  if (!settings.secondary_structure_id) return [];

  const secondaryPrices = new Map(dbHelper.getAllSecondaryPrices().map(p => [p.type_id, p]));
  if (secondaryPrices.size === 0) return [];

  const baselineItems = dbHelper.getBaselineItems();
  const results: ArbitrageEntry[] = [];

  for (const baseline of baselineItems) {
    const primary = dbHelper.getLatestSnapshot(baseline.type_id);
    const secondary = secondaryPrices.get(baseline.type_id);
    if (!primary || !secondary) continue;
    if (primary.quantity <= 0 || secondary.quantity <= 0) continue;
    if (primary.min_sell_price === null || secondary.min_sell_price === null) continue;

    const buyAt: 'primary' | 'secondary' = primary.min_sell_price <= secondary.min_sell_price ? 'primary' : 'secondary';
    const sellAt: 'primary' | 'secondary' = buyAt === 'primary' ? 'secondary' : 'primary';
    const buyPrice = buyAt === 'primary' ? primary.min_sell_price : secondary.min_sell_price;
    const sellPrice = sellAt === 'primary' ? primary.min_sell_price : secondary.min_sell_price;
    const buyQuantityAvailable = buyAt === 'primary' ? primary.quantity : secondary.quantity;

    const feesPerUnit = sellPrice * ((settings.sales_tax_pct + settings.broker_fee_pct) / 100);
    const netProfitPerUnit = sellPrice - buyPrice - feesPerUnit;
    if (netProfitPerUnit <= 0) continue;

    const meta = dbHelper.getItemMeta(baseline.type_id) || emptyMeta(baseline.type_id);
    const marginPct = sellPrice > 0 ? (netProfitPerUnit / sellPrice) * 100 : 0;
    const tradableQuantity = buyQuantityAvailable;

    results.push({
      type_id: baseline.type_id,
      name: meta.name,
      category_name: meta.category_name || 'Uncategorized',
      primary_quantity: primary.quantity,
      primary_price: primary.min_sell_price,
      secondary_quantity: secondary.quantity,
      secondary_price: secondary.min_sell_price,
      buy_at: buyAt,
      sell_at: sellAt,
      buy_price: buyPrice,
      sell_price: sellPrice,
      fees_per_unit: feesPerUnit,
      net_profit_per_unit: netProfitPerUnit,
      margin_pct: marginPct,
      tradable_quantity: tradableQuantity,
      total_potential_profit: netProfitPerUnit * tradableQuantity,
      packaged_volume: meta.packaged_volume ?? null,
    });
  }

  results.sort((a, b) => b.total_potential_profit - a.total_potential_profit);
  return results;
}
