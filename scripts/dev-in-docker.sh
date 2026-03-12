#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

compose() {
  docker compose "$@"
}

usage() {
  cat <<'USAGE'
Usage: scripts/dev-in-docker.sh <command>

Commands:
  build        Build the dev container image
  up           Start the dev environment (foreground)
  down         Stop and remove the dev container
  restart      Restart the dev container
  logs         Tail container logs
  shell        Open a shell inside the running container
  sync-codex-home  Copy host CODEX_HOME into running dev container
  clean        Stop container and remove named volumes
USAGE
}

sync_codex_home() {
  local source_codex_home="${T3CODE_HOST_CODEX_HOME:-$HOME/.codex}"
  local container_id

  if [[ ! -d "$source_codex_home" ]]; then
    echo "Source CODEX_HOME does not exist: $source_codex_home" >&2
    return 1
  fi

  container_id="$(compose ps -q t3-dev)"
  if [[ -z "$container_id" ]]; then
    echo "t3-dev container is not running. Start it first with: make docker-restart" >&2
    return 1
  fi

  compose exec t3-dev bash -lc "mkdir -p /home/dev/.codex"
  docker cp "$source_codex_home/." "$container_id:/home/dev/.codex/"
  compose exec t3-dev bash -lc "chown -R dev:dev /home/dev/.codex"
  echo "Synced CODEX_HOME from '$source_codex_home' into container."
}

command="${1:-up}"

case "$command" in
  build)
    compose build t3-dev
    ;;
  up)
    compose up t3-dev
    ;;
  down)
    compose down
    ;;
  restart)
    compose down
    compose up -d t3-dev
    if [[ "${T3CODE_SYNC_HOST_CODEX_HOME:-0}" == "1" ]]; then
      sync_codex_home
    fi
    ;;
  logs)
    compose logs -f t3-dev
    ;;
  shell)
    compose exec t3-dev bash
    ;;
  sync-codex-home)
    sync_codex_home
    ;;
  clean)
    compose down -v
    ;;
  *)
    usage
    exit 1
    ;;
esac
