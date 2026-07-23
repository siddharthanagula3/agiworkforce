# Public Demo and Production Readiness

**Status:** Active execution plan
**Owner:** Product/platform
**Last verified:** 2026-07-23
**Scope:** Web, VS Code, Chrome, Desktop, Mobile, CLI, and shared services

## Purpose

This file is the release-order overlay for the exhaustive parity inventory in
`docs/plans/chatgpt-claude-parity-gap-audit-2026-07-21.md` and the implementation-backed
ledger in `docs/agent-context/known-flaws.md`.

It does not replace or duplicate every row in those documents. It records:

1. what blocks an investor demo or public-feedback release;
2. whether a path is wired, partial, mock/scaffold, dead, or awaiting real verification;
3. the production work that remains after the demo path works;
4. the serial release order.

A demo fix is not complete when a control is hidden or an error is swallowed. Each fix must either
restore the production path or leave an explicit, source-backed production follow-up here and in
`known-flaws.md`.

## Status vocabulary

| Status                   | Meaning                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Wired                    | Production owner path exists and relevant automated checks pass.                                         |
| Live verified            | Wired and exercised on the real surface/backend.                                                         |
| Partial                  | Some real layers exist, but a required caller, persistence path, state, or failure path is absent.       |
| Scaffold                 | Types, routes, UI, or storage-shaped code exists without a complete production flow.                     |
| Dead                     | Implementation has no production caller or mount point.                                                  |
| Mock-only                | Tests or UI use fabricated state without proving the production dependency.                              |
| External release blocker | Code may be ready, but signing, store credentials, review, secrets, or vendor configuration is required. |

## Demo release gates

These gates apply to every surface before it is called demo-ready:

- launch/relaunch and close without a blank, black, or dead window;
- authenticate, sign out, and recover from expired credentials;
- create, stream, stop, retry, reload, and reopen a conversation;
- render thinking/activity/tool progress without exposing hidden chain-of-thought;
- execute one safe tool with visible approval and one denied/error path;
- create, reopen, and download one durable artifact or file where the surface supports artifacts;
- preserve the Local/BYOK/Managed trust label and never silently cross it;
- show loading, empty, disabled, success, and actionable failure states;
- produce no unexpected console, extension-host, native, or network errors;
- pass the smallest automated suite plus a real-surface smoke test;
- ship through a reproducible signed/packageable release path.

## Current demo blocker queue

### Web

| Area                          | Current state                                                                                                                             | Demo exit condition                                                                                                      | Production follow-up                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Managed chat and AGI Work     | Wired; recent commits repaired stream failures, completion fallback, work-mode regeneration, tool status, artifacts, and sandbox preview. | One low-cost live run proves text, sequential tools, durable file, artifact preview, reload, and download.               | Durable approval resume and full run recovery across process restart.                                       |
| GPT-5.4 Mini empty completion | Code-fixed after provider completion fallback; live proof is not recorded after the latest branch commits.                                | One fresh Low-effort run after deployment returns text and performs the requested tool/file call.                        | Keep content-free provider diagnostics and empty-success fail-closed guard.                                 |
| Project conversation recall   | Wired by `fix(web): restore project conversation recall`.                                                                                 | Add chats to a project, start a new project chat, retrieve relevant prior conversation, reload, repeat.                  | Ranking, citations to source conversations, privacy/tenant tests.                                           |
| Max 5x → Max 15x              | Proration/usage fixes are committed.                                                                                                      | Test-mode upgrade shows adjusted amount, preserves usage, applies correct reset/carry-over, and survives webhook replay. | Reconciliation, refunds, disputes, dunning, tax, and production price configuration.                        |
| SSO/SCIM marketing/admin      | Scaffold. Routes reference storage and flows that are not production-complete.                                                            | Do not present as live in the demo; describe as roadmap only.                                                            | Complete canonical schema, brokered login, JIT, SCIM users/groups, reconciliation, audit, and tenant tests. |

### VS Code extension

| Area                       | Current state                                                                                       | Demo exit condition                                                                                                                    | Production follow-up                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Device OAuth               | Wired by the device-token and `/connect/[deviceType]` work; previously broken audit entry is stale. | Clean extension profile → sign in → browser authorization → editor receives session → Cloud chat → sign out/revoke.                    | Refresh/revocation/offline/clock-skew and multi-workspace tests.                           |
| Chat UI and startup errors | UI polish and optional-startup noise fixes are committed.                                           | Launch with no workspace, trusted workspace, and untrusted workspace; no extension-host errors; streaming/tool approval visibly works. | Shared organization policy, durable approvals, accessibility and performance.              |
| Local models               | Discovery/run path is committed.                                                                    | Detect a real local runtime, select model, stream response, cancel, recover from runtime-offline.                                      | Shared Local model management and policy enforcement through CLI/Desktop host.             |
| Distribution               | External release blocker.                                                                           | Build VSIX, install into a clean VS Code profile, verify icon/metadata, and provide installable demo package.                          | Marketplace and Open VSX publisher credentials, signed release automation, update channel. |

### Chrome extension

| Area                            | Current state                                                                                 | Demo exit condition                                                                                                                                 | Production follow-up                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Web OAuth                       | Wired by the current branch; needs clean-profile proof.                                       | Sign in from unpacked extension, complete browser authorization, persist/revoke session, and recover from denied auth.                              | Store-safe redirect origins, refresh/revocation, organization workspace context.     |
| Desktop pairing/browser control | Partial; pairing changes are present in the working tree and must remain trust-boundary-safe. | Desktop requests a browser action, extension shows correct approval, action executes once, denial/timeout fail closed, reconnect survives relaunch. | Organization connector/domain policy, audit, multi-profile/native-host lifecycle.    |
| Side panel UI                   | Polished and covered by extracted real-UI helpers.                                            | Real Chrome side panel smoke at narrow/wide sizes, no console/service-worker errors.                                                                | Accessibility, localization, long-run/task history, performance.                     |
| Distribution                    | External release blocker.                                                                     | Reproducible ZIP/unpacked demo package with correct AGI mark and manifest validation.                                                               | Chrome Web Store publisher credentials, privacy disclosures, review, staged rollout. |

### Desktop

| Area                         | Current state                                                                                                                                             | Demo exit condition                                                                                                                                                    | Production follow-up                                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Cloud mode                   | Wired by `fix(desktop): enable secure cloud mode`; prior “hard-gated off” audit entry is stale.                                                           | Signed or release-equivalent app signs in, opens Cloud mode, streams a chat, uses a tool, persists/reloads, and syncs with Web/Mobile without leaking Local/BYOK data. | Organization workspace/policy, durable approvals, multi-account and offline reconciliation.                        |
| Local mode chat/activity UI  | Live verified for a real Ollama text/reasoning lifecycle; shared unified-chat components own the visible transcript.                                      | Add real tool/error/cancel/reload coverage without exposing hidden chain-of-thought.                                                                                   | Finish shared Web/Desktop presentation primitives and remove remaining desktop-only duplication.                   |
| Close/black screen lifecycle | Main-window close is live verified against the rebuilt Tauri process; `⌘W` exits the native host instead of destroying only the WebView.                  | Verify title-bar close, quit, reopen, tray/dock reopen, update/restart, and auxiliary-window paths as a packaged app.                                                  | Cross-platform Windows/Linux lifecycle suite and crash recovery.                                                   |
| Local model install          | Live verified against real Ollama: malformed saved URL recovery, daemon re-check, model pull, success state, and corrected URL persistence pass natively. | Add cancel/remove/download-progress and disk/runtime-offline coverage, then chat with the newly installed model.                                                       | Embedded runtime strategy, disk/thermal policy, signed model metadata.                                             |
| MCP startup                  | Partial. Initialization is backgrounded, but stale imported remote definitions can retry noisily and use legacy SSE assumptions.                          | Load the shell without blocking; classify incompatible/auth-required imports without deleting config; connect a valid server on demand.                                | Shared streamable-HTTP transport, connector health/backoff policy, organization allowlists, and admin diagnostics. |
| Browser/OS control           | Rich implementation exists; Browser pairing must be proven with Chrome.                                                                                   | One approved browser task and one approved desktop-app action execute visibly; denial and permission-missing paths are clear.                                          | Policy distribution, organization audit, Linux parity, device posture.                                             |
| Distribution                 | Partial/external.                                                                                                                                         | Produce a signed/notarized or release-equivalent demo build and smoke it on a clean user profile.                                                                      | Notarization, auto-update signing, Windows signing, Linux packaging and rollout controls.                          |

### Mobile

| Area                  | Current state                                                                                      | Demo exit condition                                                                                                               | Production follow-up                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Local mode            | Wired foundation with on-device inference.                                                         | Download a small supported model, chat offline, cancel, relaunch, delete model/data, verify no Cloud network egress.              | Thermal/storage policy, background interruption, model signing and wider device matrix.        |
| Cloud mode            | Wired foundation.                                                                                  | Sign in, stream/retry chat, sync conversation with Web/Desktop, open artifact/file, sign out and remove cached organization data. | Durable approvals, richer tools/artifacts, organization workspace/policy.                      |
| Settings boundary     | Partial. Personal Local and Cloud settings remain too blended.                                     | Scope labels make device-private Local data and account Cloud data unmistakable; destructive actions state their exact scope.     | Personal/Organization scope switcher; organization policy and managed-data ownership notices.  |
| Store billing/release | External release blocker; product identifiers and store configuration require owner/vendor access. | Demo build installs and runs on simulator/device with billing controls honestly disabled or sandbox-configured.                   | App Store/Play products, receipt production config, review, privacy manifests, staged rollout. |

### CLI

| Area                    | Current state                                                                    | Demo exit condition                                                                                                      | Production follow-up                                                                       |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Core developer workflow | Mature and covered by production-binary smoke.                                   | Fresh config → Local/BYOK/Cloud login → inspect/plan/edit/test with approvals → resume session → clean error exit codes. | Durable approval journal, `pause_turn`, policy enforcement, long-running recovery.         |
| Naming and packaging    | `agi` is canonical with compatibility alias.                                     | Install the release artifact on a clean shell, run `agi doctor`, authenticate, execute a safe task, upgrade/uninstall.   | Signed provenance, package-manager publication, update channels, SBOM.                     |
| Team terminology        | Partial/confusing. CLI “teams” are agent teammates, not paid organization seats. | Demo language calls them agent teams and does not imply organization billing/admin.                                      | Organization workspace identity and signed policy through a separate governance namespace. |

## Cross-app production gaps

The following are suite-level work packages. They are not permitted to become six independent
implementations.

| Work package                            | Current state                                                                                 | Shared owner                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Durable run/approval journal            | Partial; visual state can outlive resumable execution state.                                  | Shared cloud run service + CLI/Desktop local journal adapters.                   |
| Organization workspace and seat context | Partial on Web, absent elsewhere.                                                             | Shared contracts/service; Web control plane; read-only clients.                  |
| Team billing and proration              | Missing canonical organization authority; Desktop has a siloed local billing model.           | Web billing service + Stripe/ledger; all clients consume entitlement snapshots.  |
| Signed organization policy              | Verifier contract only; no surface enforcement.                                               | Licensing/contracts + CLI/Desktop enforcement engine.                            |
| SSO/JIT/SCIM                            | Scaffold only.                                                                                | Web identity service with canonical migrations and broker integration.           |
| RBAC/groups/resource scope              | Missing beyond four basic organization roles.                                                 | Shared authorization service with server/native enforcement.                     |
| Immutable organization audit            | Missing; current settings audit is user-scoped and enterprise routes reference absent tables. | Shared audit contract + canonical Neon storage + local spool/export.             |
| Retention/deletion/legal hold           | Settings-shaped contracts without deletion machinery.                                         | Data lifecycle service plus per-surface Local obligations.                       |
| Connector registry and policy           | User-scoped/fragmented.                                                                       | Shared connector catalog/permissions; Web admin policy; client enforcement.      |
| Usage analytics and budgets             | Personal metering exists; organization aggregation/seat budgets are missing.                  | Managed usage ledger + organization analytics service.                           |
| Settings architecture                   | Shared UI primitives exist, but Local/Cloud/Organization scopes are inconsistent.             | Shared settings schema/components; surface-specific native adapters only.        |
| Distribution and release evidence       | Each surface has different manual gaps.                                                       | Unified release matrix, signing, SBOM, store metadata, smoke evidence, rollback. |

## Serial execution order

1. Validate and release committed Web fixes needed by the demo.
2. Prove VS Code device OAuth and produce a clean-install VSIX.
3. Prove Chrome OAuth + Desktop pairing and produce a validated ZIP.
4. Finish and live-test Desktop Local/Cloud/lifecycle working-tree fixes; package a demo build.
5. Run Mobile Local/Cloud/settings-boundary smoke; produce a demo build.
6. Run CLI clean-install production-binary smoke; package the release artifact.
7. Re-run the Web cross-surface project, billing, connectors, attachment, and artifact scenarios.
8. Begin the canonical Team foundation, then shared organization-policy enforcement.

## Verification record

Add dated evidence here only after the relevant automated and real-surface checks run. Do not mark a
surface complete from a build alone.

- 2026-07-23: organization route regressions added for admin-to-owner escalation, last-owner
  demotion, unsupported policy-like settings, and empty fake-success updates. Focused Web suite:
  3 files, 5 tests passed.
- 2026-07-23: VS Code extension typecheck, lint, 43-file/587-test extension suite, and
  20-test webview suite passed. `agi-workforce-0.3.0.vsix` was built and installed into an
  isolated VS Code profile. The clean profile rendered the AGI activity icon, honest Local-runtime
  setup state, and generated a real short-lived AGI Cloud device code. Final browser approval was
  intentionally not performed because it creates a persistent editor credential.
- 2026-07-23: Chrome extension typecheck, lint, 80-file/1,151-test suite, no-cloud-IPC check,
  no-hex check, and packaged-UI smoke passed. The smoke exercised the service worker, side panel,
  composer, drawer, model picker, action mode, persistence, options, and autofill. Production ZIP
  preparation correctly failed closed because a live `CLERK_PUBLISHABLE_KEY` is not configured.
  Nine native pairing tests also passed, including loopback-only access, short-lived bootstrap
  authentication, manifest-install authentication, and token rotation. The installed Chrome-control
  bridge was not available to automation even after opening Chrome with user approval, so a real
  Desktop-to-Chrome approval/action/reconnect proof remains open.
- 2026-07-23: Desktop/unified-chat focused checks passed: Desktop typecheck, Desktop lint,
  unified-chat typecheck, unified-chat lint, 53 focused Desktop tests, and 25 focused shared-chat
  tests.
- 2026-07-23: rebuilt Desktop launched to an interactive shared-chat shell in about 7.7 seconds
  after database/Gmail key-derivation startup fixes. A real Ollama run returned `42` with visible
  Thinking state. Native model management repaired a malformed persisted Ollama URL, re-checked
  the real daemon, pulled `smollm2:135m`, showed success, and saved
  `http://localhost:11434/`. The dedicated native lifecycle spec proved `⌘W` terminates the
  WebDriver/native host instead of leaving the reported black window. Focused Desktop verification:
  3 files/43 tests, full lint, typecheck, Rust build, 2 Rust close-policy tests, model-install E2E,
  and main-window-close E2E passed. Packaged title-bar/tray/update/reopen checks remain open.
