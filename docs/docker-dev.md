# Docker Dev Workflow

This repo can run fully in Docker for local development of server + web + Codex integration.

## What persists

The compose setup uses named volumes so container rebuilds do not wipe your sessions:

- `t3code_dev_codex_home` -> `/home/dev/.codex` (`CODEX_HOME`, auth, config, model catalogs)
- `t3code_dev_state` -> `/home/dev/.t3-dev` (dev-only T3 state, threads, local DB)

This intentionally isolates Docker dev state from any non-dev/local prod-like T3 state paths.

## Quick start

```bash
make docker-build
make docker-up
```

Then open `http://localhost:5733`.
By default Docker dev binds to `http://localhost:15733` to avoid conflicts with local/prod-like runs.
The server now also advertises `15733` as the dev web URL, so opening via server routes does not bounce you to `5733`.

If you need different host ports:

```bash
T3CODE_DOCKER_WEB_PORT=25733 T3CODE_DOCKER_SERVER_PORT=23773 make docker-up
```

## Using a custom Codex proxy gateway (no `codex login`)

Docker dev can bootstrap a proxy-based Codex config automatically.
Set these env vars before `make docker-up`:

```bash
export T3CODE_CODEX_PROXY_BASE_URL="https://your-codex-proxy.example.com/v1"
export T3CODE_CODEX_PROXY_API_KEY="your-proxy-key"
export T3CODE_CODEX_PROFILE="proxy"
make docker-restart
```

Optional vars:

- `T3CODE_CODEX_PROXY_PROVIDER_ID` (default: `proxy_gateway`)
- `T3CODE_CODEX_PROXY_PROFILE` (default: `proxy`)
- `T3CODE_CODEX_PROXY_WIRE_API` (default: `responses`)
- `T3CODE_CODEX_PROXY_MODEL` (default model for that profile)
- `T3CODE_CODEX_PROXY_MODEL_CATALOG_JSON` (for custom model catalogs)
- `T3CODE_CODEX_PROXY_API_KEY_ENV` (env var name read by Codex config, default: `T3CODE_CODEX_PROXY_API_KEY`)

When `T3CODE_CODEX_PROXY_BASE_URL` is set, container startup writes `/home/dev/.codex/config.toml`
for the proxy provider and profile and the server can use that profile via `T3CODE_CODEX_PROFILE`.

### OpenAI-hostname proxy mode

If your proxy expects traffic addressed to `api.openai.com`, Docker dev now maps that hostname
from inside `t3-dev` to the Docker host via `extra_hosts`.

Use:

```bash
export T3CODE_CODEX_PROXY_BASE_URL="http://api.openai.com/v1"
export T3CODE_CODEX_PROFILE="proxy"
export T3CODE_CODEX_PROXY_API_KEY_ENV="OPENAI_API_KEY"
export OPENAI_API_KEY="your-proxy-key"
make docker-restart
```

This keeps the hostname as `api.openai.com` while routing it to your local proxy stack.

If your proxy uses a private/local CA, Docker dev now imports `/proxy-certs/ca.crt` into the
container trust store at startup. By default this is mounted from:

- `../fucking_api_proxy/certs` (relative to this repo)

Override if needed:

```bash
T3CODE_PROXY_CERTS_DIR=/absolute/path/to/proxy/certs make docker-restart
```

## Useful commands

```bash
make docker-logs
make docker-shell
make docker-sync-codex-home
make docker-down
make docker-clean
```

If custom models/catalogs from your host Codex setup are missing in Docker dev, sync host `CODEX_HOME`:

```bash
make docker-sync-codex-home
```

Optional source override (defaults to `~/.codex`):

```bash
T3CODE_HOST_CODEX_HOME=/path/to/codex-home make docker-sync-codex-home
```

Optional auto-sync after restart:

```bash
T3CODE_SYNC_HOST_CODEX_HOME=1 make docker-restart
```

## Quality checks in container

```bash
make docker-dev-check
```

## Notes

- The dev image installs `bun` and `@openai/codex`.
- Source code is bind-mounted from your host (`./:/workspace`) for live edits.
- File watching uses polling (`CHOKIDAR_USEPOLLING=1`) for Docker Desktop compatibility.
- Detailed issue recovery steps: [docker-dev-troubleshooting.md](./docker-dev-troubleshooting.md)
