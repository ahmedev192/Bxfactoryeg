#!/usr/bin/env bash
set -Eeuo pipefail

# Production deployment script for the Production Ops platform.
# Defaults target the current VPS, but every setting can be overridden by env vars.

DEPLOY_HOST="${DEPLOY_HOST:-root@162.0.239.86}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/brandxcelerator_deploy_ed25519}"
APP_DIR="${APP_DIR:-/var/www/production-ops}"
APP_USER="${APP_USER:-productionops}"
PM2_APP="${PM2_APP:-production-ops-api}"
DOMAIN="${DOMAIN:-brandxcelerator.com}"
WWW_DOMAIN="${WWW_DOMAIN:-www.brandxcelerator.com}"
HEALTH_PATH="${HEALTH_PATH:-/api/v1/health}"

LOCAL_INSTALL="${LOCAL_INSTALL:-1}"
LOCAL_TESTS="${LOCAL_TESTS:-0}"
REMOTE_INSTALL="${REMOTE_INSTALL:-1}"
RUN_SEED="${RUN_SEED:-1}"
AUTH_SMOKE="${AUTH_SMOKE:-1}"
KEEP_ARTIFACT="${KEEP_ARTIFACT:-0}"
SSH_RETRIES="${SSH_RETRIES:-3}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)"
ARTIFACT_DIR="$REPO_ROOT/.deploy"
ARTIFACT="$ARTIFACT_DIR/production-ops-$RELEASE_ID.tar.gz"
REMOTE_ARTIFACT="/tmp/production-ops-$RELEASE_ID.tar.gz"

log() {
  printf '\n[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"
}

die() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

ssh_cmd() {
  local attempt=1
  local status=0
  while true; do
    ssh -i "$SSH_KEY" \
      -o BatchMode=yes \
      -o IdentitiesOnly=yes \
      -o StrictHostKeyChecking=accept-new \
      -o ConnectTimeout=20 \
      "$DEPLOY_HOST" "$@" && return 0
    status=$?
    if (( attempt >= SSH_RETRIES )); then
      return "$status"
    fi
    log "SSH attempt $attempt failed; retrying"
    sleep "$((attempt * 5))"
    attempt=$((attempt + 1))
  done
}

scp_file() {
  local attempt=1
  local status=0
  while true; do
    scp -i "$SSH_KEY" \
      -o BatchMode=yes \
      -o IdentitiesOnly=yes \
      -o StrictHostKeyChecking=accept-new \
      "$1" "$DEPLOY_HOST:$2" && return 0
    status=$?
    if (( attempt >= SSH_RETRIES )); then
      return "$status"
    fi
    log "SCP attempt $attempt failed; retrying"
    sleep "$((attempt * 5))"
    attempt=$((attempt + 1))
  done
}

ssh_stream() {
  ssh -i "$SSH_KEY" \
    -o BatchMode=yes \
    -o IdentitiesOnly=yes \
    -o StrictHostKeyChecking=accept-new \
    -o ConnectTimeout=20 \
    "$DEPLOY_HOST" "$@"
}

curl_expect_2xx() {
  local url="$1"
  local code
  code="$(curl -fsS -o /dev/null -w '%{http_code}' --connect-timeout 15 --max-time 45 "$url")" || {
    die "Request failed: $url"
  }
  case "$code" in
    2*) log "OK $code $url" ;;
    *) die "Expected 2xx from $url, got $code" ;;
  esac
}

log "Checking local prerequisites"
require_cmd npm
require_cmd tar
require_cmd ssh
require_cmd scp
require_cmd curl

[[ -f "$REPO_ROOT/package.json" ]] || die "Run this script from inside the repository"
[[ -f "$SSH_KEY" ]] || die "SSH key not found: $SSH_KEY"

mkdir -p "$ARTIFACT_DIR"

if [[ "$LOCAL_INSTALL" == "1" ]]; then
  log "Installing local dependencies with npm ci"
  (cd "$REPO_ROOT" && npm ci)
else
  log "Skipping local dependency install (LOCAL_INSTALL=$LOCAL_INSTALL)"
fi

if [[ "$LOCAL_TESTS" == "1" ]]; then
  log "Running local backend tests"
  (cd "$REPO_ROOT" && npm test)
else
  log "Skipping local tests (set LOCAL_TESTS=1 to enable)"
fi

log "Building shared, backend, and frontend locally"
(cd "$REPO_ROOT" && npm run build)

log "Creating deployment artifact"
rm -f "$ARTIFACT"
tar -czf "$ARTIFACT" \
  --exclude='.git' \
  --exclude='.deploy' \
  --exclude='node_modules' \
  --exclude='*/node_modules' \
  --exclude='backend/.env' \
  --exclude='backend/uploads' \
  --exclude='frontend/.env' \
  --exclude='*.log' \
  -C "$REPO_ROOT" .

log "Checking remote prerequisites"
ssh_cmd "set -euo pipefail
command -v node >/dev/null
command -v npm >/dev/null
command -v tar >/dev/null
command -v pm2 >/dev/null
id '$APP_USER' >/dev/null
test -d '$APP_DIR'
test -f '$APP_DIR/backend/.env'
test -d '$APP_DIR/backend/uploads'
"

log "Uploading artifact to $DEPLOY_HOST"
scp_file "$ARTIFACT" "$REMOTE_ARTIFACT"

log "Deploying on remote server"
ssh_stream "APP_DIR='$APP_DIR' APP_USER='$APP_USER' PM2_APP='$PM2_APP' REMOTE_ARTIFACT='$REMOTE_ARTIFACT' REMOTE_INSTALL='$REMOTE_INSTALL' RUN_SEED='$RUN_SEED' bash -s" <<'REMOTE'
set -Eeuo pipefail

log() {
  printf '\n[remote %s] %s\n' "$(date -u +%H:%M:%S)" "$*"
}

run_as_app() {
  runuser -u "$APP_USER" -- bash -lc "$1"
}

log "Preserving production env and uploads"
test -f "$APP_DIR/backend/.env"
mkdir -p "$APP_DIR/backend/uploads/photos" "$APP_DIR/backend/uploads/pdfs"

log "Removing old compiled frontend/backend output"
rm -rf "$APP_DIR/backend/dist" "$APP_DIR/frontend/dist" "$APP_DIR/shared/dist" "$APP_DIR/shared/dist-cjs"

log "Extracting artifact"
tar -xzf "$REMOTE_ARTIFACT" -C "$APP_DIR" --no-same-owner

log "Fixing ownership and permissions"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 600 "$APP_DIR/backend/.env"
chmod 750 "$APP_DIR/backend"
chmod 751 "$APP_DIR" "$APP_DIR/frontend"
chmod -R a+rX "$APP_DIR/frontend/dist"
mkdir -p "$APP_DIR/backend/uploads/photos" "$APP_DIR/backend/uploads/pdfs"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/backend/uploads"
chmod -R 750 "$APP_DIR/backend/uploads"

if [[ "$REMOTE_INSTALL" == "1" ]]; then
  log "Installing remote dependencies"
  run_as_app "cd '$APP_DIR' && npm install"
else
  log "Skipping remote npm install (REMOTE_INSTALL=$REMOTE_INSTALL)"
fi

log "Generating Prisma client"
run_as_app "cd '$APP_DIR' && npm run db:generate -w backend"

log "Applying Prisma migrations"
run_as_app "cd '$APP_DIR' && npm run db:migrate:deploy -w backend"

if [[ "$RUN_SEED" == "1" ]]; then
  log "Running seed"
  run_as_app "cd '$APP_DIR' && npm run db:seed -w backend"
else
  log "Skipping seed (RUN_SEED=$RUN_SEED)"
fi

log "Starting or restarting PM2 app"
if run_as_app "pm2 describe '$PM2_APP' >/dev/null 2>&1"; then
  run_as_app "cd '$APP_DIR' && pm2 restart '$PM2_APP' --update-env"
else
  run_as_app "cd '$APP_DIR' && pm2 start ecosystem.config.cjs"
fi
run_as_app "pm2 save"

log "Validating and reloading nginx"
nginx -t
systemctl reload nginx

log "Waiting for local API health"
healthy=0
for attempt in {1..30}; do
  if curl -fsS "http://127.0.0.1:4000/api/v1/health" >/dev/null; then
    healthy=1
    break
  fi
  sleep 2
done
if [[ "$healthy" != "1" ]]; then
  run_as_app "pm2 status"
  exit 1
fi

rm -f "$REMOTE_ARTIFACT"
log "Remote deploy complete"
REMOTE

if [[ "$AUTH_SMOKE" == "1" ]]; then
  log "Running authenticated smoke test on remote API"
  ssh_stream "APP_DIR='$APP_DIR' bash -s" <<'REMOTE_AUTH'
set -Eeuo pipefail
python3 - <<'PY'
import json
import os
import urllib.request
from pathlib import Path

env_path = Path(os.environ['APP_DIR']) / 'backend' / '.env'
values = {}
for line in env_path.read_text().splitlines():
    if '=' not in line or line.lstrip().startswith('#'):
        continue
    key, value = line.split('=', 1)
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    values[key] = value

email = values.get('SEED_ADMIN_EMAIL')
password = values.get('SEED_ADMIN_PASSWORD')
if not email or not password:
    raise SystemExit('Missing seed admin credentials for auth smoke')

base = 'http://127.0.0.1:4000/api/v1'
payload = json.dumps({'email': email, 'password': password}).encode()
login_req = urllib.request.Request(
    base + '/auth/login',
    data=payload,
    headers={'Content-Type': 'application/json'},
    method='POST',
)
with urllib.request.urlopen(login_req, timeout=20) as response:
    login = json.loads(response.read().decode())

token = login.get('token')
if not token:
    raise SystemExit('Login did not return a token')

for path in ('/auth/me', '/dashboard'):
    req = urllib.request.Request(base + path, headers={'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(req, timeout=20) as response:
        if response.status != 200:
            raise SystemExit(f'{path} returned {response.status}')

print('authenticated smoke: login-ok me-ok dashboard-ok')
PY
REMOTE_AUTH
else
  log "Skipping authenticated smoke (AUTH_SMOKE=$AUTH_SMOKE)"
fi

log "Running public smoke tests"
curl_expect_2xx "https://$DOMAIN/"
curl_expect_2xx "https://$DOMAIN$HEALTH_PATH"
if [[ -n "$WWW_DOMAIN" ]]; then
  curl_expect_2xx "https://$WWW_DOMAIN/"
  curl_expect_2xx "https://$WWW_DOMAIN$HEALTH_PATH"
fi

if [[ "$KEEP_ARTIFACT" == "1" ]]; then
  log "Keeping artifact at $ARTIFACT"
else
  rm -f "$ARTIFACT"
fi

log "Deploy finished successfully"
