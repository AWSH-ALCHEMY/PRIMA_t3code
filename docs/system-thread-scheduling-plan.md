# System Thread Scheduling Plan

## Feature Name

`threadKind = "systemThread"`

Alternative naming (if preferred): `reminderThread`.

## Objective

Enable scheduled, system-generated reminders and check-ins for long-running work so users and agents can reliably follow up on background processes.

This extends the custom `threadKind` strategy with a dedicated scheduled system channel.

## Problem Statement

Long-lived agent activities (research, delegated tasks, external jobs, background operations) require periodic check-ins. Manual follow-up is error-prone and causes missed status updates.

## Product Outcome

Users can schedule one-time or recurring system reminders tied to target work context (thread/work item/agent/project). Reminders are delivered as system-authored messages in a dedicated system thread kind.

## Core Concepts

### 1) Scheduled Reminder

A persisted schedule definition describing when and where to emit a reminder.

### 2) Reminder Trigger

A single scheduler execution attempt for a reminder.

### 3) Reminder Delivery

A system message produced from a successful trigger.

### 4) Reminder Target

The context being monitored, such as:

- target thread
- work item
- agent
- project

### 5) Reminder Policy

Scheduling and retry behavior (once/interval/cron, retry limits, timeout).

## Thread Kind Integration

Add/extend thread kind values:

- `normal`
- `dashboard`
- `agentThread`
- `systemThread`

Recommended defaults for `systemThread`:

- visible in UI but clearly separated as system-generated
- locked/manual composer disabled
- strict message authorship = `system`

## Data Model (MVP)

### Reminder Definition

- `reminderId`
- `threadKind` (`systemThread`)
- `targetThreadId` (nullable)
- `targetWorkItemId` (nullable)
- `targetAgentId` (nullable)
- `targetProjectId` (nullable)
- `scheduleType` (`once` | `interval` | `cron`)
- `scheduleExpression` (cron string or interval spec)
- `timezone` (IANA)
- `nextRunAt` (UTC)
- `status` (`active` | `paused` | `cancelled` | `completed`)
- `messageTemplate` (markdown/text template)
- `createdAt`, `updatedAt`
- `lastRunAt` (nullable)
- `lastResult` (`success` | `failed` | `skipped`)

### Reminder Trigger Log (recommended)

- `triggerId`
- `reminderId`
- `scheduledFor`
- `startedAt`
- `finishedAt`
- `result`
- `error`
- `deliveryMessageId` (nullable)
- `idempotencyKey`

## Scheduling Semantics

### Supported schedules

1. One-time (`once`)
2. Fixed interval (`interval`)
3. Cron (`cron`) [phase 2 if desired]

### Execution guarantees

- At-least-once trigger execution.
- Idempotent delivery (no duplicate system messages for same trigger).
- Catch-up policy for missed windows (configurable):
  - `skip-missed`
  - `run-latest-once`

### Retry policy

- Bounded retries with exponential backoff.
- Mark trigger failed after max retries.
- Keep reminder active unless failure policy says otherwise.

## Server Architecture

### Scheduler Service

Add a scheduler layer in server runtime responsible for:

- loading active reminders
- ticking due reminders
- dispatching trigger jobs
- updating next execution times

### Delivery pipeline

1. Trigger due reminder.
2. Resolve target context metadata.
3. Render reminder payload (template variables).
4. Append system message in `systemThread`.
5. Persist trigger result + advance `nextRunAt`.

### Isolation requirements

- Scheduler failures must not impact main chat/event pipeline.
- Delivery should be non-blocking to user turn processing.

## UI/UX Plan

### System Thread presentation

- Reuse timeline UI with `System` authorship badge.
- Distinct visual treatment for reminders/check-ins.
- Show source target references (`workItem`, `thread`, `agent`).

### Reminder management UI (MVP)

- Create reminder dialog:
  - target
  - schedule type
  - cadence/timezone
  - message template
- Reminder list:
  - next run time
  - status
  - pause/resume/cancel/reschedule actions

### Time display

- Show both local user time and schedule timezone where helpful.

## Contracts and Events

Proposed domain/push events:

- `system.reminder.created`
- `system.reminder.updated`
- `system.reminder.paused`
- `system.reminder.resumed`
- `system.reminder.cancelled`
- `system.reminder.triggered`
- `system.reminder.delivered`
- `system.reminder.failed`

Each event should include:

- `reminderId`
- `threadKind`
- `target identifiers`
- `trigger metadata`
- `timestamps`

## Reliability and Safety

- Idempotency key per trigger window.
- Hard timeout per trigger execution.
- Persistent schedule store (DB-backed), not in-memory only.
- Safe startup reconciliation for overdue reminders.
- Structured error logging and telemetry.

## Access Control

- Restrict who can create/edit/delete reminders.
- Validate target ownership/project permissions.
- Prevent reminders from targeting unauthorized cross-project resources.

## MVP Delivery Phases

1. **Foundation**

- Add `systemThread` kind.
- Add reminder definition + trigger persistence.

2. **Scheduler Runtime**

- Background tick loop + due trigger execution.
- One-time + interval schedules.

3. **Delivery + UI**

- Append system messages to system threads.
- Reminder management panel and controls.

4. **Hardening**

- Idempotency, retry/backoff, startup reconciliation.
- Telemetry and operational metrics.

## Test Plan

### Unit

- schedule parsing/next-run computation
- reminder status transitions
- idempotent trigger handling

### Integration

- due reminder triggers system message delivery
- pause/resume/cancel behavior
- restart recovery with missed schedules

### Regression

- no impact on normal thread send/retry/edit/fork
- agentThread/dashboard flows remain unaffected

## Open Decisions

- Keep `cron` in MVP or phase 2?
- Single global system thread vs one system thread per project?
- Should system reminders be user-visible in sidebar by default?
- Which catch-up policy should be default after downtime?
