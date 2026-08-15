import axios from 'axios';
import { getLowStockView, getZeroStockView } from './metrics';

const DISCORD_TIMEOUT_MS = 10000;
const FAILURE_NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000;

let previousAlertKeys = new Set<string>();
let lastFailureNotificationAt = 0;

function isDiscordWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'discord.com' || url.hostname === 'discordapp.com');
  } catch {
    return false;
  }
}

export async function sendDiscordNotification(webhookUrl: string | null, content: string): Promise<boolean> {
  if (!webhookUrl || !isDiscordWebhookUrl(webhookUrl)) return false;

  try {
    await axios.post(webhookUrl, { content: content.slice(0, 2000) }, { timeout: DISCORD_TIMEOUT_MS });
    return true;
  } catch (error: any) {
    console.error(`Discord notification failed: ${error.message || error}`);
    return false;
  }
}

function formatSuccessMessage(): { content: string; alertKeys: Set<string> } {
  const zeroStock = getZeroStockView();
  const lowStock = getLowStockView();
  const alertKeys = new Set([
    ...zeroStock.map(item => `zero:${item.type_id}`),
    ...lowStock.map(item => `low:${item.type_id}:${item.severity}`),
  ]);
  const newZeroStock = zeroStock.filter(item => !previousAlertKeys.has(`zero:${item.type_id}`));
  const newLowStock = lowStock.filter(item => !previousAlertKeys.has(`low:${item.type_id}:${item.severity}`));
  const lines = ['**Keepstar inventory alerts**'];

  for (const item of newZeroStock.slice(0, 20)) {
    lines.push(`:warning: **Out of stock:** ${item.name} (type ${item.type_id})`);
  }
  for (const item of newLowStock.slice(0, 20)) {
    lines.push(`:chart_with_downwards_trend: **${item.severity === 'critical' ? 'Critical' : 'Low stock'}:** ${item.name} (type ${item.type_id}), ${item.time_to_empty_hours.toFixed(1)}h remaining`);
  }

  return { content: lines.join('\n'), alertKeys };
}

export async function notifyPollSuccess(webhookUrl: string | null): Promise<void> {
  if (!webhookUrl) return;

  const { content, alertKeys } = formatSuccessMessage();
  const newAlerts = alertKeys.size > 0 && content !== '**Keepstar inventory alerts**';
  previousAlertKeys = alertKeys;
  if (newAlerts) await sendDiscordNotification(webhookUrl, content);
}

export async function notifyPollFailure(webhookUrl: string | null, errorMessage: string): Promise<void> {
  if (!webhookUrl || Date.now() - lastFailureNotificationAt < FAILURE_NOTIFICATION_COOLDOWN_MS) return;

  lastFailureNotificationAt = Date.now();
  await sendDiscordNotification(webhookUrl, `:x: **Keepstar inventory poll failed**\n${errorMessage}`);
}

export function resetDiscordNotificationState(): void {
  previousAlertKeys = new Set();
  lastFailureNotificationAt = 0;
}