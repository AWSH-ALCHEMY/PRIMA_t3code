# Codex Custom Model Profile Discovery Log

## Experiment Question

Why does Codex in T3 ignore `model_catalog_json`/custom models even when a non-default profile is set in settings?

## Initial Hypotheses

1. T3 was not forwarding profile settings to provider startup.
2. T3 forwarded profile, but Codex app-server ignored `-p` in this execution path.
3. Model catalog file had stale/invalid entries.
4. UI model picker cache was stale.

## What We Tested

### A) Verify T3 provider options transport

- Confirmed `providerOptions.codex` reaches server reactor and provider startup.
- Confirmed session restart logic triggers on provider option changes.

Result:

- Transport path works.

### B) Reproduce outside T3 (direct Codex app-server)

- Started Codex app-server directly and drove JSON-RPC requests.
- Checked `account/read`, `model/list`, `thread/start`, and `turn/start`.

Result:

- Reproduced account/model gating independent of T3 when launch mode was wrong.
- Established issue was not solely a web transport/UI projection problem.

### C) Inspect Codex OSS source

- Reviewed CLI and app-server dispatch flow.
- Confirmed practical behavior: `-p/--profile` was not taking effect for app-server path used here.
- Identified config override form as effective: `-c profile="..."`.

Result:

- Root cause identified: profile flag path mismatch for app-server runtime behavior.

### D) Validate alternate launch form

- Ran:
  - `/Applications/Codex.app/Contents/Resources/codex -c 'profile="<your-profile>"' app-server`

Result:

- Profile-applied behavior observed:
  - custom provider model available
  - non-default model turns succeed

### E) Patch T3 and re-test end-to-end

- Updated T3 spawn args in `codexAppServerManager.ts` to `-c profile="<profile>" app-server`.
- Re-ran full flow through WebSocket orchestration with custom model `glm-5`.

Result:

- Success. Events and output showed model/profile being used and completing correctly.

## Evidence Highlights

- `thread.turn-start-requested` included:
  - `model: "glm-5"`
  - `providerOptions.codex.profile: "<your-profile>"`
- Assistant output returned expected token:
  - `MODEL_OK`
- UI model picker showed profile-backed custom models.

## Final Conclusion

T3-side profile support was largely correct, but Codex app-server needed profile selection via config override syntax. Switching launch args to `-c profile="..."` resolved custom model/catalog usage.

## Remaining Gaps / Follow-ups

1. Add automated regression test in server layer for spawn arg shape when profile is set.
2. Consider surfacing active model provider/model in UI diagnostics panel for faster debugging.

## Recreate This Discovery Quickly

1. Configure settings with binary/home/profile.
2. Run a known custom model turn (`glm-5`) and assert successful completion.
3. If it fails, compare launch args in server logs:
   - Must include `-c 'profile="<name>"' app-server`.
