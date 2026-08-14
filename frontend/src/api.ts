const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

export interface AuthStatus {
  ssoConfigured: boolean;
  authenticated: boolean;
  characterId: number | null;
  characterName: string | null;
  scopes: string | null;
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

export interface Status {
  isRunning: boolean;
  lastPollTime: string | null;
  lastPollStatus: string | null;
  lastError: string | null;
  ordersSeen: number;
  itemsTracked: number;
  baselineCount: number;
  latestPoll: Poll | null;
  isActive: boolean;
  pollIntervalMinutes: number;
  structureConfigured: boolean;
  auth: AuthStatus;
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

export const api = {
  getStatus: () => request<Status>('/status'),
  triggerPoll: () => request<{ message: string }>('/polls', { method: 'POST' }),
  getRecentPolls: (limit = 20) => request<Poll[]>(`/polls?limit=${limit}`),
  getZeroStock: () => request<ZeroStockEntry[]>('/zero-stock'),
  getLowStock: () => request<LowStockEntry[]>('/low-stock'),
  getMargins: () => request<MarginEntry[]>('/margins'),
  getCategories: () => request<string[]>('/categories'),
  getSettings: () => request<Settings>('/settings'),
  updateSettings: (partial: Partial<Omit<Settings, 'id'>>) =>
    request<{ message: string }>('/settings', { method: 'PUT', body: JSON.stringify(partial) }),
  logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
};
