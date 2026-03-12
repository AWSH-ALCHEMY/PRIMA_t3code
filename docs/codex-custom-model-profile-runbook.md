# Codex Custom Model Profile Runbook

## Goal

Enable T3 Code to launch Codex app-server with a user-selected Codex profile so custom model providers and custom model catalogs are usable from the UI.

## Environment Used

- OS: macOS
- T3 server/web dev mode
- Codex binary: `/Applications/Codex.app/Contents/Resources/codex`
- `CODEX_HOME`: `/Users/code/.codex`
- Profile: `crofai`

## Problem Summary

Using profile launch args with app-server looked correct in UI, but Codex app-server still behaved as default OpenAI/ChatGPT mode.

Observed symptoms:

- Custom models were missing or blocked in active turns.
- `account/read` could report ChatGPT/free for the active app-server session.
- Turn errors like unsupported model under ChatGPT account.

## Root Cause

`-p/--profile` is not applied on Codex `app-server` subcommand path (in the Codex OSS CLI flow we validated).

T3 previously launched:

- `codex -p <profile> app-server`

In app-server mode, this did not reliably apply profile-scoped model provider/model catalog behavior.

## Code Changes

### 1) Add profile option plumbing (already implemented in this branch)

- Contracts and orchestration payloads include `providerOptions.codex.profile`.
- Settings UI includes `Codex profile` input.
- Chat dispatch includes provider options from settings.
- Provider reactor restarts session when provider options change.

Relevant files:

- `packages/contracts/src/provider.ts`
- `packages/contracts/src/orchestration.ts`
- `apps/web/src/appSettings.ts`
- `apps/web/src/routes/_chat.settings.tsx`
- `apps/web/src/components/ChatView.tsx`
- `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts`
- `apps/server/src/orchestration/Layers/ProviderCommandReactor.test.ts`

### 2) Critical runtime fix (required)

Changed Codex app-server spawn args to use config override syntax instead of `-p`:

- From: `codex -p <profile> app-server`
- To: `codex -c 'profile="<profile>"' app-server`

File:

- `apps/server/src/codexAppServerManager.ts`

## Verification Performed

### Direct Codex app-server proof

Command style tested:

- `/Applications/Codex.app/Contents/Resources/codex -c 'profile="crofai"' app-server`

Validated:

- `thread/start` resolved provider/model from profile (`proxy_gateway`, custom model).
- Non-default model turn succeeded.

### T3 end-to-end proof (WebSocket orchestration path)

Dispatched `thread.turn.start` with:

- `model: "glm-5"`
- `providerOptions.codex.profile: "crofai"`
- binary/home overrides above

Validated from T3 events:

- `thread.turn-start-requested` carried `model: "glm-5"` and profile `crofai`.
- Assistant response returned `MODEL_OK`.

### UI proof

From model picker in chat UI, custom profile-backed models appeared (examples observed):

- `kimi-k2.5`
- `glm-5`
- `qwen3-coder`
- `deepseek-v3.2`
- `minimax-m2.1`

## Reproduction Steps

1. Start T3 dev:
   - `bun run dev`
2. Open Settings in UI and set:
   - Codex binary path: `/Applications/Codex.app/Contents/Resources/codex`
   - `CODEX_HOME`: `/Users/code/.codex`
   - Codex profile: `crofai`
3. Open a thread.
4. In model picker, choose a custom model (for example `glm-5` or `kimi-k2.5`).
5. Send prompt: `Reply with exactly MODEL_OK`.
6. Confirm assistant output is `MODEL_OK`.

## Operational Notes

- If browser shows `ERR_CONNECTION_REFUSED` on `localhost:5733`, dev process is not running.
- If profile change does not apply, start a new turn (reactor restarts provider session when provider options differ).
- Settings helper text may still mention `-p`; runtime now uses `-c profile=...`.

## Rollback

If needed, revert spawn arg change in:

- `apps/server/src/codexAppServerManager.ts`

Specifically revert from `-c profile="..."` back to previous behavior.
