---
id: "GAPS-AREA-064"
type: "gap-list"
title: "Gaps: Browser-assistant experience"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 64. Browser-assistant experience

122 open gaps that touch this area. Area page: [20-features/064-browser-assistant-experience](../../20-features/064-browser-assistant-experience/README.md).

## CMP-CP87

**Drive Chrome from the CLI (--chrome, @browser)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F064-07](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md), [F064-08](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md), [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: It needs the desktop app and has no --chrome flag The agent has browser tools through the paired AGI Desktop and extension, and /chrome shows pairing state; it needs the desktop app and has no --chrome flag.
- Evidence: apps/cli/src/claude_parity.rs:1752; apps/cli/src/browser_bridge.rs:1-4

## CMP-CP88

**Per-site permission before browser actions**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md), [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md), [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: The terminal has no per-site prompt The desktop app decides each browser command and can refuse; the terminal has no per-site prompt.
- Evidence: apps/cli/src/browser_bridge.rs:1-3,155

## CMP-CP89

**Slash command /chrome**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F064-07](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md), [F064-08](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md), [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: It does not start the connection Reports whether the desktop app and extension are paired and which browser tools work; it does not start the connection.
- Evidence: apps/cli/src/claude_parity.rs:1752

## CMP-D30

**Secure sign-in form and saved-card purchases for the agent**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: The browser agent leaves password and payment fields for you and always asks before purchases; there is no secure form or password manager hand-off.
- Evidence: apps/extension/src/features/computer-use/approvalPolicy.ts:5; apps/desktop/electron/browser/commandGate.ts:249

## CMP-D39

**Browser pane tabs**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: One page at a time; no tabs.
- Evidence: apps/desktop/electron/browserPane.ts (single WebContentsView); searched: tabs in browserPane.ts, LocalBrowserPanel.tsx

## CMP-D40

**Choose the built-in browser or the Chrome extension for tasks**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: No preferred-browser choice; agent browser work uses the paired Chrome extension only.
- Evidence: searched: preferred browser, built-in browser setting in apps/web/features/desktop-host and settings sections

## CMP-D41

**Mark up the page and send it to the chat; point at an element**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: The browser pane cannot capture its page or pick an element; mark-up exists only in the simulator pane.
- Evidence: apps/web/features/code/components/LocalCaptureAnnotator.tsx used by LocalSimulatorPane only; searched: annotate in LocalBrowserPanel.tsx

## CMP-D43

**The assistant reads, clicks and types in the built-in browser**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: Browser work by the agent drives your own Chrome through the paired extension, not the pane; nothing lets it act in the pane.
- Evidence: apps/desktop/electron/runtime/dispatcher.ts (runBrowserCommand to paired Chrome); apps/desktop/electron/browserPane.ts

## CMP-D44

**Annotate pages and send comments, with style adjust controls, to the agent**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: The browser pane has no annotation mode; only the coding pane can capture a screenshot and mark it up.
- Evidence: apps/web/features/code/components/LocalCaptureAnnotator.tsx; searched: annotation mode in apps/desktop/electron/browserPane.ts

## CMP-D45

**Bring your sign-ins over from Chrome, Edge or Firefox**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: Not built; the research note says reading other browsers' sign-ins needs an owner decision on the system prompt, per-site choice and legal wording.
- Evidence: searched: import cookies, cookie import in apps/desktop/electron/browserPane.ts, browserSignIn.ts

## CMP-DP39

**Built-in browser pane inside the app**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: Only inside a coding session on this computer The browser pane exists but only inside a coding session on this computer; it has an address bar, back, forward and reload, one page at a time, and asks before loading each new site.
- Evidence: apps/web/features/code/components/LocalSessionPanel.tsx:1806; apps/desktop/electron/browserPane.ts; apps/web/features/code/components/LocalBrowserPanel.tsx

## CMP-DP40

**Per-site agent permissions for downloads, uploads and risky actions**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md), [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md), [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md), [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: Ours has no per-site download or upload setting: the Chrome agent always asks for those (apps/extension/src/features/co… The leader lets a person set access, downloads and uploads per site to Requires approval, Always allow or Block. Ours has no per-site download or upload setting: the Chrome agent always asks for those (apps/extension/src/features/computer-use/approvalPolicy.ts:5) with one-time or task-long site gran
- Evidence: apps/extension/src/features/computer-use/approvalPolicy.ts:5; apps/extension/src/features/computer-use/oneTimeSiteGrants.ts; apps/desktop/electron/browserPane.ts:182

## CMP-DP43

**Approval duration choice (this turn or this thread) and auto-review of browser actions**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md), [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: There is no thread-long choice or reviewer that approves actions for you Site grants are one-time or for the task, but there is no thread-long choice or reviewer that approves actions for you.
- Evidence: apps/extension/src/features/computer-use/taskSiteGrants.ts; apps/extension/src/features/computer-use/oneTimeSiteGrants.ts

## CMP-DP45

**Site tools (WebMCP): pages expose actions the agent can call**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F064-08](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md)
- Detail: The built-in pane has no tools menu or admin flag The Chrome extension discovers and calls page-registered tools with approval, but the built-in pane has no tools menu or admin flag.
- Evidence: apps/extension/src/webmcp.ts:24; apps/extension/src/features/tools/browserAgentSiteTools.ts:103

## CMP-M59

**Add a site permission**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md), [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: No per-site permission list for the agent.
- Evidence: searched: site permission, add site in apps/mobile/src/features/settings, apps/mobile/src/features/tasks

## CMP-M61

**Browser cookies list**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: No cookies list for the agent browser.
- Evidence: searched: cookies in apps/mobile/src (only a PDF view setting)

## CMP-M62

**Clear all cookies**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: No clear cookies control for the agent.
- Evidence: searched: clear cookies in apps/mobile/src, apps/mobile/app

## CMP-M63

**Cloud browser settings for the agent**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: No settings page for how the cloud agent uses a browser.
- Evidence: searched: cloud browser, cookies, site permission in apps/mobile/src/features/tasks, apps/mobile/src/features/settings, apps/mobile/app/(app)/settings

## CMP-M66

**Default permission for opening websites**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md), [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: No default website permission for the agent.
- Evidence: searched: default permission, websites in apps/mobile/src/features/settings, apps/mobile/src/features/tasks

## CMP-M77

**Cloud browser card in the task with an Open button**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: Agent steps show a browser icon in the timeline only; there is no live browser view to open.
- Evidence: apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:282

## CMP-M78

**Take control of the cloud browser and hand back**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: No take-over or hand-back of an agent browser.
- Evidence: searched: take over, take control, hand back in app, src

## CMP-M79

**Cloud browser availability and per-plan limits**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: No cloud browser feature, so no plan gating for it.
- Evidence: searched: cloud browser in app, src

## CMP-MP53

**Website sign-in through a secure form unseen by the model**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: A task can ask for input or open a link to finish in the browser, with no secure credential form A task can ask for input or open a link to finish in the browser, with no secure credential form.
- Evidence: apps/mobile/src/features/tasks/components/CloudRunInputForm.tsx:60,428

## CMP-W140

**Cloud browser that signs in to sites for Work, with site permissions**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F059-04](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-04-folder-and-website-limits.md), [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: Cloud Work has no cloud browser; browser tools exist only for a paired computer.
- Evidence: searched: cloud browser, site permissions in apps/web lib, features, app; apps/web/lib/tool-copy.ts:272

## CMP-W144

**Admin website blocklist for agent browsing**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md), [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: Only the agent's owner can block sites for one agent; admins have no workspace-wide blocklist for agent browsing.
- Evidence: searched: blockedDomains, blocklist in features/workspace-console; AgentConfigForm.tsx:273-284 is per agent

## CMP-W170

**Take over a dot's cloud browser and hand control back**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F059-10](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-10-take-over-the-agent-s-screen-or-browser.md), [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Take over exists for local Code sessions only; no cloud browser to take over.
- Evidence: apps/web/features/code/local-code.ts:318; searched: takeOver in features/work, tasks

## CMP-W174

**Agent browses on its own cloud browser and keeps working after you leave**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: Our agents have no hosted browser; web tasks use search and page reading only.
- Evidence: searched: cloud browser, browserSession in apps/web/features, lib, packages/ui/unified-chat

## CMP-W176

**Use ChatGPT or Claude in your own Chrome profile with @Chrome**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F064-07](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md), [F064-08](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md), [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: Web chat cannot hand a task to the browser extension; the extension is a separate app.
- Evidence: searched: @chrome in packages/ui/unified-chat ChatInput and SkillMentionPicker; apps/web/app/chrome-extension is a download page

## CMP-WP140

**Agent works in a browser pane beside the chat while you watch**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: On the plain web the agent cannot open a page you can watch The Desktop app has a browser pane the agent drives; on the plain web the agent cannot open a page you can watch.
- Evidence: apps/web/features/desktop-host/components/BrowserPaneSettings.tsx; searched: browser pane in app/chat

## CMP-WP141

**Take control of the browser or computer, then hand back**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Only in the Desktop app and for your own computer, not on the web Computer use has Take over and Hand back, but only in the Desktop app and for your own computer, not on the web.
- Evidence: apps/web/features/desktop-host/components/ComputerUseControlBar.tsx; apps/web/content/support/computer-use.md:59

## CMP-WP142

**Ask before consequential website actions, even on allowed sites**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md), [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md), [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: No extra check for payment or commitment actions Tool actions follow the Manual, Auto or Skip approval modes, but no extra check for payment or commitment actions.
- Evidence: apps/web/lib/tool-approval-view.ts; apps/web/features/chat/components/approvals/ToolApprovalCard.tsx

## CMP-WP143

**Clear the agent browser's cookies and saved sessions in settings**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: The web app has no browser data settings The Desktop app's browser pane has Clear browsing data and allowed and blocked site lists; the web app has no browser data settings.
- Evidence: apps/web/features/desktop-host/components/BrowserPaneSettings.tsx:34-44

## CMP-X11

**Adult and pirated sites blocked**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md), [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: No built-in blocked categories; searched: adult, pirat, gambling.
- Evidence: searched: adult, pirat, gambling, blocked categor in apps/extension/src

## CMP-X13

**Password manager sign-in (1Password) approved by biometrics**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: No password manager sign-in; searched: 1password, passwordManager.
- Evidence: searched: 1password, passwordManager in apps/extension/src (only a sensitive-site label in approvalPolicy.ts)

## CMP-X15

**Site access prompt: allow for all sites**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md), [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: No allow-for-all-sites choice; only one site at a time.
- Evidence: searched: all sites, allowAll in apps/extension/src/features/side-panel/bubbles.ts:1380-1395

## CMP-X16

**Web app chat uses your Chrome tabs through the extension**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F064-07](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md), [F064-08](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md), [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: Our web app cannot reach the extension: the manifest has no externally_connectable entry and apps/web has no code that messages it. Only the side panel itself and the paired desktop app can drive the browser.
- Evidence: searched: externally_connectable in apps/extension/manifest.json; chrome.runtime.sendMessage, extensionId in apps/web/app, apps/web/features, apps/web/lib

## CMP-XP16

**Purchases and payments are not completed for you**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md), [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: Only when the target is a button whose English label matches approvalPolicy.ts:157-158 (completesPurchase 267-269) A refusal exists in code (apps/extension/src/features/computer-use/agentLoop.ts:1536-1546, PURCHASE_REFUSAL) but only when the target is a button whose English label matches approvalPolicy.ts:157-158 (completesPurchase 267-269). press_key is judged by the focused field (agentLoop.ts:1279-1283), so E
- Evidence: apps/extension/src/features/computer-use/crucialActions.ts:15-16; locale spAutonomyFullAccessTooltip

## CMP-XP17

**Runs while you keep working in other tabs**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F064-07](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md), [F064-08](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md), [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: Parallel background errands are not documented for ours Tasks use their own tab and a tab group marks it; parallel background errands are not documented for ours.
- Evidence: apps/extension/src/features/browser-tools/taskTabs.ts:8; apps/extension/src/background.ts:2530

## CMP-XP18

**Works in Edge, Brave, Opera and Vivaldi as well as Chrome**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F064-07](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md), [F064-08](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md), [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: No Brave, Opera or Vivaldi listing or test A Chrome-built Manifest V3 package that is also published to Edge Add-ons; no Brave, Opera or Vivaldi listing or test.
- Evidence: apps/extension/scripts/publish-edge-addons.mjs, publish-chrome-web-store.mjs; searched: Brave, Vivaldi, Opera in apps/extension/src

## CMP-XP19

**Approval history in settings**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F059-03](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-03-remember-a-decision-review-saved-rules-and-see-his.md), [F059-08](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-08-approval-timing-and-resuming-a-run.md), [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md), [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md), [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Nothing in apps/extension/src writes browser decisions The list is not the extension's permission history. It fetches cloud tool approvals from /api/settings/approvals (apps/extension/src/features/options/approval-history-section.ts:196; hint text at 90 says tool requests in chats on every device). Nothing in apps/extension/src writes browser decisions
- Evidence: apps/extension/src/features/options/approval-history-section.ts:81-163

## CMP-XP22

**Financial, banking, investment and crypto sites blocked by default**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md), [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: A built-in list of banking, payment, brokerage and crypto hosts makes every step ask in every mode, and only after the… We do not block these sites. A built-in list of banking, payment, brokerage and crypto hosts makes every step ask in every mode, and only after the user approved the site; the user can add any site to a personal block list.
- Evidence: apps/extension/src/features/computer-use/approvalPolicy.ts:41-77, 134-135, 410-411; apps/extension/src/features/site-policy/userBlocklist.ts:74-93

## CMP-XP23

**Never types passwords, card or ID numbers**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md), [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: Sensitive fields are always asked about rather than blocked Sensitive fields are always asked about rather than blocked.
- Evidence: apps/extension/src/features/computer-use/approvalPolicy.ts:450

## CMP-XP25

**Per-site Browsing and Downloads columns with a Default row**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md), [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: A per-capability table exists only for admin policy One default mode plus a list of approved sites; downloads always ask; a per-capability table exists only for admin policy.
- Evidence: apps/extension/src/options.ts:1291; apps/extension/managed-schema.json:14-30

## CMP-XP29

**Site tools discovered from the page (WebMCP)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F064-08](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md)
- Detail: Every call asks and there is no default-on toggle Agent can discover and call a site's own tools on approved sites; every call asks and there is no default-on toggle.
- Evidence: apps/extension/src/features/computer-use/browserToolDefinitions.ts:72-95; apps/extension/src/features/tools/browserAgentSiteTools.ts:9

## CMP-XP30

**Terminal coding agent drives the browser through the extension**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F064-07](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md), [F064-08](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md), [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: There is no Contradicts row 139 and the search missed it: the CLI drives the browser through the desktop app's bridge (apps/cli/src/browser_bridge.rs:1-2; used at session_browser.rs:154 and claude_parity.rs:1753), and the desktop app relays to the paired extension. It needs the desktop app running; there is no
- Evidence: searched: nativeMessaging, extension, browser bridge in apps/cli/src and crates

## CMP-XP9

**Agent tabs grouped in a coloured tab group**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F064-07](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md), [F064-08](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md), [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: Context tabs are chosen from a picker, not by dragging into the group Task tabs go into a blue AGI group; context tabs are chosen from a picker, not by dragging into the group.
- Evidence: apps/extension/src/background.ts:1377, 2528-2562

## GAP-AREA064-LW10

**Browser pane session always persists (no setting), and clearing data is the only data control.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-064
- Detail: Area 64. Browser-assistant experience
- Evidence: apps/desktop/electron/browserPane.ts:18, 423-427

## GAP-CAP-agent-actions-15

**Cloud browser for the agent: Cloud Work only uses search and page reading. No hosted browser, site settings, cookie list or card in the task.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Requirement items: S64.19
- Detail: Claude yes, ChatGPT yes; AGI not built

## GAP-CAP-agent-actions-16

**Take over and hand back the browser or screen: S64.23 and S64.24 are missing on every app including Chrome; the Chrome extension row is listed Same elsewhere. No take over for a cloud browser.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Requirement items: S64.23, S64.24, S65.21, S65.22
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-17

**Sign-in and human-check handoff: No secure sign-in form, no saved login with confirmation, no password manager.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Requirement items: S64.21, S64.22, S65.24
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-18

**In-app browser pane the agent drives: No tabs, no agent control of the pane, no page annotation, no import of sign-ins.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Requirement items: S64.30, S64.31
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-19

**Agent acting in the user's own browser: Works only in Chrome-built browsers (published to Edge). No background errands, Web chat cannot use the tabs, CLI has no install prompt or per-site permission, no JavaScript run on the page by design.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F064-07](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md), [F064-08](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md), [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Requirement items: S64.10, S64.15, S64.16, S64.18, S64.32
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-agent-actions-20

**Website permissions, blocklists and consequential-action checks: Banking, payment and adult sites are not blocked by default; purchases are refused only in code paths; no allow-for-all-sites choice; Web has no extra check for payments.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md), [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Requirement items: S64.26, S64.27, S64.28, S64.29
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-21

**Site tools (pages that expose actions): The leader has an address bar menu of available tools and an off switch; we have discovery only on approved sites.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F064-08](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md)
- Requirement items: S64.17
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-26

**Visible agent activity, replay and receipts: No live browser preview on Web, Mobile or Desktop; Chrome approval history shows cloud tool approvals, not extension permissions.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Requirement items: S64.18, S64.19, S64.20, S65.25
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F064-01-01

**Brief marks VS Code page reading done but only the toolbar toggle was verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-01](../../20-features/064-browser-assistant-experience/F064-01-ask-about-the-page-you-are-on.md)
- Detail: Affects: VS Code. Work needed: Open the VS Code chat path that renders a browser read and add a test.
- Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:1103-1115

## GAP-F064-01-02

**Mobile cannot read an open browser page and Local mode has no known way to fetch a shared link.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-01](../../20-features/064-browser-assistant-experience/F064-01-ask-about-the-page-you-are-on.md)
- Detail: Affects: Mobile (Local mode). Work needed: Tell Local-mode users plainly that only the link text is sent, or add a local fetch the person approves.
- Evidence: share-preview/index.tsx:227-236; chatExecutionStore.ts:3393

## GAP-F064-01-03

**The Desktop cloud tool device_browser_read_page cannot choose a tab; only the manual dialog can.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-01](../../20-features/064-browser-assistant-experience/F064-01-ask-about-the-page-you-are-on.md)
- Detail: Affects: Desktop. Work needed: Add an optional tab id to the step and to the schema.
- Evidence: apps/web/lib/device-steps/device-tools.ts:361-363; apps/web/features/desktop-host/lib/device-steps.ts:207-222

## GAP-F064-01-04

**Brief code pointers are stale (ComposerPlusMenu.tsx:745, BrowserToolsDialog.tsx:89, dispatcher.ts:594, tool_catalog.rs:961 were not the read-page code).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-01](../../20-features/064-browser-assistant-experience/F064-01-ask-about-the-page-you-are-on.md)
- Detail: Affects: Knowledge base readers. Work needed: Update the brief pointers.
- Evidence: ComposerPlusMenu.tsx:179,1159; BrowserToolsDialog.tsx:131

## GAP-F064-01-05

**No Web-in-browser path; no test for the Desktop 'Read the page' end to end with a real Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-01](../../20-features/064-browser-assistant-experience/F064-01-ask-about-the-page-you-are-on.md)
- Detail: Affects: Web, Desktop. Work needed: Run the verification scenarios with a real paired Chrome and record the result.
- Evidence: ChatComposerNew.tsx:6019

## GAP-F064-02-01

**Stale brief pointers for S64.02.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-02](../../20-features/064-browser-assistant-experience/F064-02-use-selected-text.md)
- Detail: Affects: Knowledge base readers. Work needed: Update the brief with the real paths listed in the implementation map.
- Evidence: apps/extension/src/side_panel.ts:11067-11075 and apps/extension/src/background.ts:4526 hold unrelated code

## GAP-F064-02-02

**Desktop handoff fails when no chat is open.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-02](../../20-features/064-browser-assistant-experience/F064-02-use-selected-text.md)
- Detail: Affects: Desktop. Work needed: Queue the draft or open a new chat.
- Evidence: apps/desktop/electron/browserHandoff.ts:49-52

## GAP-F064-02-03

**No selection-specific entry on Mobile; it relies on the general share sheet.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-02](../../20-features/064-browser-assistant-experience/F064-02-use-selected-text.md)
- Detail: Affects: Mobile. Work needed: Decide if a browser-aware selection action is wanted.
- Evidence: share-preview/index.tsx

## GAP-F064-02-04

**No evidence that VS Code and CLI handoffs were run against a real Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-02](../../20-features/064-browser-assistant-experience/F064-02-use-selected-text.md)
- Detail: Affects: VS Code, CLI. Work needed: Run the scenarios and record the result.
- Evidence: Only unit tests exist

## GAP-F064-03-01

**No explicit compare action or compare prompt; behaviour depends on the model.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-03](../../20-features/064-browser-assistant-experience/F064-03-pick-and-compare-open-tabs.md)
- Detail: Affects: Chrome. Work needed: Add a compare entry point and a test that asserts both tabs reach the request.
- Evidence: side_panel.ts:15008-15060 attaches only

## GAP-F064-03-02

**CLI and VS Code cannot choose a tab.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-03](../../20-features/064-browser-assistant-experience/F064-03-pick-and-compare-open-tabs.md)
- Detail: Affects: CLI, VS Code. Work needed: Expose list tabs and a tab id on browser_read_page.
- Evidence: tool_catalog.rs:51-62

## GAP-F064-03-03

**Desktop cloud-turn read cannot choose a tab.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-03](../../20-features/064-browser-assistant-experience/F064-03-pick-and-compare-open-tabs.md)
- Detail: Affects: Desktop. Work needed: Add optional tab id.
- Evidence: device-tools.ts:361-363

## GAP-F064-03-04

**Brief says desktop and chrome missing, code says present.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-03](../../20-features/064-browser-assistant-experience/F064-03-pick-and-compare-open-tabs.md)
- Detail: Affects: Knowledge base. Work needed: Correct brief rows S64.03 and S64.04.
- Evidence: BrowserToolsDialog.tsx:341-377; side_panel.ts:14968-15060

## GAP-F064-03-05

**The dialog lists one tab only; no multi-select.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-03](../../20-features/064-browser-assistant-experience/F064-03-pick-and-compare-open-tabs.md)
- Detail: Affects: Desktop. Work needed: Decide whether multi-tab is wanted on Desktop.
- Evidence: BrowserToolsDialog.tsx:131-133

## GAP-F064-03-NOTBUILT

**Pick and compare open tabs: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F064-03](../../20-features/064-browser-assistant-experience/F064-03-pick-and-compare-open-tabs.md)
- Requirement items: S64.04
- Detail: CLI: S64.04

## GAP-F064-04-01

**No test for transcript reading or track choice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-04](../../20-features/064-browser-assistant-experience/F064-04-ask-about-a-video-transcript.md)
- Detail: Affects: Chrome. Work needed: Add tests with sample player data for chooseCaptionTrack, timedTextTranscript, panelTranscript.
- Evidence: No test file imports youtubeTranscript.ts (searched apps/extension)

## GAP-F064-04-02

**Free-form questions on a video page do not use captions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-04](../../20-features/064-browser-assistant-experience/F064-04-ask-about-a-video-transcript.md)
- Detail: Affects: Chrome. Work needed: Use the transcript for the text box on a watch page.
- Evidence: panel.ts:558-566

## GAP-F064-04-03

**No transcript on Desktop, Mobile, CLI or the Chrome side panel.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-04](../../20-features/064-browser-assistant-experience/F064-04-ask-about-a-video-transcript.md)
- Detail: Affects: Desktop, Mobile, CLI, Chrome side panel. Work needed: Decide scope; Desktop could reuse the paired Chrome.
- Evidence: No transcript code outside in-page-panel

## GAP-F064-04-04

**Reliance on YouTube's internal page structure.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-04](../../20-features/064-browser-assistant-experience/F064-04-ask-about-a-video-transcript.md)
- Detail: Affects: Chrome. Work needed: Add a monitored check that fails when the structure changes.
- Evidence: youtubeTranscript.ts:241-288

## GAP-F064-04-05

**Draft said the default track is preferred; the code prefers a human track in the spoken language first.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-04](../../20-features/064-browser-assistant-experience/F064-04-ask-about-a-video-transcript.md)
- Detail: Affects: Knowledge base. Work needed: Use the corrected rule.
- Evidence: youtubeTranscript.ts:164-178

## GAP-F064-04-NOTBUILT

**Ask about a video transcript: not built on Desktop, Mobile, CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, Mobile, CLI
- Features: [F064-04](../../20-features/064-browser-assistant-experience/F064-04-ask-about-a-video-transcript.md)
- Requirement items: S64.07
- Detail: Desktop: S64.07; Mobile: S64.07; CLI: S64.07

## GAP-F064-05-01

**History restore, deletion and cloud mirror rules were not opened.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-05](../../20-features/064-browser-assistant-experience/F064-05-side-chat-beside-the-page.md)
- Detail: Affects: Chrome. Work needed: Read and document restore and delete paths.
- Evidence: Only persist and reset code read

## GAP-F064-05-02

**Conversation does not follow the page: it is the same thread on every tab by design.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-05](../../20-features/064-browser-assistant-experience/F064-05-side-chat-beside-the-page.md)
- Detail: Affects: Chrome. Work needed: Decide if a per-tab thread is wanted.
- Evidence: side_panel.ts:16154-16156

## GAP-F064-05-03

**No Local mode for the side chat.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-05](../../20-features/064-browser-assistant-experience/F064-05-side-chat-beside-the-page.md)
- Detail: Affects: Chrome. Work needed: Product decision only.
- Evidence: background.ts:8061

## GAP-F064-06-01

**The brief says Chrome is missing; the feature is built, connected and tested.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-06](../../20-features/064-browser-assistant-experience/F064-06-search-browsing-history-opt-in.md)
- Detail: Affects: Knowledge base readers. Work needed: Correct brief row S64.09 for Chrome; keep Desktop and CLI as missing.
- Evidence: historySearch.ts; side_panel.ts:8198; options.ts:1333

## GAP-F064-06-02

**Desktop and CLI have no history search.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-06](../../20-features/064-browser-assistant-experience/F064-06-search-browsing-history-opt-in.md)
- Detail: Affects: Desktop, CLI. Work needed: Decide whether it is wanted; if so, build it behind the same per-search approval.
- Evidence: BROWSER_TOOLS list has no history search (tool_catalog.rs:51-62)

## GAP-F064-06-03

**Titles and addresses go to AGI Cloud; no addresses-only option.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-06](../../20-features/064-browser-assistant-experience/F064-06-search-browsing-history-opt-in.md)
- Detail: Affects: Chrome. Work needed: Optional [proposed] control.
- Evidence: messages.json:4874

## GAP-F064-06-04

**Not shown running in a real browser.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-06](../../20-features/064-browser-assistant-experience/F064-06-search-browsing-history-opt-in.md)
- Detail: Affects: Chrome. Work needed: Run the scenarios and record results.
- Evidence: Only unit tests exist

## GAP-F064-06-NOTBUILT

**Search browsing history (opt-in): not built on Desktop, CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Desktop, CLI
- Features: [F064-06](../../20-features/064-browser-assistant-experience/F064-06-search-browsing-history-opt-in.md)
- Requirement items: S64.09
- Detail: Desktop: S64.09; CLI: S64.09

## GAP-F064-07-01

**Desktop chat cannot go back, reload or open or close a tab; the Desktop-issued command set has no reload or close.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-07](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md)
- Detail: Affects: Desktop and Web-in-Desktop users in chat; CLI and VS Code users. Work needed: Add the commands to the bridge contract, extension handler, planner and device step list, then test each.
- Evidence: packages/contracts/local-runtime/src/device-steps.ts:52-59; packages/contracts/types/src/browser-bridge.ts:180-195

## GAP-F064-07-02

**CLI and VS Code have no reload and no tab tools.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-07](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md)
- Detail: Affects: CLI, VS Code. Work needed: Add the tools to the CLI catalog and bridge.
- Evidence: apps/cli/src/platform/runtime/tool_catalog.rs:46-57

## GAP-F064-07-03

**Organize tabs does not exist anywhere.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-07](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md)
- Detail: Affects: All apps. Work needed: Decide scope and permissions, then build.
- Evidence: brief S64.13 (missing on desktop, cli, vscode); no code found

## GAP-F064-07-04

**The Desktop browser pane cannot be driven by the assistant.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-07](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md)
- Detail: Affects: Desktop coding sessions. Work needed: Either add agent steps for the pane or record the decision to keep it person-only.
- Evidence: packages/contracts/local-runtime/src/device-steps.ts:52-59; doc: docs/architecture/desktop-local-runtime.md:301

## GAP-F064-07-05

**Web in an ordinary browser tab and Mobile have no browser control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-07](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md)
- Detail: Affects: Web (non-Desktop), Mobile. Work needed: Product decision; Mobile has no code.
- Evidence: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1289

## GAP-F064-07-06

**The brief's code citations for CLI (apps/cli/src/features/exec/tools/mod.rs:1236, apps/cli/src/agent/chat.rs:688) and VS Code (webviewContent.ts:5654, localRuntimeClient.ts:948) do not point at browser code; the brief's 'done' for VS Code Open URL is unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-07](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md)
- Detail: Affects: Knowledge base accuracy for CLI and VS Code. Work needed: Correct the brief citations to the real lines listed in this page.
- Evidence: apps/cli/src/features/exec/tools/mod.rs:1225-1250 (lsp tools); apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5640-5670 (side question UI)

## GAP-F064-07-NOTBUILT

**Open pages and manage tabs: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F064-07](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md)
- Requirement items: S64.10, S64.11, S64.12, S64.13
- Detail: Web: S64.10, S64.11, S64.12; Desktop: S64.12, S64.13; Mobile: S64.10, S64.11, S64.12; CLI: S64.11, S64.12, S64.13; VS Code: S64.11, S64.12, S64.13; Chrome: S64.11, S64.12

## GAP-F064-07-PARTLY

**Open pages and manage tabs: partly built on Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Desktop
- Features: [F064-07](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md)
- Requirement items: S64.11
- Detail: Desktop S64.11: The assistant can go back and forward in a paired browser tab, and the built-in pane has back, forward and reload controls; the assistant has no reload command for the page it is working on.

## GAP-F064-08-01

**No batch form fill in the Chrome side panel agent; one approval per typed field in Ask first mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-08](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md)
- Detail: Affects: Chrome users. Work needed: Add a fill tool with the same protected-field refusal.
- Evidence: browserToolDefinitions.ts tool list (type, select_option; no fill_form)

## GAP-F064-08-02

**Desktop cloud chat has no find, no fill form, no site tools.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-08](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md)
- Detail: Affects: Desktop and web-in-Desktop. Work needed: Extend the device step list and runner.
- Evidence: packages/contracts/local-runtime/src/device-steps.ts:52-59

## GAP-F064-08-03

**Site-tool invocation only in Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-08](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md)
- Detail: Affects: Desktop, CLI, VS Code. Work needed: Decide whether the paired-browser path should expose discover and call.
- Evidence: brief S64.17; no site tool code under apps/desktop or apps/cli

## GAP-F064-08-04

**Brief marks VS Code search and multi-step 'done' but cites unrelated lines.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-08](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md)
- Detail: Affects: VS Code. Work needed: Verify end to end with a paired Chrome and correct the brief.
- Evidence: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5654 and apps/extension-vscode/src/integrations/localRuntimeClient.ts:948 are not browser code

## GAP-F064-08-05

**Nothing records that a run succeeded across tests; verification claims rest on code only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-08](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md)
- Detail: Affects: All. Work needed: Run the scenarios and record results.
- Evidence: no results file read

## GAP-F064-08-NOTBUILT

**Act on a website: not built on Web, Desktop, Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code
- Features: [F064-08](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md)
- Requirement items: S64.14, S64.15, S64.16, S64.17
- Detail: Web: S64.14, S64.15, S64.16; Desktop: S64.14, S64.16, S64.17; Mobile: S64.14, S64.15, S64.16; CLI: S64.17; VS Code: S64.17

## GAP-F064-09-01

**No live preview as a separate view; only the real tab and optional screenshots.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: Affects: Chrome, Desktop, Web, Mobile. Work needed: Decide whether the real tab is enough; if not, build a preview and correct the brief.
- Evidence: computerUsePanel.ts:1836-1842; brief S64.19 cites lines that are not a preview

## GAP-F064-09-02

**Desktop paired-browser work has no active-tab marker and no chat timeline.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: Affects: Desktop, Web-in-Desktop. Work needed: Add a marker in Chrome for Desktop-driven commands and show the list in chat.
- Evidence: bridgeServer.ts:1142-1178 (memory list); brief S64.20 desktop missing

## GAP-F064-09-03

**No guaranteed structured end summary.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: Affects: All. Work needed: Add a summary contract (done, unverified, needs you).
- Evidence: agentLoop.ts:1138 only asks for a concise report

## GAP-F064-09-04

**Mobile and plain web have none of this.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: Affects: Mobile, Web. Work needed: Product decision.
- Evidence: brief S64.18 to S64.32 mark them missing

## GAP-F064-09-05

**Brief says VS Code has timeline and stop 'done' but cites unrelated code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Detail: Affects: VS Code. Work needed: Verify and correct the citation.
- Evidence: ChatStateManager.ts:3999 is an attachment picker, not stop

## GAP-F064-09-NOTBUILT

**See and control a run: not built on Web, Desktop, Mobile**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F064-09](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Requirement items: S64.18, S64.19, S64.20, S64.25, S64.32
- Detail: Web: S64.18, S64.19, S64.20, S64.25, S64.32; Desktop: S64.20, S64.25; Mobile: S64.18, S64.19, S64.20, S64.25, S64.32

## GAP-F064-10-01

**No handoff on Desktop (browser), Web, Mobile, CLI or VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md)
- Detail: Affects: All apps but Chrome. Work needed: Add a handoff to the paired-browser tools or document that Chrome is the only supported surface.
- Evidence: brief S64.21-S64.24 (missing); dispatcher.ts:2604-2606 is screen control only

## GAP-F064-10-02

**The brief lists Take over and Return control as missing for Chrome, though both are in the code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md)
- Detail: Affects: Knowledge base accuracy. Work needed: Update the brief.
- Evidence: background.ts:7088-7146; browserRunOverlay.ts:55

## GAP-F064-10-03

**Fixed 15-minute limit.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md)
- Detail: Affects: Chrome users with long checks. Work needed: Decide if configurable.
- Evidence: runOwnership.ts:17

## GAP-F064-10-04

**No test found that exercises the whole sign-in handoff.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md)
- Detail: Affects: Chrome. Work needed: Write an end-to-end handoff test.
- Evidence: test names seen only by text search

## GAP-F064-10-NOTBUILT

**Hand off sign-in, human checks and takeover: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F064-10](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md)
- Requirement items: S64.21, S64.22, S64.23, S64.24
- Detail: Web: S64.21, S64.22, S64.23, S64.24; Desktop: S64.21, S64.22, S64.23, S64.24; Mobile: S64.21, S64.22, S64.23, S64.24; CLI: S64.21, S64.22, S64.23, S64.24; VS Code: S64.21, S64.22, S64.23, S64.24; Chrome: S64.23, S64.24

## GAP-F064-11-01

**No visible download list in Chrome; only the model's result text and an internal ledger.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md)
- Detail: Affects: Chrome users. Work needed: Add a list from the ledger.
- Evidence: downloads.ts:5-6; no panel code reading the ledger found

## GAP-F064-11-02

**Desktop download list shows addresses only and is lost on close.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md)
- Detail: Affects: Desktop. Work needed: Record file names and persist.
- Evidence: BrowserToolsDialog.tsx:454-463; bridgeServer.ts:1142

## GAP-F064-11-03

**No upload on Desktop, CLI, VS Code; no downloads in CLI, VS Code, Web, Mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md)
- Detail: Affects: those apps. Work needed: Product decision and build.
- Evidence: tool_catalog.rs:46-57; device-steps.ts:52-59

## GAP-F064-11-04

**Where uploaded files are inspected and how long they are kept is not documented in code read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md)
- Detail: Affects: Chrome privacy review. Work needed: Trace the server path and document retention.
- Evidence: userFileUpload.ts uses managed attachments client

## GAP-F064-11-05

**Brief cites approvalPolicy.ts:221 and side_panel.ts:11620 for upload; those lines are not upload approval.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md)
- Detail: Affects: Knowledge base accuracy. Work needed: Correct the brief citations.
- Evidence: approvalPolicy.ts:195-205 (host helpers); upload logic is at 358-378

## GAP-F064-11-NOTBUILT

**Approve downloads and uploads: not built on Web, Desktop, Mobile, CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI
- Features: [F064-11](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md)
- Requirement items: S64.26, S64.27
- Detail: Web: S64.26, S64.27; Desktop: S64.27; Mobile: S64.26, S64.27; CLI: S64.26, S64.27

## GAP-F064-12-01

**No session persistence setting for any assistant browser.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: Affects: Desktop pane users. Work needed: Design the setting and wire it to the partition.
- Evidence: browserPane.ts:18 fixed persistent partition; brief S64.29

## GAP-F064-12-02

**No isolated versus own-browser choice anywhere.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: Affects: All. Work needed: Product decision, then build.
- Evidence: brief S64.31; docs/architecture/desktop-local-runtime.md:301

## GAP-F064-12-03

**Chrome has no clear-site-data control for anything the assistant keeps.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: Affects: Chrome. Work needed: Decide what Chrome holds that the person could clear, then add it.
- Evidence: brief S64.30 chrome missing; none found

## GAP-F064-12-04

**Web and Mobile have no site permission surface; CLI relies on domain rules only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: Affects: Web, Mobile, CLI, VS Code. Work needed: Product decision.
- Evidence: brief S64.28 lists chrome only

## GAP-F064-12-05

**The pane's site decisions and the Chrome allowlist are two separate lists with no shared owner.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: Affects: Desktop plus Chrome users. Work needed: Consider one owner per AGENTS.md section 3.
- Evidence: browserPane.ts:44-96 versus site-policy/store.ts

## GAP-F064-12-06

**Brief citation for Chrome site permissions (side_panel.ts:7640, site-permission-policy.ts:236) is partly wrong: that file's line 236 is beyond the file (136 lines).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Detail: Affects: Knowledge base accuracy. Work needed: Correct the citation.
- Evidence: apps/extension/src/features/options/site-permission-policy.ts has 136 lines

## GAP-F064-12-NOTBUILT

**Website permissions and browser data: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F064-12](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Requirement items: S64.29, S64.30, S64.31
- Detail: Web: S64.29, S64.30, S64.31; Desktop: S64.31; Mobile: S64.29, S64.30, S64.31; CLI: S64.31; VS Code: S64.31; Chrome: S64.30, S64.31
