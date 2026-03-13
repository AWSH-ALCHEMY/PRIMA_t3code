# Agent Thread Plan: Multi-Agent Supervisor/Sub-Agent Model

## Objective

Introduce `threadKind="agentThread"` to support agent-to-agent collaboration across projects, while reusing the existing conversation UI in a read-only/locked mode.

This should support:

- One supervisor agent coordinating multiple sub-agents.
- Cross-project communication and delegated work.
- Full visibility for human users (no hidden-only flow).

## Product Principles

- Reuse existing thread/timeline UI as much as possible.
- Keep agent-managed conversations visible and inspectable.
- Make agent authorship and routing explicit on every message.
- Lock manual actions in agent-managed threads to preserve protocol integrity.

## Core Concepts

### 1) Custom Thread Kind

Add `threadKind` values:

- `normal`
- `dashboard`
- `agentThread`

For `agentThread`, add thread-level controls:

- `isLocked: boolean` (true by default)
- `agentOrchestrationMode: "supervisor" | "sub-agent" | "mesh"`

### 2) Agent Identity

Introduce stable agent identity for display and routing:

- `agentId`
- `agentName`
- `agentRole` (`supervisor`, `sub-agent`, `observer`)
- `projectId` (agent home project)

### 3) Message Envelope Metadata

Each message in `agentThread` includes routing metadata:

- `fromAgentId`
- `toAgentId` (single or list)
- `workItemId`
- `correlationId`
- `intent` (`question`, `task`, `progress`, `result`, `error`, `approval-request`)
- `phase` (`queued`, `running`, `completed`, `failed`, `cancelled`)

Human-readable message text still renders as today; metadata powers orchestration + UI badges.

## High-Level Flow

1. Supervisor emits a work item in `agentThread`.
2. Router fans out to target sub-agents (possibly different projects).
3. Sub-agents execute and emit progress/results back with same `workItemId` and `correlationId`.
4. Supervisor aggregates replies and emits final synthesis.
5. Thread remains readable as one unified timeline with clear speaker identity.

## UI Plan (Reuse Existing Components)

### Timeline Reuse

Use current chat timeline with these additions:

- Speaker badge per message (`Supervisor`, `Sub-agent: X`).
- Routing chips (`to: Agent B`, `workItem: W-14`, `status: running`).
- Optional per-agent color accents.

### Locked Behavior

In `agentThread`:

- Disable composer input by default.
- Disable edit/retry/fork actions unless user has override permission.
- Show banner: "Agent-managed thread (read-only)."

### Multi-Agent Readability

- Add filter tabs/chips: `All`, `Supervisor`, each sub-agent.
- Add collapse/expand by `workItemId`.
- Add correlation trace popover for request->responses chain.

## Orchestration/Runtime Plan

### Architecture Decision (Cleanest Fit)

Use existing thread/message orchestration as the primary transport, and add a minimal routing layer:

- Keep `thread.turn.start -> provider -> runtime events -> projection` unchanged.
- Introduce `channelId` to represent an agent relationship/group conversation.
- Create one local `agentThread` per participant per channel.
- Mirror routed messages across participant threads via a server-side `AgentRouter`.

This preserves existing plumbing and avoids a second messaging subsystem.

### Channel Model

- `channelId` identifies a logical conversation between 2..N agents/projects.
- Each participant owns one local thread for that channel.
- Messages are linked across participants using metadata:
  - `channelId`
  - `originMessageId`
  - `pairedMessageId` (recipient-side message id)
  - `correlationId`
  - `sequence` (per-channel monotonic ordering)

This allows one-to-one and many-to-many conversations simultaneously.

### Agent Router Service

Add a server-side router responsible for:

- Validating recipient agents.
- Dispatching envelope messages to target agent sessions/projects.
- Handling fan-out/fan-in and stale/cancelled work.

### Delivery Semantics

- At-least-once delivery with idempotency key (`correlationId + messageId`).
- Loop prevention with max hop count and visited-agent set.
- Configurable timeouts per work item.
- Per-channel ordering key to keep mirrored timelines stable.
- Backpressure controls (concurrency caps per channel/project).
- Dead-letter state for permanently failed deliveries.

### Failure Handling

- If a sub-agent fails: emit structured `error` message for that work item.
- Supervisor can continue partial aggregation.
- No failure in one sub-agent should crash thread orchestration.

### Existing Plumbing Reused

- Command ingress: `orchestration.dispatchCommand` (`thread.turn.start`)
- Domain decisioning: `decider` emits `thread.message-sent` + `thread.turn-start-requested`
- Provider send path: `ProviderCommandReactor`
- Provider event ingestion: `ProviderRuntimeIngestion`
- Read model materialization: `ProjectionPipeline`
- UI sync: `orchestration.domainEvent` + snapshot refresh

Router should hook at domain-event level and dispatch standard commands back into this same flow.

## Data Model Changes

### Thread

- `threadKind`
- `isLocked`
- `agentOrchestrationMode`

### Message/Activity

- Envelope metadata fields listed above.
- Optional `sourceProjectId`/`targetProjectId` for cross-project traceability.

### Optional Tables

- `agent_registry` (agent identity + project association)
- `agent_work_items` (status, owner, timings, retries)

## Access Control and Safety

- ACL for cross-project agent communication.
- Per-agent capability policy (what intents each agent may send/receive).
- Budget and rate limits at agent and work-item levels.
- Audit logs for all routed envelope events.

## Observability

- Correlation timeline across agents via `correlationId`.
- Per-work-item metrics: latency, retries, failures.
- Supervisor aggregation metrics (fan-out size, completion rate).

## MVP Scope

1. Add `threadKind="agentThread"` + locked UI mode.
2. Add agent identity labels in timeline.
3. Add `channelId` and per-message envelope metadata.
4. Implement router for one-to-one mirror delivery first.
5. Extend to supervisor fan-out/fan-in (one-to-many) with same channel model.
6. Support intents: `task`, `progress`, `result`, `error`.
7. Add basic correlation trace view.

## Phase 2

- Parallel work-item scheduling policies.
- Human-in-the-loop approvals for specific intents.
- Agent capability marketplace / dynamic sub-agent selection.
- Cross-thread linking (agent result references normal user thread turns).

## Test Plan

### Unit

- Thread kind gating (locked behavior and visible controls).
- Envelope validation and routing rules.
- Correlation and work-item state transitions.

### Integration

- Supervisor fan-out to multiple sub-agents across projects.
- Partial failures and aggregation correctness.
- No regression in normal thread send/retry/edit/fork behavior.

### Load/Reliability

- Burst fan-out tests.
- Idempotency and duplicate delivery handling.
- Timeout and cancellation stability under load.

## Open Decisions

- Whether `toAgentId` supports arrays directly or one-recipient-per-envelope.
- Whether to model supervisor as a special agent identity or thread-level role only.
- How much manual user override is allowed in locked threads.
- Whether to persist work-item table now or derive from message/activity stream first.
