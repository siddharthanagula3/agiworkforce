# Surface Inventory Audit — VS Code Extension (`apps/extension-vscode`)

Auditor: inventory recon subagent. Date: 2026-05-29. Mode: READ-ONLY.
Scope: `apps/extension-vscode/**` (excludes node_modules, dist, out, .vscode-test).

## Summary verdict

**Alive status: SHIPPING (with caveats).** This is a real, deeply-built, security-hardened
VS Code extension — not AI slop. It compiles to a committed `agi-workforce-0.3.0.vsix`, has
34 test files (~524 `it/test` blocks) with a working vitest + vscode-mock harness, command
parity is clean (all 69 declared commands are registered), and there is an unusually thorough
chain of explicitly-tracked security fixes (VSCODE-01..06, PR-2x..PR-5x, F-02..F-26) that hold
up under inspection: path-containment on every write path, sensitive-file denylists, webview
CSP with CSPRNG nonce + DOMPurify, Zod-validated IPC, bridge token auth with TOCTOU fix +
command allowlist + rate limiting, and telemetry secret redaction.

The real defects are functional/quality, not security: a confirmed **History duplication bug**
(sidebar saves a new conversation entry per assistant turn), several **deliberately fail-closed
cloud features** (invite/waitlist/provider-stream) whose UI is fully built but whose backend
always errors (consistent with the v1 LOCAL-ONLY + cloud-waitlist lock), the **brand-name gap**
(`displayName: "AGI Workforce"` vs the locked public brand "AGI"), and a few minor
inconsistencies (one weak Math.random nonce; chat-editor-panel doesn't persist history at all
while sidebar over-persists).

LOC (non-test source, approx): ~16k production TS + ~8k test TS. ~46 non-test source modules,
34 test files.

---

## Purpose & Architecture

IDE-native AI coding assistant. Entry: `src/extension.ts` (`activate` on `onStartupFinished`).
Activation orchestrates modular setup:

- `core/subsystemHealth.ts` (boot tracking + `showSubsystemHealth` command), `core/telemetry.ts`,
  `features/model-picker/modelMetrics.ts`, `features/desktop-bridge` (port 8787),
  `data/checkpointManager.ts` (git-stash checkpoints).
- `core/providerSetup.ts` → code-intelligence providers (diff decoration, diagnostics,
  code lens, inline completions). `core/chatSetup.ts` → chat participant, sidebar webview,
  conversation tree, context-files tree, memory tree. `core/commandSetup.ts` (1479 LOC) →
  all command handlers.

Surfaces inside the extension:
- **Sidebar webview** (`features/sidebar-webview/`): monolithic HTML/CSS/JS string
  (`webviewContent.ts`, 2001 LOC) + `ChatStateManager.ts` (890 LOC, message router) +
  `sidebarProvider.ts` (thin WebviewViewProvider).
- **Full-screen chat** (`providers/chatEditorPanel.ts`): reuses the same webview HTML/protocol.
- **`@agi` chat participant** (`features/chat-participant/chatParticipant.ts`): slash commands
  `/explain /fix /refactor /tests /docs /model`, vscode.lm (Copilot) fallback.
- **Agent mode** (`providers/agentModeProvider.ts` + `agentMode/agentLoop.ts` + `agentMode/agentUI.ts`):
  iterative tool-use loop, edit/patch approval QuickPicks, diff review, workspace-trust gating.
- **Trees**: `trees/conversationTreeProvider.ts` (History), `trees/contextPanelProvider.ts`
  (Context Files), `memory/memoryTreeProvider.ts` (Memory).
- **Code intelligence**: `code-lens/`, `hover/`, `inline-completions/`, `providers/codeActionProvider.ts`,
  `providers/errorExplainerProvider.ts`, `providers/terminalProvider.ts`.
- **Cloud (gated)**: `features/cloud-bridge/InviteCodeModal.ts`, `lib/waitlistService.ts`,
  `integrations/tierResolver.ts`, `integrations/providerSwitchGuard.ts`, `data/usageMeter.ts`.
- **Shared**: `utils/api.ts` (HTTP/SSE LLM client), `utils/pathSafety.ts`, `integrations/patchEngine.ts`,
  `platform/{config,applyEdit,workspaceFolders,surface,version}.ts`, `protocol/{webviewMessages,bridgeMessages,apiResponses}.ts` (Zod).

Shared packages used (NOT missing): `@agiworkforce/types`, `@agiworkforce/runtime`
(`QueueFullError`, `getVSCodeSendQueue`), `@agiworkforce/utils` (`resolveContained`,
`isSensitiveFile`), `@agiworkforce/design-tokens`.

Manifest facts (`package.json`): name `agi-workforce`, publisher `agiworkforce`, version
`0.3.0`, `engines.vscode ^1.110.0`, 69 commands, 26 settings (all `agiWorkforce.*` camelCase),
14 keybindings.

---

## Alive vs Dead

ALIVE (reachable from `activate` import closure / entry points): essentially the entire tree —
extension.ts → core/{subsystemHealth,telemetry,providerSetup,chatSetup,commandSetup,advancedFeatures}
→ all feature/provider/data/integration modules. Verified command parity: all 69 declared
commands are registered via `registerCommand` (4 apparent "ghosts" —
`deleteConversation`/`openConversation`/`showOriginalContext`/`showSubsystemHealth` — are
registered with multi-line formatting; confirmed at `commandSetup.ts:374,408,182` and
`subsystemHealth.ts:38`). The old FINAL_AUDIT "ghost command" P0 is genuinely closed.

DEAD / DISABLED-BY-DESIGN (present, wired into UI, but always fail closed):
- `utils/api.ts:766 streamChatCompletionViaProvider` — unconditionally throws
  `AGI_ACCOUNT_WEB_AUTH_NOT_WIRED`. Reachable ONLY from `chatParticipant.ts:386` when config
  `agiWorkforce.useProviderStream === true` (default `false`, `platform/config.ts:44`). Sidebar
  and chat-editor-panel always use the working `streamChatCompletion`. Fail-closed flag, not a
  default-path break.
- `lib/waitlistService.ts` — both `redeemInviteCode` and `joinWaitlist` are full stubs that
  always return `{success:false, error:'account_auth_not_wired'}`. The `InviteCodeModal`
  UI (two tabs, validation, spinners, 408 LOC) is fully built but every submission shows an
  error. Reachable via `agi-workforce.openInviteCodeModal` and the sidebar "Cloud history" path
  (`ChatStateManager.ts:338`). Consistent with the v1 LOCAL-ONLY + cloud-waitlist lock.

NO truly orphaned modules found.

---

## Test Coverage

Real and substantial. `vitest.config.ts` aliases `vscode` to `src/__tests__/__mocks__/vscode.ts`
(640-line mock). 34 test files, ~524 `it/test` blocks. Three runners: `test` (vitest unit),
`test:webview` (jsdom, `vitest.webview.config.ts`), `test:integration` (tsc + `@vscode/test`,
`src/test/`). Coverage spans the security-critical surfaces: `security.test.ts`,
`bridgeAllowlists.test.ts`, `desktopBridge.test.ts`, `telemetryRedaction.test.ts`,
`patchEngine.test.ts`, `applyEdit.test.ts`, `checkpointManager.test.ts`, `shellQuote.test.ts`,
`providerSwitchGuard.test.ts`, `sidebarPaywallGuard.test.ts`, `commandParity.test.ts`,
`webviewContent.snapshot.test.ts`, `mentionFileInChat.test.ts`, `webviewAttachFiles.test.ts`.
NOTE: did NOT execute the suite (audit is read-only / no builds); cannot confirm green, only that
infra + tests exist. The surface doc's "352 tests" is understated vs current ~524 blocks.

---

## Panic / Crash sites

No Rust in this surface. `throw` sites (non-test) reviewed — all are either error-classification
(caught by callers) or genuine invariants, none unguarded on a common user path:

- `utils/api.ts:479,517,582,589,593,777` — typed API errors (`AgiWorkforceApiError`,
  `AgiWorkforcePaywallError`); all callers catch (ChatStateManager, chatParticipant, inline
  completions, terminalProvider).
- `providers/agentMode/agentUI.ts:136` — `throw Path traversal detected` invariant inside
  `handleEditRequests`; this is a defensive throw after `resolveContained` fails. Reachable via
  agent edit flow; the agent loop / command handlers wrap calls in try/catch, so it surfaces as
  an error message, not a crash. (Belt-and-suspenders: patchEngine handles the same case by
  pushing to `failed[]` instead of throwing — minor inconsistency, not a bug.)
- `platform/surface.ts:30` — throws on unsupported surface enum; invariant.
- `chatEditorPanel.ts:315`, `chatParticipant.ts:410`, `ChatStateManager.ts:703`,
  `api.ts:118` — `throw err` re-throws inside try blocks that handle the expected cases.
- `telemetry.ts` — every public fn is wrapped so telemetry "never throws or blocks the caller".

`JSON.parse` (11 non-test sites) are all inside try/catch or guarded SSE parsing (`api.ts`,
`desktopBridge.ts`, `tierResolver.ts`).

---

## TODO / FIXME / HACK

ZERO `TODO`/`FIXME`/`HACK` in non-test source. The only forward-looking markers are structured,
documented "IN PROGRESS" comments: `desktopBridge.ts:13` (PR-4A — TCP→Unix-socket transport
migration is still pending; current `ws://127.0.0.1:8787` is same-user-reachable if the 0600
token is read by another same-user process). This is a documented limitation, not a stray TODO.

---

## Security-sensitive code (reviewed in depth — strong posture)

- **Secrets**: API key stored only in VS Code `SecretStorage` (`utils/api.ts:127-153`). Never
  logged. `Authorization: Bearer` only over validated endpoints.
- **Endpoint allowlisting (VSCODE-01)**: `getCloudApiEndpoint` reads GLOBAL config only (ignores
  attacker-controlled workspace `.vscode/settings.json`), validates against an exact-host
  allowlist + https/localhost (`api.ts:168-229`). Telemetry endpoint uses an exact-host
  allowlist too (`telemetry.ts:73-87`, PR-5C/F-22 — fixed the prior `.endsWith` subdomain-takeover
  hole).
- **Telemetry redaction (D3)**: secrets (JWT/Bearer/sk-/ghp_/AKIA/etc.) redacted via
  `redactSecrets`/`redactProperties` upstream of `logger.logUsage` (`telemetry.ts:278-316`), so
  the batched POST (`postBatch`) ships already-redacted data. Gated on both
  `vscode.env.isTelemetryEnabled` AND `agiWorkforce.telemetryEnabled` (default false).
- **Path containment**: every write path routes through `@agiworkforce/utils resolveContained`:
  `patchEngine.ts:420` (apply, incl. new-file create at :481), `agentMode/agentUI.ts:134`,
  `pathSafety.ts safeResolveWorkspacePath` (with symlink-realpath re-check + sensitive re-check).
  Adjacent-dir bypass and absolute/`../` inputs are rejected. **Apply-of-remote-diff is
  containment-safe — severity ceiling does NOT flip to P0.**
- **Sensitive-file denylist**: `@file` injection (`ChatStateManager.ts:737,751`), inline
  completions (`inlineCompletionProvider.ts:117` + name-based pattern), patch new-file create
  (`patchEngine.ts:451`, F-04). Resolved-path re-check defends symlink/alias matches.
- **Prompt-injection defense (VSCODE-06)**: `@file` content wrapped in `<file_content>` tags,
  open+close tags escaped, injected as USER role (not system), with an explicit "treat as DATA
  ONLY" system instruction (`ChatStateManager.ts:711-814`). Caps: 5 refs/turn, 5KB/file,
  20KB total, binary skip.
- **Webview CSP**: nonce-only `script-src`/`style-src` + `default-src 'none'`, CSPRNG nonce
  (`webviewContent.ts getNonce`). Assistant markdown rendered through
  `webview/render.ts` = markdown-it (`html:false`) → DOMPurify (FORBID svg/iframe/script/style,
  URI regexp https/mailto only, `ALLOW_DATA_ATTR=false`) + link-hardening hook. `renderAssistant`
  (webviewContent.ts:1306) uses `window.agiRender`; fallback is plain HTML-escape. No XSS hole.
- **IPC validation (PR-3C/F-11)**: every webview→ext message Zod-validated via
  `parseWebviewMessage` in BOTH `sidebarProvider.ts:91` AND `chatEditorPanel.ts:120` (twins
  consistent). Bridge inbound frames Zod-validated via `parseBridgeInbound` (`desktopBridge.ts:448`).
- **Desktop bridge (VSCODE-03 / PR-4A)**: 0600 token file with TOCTOU-safe open-then-fstat
  (`desktopBridge.ts:47-92`, B9), auth handshake before any outbound, inbound+outbound
  message-type allowlists, `desktop:run-command` restricted to `ALLOWED_BRIDGE_COMMANDS` with NO
  forwarded args, 50ms debounce + 30/min rate limit, `desktop:open-file` confined to workspace
  folders with separator-aware containment.
- **Terminal command safety (VSCODE-04/F-14)**: LLM-suggested commands pass an allowlist of
  first-tokens, reject shell metacharacters, strip ANSI + invisible-unicode, block destructive
  inner patterns, require modal confirmation; `runCommand` refuses in untrusted workspaces.
- **Agent edits (VSCODE-02 / PR-2B F-03)**: untrusted-workspace modal gate; sensitive-category
  paths (.vscode/.github/configs) ALWAYS require per-file diff review even under "Accept All".
- **execFile**: `contextBuilder.ts` (`git status/diff`), `checkpointManager.ts` (`git stash …`),
  `commandSetup.ts` all use argv arrays — no shell-string interpolation, no injection.

Residual concerns are minor (see issues): trusted-MarkdownString interpolation of server
strings, and the weak Math.random nonce in InviteCodeModal.

---

## AI-slop assessment

Low. This does NOT read as machine-generated filler:
- No fabricated/hardcoded data rendered to users. All `Math.random` uses are
  ID/nonce/invite-code generation, and the codebase explicitly migrated the security-relevant
  ones to CSPRNG (`conversationStore.ts:75`, `modelMetrics.ts:246` note Math.random avoidance);
  `webviewContent.ts:26` documents why it uses Node CSPRNG.
- No stub functions returning placeholder data to the chat UI (the cloud stubs return explicit
  error objects, surfaced as errors — honest, not silent fakes).
- No hallucinated VS Code APIs; shell-integration types are declared locally with runtime
  feature-detection (`terminalProvider.ts:380-492`).
- Duplicated logic is minimal and mostly justified (the @file-ref resolver appears in both
  `ChatStateManager.ts:724` and `chatEditorPanel.ts:332`/`agentLoop.ts` — a real DRY opportunity,
  see P3).

---

## Broken / half-built features (with evidence)

1. **History duplication (CONFIRMED functional bug).** `ChatStateManager._handleSendMessage`
   `onDone` calls `conversationStore.create(...)` on EVERY assistant turn
   (`ChatStateManager.ts:858`). `create()` always mints a NEW id (`conversationStore.ts:75`) and
   `save()` upserts by id (`:43-50`), so a 3-turn sidebar chat produces 3 separate History-tree
   entries (growing-prefix duplicates of the same conversation) instead of one. Pruned only at
   MAX_CONVERSATIONS. P2.
2. **Chat-editor-panel does not persist history at all.** Unlike the sidebar, `chatEditorPanel.ts`
   never calls `conversationStore` — full-screen-chat sessions never appear in History. Inconsistent
   with the sidebar (which over-persists). P2 (parity gap).
3. **Invite-code + waitlist UI is non-functional by design.** `lib/waitlistService.ts` always
   returns failure; `InviteCodeModal` always shows an error on submit. Intentional per v1 lock,
   but a user reaching the "Cloud features" modal can never succeed. P2 (label/UX: the modal
   reads as functional). 
4. **`useProviderStream` path always throws.** `streamChatCompletionViaProvider` (`api.ts:777`).
   Off by default; if a user flips the setting, the @agi participant errors. Fail-closed; P3.
5. **File-attach via plus-menu**: `openFilePicker` (`ChatStateManager.ts:478`) IS wired (adds to
   context panel) — the stale parity-doc claim that it's "not end-to-end wired" is outdated. The
   richer drag-drop/paste `attachFiles` path (`:497`) is also wired with sanitized writes.

---

## Severity-ranked issues

### P1
- **Brand-name lock violation pre-Marketplace.** `package.json:displayName = "AGI Workforce"`;
  the V5 brand lock requires public brand "AGI". Ships in the Marketplace listing + activity-bar
  title. Fix: set `displayName` (and audit user-facing "AGI Workforce" strings) to "AGI" before
  publishing. (P1 only as a launch-blocker for the Marketplace listing; not a code defect.)
  Evidence: `apps/extension-vscode/package.json` displayName.

### P2
- **History duplication per turn.** `features/sidebar-webview/ChatStateManager.ts:858` +
  `data/conversationStore.ts:75,43-50`. Fix: create the conversation once per chat session (store
  its id on the state manager) and `addMessage`/upsert thereafter, or reuse the existing id.
- **Chat-editor-panel has no conversation persistence.** `providers/chatEditorPanel.ts` (no
  `conversationStore` use). Fix: route persistence through the same store as the sidebar.
- **Cloud invite/waitlist modal always fails.** `lib/waitlistService.ts:12-23` +
  `features/cloud-bridge/InviteCodeModal.ts`. Fix: gate the entry points behind a "coming soon"
  state, or clearly label the modal as waitlist-pending so users don't hit a dead submit.
- **Desktop-bridge TCP transport same-user reachable.** `features/desktop-bridge/desktopBridge.ts:13,223`
  (`ws://127.0.0.1:8787`). Documented PR-4A migration to Unix socket / named pipe is pending.
  Mitigated today by 0600 token + auth handshake + allowlists + rate limit. Fix: land the
  socket transport behind `desktopBridge.transport`.

### P3
- **Trusted MarkdownString interpolates server strings.** `chatParticipant.ts:429-436`
  (`paywallMd.isTrusted = true`) interpolates `err.feature`/`err.reason`/`err.requiredTier`
  (from the paywall API response) into markdown that can render `command:` links. URL params are
  encodeURIComponent'd, but the link text and body are not escaped. Source is the authenticated
  AGI API over TLS (low practical risk), but a compromised/MITM'd backend could inject a clickable
  command link. Fix: escape interpolated fields or drop `isTrusted` for this card.
- **Weak nonce in InviteCodeModal.** `features/cloud-bridge/InviteCodeModal.ts:16-21` uses
  `Math.random` for the CSP nonce while the rest of the codebase uses CSPRNG and explicitly
  documents Math.random as predictable. Mitigated by `default-src 'none'` + nonce-only CSP. Fix:
  use `crypto.randomBytes` like `modelMetrics.ts:246`.
- **@file-ref resolver duplicated.** `ChatStateManager.ts:724`, `chatEditorPanel.ts:332`,
  `agentMode/agentLoop.ts:47-67`. DRY opportunity — extract to a shared helper to avoid the
  security caps drifting between copies.
- **`postBatch` gate asymmetry.** `telemetry.ts:201-203` gates only on `vscode.env.isTelemetryEnabled`,
  not also `isExtensionTelemetryEnabled()`. Safe because events only enter the batcher via the
  gated logger; tighten for defense-in-depth.
- **Stale anchor docs.** `docs/surfaces/vscode-extension.md` claims `agi-workforce.*` settings
  namespace and a flat `sidebar/ history/ contextFiles/` layout; actual is `agiWorkforce.*`
  (camelCase) and a `features/` tree. The `reports/frontend-parity-r1/surfaces/vscode.md` claim
  that file-attach "is not end-to-end wired" is outdated. Doc-only cleanup.

---

## Open questions / uncertainty

1. Did NOT run the test suite or build (read-only + no-builds constraint). Test green status is
   inferred from infra + breadth, not observed.
2. The `services/` / web backend that `utils/api.ts` (`/api/llm/v1`, `/api/auth/me`) and the
   desktop bridge talk to are out of this slice — could not verify the server contracts
   (paywall payload shape, tier schema) beyond the client-side Zod (`protocol/apiResponses.ts`).
3. Whether the History-duplication bug is masked in practice by MAX_CONVERSATIONS pruning or
   by some upstream caller behavior I did not trace exhaustively; the create-per-turn code path
   itself is unambiguous.
4. `chatEditorPanel`'s lack of persistence may be intentional (ephemeral panel) — flagged as a
   parity gap, not asserted as a defect with certainty.
5. Did not exhaustively read every line of `commandSetup.ts` (1479 LOC) and `webviewContent.ts`
   (2001 LOC); covered their security-relevant and entry sections plus targeted greps. No
   material issue surfaced, but full line coverage of those two largest files is not claimed.
