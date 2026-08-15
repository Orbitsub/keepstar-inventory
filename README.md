# Keepstar Inventory Tracker

```text
      .-=========-.
      \\'-=======-'//
      _|   .=.   |_
     ((|  {{1}}  |))     EVE market stock, without the spreadsheet fog.
      \\|   /|\\   |/
       \__ '`' __/
         _`) (`_
       _/_______\_
      /___________\
```

Keepstar Inventory Tracker watches sell orders in an EVE Online Upwell structure and turns them into a practical dashboard:

- zero-stock items and the last known stock
- low-stock items with estimated time to empty
- margin estimates using Jita sell prices, hauling costs, and fees
- scheduled polling with a manual **Poll Now** action
- optional Discord alerts for new stock risks and poll failures

## Requirements

- Node.js 22 or newer
- npm
- An EVE Online developer application for SSO login
- Access to the target structure's market orders

`better-sqlite3` is compiled for modern Node releases. Node 22+ avoids the unsupported runtime/toolchain combination seen with older project setups.

## Install

From the repository root:

```powershell
npm install
npm run install-all
```

The `install-all` script installs the root, backend, and frontend dependencies. The separate commands are useful when diagnosing an install failure.

## Configure EVE SSO

1. Create or open an application at [EVE Developers](https://developers.eveonline.com/applications).
2. Add the callback URL that matches the environment exactly:
   - Development: `http://localhost:3002/api/auth/callback`
   - Production: `https://your-domain.example/api/auth/callback`
3. Ensure the application grants the scope `esi-markets.structure_markets.v1`.
4. Copy the template and fill in the application values:

```powershell
Copy-Item backend/.env.example backend/.env
```

Set these values in `backend/.env`:

```dotenv
PORT=3002
ESI_CLIENT_ID=your_eve_application_client_id
ESI_CLIENT_SECRET=your_eve_application_client_secret
ESI_CALLBACK_URL=http://localhost:3002/api/auth/callback
```

Never commit `backend/.env`. It is ignored by git. Keep the client secret private and use your deployment platform's secret store in production.

## Run In Development

Start both services from the repository root:

```powershell
npm run dev
```

This starts:

- Backend API: `http://localhost:3002`
- Frontend development server: the Vite URL shown in the terminal, normally `http://localhost:5173`

The frontend proxies `/api` requests to the backend. Open the Vite URL, choose **Login with EVE**, and complete the EVE authorization flow.

To run services separately:

```powershell
npm run dev --prefix backend
npm run dev --prefix frontend
```

## Configure A Structure

The structure ID is the numeric Upwell structure ID used by ESI, not a station ID or name. The app seeds a sample/default value on its first database initialization; replace it in **Settings** with the structure you actually operate.

The EVE character completing SSO must be able to access market orders for that structure. A successful login alone does not guarantee that ESI will authorize the selected structure.

Polling is active by default and has a minimum interval of five minutes. The first successful poll establishes the baseline item set. Items absent from later polls are recorded with quantity zero, which powers the zero-stock view.

## Optional Discord Alerts

Discord alerts are optional. To enable them, paste an HTTPS Discord webhook URL into **Settings > Discord Webhook**. The tracker sends alerts for newly observed zero-stock or low-stock risks and for poll failures. Repeated unchanged risks are deduplicated, and failure alerts have a cooldown.

Leave the field empty to disable notifications. Invalid or non-Discord URLs are ignored, and a Discord outage does not turn a successful inventory poll into a failed poll.

## Test And Build

Run the backend test suite:

```powershell
npm test --prefix backend
```

The tests cover settings persistence, metric calculations, EVE SSO token behavior, Discord webhook validation, scheduler behavior, and poll error state transitions.

Build both applications:

```powershell
npm run build
```

## Production Run

Build the frontend and backend, then start the backend from the repository root:

```powershell
npm run build
npm start
```

The production server listens on `PORT` from `backend/.env`, or port `3002` by default. When `frontend/dist` exists, the backend serves the built frontend and API routes from the same origin. Keep the frontend build available beside the backend deployment.

For a reverse-proxy deployment:

- forward the public HTTPS application URL to the backend port
- register the public URL plus `/api/auth/callback` in the EVE application
- set `ESI_CALLBACK_URL` to that exact public callback URL
- persist `backend/data/keepstar.db` across restarts
- provide `backend/.env` values through deployment secrets

The SQLite database is created automatically at `backend/data/keepstar.db`. The database contains settings, the SSO token, poll history, snapshots, item metadata, and cached Jita prices. Back it up before upgrades or migrations.

## Useful API Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/status` | Scanner, latest poll, structure, and auth status |
| `POST /api/polls` | Start a manual poll |
| `GET /api/polls` | Recent poll history |
| `GET /api/zero-stock` | Zero-stock inventory view |
| `GET /api/low-stock` | Low-stock inventory view |
| `GET /api/margins` | Margin analysis |
| `GET /api/settings` | Current tracker settings |
| `PUT /api/settings` | Update tracker settings |
| `GET /api/auth/login` | Begin EVE SSO login |
| `GET /api/auth/status` | Current authentication status |

## Troubleshooting

**Login says SSO is not configured**

Check that `backend/.env` exists, contains all three `ESI_*` values, and that the callback URL is an exact match in the EVE developer application.

**Polls report not authenticated**

Complete EVE login again. The refresh token is stored in the local SQLite database, so deleting or replacing that database requires a new login.

**Polls cannot see the structure**

Verify the numeric structure ID and that the logged-in character has access. Also confirm the EVE application includes `esi-markets.structure_markets.v1`.

**Frontend shows an API error**

Check that the backend is running on port 3002 during development, or that the reverse proxy forwards the configured production `PORT`.

## Project Layout

```text
backend/    Express API, SQLite persistence, ESI polling, scheduler, notifications
frontend/   React + Vite dashboard
backend/.env.example
README.md
```