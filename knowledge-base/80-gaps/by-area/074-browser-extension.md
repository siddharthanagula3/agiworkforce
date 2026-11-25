---
id: "GAPS-AREA-074"
type: "gap-list"
title: "Gaps: Browser extension"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 74. Browser extension

50 open gaps that touch this area. Area page: [20-features/074-browser-extension](../../20-features/074-browser-extension/README.md).

## CMP-X20

**Extension is published in the Chrome Web Store and installable**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F074-11](../../20-features/074-browser-extension/F074-11-limits-recovery-updates-and-accounts.md)
- Detail: Not in the store yet: our own docs say publication was never proven and the site page says coming soon; the release workflow exists but has not been run.
- Evidence: docs/product/competitive-guidance.md:73; apps/extension/docs/chrome-web-store-listing.md:44 (Homepage URL row); .github/workflows/release-chrome-extension.yml:82

## CMP-X21

**Try a demo button and challenge cards on the install page**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F074-11](../../20-features/074-browser-extension/F074-11-limits-recovery-updates-and-accounts.md)
- Detail: No demo or practice challenges; searched: demo, challenge in apps/extension/src.
- Evidence: searched: demo, challenge in apps/extension/src

## CMP-XP33

**Welcome page opens after install with pin, sign-in and what it can and cannot do**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F074-11](../../20-features/074-browser-extension/F074-11-limits-recovery-updates-and-accounts.md)
- Detail: Has no demo or challenge cards Welcome page covers pin, sign-in, what AGI can and cannot do and Get started, but has no demo or challenge cards.
- Evidence: apps/extension/src/features/onboarding/welcome-page.ts:37; apps/extension/src/background.ts:384

## CMP-XP34

**Works in other browsers (Edge, Brave, Vivaldi, Opera)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F074-11](../../20-features/074-browser-extension/F074-11-limits-recovery-updates-and-accounts.md)
- Detail: No Edge step in the release workflow and nothing for Brave, Vivaldi or Opera Same package can go to Edge Add-ons by a manual script and runbook; no Edge step in the release workflow and nothing for Brave, Vivaldi or Opera.
- Evidence: docs/runbooks/chrome-web-store-publish.md:490; apps/extension/scripts/publish-edge-addons.mjs:14; searched: edge, brave, vivaldi in .github/workflows/release-chrome-extension.yml:82

## GAP-AREA074-LW07

**Update notice missing: the worker opens the welcome page on first install only; no update notice is shown after an update.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-074
- Detail: Area 74. Browser extension
- Evidence: apps/extension/src/background.ts:7694-7701

## GAP-CAP-apps-and-install-13

**Browser extension install and store updates: Not in the store; no update notice (S74.24 missing); no browser-differences note (S74.27 missing).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F074-11](../../20-features/074-browser-extension/F074-11-limits-recovery-updates-and-accounts.md)
- Requirement items: S74.24, S74.27
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F074-01-01

**No toolbar popup for quick actions (S74.02).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-01](../../20-features/074-browser-extension/F074-01-open-the-assistant.md)
- Detail: Affects: surface:chrome users who expect a quick-action popup. Work needed: Decide if wanted; if yes design the popup and move the open logic, since a popup stops the click event.
- Evidence: apps/extension/manifest.json:52-60 has no default popup; brief S74.02 status chrome missing

## GAP-F074-01-02

**Toolbar open failure is silent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-01](../../20-features/074-browser-extension/F074-01-open-the-assistant.md)
- Detail: Affects: surface:chrome. Work needed: Show a notification or badge when the panel cannot open.
- Evidence: apps/extension/src/background.ts:7678-7680 logs only

## GAP-F074-01-03

**No in-product message for private windows (related to S74.26).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-01](../../20-features/074-browser-extension/F074-01-open-the-assistant.md)
- Detail: Affects: surface:chrome. Work needed: Add explanatory copy (for example on the welcome or options page).
- Evidence: apps/extension/manifest.json:9; brief S74.26 chrome missing

## GAP-F074-01-NOTBUILT

**Open the assistant: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F074-01](../../20-features/074-browser-extension/F074-01-open-the-assistant.md)
- Requirement items: S74.02
- Detail: Chrome: S74.02

## GAP-F074-02-01

**Explain, Translate and Ask do not send automatically.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-02](../../20-features/074-browser-extension/F074-02-ask-about-selected-text-and-right-click-actions.md)
- Detail: Affects: surface:chrome users who expect an immediate answer. Work needed: Product decision; if instant answers are wanted, add an optional setting.
- Evidence: apps/extension/src/side_panel.ts:16491-16503; test title 'attaches redacted selection, preserves the draft and waits for Send' (ask-about-page-menu.test.ts:440)

## GAP-F074-02-02

**Expired pending requests give no message.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-02](../../20-features/074-browser-extension/F074-02-ask-about-selected-text-and-right-click-actions.md)
- Detail: Affects: surface:chrome. Work needed: Show a notice.
- Evidence: side_panel.ts:16567 returns silently

## GAP-F074-02-03

**Menu titles were only checked in the English locale file.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-02](../../20-features/074-browser-extension/F074-02-ask-about-selected-text-and-right-click-actions.md)
- Detail: Affects: surface:chrome non-English users. Work needed: Check other locales exist under apps/extension/_locales.
- Evidence: Only apps/extension/_locales/en was read

## GAP-F074-03-01

**Video summary exists only in the in-page panel on approved sites.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-03](../../20-features/074-browser-extension/F074-03-ask-about-the-page-summaries-and-videos.md)
- Detail: Affects: surface:chrome users who stay in the side panel. Work needed: Add caption reading to the side panel or a clear pointer to the overlay.
- Evidence: readYouTubeTranscript is imported only in features/content/in-page-panel/panel.ts

## GAP-F074-03-02

**Videos without captions and non-YouTube videos are unsupported.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-03](../../20-features/074-browser-extension/F074-03-ask-about-the-page-summaries-and-videos.md)
- Detail: Affects: surface:chrome. Work needed: Product decision on other sources.
- Evidence: youtubeTranscript.ts:290-300; pageActions.ts:93-104

## GAP-F074-03-03

**No test found for the caption parser.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-03](../../20-features/074-browser-extension/F074-03-ask-about-the-page-summaries-and-videos.md)
- Detail: Affects: quality of S74.08. Work needed: Add parser tests with recorded watch-page fixtures.
- Evidence: Only inPagePanel.test.ts mentions YouTube, and it checks chips

## GAP-F074-04-01

**Brief says tab picker (S74.09) and multi-tab comparison (S74.10) are missing, but a picker and merged context exist.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-04](../../20-features/074-browser-extension/F074-04-attach-tabs-and-page-chips.md)
- Detail: Affects: documentation and planning for surface:chrome. Work needed: Correct the brief status; decide if a dedicated compare control is needed.
- Evidence: apps/extension/src/features/side-panel/tabContext.ts:52-130; side_panel.ts:1860-1880

## GAP-F074-04-02

**Only tabs of the current window can be attached.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-04](../../20-features/074-browser-extension/F074-04-attach-tabs-and-page-chips.md)
- Detail: Affects: surface:chrome multi-window users. Work needed: Optional all-windows list.
- Evidence: side_panel.ts:14472 uses pageWindowQuery

## GAP-F074-04-03

**Text of each tab is shortened as the number of tabs grows (30,000 total).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-04](../../20-features/074-browser-extension/F074-04-attach-tabs-and-page-chips.md)
- Detail: Affects: surface:chrome users comparing long pages. Work needed: Product decision on budgets.
- Evidence: side_panel.ts:15003

## GAP-F074-04-NOTBUILT

**Attach tabs and page chips: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F074-04](../../20-features/074-browser-extension/F074-04-attach-tabs-and-page-chips.md)
- Requirement items: S74.09, S74.10
- Detail: Chrome: S74.09, S74.10

## GAP-F074-05-01

**Local chats expire after 30 days with no notice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-05](../../20-features/074-browser-extension/F074-05-conversations.md)
- Detail: Affects: surface:chrome users. Work needed: Notice or setting; confirm intended.
- Evidence: conversation-history.ts:60, 863-866

## GAP-F074-05-02

**Sync behaviour was not verified in full.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-05](../../20-features/074-browser-extension/F074-05-conversations.md)
- Detail: Affects: documentation accuracy. Work needed: Read sync code and tests and document the rules.
- Evidence: conversationSync.ts only skimmed

## GAP-F074-05-03

**Archive hidden for chats not yet synced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-05](../../20-features/074-browser-extension/F074-05-conversations.md)
- Detail: Affects: surface:chrome signed-in users with local-only chats. Work needed: Decide if local archive is wanted.
- Evidence: side_panel.ts:12731-12732

## GAP-F074-05-04

**Permanent delete has no Recently deleted holding area.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-05](../../20-features/074-browser-extension/F074-05-conversations.md)
- Detail: Affects: surface:chrome. Work needed: Product decision against AGENTS.md section 9 intent.
- Evidence: messages.json:295-300 says cannot be recovered

## GAP-F074-06-01

**Always allow is not offered for reading, only acting.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-06](../../20-features/074-browser-extension/F074-06-site-access-and-site-permissions.md)
- Detail: Affects: surface:chrome people who read the same site often. Work needed: Confirm intent; document it or add a read-only approval.
- Evidence: features/side-panel/bubbles.ts:1417-1424

## GAP-F074-06-02

**No place in Options was found that lists leftover Chrome host grants beyond approved sites.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-06](../../20-features/074-browser-extension/F074-06-site-access-and-site-permissions.md)
- Detail: Affects: surface:chrome. Work needed: Optional list or link to chrome://extensions.
- Evidence: options.ts allowlist section lists approved sites only (1380-1560)

## GAP-F074-06-03

**Private/incognito and browser-difference messaging missing (S74.26, S74.27).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-06](../../20-features/074-browser-extension/F074-06-site-access-and-site-permissions.md)
- Detail: Affects: surface:chrome. Work needed: Add copy.
- Evidence: Brief items chrome missing; manifest.json:9

## GAP-F074-06-04

**How the local copy of the org policy is delivered was not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-06](../../20-features/074-browser-extension/F074-06-site-access-and-site-permissions.md)
- Detail: Affects: admin documentation. Work needed: Trace the writer.
- Evidence: features/site-policy/store.ts comment mentions a workspace copy synced by the signed-in surface

## GAP-F074-07-01

**No Local or own-key route for browser control; only AGI Cloud models.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-07](../../20-features/074-browser-extension/F074-07-browser-control-the-assistant-acts-on-a-page.md)
- Detail: Affects: People who want browser tasks without a Cloud account, and the three-mode product requirement, on surface:chrome.. Work needed: Product decision on whether extension browser control should offer Local (through the paired desktop) or own-key; then routing work.
- Evidence: cloudAgentClient.ts:317-340 is the only model call; legacy provider credentials are cleaned up (test legacy-provider-credential-cleanup.test.ts name only).

## GAP-F074-07-02

**Plan or entitlement for browser control is not checked in the extension; only model access and gateway refusal decide.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-07](../../20-features/074-browser-extension/F074-07-browser-control-the-assistant-acts-on-a-page.md)
- Detail: Affects: surface:chrome users on plans that should not have browser control; subscription consistency.. Work needed: Confirm the server rule, then read the capability document in the panel and show a clear upgrade or denial message.
- Evidence: No use of canUseBrowserAutomation in apps/extension/src; background.ts:6389-6399 checks models only.

## GAP-F074-07-03

**Page indicator that names the driven page appears only for chat-started tasks.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-07](../../20-features/074-browser-extension/F074-07-browser-control-the-assistant-acts-on-a-page.md)
- Detail: Affects: People starting from the Computer Use tab.. Work needed: Feed the Computer Use run's tab into updateAgentPageIndicator.
- Evidence: side_panel.ts:10857-10885 uses composerBrowserRun.

## GAP-F074-07-04

**Hard-coded English labels in the Computer Use panel.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-07](../../20-features/074-browser-extension/F074-07-browser-control-the-assistant-acts-on-a-page.md)
- Detail: Affects: Non-English users of surface:chrome.. Work needed: Move strings to locale keys.
- Evidence: computerUsePanel.ts:1190-1240, 1585-1650.

## GAP-F074-07-05

**No recorded end-to-end run of the whole feature.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-07](../../20-features/074-browser-extension/F074-07-browser-control-the-assistant-acts-on-a-page.md)
- Detail: Affects: Release confidence.. Work needed: Run the scenarios above on a real build and record them.
- Evidence: No result file found; only unit tests and apps/extension/e2e/smoke.mjs (not opened).

## GAP-F074-08-01

**Bridge token paste path has no screen.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-08](../../20-features/074-browser-extension/F074-08-desktop-app-pairing-and-connection-status.md)
- Detail: Affects: Operators who cannot see the Desktop window; surface:chrome.. Work needed: Add the field or remove the path and message.
- Evidence: storeBridgeSecret is called only from tests; error text pairing.ts:411-417 points to a field that does not exist.

## GAP-F074-08-02

**Desktop copy and extension labels disagree on where pairing starts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-08](../../20-features/074-browser-extension/F074-08-desktop-app-pairing-and-connection-status.md)
- Detail: Affects: People following the desktop instructions; surface:desktop and surface:chrome.. Work needed: Change one side, or add a side panel entry that opens the Options anchor.
- Evidence: BrowserPairingSection.tsx:14-17 says side panel, 'Connect to Desktop'; the extension has 'Pair with Desktop' in Options.

## GAP-F074-08-03

**Reconnect button gives no feedback on failure.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-08](../../20-features/074-browser-extension/F074-08-desktop-app-pairing-and-connection-status.md)
- Detail: Affects: surface:chrome side panel.. Work needed: Show a short result or busy state.
- Evidence: side_panel.ts:15646-15649 logs to console only.

## GAP-F074-08-04

**Support for other Chromium browsers and operating systems is not shown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-08](../../20-features/074-browser-extension/F074-08-desktop-app-pairing-and-connection-status.md)
- Detail: Affects: Edge, Brave and non-Mac users.. Work needed: Read the installer and document or test each platform.
- Evidence: Native host name fixed (background.ts:1389); hostInstaller.ts not read.

## GAP-F074-09-01

**Capability gate uses a web-surface account document; the rule for Chrome is not visible.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-09](../../20-features/074-browser-extension/F074-09-voice-dictation.md)
- Detail: Affects: surface:chrome users on plans that deny or allow voice.. Work needed: Read the server rule and the handshake builder; decide if the extension needs its own surface.
- Evidence: capabilityDocument.ts:15 (surface=web); capabilities.ts has no Chrome row.

## GAP-F074-09-02

**One utterance per press, no interim text.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-09](../../20-features/074-browser-extension/F074-09-voice-dictation.md)
- Detail: Affects: Long dictation on surface:chrome.. Work needed: Product decision, then enable continuous recognition.
- Evidence: voice.ts:190-200 sets interimResults false and no continuous mode.

## GAP-F074-09-03

**No on-device or AGI speech option; depends on the browser vendor service and network.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-09](../../20-features/074-browser-extension/F074-09-voice-dictation.md)
- Detail: Affects: Offline users; the product goal of free local inference.. Work needed: Decide whether extension dictation should have a local engine.
- Evidence: spVoiceNotice, spVoiceErrorNetwork.

## GAP-F074-10-01

**No way to save the current page to a Project.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-10](../../20-features/074-browser-extension/F074-10-save-a-page-to-a-project-or-library.md)
- Detail: Affects: surface:chrome users.. Work needed: Design the control, add a client for the Project knowledge route, check permissions and size limits, add tests.
- Evidence: S74.22 marked chrome missing; no code found.

## GAP-F074-10-02

**No way to save the current page to the Library.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-10](../../20-features/074-browser-extension/F074-10-save-a-page-to-a-project-or-library.md)
- Detail: Affects: surface:chrome users; the Library already exists on desktop and mobile.. Work needed: Add a client for the Library POST route, confirm cross-origin access for the extension, add tests.
- Evidence: S74.23 marked missing; docs/product/surface-feature-matrix.md:196-199.

## GAP-F074-10-03

**Unknown fit of server routes for page content.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-10](../../20-features/074-browser-extension/F074-10-save-a-page-to-a-project-or-library.md)
- Detail: Affects: Design of the save.. Work needed: Read the route schemas and decide the payload.
- Evidence: Routes exist (library/route.ts:276-277) but request shape not read.

## GAP-F074-10-NOTBUILT

**Save a page to a Project or Library: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F074-10](../../20-features/074-browser-extension/F074-10-save-a-page-to-a-project-or-library.md)
- Requirement items: S74.22, S74.23
- Detail: Chrome: S74.22, S74.23

## GAP-F074-11-01

**No update notice (S74.24).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-11](../../20-features/074-browser-extension/F074-11-limits-recovery-updates-and-accounts.md)
- Detail: Affects: All surface:chrome users after an update.. Work needed: Handle reason update, show a what-changed card once per version, add a test.
- Evidence: background.ts:7694-7700 handles install only.

## GAP-F074-11-02

**No private-window messaging or control (S74.26).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-11](../../20-features/074-browser-extension/F074-11-limits-recovery-updates-and-accounts.md)
- Detail: Affects: People who expect the extension in private windows.. Work needed: Add help text; decide whether private windows should ever be supported (shared local storage is the stated reason against).
- Evidence: manifest.json:9; no text in locales.

## GAP-F074-11-03

**No explanation of browser differences (S74.27).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-11](../../20-features/074-browser-extension/F074-11-limits-recovery-updates-and-accounts.md)
- Detail: Affects: Edge and other Chromium users.. Work needed: List real differences by testing, then add a short help section.
- Evidence: No code found; Edge publish script exists.

## GAP-F074-11-04

**Blocked card claims administrator-restricted pages are covered, but detection checks fixed prefixes only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-11](../../20-features/074-browser-extension/F074-11-limits-recovery-updates-and-accounts.md)
- Detail: Affects: People on administrator-restricted sites.. Work needed: Confirm where admin policy denials show and align the copy or the detection.
- Evidence: surface-policy.ts:20-45.

## GAP-F074-11-05

**Cloud chat resume endpoint and behaviour not traced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F074-11](../../20-features/074-browser-extension/F074-11-limits-recovery-updates-and-accounts.md)
- Detail: Affects: Confidence in S74.28 for chats.. Work needed: Trace resumeManagedCloudRun and test with a real worker stop.
- Evidence: side_panel.ts:6990.

## GAP-F074-11-NOTBUILT

**Limits, recovery, updates and accounts: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F074-11](../../20-features/074-browser-extension/F074-11-limits-recovery-updates-and-accounts.md)
- Requirement items: S74.24, S74.26, S74.27
- Detail: Chrome: S74.24, S74.26, S74.27
