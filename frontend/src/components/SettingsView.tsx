import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { api } from '../api';
import type { Settings } from '../api';

interface SettingsViewProps {
  settings: Settings;
  onSaved: (updated: Partial<Settings>) => void;
}

export function SettingsView({ settings, onSaved }: SettingsViewProps) {
  const [form, setForm] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => setForm(settings), [settings]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    setValidationError(null);
  }

  function validate(): string | null {
    if (form.structure_id && !/^\d+$/.test(form.structure_id.trim())) return 'Structure ID must contain only numbers.';
    if (!Number.isInteger(form.poll_interval_minutes) || form.poll_interval_minutes < 5) return 'Poll interval must be at least 5 minutes.';
    if (!Number.isFinite(form.time_to_empty_threshold_hours) || form.time_to_empty_threshold_hours < 1) return 'Low-stock threshold must be at least 1 hour.';
    if (!Number.isInteger(form.sales_lookback_days) || form.sales_lookback_days < 1) return 'Sales lookback must be at least 1 day.';
    if (!Number.isInteger(form.min_sample_size) || form.min_sample_size < 1) return 'Minimum sample size must be at least 1.';
    if (form.discord_webhook) {
      try {
        const url = new URL(form.discord_webhook);
        if (url.protocol !== 'https:' || !['discord.com', 'discordapp.com'].includes(url.hostname)) throw new Error();
      } catch {
        return 'Discord webhook must be an HTTPS discord.com URL, or left empty.';
      }
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validationMessage = validate();
    if (validationMessage) {
      setValidationError(validationMessage);
      setError(null);
      setSavedMessage(null);
      return;
    }
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      await api.updateSettings({
        structure_id: form.structure_id,
        structure_name: form.structure_name,
        poll_interval_minutes: form.poll_interval_minutes,
        time_to_empty_threshold_hours: form.time_to_empty_threshold_hours,
        sales_lookback_days: form.sales_lookback_days,
        min_sample_size: form.min_sample_size,
        hauling_isk_per_m3: form.hauling_isk_per_m3,
        sales_tax_pct: form.sales_tax_pct,
        broker_fee_pct: form.broker_fee_pct,
        discord_webhook: form.discord_webhook,
        is_active: form.is_active,
      });
      onSaved(form);
      setSavedMessage('Settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="settings-form glass" onSubmit={handleSubmit}>
      <div className="settings-grid">
        <label className="field">
          <span>Structure ID</span>
          <input
            type="text"
            value={form.structure_id}
            onChange={e => update('structure_id', e.target.value)}
            placeholder="e.g. 1051567430261"
          />
        </label>

        <label className="field">
          <span>Structure Name</span>
          <input
            type="text"
            value={form.structure_name ?? ''}
            onChange={e => update('structure_name', e.target.value)}
            placeholder="Optional label"
          />
        </label>

        <label className="field">
          <span>Poll Interval (minutes)</span>
          <input
            type="number"
            min={5}
            value={form.poll_interval_minutes}
            onChange={e => update('poll_interval_minutes', parseInt(e.target.value, 10) || 0)}
          />
        </label>

        <label className="field">
          <span>Low-stock Threshold (hours)</span>
          <input
            type="number"
            min={1}
            value={form.time_to_empty_threshold_hours}
            onChange={e => update('time_to_empty_threshold_hours', parseFloat(e.target.value) || 0)}
          />
        </label>

        <label className="field">
          <span>Sales Lookback (days)</span>
          <input
            type="number"
            min={1}
            value={form.sales_lookback_days}
            onChange={e => update('sales_lookback_days', parseInt(e.target.value, 10) || 0)}
          />
        </label>

        <label className="field">
          <span>Min Sample Size</span>
          <input
            type="number"
            min={1}
            value={form.min_sample_size}
            onChange={e => update('min_sample_size', parseInt(e.target.value, 10) || 0)}
          />
        </label>

        <label className="field">
          <span>Hauling Cost (ISK/m³)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.hauling_isk_per_m3}
            onChange={e => update('hauling_isk_per_m3', parseFloat(e.target.value) || 0)}
          />
        </label>

        <label className="field">
          <span>Sales Tax (%)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.sales_tax_pct}
            onChange={e => update('sales_tax_pct', parseFloat(e.target.value) || 0)}
          />
        </label>

        <label className="field">
          <span>Broker Fee (%)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.broker_fee_pct}
            onChange={e => update('broker_fee_pct', parseFloat(e.target.value) || 0)}
          />
        </label>

        <label className="field">
          <span>Discord Webhook</span>
          <input
            type="url"
            value={form.discord_webhook ?? ''}
            onChange={e => update('discord_webhook', e.target.value)}
            placeholder="Optional"
          />
        </label>

        <label className="field field-checkbox">
          <input
            type="checkbox"
            checked={!!form.is_active}
            onChange={e => update('is_active', e.target.checked ? 1 : 0)}
          />
          <span>Scheduler Active</span>
        </label>
      </div>

      <div className="settings-footer">
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
          Save Settings
        </button>
        {savedMessage && <span className="cell-positive">{savedMessage}</span>}
        {validationError && <span className="cell-negative" role="alert">{validationError}</span>}
        {error && <span className="cell-negative">{error}</span>}
      </div>
    </form>
  );
}
