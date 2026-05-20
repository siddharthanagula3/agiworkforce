# Squad: vscode

**Surface:** apps/extension-vscode | **Subagent:** vscode-ext-engineer

## Baseline (cited from plan)

- v0.3.0
- 54+ commands × 17+ settings × 13+ keybindings (consistency triangle)
- desktopBridge port 8787 (same port as Chrome ext NativeMessaging — squad #5)
- Post-reorg import path drift was fixed in commit `a81b9001` (security.test.ts + sidebarPaywallGuard.test.ts) — verify no residual breakage
- @agi chat participant with sub-commands /explain /fix /refactor /tests /docs /model

## Checker output (source of truth)

**typecheck:** PASS — `tsc --noEmit` exits 0, no output.

**lint:** PASS — `eslint src --ext ts` exits 0, no output.

**test:** PASS — 507/507 tests pass across 26 test files (vitest run).

- Slowest: security.test.ts 854ms (expected — live fetch gated by env).
- Webview tests: 8/8 pass (`pnpm run test:webview`).

**build (.vsix):** Not run (read-only audit; typecheck is the gate).

---

## Findings

| #   | Severity | File:line                                           | Category                                                                                              | Checker-cited? | Effort (hrs) | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | P2       | `apps/extension-vscode/package.json:13`             | engines version drift                                                                                 | No             | 0.5          | `engines.vscode` is `^1.95.0`; the locked platform spec says `^1.110.0`. A user on VS Code 1.95–1.109 will install the extension but may hit missing APIs if any 1.96+ API is called. `@types/vscode` is also `^1.95.0`. No missing-API runtime crash found today, but the pin is stale relative to the spec.                                                                                                                                                                                                                                                                                                                                         |
| 2   | P2       | `src/features/model-picker/modelConstants.ts:211`   | Stale fallback model ID                                                                               | No             | 0.5          | `AUTO_MODEL_DEFAULTS['auto-economy']` has fallback `?? 'gpt-5.5-mini'`. That identifier does NOT exist in `packages/types/src/models.json`. `resolveAutoModeModel('auto-economy', 'hobby')` returns `'gemini-3.1-flash-lite'` per types tests and never null, so the fallback is dead code in practice — but if the catalog ever changes, the fallback would silently produce wrong context-limit and cost-rate metadata (not an API-call failure; impact limited to UI token counters).                                                                                                                                                              |
| 3   | P3       | `src/features/model-picker/modelConstants.ts:37–61` | MODEL_CAPABILITY map contains catalog-alias IDs                                                       | No             | 0.25         | `'kimi-k2.5-thinking'` (catalog alias → `kimi-k2.6`) and `'gpt-5.4'` / `'gpt-5.4-pro'` (catalog aliases) are listed as keys. These normalize correctly via `getModelMetadataById`, so picker labels render correctly. No functional bug today; but the table is a maintenance trap — IDs that are aliases may diverge silently when the catalog renames them.                                                                                                                                                                                                                                                                                         |
| 4   | P3       | `src/core/commands.ts:REGISTRY_COMMANDS`            | Half-completed migration                                                                              | No             | 1.0          | `REGISTRY_COMMANDS` is an empty array (`[]`). The A2 pattern intent was to migrate all 62 commands into a declarative registry so the parity test can catch handler drift without running `activate()`. All 62 commands are currently registered imperatively in `commandSetup.ts`, `tokenCounter.ts`, `desktopBridge.ts`, `errorExplainerProvider.ts`, `terminalProvider.ts`, and `subsystemHealth.ts`. The `commandParity.test.ts` test already covers the gap at runtime, so there is no user-visible bug — but the migration goal stated in the file header is not progressing.                                                                   |
| 5   | P3       | `src/core/telemetry.ts:201`                         | Dual telemetry gate: batcher path checks `isTelemetryEnabled` but not `isExtensionTelemetryEnabled()` | No             | 0.5          | `logEvent` (line 281) checks both `isExtensionTelemetryEnabled()` and defers to `logger.logUsage()` (TelemetryLogger, auto-gated). But `sender.sendEventData` (lines 220–229), called by `logger.logUsage` internally, pushes directly to `batcher.enqueue()` which calls `postBatch()`. `postBatch()` checks `vscode.env.isTelemetryEnabled` (VS Code global gate) but does NOT re-check `isExtensionTelemetryEnabled()`. If a caller invokes `logger.logUsage()` bypassing `logEvent()`, the extension-level `agiWorkforce.telemetryEnabled = false` preference is not respected. In practice no current caller does this, but the path is fragile. |

---

## Post-reorg import path drift residue (a81b9001 follow-up)

**Clean.** Full `rg "from '.*\/services\/"` across `apps/extension-vscode/src/**/*.ts` returns zero results. All imports reference the post-reorg feature paths (`features/desktop-bridge/`, `integrations/tierResolver`, etc.). No legacy `services/` paths remain in any file, including test files.

---

## Commands × Settings × Keybindings consistency triangle

| Dimension                                     | Count | Status |
| --------------------------------------------- | ----- | ------ |
| Declared commands (package.json)              | 62    | —      |
| Registered at runtime (registerCommand calls) | 62    | —      |
| Orphan declared (in pkg but no handler)       | 0     | Clean  |
| Orphan registered (handler but not in pkg)    | 0     | Clean  |

**Keybindings (13 total):**

| Declared keybinding                     | Command                  | Pointing to existing cmd?                                            |
| --------------------------------------- | ------------------------ | -------------------------------------------------------------------- |
| ctrl+shift+a (×2 with exclusive `when`) | chat / acceptCurrentDiff | Yes (guarded by `!agi-workforce.hasDiff` vs `agi-workforce.hasDiff`) |
| ctrl+shift+alt+e                        | explain                  | Yes                                                                  |
| ctrl+shift+alt+g                        | agentMode                | Yes                                                                  |
| ctrl+shift+alt+a                        | askAboutCode             | Yes                                                                  |
| ctrl+shift+alt+x                        | explainError             | Yes                                                                  |
| ctrl+shift+alt+t                        | runCommand               | Yes                                                                  |
| ctrl+shift+alt+n                        | newConversation          | Yes                                                                  |
| ctrl+shift+r                            | rejectCurrentDiff        | Yes                                                                  |
| ctrl+shift+enter                        | acceptDiff               | Yes                                                                  |
| escape                                  | rejectDiff               | Yes                                                                  |
| ctrl+shift+alt+y                        | acceptAllDiffsGlobal     | Yes                                                                  |
| ctrl+shift+alt+u                        | rejectAllDiffsGlobal     | Yes                                                                  |

All 13 keybindings point to declared commands. The `ctrl+shift+a` dual-binding is correct: `when` clauses are mutually exclusive.

**Settings (25 declared vs 17+ baseline):**

The actual count is 25 (package.json `contributes.configuration.properties`), exceeding the "17+" baseline. All 25 settings are read by source code (verified via `rg 'agiWorkforce.<key>'`). Zero orphan settings found.

Note: `agiWorkforce.currentTier` is declared `"readOnly": true` — it is written programmatically by bridge/tier resolution, not by user input.

Note: `agiWorkforce.agent.planMode` is correctly marked `"Deprecated"` in its description and the `Config.agentMode()` function in `platform/config.ts` falls back to it for backwards compat.

---

## desktopBridge port 8787 contract symmetry (cross-ref squad #5 chrome for same port)

**Port alignment: consistent across all three surfaces.**

| Surface           | Default port | Source                                                                   |
| ----------------- | ------------ | ------------------------------------------------------------------------ |
| VS Code extension | 8787         | `desktopBridge.ts:817` (`?? 8787`), `package.json` default `8787`        |
| Chrome extension  | 8787         | `apps/extension/src/background/policy.ts:208` (`DEFAULT_AGI_BRIDGE_URL`) |
| Desktop (Rust)    | 8787         | `apps/desktop/src-tauri/src/lib.rs:875` (`unwrap_or(8787)`)              |

**Bridge schema:**

Inbound messages (desktop → VS Code) are validated by Zod `BridgeInboundSchema` in `protocol/bridgeMessages.ts`:

- `desktop:open-file` — `{filePath: string(1..4096)}`
- `desktop:show-message` — `{text: string(1..2000)}`
- `desktop:run-command` — `{command: string(1..200)}` (no args field, by design)
- `auth_ok`

Outbound messages (VS Code → desktop):

- `vscode:connected`, `vscode:code-snippet`, `vscode:sync-context`, `vscode:agent-action`, `vscode:ping`, `auth`

**Security notes:**

- Bridge token is read with TOCTOU-safe single `openSync` + `fstatSync` (POSIX mode 0600 enforced).
- Inbound messages validated through Zod before any handler runs (audit finding F-17 addressed).
- Rate limiting is in place (PR-4A references in file header).
- A planned migration to Unix domain sockets / named pipes is documented in a PR-4A comment but not yet implemented. This is known/tracked.

**Desktop side:** `apps/desktop/src-tauri/src/sys/commands/extension.rs:484` hard-codes `"websocket_port": 8787` in a status response JSON. Port is configurable via `AGI_REALTIME_PORT` env var on the desktop side (`lib.rs:872`) but the VS Code extension does not support that env-var override; it only reads the `agiWorkforce.desktopBridge.port` setting. If an operator overrides the port via the env-var on the desktop side, they must also change the VS Code setting. **Minor coordination gap, no default-config breakage.**

---

## Model-ID hardcoding scan (CLAUDE.md rule #1)

**Inline completion provider (`inlineCompletionProvider.ts`):** Clean. Model ID read from config via `Config.model()` / `normalizeConfiguredModelId()`. No hardcoded IDs.

**Code lens provider (`codeLensProvider.ts`):** Clean. Renders UI lenses that trigger commands; no model IDs involved.

**Hover provider (`hoverProvider.ts`):** Clean. Renders markdown with command links; no model IDs involved.

**@agi chat participant (`chatParticipant.ts`):** Clean. Model resolved via `normalizeConfiguredModelId(Config.model())`. No hardcoded IDs in request paths.

**modelConstants.ts (model picker):** The `MODEL_CAPABILITY` map (lines 37–61) hard-codes model ID strings as lookup keys for capability tier labels (fastest/balanced/most-capable). These strings are NOT passed to the API — they only drive the picker's UI label. The fallback chain `AUTO_MODEL_DEFAULTS` (lines 209–213) hard-codes `'gpt-5.5'`, `'gpt-5.5-mini'`, and `'claude-opus-4-6'` as last-resort fallbacks for context-limit and cost-rate metadata lookups. Per the spec, this is explicitly permitted ("Hardcoded fallback chain in `modelConstants.ts` is acceptable as a last-resort safety net"). `claude-opus-4-6` is a valid catalog alias (`apiModelId` field). `gpt-5.5-mini` is not in the catalog (Finding #2 above).

**providerSwitchGuard.ts:** Lines 48–72 use prefix matching (`id.startsWith('claude-')`, etc.) to infer the provider from a user-supplied model ID. This is a routing heuristic, not hardcoding a model ID. Acceptable and consistent with the `agiWorkforce.providerStreamProvider = 'auto'` inference logic.

---

## Out-of-scope observations

1. `apps/extension-vscode/package.json` sets `"engines.vscode": "^1.95.0"` which allows VS Code 1.95+. The spec pin `^1.110.0` was not applied. If `vscode.chat.createChatParticipant` or `vscode.env.createTelemetryLogger` behaviour changed between 1.95 and 1.110, there may be subtle runtime differences on older VS Code installs. Escalate to Marketplace metadata review if the intent is to require 1.110+.

2. `src/core/commands.ts` `REGISTRY_COMMANDS = []` with a migration comment — the commandParity test already catches handler drift via activate(), so this is a DX debt item, not a runtime risk.

3. `agiWorkforce.agent.planMode` is a deprecated setting that the UI does not currently expose for new configuration, but old user configs with `planMode: true` will still map to `agent.mode = 'plan'` via `platform/config.ts`. This is intentional backward compat.

---

## False-positive watchlist

- **`providerSwitchGuard.ts` prefix matching** (`startsWith('claude-')` etc.) may appear as hardcoded model IDs to a scanner but is provider-inference routing logic, not API model selection.
- **`MODEL_CAPABILITY` lookup table** hard-codes model ID strings but only drives UI tier labels, not API calls.
- **ctrl+shift+a dual keybinding** appears as a conflict but is correctly gated by mutually exclusive `when` clauses.
- **507 test count** matches the baseline claim exactly; no tests were broken.
- The `describe.skipIf` env-gated tests (`security.test.ts` live fetch) are working as designed per baseline.
