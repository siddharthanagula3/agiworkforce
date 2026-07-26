# AGI VS Code Extension — Volume 26 — Error Codes

Status: Current implementation notes
Owner: Founder + platform lead
Last updated: 2026-07-25

Authority: grounded in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension-vscode/AGENTS.md`, and real repo paths: `apps/extension-vscode/package.json`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `apps/extension-vscode/src/features/account-auth/deviceAuth.ts`, `apps/extension-vscode/src/features/cloud-bridge/{friendlyError.ts,types.ts}`, `apps/extension-vscode/src/integrations/providerStreamClient.ts`, `apps/extension-vscode/src/core/subsystemHealth.ts`, `apps/extension-vscode/src/integrations/patchEngine.ts`, and `docs/surfaces/vscode-extension.md`.

## Overview & stance

This volume defines the error taxonomy for the AGI VS Code Extension: how failures are classified, surfaced, and recovered from across the three trust modes (Local, BYOK, Managed Cloud). The extension is workspace-scoped and IDE-native; errors must respect that scope. In particular, an error in one trust mode must never be recovered by silently falling through to another (a Managed-Cloud auth failure must not silently execute against a BYOK key or vice versa), and no error path may auto-sync workspace/session context into app chat.

Today the codebase surfaces errors as **typed discriminated unions** and **human-readable strings** at each subsystem boundary, not through one central numbered registry. A unified, stable `AGI-VSC-*` error-code registry (documented codes, docs deep-links, telemetry taxonomy) is design intent: 🔭 Planned. Concrete codes named below that already exist in source are cited; the numbered scheme is the planned wrapper over them.

## Authentication

Managed-Cloud sign-in uses a browser device-authorization loop that polls `/api/device/poll` and maps HTTP status to a typed `PollResult` — `approved` / `pending` / `denied` / `rejected` — where `404` = pending (code not created yet or expired), and `403`/`410` = a hard device rejection ✅ (`apps/extension-vscode/src/features/account-auth/deviceAuth.ts`). Timeout after `MAX_POLLS` and user cancellation resolve to a non-fatal "sign-in timed out / denied" notice ✅.

Legacy invite/cloud-unlock types remain in the compatibility module, but the public-alpha command no longer presents that gate: `agi-workforce.openInviteCodeModal` routes directly to device sign-in. New call sites must not revive invite-only Cloud messaging.

Requirements: every auth error maps to exactly one typed code; `403`/`410` never retry (hard rejection); `404` and network faults degrade to `pending` and keep polling within the outer timeout; BYOK key-missing and Cloud not-signed-in are **distinct** codes, never collapsed. The mapping of these typed states to stable `AGI-VSC-AUTH-*` numbers is 🔭 Planned.

## Provider

Cloud-utility provider errors flow through the streaming client as a `StreamChunk` error followed by a terminal error stop; non-OK HTTP marks 5xx as retryable. `chatCompletion` is wired to this path when the default-off `agiWorkforce.useProviderStream` setting is enabled, and the helper requires the device-flow account token. Missing auth and unsupported model providers fail with stable `AgiWorkforceApiError` codes and actionable guidance. Developer-session errors are owned by the app-server and surfaced by `@agi`/sidebar without silently changing providers.

Requirements: `401`/`403` (auth/entitlement) are non-retryable and route to a sign-in or plan-status action, never a silent provider swap; `429` (rate/quota) is retryable with backoff and surfaces the tier; `5xx` is retryable; provider-side model-unavailable maps to a "select model" recovery. Model IDs in any error copy come only from `packages/contracts/types/src/models.json` — never hardcode one. The stable `AGI-VSC-PROV-*` numbering is 🔭 Planned.

## Extension

Extension-host errors cover activation, command dispatch, and workspace-trust gating. Under an untrusted workspace, `restrictedConfigurations` (`apiEndpoint`, `gatewayUrl`, `cliPath`, `autoApplyFixes`, `telemetryEndpoint`, `tier`) cannot be overridden and Agent-mode file writes are disabled until trust is granted (`apps/extension-vscode/package.json`). Attempting a restricted action in that state must raise a distinct “workspace not trusted” error, not a generic failure.

Requirements: unknown/disabled command invocations from the bridge are blocked and logged, not executed (`ALLOWED_BRIDGE_COMMANDS`); command handlers surface actionable notifications rather than throwing to the host; subsystem probes report structured health via `agi-workforce.showSubsystemHealth`. The extension preserves all canonical plan values instead of collapsing managed tiers into BYOK. `AGI-VSC-EXT-*` numbering remains planned.

## Runtime

Developer-session runtime failures come from `LocalRuntimeClient`: missing/outdated `agi` binaries, protocol mismatch, process exit, malformed JSON-RPC, and turn errors surface visibly. The sidebar has a dedicated “Local runtime needs setup” state; `@agi` returns an explicit runtime-unavailable error. The optional Desktop bridge has its own authenticated lifecycle and degrades independently.

Requirements: app-server failure is actionable rather than a hang, and bridge-down is a **degradation**, never a crash. The TCP bridge transport remains a same-user weakness; socket/named-pipe migration and stable `AGI-VSC-RT-*` numbering are planned.

## Workspace

Workspace errors guard file and patch operations. The bridge `desktop:open-file` handler resolves paths against workspace folders and blocks any target outside them (with a separator check to prevent adjacent-directory bypass) ✅ (`desktopBridge.ts`). Patch/checkpoint application (`src/integrations/patchEngine.ts`, `src/data/checkpointManager.ts`) must surface apply failures — context mismatch (expected-vs-actual), rejected hunks, and restore failures — through the patch-log and diff-review commands (`agi-workforce.showPatchLogs`, `agi-workforce.showOriginalContext`) rather than partially writing ✅ (`apps/extension-vscode/package.json`).

Requirements: path-traversal and out-of-workspace writes always fail closed; a failed patch leaves the file unmodified and rejectable; under an untrusted workspace, agent writes are blocked with a trust error (see Extension). `AGI-VSC-WS-*` numbering is 🔭 Planned.

## Recovery Guidance

- **Auth:** re-run `AGI: Sign in to AGI Cloud` for expired/denied device flows; `403`/`410` require a fresh sign-in (no retry); invite errors show the mapped friendly string and route to AGI Web where `account_auth_not_wired`.
- **Provider:** retry `5xx`/`429` with backoff; `401`/`403` prompt sign-in or plan upgrade; model-unavailable prompts model reselection — never silently switch trust mode or provider.
- **Runtime:** use the status-bar item or `AGI Workforce: Reconnect Desktop Bridge`; if the token is missing/unsafe, restart the desktop app or reset the bridge token; local work continues meanwhile.
- **Workspace:** grant workspace trust to enable agent writes; reject/re-run failed patches via diff-review; inspect `Show Patch Logs`.
- **Diagnostics:** `AGI: Show Subsystem Health` for a structured snapshot.

## Repository map

- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — bridge status, token, handshake, rate-limit, frame validation.
- `apps/extension-vscode/src/integrations/localRuntimeClient.ts` — app-server lifecycle and protocol errors.
- `apps/extension-vscode/src/features/account-auth/deviceAuth.ts` — device sign-in poll results and HTTP mapping.
- `apps/extension-vscode/src/features/cloud-bridge/{friendlyError.ts,types.ts}` — invite/cloud error enum + friendly strings.
- `apps/extension-vscode/src/integrations/providerStreamClient.ts` — provider stream error/stop chunks.
- `apps/extension-vscode/src/core/subsystemHealth.ts` — subsystem health probe.
- `apps/extension-vscode/src/integrations/patchEngine.ts`, `src/data/checkpointManager.ts` — patch/checkpoint failure surfaces.
- `apps/extension-vscode/package.json` — untrusted-workspace restrictions, commands, settings.

## Competitor notes

Claude Code, ChatGPT, and Codex IDE extensions surface single-provider errors (auth, rate-limit, tool-approval) tied to one vendor account. AGI diverges deliberately: errors are **trust-mode-aware** and **multi-provider**, so an error names its trust mode (Local / BYOK / Managed) and its provider without cross-mode fallthrough; BYOK errors (Desktop/CLI/VS Code only) are first-class and never surface on Web/Mobile; and local-first degradation keeps the editor usable when the cloud bridge or Managed path is down — parity references, not copied behavior.

## Acceptance / Definition of Done

Production-ready when every user-visible failure maps to exactly one typed code, carries a recovery action, respects trust boundaries, and never leaks secrets or cross-mode data. The stable `AGI-VSC-*` numbered registry and its telemetry taxonomy remain 🔭 until built.

- [ ] Build/behavior: `pnpm --filter agi-workforce typecheck` and `pnpm --filter agi-workforce test` green; error paths covered by tests (`__tests__/{desktopBridge,security,trust-boundary}.test.ts`).
- [ ] Trust: no error path routes Local→BYOK or Local→Cloud silently; provider label and trust mode shown on every provider error.
- [ ] Security: token permission checks fail closed; out-of-workspace/path-traversal writes blocked; error copy never prints tokens, keys, or full payloads; removed tiers never ship as valid selections.

## Anti-patterns

- Inventing numbered codes and claiming them shipped — the registry is 🔭; only cite typed states that exist in source.
- Pattern-matching error prose instead of switching on typed codes.
- Recovering an auth/provider error by silently switching trust mode, provider, or key.
- Auto-syncing workspace/session context into app chat on any error path.
- Hardcoding a model ID in error copy (use `packages/contracts/types/src/models.json`).
- Referencing Supabase, `middleware.ts`, or removed tiers (`Plus`, `Hobby`, `pro_plus`) or credit top-ups.
- Treating a bridge disconnect as fatal instead of degrading to local-only.
