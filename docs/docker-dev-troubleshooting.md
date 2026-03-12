# Docker Dev Troubleshooting Guide

This guide captures the exact issues encountered while getting Docker-based T3 dev stable, plus the fixes that resolved them.

## Scope

Applies to local Docker dev using:

- `make docker-build`
- `make docker-up` / `make docker-restart`

with host ports mapped to:

- Web: `15733 -> 5733`
- Server: `13773 -> 3773`

## Quick Health Checks

Run these first:

```bash
docker compose ps
curl -sSI http://localhost:13773 | head -n 6
curl -sSI http://localhost:15733 | head -n 6
curl -sSI http://localhost:15733/src/main.tsx | head -n 6
```

Expected:

- `13773` returns `302` with `Location: http://localhost:15733/`
- `15733` returns `200 OK`
- `/src/main.tsx` returns `200 OK` (if `500`, frontend runtime is broken)

## Issues We Hit and Fixes

### 1) Bun install failed in image build (`unzip is required`)

Symptom:

- Docker build fails on Bun install step with `error: unzip is required to install bun`

Fix:

- Add `unzip` to apt packages in `Dockerfile`.

---

### 2) User creation failed (`UID 1000 is not unique`)

Symptom:

- Docker build fails creating `dev` user with fixed UID 1000.

Fix:

- Create `dev` user without forcing UID (`useradd -m -s /bin/bash dev`).

---

### 3) `bun` not found at runtime

Symptom:

- Container starts then logs `bash: bun: command not found`.

Root cause:

- Symlink pointed to `/root/.bun/...`, inaccessible to runtime user.

Fix:

- Copy Bun binary to `/usr/local/bin/bun` in image and mark executable.

---

### 4) Permission errors writing state/cache

Symptoms:

- `bun is unable to write files to tempdir: AccessDenied`
- `EACCES: permission denied, mkdir '/home/dev/.t3-dev/state'`

Root cause:

- Volume ownership mismatch (`root` owns mounted paths).

Fix:

- Start container as root, `chown` mounted state dirs, then drop to `dev` user.
- Avoid problematic Bun cache volume mount.

---

### 5) Docker dev conflicted with local/prod ports

Symptom:

- Docker grabbed `5733/3773`, breaking local/prod-like process.

Fix:

- Use non-conflicting default host ports in `docker-compose.yml`:
  - `15733:5733`
  - `13773:3773`
- Make ports overrideable via env:
  - `T3CODE_DOCKER_WEB_PORT`
  - `T3CODE_DOCKER_SERVER_PORT`

---

### 6) Redirect went to wrong port (`5733`)

Symptom:

- Opening server URL redirected browser to `http://localhost:5733/`.

Fix:

- Set `VITE_DEV_SERVER_URL` in compose to host-mapped web port:

```bash
VITE_DEV_SERVER_URL=http://localhost:${T3CODE_DOCKER_WEB_PORT:-15733}
```

Validation:

```bash
curl -sSI http://localhost:13773 | rg "^HTTP/|^Location:"
```

Should show `302` to `http://localhost:15733/` (or your overridden web port).

---

### 7) Frontend appeared to load but UI was dead (`TsconfigCache is not a constructor`)

Symptoms:

- Browser title/HTML loads, but no real app UI interaction.
- `agent-browser snapshot -i` returns no useful elements.
- `curl /src/main.tsx` returns `500`.
- Logs show:

`Internal server error: TsconfigCache is not a constructor`

Root cause:

- Vite beta resolution drift in container (Linux arm64) caused incompatible runtime behavior.

Fix:

- Pin Vite override to exact version in root `package.json`:

```json
"overrides": {
  "rolldown": "1.0.0-rc.3",
  "vite": "8.0.0-beta.12"
}
```

Then reinstall and restart:

```bash
bun install
make docker-restart
```

Validation:

```bash
curl -sSI http://localhost:15733/src/main.tsx | head -n 6
```

Must return `200 OK`.

## Canonical Recovery Procedure

If Docker dev is broken, run this sequence:

```bash
make docker-down
bun install
make docker-build
make docker-restart
```

Then verify:

```bash
docker compose ps
curl -sSI http://localhost:13773 | rg "^HTTP/|^Location:"
curl -sSI http://localhost:15733/src/main.tsx | head -n 6
```

## Browser-Level Verification (Recommended)

Use `agent-browser` to confirm real UI is live:

```bash
agent-browser --session-name t3verify open http://localhost:13773
agent-browser --session-name t3verify wait --load networkidle
agent-browser --session-name t3verify get url
agent-browser --session-name t3verify get title
agent-browser --session-name t3verify snapshot -i
agent-browser --session-name t3verify close
```

Expected:

- URL resolves to `http://localhost:15733/`
- title is `T3 Code (Dev)`
- snapshot includes interactive elements (for example `Add project`, `Settings`)

## Port Overrides

To run with different host ports:

```bash
T3CODE_DOCKER_WEB_PORT=16733 T3CODE_DOCKER_SERVER_PORT=14773 make docker-restart
```

Check mapping:

```bash
docker compose ps
```

## Notes

- `make docker-clean` removes named volumes and resets Docker dev state.
- Docker dev state is intentionally isolated from non-dev T3 state (`/home/dev/.t3-dev`).
