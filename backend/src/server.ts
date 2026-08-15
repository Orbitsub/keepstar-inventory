import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { dbHelper, Settings } from './database';
import { pollMarket, startScheduler, stopScheduler, scannerStatus } from './scanner';
import { getZeroStockView, getLowStockView, getMarginView, getCategories } from './metrics';
import { buildAuthorizeUrl, isValidState, exchangeCodeForToken, getAuthStatus, logout, isSsoConfigured } from './esiAuth';

const PORT = parseInt(process.env.PORT || '3002', 10);
const FRONTEND_DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');

const app = express();
app.use(cors());
app.use(express.json());

// --- Status & poll control ---

app.get('/api/status', (req, res) => {
  const settings = dbHelper.getSettings();
  res.json({
    ...scannerStatus,
    baselineCount: dbHelper.getBaselineCount(),
    latestPoll: dbHelper.getLatestPoll() || null,
    isActive: !!settings.is_active,
    pollIntervalMinutes: settings.poll_interval_minutes,
    structureConfigured: !!settings.structure_id,
    auth: getAuthStatus(),
  });
});

app.post('/api/polls', async (req, res) => {
  if (scannerStatus.isRunning) {
    return res.status(409).json({ message: 'Poll already in progress' });
  }
  pollMarket().catch(err => console.error('Manual poll failed', err));
  res.json({ message: 'Poll started' });
});

app.get('/api/polls', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
  res.json(dbHelper.getRecentPolls(limit));
});

// --- Core views ---

app.get('/api/zero-stock', (req, res) => {
  res.json(getZeroStockView());
});

app.get('/api/low-stock', (req, res) => {
  res.json(getLowStockView());
});

app.get('/api/margins', (req, res) => {
  res.json(getMarginView());
});

app.get('/api/categories', (req, res) => {
  res.json(getCategories());
});

app.get('/api/history/:typeId', (req, res) => {
  const typeId = parseInt(req.params.typeId, 10);
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  res.json(dbHelper.getSnapshotHistory(typeId, limit).reverse());
});

// --- Settings ---

app.get('/api/settings', (req, res) => {
  res.json(dbHelper.getSettings());
});

app.put('/api/settings', (req, res) => {
  const {
    structure_id, structure_name, poll_interval_minutes, time_to_empty_threshold_hours,
    sales_lookback_days, min_sample_size, hauling_isk_per_m3, sales_tax_pct, broker_fee_pct,
    discord_webhook, is_active
  } = req.body;

  const current = dbHelper.getSettings();
  const updateData: Partial<Omit<Settings, 'id'>> = {};

  if (structure_id !== undefined) updateData.structure_id = structure_id;
  if (structure_name !== undefined) updateData.structure_name = structure_name;
  if (poll_interval_minutes !== undefined) updateData.poll_interval_minutes = parseInt(poll_interval_minutes, 10);
  if (time_to_empty_threshold_hours !== undefined) updateData.time_to_empty_threshold_hours = parseFloat(time_to_empty_threshold_hours);
  if (sales_lookback_days !== undefined) updateData.sales_lookback_days = parseInt(sales_lookback_days, 10);
  if (min_sample_size !== undefined) updateData.min_sample_size = parseInt(min_sample_size, 10);
  if (hauling_isk_per_m3 !== undefined) updateData.hauling_isk_per_m3 = parseFloat(hauling_isk_per_m3);
  if (sales_tax_pct !== undefined) updateData.sales_tax_pct = parseFloat(sales_tax_pct);
  if (broker_fee_pct !== undefined) updateData.broker_fee_pct = parseFloat(broker_fee_pct);
  if (discord_webhook !== undefined) updateData.discord_webhook = discord_webhook;
  if (is_active !== undefined) updateData.is_active = is_active ? 1 : 0;

  dbHelper.updateSettings(updateData);

  if (
    (poll_interval_minutes && parseInt(poll_interval_minutes, 10) !== current.poll_interval_minutes) ||
    (is_active !== undefined && (is_active ? 1 : 0) !== current.is_active)
  ) {
    startScheduler();
  }

  res.json({ message: 'Settings updated' });
});

// --- EVE SSO auth ---

app.get('/api/auth/login', (req, res) => {
  if (!isSsoConfigured()) {
    return res.status(500).json({ message: 'ESI_CLIENT_ID/ESI_CLIENT_SECRET/ESI_CALLBACK_URL not configured on the server.' });
  }
  res.redirect(buildAuthorizeUrl());
});

app.get('/api/auth/callback', async (req, res) => {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state || !isValidState(state)) {
    return res.status(400).send('Invalid or expired login attempt. Please try logging in again.');
  }

  try {
    await exchangeCodeForToken(code);
    res.redirect('/?loginSuccess=1');
  } catch (error: any) {
    console.error('SSO callback failed', error.response?.data || error.message);
    res.status(500).send('Login failed. Please try again.');
  }
});

app.get('/api/auth/status', (req, res) => {
  res.json(getAuthStatus());
});

app.post('/api/auth/logout', (req, res) => {
  logout();
  res.json({ message: 'Logged out' });
});

// --- Static frontend ---

if (fs.existsSync(FRONTEND_DIST)) {
  console.log(`Serving frontend static build files from ${FRONTEND_DIST}`);
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
} else {
  console.log(`Production frontend build not found at ${FRONTEND_DIST}. Running in API-only mode.`);
}

app.listen(PORT, () => {
  console.log(`Keepstar Inventory Tracker backend listening on port ${PORT}`);
  startScheduler();
});

process.on('SIGINT', stopScheduler);
process.on('SIGTERM', stopScheduler);
