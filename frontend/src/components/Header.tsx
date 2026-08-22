import { Boxes, TrendingDown, Coins, ArrowLeftRight, Truck, Settings as SettingsIcon, RefreshCw, LogIn, LogOut, User } from 'lucide-react';
import type { Status } from '../api';
import { formatRelativeTime } from '../format';

export type Tab = 'zero-stock' | 'low-stock' | 'margins' | 'arbitrage' | 'cargo-flow' | 'settings';

interface HeaderProps {
  status: Status | null;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onPollNow: () => void;
  polling: boolean;
  onLogout: () => void;
  statusError: string | null;
}

const TABS: { id: Tab; label: string; icon: typeof Boxes }[] = [
  { id: 'zero-stock', label: 'Zero Stock', icon: Boxes },
  { id: 'low-stock', label: 'Low Stock', icon: TrendingDown },
  { id: 'margins', label: 'Margins', icon: Coins },
  { id: 'arbitrage', label: 'Arbitrage', icon: ArrowLeftRight },
  { id: 'cargo-flow', label: 'Cargo Flow', icon: Truck },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export function Header({ status, activeTab, onTabChange, onPollNow, polling, onLogout, statusError }: HeaderProps) {
  const auth = status?.auth;
  const pollFailed = status?.lastPollStatus === 'error';

  return (
    <header className="app-header glass">
      <div className="app-header-top">
        <div className="app-title">
          <h1>Keepstar Inventory Tracker</h1>
          <span className="app-subtitle">
            {status?.structureConfigured ? `${status.baselineCount} baseline items tracked` : 'No structure configured'}
          </span>
        </div>

        <div className="app-header-actions">
          <div className={`status-pill ${statusError ? 'status-error' : status?.isRunning ? 'status-running' : pollFailed ? 'status-error' : 'status-ok'}`}>
            <span className="status-dot" />
            {statusError ? 'Backend unavailable' : status?.isRunning ? 'Polling…' : `Last poll: ${status?.lastPollTime ? formatRelativeTime(status.lastPollTime) : 'Not run yet'}`}
          </div>

          <button className="btn btn-primary" onClick={onPollNow} disabled={polling || status?.isRunning}>
            <RefreshCw size={16} className={polling || status?.isRunning ? 'spin' : ''} />
            Poll Now
          </button>

          {auth?.authenticated ? (
            <button className="btn btn-ghost" onClick={onLogout} title={auth.characterName ?? undefined}>
              <User size={16} />
              {auth.characterName}
              <LogOut size={14} />
            </button>
          ) : statusError || auth?.ssoConfigured === false ? (
            <span className="auth-unavailable" title="Configure ESI_CLIENT_ID, ESI_CLIENT_SECRET, and ESI_CALLBACK_URL on the backend.">EVE login unavailable</span>
          ) : (
            <a className="btn btn-ghost" href="/api/auth/login">
              <LogIn size={16} />
              Login with EVE
            </a>
          )}
        </div>
      </div>

      {pollFailed && status?.lastError && (
        <div className="poll-error" role="alert">{status.lastError}</div>
      )}

      <nav className="app-tabs">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`app-tab ${activeTab === tab.id ? 'app-tab-active' : ''}`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => onTabChange(tab.id)}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
