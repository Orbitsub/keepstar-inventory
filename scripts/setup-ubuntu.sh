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
printf 'Open the URL served by PORT in backend/.env after startup.\n'
exec npm start