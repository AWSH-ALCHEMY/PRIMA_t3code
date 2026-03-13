# Custom `threadKind` Plan: Hidden Dashboard Thread

## Objective

Use a hidden thread with a custom `threadKind` to power a markdown dashboard panel after each main chat completion, while keeping normal chat UX and orchestration stable.

This design intentionally treats dashboard turns like "broken-context" turns:

- One hidden thread persists for debugging.
- Each dashboard turn is logically context-disconnected.
- Prompt input is built only from the current source turn payload.
- Prior hidden-thread history is retained for inspection, not used for prompt construction.

## Why This Approach

- Reuses existing conversation/session infrastructure.
- Avoids separate out-of-band transport and duplicate service plumbing.
- Preserves full auditability/debug via normal thread messages/events.
- Keeps user-facing thread list clean through hidden filtering.

## Scope

- Add support for custom `threadKind` values (starting with `dashboard`).
- Add hidden-thread behavior (`isHidden`) for dashboard threads.
- Add post-completion dashboard generation workflow using hidden thread turns.
- Add dashboard panel read path in web UI.

## Data Model Changes

1. Extend thread model with:

- `threadKind: "normal" | "dashboard"` (future extensible string union)
- `isHidden: boolean`

2. Optional linkage fields:

- `sourceThreadId: ThreadId | null` on dashboard thread, or
- dedicated mapping table `(source_thread_id, dashboard_thread_id)`.

3. Defaults/migrations:

- Existing threads: `threadKind="normal"`, `isHidden=false`.

## Server Behavior

### Thread listing and access

- Exclude `isHidden=true` from default thread list APIs.
- Keep direct ID lookup supported for internal workflows.

### Dashboard generation trigger

- Trigger after visible thread turn completion.
- Resolve or create hidden dashboard thread for that visible thread.
- Build one-turn dashboard input from current source artifacts only:
  - source user message text
  - source assistant message text
  - optional usage/work summary metadata

### Dashboard turn dispatch

- Dispatch a normal `thread.turn.start` to hidden dashboard thread.
- Persist result normally in hidden thread (for debugging).
- Do not mirror hidden thread messages into visible thread transcript.

### Concurrency controls

- One in-flight dashboard generation per source thread.
- If a newer source turn completes, mark previous dashboard run stale.
- Ignore late stale results when updating panel state.

## Prompt Semantics (Important)

Although hidden thread has prior history, prompt assembly for each dashboard turn must be stateless at app layer:

- No previous hidden-thread message content added to request payload.
- Only current source turn payload included.

Note: this is intentional logical statelessness, not a hard provider runtime reset.

## Web UI Behavior

### Hidden thread visibility

- Sidebar/thread switcher excludes hidden threads.
- Hidden threads not shown in normal user navigation.
- Optional internal debug surface can expose hidden thread history.

### Dashboard panel

- Add panel in chat view tied to source thread.
- Display latest successful hidden dashboard assistant output as markdown.
- States: `idle`, `generating`, `ready`, `failed`, `stale`.
- Include metadata: generated time, model, latency.
- Optional "Regenerate" action for current source turn.

## Contracts and Events

Introduce dashboard-specific domain/push events (or derive from hidden thread activity):

- `dashboard.generation.started`
- `dashboard.generation.completed`
- `dashboard.generation.failed`
- `dashboard.generation.stale`

Payload should include at least:

- `sourceThreadId`
- `sourceTurnId`
- `dashboardThreadId`
- `generationId`
- status fields
- markdown (on completion)

## Reliability and Safety

- Non-blocking: dashboard pipeline must not block primary chat completion.
- Timeout dashboard generation (configurable).
- Sanitize markdown before render.
- Cost guardrails: token limits and configurable model.
- Error isolation: dashboard failures must not set main thread error state.

## Implementation Phases

1. **Foundation**

- Add `threadKind` + `isHidden` to contracts/persistence/projection.
- Add hidden thread filtering in list/read paths.

2. **Pipeline**

- Add trigger from source turn completion.
- Add hidden dashboard thread resolve/create logic.
- Add stateless prompt builder from source turn artifacts.
- Dispatch hidden `thread.turn.start`.

3. **UI**

- Add dashboard panel state and rendering.
- Wire websocket updates and stale handling.

4. **Hardening**

- Add timeouts, retries, and stale generation suppression.
- Add debug tools for hidden thread inspection.

## Test Plan

- Unit:
  - hidden thread filtering rules
  - source->dashboard mapping
  - prompt builder excludes prior hidden history
- Integration:
  - source completion triggers hidden dashboard turn
  - panel updates on success/failure/stale
  - main thread unaffected by dashboard errors
- Regression:
  - sidebar/search/export ignore hidden threads by default

## Open Questions (for next request)

- Should `threadKind` be strict enum now or free string with known defaults?
- Should mapping be stored on thread row vs dedicated mapping table?
- Should panel show only latest dashboard output or selectable history snapshots?
- Should regenerate always target latest source turn or allow older source-turn selection?
