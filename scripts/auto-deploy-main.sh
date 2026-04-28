#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_REPO=${SOURCE_REPO:-/opt/brev-diary}
DEPLOY_DIR=${DEPLOY_DIR:-/opt/brev-diary-main}
BRANCH=${BRANCH:-main}
PROJECT_NAME=${PROJECT_NAME:-brev-diary}
WEB_URL=${WEB_URL:-http://127.0.0.1:5173/}
API_URL=${API_URL:-http://127.0.0.1:5173/api/me}
LOCK_FILE=${LOCK_FILE:-/tmp/brev-diary-auto-deploy.lock}
FORCE_DEPLOY=${FORCE_DEPLOY:-0}
WEB_RETRIES=${WEB_RETRIES:-20}
API_RETRIES=${API_RETRIES:-20}

log() {
  printf '[%s] %s\n' "$(date '+%F %T%z')" "$*"
}

fail() {
  log "$*"
  exit 1
}

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "another deploy process is already running"
  exit 0
fi

[[ -d "$SOURCE_REPO/.git" ]] || fail "source repo missing: $SOURCE_REPO"

git -C "$SOURCE_REPO" fetch origin "$BRANCH" >/dev/null
remote_sha=$(git -C "$SOURCE_REPO" rev-parse "origin/$BRANCH")

if [[ ! -e "$DEPLOY_DIR/.git" ]]; then
  log "creating deploy worktree at $DEPLOY_DIR"
  git -C "$SOURCE_REPO" worktree add -B "$BRANCH" "$DEPLOY_DIR" "origin/$BRANCH" >/dev/null
fi

if [[ -f "$SOURCE_REPO/.env" ]]; then
  ln -sfn "$SOURCE_REPO/.env" "$DEPLOY_DIR/.env"
fi

current_sha=""
if git -C "$DEPLOY_DIR" rev-parse HEAD >/dev/null 2>&1; then
  current_sha=$(git -C "$DEPLOY_DIR" rev-parse HEAD)
fi

if [[ "$FORCE_DEPLOY" != "1" && -n "$current_sha" && "$current_sha" == "$remote_sha" ]]; then
  log "already deployed $BRANCH at $remote_sha"
  exit 0
fi

log "deploying $BRANCH: ${current_sha:-none} -> $remote_sha"

git -C "$DEPLOY_DIR" fetch origin "$BRANCH" >/dev/null
git -C "$DEPLOY_DIR" checkout "$BRANCH" >/dev/null
git -C "$DEPLOY_DIR" reset --hard "origin/$BRANCH" >/dev/null
git -C "$DEPLOY_DIR" clean -fdx -e .env >/dev/null

compose_args=(
  --project-name "$PROJECT_NAME"
  -f "$DEPLOY_DIR/docker-compose.yml"
)

if [[ -f "$DEPLOY_DIR/docker-compose.override.yml" ]]; then
  compose_args+=( -f "$DEPLOY_DIR/docker-compose.override.yml" )
fi

log "validating compose config"
docker compose "${compose_args[@]}" config >/dev/null

log "rebuilding and restarting containers"
docker compose "${compose_args[@]}" up --build -d --remove-orphans >/dev/null

web_status=""
for attempt in $(seq 1 "$WEB_RETRIES"); do
  web_status=$(curl -sS -o /tmp/brev-diary-web.out -w '%{http_code}' "$WEB_URL" || true)
  if [[ "$web_status" == "200" ]]; then
    break
  fi
  sleep 2
done
[[ "$web_status" == "200" ]] || fail "frontend returned HTTP ${web_status:-curl-error}"

api_status=""
for attempt in $(seq 1 "$API_RETRIES"); do
  api_status=$(curl -sS -o /tmp/brev-diary-api.out -w '%{http_code}' "$API_URL" || true)
  case "$api_status" in
    200|401)
      break
      ;;
  esac
  sleep 2
done
case "$api_status" in
  200|401)
    ;;
  *)
    fail "backend proxy returned HTTP ${api_status:-curl-error}"
    ;;
esac

printf '%s\n' "$remote_sha" > "$DEPLOY_DIR/.last_deployed_sha"
log "deploy complete at $remote_sha"
