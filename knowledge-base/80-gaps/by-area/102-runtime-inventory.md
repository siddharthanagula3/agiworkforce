---
id: "GAPS-AREA-102"
type: "gap-list"
title: "Gaps: Runtime inventory"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 102. Runtime inventory

49 open gaps that touch this area. Area page: [20-features/102-runtime-inventory](../../20-features/102-runtime-inventory/README.md).

## GAP-AREA102-LW08

**e2bExecutionEnabled() is true when the key is set alone, unlike the other gates that need the flag. No caller outside gate.ts was found, so it looks unused.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-102
- Detail: Area 102. Runtime inventory
- Evidence: apps/web/lib/e2b/gate.ts:9-14

## GAP-AREA102-LW09

**Connectors are globally coming soon, so the artifact connector route refuses every connector. The file also lists thirteen individually released connector IDs, and the artifact gate never uses them.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-102
- Detail: Area 102. Runtime inventory
- Evidence: packages/contracts/types/src/connector-release.ts:14, :16-28; apps/web/lib/services/artifact-connector-gate.ts:20

## GAP-AREA102-LW10

**The artifact iframe combines allow-scripts with allow-same-origin. Safety depends on the sandbox origin being separate from the app origin; this was not verified.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-102
- Detail: Area 102. Runtime inventory
- Evidence: packages/ui/unified-chat/src/components/artifact-components/ArtifactSandboxFrame.tsx:148; apps/web/lib/artifact-sandbox.ts:158

## GAP-F102-01-01

**Desktop (Electron) has no local inference: the dispatcher refuses it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-01](../../20-features/102-runtime-inventory/F102-01-cloud-chat-answers-streamed.md)
- Detail: Affects: Desktop users who expect free on-device chat; requirement says local inference is free of any subscription.. Work needed: Product decision, then a local runtime path in the Electron shell with explicit Local label; or record the decision as intended in docs/decisions.
- Evidence: (apps/desktop/electron/runtime/dispatcher.ts:3236-3244; apps/desktop/electron/config.ts:1-12)

## GAP-F102-01-02

**No reattach for plain request-scoped chat after a dropped connection.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-01](../../20-features/102-runtime-inventory/F102-01-cloud-chat-answers-streamed.md)
- Detail: Affects: All Cloud clients on plain chat.. Work needed: Route plain turns through the run journal, or document the limitation.
- Evidence: (lib/stream-transform.ts:725-750 settles and ends the turn)

## GAP-F102-01-03

**Per-app reach for mobile, VS Code and CLI is not recorded.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-01](../../20-features/102-runtime-inventory/F102-01-cloud-chat-answers-streamed.md)
- Detail: Affects: Knowledge base completeness.. Work needed: Read each client and record whether it calls this route.
- Evidence: (brief S102.04 gives platform status only)

## GAP-F102-01-04

**Heartbeat interval is a constant, not configuration.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-01](../../20-features/102-runtime-inventory/F102-01-cloud-chat-answers-streamed.md)
- Detail: Affects: Operators behind unusual proxies.. Work needed: Optional: move to configuration (AGENTS.md section 8 says limits are configuration).
- Evidence: (sse-heartbeat.ts:6)

## GAP-F102-02-01

**Brief says deep research outlives the request; only approved research resumes are durable in code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-02](../../20-features/102-runtime-inventory/F102-02-durable-agent-runs-and-deep-research.md)
- Detail: Affects: Web and any client starting first-time research.. Work needed: Decide: detach every research run, or correct the brief.
- Evidence: (route.ts:634-690 vs :786)

## GAP-F102-02-02

**'cloud-agent-turn' is only a span label; no separate queue was verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-02](../../20-features/102-runtime-inventory/F102-02-durable-agent-runs-and-deep-research.md)
- Detail: Affects: Documentation accuracy.. Work needed: Confirm Workflow platform queue naming.
- Evidence: (start-cloud-agent-workflow.ts:63)

## GAP-F102-02-03

**No route test for the reaper cron.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-02](../../20-features/102-runtime-inventory/F102-02-durable-agent-runs-and-deep-research.md)
- Detail: Affects: Operators.. Work needed: Add a route test.
- Evidence: (apps/web/app/api/cron/reap-agent-runs has only route.ts)

## GAP-F102-02-04

**Per-app behaviour (mobile, CLI, VS Code, Chrome) for cloud agent runs is not recorded.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-02](../../20-features/102-runtime-inventory/F102-02-durable-agent-runs-and-deep-research.md)
- Detail: Affects: Those apps.. Work needed: Survey each client.
- Evidence: (brief gives platform status only)

## GAP-F102-03-01

**No connector sync workers (mail, drive).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-03](../../20-features/102-runtime-inventory/F102-03-background-jobs-schedules-connector-sync-and-index.md)
- Detail: Affects: All apps that expect connected content to be searchable or fresh.. Work needed: Design and build scheduled syncs with entitlement and quota, or retire the item.
- Evidence: (audit/missing/102-runtime-inventory.md S102.28; vercel.json has no sync cron)

## GAP-F102-03-02

**Scheduler cron limited to 60 s and 50 runs per sweep.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-03](../../20-features/102-runtime-inventory/F102-03-background-jobs-schedules-connector-sync-and-index.md)
- Detail: Affects: Heavy schedule load.. Work needed: Capacity test; raise limits if needed.
- Evidence: (run-schedules/route.ts:12-20)

## GAP-F102-03-03

**Scheduling is unavailable on Free, Local and own-key plans; check against the requirement that Local features stay free of subscription.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-03](../../20-features/102-runtime-inventory/F102-03-background-jobs-schedules-connector-sync-and-index.md)
- Detail: Affects: Local and own-key users.. Work needed: Product decision; local scheduler is a different feature.
- Evidence: (billing-catalog.ts:593-610, :878-884 of schedule-service.ts)

## GAP-F102-04-01

**Sandbox is off by default and the brief asks to turn it on in production.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-04](../../20-features/102-runtime-inventory/F102-04-cloud-code-sandbox-cloud-browser-and-cloud-compute.md)
- Detail: Affects: Web users of Code and chat code execution.. Work needed: Configure price, key and flag in production; run a live check.
- Evidence: (.env.example:384; brief S102.08)

## GAP-F102-04-02

**Brief's provider-native interpreter fallback not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-04](../../20-features/102-runtime-inventory/F102-04-cloud-code-sandbox-cloud-browser-and-cloud-compute.md)
- Detail: Affects: Chat code execution when the sandbox is off.. Work needed: Confirm whether a native interpreter path exists.
- Evidence: (tool-loop.ts:2802)

## GAP-F102-04-03

**No cloud browser runtime.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-04](../../20-features/102-runtime-inventory/F102-04-cloud-code-sandbox-cloud-browser-and-cloud-compute.md)
- Detail: Affects: Web users and all apps wanting a browser that survives disconnect.. Work needed: Build a runtime, session lifecycle, metering and entitlement.
- Evidence: (browser-session.ts:52-59; ledger S102.09)

## GAP-F102-04-04

**No cloud virtual computer runtime.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-04](../../20-features/102-runtime-inventory/F102-04-cloud-code-sandbox-cloud-browser-and-cloud-compute.md)
- Detail: Affects: Web users.. Work needed: Same as above.
- Evidence: (ledger S102.10)

## GAP-F102-05-01

**Desktop has no local inference in the shell, though local inference on desktop should be free of any paid subscription.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-05](../../20-features/102-runtime-inventory/F102-05-desktop-app-shell-and-its-local-helper.md)
- Detail: Affects: Desktop users.. Work needed: Product decision and Local-mode path with explicit labelling.
- Evidence: (dispatcher.ts:3236-3244)

## GAP-F102-05-02

**Dispatcher is described as the only path but other IPC handlers exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-05](../../20-features/102-runtime-inventory/F102-05-desktop-app-shell-and-its-local-helper.md)
- Detail: Affects: Security review.. Work needed: Review each handler; fix the comment or route through the dispatcher.
- Evidence: (main.ts:542-673 vs dispatcher.ts comment)

## GAP-F102-05-03

**Subscription rules for the local helper are not visible from the shell.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-05](../../20-features/102-runtime-inventory/F102-05-desktop-app-shell-and-its-local-helper.md)
- Detail: Affects: Local coding on desktop.. Work needed: Read the CLI entitlement code and record it.
- Evidence: (none found in main.ts and dispatcher.ts)

## GAP-F102-06-01

**Brief says Seatbelt/Landlock; code has Seatbelt and bubblewrap only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-06](../../20-features/102-runtime-inventory/F102-06-local-commands-and-their-sandbox.md)
- Detail: Affects: Linux users and documentation.. Work needed: Correct the brief or add Landlock.
- Evidence: (crates/agiworkforce-sandbox-policy/src/wrap.rs:36-39)

## GAP-F102-06-02

**No sandbox on Windows in the desktop or CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-06](../../20-features/102-runtime-inventory/F102-06-local-commands-and-their-sandbox.md)
- Detail: Affects: Windows users.. Work needed: Add a backend or keep approval-every-time and record the decision.
- Evidence: (shellSandbox.ts:189-203; sandbox.rs:196-217)

## GAP-F102-06-03

**The brief says shell/PTY with interactive support; the desktop terminal is `script` on macOS only and no PTY library was found there.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-06](../../20-features/102-runtime-inventory/F102-06-local-commands-and-their-sandbox.md)
- Detail: Affects: Interactive programs on Linux and Windows.. Work needed: Confirm interactive coverage per platform.
- Evidence: (shellService.ts:139, :965)

## GAP-F102-06-04

**Who sets the review text is described two ways (model schema vs server on untrusted content).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-06](../../20-features/102-runtime-inventory/F102-06-local-commands-and-their-sandbox.md)
- Detail: Affects: Safety behaviour on untrusted turns.. Work needed: Find or add the server-side rule and test it.
- Evidence: (device-tools.ts:53-58 vs shellService.ts:98-102)

## GAP-F102-07-01

**Brief code pointers for S102.18 and S102.19 point at unrelated code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-07](../../20-features/102-runtime-inventory/F102-07-command-line-app.md)
- Detail: Affects: Engineers and testers using the brief; CLI.. Work needed: Update the brief pointers.
- Evidence: apps/cli/src/lib.rs:4595-4625 (schedule triggers) and 3100-3118 (code approvals) versus the real entries at 8294-8330 and 8186/9146.

## GAP-F102-07-02

**No test found that proves a TTY with no prompt reaches the full-screen screen and that --no-tui or plain mode reaches the REPL; the test at lib.rs:9773-9780 only checks parsing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-07](../../20-features/102-runtime-inventory/F102-07-command-line-app.md)
- Detail: Affects: CLI interactive start.. Work needed: Add an integration test with a pseudo-terminal.
- Evidence: apps/cli/src/lib.rs:9773-9780; branch at 8294-8330.

## GAP-F102-07-03

**Sign-in and subscription rules for the CLI per route (Local, own key, Cloud) were not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-07](../../20-features/102-runtime-inventory/F102-07-command-line-app.md)
- Detail: Affects: CLI users; requirement that local inference is free of any subscription.. Work needed: Read the managed-request context and auth code; document per mode.
- Evidence: tier_cache.rs:509-525 only shows a signed-in plan fetch; no gate read.

## GAP-F102-07-04

**Default privacy mode is Managed when unset, while the product requires Local to be a distinct, explicit mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-07](../../20-features/102-runtime-inventory/F102-07-command-line-app.md)
- Detail: Affects: CLI users who expect Local by default.. Work needed: Confirm this is intended and state it in the CLI help [proposed].
- Evidence: apps/cli/src/config.rs:467-473.

## GAP-F102-08-01

**Desktop (Electron) refuses on-device inference, but the product context requires local inference on desktop and on mobile to be free of any subscription.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-08](../../20-features/102-runtime-inventory/F102-08-on-device-model-on-the-phone.md)
- Detail: Affects: Desktop users; Local mode on Desktop.. Work needed: Owner decision to keep Cloud-only or to enable the local_* commands (Ollama, LM Studio) with consent; update the decision doc either way.
- Evidence: dispatcher.ts:3235-3242, 3367; docs/decisions/2026-09-15-founder-decisions.md:87-89; contract commands at packages/contracts/local-runtime/src/inference.ts:3-10.

## GAP-F102-08-02

**The brief marks S102.17 platform done and cites dispatcher.ts:799, which is the dispatcher, not a model runtime; the Desktop has no runtime.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-08](../../20-features/102-runtime-inventory/F102-08-on-device-model-on-the-phone.md)
- Detail: Affects: Brief accuracy.. Work needed: Split the brief item per platform.
- Evidence: S102.17 item; dispatcher.ts:3367.

## GAP-F102-08-03

**No test found that a Local turn makes no network call or no plan check.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-08](../../20-features/102-runtime-inventory/F102-08-on-device-model-on-the-phone.md)
- Detail: Affects: Mobile Local Mode promise (free, private).. Work needed: Add a test with a failing fetch that sends a Local message.
- Evidence: Tests found are listed under verification; none named for network silence.

## GAP-F102-08-04

**The rest of chatExecutionStore.ts (6188 lines) was not read, so absence of subscription checks in Local turns is not proven.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-08](../../20-features/102-runtime-inventory/F102-08-on-device-model-on-the-phone.md)
- Detail: Affects: Free-local requirement.. Work needed: Full read or a guard test.
- Evidence: File length vs the ranges read.

## GAP-F102-09-01

**Brief pointers for S102.20-S102.23 land on imports and a settings list, not on the behaviour they describe.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-09](../../20-features/102-runtime-inventory/F102-09-editor-and-browser-extensions.md)
- Detail: Affects: Engineers using the brief.. Work needed: Correct the brief.
- Evidence: background.ts:200-215 is an import block; package.json:74 is in restrictedConfigurations; real code at store.ts:100-113, tabAuthority.ts:67-92, package.json:1422-1427.

## GAP-F102-09-02

**Plan gating, usage limits and sign-in rules for VS Code and Chrome were not established, so one-subscription-system compliance is unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-09](../../20-features/102-runtime-inventory/F102-09-editor-and-browser-extensions.md)
- Detail: Affects: VS Code and Chrome users.. Work needed: Read tierResolver and the Chrome cloud-bridge entitlement code; document.
- Evidence: Only tier lookups (sidebarProvider.ts:~85) and a test name (chrome-subscription.test.ts) were seen.

## GAP-F102-09-03

**Chrome has no found Local or own-key chat route, only a managed cloud bridge.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-09](../../20-features/102-runtime-inventory/F102-09-editor-and-browser-extensions.md)
- Detail: Affects: Chrome users who want Local or own-key mode.. Work needed: Confirm and, if intended, record that Chrome is Cloud-only.
- Evidence: background.ts imports managedChatHandler and managed auth.

## GAP-F102-10-01

**The brief marks the relay and mobile control as done, but the mobile Remote screens are off in the current build.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-10](../../20-features/102-runtime-inventory/F102-10-mobile-app-and-phone-to-desktop-relay.md)
- Detail: Affects: Mobile users; any claim that the phone can control a desktop.. Work needed: Either enable and verify, or record it as hidden in v1 in the brief and matrix.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:16; remote-control.tsx:131.

## GAP-F102-10-02

**Relay and server need production configuration; absence only shows as a 503 at claim time.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-10](../../20-features/102-runtime-inventory/F102-10-mobile-app-and-phone-to-desktop-relay.md)
- Detail: Affects: All pairing.. Work needed: Add a readiness check or deploy-time check that both values exist [proposed].
- Evidence: claim/route.ts:69-80.

## GAP-F102-10-03

**Whether the phone-to-desktop session content is end-to-end protected beyond the pair token was not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-10](../../20-features/102-runtime-inventory/F102-10-mobile-app-and-phone-to-desktop-relay.md)
- Detail: Affects: Privacy claims.. Work needed: Read the host and controller crypto in packages/utils/remote-control.
- Evidence: Only a decision row (wire-or-cut.md:748) and relay code at index.ts were seen.

## GAP-F102-10-04

**Subscription rules are per surface in code (paid tiers), not read from one shared place on the phone; the phone has its own flag.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-10](../../20-features/102-runtime-inventory/F102-10-mobile-app-and-phone-to-desktop-relay.md)
- Detail: Affects: One-subscription-system requirement.. Work needed: Confirm the shared capability table is the only source (billing-catalog.ts:352).
- Evidence: remote-control.tsx:156-157 uses canUseBillingPlanCapability; flag false.

## GAP-F102-11-01

**The brief calls this server side only; web and mobile clients exist and mobile has Local Mode and native-module restrictions the brief does not mention.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-11](../../20-features/102-runtime-inventory/F102-11-live-voice-sessions.md)
- Detail: Affects: Mobile and Web users; brief accuracy.. Work needed: Update the brief item.
- Evidence: live-voice-session.ts:41; liveVoiceAvailability.ts:17-47.

## GAP-F102-11-02

**The provider key name is fixed to one provider's key while the provider comes from the slot.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-11](../../20-features/102-runtime-inventory/F102-11-live-voice-sessions.md)
- Detail: Affects: Provider-agnostic requirement.. Work needed: Resolve the key by provider through the endpoint table [proposed].
- Evidence: route.ts:129, 194-196.

## GAP-F102-11-03

**No live voice route or client for CLI, VS Code or Chrome found, while the surface matrix lists Voice as present for CLI and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-11](../../20-features/102-runtime-inventory/F102-11-live-voice-sessions.md)
- Detail: Affects: CLI and Chrome users who expect live voice.. Work needed: Clarify whether the matrix row covers turn-based voice only.
- Evidence: grep of 'voice/live/sessions' found web and mobile only; surface-feature-matrix.md:68.

## GAP-F102-11-04

**The 403 rules apply only when a model may train; this condition is not stated in the brief.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-11](../../20-features/102-runtime-inventory/F102-11-live-voice-sessions.md)
- Detail: Affects: Testers.. Work needed: Add the condition to the brief.
- Evidence: route.ts:324-326.

## GAP-F102-12-01

**Connected apps in published apps cannot work today because connectors are in 'coming_soon' state, though the brief marks the hosting runtime done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-12](../../20-features/102-runtime-inventory/F102-12-published-artifacts-and-their-sandbox.md)
- Detail: Affects: Web users who publish apps that need connectors.. Work needed: Release decision, then live verification of consent, gate and tools.
- Evidence: connector-release.ts:14; artifact-connector-gate.ts:20-25.

## GAP-F102-12-02

**AI inside published apps is off unless a server switch is set; production state unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-12](../../20-features/102-runtime-inventory/F102-12-published-artifacts-and-their-sandbox.md)
- Detail: Affects: Viewers of published apps.. Work needed: Confirm production value and document.
- Evidence: artifact-ai-switch.ts:5-8.

## GAP-F102-12-03

**Two different iframe components with different sandbox attribute lists exist; the brief describes one.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-12](../../20-features/102-runtime-inventory/F102-12-published-artifacts-and-their-sandbox.md)
- Detail: Affects: Security review; web published page versus chat panel.. Work needed: Unify or document.
- Evidence: ArtifactSandboxFrame.tsx:148 versus SandboxedIframe.tsx:399, 427.

## GAP-F102-12-04

**Brief pointer 'complete route:202' does not exist; the complete route has 86 lines and the logic is in artifact-completion.ts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-12](../../20-features/102-runtime-inventory/F102-12-published-artifacts-and-their-sandbox.md)
- Detail: Affects: Brief accuracy.. Work needed: Correct the pointer.
- Evidence: apps/web/app/api/artifacts/runtime/[token]/complete/route.ts (86 lines); artifact-completion.ts.

## GAP-F102-12-05

**The sandbox origin is empty in the example environment; if it is also empty in production, every artifact uses the weaker opaque fallback.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F102-12](../../20-features/102-runtime-inventory/F102-12-published-artifacts-and-their-sandbox.md)
- Detail: Affects: Web users in production.. Work needed: Verify the production setting [unknown].
- Evidence: .env.example:676; artifact-sandbox.ts:158-175.
