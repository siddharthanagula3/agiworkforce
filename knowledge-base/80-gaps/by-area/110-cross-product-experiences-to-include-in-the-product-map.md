---
id: "GAPS-AREA-110"
type: "gap-list"
title: "Gaps: Cross-product experiences to include in the product map"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 110. Cross-product experiences to include in the product map

106 open gaps that touch this area. Area page: [20-features/110-cross-product-experiences-to-include-in-the-product-map](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/README.md).

## CMP-C113

**Cloud session from local code when the repo has no remote**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F063-03](../../20-features/063-routines-schedules-and-triggers/F063-03-what-a-run-may-use-sources-connectors-agent-model.md), [F068-05](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md), [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Detail: Cloud Code starts only from a GitHub checkout; there is no upload of local files.
- Evidence: apps/cli/src/cloud/code_handoff.rs:29-37,447-463

## CMP-C364

**--desktop flag opens the directory in the desktop app**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F068-01](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: Only the /desktop command hands a running session over; there is no launch flag.
- Evidence: searched: --desktop, desktop flag in apps/cli/src/lib.rs, cli_options.rs

## CMP-CP152

**Send the current session to the cloud with an & prefix**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F068-05](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md), [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Detail: No & prefix /continue-elsewhere and agi code handoff move a session to the cloud; no & prefix.
- Evidence: apps/cli/src/lib.rs:1182

## CMP-CP175

**Slash command /teleport**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F068-01](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md), [F068-06](../../20-features/068-session-continuity-and-remote-session-product/F068-06-bring-cloud-results-back-and-continue-cloud-work-f.md), [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: There is no slash form agi resume --teleport pulls a cloud session and checks out its branch, but there is no slash form.
- Evidence: apps/cli/src/lib.rs:925,2514

## CMP-D90

**Desktop app and IDE extension share chats and context**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F068-01](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: The VS Code extension does not share chats with the desktop app.
- Evidence: searched: IDE context, sync in apps/extension-vscode, apps/desktop

## CMP-D92

**Move a local session to the cloud**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F068-04](../../20-features/068-session-continuity-and-remote-session-product/F068-04-who-owns-execution-and-handing-control.md), [F068-05](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md), [F068-06](../../20-features/068-session-continuity-and-remote-session-product/F068-06-bring-cloud-results-back-and-continue-cloud-work-f.md), [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Detail: A session on this computer cannot be sent to a cloud session.
- Evidence: searched: move to cloud, continue in cloud, send to cloud, run in cloud in apps/web/features/code

## CMP-DP35

**Send a task from the phone to run on the paired desktop (Dispatch)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F060-02](../../20-features/060-agentic-work-product/F060-02-choose-sources-tools-place-model-and-effort.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: The phone side is hidden in mobile v1 by owner decision, and there is no single persistent thread Desktop can pair a phone or a signed-in browser to send tasks to this computer; the phone side is hidden in mobile v1 by owner decision, and there is no single persistent thread.
- Evidence: apps/web/features/desktop-host/components/RemoteControlSection.tsx:37; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:33

## CMP-M139

**Dispatch a task from the phone to the desktop app**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: The dispatch switch is off in v1, so the phone cannot hand a task to a desktop app.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:dispatch=false

## CMP-M85

**Dispatch tasks to a paired desktop**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: Dispatch flag is off in v1 and nothing in the app opens it; no owner decision covers it apart from Remote Control hidden.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts (dispatch: false); apps/mobile/src/features/companion/components/DispatchTaskComposer.tsx

## CMP-VP29

**Remote control of this window's sessions from a phone**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F068-07](../../20-features/068-session-continuity-and-remote-session-product/F068-07-continue-local-work-from-the-phone-and-start-a-tas.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: Remote Control commands exist in the editor, but the phone side is hidden in mobile v1 by decision Remote Control commands exist in the editor, but the phone side is hidden in mobile v1 by decision.
- Evidence: apps/extension-vscode/package.json:remoteControl; apps/extension-vscode/src/features/remote-control/remoteControlService.ts

## CMP-VP58

**Remote Control: drive an editor session from phone or browser**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F068-07](../../20-features/068-session-continuity-and-remote-session-product/F068-07-continue-local-work-from-the-phone-and-start-a-tas.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: Conflicts with row 'Remote control of this window's sessions from a phone', rated Partial for the same feature; they ne… Conflicts with row 'Remote control of this window's sessions from a phone', rated Partial for the same feature; they need one label. The editor side exists (QR, pairing code, status bar: apps/extension-vscode/src/features/remote-control/index.ts:10-14,30-45,133-139). The phone entry is behind a feat
- Evidence: apps/extension-vscode/src/features/remote-control/index.ts:10-14,133-139

## GAP-AREA110-LW02

**The sandbox switches use different rules in different places. e2bExecutionEnabled is true with the key alone or the flag (used by runtime and templates). e2bCutoverEnabled needs the flag only (used by the code-runs route and the tool loop). e2bProvisioningReady needs flag, key and priceable rate. Se**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-110
- Detail: Area 110. Cross-product experiences to include in the product map
- Evidence: ~/Desktop/agiworkforce/apps/web/lib/e2b/gate.ts:9-28; ~/Desktop/agiworkforce/apps/web/app/api/chat/conversations/[id]/code-runs/route.ts:76; ~/Desktop/agiworkforce/apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2802

## GAP-AREA110-LW03

**Mobile remote control (S110.21) is marked done, but the v1 build turns off the companion and dispatch switches, so the phone remote screens show unavailable.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-110
- Detail: Area 110. Cross-product experiences to include in the product map
- Evidence: ~/Desktop/agiworkforce/apps/mobile/lib/v1FeatureFlags.ts:12, 16; ~/Desktop/agiworkforce/apps/mobile/app/(app)/companion/index.tsx:183

## GAP-AREA110-LW04

**CLI voice (S110.07, S110.08) is marked done. The cited release workflow line is a Node smoke step and the cited voice.rs line writes a WAV file. The CLI voice module is push-to-talk transcription into the session; no code found starts a background task or makes a document from voice.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-110
- Detail: Area 110. Cross-product experiences to include in the product map
- Evidence: ~/Desktop/agiworkforce/.github/workflows/release-cli.yml:222-235; ~/Desktop/agiworkforce/apps/cli/src/voice.rs:1-10, 949-961

## GAP-AREA110-LW06

**Browser page to Project source (S110.09) cites mobile share-preview index.tsx:93, which is identity capture. The share intake stages text and files into the chat composer. No save to a Project was found.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-110
- Detail: Area 110. Cross-product experiences to include in the product map
- Evidence: ~/Desktop/agiworkforce/apps/mobile/src/features/share-preview/index.tsx:26-28, 93

## GAP-AREA110-LW07

**Project grounding (S110.24, S110.25) cites request-processor.ts:2548, which is a search budget helper, not Project context.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-110
- Detail: Area 110. Cross-product experiences to include in the product map
- Evidence: ~/Desktop/agiworkforce/apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2542-2556

## GAP-AREA110-LW11

**Presentation from an uploaded document (S110.02): the office file tool accepts only Word and Excel files as an editable source, so an uploaded PowerPoint or PDF cannot be the input to a new deck through this tool.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-110
- Detail: Area 110. Cross-product experiences to include in the product map
- Evidence: ~/Desktop/agiworkforce/apps/web/lib/services/managed-office-file-service.ts:233-241

## GAP-AREA110-LW13

**Two artifact version stores: the web store keeps artifacts in browser localStorage, and a shared store package has its own version rule. Which one is used by which app was not established.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-110
- Detail: Area 110. Cross-product experiences to include in the product map
- Evidence: ~/Desktop/agiworkforce/apps/web/features/chat/stores/artifacts-store.ts:590-591; ~/Desktop/agiworkforce/packages/platform/artifacts/src/artifact-store.ts:69-120

## GAP-CAP-research-27

**Report to interactive page and other outputs: Slides and audio missing; mobile missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-09](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md), [F110-03](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-03-research-outputs-audio-overview-and-interactive-pa.md)
- Requirement items: S110.05, S35.29, S35.30, S35.31
- Detail: Claude unknown, ChatGPT unknown; AGI partly built

## GAP-CAP-synchronization-and-continuity-01

**Chat history follows the account: No two-device check has been run by a person. Web testers wrote 'Sync to other devices not tested'.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F090-01](../../20-features/090-conversation-and-synchronization-components/F090-01-saved-conversations-and-messages.md), [F090-10](../../20-features/090-conversation-and-synchronization-components/F090-10-sync-between-devices.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Requirement items: S110.18, S90.01, S90.02, S90.17
- Detail: Claude partly, ChatGPT yes; AGI built

## GAP-CAP-synchronization-and-continuity-12

**Choose cloud or local for continuing work: Web, Desktop and Mobile have no explicit local-to-cloud handoff with a preview (S68.16, S68.18 missing).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F068-04](../../20-features/068-session-continuity-and-remote-session-product/F068-04-who-owns-execution-and-handing-control.md), [F068-05](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md), [F068-06](../../20-features/068-session-continuity-and-remote-session-product/F068-06-bring-cloud-results-back-and-continue-cloud-work-f.md), [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Requirement items: S110.22, S68.13, S68.15, S68.16
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-synchronization-and-continuity-13

**Remote Control: drive a session on your own computer from a phone or browser: Phone side hidden in v1. S68.24 (start a session in an allowed remote folder) is Missing on web and mobile and Partial on desktop; the sending screen is not verified. CLI is Missing for S110.21.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F068-07](../../20-features/068-session-continuity-and-remote-session-product/F068-07-continue-local-work-from-the-phone-and-start-a-tas.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Requirement items: S110.21, S68.14, S68.24
- Detail: Claude yes, ChatGPT yes; AGI off by decision

## GAP-CAP-synchronization-and-continuity-16

**Dispatch a task from the phone to the desktop: Hidden on Mobile in v1; the sending screen is not verified.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Requirement items: S110.21
- Detail: Claude partly, ChatGPT partly; AGI off by decision

## GAP-CAP-synchronization-and-continuity-17

**Pull a cloud session into the terminal or desktop: Web S110.23 is Partial because cloud execution is off; CLI cannot apply results.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F068-06](../../20-features/068-session-continuity-and-remote-session-product/F068-06-bring-cloud-results-back-and-continue-cloud-work-f.md), [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Requirement items: S110.23, S68.17
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-synchronization-and-continuity-18

**Send a local session to the cloud: No explicit handoff screen on Web, Desktop or Mobile; cloud session creation depends on a production switch.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F068-05](../../20-features/068-session-continuity-and-remote-session-product/F068-05-hand-a-local-session-to-the-cloud.md), [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Requirement items: S110.22, S68.16, S68.18
- Detail: Claude yes, ChatGPT no; AGI partly built

## GAP-CAP-synchronization-and-continuity-20

**Move a terminal session to the desktop app and between CLI, desktop and IDE: Ledger and comparison disagree on Desktop-IDE sharing; needs a person to check. Task plan and checkpoints are not shared on Web, Desktop or Mobile (S68.07). The --desktop flag is Missing (C364).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F068-01](../../20-features/068-session-continuity-and-remote-session-product/F068-01-one-session-on-every-client.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Requirement items: S110.19, S110.20, S68.01, S68.02, S68.03, S68.04
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-F110-01-01

**No one-step 'document to presentation' control**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-01](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-01-editable-chat-documents-and-slide-decks.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome users. Work needed: Add an action that converts a document artifact into a deck and keep both linked
- Evidence: No such control found in ArtifactPreview.tsx or presentation folder; tool takes slides only (managed-office-file-service.ts:142-146)

## GAP-F110-01-02

**Web deck artifact cannot be exported as .pptx**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-01](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-01-editable-chat-documents-and-slide-decks.md)
- Detail: Affects: Web and Desktop users who build decks in the panel. Work needed: Add a .pptx export or route the deck through the office tool
- Evidence: Deck downloads are HTML and PDF only (ArtifactPreview.tsx:1367-1383)

## GAP-F110-01-03

**Mobile has no rich document editor**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-01](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-01-editable-chat-documents-and-slide-decks.md)
- Detail: Affects: Mobile users. Work needed: Decide whether to build a rich editor; update the brief status from missing to partial
- Evidence: ArtifactFullScreen.tsx:2016 plain TextInput

## GAP-F110-01-04

**Upload scanner not provisioned blocks uploaded-document edits in production**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-01](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-01-editable-chat-documents-and-slide-decks.md)
- Detail: Affects: Web and Desktop users. Work needed: Owner provisions the scanner address (setting UPLOAD_SCAN_WEBHOOK_URL)
- Evidence: upload-scan.ts:408-430; brief S110.02 Unfinished

## GAP-F110-01-05

**Empty, waiting and failure states and plan limits for file creation not established**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-01](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-01-editable-chat-documents-and-slide-decks.md)
- Detail: Affects: All apps. Work needed: Read stream recovery code and define limits in the subscription catalog
- Evidence: No plan rule found beyond Free refusal

## GAP-F110-01-06

**CLI, VS Code cannot create or edit documents or decks**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-01](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-01-editable-chat-documents-and-slide-decks.md)
- Detail: Affects: CLI and VS Code users. Work needed: Decide scope; brief marks them missing
- Evidence: documents.rs reads only

## GAP-F110-01-07

**Chrome document editing unverified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-01](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-01-editable-chat-documents-and-slide-decks.md)
- Detail: Affects: Chrome users. Work needed: Confirm requirement and test
- Evidence: No editing code in artifactPanel.ts

## GAP-F110-01-NOTBUILT

**Editable chat documents and slide decks: not built on Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code
- Features: [F110-01](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-01-editable-chat-documents-and-slide-decks.md)
- Requirement items: S110.01, S110.02
- Detail: Mobile: S110.01; CLI: S110.02; VS Code: S110.02

## GAP-F110-01-PARTLY

**Editable chat documents and slide decks: partly built on Web, Desktop, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Chrome
- Features: [F110-01](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-01-editable-chat-documents-and-slide-decks.md)
- Requirement items: S110.01, S110.02
- Detail: Web S110.02: owner: provision the antivirus scanner endpoint and set UPLOAD_SCAN_WEBHOOK_URL (and UPLOAD_SCAN_WEBHOOK_TOKEN if needed); production refuses uploads without it (apps/web/lib/security/upload-scan.ts:264-282) | Desktop S110.02: owner: provision the antivirus scanner endpoint and set UPLOAD_SCAN_WEBHOOK_URL (and UPLOAD_SCAN_WEBHOOK_TOKEN if needed); production refuses uploads without it (apps/web/lib/security/upload-scan.ts:264-282)

## GAP-F110-02-01

**Chart inside a Word report has no native path and the template contents are unverified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-02](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-02-spreadsheet-analysis-charts-and-reports.md)
- Detail: Affects: Web, Desktop. Work needed: Live check with the real template or add image support to the Word builder
- Evidence: No image support in managed-office-file-service.ts; chat-template.ts reads a name only

## GAP-F110-02-02

**Sandbox switch-on is a server task**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-02](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-02-spreadsheet-analysis-charts-and-reports.md)
- Detail: Affects: Web, Desktop. Work needed: Owner sets the settings and runs the live check
- Evidence: gate.ts:20-28; brief S110.03 Unfinished

## GAP-F110-02-03

**No spreadsheet analysis on CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-02](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-02-spreadsheet-analysis-charts-and-reports.md)
- Detail: Affects: Those apps. Work needed: Decide scope
- Evidence: No code found

## GAP-F110-02-04

**Empty, waiting and failure states and plan limits unknown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-02](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-02-spreadsheet-analysis-charts-and-reports.md)
- Detail: Affects: All. Work needed: Read the client code for code-run states and add plan rules
- Evidence: Not found

## GAP-F110-02-05

**Brief cites ArtifactFullScreen.tsx:1012 for mobile charts, but line 1012 is a save call; chart display is at 1887**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-02](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-02-spreadsheet-analysis-charts-and-reports.md)
- Detail: Affects: Documentation. Work needed: Update the brief reference
- Evidence: ArtifactFullScreen.tsx:1012, 1887

## GAP-F110-02-NOTBUILT

**Spreadsheet analysis, charts and reports: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F110-02](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-02-spreadsheet-analysis-charts-and-reports.md)
- Requirement items: S110.03
- Detail: CLI: S110.03; VS Code: S110.03; Chrome: S110.03

## GAP-F110-02-PARTLY

**Spreadsheet analysis, charts and reports: partly built on Web, Desktop, Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F110-02](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-02-spreadsheet-analysis-charts-and-reports.md)
- Requirement items: S110.03
- Detail: Web S110.03: switch-on: set AGI_E2B_EXECUTION=1, E2B_API_KEY, AGI_E2B_CHAT_TEMPLATE and UPLOAD_SCAN_WEBHOOK_URL; then live-check a chart-into-docx prompt on an uploaded xlsx (template has python-docx and matplotlib) | Desktop S110.03: switch-on: set AGI_E2B_EXECUTION=1, E2B_API_KEY, AGI_E2B_CHAT_TEMPLATE and UPLOAD_SCAN_WEBHOOK_URL; then live-check a chart-into-docx prompt on an uploaded xlsx (template has python-docx and matplotlib) | Mobile S110.03: chart artifacts now draw as charts on the phone (shared parser in @agiworkforce/types); the chart-in-report part is the web switch-on: AGI_E2B_EXECUTION=1 with E2B keys

## GAP-F110-03-01

**Audio overview does not exist**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-03](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-03-research-outputs-audio-overview-and-interactive-pa.md)
- Detail: Affects: All six apps. Work needed: Product decision, then build speech overview, player and plan rules
- Evidence: No code; brief S110.04 missing everywhere

## GAP-F110-03-02

**No one-step research to interactive page**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-03](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-03-research-outputs-audio-overview-and-interactive-pa.md)
- Detail: Affects: Web, Desktop. Work needed: Add the action or correct the brief
- Evidence: No conversion control found; brief says done

## GAP-F110-03-03

**Mobile can publish artifacts but cannot create the page from research in one step; brief says mobile missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-03](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-03-research-outputs-audio-overview-and-interactive-pa.md)
- Detail: Affects: Mobile. Work needed: Update brief status to partial for publish
- Evidence: ArtifactFullScreen.tsx:257-272

## GAP-F110-03-04

**Brief citations stale: research-plan.ts:97 and visual-intent.ts:104**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-03](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-03-research-outputs-audio-overview-and-interactive-pa.md)
- Detail: Affects: Documentation. Work needed: Correct the references
- Evidence: research-plan.ts:97 and visual-intent.ts:100-125 read

## GAP-F110-03-05

**Empty, waiting, failure states and plan limits not established**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-03](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-03-research-outputs-audio-overview-and-interactive-pa.md)
- Detail: Affects: All. Work needed: Define and test
- Evidence: Not found

## GAP-F110-03-NOTBUILT

**Research outputs: audio overview and interactive page: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F110-03](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-03-research-outputs-audio-overview-and-interactive-pa.md)
- Requirement items: S110.04, S110.05
- Detail: Web: S110.04; Desktop: S110.04; CLI: S110.04, S110.05; VS Code: S110.04, S110.05; Chrome: S110.04, S110.05

## GAP-F110-04-01

**No one-step edited image to video bridge**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-04](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-04-image-to-video.md)
- Detail: Affects: Web, Desktop. Work needed: Add an action that passes the edited image into video mode
- Evidence: No code found linking ImageGenerationCard to video mode

## GAP-F110-04-02

**Brief says missing; code has both halves**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-04](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-04-image-to-video.md)
- Detail: Affects: Documentation. Work needed: Update brief to partial on web
- Evidence: video-input-images.ts; ImageGenerationCard.tsx

## GAP-F110-04-03

**Video off on mobile v1**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-04](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-04-image-to-video.md)
- Detail: Affects: Mobile. Work needed: Owner decision
- Evidence: v1FeatureFlags.ts:28

## GAP-F110-04-04

**CLI and Chrome have no flow**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-04](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-04-image-to-video.md)
- Detail: Affects: CLI, Chrome. Work needed: Decide scope
- Evidence: none found

## GAP-F110-04-05

**Edit-image support depends on the model (supports_edit)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-04](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-04-image-to-video.md)
- Detail: Affects: Web. Work needed: Document which models qualify
- Evidence: ImageGenerationCard.tsx:420

## GAP-F110-04-NOTBUILT

**Image to video: not built on CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, Chrome
- Features: [F110-04](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-04-image-to-video.md)
- Requirement items: S110.06
- Detail: CLI: S110.06; Chrome: S110.06

## GAP-F110-05-01

**Brief says CLI done for task and document; code only sends transcribed text**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-05](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-05-voice-requests-that-start-work-or-make-documents.md)
- Detail: Affects: CLI users. Work needed: Correct brief or add a hand-off
- Evidence: voice.rs:249-270; no work-task or document tool in CLI voice

## GAP-F110-05-02

**Brief says mobile document missing; code has open buttons for voice files**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-05](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-05-voice-requests-that-start-work-or-make-documents.md)
- Detail: Affects: Mobile. Work needed: Update brief to done; test
- Evidence: VoiceToolFiles.tsx; LiveVoiceBar.tsx:505

## GAP-F110-05-03

**Tracked in Tasks not verified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-05](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-05-voice-requests-that-start-work-or-make-documents.md)
- Detail: Affects: Web, Mobile, Desktop. Work needed: Trace the work-mode send to the Tasks list and test it
- Evidence: Only a description string says so (live-voice-tools.ts:343-350)

## GAP-F110-05-04

**Voice office tool lacks attachments and render check**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-05](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-05-voice-requests-that-start-work-or-make-documents.md)
- Detail: Affects: Web, Mobile. Work needed: Pass attachments and executor
- Evidence: live-voice-tool-runner.ts:155

## GAP-F110-05-05

**Experience contract table is out of date for Web and Desktop voice**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-05](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-05-voice-requests-that-start-work-or-make-documents.md)
- Detail: Affects: Docs. Work needed: Update the document
- Evidence: docs/product/experience-contract.md:641 versus VoiceModeSurface code

## GAP-F110-05-06

**No VS Code or Chrome voice**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-05](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-05-voice-requests-that-start-work-or-make-documents.md)
- Detail: Affects: VS Code, Chrome. Work needed: Decide scope
- Evidence: none found

## GAP-F110-05-07

**Desktop behaviour not verified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-05](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-05-voice-requests-that-start-work-or-make-documents.md)
- Detail: Affects: Desktop. Work needed: Run on the desktop build
- Evidence: Hosted web app [inferred]

## GAP-F110-05-NOTBUILT

**Voice requests that start work or make documents: not built on Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code, Chrome
- Features: [F110-05](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-05-voice-requests-that-start-work-or-make-documents.md)
- Requirement items: S110.07, S110.08
- Detail: Mobile: S110.08; VS Code: S110.07, S110.08; Chrome: S110.07, S110.08

## GAP-F110-06-01

**Browser page to Project source is not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-06](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-06-projects-saved-sources-and-answers.md)
- Detail: Affects: All six apps. Work needed: Design capture, add per-app control, store as knowledge file
- Evidence: No code; brief S110.09 missing; share-preview/index.tsx:49 only summarizes

## GAP-F110-06-02

**Save to Project missing on mobile, CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-06](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-06-projects-saved-sources-and-answers.md)
- Detail: Affects: Those apps. Work needed: Add the action per app; brief says desktop done through web
- Evidence: Only web save found (WebChatPage.tsx:6156-6172)

## GAP-F110-06-03

**Whole chat save not found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-06](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-06-projects-saved-sources-and-answers.md)
- Detail: Affects: Web. Work needed: Decide and build
- Evidence: Only answer save found

## GAP-F110-06-04

**Brief grounding cite is wrong**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-06](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-06-projects-saved-sources-and-answers.md)
- Detail: Affects: Docs. Work needed: Point to 3853-3892
- Evidence: request-processor.ts:2548 is not grounding

## GAP-F110-06-05

**Attach status on CLI, VS Code, Chrome taken from the brief only**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-06](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-06-projects-saved-sources-and-answers.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Read and test each app attach flow
- Evidence: Brief cites chat.rs:777 and chatExecutionStore.ts:2219 which are unrelated; real code found elsewhere

## GAP-F110-06-06

**Empty, waiting and failure states and offline behaviour not established**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-06](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-06-projects-saved-sources-and-answers.md)
- Detail: Affects: All. Work needed: Define and test
- Evidence: Not found

## GAP-F110-06-NOTBUILT

**Projects: saved sources and answers: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F110-06](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-06-projects-saved-sources-and-answers.md)
- Requirement items: S110.09, S110.25
- Detail: Web: S110.09; Desktop: S110.09; Mobile: S110.09, S110.25; CLI: S110.09, S110.25; VS Code: S110.09, S110.25; Chrome: S110.09, S110.25

## GAP-F110-07-01

**Plugin conversion from a custom assistant does not exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-07](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-07-skills-and-routines-from-a-finished-task.md)
- Detail: Affects: All six apps. Work needed: Define what a custom assistant is in the data model, then build a converter and a save path to the plugin store.
- Evidence: No code found (searches listed above); brief S110.16 all missing

## GAP-F110-07-02

**No save-as-skill or routine entry on mobile, VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-07](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-07-skills-and-routines-from-a-finished-task.md)
- Detail: Affects: Mobile, VS Code, Chrome. Work needed: Decide per app (some may stay out by decision) and add an entry that opens the shared skills save path.
- Evidence: No matches in apps/mobile/src, apps/extension-vscode/src, apps/extension/src

## GAP-F110-07-03

**Web and desktop routine path ends at a prefilled form, not a created routine; the brief says missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-07](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-07-skills-and-routines-from-a-finished-task.md)
- Detail: Affects: Web, desktop. Work needed: Update the brief to partial and decide whether one-step creation is required.
- Evidence: schedule-from-turn.ts:21; brief S110.15

## GAP-F110-07-04

**The CLI skill and routine commands are prompts only; success depends on the model following them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-07](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-07-skills-and-routines-from-a-finished-task.md)
- Detail: Affects: CLI. Work needed: Add a test that drives the command end to end, or a deterministic writer.
- Evidence: claude_parity.rs:891-908

## GAP-F110-07-05

**Draft card Save as a skill is hidden for multi-skill drafts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-07](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-07-skills-and-routines-from-a-finished-task.md)
- Detail: Affects: Web, desktop. Work needed: Confirm this is intended; a plugin save is the only path for several skills.
- Evidence: PluginDraftCard.tsx:140

## GAP-F110-07-NOTBUILT

**Skills and routines from a finished task: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F110-07](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-07-skills-and-routines-from-a-finished-task.md)
- Requirement items: S110.14, S110.15, S110.16
- Detail: Web: S110.15, S110.16; Desktop: S110.15, S110.16; Mobile: S110.14, S110.15, S110.16; CLI: S110.16; VS Code: S110.14, S110.15, S110.16; Chrome: S110.14, S110.15, S110.16

## GAP-F110-08-01

**Gmail triggers are gated off while connectors are coming soon.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-08](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-08-email-and-github-mentions-start-tracked-work.md)
- Detail: Affects: Web, desktop, CLI. Work needed: Release connectors or release Gmail selectively, then run a live check; update the brief.
- Evidence: connector-release.ts:14; trigger-service.ts:302

## GAP-F110-08-02

**Email is not read as a thread, and no forward or addressed intake exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-08](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-08-email-and-github-mentions-start-tracked-work.md)
- Detail: Affects: All apps. Work needed: Fetch the thread for each run; the forward address stays out by decision.
- Evidence: gmail-watch.ts:414, 430; docs/decisions/2026-09-27-founder-decisions.md:164-168

## GAP-F110-08-03

**A GitHub coding task is silently dropped when pr_review_enabled is false.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-08](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-08-email-and-github-mentions-start-tracked-work.md)
- Detail: Affects: GitHub users. Work needed: Reply with the reason or use a separate setting for tasks.
- Evidence: cloud-code-github-task.ts:191-211

## GAP-F110-08-04

**No intake on mobile, Chrome or VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-08](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-08-email-and-github-mentions-start-tracked-work.md)
- Detail: Affects: Mobile, Chrome, VS Code. Work needed: Decide per app; VS Code defers to the CLI per the brief.
- Evidence: Brief S110.10 and S110.11 statuses

## GAP-F110-08-05

**Team channel mentions other than GitHub (for example a chat tool) not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-08](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-08-email-and-github-mentions-start-tracked-work.md)
- Detail: Affects: All. Work needed: Confirm whether Slack mention intake exists (the Slack source exists for triggers); otherwise build or drop.
- Evidence: Only github/webhook/route.ts opened

## GAP-F110-08-NOTBUILT

**Email and GitHub mentions start tracked work: not built on Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code, Chrome
- Features: [F110-08](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-08-email-and-github-mentions-start-tracked-work.md)
- Requirement items: S110.10, S110.11
- Detail: Mobile: S110.11; VS Code: S110.10, S110.11; Chrome: S110.10

## GAP-F110-08-PARTLY

**Email and GitHub mentions start tracked work: partly built on Web, Desktop, VS Code**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, VS Code
- Features: [F110-08](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-08-email-and-github-mentions-start-tracked-work.md)
- Requirement items: S110.10, S110.11
- Detail: Web S110.11: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Desktop S110.11: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | VS Code S110.10: Inherits CLI limits (operator-gated Gmail, no email intake command); fix belongs to c-cli.

## GAP-F110-09-01

**No design-to-implementation hand-off and no repository review deck.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Detail: Affects: Web, desktop, mobile, VS Code, Chrome. Work needed: Decide scope; for CLI it is already ruled out by decision.
- Evidence: Brief S110.12, S110.13; no code found

## GAP-F110-09-02

**Cloud result to local lacks a review (diff) step; it is a fetch and checkout.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Detail: Affects: VS Code, CLI. Work needed: Add a diff summary before checkout if S110.23 review is required.
- Evidence: context-handoff/index.ts:87-133; code_teleport.rs:150-175

## GAP-F110-09-03

**Hand-off from web, desktop, mobile and Chrome missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Detail: Affects: Those apps. Work needed: Per decision, desktop hands a session to the CLI or VS Code; confirm the rest.
- Evidence: Brief S110.22 statuses

## GAP-F110-09-04

**Brief for CLI cloud-to-local is out of date (teleport exists).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Detail: Affects: Documentation. Work needed: Update the brief and the surface matrix.
- Evidence: lib.rs:917-926

## GAP-F110-09-05

**Features are inert in production until the switch-on work (sandbox env and live check) is done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Detail: Affects: All apps. Work needed: Owner sets AGI_E2B_EXECUTION=1 and E2B_API_KEY and runs a live check; not something code alone fixes.
- Evidence: Brief S110.11, S110.23 Unfinished lines

## GAP-F110-09-NOTBUILT

**Cloud coding sessions: not built on Web, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, CLI, VS Code, Chrome
- Features: [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Requirement items: S110.12, S110.13, S110.22, S110.23
- Detail: Web: S110.13, S110.22; CLI: S110.13, S110.23; VS Code: S110.13; Chrome: S110.12, S110.13, S110.22, S110.23

## GAP-F110-09-PARTLY

**Cloud coding sessions: partly built on Web, VS Code, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, VS Code, Chrome
- Features: [F110-09](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-09-cloud-coding-sessions.md)
- Requirement items: S110.12, S110.22, S110.23
- Detail: Web S110.12: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | Web S110.23: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | VS Code S110.22: Met at parity with claude --cloud (new session from the pushed branch, D-2026-09-28-25); needs AGI_E2B_EXECUTION=1. | VS Code S110.23: Bring the branch in pulls a cloud session's branch after review; nee

## GAP-F110-10-01

**Phone dispatch cannot run in the v1 build although the brief says mobile done.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: Affects: Mobile. Work needed: Correct the brief; re-enable only by owner decision.
- Evidence: v1FeatureFlags.ts:12, 16; companion/index.tsx:183

## GAP-F110-10-02

**No test found that desktop and VS Code read the same session store as the CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: Affects: Desktop, VS Code, CLI. Work needed: Add a cross-app test or a recorded manual check.
- Evidence: Searches of the desktop and VS Code test folders found session service tests but none named for cross-app store parity

## GAP-F110-10-03

**CLI cannot start a task on another computer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: Affects: CLI. Work needed: Decide; the CLI decision list may rule it out (not checked).
- Evidence: Brief S110.21 cli missing

## GAP-F110-10-04

**Empty, waiting and failure states for the session lists were not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: Affects: Desktop, VS Code. Work needed: Review and record.
- Evidence: Not opened

## GAP-F110-10-NOTBUILT

**Moving work between devices: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Requirement items: S110.21
- Detail: CLI: S110.21

## GAP-F110-11-01

**No connector connect card in VS Code and Chrome; the brief points at MCP reconnect code in VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-11](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-11-usage-limit-recovery-and-reconnecting-a-connected.md)
- Detail: Affects: VS Code, Chrome. Work needed: Add the shared card or record a decision.
- Evidence: Searches found the reader only in web, mobile, shared UI and the CLI

## GAP-F110-11-02

**No automatic resume after reconnect.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-11](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-11-usage-limit-recovery-and-reconnecting-a-connected.md)
- Detail: Affects: All apps. Work needed: None if the decision stands; update the brief's Should line.
- Evidence: docs/decisions/2026-09-27-founder-decisions.md:353-360

## GAP-F110-11-03

**Reset reminder only on web (not desktop host).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-11](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-11-usage-limit-recovery-and-reconnecting-a-connected.md)
- Detail: Affects: Desktop, mobile, CLI, VS Code, Chrome. Work needed: Decide per app.
- Evidence: WebChatPage.tsx:1815-1817

## GAP-F110-11-04

**No test file found for InlinePaywallCard itself.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-11](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-11-usage-limit-recovery-and-reconnecting-a-connected.md)
- Detail: Affects: Web. Work needed: Add a component test for the card variants.
- Evidence: File search by name returned only the mobile sheet test

## GAP-F110-11-05

**One-step recovery is advice only in the CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-11](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-11-usage-limit-recovery-and-reconnecting-a-connected.md)
- Detail: Affects: CLI. Work needed: Optional: add a rerun suggestion.
- Evidence: errors.rs:640-710

## GAP-F110-12-01

**Skills cannot be shared to a workspace from the sharing section; only projects have a can-edit level.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-12](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-12-sharing-forking-and-publishing.md)
- Detail: Affects: Web, desktop. Work needed: Decide whether skills share through workspace plugins; otherwise add a section.
- Evidence: OrganizationSharingSection.tsx has no skill section; brief S110.30

## GAP-F110-12-02

**Viewer-authorized connected apps are unverified end to end; brief says missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-12](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-12-sharing-forking-and-publishing.md)
- Detail: Affects: Web, desktop. Work needed: Live check on a non-public share; update the brief.
- Evidence: runtime routes and consent UI exist; PublishedArtifactView.tsx:267-297

## GAP-F110-12-03

**Mobile has no fork of shared conversations or artifacts; published-version restore on mobile not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-12](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-12-sharing-forking-and-publishing.md)
- Detail: Affects: Mobile. Work needed: Add fork on mobile and wire the published version list if required.
- Evidence: Brief S110.29; ArtifactFullScreen.tsx:560-563

## GAP-F110-12-04

**No versioning, fork or workspace sharing on CLI and VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-12](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-12-sharing-forking-and-publishing.md)
- Detail: Affects: CLI, VS Code. Work needed: Likely out of scope per the CLI and VS Code decisions; record it.
- Evidence: Brief S110.28, S110.30; nothing found

## GAP-F110-12-05

**Chrome status unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F110-12](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-12-sharing-forking-and-publishing.md)
- Detail: Affects: Chrome. Work needed: Check the Chrome side panel for artifact publishing.
- Evidence: Brief; apps/extension/src/background/site-policy-publication.ts is about site policy, not artifacts [inferred from its name]

## GAP-F110-12-NOTBUILT

**Sharing, forking and publishing: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F110-12](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-12-sharing-forking-and-publishing.md)
- Requirement items: S110.17, S110.28, S110.29, S110.30
- Detail: Web: S110.17; Desktop: S110.17; Mobile: S110.17, S110.29; CLI: S110.28, S110.29, S110.30; VS Code: S110.28, S110.29; Chrome: S110.17, S110.29, S110.30

## GAP-F110-12-PARTLY

**Sharing, forking and publishing: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F110-12](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-12-sharing-forking-and-publishing.md)
- Requirement items: S110.28
