# Inventory: `apps/extension-vscode` (VS Code extension)

Audited commit: `e15df56e3` (branch `compliance/dpdp`, tree clean at audit start).
Surface AGENTS.md read: `apps/extension-vscode/AGENTS.md`.
Methodology: read every `contributes.*` entry in `package.json`, traced each
command to its `registerCommand` handler, ran the real test suite (`npx
vitest run`, 862 tests), and read the source behind every claim below.
File:line citations are given for every non-trivial claim.

---

## 0. Headline finding: the extension's own test suite is currently red

**NEEDS_VALIDATION / BROKEN (test-coverage regression, not necessarily a live bug).**

`cd apps/extension-vscode && npx vitest run` → **17 failing / 862 passing** (5
failed files) at the audited commit. This is reproducible and stable (each
failing file reproduces in isolation, not just under full-suite ordering).

Root cause, traced to source:

- `apps/extension-vscode/src/platform/config.ts:191-196` — `Config.model()`
  was changed from `get<string>('model', DEFAULTS.model)` (reads VS Code's
  merged/workspace-inclusive config) to `getUserScoped<string>('model',
DEFAULTS.model)` (reads only `inspect(key).globalValue`, explicitly to stop
  a checked-out repo's `.vscode/settings.json` from silently moving a user's
  Local/BYOK/Managed-Cloud trust boundary — see the added comment at
  `config.ts:192-194`). This is a real, well-reasoned security hardening
  change, confirmed via `git show 1e858a7f1 -- apps/extension-vscode/src/platform/config.ts`
  (commit `1e858a7f1`, "feat: integrate ecosystem release readiness", 2026-08-13
  — two days before this audit date).
- The test helpers that stub VS Code configuration for this exact code path —
  `mockConfiguredModel()` in `src/__tests__/chatParticipant.test.ts:64-73` and
  `configuredModel()` in `src/__tests__/usageMeterTrustBoundary.test.ts:96-105`
  — mock only `getConfiguration().get()`. Neither was updated to also stub
  `.inspect()`. Under the new `getUserScoped` code path, `.inspect()` returns
  `undefined` in these tests, so `Config.model()` silently falls back to the
  default (`'auto'`) instead of the model the test believes it configured.
- Effect: 6 tests in `chatParticipant.test.ts` (local-model authority
  resolution — CLI-discovered Ollama/LM Studio models, provider-mismatch
  rejection, custom-instructions/memory context boundaries) and 6 tests in
  `usageMeterTrustBoundary.test.ts` (SIX-02 — the Local/BYOK/Managed-Cloud
  usage-meter pill) now fail with assertions like `expected 'user-api-key' to
be 'unbounded'` and `runtime.startThread` called with `model: 'auto'`
  instead of the intended local-model id.
- Additionally: `panelPaletteConsistency.test.ts` fails a header
  self-documentation regex against `webviewContent.ts`'s current comment
  (cosmetic doc drift, not functional). Three `webviewContent.snapshot.test.ts`
  cases fail on a locked HTML/CSS snapshot that is stale against a real,
  shipped accessibility improvement (added `role="option"`,
  `aria-selected`, `aria-activedescendant` on the `@mention` dropdown) —
  cosmetic test debt, not a regression.

**Why this matters for the audit bar:** this is exactly the class of thing
CLAUDE.md calls out — "Do not mark work complete from build success alone …
run surface checks." The production `getUserScoped` change itself looks
correct on inspection (§3 below traces the full `resolveParticipantModel` /
`pushUsageMeter` logic and it is internally consistent), but **the safety net
that would catch a regression in local-model chat-participant authority or in
Local-vs-BYOK trust-boundary labeling is currently blind** on this commit —
6+6 tests are failing for a mock-drift reason unrelated to the thing they
were written to catch, so a second, real regression landing in the same area
right now would not be caught by CI. This should be fixed (update the two
mocks to also stub `.inspect()`) before treating this area as verified.

Reproduction:

```
cd apps/extension-vscode
npx vitest run src/__tests__/chatParticipant.test.ts
npx vitest run src/__tests__/usageMeterTrustBoundary.test.ts
```

---

## 1. `package.json contributes` — full enumeration and verification

### 1.1 Commands (69 declared, all verified)

Every command in `contributes.commands` is registered at runtime, and none
are stubs — confirmed both by direct source reading and by a real,
passing, non-trivial test: `src/__tests__/commandParity.test.ts` actually
calls `activate()` with a mocked `vscode.commands.registerCommand`, and
asserts (a) every declared command is registered, (b) every registered
command is declared (no hidden/uncontributed commands), (c) no duplicate
registrations, and (d) re-activation (simulated reload) still holds parity.
Ran it: **6/6 passing** (`npx vitest run src/__tests__/commandParity.test.ts`).

Registration sites, cross-checked against `package.json` `contributes.commands`:

| Command                                                                                              | Registered in                                  | Does real work?                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agi-workforce.chat`                                                                                 | `core/commandSetup.ts:412`                     | Yes — opens native VS Code Chat (`workbench.action.chat.open`) or falls back to the sidebar                                                                                                                                                                                     |
| `agi-workforce.openChatInEditor`                                                                     | `core/commandSetup.ts:428`                     | Yes — `ChatEditorPanel.createNew` (real independent webview + `ChatStateManager`)                                                                                                                                                                                               |
| `agi-workforce.openSettings`                                                                         | `core/commandSetup.ts:254`                     | Yes — `SettingsPanel.createOrShow`                                                                                                                                                                                                                                              |
| `agi-workforce.openAgentConfig`                                                                      | `core/commandSetup.ts:257`                     | Yes — opens `~/.agiworkforce/config.toml` (`features/config/agentConfig.ts:26`), creating it 0600 if absent                                                                                                                                                                     |
| `agi-workforce.restartLocalRuntime`                                                                  | `core/commandSetup.ts:273`                     | Yes — `LocalRuntimePool.restartAll()`, real process respawn                                                                                                                                                                                                                     |
| `agi-workforce.agentMode`                                                                            | `core/commandSetup.ts:439`                     | Yes — delegates to `setAgentMode`                                                                                                                                                                                                                                               |
| `agi-workforce.explain`/`fix`/`refactor`/`generateTests`/`docs`                                      | `core/commandSetup.ts:443-461`                 | Yes — `runInlineCommand()`, real LLM call + editor edit                                                                                                                                                                                                                         |
| `agi-workforce.codeReview`                                                                           | `core/commandSetup.ts:463`                     | Yes — `diagnosticsProvider.reviewCode`, populates a real `vscode.DiagnosticCollection`                                                                                                                                                                                          |
| `agi-workforce.signIn`/`signOut`                                                                     | `core/commandSetup.ts:510,527`                 | Yes — real device-auth flow (`features/account-auth/deviceAuth.ts`)                                                                                                                                                                                                             |
| `agi-workforce.setApiKey`/`clearApiKey`                                                              | `core/commandSetup.ts:534,564`                 | Yes — `SecretStorage` read/write                                                                                                                                                                                                                                                |
| `agi-workforce.selectModel`                                                                          | `core/commandSetup.ts:577`                     | Yes — tier-gated QuickPick, writes config                                                                                                                                                                                                                                       |
| `agi-workforce.openConversation`/`deleteConversation`/`refreshConversations`/`showSessionsHistory`   | `core/commandSetup.ts:634-694`                 | Yes — real app-server-backed thread list/archive                                                                                                                                                                                                                                |
| `agi.git.status`/`agi.git.diff`/`agi.git.commit`                                                     | `core/commandSetup.ts:752-833`                 | Yes — `execFile('git', …)` (not `terminal.sendText`, deliberately, per the PR-3B comment at `commandSetup.ts:746-751` — avoids shell-metacharacter injection); workspace-trust gated; `git.commit` prefers the built-in `vscode.git` extension API and falls back to `execFile` |
| `agi.test.run`                                                                                       | `core/commandSetup.ts:835`                     | Yes — detects package manager/lockfile and runs in a real terminal; workspace-trust gated                                                                                                                                                                                       |
| `agi-workforce.resetTokenCounter`/`showTokenBreakdown`                                               | `data/tokenCounter.ts:171,179`                 | Yes                                                                                                                                                                                                                                                                             |
| `agi-workforce.sendFeedback`                                                                         | `core/commandSetup.ts:697`                     | Yes — opens a prefilled GitHub issue URL                                                                                                                                                                                                                                        |
| `agi-workforce.runCommand`/`explainTerminal`/`suggestCommand`                                        | `providers/terminalProvider.ts:583,610,654`    | Yes — real terminal + shell-integration output capture, with a positive command allowlist (`terminalProvider.ts:52-75`) and destructive-flag denylist for LLM-suggested commands                                                                                                |
| `agi-workforce.explainError`/`askAboutCode`                                                          | `providers/errorExplainerProvider.ts:34,37`    | Yes — `explainError` reads real `vscode.languages.getDiagnostics()` for the current line/selection, not a canned message                                                                                                                                                        |
| `agi-workforce.newConversation`                                                                      | `core/commandSetup.ts:872`                     | Yes                                                                                                                                                                                                                                                                             |
| `agi-workforce.modelDashboard`                                                                       | `core/commandSetup.ts:877`                     | Yes — `ModelMetricsPanel.createOrShow`                                                                                                                                                                                                                                          |
| `agi-workforce.accept*`/`reject*`Diff(s)/Batch/Global                                                | `core/commandSetup.ts:352-397`                 | Yes — real `DiffDecorationProvider` session map, not a placeholder                                                                                                                                                                                                              |
| `agi-workforce.showOriginalContext`                                                                  | `core/commandSetup.ts:398`                     | Yes — opens VS Code's **native** `vscode.diff` side-by-side view (`integrations/patchEngine.ts:377`)                                                                                                                                                                            |
| `agi-workforce.showPatchLogs`                                                                        | `core/commandSetup.ts:407`                     | Yes — real `OutputChannel`                                                                                                                                                                                                                                                      |
| `agi-workforce.bridgeReconnect`                                                                      | `features/desktop-bridge/desktopBridge.ts:572` | Yes                                                                                                                                                                                                                                                                             |
| `agi-workforce.addToContext`/`removeFromContext`/`clearContext`/`refreshContext`/`mentionFileInChat` | `core/commandSetup.ts:291-342`                 | Yes — real path-traversal/symlink/sensitive-filename validation (`validateWorkspaceContextFile`) before any file enters context                                                                                                                                                 |
| `agi-workforce.openActionSheet`                                                                      | `core/commandSetup.ts:881`                     | Yes — full QuickPick action sheet (attach/mention/clear/history/model/effort/mode/account)                                                                                                                                                                                      |
| `agi-workforce.showSubsystemHealth`                                                                  | `core/subsystemHealth.ts:39`                   | Yes — registered outside `commandSetup.ts` by design (see comment at `commandSetup.ts:61-64`); avoided in the registry to prevent double-registration                                                                                                                           |
| `agi-workforce.showTierStatus`                                                                       | `core/commandSetup.ts:1072`                    | Yes — **intentional alias** for `showAccountUsage` (kept for old keybindings/installs, per its own comment)                                                                                                                                                                     |
| `agi-workforce.setAgentMode`/`setAgentEffort`/`cycleAgentMode`                                       | `core/commandSetup.ts:1080,1127,1321`          | Yes — routed through `setAgentModeWithConsent`/`setAgentEffortWithConsent` (real modal risk-consent gate, §4)                                                                                                                                                                   |
| `agi-workforce.memory*` (5 commands)                                                                 | `core/commandSetup.ts:1177-1302`               | Yes — real workspace-scoped `Memento` storage (`memory/memoryStore.ts`)                                                                                                                                                                                                         |
| `agi-workforce.openInviteCodeModal`                                                                  | `core/commandSetup.ts:1313`                    | **Compatibility shim, not dead** — its own comment explains: the old invite/waitlist modal was retired (2026-06-27 founder decision, matches CLAUDE.md); this id now just calls `agi-workforce.signIn` so any stale keybinding/menu reference still does something real         |
| `agi-workforce.showAccountUsage`                                                                     | `core/commandSetup.ts:1342`                    | Yes — large, real QuickPick: identity, trust-boundary review, session token/cost counters, cloud quota %, subscription-status warning, sign-in/out, Web handoffs for billing/connectors/teams                                                                                   |
| `agi-workforce.showOnboarding`/`openWebTasks`                                                        | `core/commandSetup.ts:1538,1544`               | Yes                                                                                                                                                                                                                                                                             |
| `agi-workforce.mentionFileFromProject`                                                               | `core/commandSetup.ts:1553`                    | Yes                                                                                                                                                                                                                                                                             |

**No contributed-but-unimplemented commands. No registered-but-uncontributed
commands** (test enforces both directions). **No duplicate registrations**
(test enforces this too, and a per-command `register()` wrapper at
`commandSetup.ts:226-234` isolates one bad registration from breaking every
later one in the same array literal — a real defensive pattern, not just a
comment).

One near-miss worth flagging: `SidebarProvider.rewindLast()`
(`features/sidebar-webview/sidebarProvider.ts:183-185`) and
`ChatStateManager.rewindLast()` (`ChatStateManager.ts:1451-1456`) are **DEAD
CODE** — grepped the whole webview protocol
(`protocol/webviewMessages.ts`) and `webviewContent.ts` for any `rewind`
message type or UI trigger and found none; no command calls
`sidebarProvider.rewindLast()` either. If it were reachable, it would
correctly post an honest error (`'Rewind is unavailable until the local
runtime exposes turn rollback.'`) rather than pretend to work, so this is
inert-but-honest dead code, not a deceptive stub. This matches the existing
tracker row `GAP-284` ("'Rewind' action exists but is permanently
disabled/stubbed") — confirmed independently here.

### 1.2 Views / viewsContainers / menus / keybindings / configuration / activationEvents

- **1 activity-bar container**, `agi-workforce-sidebar` (`package.json:526-534`),
  with icon `media/icon-sidebar.svg` — confirmed the file exists.
- **4 views** under it (`package.json:535-564`): a `webview` (`agi-workforce.sidebar`,
  the chat), and 3 `tree` views — `agi-workforce.conversations` (History),
  `agi-workforce.contextPanel` (Context, collapsed by default), `agi-workforce.memory`
  (Memory, collapsed by default). All 3 tree providers are real
  `vscode.TreeDataProvider` implementations registered in
  `core/chatSetup.ts:43-60` (`SidebarProvider`, `ConversationTreeProvider`,
  `ContextPanelProvider`, `MemoryTreeProvider`) — not placeholders.
- **3 `viewsWelcome` entries** (`package.json:565-578`) with real command
  links (`agi-workforce.chat`, `agi-workforce.addToContext`,
  `agi-workforce.memory.create`), all of which are registered commands per §1.1.
- **Menus**: `view/item/context` (6 entries — conversation open/delete,
  context-file remove/mention, memory edit/delete), `view/title` (6 entries),
  `editor/context` (9 entries, most gated on `editorHasSelection`),
  `commandPalette` (4 entries with `when` clauses). All reference real,
  registered commands.
- **11 keybindings** (`package.json:854-929`). Two chords are deliberately
  overloaded by `when` clause on the _same_ physical key
  (`Ctrl/Cmd+Shift+A` = open chat when `!agi-workforce.hasDiff`, accept
  current diff when `agi-workforce.hasDiff`; `Escape` = reject current diff
  when `agi-workforce.hasDiff`, otherwise untouched) — this is intentional
  per the comment at `commandSetup.ts:140-148` about the earlier silent
  no-op bug (`warnNoDiffUnderCursor`), and both directions are now covered by
  `src/__tests__/diffKeybindingCommands.test.ts` and
  `keybindingContextParity.test.ts`.
- **24 configuration properties** under `agiWorkforce.*`
  (`package.json:712-852`). All of them round-trip through
  `platform/config.ts`'s single typed `MutableConfigValues` map — confirmed
  `SETTINGS_PANEL_SETTING_KEYS` in `config.ts` and the Zod schema in
  `features/settings/settingsProtocol.ts:60-81` are kept in lock-step (no
  orphaned or unreachable setting). Two settings deserve explicit note:
  - `agiWorkforce.agent.planMode` (`package.json:790-795`) — marked
    `deprecationMessage` and its own description says "Deprecated — use
    agiWorkforce.agent.mode instead." This is an honestly-labeled legacy
    field, not a silent dead toggle.
  - `agiWorkforce.currentTier` (`package.json:846-851`) — `readOnly: true`,
    populated on activation, purely diagnostic.
  - `agiWorkforce.cliPath` and `agiWorkforce.apiEndpoint`,
    `agiWorkforce.model`, `agiWorkforce.desktopBridge.*`,
    `agiWorkforce.autoApplyFixes`, `agiWorkforce.telemetryEndpoint` are all
    listed in `capabilities.untrustedWorkspaces.restrictedConfigurations`
    (`package.json:50-58`) — i.e. VS Code itself is told these cannot be
    overridden from an untrusted workspace, and `Config.ts`'s
    `getUserScoped()` (§0 above) is the runtime enforcement of the same
    boundary for `model`/`apiEndpoint`/`desktopBridge.*`.
- **3 activationEvents**: `onStartupFinished`, `onChatParticipant:agiworkforce.agi`,
  `onView:agi-workforce.sidebar` (`package.json:41-45`) — all three are
  legitimate triggers for real registration paths (`extension.ts:activate`,
  `registerChatParticipant`, `SidebarProvider.resolveWebviewView`).
- **1 walkthrough**, `agiWorkforce.gettingStarted`, 4 real steps each backed
  by a non-empty markdown file under `media/walkthrough/` and a real
  `completionEvents: onCommand:*` tied to a registered command
  (`agi-workforce.chat`, `openWebTasks`, `openSettings`, `showAccountUsage`).
- **1 `chatParticipants` entry**, `agiworkforce.agi` (`@agi`), with 6 slash
  commands (`explain`/`fix`/`refactor`/`tests`/`docs`/`model`) — all handled
  in `buildUserMessage()` (`chatParticipant.ts:100-137`); none are
  unimplemented no-ops.

---

## 2. Is the webview a wrapped iframe, or genuinely IDE-native?

**Genuinely IDE-native. Confirmed no `<iframe src="http…">` anywhere** (grepped
`webviewContent.ts` and `chatEditorPanel.ts`) — the chat webview is
locally-generated HTML/CSS/JS (`getWebviewContent()`,
`sidebar-webview/webviewContent.ts`, 4,349 lines) message-passing to the
extension host via `postMessage`, with every inbound message Zod-validated
(`protocol/webviewMessages.ts` — `parseWebviewMessage`) so a compromised
webview cannot spoof e.g. `{type:'setMode', payload:{mode:'bypass'}}` (per
the comment at `sidebarProvider.ts:96-98`, and this is regression-tested —
`GAP-011`/`agentControlMutationBoundary.test.ts`).

Native VS Code API surface actually used (not reimplemented in HTML), grepped
and confirmed live:

| Native API                                                                      | Where                                                                                                                                                      |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vscode.chat.createChatParticipant`                                             | `features/chat-participant/chatParticipant.ts:672` — real `@agi` in VS Code's own Chat view, with `ChatResponseStream`, `ChatFollowup`, `stream.button()`  |
| `vscode.languages.registerCodeActionsProvider`                                  | `core/providerSetup.ts:23`                                                                                                                                 |
| `vscode.languages.registerHoverProvider`                                        | `core/providerSetup.ts:26`                                                                                                                                 |
| `vscode.languages.registerCodeLensProvider` (×2 — actions + diff accept/reject) | `core/providerSetup.ts:39,95`                                                                                                                              |
| `vscode.languages.registerInlineCompletionItemProvider`                         | `core/providerSetup.ts:79`                                                                                                                                 |
| `vscode.languages.createDiagnosticCollection`                                   | `providers/diagnosticsProvider.ts:17` — real Problems-panel entries from Code Review, not a custom panel                                                   |
| `vscode.window.registerWebviewViewProvider`                                     | `core/chatSetup.ts:43`                                                                                                                                     |
| `vscode.window.registerTreeDataProvider` (×3)                                   | `core/chatSetup.ts:46,53,60`                                                                                                                               |
| `vscode.commands.executeCommand('vscode.diff', …)`                              | `integrations/patchEngine.ts:377` — native side-by-side diff for "Show Original Context"                                                                   |
| `vscode.extensions.getExtension('vscode.git')`                                  | `core/commandSetup.ts:795` — real interop with the built-in Git extension for `agi.git.commit`, falling back to `execFile` only if that API is unavailable |

So the split reported in `shared-packages.md` is confirmed: `features/chat-participant/chatParticipant.ts`
is the native-Chat-view integration, and `features/sidebar-webview/` (plus
`providers/chatEditorPanel.ts` for the full-tab variant) is the custom
webview. Both drive the **same** `ChatStateManager`
(`features/sidebar-webview/ChatStateManager.ts`, 2,481 lines) for the webview
paths, while the native `@agi` participant talks to the local runtime
directly inside `chatParticipant.ts` itself (a separate, parallel
implementation of the turn lifecycle — see §3). This is a real architectural
split, not a documentation fiction.

---

## 3. Backend transport: two genuinely different paths, correctly scoped

**(a) Developer-session / agent path — CLI app-server over JSON-RPC on
stdio, not HTTP.** `integrations/localRuntimeClient.ts` spawns the `agi`
binary (`node:child_process.spawn`, `localRuntimeClient.ts:1`) per workspace
root (`integrations/localRuntimePool.ts:30-44`, one process reused by every
chat surface in that workspace) and speaks a versioned JSON-RPC protocol
(`SUPPORTED_PROTOCOL_VERSION = 7`, `MINIMUM_SUPPORTED_CLI_VERSION = 1.7.1`,
`localRuntimeClient.ts:26-28`) with full Zod schemas for every
request/response/notification shape (threads, turns, approvals, tool
execution, MCP status). This is the transport for `@agi` chat, the sidebar,
`Open Chat in Editor`, and Explain/Fix/etc. **agent-mode** execution. Pending
requests are tracked in a `Map` keyed by JSON-RPC id
(`localRuntimeClient.ts:344-370`), so multiple in-flight requests — and by
extension multiple concurrently open chat surfaces / threads in one workspace
— are genuinely supported by the transport, not serialized.

**(b) Cloud-utility path — direct HTTPS.** `utils/api.ts` (916 lines) is a
hand-rolled OpenAI-compatible `/chat/completions` SSE client
(`https://agiworkforce.com/api/llm/v1` by default,
`utils/api.ts:120`) used only for the narrower "editor utility" commands that
don't need a full agent turn: Explain Selection, Fix, Refactor, Generate
Tests, Generate Docs, Code Review, Explain Error, Ask About Code, Suggest
Command, Explain Terminal Output, and inline (ghost-text) completions. This
is architecturally correct and is explicitly called out as such in the
README (`README.md:126`: "API base URL for cloud-backed editor utilities")
and in code comments (e.g. `agentModeConsent` is never touched by this path;
`agiWorkforce.agent.thinking`'s own description says "This setting does not
affect local @agi, sidebar, or editor developer sessions,"
`package.json:824-828`).

**Local/BYOK/Managed-Cloud trust boundary**: enforced, not just documented.

- `TIER_ORDER`/`tierAtLeast()` in `integrations/tierResolver.ts` treat
  `local` and `byok` as unpaid peers (rank 0), never let an unpaid tier reach
  a paid one, and default fail-closed to `byok` — all locked by
  `src/__tests__/trust-boundary.test.ts` (ran it: **19/19 passing**, verified
  independently — this is not a stub test file).
- `isValidApiEndpoint` (mirrored in `trust-boundary.test.ts:93-104` off
  `utils/api.ts`) rejects non-HTTPS non-localhost endpoints and unknown
  hosts — real SSRF/exfiltration guard, not aspirational.
- Switching a live `@agi` participant thread across a model/provider
  boundary starts a **new** thread rather than silently forwarding the
  transcript (`chatParticipant.ts:566-570`: "Provider or model boundary
  changed. A new developer session was started without forwarding the
  earlier transcript."). `assertRequestedThreadAuthority` /
  `sameThreadAuthority` (`chatParticipant.ts:231-279`) enforce this at
  runtime, not just in a comment.
- `platform/surface.ts:29-33` throws at module load if VS Code is ever
  reclassified out of `DeveloperSessionSurface` — i.e. a refactor that tried
  to silently start syncing VS Code chat into the Web/Mobile/Desktop
  consumer chat history would crash the extension on activation, not
  silently ship. `src/__tests__/surface.test.ts` locks this.
- **Caveat (see §0):** the mechanism that classifies "is this configured
  model Local, BYOK, or Managed Cloud" for the usage-meter pill
  (`data/usageMeter.ts`, `ChatStateManager.pushUsageMeter` at
  `ChatStateManager.ts:1371-1405`) is currently **not exercised by a passing
  test** for the CLI-discovered-local-model case, for the reason in §0. Code
  reading says the logic is correct; it is unverified right now.

**No local/cloud selector UI as such** — the boundary is _implied_ by which
model you pick (catalog model → BYOK/Managed per tier; CLI-discovered
Ollama/LM Studio id → Local), not an explicit "Local vs Cloud" toggle. The
header pill and Account & Usage panel (`showAccountUsage`,
`commandSetup.ts:1342`) are the only places the resolved boundary is shown to
the user before sending.

---

## 4. Benchmark checklist vs. Claude Code / Codex VS Code extensions

Legend: COMPLETE / PARTIAL / UI_ONLY / BACKEND_ONLY / MOCKED / DEAD / BROKEN /
HIDDEN / DUPLICATED / NEEDS_VALIDATION. Cross-references to the existing
`audit/ui-gaps.csv` `extension-vscode` rows (38 rows, `GAP-011`/`012`,
`GAP-124`–`138`, `GAP-284`–`299`, `GAP-339`–`342`) are given where this
inventory independently confirms a tracked gap; new observations are marked
**(new)**.

| Item                               | Classification                                             | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity-bar icon                  | COMPLETE                                                   | `package.json:526-534`, `media/icon-sidebar.svg` present                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Sidebar panel                      | COMPLETE                                                   | `SidebarProvider` (§1.2, §2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Full editor tab                    | COMPLETE                                                   | `agi-workforce.openChatInEditor` → `ChatEditorPanel.createNew`, independent webview panel per tab, numbered ("AGI Chat 2", …) (`chatEditorPanel.ts:40-47`)                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Multiple concurrent agent sessions | **PARTIAL**                                                | Multiple `ChatEditorPanel` instances are tracked in a `Set` (`chatEditorPanel.ts:19`) and each owns its own `ChatStateManager`/thread; the shared `LocalRuntimeClient` per workspace uses an id-keyed pending-request map that supports concurrent in-flight JSON-RPC calls (§3a). However there is **no session list/browser UI** across tabs+sidebar+editor-tabs in one place — matches tracked `GAP-286`/`GAP-287` (session history lives in a separate TreeView; no unified Local/Web session browser), confirmed here                                                          |
| Conversation history               | COMPLETE                                                   | `agi-workforce.conversations` TreeView (`ConversationTreeProvider`), backed by real app-server thread list, open/delete/refresh all wired (§1.1)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| New task / new conversation        | COMPLETE                                                   | `agi-workforce.newConversation` (`commandSetup.ts:872`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Model selector                     | COMPLETE                                                   | `agi-workforce.selectModel` — tier-gated grouped QuickPick (`modelConstants.ts:155-255`, `buildGroupedQuickPickItems`), also in webview `<select>` and status bar                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Reasoning effort                   | **PARTIAL** vs Codex                                       | 4 levels (low/medium/high/max, `package.json:813-823`) vs Codex's 5 (Light/Medium/High/Extra High/Ultra, per `shots-codex-vscode-ios.md:122`). One control surface (QuickPick/webview), not Codex's dual dropdown+settings-multiselect. Two real modal risk-consent gates when Max is combined with Bypass mode (`agentModeConsent.ts:98-115`) — this exceeds Codex's single confirmation for the equivalent compound-risk case                                                                                                                                                     |
| Agent mode                         | COMPLETE                                                   | `ask`/`auto`/`plan`/`bypass`, real consent-gated writes (§ below), matches tracked `GAP-011`/`GAP-124` as **resolved** (confirmed independently: `agentModeConsent.ts` is the sole write path, versioned consent, fail-closed on unconfirmed bypass, reconciles raw-Settings edits)                                                                                                                                                                                                                                                                                                 |
| Planning                           | **PARTIAL**                                                | `Config.agentMode() === 'plan'` makes the `@agi` participant hold off on execution and render a plan via `renderPlanMarkdown()`/`update_plan` tool events (`chatParticipant.ts:357-362`, `planVisualization.ts`); approval is a **typed chat reply** ("proceed"), not a structured approve/reject/edit UI                                                                                                                                                                                                                                                                           |
| Plan review                        | PARTIAL                                                    | Same as above — plan renders as an escaped Markdown checklist (`planVisualization.ts:57-73`, injection-safe: `escapeMarkdownText`), but review is conversational, not a dedicated plan document with inline comments (cf. Claude Code's "Plan opens as a full Markdown doc; inline comments give feedback," `claude-code-chrome-ide.md:159`)                                                                                                                                                                                                                                        |
| Plan editing                       | **HIDDEN/absent**                                          | No UI to edit plan steps before approval; only reply-based approve. **(new)**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Workspace context                  | COMPLETE                                                   | `data/workspaceIndexer.ts`, `data/contextBuilder.ts`, `Context` TreeView with pin/auto-context/refresh/clear, all wired to real commands (§1.1, §1.2)                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Open-file context                  | COMPLETE                                                   | `gatherEditorContext()` (`chatParticipant.ts:58-90`) reads active editor + configurable surrounding-line radius                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Selected-code context              | COMPLETE                                                   | Same function; selection takes priority over surrounding code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `@file`                            | COMPLETE                                                   | Native `#file` via `vscode.ChatPromptReference` (`promptReferences.ts:73-121`) in the native Chat participant; `@relativePath` mention syntax in the custom sidebar/editor webview                                                                                                                                                                                                                                                                                                                                                                                                  |
| `@folder`                          | **NEEDS_VALIDATION**                                       | Context-panel "Attach file" flow uses `canSelectFolders: false` (`commandSetup.ts:961`) — file-only. No dedicated folder-mention syntax found in `promptReferences.ts` or the webview mention picker; workspace-wide indexing (`workspaceIndexer.ts`) is separate/automatic, not an explicit `@folder` reference token. **(new)**                                                                                                                                                                                                                                                   |
| Line-range references              | COMPLETE                                                   | `buildSidebarReferenceDraft()` builds `@path#L{start}-L{end}` (`commandSetup.ts:99-135`); native participant references carry a `vscode.Range` through `isLocation()` (`promptReferences.ts:40-44,58-66`)                                                                                                                                                                                                                                                                                                                                                                           |
| Terminal-output references         | **PARTIAL**                                                | `agi-workforce.explainTerminal` captures real shell-integration output (`terminalProvider.ts`, with a documented past bug (SIX-15) about a nonexistent `shellIntegration.executions` property now fixed to use `onDidStartTerminalShellExecution`/`onDidEndTerminalShellExecution`) and sends it through the cloud-utility path — but there is no `@terminal:name` **mention token** usable mid-composer the way Claude Code VS Code has (`claude-code-chrome-ide.md:163`); it's a separate command, not an inline reference                                                        |
| Diagnostics (as agent context)     | **PARTIAL**                                                | `explainError` reads real `vscode.languages.getDiagnostics()` for the line/selection (`errorExplainerProvider.ts:56-65`) — but only for that one cloud-utility command. The main `@agi`/sidebar developer-turn path does **not** appear to auto-attach current-file diagnostics as context (no `getDiagnostics` call found in `chatParticipant.ts` or `ChatStateManager.ts`'s send path). **(new)**                                                                                                                                                                                 |
| Errors (surfaced to agent)         | Same as above                                              | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Git diff                           | COMPLETE                                                   | `agi.git.diff` → real `execFile('git', ['diff'])` to a dedicated output channel, workspace-trust gated (`commandSetup.ts:770-783`)                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Inline diff                        | COMPLETE                                                   | `DiffDecorationProvider` — gutter decorations + CodeLens summary (`+X/-Y/~Z`) with confidence badges (`diffDecorationProvider.ts:65-115`)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Side-by-side diff                  | COMPLETE                                                   | `agi-workforce.showOriginalContext` opens native `vscode.diff` (`patchEngine.ts:377`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Accept / Reject                    | COMPLETE                                                   | Per-diff, keybound (`Ctrl/Cmd+Shift+A` / `Escape` under `agi-workforce.hasDiff`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Accept all / Revert                | **PARTIAL**                                                | Accept All (per-file and global) exists and is wired; "Revert" as a distinct concept beyond Reject-before-apply was not found — rejecting a proposed diff that has not yet been applied is the only path (no evidence of an "undo an already-applied AI edit" command separate from VS Code's own Ctrl+Z)                                                                                                                                                                                                                                                                           |
| Checkpoints                        | **CORRECTLY ABSENT, honestly**                             | `commandParity.test.ts:141-150` actively asserts no command/title contains "checkpoint" and that `commandSetup.ts` contains no `restore-checkpoint`/`rewindLast` reference — this is a deliberate, tested decision not to advertise a capability the local runtime doesn't expose, matching `GAP-284`'s framing exactly                                                                                                                                                                                                                                                             |
| Git status                         | COMPLETE                                                   | `agi.git.status` (`commandSetup.ts:752-768`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Commit                             | COMPLETE                                                   | `agi.git.commit`, prefers the built-in `vscode.git` API, `execFile` fallback, trust-gated (`commandSetup.ts:785-833`)                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| PR creation / PR review            | **ABSENT**                                                 | No command, menu, or webview control found for PR creation or review. **(new — not in existing tracker)**                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Worktrees                          | **CORRECTLY ABSENT, honestly**                             | Same `commandParity.test.ts` assertion as Checkpoints; matches `AppServerCapabilities.worktrees: z.boolean()` in `localRuntimeClient.ts:60` being read but never surfaced as a VS Code control                                                                                                                                                                                                                                                                                                                                                                                      |
| Parallel agents                    | PARTIAL                                                    | Multiple editor-tab sessions (see "Multiple concurrent agent sessions" above); no cross-agent orchestration/handoff UI                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Background processes               | **HANDED OFF TO WEB, honestly**                            | `agi-workforce.openWebTasks` opens `https://agiworkforce.com/tasks` (`commandSetup.ts:1544-1548`); the walkthrough step 2 explicitly says "The IDE runs foreground developer sessions. Hosted background task history remains on Web" (`package.json:429-431`) — matches tracked `GAP-128`, confirmed                                                                                                                                                                                                                                                                               |
| Command execution                  | COMPLETE                                                   | `agi-workforce.runCommand` + allowlisted LLM-suggested commands (`terminalProvider.ts:52-99`), plus agent-mode tool execution routed through the CLI app-server with approval events                                                                                                                                                                                                                                                                                                                                                                                                |
| Permission modes                   | COMPLETE, and arguably exceeds Codex                       | `ask`/`auto`/`plan`/`bypass`, two real modal risk-confirmations (`agentModeConsent.ts:79-115`) with explicit filesystem/terminal/network/MCP/prompt-injection risk copy for Bypass, and a second modal for Max+Bypass compound risk — matches/exceeds the Codex "Turn on Full Access?" single-modal bar cited in `shots-codex-vscode-ios.md`                                                                                                                                                                                                                                        |
| MCP                                | **HONEST BOUNDARY, not a feature gap**                     | The extension does **not** own MCP server config UI — Settings → MCP servers tab explicitly states "Local MCP is runtime-owned. The workspace-scoped AGI CLI discovers local MCP servers and reports their status in chat" (`settingsWebviewContent.ts:1650-1667`), and the chat participant does render live `mcp_status` events (`chatParticipant.ts:436-447`, `localRuntimeClient.ts` schema for `mcp/loading`/`ready`/`unavailable`). No per-server add/enable/disable list in-IDE (Codex has one, `shots-codex-vscode-ios.md:509-511`). Matches `GAP-134`/`GAP-135`, confirmed |
| Skills                             | **ABSENT / not found as a concept**                        | No `skill` command, view, or webview section; `localRuntimeClient.ts`'s `toolCategorySchema` includes a `'skill'` enum value (line ~168) so the _protocol_ has room for it, but nothing in this extension surfaces a skills catalog or toggle. **(new)**                                                                                                                                                                                                                                                                                                                            |
| Repository instructions            | COMPLETE                                                   | `features/instructions/customInstructions.ts` + `data/projectInstructions.ts`; injected as `<custom_instructions>` prelude (`chatParticipant.ts:376-379`, `commandSetup.ts` "Custom instructions" settings section)                                                                                                                                                                                                                                                                                                                                                                 |
| Project instructions               | COMPLETE                                                   | Host-scope and workspace-scope custom instructions both editable from Settings → Personalization (`SettingsPanel.ts:217-233`, `settingsProtocol.ts` `CustomInstructionScope`)                                                                                                                                                                                                                                                                                                                                                                                                       |
| Remote/cloud delegation            | **DELIBERATELY ABSENT in this surface, correctly labeled** | `desktopBridge.ts` is explicitly documented as "a health/presence bridge… must not claim that Desktop consumed IDE context or actions" (`desktopBridge.ts:14-16`) — it does not delegate work, only shows Desktop-app availability. Background/remote task execution is handed to Web (see above)                                                                                                                                                                                                                                                                                   |
| Local task execution               | COMPLETE                                                   | The entire `@agi`/sidebar/editor-tab path (§3a)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Session resume                     | COMPLETE                                                   | `agi-workforce.openConversation` → `sidebarProvider.resumeConversation(id)`, plus native-participant history-metadata resume (`localThreadAuthorityFromHistory`, `chatParticipant.ts:201-229`)                                                                                                                                                                                                                                                                                                                                                                                      |
| Session fork                       | **NEEDS_VALIDATION**                                       | No explicit "fork" command; a provider/model boundary change starts a **new** thread automatically (not user-initiated fork) (`chatParticipant.ts:566-570`). `src/__tests__/forkCompatibility.test.ts` exists (name suggests fork-adjacent behavior is tested) but no user-facing "fork this session" control was found. **(new)**                                                                                                                                                                                                                                                  |
| Browser testing                    | **ABSENT**                                                 | `src/__tests__/browseWeb.test.ts` / `browseWeb.webview.test.ts` exist and cover a "Browse the web" one-turn context source (routed through the CLI's own web-fetch tool per `routingTask.ts`'s `classifyDeveloperTurn`/'research' type, seen in `chatParticipant.test.ts:222-227`), which is **web browsing for context**, not **browser automation/testing** (no Playwright-style click/screenshot control). Matches tracked `GAP-126` framing ("Browse the web is a first-class one-turn context source") — confirmed as context-fetch only, not test automation                  |
| Notifications                      | PARTIAL                                                    | `vscode.window.showWarningMessage`/`showInformationMessage`/`showErrorMessage` used pervasively for approvals, errors, and status; no OS-level push notification for long-running/background completion (that lives on Web/mobile per the product's own architecture)                                                                                                                                                                                                                                                                                                               |
| Usage visibility                   | COMPLETE (subject to §0 caveat)                            | `showAccountUsage` shows session token/cost counters, cloud quota %, subscription status; status bar shows active model + non-default mode; **but see §0** — the Local/BYOK/Managed classification feeding the composer's usage-meter pill is currently untested for the CLI-local-model case                                                                                                                                                                                                                                                                                       |
| Settings                           | COMPLETE                                                   | Full branded `SettingsPanel` webview with 8 sections (general/configuration/personalization/usage/mcp/hooks/plugins/account, `settingsProtocol.ts:13-22`), all live-wired to `Config.update()` with Zod validation per key (`settingsProtocol.ts:60-81`)                                                                                                                                                                                                                                                                                                                            |
| Keyboard shortcuts                 | COMPLETE                                                   | 11 real keybindings (§1.2); no in-product "view/edit all shortcuts" entry point beyond VS Code's own Keyboard Shortcuts editor — matches tracked `GAP-339`                                                                                                                                                                                                                                                                                                                                                                                                                          |

---

## 5. Settings → MCP / Hooks / Plugins: honest empty states, not fake features

Read the actual rendered markup (`settingsWebviewContent.ts:1650-1711`):

- **MCP servers tab**: static card, "Local MCP is runtime-owned," with two
  buttons that both go to real destinations (`manageConnectors` →
  `agiworkforce.com/connectors`, `openDocs`). No fake server list, no
  "Add server" button that does nothing.
- **Hooks tab**: static card, "No extension hooks to configure. Configure
  supported hooks through the local AGI CLI…" — again, no decorative
  fake-toggle rows.
- **Plugins tab**: a real `capabilityAvailabilityRows` list (surface-by-surface
  capability availability, matching tracked `GAP-138`) plus a static "No VS
  Code plugin registry is installed" card with the same honest framing.

This is architecturally correct restraint (matches `GAP-133`/`GAP-134`/`GAP-137`
in the existing tracker, all filed as "declines … until X exists" rather than
"missing feature") but it is still a real capability gap against Codex, which
has live per-server gear+toggle rows and a first-party plugin catalog with
real enable/disable state (`shots-codex-vscode-ios.md:509-514`). Classified
**PARTIAL** (honest, not deceptive, but functionally behind).

---

## 6. Documentation / Marketplace claims vs. code

- `README.md` (ships byte-identical into the VSIX, per its own header
  comment and `marketplaceReadme.test.ts`) makes no claim not backed by code
  read above: it explicitly says diff review is native VS Code diff, agent
  modes match the four real modes, session history is per-workspace/local
  only, and inline completions are opt-in and send code to AGI Cloud with a
  sensitive-file denylist. Cross-checked every settings table row in the
  README against `contributes.configuration` — **1:1 match**, and this is
  independently enforced by `marketplaceReadme.test.ts:44-60` (fails the
  suite if the README documents a setting the manifest doesn't contribute).
- `MARKETPLACE_PUBLISH_RUNBOOK.md` documents an OIDC-based, no-long-lived-token
  publish path (`.github/workflows/release-vscode-extension.yml`) — did not
  independently verify the GitHub Actions workflow file's existence in this
  pass (out of scope: this is a CI/CD concern, not a UI-parity concern), but
  the described token-hygiene approach is internally consistent with the
  described Azure OIDC + protected-environment model.
- No "Coming soon" / "not implemented" placeholder copy found anywhere in
  `settingsWebviewContent.ts`, `webviewContent.ts`, or `README.md` (grepped
  case-insensitively) — the extension's convention throughout is either "this
  works" or an honest "this is intentionally not owned by this surface, here
  is where to go" message (§5).

---

## 7. Cross-reference with the existing `audit/ui-gaps.csv` tracker

The tracker already carries **38 rows** for `extension-vscode` (`GAP-011`,
`GAP-012`, `GAP-124`–`138`, `GAP-284`–`299`, `GAP-339`–`342`) — this
inventory independently confirmed the following as still accurate at the
audited commit: `GAP-011`/`GAP-124` (bypass/max-bypass consent — now
**resolved** per code read, tracker's own status field says "Done," matches),
`GAP-126` (browse-web is context-only), `GAP-128` (background tasks handed to
Web), `GAP-133`/`GAP-134`/`GAP-137` (Hooks/MCP/Plugins honest-empty
framing), `GAP-284` (rewind dead/stubbed — confirmed dead code, not just
disabled), `GAP-286`/`GAP-287` (session history fragmentation), `GAP-339`
(no shortcuts entry point). Did not find evidence contradicting any other row
sampled. New observations from this pass not already in the tracker: the §0
test-suite regression, PR creation/review absence, Skills absence, `@folder`
reference absence, diagnostics-as-agent-context being cloud-utility-only
rather than developer-turn-wide, and plan-editing absence.

---

## 8. Files most load-bearing for this inventory

- `apps/extension-vscode/package.json` — full `contributes` manifest
- `apps/extension-vscode/src/extension.ts` — activation sequencing, guarded
  per-subsystem so one failure degrades rather than kills the extension
- `apps/extension-vscode/src/core/commandSetup.ts` — 1,602 lines, almost
  every command's real implementation
- `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts` —
  native `@agi` Chat participant, full turn lifecycle
- `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` —
  2,481 lines, shared controller for sidebar + editor-tab webviews
- `apps/extension-vscode/src/integrations/localRuntimeClient.ts` /
  `localRuntimePool.ts` — CLI app-server JSON-RPC transport
- `apps/extension-vscode/src/utils/api.ts` — direct-HTTPS cloud-utility
  transport
- `apps/extension-vscode/src/platform/config.ts` — single settings source of
  truth; site of the §0 regression
- `apps/extension-vscode/src/features/permissions/agentModeConsent.ts` —
  bypass/max-bypass modal consent gate
- `apps/extension-vscode/src/__tests__/commandParity.test.ts`,
  `trust-boundary.test.ts`, `chatParticipant.test.ts`,
  `usageMeterTrustBoundary.test.ts` — the tests substantiating §0/§1/§3
