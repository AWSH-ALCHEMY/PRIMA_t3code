# Provider Settings + Auth Brainstorm

## Context

We want custom providers/custom models to work without breaking normal Codex subscription behavior.
Current issues mostly come from profile handling being too global and auth assumptions being unclear.

## Goals

- Keep normal built-in Codex usage working by default.
- Support custom models/providers with minimal product/code churn.
- Avoid storing secrets in localStorage/UI settings.
- Make model routing predictable and debuggable.

## Current State (High Level)

- Settings has a `Models` section with provider-scoped custom model slugs.
- Codex profile is configured globally in settings.
- Chat dispatch can include `providerOptions.codex.profile`.
- Local/proxy/subscription conflicts happen when profile is applied too broadly.

## Minimal-Change Strategy

### 1) Add Provider-Scoped Routing Metadata

Extend model settings from simple slugs to optional routing metadata:

- `slug`
- `route`: `default` or `profile`
- `profile` (if `route=profile`)
- optional display label/notes

Default behavior:

- Built-in models use `default` route.
- Custom models can opt into `profile`.

### 2) Resolve Routing Per Selected Model

At send time:

- If selected model maps to `route=profile`, send `providerOptions.codex.profile`.
- Otherwise do not send profile (normal subscription path).

This removes global profile side effects.

### 3) Keep Auth Out of UI Secrets

For custom providers:

- Store only profile names and auth mode metadata in settings.
- Keep actual keys/tokens in environment variables or Codex profile config.
- Server process already inherits env; no new secret storage needed.

Suggested auth modes:

- `inherit` (default environment behavior)
- `none` (for internal proxy flows that do not require real user keys)
- `env-var-name` (explicit required env var name)

### 4) Add Lightweight Preflight Guardrails

Before dispatch:

- If route/profile requires env var and it is missing, show actionable warning.
- Show resolved route preview (`model -> default` or `model -> profile:<name>`).

## Why This Is High Impact

- Fixes most confusing failures with small targeted changes.
- Preserves existing architecture (Codex app-server stays the runtime backend).
- Improves reliability without a big provider-plugin refactor.

## Suggested Implementation Phases

### Phase 1 (Small)

- Keep existing UI shape.
- Add per-model route+profile metadata.
- Apply profile only when selected model resolves to profile route.

### Phase 2 (Small/Medium)

- Add auth mode metadata + missing-env preflight warning.
- Add simple diagnostics text in UI for resolved routing.

### Phase 3 (Optional)

- Expand to richer per-provider panels and discovery/management UX.

## Open Questions

- Should profile routing be per model only, or optionally per thread/session?
- How should discovered models from `codexConfigModels` be promoted into managed routes?
- Do we want export/import for these settings across machines?

## Non-Goals (For Now)

- Building a full provider plugin framework.
- Storing sensitive API secrets in app settings/localStorage.
- Replacing Codex app-server integration path.
