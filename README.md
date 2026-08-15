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

- Ubuntu 22.04 or newer
- Node.js 22 LTS or newer
- npm
- An EVE Online developer application for SSO login
- Access to the target structure's market orders

`better-sqlite3` is a native Node dependency. Install the Ubuntu build prerequisites so npm can compile it if a prebuilt binary is unavailable:

```bash
sudo apt update
sudo apt install -y build-essential python3
```

Node 22 LTS is the recommended runtime for the server. Use a version manager such as `nvm` or your distribution's supported Node repository rather than the old Ubuntu Node package.

## Install

From the repository root:

```bash
npm ci
npm ci --prefix backend
npm ci --prefix frontend
```

The separate `npm ci` commands use the committed lockfiles and are best for a server deployment. `npm run install-all` is also available for a convenient non-reproducible development install.

For a guided Ubuntu setup that installs prerequisites, asks for the EVE SSO values, builds both apps, and starts the production server under PM2:

```bash
bash scripts/setup.sh
```

Run it from a user account with `sudo` access. The script keeps `backend/.env` mode `600`, preserves existing non-placeholder values, and starts the server only after the build succeeds. PM2 keeps the process running and restarts it after crashes.

## Configure EVE SSO

1. Create or open an application at [EVE Developers](https://developers.eveonline.com/applications).
2. Add the callback URL that matches the environment exactly:
   - Development: `http://localhost:3002/api/auth/callback`
   - Production: `https://your-domain.example/api/auth/callback`
3. Ensure the application grants the scope `esi-markets.structure_markets.v1`.
4. Copy the template and fill in the application values:

```bash
cp backend/.env.example backend/.env
chmod 600 backend/.env
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

```bash
npm run dev
```

This starts:

- Backend API: `http://localhost:3002`
- Frontend development server: the Vite URL shown in the terminal, normally `http://localhost:5173`

The frontend proxies `/api` requests to the backend. Open the Vite URL, choose **Login with EVE**, and complete the EVE authorization flow.

To run services separately:

```bash
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

```bash
npm test --prefix backend
```

The tests cover settings persistence, metric calculations, EVE SSO token behavior, Discord webhook validation, scheduler behavior, and poll error state transitions.

Build both applications:

```bash
npm run build
```

## Production Run

Build the frontend and backend, then start the backend under PM2 from the repository root:

```bash
npm run build
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save
```

The production server listens on `HOST` and `PORT` from `backend/.env`, defaulting to `127.0.0.1:3002`. When `frontend/dist` exists, the backend serves the built frontend and API routes from the same origin. Keep the frontend build available beside the backend deployment.

Useful PM2 commands:

```bash
pm2 status
pm2 logs keepstar-inventory
pm2 restart keepstar-inventory
pm2 stop keepstar-inventory
```

To start the app automatically after a server reboot, run the command printed by PM2, then save the process list:

```bash
pm2 startup systemd
pm2 save
```

## Nginx Reverse Proxy

Point Nginx at the local PM2-managed backend. Replace `inventory.example.com` with the public hostname, then create a server block such as `/etc/nginx/sites-available/keepstar-inventory`:

```nginx
server {
  listen 80;
  server_name inventory.example.com;

  location / {
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }
}
```

Enable and verify the site, then reload Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/keepstar-inventory /etc/nginx/sites-enabled/keepstar-inventory
sudo nginx -t
sudo systemctl reload nginx
```

If HTTPS is enabled on this server, use the existing certificate setup or Certbot for this hostname and set `ESI_CALLBACK_URL` to `https://inventory.example.com/api/auth/callback`. The EVE developer application callback URL must match it exactly. Keep the backend port private; Nginx should be the public entry point.

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

## Production Serving Check

After `npm run build`, the compiled backend serves the frontend from `frontend/dist`:

- `GET /` returns the built app with HTTP 200.
- `GET /api/status` returns JSON with HTTP 200.

If `frontend/dist` is unavailable, the backend intentionally runs in API-only mode:

- `GET /api/status` continues to return JSON with HTTP 200.
- Browser routes such as `GET /` return a non-success response because no frontend assets are available.

Keep `frontend/dist` deployed alongside `backend/dist` when serving the complete application.