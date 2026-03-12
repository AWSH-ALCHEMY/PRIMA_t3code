# Context Compaction Delta Plan

## Problem

When Codex runtime performs context compaction, we currently show a generic compaction event and optional payload details, but we do not provide a reliable answer to:

- what exact context was dropped
- what was retained
- what compacted summary replaced it
- how large the reduction was

This makes debugging quality regressions and trust issues difficult.

## Goal

Add durable, queryable compaction checkpoints so a user can inspect pre/post compaction context and a computed delta for each compaction event.

## Non-Goals

- Re-implementing Codex compaction logic.
- Requiring provider internals that are not returned by runtime events.
- Blocking turn execution if compaction telemetry capture fails.

## Key Constraint

Our current checkpoint system tracks filesystem/git state, not message-context state.  
Compaction delta needs its own persistence model.

## Proposed Design

### 1) Capture pre-compaction snapshot

Trigger: `context.compaction.started`

Store:

- `compactionId` (stable internal id)
- `threadId`
- `turnId`
- `providerCompactionEventId` (`event.eventId`)
- `startedAt`
- `preContextMessageIds` (ordered)
- `preContextDigest` (hashes/metadata)
- `preContextTokenEstimate` (best-effort)
- `status = started`

### 2) Capture completion payload

Trigger: `context.compaction.completed`

Update the pending compaction row with:

- `completedAt`
- provider payload snapshot (`payload.data`, `payload.detail`, raw json)
- extracted summary markdown/text when present
- provider counters (`droppedMessageCount`, `retainedSummaryTokens`, etc.)
- `status = completed`

### 3) Compute delta

After completion, compute and persist:

- `droppedMessageIds` = in pre-context but absent in post-context window
- `retainedMessageIds` = still present
- `replacementSummary` = compacted context summary text/markdown
- `beforeTokenEstimate`
- `afterTokenEstimate`
- `reductionPercent`

### 4) Persist projection

Add table: `projection_context_compactions`

Suggested columns:

- `compaction_id` (PK)
- `thread_id` (indexed)
- `turn_id`
- `provider_event_id_started`
- `provider_event_id_completed`
- `started_at`
- `completed_at`
- `status`
- `pre_context_json`
- `post_context_json`
- `delta_json`
- `summary_markdown`
- `provider_payload_json`
- `created_at`
- `updated_at`

## API Surface

Add orchestration read endpoints:

- `orchestration.getCompactions({ threadId })`
- `orchestration.getCompactionDelta({ threadId, compactionId })`

Response should be projection-backed and safe when partial:

- `started` without completion returns partial details.
- `completed` returns full delta payload.

## UI Plan

In the existing compaction details dropdown:

- Show compacted context markdown (already partially supported).
- Add a `Delta` section:
  - dropped count
  - retained count
  - estimated token reduction
  - expandable dropped message list (with snippet previews)
- Keep raw payload panel for debugging.

## Reliability / Failure Handling

- If app restarts between `started` and `completed`, keep row as `started`.
- On later matching completion event, reconcile by `threadId + turnId + nearest started` (or exact provider ids when available).
- If no completion arrives within retention window, mark `orphaned`.
- Never fail orchestration turn processing because telemetry persistence failed; log and continue.

## Privacy / Safety

- Message text is sensitive; default to storing IDs + short snippets + hashes.
- Add a config flag for full text capture in development only.
- Ensure exports/redaction path can omit sensitive snippets.

## Rollout Plan

### Phase 1: Capture + store (server only)

- Add migration and repository.
- Wire ingestion hooks for started/completed.
- Add reconciliation + status transitions.

### Phase 2: Read APIs + minimal UI

- Expose list/detail endpoints.
- Show delta counts and summary in compaction panel.

### Phase 3: Deep inspection UX

- Add dropped-message preview explorer.
- Add "compare before/after" modal and copy/export actions.

## Open Questions

1. What should define the "post-context window" source of truth in our runtime model?
2. Should token estimation run server-side (stable) or client-side (lighter)?
3. Do we want tenant/user-level policy to disable snippet retention?
4. Should orphaned compactions auto-clean, or remain indefinitely for audit?

## Success Criteria

- For any compaction event, user can answer "what was dropped and what replaced it?"
- Compaction events remain inspectable across restarts.
- No measurable turn latency regression from telemetry capture path.
