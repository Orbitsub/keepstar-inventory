import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { Status, Settings, ZeroStockEntry, LowStockEntry, MarginEntry } from './api';
import { Header } from './components/Header';
import type { Tab } from './components/Header';
import { ZeroStockView } from './components/ZeroStockView';
import { LowStockView } from './components/LowStockView';
import { MarginsView } from './components/MarginsView';
import { SettingsView } from './components/SettingsView';
import { LoadingState, ErrorState } from './components/StateViews';

const STATUS_POLL_MS = 15000;

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('zero-stock');
  const [status, setStatus] = useState<Status | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  const [zeroStock, setZeroStock] = useState<ZeroStockEntry[] | null>(null);
  const [lowStock, setLowStock] = useState<LowStockEntry[] | null>(null);
  const [margins, setMargins] = useState<MarginEntry[] | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.getStatus();
      setStatus(s);
    } catch {
      // status polling failures are non-fatal; keep showing the last known status
    }
  }, []);

  const loadTabData = useCallback(async (tab: Tab) => {
    setError(null);
    try {
      if (tab === 'zero-stock') setZeroStock(await api.getZeroStock());
      else if (tab === 'low-stock') setLowStock(await api.getLowStock());
      else if (tab === 'margins') setMargins(await api.getMargins());
      else if (tab === 'settings') setSettings(await api.getSettings());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await Promise.all([refreshStatus(), loadTabData(activeTab)]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    const interval = setInterval(refreshStatus, STATUS_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  async function handlePollNow() {
    setPolling(true);
    try {
      await api.triggerPoll();
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start poll.');
    } finally {
      setPolling(false);
    }
  }

  async function handleLogout() {
    await api.logout();
    await refreshStatus();
  }

  function handleSettingsSaved(updated: Partial<Settings>) {
    setSettings(prev => (prev ? { ...prev, ...updated } : prev));
    refreshStatus();
  }

  return (
    <div className="app-shell">
      <Header
        status={status}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onPollNow={handlePollNow}
        polling={polling}
        onLogout={handleLogout}
      />

      <main className="app-main">
        {loading && <LoadingState label="Loading data…" />}
        {!loading && error && <ErrorState message={error} />}
        {!loading && !error && activeTab === 'zero-stock' && zeroStock && <ZeroStockView items={zeroStock} />}
        {!loading && !error && activeTab === 'low-stock' && lowStock && <LowStockView items={lowStock} />}
        {!loading && !error && activeTab === 'margins' && margins && <MarginsView items={margins} />}
        {!loading && !error && activeTab === 'settings' && settings && (
          <SettingsView settings={settings} onSaved={handleSettingsSaved} />
        )}
      </main>
    </div>
  );
}
