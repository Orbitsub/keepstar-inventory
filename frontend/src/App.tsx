import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { Status, Settings, ZeroStockEntry, LowStockEntry, MarginEntry, ArbitrageEntry } from './api';
import { Header } from './components/Header';
import type { Tab } from './components/Header';
import { ZeroStockView } from './components/ZeroStockView';
import { LowStockView } from './components/LowStockView';
import { MarginsView } from './components/MarginsView';
import { ArbitrageView } from './components/ArbitrageView';
import { CargoFlowView } from './components/CargoFlowView';
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
  const [arbitrage, setArbitrage] = useState<ArbitrageEntry[] | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.getStatus();
      setStatus(s);
      setStatusError(null);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Backend status is unavailable.');
    }
  }, []);

  const loadTabData = useCallback(async (tab: Tab) => {
    setError(null);
    try {
      if (tab === 'zero-stock') setZeroStock(await api.getZeroStock());
      else if (tab === 'low-stock') setLowStock(await api.getLowStock());
      else if (tab === 'margins') setMargins(await api.getMargins());
      else if (tab === 'arbitrage') setArbitrage(await api.getArbitrage());
      else if (tab === 'cargo-flow') setArbitrage(await api.getArbitrage());
      else if (tab === 'settings') setSettings(await api.getSettings());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.');
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('loginSuccess') === '1') {
      setLoginMessage('EVE login completed successfully.');
      window.history.replaceState({}, document.title, window.location.pathname);
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
    try {
      await api.logout();
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log out.');
    }
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
        statusError={statusError}
      />

      <main className="app-main" aria-live="polite">
        {loginMessage && <div className="app-notice app-notice-success" role="status">{loginMessage}</div>}
        {statusError && <div className="app-notice app-notice-error" role="alert">{statusError}</div>}
        {loading && <LoadingState label="Loading data…" />}
        {!loading && error && <ErrorState message={error} />}
        {!loading && !error && activeTab === 'zero-stock' && zeroStock && <ZeroStockView items={zeroStock} />}
        {!loading && !error && activeTab === 'low-stock' && lowStock && <LowStockView items={lowStock} />}
        {!loading && !error && activeTab === 'margins' && margins && <MarginsView items={margins} />}
        {!loading && !error && activeTab === 'arbitrage' && arbitrage && <ArbitrageView items={arbitrage} />}
        {!loading && !error && activeTab === 'cargo-flow' && arbitrage && <CargoFlowView items={arbitrage} />}
        {!loading && !error && activeTab === 'settings' && settings && (
          <SettingsView settings={settings} onSaved={handleSettingsSaved} />
        )}
      </main>
    </div>
  );
}
