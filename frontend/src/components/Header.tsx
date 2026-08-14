import { Boxes, TrendingDown, Coins, Settings as SettingsIcon, RefreshCw, LogIn, LogOut, User } from 'lucide-react';
import type { Status } from '../api';
import { formatRelativeTime } from '../format';

export type Tab = 'zero-stock' | 'low-stock' | 'margins' | 'settings';

interface HeaderProps {
  status: Status | null;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onPollNow: () => void;
  polling: boolean;
  onLogout: () => void;
}

const TABS: { id: Tab; label: string; icon: typeof Boxes }[] = [
  { id: 'zero-stock', label: 'Zero Stock', icon: Boxes },
  { id: 'low-stock', label: 'Low Stock', icon: TrendingDown },
  { id: 'margins', label: 'Margins', icon: Coins },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export function Header({ status, activeTab, onTabChange, onPollNow, polling, onLogout }: HeaderProps) {
  const auth = status?.auth;

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
          <div className={`status-pill ${status?.isRunning ? 'status-running' : status?.lastPollStatus === 'error' ? 'status-error' : 'status-ok'}`}>
            <span className="status-dot" />
            {status?.isRunning ? 'Polling…' : `Last poll: ${formatRelativeTime(status?.lastPollTime)}`}
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
          ) : (
            <a className="btn btn-ghost" href="/api/auth/login">
              <LogIn size={16} />
              Login with EVE
            </a>
          )}
        </div>
      </div>

      <nav className="app-tabs">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`app-tab ${activeTab === tab.id ? 'app-tab-active' : ''}`}
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
