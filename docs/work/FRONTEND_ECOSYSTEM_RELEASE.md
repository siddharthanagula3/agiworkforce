# Frontend ecosystem release

Status: Current
Owner: Fable (lead) for the founder
Last updated: 2026-09-14

The one execution document for the multi-client productization mandate of
2026-09-14: findings, plan, open tasks and the verification matrix. Resolved
rows are deleted, not archived; git carries the history. Founder-only actions
go to `founder-assistance.md`, defect root causes to `ACTIVE_ISSUES.md`.

Classification used everywhere below: VERIFIED (exercised in the running
client), SOURCE-CONFIRMED (read in code, not run), INFERRED, BLOCKED.

## 1. Coordination

Two Claude sessions share this checkout. The peer session owns, until it
reports its protocol-8 push: `apps/cli`, `apps/extension`,
`apps/extension-vscode`, `crates/*`, `packages/contracts/types/src/generated/protocol`
and the contract registry. This session owns `apps/desktop`, `apps/mobile`,
shared settings and token semantics in `packages/ui`, `apps/web` only where a
shared component or the desktop shell needs it, and the cross-client
verification once the peer hands over. Commits are pathspec-only, no amend,
no reset, no stash, no attribution trailers, lowercase subjects.

Checkpoint 2026-09-14: origin main moved from 9c8e3d2ca to 5797e009f (61 commits) after the pre-push chain ran green in a detached worktree of that sha; every commit in the range came through an approval or a lead fix. Deploys stay gated on founder approval. Landed after that sha and queued for the next push: the VS Code items G and H, the Chrome pass 3 follow-ups, the desktop items D(3) and the Code rail inset, the mobile fix package, and the paired browser proof. CI on 5797e009f: the desktop e2e workflow failed before running a test because the frozen renderer's updater test fixture lacked the newer host-bridge members; fixed and re-pushed; the other workflows passed or were still running at the time of writing.

## 2. Ecosystem map (as found in the repository)

```text
apps/web (Next 16)  ── the product; canonical chat, settings, models, projects
apps/desktop/electron ── "AGI Cloud" shell: BrowserWindow over <origin>/chat,
   preload exposes window.agiHost (deep links, notify, update, runtime commands,
   voice hotkey); main process owns local fs/git/shell/apps/clipboard runtime,
   local inference (Ollama, LM Studio), Chrome pairing bridge (loopback HTTP +
   native messaging host), device steps for computer use, tray, quick ask,
   screenshot to chat, dictation chord, launch at login, update check
apps/desktop/src + src-tauri ── Tauri renderer and Rust host; frozen since
   2026-09-13 by founder decision; only reachable through the explicit
   AGI_CLOUD_RENDERER=bundled opt-out of the Electron shell
apps/mobile (Expo) ── expo-router app; managed cloud chat, projects, library,
   settings, live voice, research, Work runs, share-in
apps/extension (Chrome MV3) ── side panel chat on the managed cloud, page
   context, browser tools (console, network, downloads, page watch), pairing
   with the desktop shell, context hand-off to VS Code and the CLI
apps/extension-vscode ── one chat webview riding `agi app-server` (JSON-RPC)
apps/cli (Rust `agi`) ── sessions in ~/.agiworkforce/managed_sessions/*.jsonl
   plus managed_session_metadata; app-server exposes them to VS Code
                    │
packages/contracts (types, model-catalog, local-runtime host bridge,
   browser bridge, device steps, cloud contracts)
packages/ui (design-tokens foundation.css + chat.css consumed by all six
   surfaces; SettingsNavKey and SettingsModal shell; unified-chat)
packages/ai (generated model catalog, routing, provider runtime)
                    │
apps/web API routes (chat completions tool loop, usage ledger, settings sync,
   conversations, projects, artifacts, schedules, tasks) ── Neon Postgres
```

Session substrates: web conversations (account, Postgres); coding sessions
(`managed_sessions` on disk, one store shared by CLI and VS Code through the
app-server; the desktop shell has no reader yet); browser sessions (Chrome
extension state plus the desktop pairing record).

## 3. Findings

| ID  | Finding                                                                                                                                                                                                                                                                                                                                      | Class              | Evidence                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------- |
| F1  | The Electron shell is a default-framed macOS window titled "AGI" over the website: native title bar in `#212121`, page in the site's black, a visible band between them. ChatGPT and Claude desktop hide the title bar and draw the traffic lights inside the sidebar header.                                                                | VERIFIED           | window capture of the running shell against localhost:3100; `apps/desktop/electron/main.ts:507-529`            |
| F2  | The shell loads `/chat`; signed-out users get `/login` (auth layout, no marketing header). Same-origin navigation to any path is allowed, so marketing and public pages can render inside the window; client-side navigations bypass `will-navigate` entirely.                                                                               | SOURCE-CONFIRMED   | `main.ts:553`, `windowPolicy.ts:26-37`, `apps/web/proxy.ts:123-135`                                            |
| F3  | The web app already consumes the host bridge (deep links, local folders, local commands, local models, browser pairing, update row, voice hotkey), so the shell is more than a wrapper; what is missing is the desktop shell behaviour and a coherent Desktop settings section.                                                              | SOURCE-CONFIRMED   | `apps/web/features/desktop-host/*`, `packages/contracts/local-runtime/src/host-bridge.ts`                      |
| F4  | Quick Ask opens a 480×620 always-on-top window that loads the whole `/chat` page rather than a compact composer.                                                                                                                                                                                                                             | SOURCE-CONFIRMED   | `apps/desktop/electron/quickAsk.ts:11-49`                                                                      |
| F5  | Settings semantics are shared: `SettingsNavKey` (30 keys) in `packages/ui`, web renders 21, nine keys exist only for the frozen Tauri renderer, mobile has its own 30 route files, VS Code 21 configuration keys. No Desktop-only section exists for the Electron shell.                                                                     | SOURCE-CONFIRMED   | `packages/ui/ui/src/settings-nav.ts`, `apps/web/features/settings/lib/web-settings-sections.ts`                |
| F6  | Design tokens are consumed by all six surfaces (`foundation.css`, `chat.css`); parity gaps are per-surface literals, not a second system.                                                                                                                                                                                                    | SOURCE-CONFIRMED   | grep of `@agiworkforce/design-tokens` consumers                                                                |
| F7  | Coding sessions already have one substrate (`managed_sessions`) read by the CLI and by VS Code through the app-server; the peer session is adding protocol 8 (account, instructions, skills, plugins, MCP, hooks, settings, commands) so the extension rides the CLI's login and config. Desktop discovery of these sessions does not exist. | SOURCE-CONFIRMED   | `apps/cli/src/sessions.rs`, `crates/agiworkforce-app-server/src/developer_sessions.rs`, peer report            |
| F8  | The Chrome extension works standalone on the managed cloud and pairs with the desktop shell over a loopback bridge (eight browser tools driven from desktop chat). CLI and VS Code reach Chrome only through the context hand-off (URI handler, `--context-url`), not as a browser tool.                                                     | SOURCE-CONFIRMED   | `apps/extension/src/features/{cloud-bridge,native-bridge,browser-tools,context-handoff}`, `electron/browser/*` |
| F9  | Founder direction conflict: the 2026-09-13 mandate froze Tauri and named Electron the desktop; the 2026-09-14 brief names Tauri Cloud and Local with their own definition of done and Screen Studio rows.                                                                                                                                    | BLOCKED (decision) | memory of both instructions; `docs/decisions/2026-09-05-living-decision-model.md` D-15                         |

| F10 | In-product links leave the product in-window: Settings → Help rows to `/docs`, `/help`, `/support`, `/changelog`, `/status`, `/legal` carry an external-link icon on a plain `next/link`; upgrade dialogs link `/pricing`, privacy links `/privacy`, cookie consent `/cookies`, the error boundary `/contact-sales`. Inside the shell they render the marketing site. | SOURCE-CONFIRMED | `HelpSection.tsx:79-96`, `UpgradePlanDialog.tsx:209`, `PrivacySection.tsx:352`, `CookieConsent.tsx:123`, `ErrorBoundary.tsx:190` |
| F11 | Desktop controls with no UI or no persistence path: launch at login (menu only), global shortcuts (tray only), permission grant list and revoke (no caller anywhere), four filesystem runtime commands with no caller (`file_stat`, `file_create_directory`, `file_glob`, `file_grep`), a `clipboard.monitor` capability nothing requests. No automated test boots the real Electron binary. | SOURCE-CONFIRMED | explorer truth map (scratchpad reports/electron.md), `permissionManager.ts:111-118`, `dispatcher.ts:512-532` |
| F12 | Mobile is materially clean in code (no mock data, no no-op handlers, canonical catalog, typed errors, real offline queue and sync), but its theme is a hand-authored palette (194 literals) with no design-token import, keyboard handling is plain `KeyboardAvoidingView`, `deleted-chats` has no screen, and it names Team "Workspace" and connectors "Integrations" in places. Health integration was removed in July 2026 and is guarded by a CI test. | SOURCE-CONFIRMED | scratchpad reports/mobile.md, `apps/mobile/src/ui/theme/tokens.ts`, `settings/workspace.tsx` |
| F13 | Fixed: one owner in `packages/contracts/types` for run-state words (`RUN_STATUS_LABELS`, `AGENT_TASK_STATE_LABELS`), tool-call words and approval verbs; web, mobile and VS Code read from it (2e95bf88a, 7918dd3f2, VS Code item C committing). The Chrome runs panel now reads `agentTaskStateLabel` too (chrome-2, 826295b69). The Chrome activity header ("Needs approval · 1s") was re-checked and left alone: the shared web timeline (`packages/ui/unified-chat` AgentActivityTimeline) prints the same words for the same state, so both surfaces already agree. | VERIFIED (fixed) | reports/vocab-1.md, vscode-1-itemC.md, chrome-2.md |
| F14 | Seven "how much does the agent ask" vocabularies: CLI `approval_mode` and `permission_mode`, a CLI compat shim, the hosted tool loop's auto/manual, the shared ToolApprovalPolicy, mobile's local ToolAccess, VS Code's ExtensionAgentMode. The leaders keep one underlying mode set with per-surface labels. | SOURCE-CONFIRMED | reports/shared-contract.md §4, `docs/research/leader-clients-2026-09-14.md` §7 |
| F15 | The brand palette (terra-cotta scale) is declared three times byte-identically (web globals, Tauri globals, mobile tailwind) and never in `packages/ui/design-tokens`; mobile carries a fourth colour source. Chrome and VS Code consume separately named token exports. | SOURCE-CONFIRMED | reports/shared-contract.md §2 |
| F16 | Error classification is canonical on web (`packages/platform/utils/src/errors.ts`) but mobile, VS Code and Chrome roll their own or leak raw `error.message` (87, 54 and 7 sites). | SOURCE-CONFIRMED | reports/shared-contract.md §6 |
| F17 | Coding sessions have two shapes: protocol ThreadSummary (cwd, provider, trust mode, source Cli or Vscode) and the CLI's SessionSummary (git branch); neither carries a worktree id, and no session can originate from desktop or web. | SOURCE-CONFIRMED | `crates/agiworkforce-protocol/src/developer_session.rs:299-339`, `apps/cli/src/sessions.rs:156` |
| F18 | Fixed in 48ffc4756: the Gemini schema sanitizer now lives in `crates/agiworkforce-llm/src/serialize.rs` on the request path; a live `agi exec` turn on the cheapest Gemini route with the full tool catalog succeeds. | VERIFIED (fixed) | reports/cli-fix-1.md, live turn 2026-09-14 |
| F19 | Fixed in b7c7f1259: MCP tools are named `mcp__<server>__<tool>` with a reversible map and a catalog guard; verified live on DeepSeek and Google with a stdio MCP server attached (the model called `mcp__probe_brave-search__search_web` and the call reached the server). Root cause was `mcp*{server}_{tool}`with colon-bearing server names imported from Codex and Cursor. | VERIFIED (fixed) | reports/cli-fix-1.md |
| F20 | VS Code shell defects seen in the dev host: focus box around the intro heading, paragraph-length intro copy, "Route pending" and "BYOK" jargon in the header chip, a truncated quota banner, a "Resumed developer session" system line, VS Code's thick focus ring on the composer, the model chip truncated to "DeepSe…" at 300 px, raw provider errors in a red box, "More 2" instead of "View all", a primary sign-in button in the empty state while an own-key route works. Fixed in e308ae574 (calm shell), 51e3c3dfc (one error presenter: category headline naming the provider, Retry only when a resend can succeed, raw text behind Details) and 598669cb1 (vocabulary from the shared owner). | VERIFIED (fixed) | scratchpad vscode/A-_, B-_ captures; reports/vscode-1-itemA.md, vscode-1-itemB.md |
| F21 | Fixed in a60e9f634: one-shot output ends the response on exactly one newline before any notice; the notice stays on stderr. | VERIFIED (fixed) | reports/cli-fix-1.md |
| F22 | Mobile's palette is a deliberate neutral system, not a copy of the brand ramps: 22 of the 25 roles it shares with`agiNativeColors`differ in both themes, a test (PAR-M27) forbids the teal ramp on mobile, and the high-contrast variants override the accents. Adopting the shared values would repaint 44 values, so mobile keeps its palette and derives only the radius ladder. The real inconsistency is that four mobile files draw from the brand palette anyway (artifact accents in`chatMessageStore.ts`and`cloudSyncEngine.ts`use`#da7756`against a UI whose accent is neutral;`MathBlock.tsx`renders on`#1a1915`over a`#0f0f0f` surface). | SOURCE-CONFIRMED | scratchpad reports/tokens-1.md |
| F23 | The Tauri host's own Gemini request builder (`apps/desktop/src-tauri/src/core/llm/provider_adapter.rs:3433`) serializes tool schemas verbatim, the same exposure F18 had in the CLI; it is a second engine outside the shared LLM crate. Left for the Tauri decision. | SOURCE-CONFIRMED | reports/cli-fix-1.md |
| F24 | CLI terminal pass (real PTY, 100×30, 60×20, 180×50): slash commands need two Enters; `/model`, `/history`and`/theme`overlays draw over stale text; a tool-call turn leaves a corrupted frame with a stuck spinner and Ctrl-L does not repaint; a resize wipes the visible transcript and leaves stale counters; Esc on the history panel quits the app with a 0-turn summary; the byok notice fires mid-render and corrupts adjacent text; the provider renders as a Rust Debug dump; Ctrl-J and Ctrl-U insert letters;`/resume`has no picker; the footer hides cost and hints below 180 columns. Worked: first paint, Ctrl-C stop, Unicode, markdown tables and code,`/compact`, `/theme`with a colour-blind option, wide layout,`/exit`summary. Fixed in 299dd818a, 6a4c269ec, a16e27509, 3fcbc96e0 (root causes: stderr and stdout writes while ratatui owned the terminal, including the post-tool continuation sink; Ctrl-L bound to clear-chat;`/history`printed to stderr; the palette's Enter only completed; provider rendered with Debug). 2311 CLI tests green; after captures in scratchpad cli-tui-fix. | VERIFIED (fixed) | reports/cli-tui-fix-1.md |
| F25 | Security signal from the same pass: a persisted memory entry in the QA project instructed the model to read`notes.md`and reveal a passphrase; the model recognised it as untrusted data and refused. Likely residue of an earlier injection test, but it shows memory from one session reaching another in the same project. | INFERRED | reports/cli-tui-1.md, capture 21a-markdown.txt |
| F26 | Chrome standalone, signed in through the Clerk sync host on localhost with CI's public key for a stable id: sign-in, reload mid-conversation, long messages, page context behind the site allowlist, 320 px layouts, drawers and the onboarding modal all work; no console errors. The founder item "a QA credential the native SDKs can use" now narrows to mobile. | VERIFIED | reports/chrome-1.md |
| F27 | The one model labelled free (the zero-price OpenRouter router) is offered to an Enterprise account and every send fails with "routing slot `free_workhorse`, `free_workhorse_fast` for the zero-price router is not allowed for tier enterprise":`routing-policies.json`lists the free slots only under`tierAllowedSlots.free`, contradicting the 2026-09-06 founder decision that the free router is offered on every plan. Shared backend policy, so web and CLI managed routes share it. Resolution in flight: the `free*`slots stay the company free lane (a 2026-09-01 registry invariant forbids paid tiers from admitting them), and the user's explicit pick of the zero-price router gets its own tier-neutral slot admitted on every plan, never offered to Auto, and sent with`data\*collection: deny`so no paying account's prompt reaches a training-permitted upstream (the ToS workbook of 2026-09-01 excluded this route for exactly that reason). Fixed in 8a96a932b (tier-neutral slot`router_zero_cost`, never an Auto candidate, free-lane invariant untouched) and 488a656a3 (an explicit pick of an OpenRouter router model dispatches with `data_collection: deny`, driven by the catalog's router role in `canonical-request.ts`); live picks on the QA account answered under the forced policy. The founder decides whether to relax that; entry in founder-assistance.md. | VERIFIED (fixed) | reports/policy-1.md |
| F28 | Fixed (chrome-2, approved, committing): the panel hardcoded `workMode: 'agiwork'`on every turn, which the server treats as AGI Work (three tools forced on, a system instruction to call a tool first, the planner); it now sends`chat` like the web composer's default. "Malformed response" was the extension's SSE parser choking on provider frames the server forwards joined with single newlines; the panel now splits them the way the web hook already does. Live: a plain reply, no plan, no approval cards. Committed 826295b69 (also fixes the schedules section empty state and the runs panel wording). | VERIFIED (fixed) | reports/chrome-2.md, shots2/01 |
| F29 | Fixed (chrome-2): the Artifacts drawer paints its empty copy only after a list call returns; the options allowlist paragraph starts hidden. The Tab stop on body is Chrome's document boundary on an extension page, not a control (left alone). | VERIFIED (fixed) | reports/chrome-2.md shots2/03-08 |
| F30 | Server SSE framing: the chat completions route forwards raw provider lines with a single newline and drops the provider's blank separators (`tool-loop.ts`collectProviderStream and emitProviderLine), so clients receive several JSON frames in one`data:`payload. Fixed in 01aaf4647:`collectProviderStream`owns the framing (complete frames end with a blank line, the provider's separators are kept, the tail is terminated) with a strict-reader test and a negative control; the mobile reader was already line-tolerant and is now pinned by a test (9f41aefe5); the Chrome panel tolerates joined frames (826295b69). | VERIFIED (fixed) | reports/sse-1.md |
| F31 | CLI TUI polish still visible in the after captures: session stats drawn in three places (top border, header row, footer), "BYOK" and "byok" in the welcome, notice and footer, "sandbox: seatbelt" in the footer, the post-tool continuation glued to the pre-tool sentence ("I'll read the file.First line:"), a "Architecting…" spinner label where the leaders say Thinking. Fixed in 8d809d146: one header row, stats in the footer only, trust words Local / Your key / Managed, the notice rewritten, sandbox moved to /status, a paragraph break after tool calls, "Thinking…", a plain welcome hint. Follow-up cb17e54eb: the clear-chat action stays bindable (unbound by default, one discard path behind /clear and the action) and the approval overlay opens on Yes so Enter allows and Esc denies. | VERIFIED (fixed) | reports/cli-polish-1.md, scratchpad cli-polish captures 31–34 |
| F32 | The`agi app-server`spawned by the VS Code extension outlives the VS Code process and is reused by the next dev host (vscode-1 needed`pkill -x agi`between runs). A child runtime must end with its host, or the extension must own its lifetime explicitly. | INFERRED | reports/vscode-1-itemB.md |
| F33 | VS Code coding-workflow pass (dev host, cheap model): the active file and selection are not attached (the model ran`ls`and`find` to locate the open file); Explain Selection and the other editor utilities demand a cloud sign-in on an own-key route; the "Allow this command?" prompt renders in two layouts; a failed command leaves a stale toast and status-bar spinner; Enter with the slash popup open sends "/model" as text; "Approve for session" re-prompts for each new command string; expanded tool rows show escaped JSON; the "+" attach button did not open on two clicks. Every turn in that pass failed with "AGI local runtime emitted malformed JSON" on the 04:51 binary; a stdio probe with the 06:00 binary completes a turn cleanly (`turn/completed`, response "probe ok"), so the re-check rides on vscode-2. What worked: five-choice approvals with a real inline diff, live gutter change bars, the settings tab, the "…" inventory, the slash list, light theme, Abort turn. Fix package vscode-2: item A (editor, selection and problems attached to every turn, 6c12ed6db) and item B (the five editor utilities run on the local session in the chat view, no sign-in wall on Local or own-key routes, no orphaned toast or status-bar spinner; 1b0ecbd42, with the status-bar model name folded in) landed; item C (an approval card in the transcript keyed per tool for session scope, tool rows that render a command, its output and exit status, a write summary with an Open diff button, a 28 px error disclosure; af9c45096 with the owner verbs and the tool clock folded in), item D (slash popup runs the lit row on Enter, closes on send; 746dd5f01) and item E (every spawned app-server registered and killed with the extension host; 64628f020) landed; item F (the Tauri-era desktop bridge removed, 62cebbac4), G (the picker grouped by what the session's route can run, locked rows headed by what unlocks them, 855b3c794) and H (typed turn failures as one sentence with the runtime's action as a button, session rows naming CLI, VS Code or Desktop with the branch, 4081205a8) landed. Package closed: eight items, eight commits, about sixty new cases (reports/vscode-2-final.md). | VERIFIED (partly fixed) | reports/vscode-pass-1.md, vscode-2-itemA.md, vscode-2-itemB.md |
| F34 | Root cause of the IDE's "AGI local runtime emitted malformed JSON": on a tool turn, `agi app-server`writes the post-tool continuation raw to stdout (its JSON-RPC channel) because the app-server host installs no continuation sink and the fallback prints to stdout; the continuation also never streams as`turn/output_delta`. Reproduced with the lead's stdio probe (`[raw] First line of README.md`between the notifications). Plain turns are clean. Fixed in 8d8b38b84: the app-server host installs a per-turn continuation sink, stdout is claimed as the protocol channel under the stdio and MCP transports so every assistant-text writer funnels to stderr while the claim is held, an integration test parses every stdout line the real binary writes, and a shape guard forbids direct stdout writes under`src/agent`, `src/app_server`, `src/models`. The binary was reinstalled and the lead re-ran the tool-turn probe: no raw line, the continuation arrives as `turn/output_delta`before`turn/completed`. | VERIFIED (fixed) | reports/cli-fix-2.md; scratchpad cli/turn-probe-final.log, cli/turn-probe-lead-verify.log |
| F35 | Web (baseline): a signed-in user could not change the theme from Settings. next-themes rebuilds its setter on every theme change, the theme context and `useAppTheme`passed that identity on, and CloudSettingsSync lists the setter as a hydration dependency, so one click on Light re-read the stored appearance and wrote Dark back within 16 ms (reproduced with a signed-in Playwright session, trace`set light, class light, set dark, class dark`). Every earlier theme capture set the theme through storage, which is why no pass caught it. Fixed in 898323796: the provider and the hook hand out one setter for their lifetime; a test renders the real provider with the sync component; the live re-run flips, stays and survives a reload. | VERIFIED (fixed) | scratchpad web/theme-revert.mjs; reports/desktop-code-1-itemA.md (first noticed inside the shell) |
| F36 | VS Code: the "desktop bridge" setting (`agiWorkforce.desktopBridge.enabled/port`), its WebSocket client to `ws://127.0.0.1:8787/ws`with the Tauri`.ipc_token`, the "Desktop: Not connected" status item and the reconnect command all target the frozen Tauri IPC. The Electron shell writes no token and serves loopback HTTP on that port for Chrome pairing, so the control can never connect. Removed in vscode-2 item F, 62cebbac4 (the client, its wire schema, both settings, the status item and the reconnect command); browser tools reach VS Code through the CLI once the desktop browser-tool package lands. | VERIFIED (fixed) | apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts, apps/desktop/electron/browser/bridgeServer.ts |
| F37 | Mobile live pass (iPhone 17 Pro simulator, Release): the first Local Mode send fails because the active model is the undownloaded "AGI Standard" while Apple Intelligence is Ready; Apple Intelligence generation fails on the simulator with a raw FoundationModels error; backgrounding and reopening cold-starts to the first onboarding screen; "Continue" on the local-setup screen and the drawer button missed taps; the Cloud segment does nothing and "Sign in to use Cloud" opens the local Models picker; Settings rows stay on "Checking…"; raw exception strings in the transcript; XXL Dynamic Type clips bubbles and labels; the Models sheet opens with no loading state; two wordmark typefaces; an Android-only model listed on iOS. What worked: onboarding and the AI disclosure sheet, the local Models picker, mid-chat model switch, Face ID gate, deep link, the attach sheet, theme override. Fix package mobile-fix-1: A (the lock is an opaque overlay over the navigator, so a resume returns to the conversation; a keychain failure shows a "Secure storage unavailable" screen with a retry instead of silently dropping every write), B (onboarding writes the recommended ready model, a send on an undownloaded model offers a ready one, native generation errors classified and worded plainly) and H (one wordmark face; the Android-only model leaves the iOS list) reproduced, fixed and approved from a signed simulator build; the simulator keychain only works with `CODE_SIGNING_ALLOWED=YES`, which the earlier pass lacked. C (Cloud entry) and E ("Continue", the drawer button) did not reproduce: the pass's harness tapped about 27 pt too high because the Simulator window's floating title bar overlaps the device, so three of the eight findings were the instrument; the fixer measured the device rect by image correlation. D (the Settings rows settle to "Sign in" after Clerk fails to load, and stop being dead controls; d16835c1a), F (a live text-size change re-measures the tree; cf5d20362) and G (the Models handoff shows a busy row and the sheet a loading state; 51ace9306) landed; I (every header control meets 44 pt, measured by a test; b613c6e04) and J (an opaque cover goes up on resign-active when the lock is on, so the switcher card is blank; d33269f66, switcher captured) landed; K (Notifications gets its own drawer row to the centre, the badge becomes an indicator folded into the drawer button's label; a mid-download model is no longer deselected; c05183c98) landed. Package closed: nine commits, all inside apps/mobile (reports/mobile-fix-1-final.md). Still true on the simulator: no on-device model completes a turn (Apple Intelligence reports available and fails to generate; the app now says so plainly), worth one run on a real device. Found on the way: the Clerk development instance has the Native API disabled, so the iOS sign-in form renders empty (founder item). | VERIFIED (nine fixes landed) | reports/mobile-pass-1.md, mobile-fix-1-itemA.md, -itemB.md, -itemH.md |
| F38 | Desktop coding sessions, item A: the shell now owns one `agi app-server`per approved folder (runtime commands that list, read, resume and start a session and start or interrupt a turn, notifications over`onRuntimeEvent`, children killed on quit and on root revoke, `shell.execute`asked before a session or turn starts, an unavailable folder reported with a hint instead of a throw), plus an "AGI CLI path" row in the Desktop settings group. Landed as 7a500e35f (the bridge, with the resolved CLI state under the path field), f8259b18a (item B: "On this device" on the Code surface, a session opens with its transcript and continues from a composer, a failed turn stays on screen with its reason) and b8d91d2b9 (the binary resolved once per shell). Item C verified the desktop and the CLI share one session (`agi session show` lists the desktop's messages; `agi history` lists the desktop-started thread). Then 2a9f57f27 (a local session chooses its model and a new one starts on the best-evidenced runnable model), 5797e009f (the local-runtime type renamed to `LocalDeveloperSession`, the canonical name belonging to the types package), 56fc1c7c2 (the Code rail clears the window buttons, F45) and 464d207e5 (the session's surface and a turn's typed failure read from protocol-2; the shell's own session record deleted; a failed turn says "No Anthropic key on this computer. Run agi login anthropic in a terminal, then start a new session." with a Copy the command button, because the web account holds no provider key and the shell has no terminal). Package closed with a final report. | VERIFIED (items A to D live) | reports/desktop-code-1-itemA.md; captures scratchpad/desktop-code/itemA-settings-{light,dark}.png |
| F39 | Web (baseline), `/code`: with a persisted model selection the composer chip hydrated against server HTML rendered for the build default (the AGI mark in the accent colour against a provider mark in the secondary colour), React logged "Hydration failed" and regenerated the tree on the client, a visible flash on every load. `/chat` never showed it because its root is client-only. Fixed: the composer reads the selected model through a hydration-safe snapshot (the initial store state during hydration, the persisted one after), reproduced and cleared with a signed-in Playwright run (1 error before, 0 after). | VERIFIED (fixed) | scratchpad web/code-hydration.mjs; reports/desktop-code-1-itemB.md (first noticed) |
| F40 | Web: the code page test expected a "Reject" button after the approval verbs moved to the shared owner (the copy is "Deny"), red at HEAD. The test now reads the code surface's copy table. | VERIFIED (fixed) | apps/web/features/code/CloudCodePage.test.tsx |
| F41 | Protocol 8 widened additively (1c6f257ff): `turn/failed` carries a typed `failure` (a closed code set with provider, retryable and an action such as sign_in_provider) beside the legacy string, `turn/completed` carries `failure: null`; `ThreadSummary` gains `gitBranch`, `worktreeRoot` and `client`, persisted on the managed session at start and refreshed at turn end, never computed at list time; `createdBy` gains `desktop`, derived from the client name "agi-desktop". Generated types regenerated. Live: a cheap tool turn still streams with no raw line; a credential-less turn reports `provider_auth_missing` for anthropic with `sign_in_provider`; `thread/list` shows branch `main` and client `fable_probe`. Consumers owed: VS Code (widen the source enum, render the failure action), desktop (drop its own source record, render the failure action). | VERIFIED (fixed) | reports/protocol-2.md; scratchpad cli/turn-probe-protocol2.log, fail-probe-full.log |
| F42 | Browser tool for the CLI and VS Code through the desktop shell (wave 4): the contract gained two loopback routes, a local-client token header and a 0600 bridge file in the CLI config root; the CLI (5fec3e820) reads the file, asks the shell whether a browser is paired and offers `browser_read_page`, `browser_click`, `browser_type`, `browser_navigate` and `browser_screenshot` only then, reads auto-approve under safe reads, local privacy mode refuses the family, and `/chrome` reports the live state; the Electron shell (76ef2fd80) serves the routes under its existing capability gate with the client named in the prompt. VS Code inherits the tools through the app-server. Live against the running shell: the 0600 bridge file, `/client/state` 200 with the token and 401 without, `/client/command` answering not-paired, `/chrome` in the real TUI saying the desktop runs but no browser is paired, and a cheap-model turn confirming no browser tool is offered while unpaired. Then the paired run (browser-tool-2): the extension built at its stable id, the native host installed for Playwright's Chromium, the panel paired through its own controls, and `agi exec "read the page open in my browser and give me its title"` on the cheap model answered with the real title of the open page through `browser_read_page`; `/chrome` reports Paired with the extension id and the tool list. Three defects found live and fixed (e226c65eb): a browser command printed no tool row, every bridge refusal reached the client as a timeout, and an uncaught route error became a plain-text 500. Queued as browser-tool-3: the capability prompt reads "Allow AGI Workforce to browse agi?" with a raw path (describe() puts the scope target in the verb phrase), unpairing from the extension leaves the shell believing it is paired, native dialogs ignore the app theme because the shell never sets `themeSource`, and the VS Code leg. The VS Code leg was proven at the boundary the sidebar rides: a client introducing itself as agi_vscode gets `createdBy: vscode`, the browser tool's start and end events, and a `turn/completed` carrying the real page title; the sidebar pixels are item 4 of browser-tool-3. The light capability prompt exists only by switching the macOS appearance (the shell never sets `themeSource`). Running the dev shell needs `AGI_CLOUD_APP_ORIGIN=http://localhost:3100`, or it loads production and the pairing section never renders. | VERIFIED (paired path live from the CLI and at the app-server boundary for VS Code) | reports/BRIEF-browser-tool-1.md; apps/cli/src/browser_bridge.rs; apps/desktop/electron/browser |
| F43 | The TypeScript provider display table and the CLI's Rust copy each claimed to mirror the other and had drifted (OpenRouter only in Rust, MiniMax only in TypeScript), so the VS Code picker printed the raw id `open_router`. Both tables now carry the same fifteen providers, a test reads the Rust source and fails on the next drift, and a provider without a vendored mark renders its brand dot. | VERIFIED (fixed, 4edb1b5e5) | `packages/contracts/types/src/__tests__/provider-display-rust-mirror.test.ts` |
| F44 | Chrome real-site pass (chrome-3): the side panel's Site Allowlist "Add" only wrote storage and never requested the Chrome host permission, so page context failed on every approved site with an error that told the user to do what they had just done (P1, reproduced three times and at the API level); fixed by requesting and revoking the real permission from the panel's own control and saying why when Chrome declines. The Projects drawer showed "No projects" over "Loading projects…" like the two sibling drawers chrome-2 fixed (P2, fixed). Live proof that page context now attaches was attempted with the API wrapped: the click reaches `chrome.permissions.request`, Chrome raises its native prompt, and nothing under Playwright can answer it, so the happy path rests on the two unit suites and one human click; founder item "[Chrome QA] One click on Chrome's host-permission prompt". Both fixes landed (48bbd1432, 5ee46a64e). Also found: a reload mid-stream leaves the question with no reply and no retry (P2), the model choice resets to Best (auto) on New Chat by deliberate code while the web keeps it (P2, decided: sticky like the web), and the in-page panel once completed with "no text response" on the auto route (P2, low confidence). Keyboard, stop, retry after a forced failure, the in-page panel from its own control, history, themes and widths all passed. chrome-4 landed all three plus one more: the model choice is a sticky preference restored on load and reset only on sign-out (19186063e), a reload mid-stream keeps the partial reply as Cancelled with Retry (same commit), the in-page panel's empty auto reply was root-caused (the model volunteered a tool the panel cannot approve) and fixed with the unattended completion mode (8db689e0e), and the panel's Sign out now calls the SDK sign-out before its local cleanup (a6d9c70d6). | VERIFIED (fixes landed; happy path needs one human click) | reports/chrome-3-item1.md, chrome-3-item2.md |
| F45 | Electron, `/code`: the window's traffic lights draw over the "AGI Code" wordmark. The hidden-title-bar inset is applied by `globals.css` to elements marked `data-sidebar-region` or `data-window-brand`, which the chat sidebar carries and the Code rail does not, so a second product surface put content under the traffic lights (seen in the desktop-code-1 item D captures). Fixed in 56fc1c7c2: the Code surface reads the host's strip tokens (still owned by globals.css) and reserves the inset itself, open and collapsed, both themes, `/chat` unmoved; folded under the globals owner in 9e92d9dec: the rail's first row declares the sidebar's header-first-row region and names its own padding through one property the shared rule reads, the collapsed header declares that it starts at the window edge, and the wordmark now centres in the strip like the sidebar's brand (geometry measured in the web app with the host attribute forced; the chat sidebar unmoved). | VERIFIED (fixed) | scratchpad desktop-code/itemD-models-dark.png; apps/web/app/globals.css |
| F46 | Web (baseline), found by the control-driven pass: Accent colour, Motion, Chat font and Chat text size revert on reload for a signed-in user. The change writes to the local store, the account write waits on a 400 ms debounce that a reload tears down, and the next load's hydration writes the account's stale copy over the local one, so nothing retries. Same class as F35 on the theme's siblings. Fix in review: flush the pending write on pagehide with a keepalive request; the slow case (change, wait, reload) is being verified to prove the cause is complete. | VERIFIED (defect; fix in review) | reports/web-pass-1-item1.md; scratchpad web-pass/settings-diag-results.json |
| F47 | Chrome: signing out in the side panel leaves the web session on the sync host alive (confirmed through the real control, after the cookie's refresh window, and against Clerk's backend: the session stays active). The sync host is one-directional by design, so the extension cannot revoke the web's session itself; one identity across the web and the extension needs a first-party web route that revokes the current session server-side, called by the panel's sign-out. Fixed in 9912ba691 (chrome-5): the panel's sign-out revokes the synced session through the web's own session route with a CSRF token before the local Clerk sign-out; verified live twice, the web tab in the same profile signed out and Clerk's backend reporting the session revoked. | VERIFIED (fixed) | reports/chrome-4-item4.md, reports/chrome-4.md (chrome-5 section) |
| F48 | Chrome: the store-zip smoke's signed-out check (`apps/extension/e2e/smoke.mjs`, added by dcf3dd434) never passed in CI; the lane is path-filtered and first ran it hours later, so it looked like a regression from the Chrome passes. After a reload the panel sits in its loading state showing the literal placeholder "Type / for commands", stale against the catalog's ready copy, and the account refresh waits for both Clerk clients to burn four retries each against the CI fixture host before it says signed out: 7.7 s after reload against an 8 s timeout, while the smoke samples at a fixed 1 s. Bisected across five commits (all fail) and measured with a state sampler and a timing probe (the background answer alone takes 3.1 s). Fixed in 1e074ca1b: the catalog owns the placeholder for every state, signed-out is decided from the auth context alone (3.1 s under the fixture), and the smoke asserts the boot placeholder and waits for the gate to settle; the packaged CI-fixture smoke passes in the lead's own run on the tip, and the signed-in path on the dev server is unchanged. | VERIFIED (fixed) | CI run 34827070106; lead probes and smoke run 2026-09-14; reports/chrome-4.md (chrome-5 section) |

## 4. Founder decisions needed

1. Tauri: keep frozen (Electron is the desktop, Tauri rows leave the matrix) or
   lift the freeze for a Cloud plus Local parity wave after Electron. Default
   until answered: Electron first, Tauri read-only. Evidence for the call: the
   Tauri renderer (`apps/desktop/src`) is a second React application with 60
   feature directories and its own `AppMode` local or cloud store, so "Cloud
   matches Web" cannot be reached by polishing it. The web app already renders
   Local turns through the host bridge (Ollama and LM Studio behind
   `window.agiHost`, a LOCAL badge, a fork confirm back to cloud), so the one
   architecture that satisfies "same UI, different execution adapter" is the
   one Electron uses today: the shell loads the web app and implements the
   host bridge contract. If Tauri stays, it should host that same renderer over
   the same `HostBridge` contract (Rust commands behind `window.agiHost`) and
   the Tauri React renderer is retired; every Electron item in wave 5 then
   transfers. Recommendation: keep Electron as the desktop product and take the
   Tauri host bridge only if the signed multi-platform pipeline is the reason
   to keep Tauri.

2. Zero-price OpenRouter router on paid plans: shipped privacy-safe (an explicit
   pick sends `data_collection: deny`); the founder decides whether paid
   customers may reach training-permitted upstreams. Entry "[Routing] The
   zero-price OpenRouter router on paid plans" in the founder file. NON-BLOCKING.
3. Mobile QA sign-in: the QA user signs in with Google only, so mobile Cloud
   flows cannot be verified on the simulator without the founder signing in
   once or setting a password for the QA user. Entry "[Mobile QA] A native
   sign-in path for the QA account" in the founder file. NON-BLOCKING for every
   other client.
4. Chrome QA: one click on Chrome's host-permission prompt proves the side
   panel's page context end to end; nothing under automation can answer that
   prompt. Entry "[Chrome QA] One click on Chrome's host-permission prompt" in
   the founder file. NON-BLOCKING.
5. Clerk Native API: the development instance has it disabled, so the iOS
   app's sign-in form renders with no fields and Clerk never reports loaded.
   Entry "[Mobile] Enable the Native API on the Clerk development instance" in
   the founder file. NON-BLOCKING for every other client.
6. Accessibility on the founder's machine: from about 10:05 on 2026-09-14
   synthetic input from the agents' shell reaches no application (window
   counts read zero, clicks and keystrokes land nowhere, screen capture still
   works), so the VS Code sidebar leg of the browser tool and every
   native-prompt proof stop at the app-server boundary. A per-process grant in
   System Settings, not an agent's to change. Entry "[QA] Re-grant
   Accessibility to the process that runs the agents" in the founder file.
   NON-BLOCKING.

## 5. Plan

| Wave | Scope                                                                                                                                                                                                                   | Owner                             | Status                                                                                                                                                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Discovery: repository map, running clients, baseline captures, leader research refresh                                                                                                                                  | Fable + 4 Sonnet explorers        | done (reports electron, mobile, shared-contract; docs/research/leader-clients-2026-09-14.md)                                                                                                                                                      |
| 2    | Ecosystem contract: product-route registry shared by proxy and shell, Desktop settings key, status and error vocabulary owners                                                                                          | Fable + Opus                      | done (3b3fe00c6, d82452e4e, 2e95bf88a, 7918dd3f2, 826295b69)                                                                                                                                                                                      |
| 3    | VS Code + CLI: protocol 8, chat-only shell, shared sessions, cross-resume verification                                                                                                                                  | peer session, then Fable verifies | in progress: cross-resume VERIFIED; vscode-1 A to C and vscode-2 A, B, D, E landed; C, F, G owed; CLI fixes 48ffc4756 to cb17e54eb and 8d8b38b84 landed; protocol-2 in flight                                                                     |
| 4    | Chrome: side panel (done by peer), browser tool exposed to CLI and VS Code through the desktop bridge                                                                                                                   | peer, then Fable                  | panel fixes landed (826295b69, 01aaf4647); browser tool for CLI and VS Code designed (local client route on the Electron bridge with a 0600 token file, a CLI tool family, VS Code inherits through the app-server), queued behind desktop-code-1 |
| 5    | Electron: hidden-inset title bar and drag regions, theme-correct window colour, product-only navigation, native menu and shortcuts, Desktop settings section, coding-session discovery, quick ask as a compact composer | Fable + Opus                      | shell items landed (8507ac497, 3b3fe00c6, 52a383ff0, 4c8694eea, d82452e4e); coding sessions in flight (desktop-code-1, item A approved); compact quick ask queued                                                                                 |
| 6    | Tauri: pending decision 4.1                                                                                                                                                                                             |                                   | decision recorded in 4.1: sequenced last; any Tauri host loads the same web renderer over the HostBridge contract                                                                                                                                 |
| 7    | Mobile: native quality pass from the truth map, simulator verification on iPhone 17 Pro                                                                                                                                 | Fable + Opus                      | pass done (F37); fix package mobile-fix-1 in flight                                                                                                                                                                                               |
| 8    | Cross-app integration: CLI ⇄ VS Code ⇄ Desktop sessions, Chrome from CLI, VS Code and Desktop                                                                                                                           | Fable                             | CLI ⇄ VS Code VERIFIED; Desktop discovery VERIFIED (F38), resume and turns in flight; Chrome from CLI and VS Code queued (wave 4)                                                                                                                 |
| 9    | Visual polish sweep per client for Screen Studio                                                                                                                                                                        | Fable                             | queued                                                                                                                                                                                                                                            |
| 10   | Final verification and adversarial review                                                                                                                                                                               | Fable                             | queued                                                                                                                                                                                                                                            |

## 6. Verification matrix

| Workflow                  | Expected                                               | Status                                                                                                                                                                                          | Evidence                                                     |
| ------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Web → Desktop familiarity | Same product language                                  | VERIFIED (chat page renders identically inside the shell)                                                                                                                                       | window capture 2026-09-14                                    |
| Web settings → Electron   | Shared applicable settings                             | VERIFIED (21 shared sections plus the Desktop app group; a Desktop setting round-trips through the host)                                                                                        | reports/electron-shell-1-item4.md, electron-shell-1-final.md |
| Web settings → Tauri      | Shared applicable settings                             | BLOCKED (4.1)                                                                                                                                                                                   |                                                              |
| Tauri Cloud → Web         | Near visual parity                                     | BLOCKED (4.1)                                                                                                                                                                                   |                                                              |
| Tauri Local → Cloud       | Same UI language                                       | BLOCKED (4.1)                                                                                                                                                                                   |                                                              |
| CLI → VS Code             | Resume same coding session                             | VERIFIED (a session from `agi exec` lists and resumes in the extension)                                                                                                                         | reports/vscode-1-itemC.md; lead check 2026-09-14             |
| VS Code → CLI             | Resume same coding session                             | VERIFIED (a message sent from VS Code shows in `agi session show`)                                                                                                                              | lead check 2026-09-14                                        |
| Desktop Code → CLI        | Resume/discover session where supported                | VERIFIED (a CLI session resumed from the shell shows the shell's messages in `agi session show`; a shell-started session appears in `agi history`)                                              | reports/desktop-code-1-itemC.md                              |
| Desktop Code → VS Code    | Resume/discover session where supported                | VERIFIED through the same `thread/list {cwd}` call the extension makes (probe count 44 to 47 after the shell's sessions); the extension window itself was owned by another agent and not driven | reports/desktop-code-1-itemC.md                              |
| Chrome standalone         | Works without other clients                            | VERIFIED (signed in through the sync host, a plain chat turn answers, drawers list real account data)                                                                                           | reports/chrome-1.md, chrome-2.md                             |
| CLI → Chrome              | Browser tool works                                     | VERIFIED (a paired Chrome page read from `agi exec` on the cheap model, the shell's capability prompt naming the client; unpaired path verified too)                                            | reports/browser-tool-2.md                                    |
| VS Code → Chrome          | Browser testing works                                  | VERIFIED at the app-server boundary (an agi_vscode client receives the browser tool events and the page title); the sidebar capture is browser-tool-3 item 4                                    | reports/browser-tool-2.md                                    |
| Desktop → Chrome          | Browser tool works                                     | SOURCE-CONFIRMED (peer reports verified live 2026-09-13); the shell now also serves local clients under the same gate (76ef2fd80)                                                               | apps/desktop/electron/browser                                |
| Mobile                    | YES for Local mode flows on the signed simulator build | Cloud flows after the two founder items (Clerk Native API, a native sign-in for the QA account); a real-device run for on-device generation                                                     |
| All apps → model catalog  | Canonical definitions                                  | VERIFIED (partly): VS Code, the CLI and Chrome name models and providers from the generated catalog; the VS Code quick pick still lists models the route cannot run (vscode-2 item G)           | reports/vscode-1-itemA.md, cli 6a4c269ec, chrome-1.md        |
| All apps → settings       | Consistent semantics                                   | VERIFIED (partly): web and Electron share SettingsNavKey; VS Code and Chrome keep their own section ids                                                                                         | packages/ui/ui/src/settings-nav.ts                           |
| All apps → tools          | Consistent state                                       | VERIFIED (partly): run, tool-call and approval words come from packages/contracts/types on web, mobile, VS Code and Chrome; the CLI TUI uses Local / Your key / Managed                         | reports/vocab-1.md, chrome-2.md, cli-polish-1.md             |

## 7. Screen Studio gate

| Client            | Record today?                                   | Visible blocker                                                                                                                     |
| ----------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Web               | pending pass                                    | theme switch fixed for signed-in users (F35); a control-driven pass is owed                                                         |
| Mobile            | NO                                              | F37 P1s: first local send, resume, Cloud entry                                                                                      |
| Electron          | YES for chat, settings and coding-session flows | shell items and the desktop coding sessions landed; the paired browser flow after browser-tool-2                                    |
| Tauri Cloud       | BLOCKED                                         | decision 4.1                                                                                                                        |
| Tauri Local       | BLOCKED                                         | decision 4.1                                                                                                                        |
| Chrome Extension  | YES for chat flows                              | page-context flow after one human click on Chrome's permission prompt (founder item)                                                |
| VS Code Extension | YES                                             | eight items landed (context, editor utilities, approval card, tool rows, slash Enter, lifetime, route-aware picker, typed failures) |
| CLI               | YES                                             | TUI polish cb17e54eb; tool turns clean over stdio                                                                                   |

## 8. Release report (2026-09-14, wave in progress)

One hundred and fourteen commits since origin 9c8e3d2ca (42 fixes, 25
features, 8 test-only, 9 refactors, 26 doc checkpoints, one CI change; 389
files, about 26k lines added and 5.5k removed), pushed in four checkpoints
through 13dce80b1 with the pre-push chain green each time. Every commit came
through a captured gate or a lead fix. One package still running when this
section was written: the protocol-3 consumers (the VS Code quick pick and the
Electron coding-session picker reading the reachable-models list) and the
comment pass ahead of it.

### Completed

- Shared vocabulary owners in `packages/contracts/types`: run states, tool-call
  states, approval verbs, agent task states; read by web, mobile, VS Code and
  Chrome. Provider display names mirrored between TypeScript and the CLI's Rust
  table with a test that fails on drift.
- Product-route registry shared by the web proxy, the Electron window policy
  and the web click interceptor; the shell never renders the marketing site.
- Electron: hidden title bar with a token-driven inset, native menu and
  shortcuts, product-only navigation, a Desktop settings group inside the
  shared settings modal (`SettingsNavKey`), local coding sessions served from
  one `agi app-server` per approved folder with listing, transcript, composer,
  Stop, approvals and a model choice that starts on a runnable model.
- CLI: Gemini schema rejection, glued one-shot notices, MCP tool names,
  double Enter, overlay bleed, Esc and Ctrl-L, stats in one place, trust words
  Local / Your key / Managed, a session picker, and a pure JSON stdout under the
  stdio transport with the continuation streamed as deltas.
- Protocol 8 widened additively: typed turn failures with a code, provider,
  retryable flag and action; thread summaries carrying git branch, worktree
  root, client and a desktop source; `model/list` naming the models this host
  can reach, with the failure's code and offer on the ones it cannot, derived
  from the same credential lookup, local discovery and classifier a turn uses
  (0907f8787). The Rust CI lane now runs the app-server and protocol crates'
  own tests, which had been silently broken since protocol-2.
- VS Code: editor, selection and problems attached to every turn; the editor
  utilities run on the local session; approvals as one card in the transcript
  scoped per tool for the session; tool rows with command, output and exit
  status; slash Enter; the app-server dies with the window; the Tauri-era
  bridge removed; a route-aware model picker; typed failures rendered as one
  sentence with the runtime's action as a button; sessions naming the surface
  and branch that opened them.
- Chrome: plain chat turns (no forced tools), SSE framing tolerance on the
  client and a server fix, empty states that wait for their list, the run
  vocabulary from the owner, the allowlist "Add" requesting the real host
  permission, a sticky model choice, a reload mid-stream keeping the partial
  reply as Cancelled with Retry, the in-page panel's silent completion fixed,
  the panel's sign-out ending the shared web session.
- Browser tool for other clients: the shell advertises its bridge to local
  clients through a 0600 file; the CLI offers `browser_*` tools only when a
  browser is paired and answering; VS Code inherits them; the capability prompt
  names the client and follows the app's theme.
- Mobile: resume keeps the conversation, a keychain failure is said plainly,
  the first local send runs on the recommended ready model, settings rows
  settle, Dynamic Type re-measures, the Models handoff shows it is working,
  44 pt header controls, the switcher snapshot carries no conversation, a
  notifications row, one wordmark, no Android-only model on iOS.
- Web (baseline defects only): the theme switch for signed-in users, the code
  page's hydration flash, the appearance-settings revert on reload (a pending
  change now flushes on page hide with keepalive and a pre-warmed CSRF token,
  b67d72270, proven live in the fast and the slow case), the display-language
  scope copy, a desktop-route button on theme classes, a shared host-bridge
  test stub.

### Architecture

The web application is the renderer everywhere it can be: Electron loads it
over the `HostBridge` contract and adds what a browser cannot (a native
runtime, the CLI's sessions, the paired browser); Tauri would host the same
renderer over the same contract if it returns (decision 4.1). VS Code is a
window over the CLI: the app-server's protocol 8 carries sessions, turns,
approvals, failures and now the models a host can reach. The Chrome extension
is one speaker of a wire contract the shell also speaks, and other local
clients reach the browser through the shell, never around it. Vocabulary that
must agree across surfaces lives in one owner package; a Rust mirror is pinned
by a test rather than trusted.

### Shared sessions

CLI ⇄ VS Code ⇄ Desktop share one store and one app-server: a session started
in any of the three lists in the others with its surface, model, trust word and
branch, and a message sent from the desktop appears in `agi session show`.
Verified live in both directions for CLI and VS Code, and for the desktop
against the CLI and the app-server call VS Code makes.

### Browser integration

The side panel works standalone (signed in through the sync host). Page
context asks Chrome for the real host permission; the happy path needs one
human click on Chrome's prompt (founder item). The CLI read a real paired
Chrome page and returned its title on the cheap model; VS Code was proven at
the app-server boundary. The panel's sign-out now ends the shared web session
(9912ba691, with the failure shown in the panel, 13dce80b1); the panel's
unpair reaching the shell was re-driven twice against the running shell and
completes, so the earlier hang is attributed to the window in which HEAD did
not typecheck; the store-zip smoke's signed-out check (F48) is fixed.

### Desktop

Electron is the desktop product: product-only, native chrome, shared settings,
local coding sessions, the browser bridge for local clients. Tauri stays frozen
pending decision 4.1; its rows in the matrix are BLOCKED on that decision.

### Verification

Section 6 is the matrix. Classes used: VERIFIED for anything exercised in the
running client (most rows), SOURCE-CONFIRMED where read but not run, INFERRED
where a shared call stands in for a client not driven, BLOCKED where a founder
item or a decision gates it. Every live QA turn ran on a cheap route. The web
pass's one uncovered control, reasoning effort under a manually selected
reasoning model, was driven by the lead afterwards: the thinking switch, the
slider's two ends and the choice surviving a reload all behave.

### Remaining blockers

Founder items (section 4 and the founder file): the Tauri decision; the
zero-price router on paid plans; a native sign-in path for the QA account; the
Clerk development instance's Native API; one click on Chrome's host-permission
prompt; the Accessibility grant for the process that runs the agents. Not
founder-gated but open: on-device generation on the simulator
(needs one run on a real device) and chrome-5's remaining items.

### Screen Studio flows

Section 7 is the gate. Recordable today: Web (chat, settings, projects, the
code surface), Electron (chat, settings, local coding sessions), VS Code (the
whole coding workflow), CLI (chat, tools, approvals, the session picker),
Chrome (side panel chat, projects, artifacts, history; page context after the
human click), Mobile Local mode on the signed simulator build. Not yet: Mobile
Cloud, Tauri.

### Release status

READY WITH MINOR POLISH for Web, Electron, VS Code, CLI and the Chrome side
panel; NOT READY for Mobile Cloud mode (two founder items) and Tauri (decision
4.1). The polish owed is listed in section 3 as the open rows and in the three
running packages.
