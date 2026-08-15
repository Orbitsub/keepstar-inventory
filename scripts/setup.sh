#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
ENV_FILE="$BACKEND_DIR/.env"

log() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

version_at_least_22() {
  local major
  major="${1%%.*}"
  [[ "$major" =~ ^[0-9]+$ ]] && (( major >= 22 ))
}

append_env_value() {
  local key="$1"
  local value="$2"
  printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
}

log "Checking Ubuntu build prerequisites"
if command -v apt-get >/dev/null 2>&1; then
  if ! command -v g++ >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
    command -v sudo >/dev/null 2>&1 || fail "sudo is required to install build-essential and python3."
    sudo apt-get update
    sudo apt-get install -y build-essential python3
  fi
else
  printf 'Warning: apt-get was not found; install build-essential and python3 manually.\n'
fi

command -v node >/dev/null 2>&1 || fail "Node.js 22+ is required. Install Node.js 22 LTS and rerun this script."
command -v npm >/dev/null 2>&1 || fail "npm is required. Install npm and rerun this script."
node_version="$(node --version | sed 's/^v//')"
version_at_least_22 "$node_version" || fail "Node.js 22+ is required; found v$node_version."

if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing PM2"
  if ! npm install --global pm2; then
    command -v sudo >/dev/null 2>&1 || fail "PM2 is required. Install it with npm install --global pm2 and rerun this script."
    sudo npm install --global pm2
  fi
fi

log "Installing locked dependencies"
cd "$ROOT_DIR"
npm ci
npm ci --prefix "$BACKEND_DIR"
npm ci --prefix "$ROOT_DIR/frontend"

log "Configuring backend environment"
if [[ ! -f "$ENV_FILE" ]]; then
  install -m 600 "$BACKEND_DIR/.env.example" "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

if ! grep -q '^PORT=' "$ENV_FILE"; then
  append_env_value PORT "3002"
fi

if ! grep -q '^ESI_CLIENT_ID=' "$ENV_FILE" || grep -q '^ESI_CLIENT_ID=your_' "$ENV_FILE"; then
  read -r -p "EVE ESI client ID: " client_id
  [[ -n "$client_id" ]] || fail "ESI client ID cannot be empty."
  sed -i '/^ESI_CLIENT_ID=/d' "$ENV_FILE"
  append_env_value ESI_CLIENT_ID "$client_id"
fi

if ! grep -q '^ESI_CLIENT_SECRET=' "$ENV_FILE" || grep -q '^ESI_CLIENT_SECRET=your_' "$ENV_FILE"; then
  read -r -s -p "EVE ESI client secret: " client_secret
  printf '\n'
  [[ -n "$client_secret" ]] || fail "ESI client secret cannot be empty."
  sed -i '/^ESI_CLIENT_SECRET=/d' "$ENV_FILE"
  append_env_value ESI_CLIENT_SECRET "$client_secret"
fi

if ! grep -q '^ESI_CALLBACK_URL=' "$ENV_FILE" || grep -q '^ESI_CALLBACK_URL=http://localhost' "$ENV_FILE"; then
  read -r -p "EVE callback URL [http://localhost:3002/api/auth/callback]: " callback_url
  callback_url="${callback_url:-http://localhost:3002/api/auth/callback}"
  sed -i '/^ESI_CALLBACK_URL=/d' "$ENV_FILE"
  append_env_value ESI_CALLBACK_URL "$callback_url"
fi

log "Building frontend and backend"
npm run build

log "Starting Keepstar Inventory Tracker"
server_port="$(sed -n 's/^PORT=//p' "$ENV_FILE" | tail -n 1)"
server_port="${server_port:-3002}"

pm2 startOrRestart "$ROOT_DIR/ecosystem.config.cjs" --update-env
pm2 save

for _ in {1..30}; do
  server_pid="$(pm2 pid keepstar-inventory 2>/dev/null | tail -n 1)"
  if [[ -z "$server_pid" || "$server_pid" == "0" ]] || ! kill -0 "$server_pid" 2>/dev/null; then
    printf 'Error: server exited during startup. Check pm2 logs keepstar-inventory for details.\n' >&2
    exit 1
  fi

  if (exec 3<>"/dev/tcp/127.0.0.1/$server_port") 2>/dev/null; then
    exec 3>&-
    printf 'Keepstar Inventory Tracker is running on port %s (PID %s).\n' "$server_port" "$server_pid"
    printf 'Manage it with: pm2 status, pm2 logs keepstar-inventory, pm2 restart keepstar-inventory\n'
    exit 0
  fi
  sleep 1
done

pm2 delete keepstar-inventory >/dev/null 2>&1 || true
printf 'Error: server did not start listening on port %s. Check pm2 logs keepstar-inventory for details.\n' "$server_port" >&2
exit 1