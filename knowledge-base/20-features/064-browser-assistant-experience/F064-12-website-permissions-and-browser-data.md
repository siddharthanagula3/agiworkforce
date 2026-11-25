---
id: "F064-12"
type: "feature"
title: "Website permissions and browser data"
aliases: ["Website permission controls", "Browser-session persistence setting", "Clear website data", "Isolated agent browser versus user browser choice", "Browser control", "Approved sites", "Blocked sites", "Allowed sites", "Clear browsing data", "Browser (Desktop settings)", "Admin site policy"]
area: "64 Browser-assistant experience"
available_on: ["desktop", "chrome"]
implementation: {web: "missing", desktop: "partial", mobile: "missing", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S64.28", "S64.29", "S64.30", "S64.31"]
depends_on: ["surface:chrome", "surface:desktop", "surface:web", "SYS-authorization-and-workspaces", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-observability-and-operations", "F064-07", "F064-08", "F064-11", "file:packages/contracts/types/src/site-policy.ts", "file:apps/desktop/electron/browserPane.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F064-12 Website permissions and browser data

Decides which sites the assistant may read or act on and what the built-in browser keeps. Chrome has approved and blocked sites, a Browser control mode and org policy that wins. Desktop's browser pane has allowed and blocked sites and 'Clear browsing data'. No setting yet chooses isolated versus own browser or session persistence.

Area: [64. Browser-assistant experience](README.md). Requirement items: [S64.28](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6428), [S64.29](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6429), [S64.30](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6430), [S64.31](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6431).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the person (and an admin) set which websites the assistant may automate, upload to or download from, and lets the person delete the cookies, sign-ins and storage kept by the Desktop browser pane.

**Why it exists.** The assistant works in a signed-in browser. Sites must be opt-in, an organisation must be able to forbid sites, and a person must be able to erase what the built-in browser remembers.

**Who uses it.** Chrome extension users and their admins; Desktop users who browse in the pane.

**Problems it solves**

- The assistant acting on a bank or an unknown site by surprise.
- An org needing to block sites for all its people.
- Leftover sign-ins in the built-in browser.

**Use cases**

- Approve one site for a task, block another permanently.
- An admin pushes a policy that blocks a domain for automation, upload and download.
- A Desktop user clears browsing data after testing a site.
- A Desktop user blocks a site in the pane's settings.

## 2. User experience

**Where to find it**

- Chrome extension options: row 'Browser control' (modes Auto, ask first, Full access, unattended), approved sites list, row 'Blocked sites' (apps/extension/src/features/options/site-permission-policy.ts:56-89; apps/extension/src/features/options/blocked-sites-section.ts:37; apps/extension/_locales/en/messages.json optBlockedSitesTitle).
- Chrome side panel: the task site is shown with a state of ready, needs approval or restricted and an approve action (computerUsePanel.ts:1636-1675).
- Desktop Settings, section 'Browser': 'Allowed sites', 'Blocked sites', field 'Site to block', buttons 'Remove' and 'Block', group 'Browsing data' with button 'Clear browsing data' (apps/web/features/desktop-host/components/BrowserPaneSettings.tsx:23-44, 118-180).
- Desktop pane prompt 'Open this site in the browser?' with 'Allow <host>' and Cancel (apps/desktop/electron/browserPane.ts:177-196).

**Before you start**

- Chrome: extension installed; for admin policy, a managed policy or a workspace copy synced into extension storage.
- Desktop: the settings section shows only inside Desktop with the browser pane supported (BrowserPaneSettings.tsx:57-85).

**Screens and controls**

- Chrome: Browser control select with hint 'Auto is the default...' (site-permission-policy.ts:12, 72-89).
- Chrome: blocked sites list with Remove buttons and an input (blocked-sites-section.ts).
- Desktop: lists with Remove, a Block form and a destructive Clear confirm dialog.

**Journey**

1. Chrome: the person opens a task on a site; if not approved the panel says it needs approval; the person approves it for the task or in options.
2. Approving grants Chrome host permission and browser-control consent for that origin (apps/extension/src/features/computer-use/browserControlConsent.ts).
3. An admin policy, if present, is checked first and can deny regardless of the person's approval (packages/contracts/types/src/site-policy.ts:172-215).
4. Desktop: the person types a new site in the pane; the dialog asks; Allow adds the host to Allowed sites.
5. Desktop: Settings, Browser, 'Clear browsing data' opens 'Clear browsing data?'; Clear deletes the data and shows 'Browsing data cleared.'

**What the person sees and gets**

- Chrome: denial text from the org policy or 'not approved' wording (sitePolicyDenialMessage, apps/extension/src/features/site-policy/store.ts:91-110).
- Chrome: 'Access to this site was withdrawn, so the run was stopped...' when approval is removed mid-run (computerUsePanel.ts:820).
- Desktop confirm text 'Cookies, sign-ins and data that sites saved in the browser pane are deleted and cannot be recovered. You will be signed out of every site you used there. Your account and Chrome are not affected.' (BrowserPaneSettings.tsx:42-43).
- Desktop status 'Browsing data cleared.' or 'That change could not be saved.'

**Settings**

- Chrome 'Browser control' mode stored under agi_cu_ask_before_acting (apps/extension/src/features/computer-use/askBeforeActing.ts:3).
- Chrome user blocklist key agi_site_blocklist (apps/extension/src/features/site-policy/userBlocklist.ts:21).
- Chrome admin policy key agi_admin_site_policy (apps/extension/src/features/site-policy/store.ts:25).
- Desktop file desktop-browser-sites.json (browserPane.ts:19).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Chrome: precedence is admin blocklist first, then admin allowlist as the outer bound, then the user's allowlist; an unreadable or malformed admin policy denies everything (packages/contracts/types/src/site-policy.ts:1-3, 172-215; apps/extension/src/features/site-policy/store.ts:1-60).
- Chrome: managed (enterprise) storage is read first and wins over the workspace copy in local storage (store.ts:63-70).
- Chrome: capabilities automation, upload and download are evaluated separately (site-policy.ts:5).
- Chrome: user blocklist revokes consent and host permission for the blocked origin (userBlocklist.ts:1-30).
- Chrome: Browser control modes Auto, ask first, Full access and unattended (askBeforeActing.ts:5-30).
- Desktop pane: own persistent session partition, all permission, device and screen-capture requests refused, loopback and allowed sites open, blocked sites refused, others ask (apps/desktop/electron/browserPane.ts:18, 122-142, 198-217; packages/contracts/local-runtime/src/browser-pane.ts:93-110).
- Desktop pane: a blocked site is refused even when reached by redirect or link (browserPane.ts:224-263; apps/desktop/electron/__tests__/browserPane.test.ts:176).
- Desktop: Clear browsing data deletes storage data and cache of the pane session after a destructive confirm (browserPane.ts:423-427; BrowserPaneSettings.tsx:98-112; apps/web/features/desktop-host/__tests__/BrowserPaneSettings.test.tsx:75).
- Desktop workspace website rules are enforced on paired-browser steps (browserSteps.ts:57-117).

**Incomplete**

- Chrome has no 'clear site data' control: the brief marks it missing and none was found.
- Desktop 'Clear browsing data' clears the pane only; the paired Chrome's data is never touched (BrowserPaneSettings.tsx:43).
- Pane data persists across restarts (partition name starts with persist:) with no setting to turn that off (browserPane.ts:18).
- Desktop pane site lists are capped at 200 each and a failed save only logs a warning (browserPane.ts:79-85).

**Present but disconnected or switched off**

- The pane's isolation exists but no agent drives it; the assistant uses the paired Chrome with the person's own profile, so the 'isolated versus own browser' question has a fixed answer per path rather than a choice (doc: docs/architecture/desktop-local-runtime.md:301; commandGate.ts:186 says the tab uses 'your browser profile and cookies').

**Not available**

- Browser-session persistence setting: none found on any app (brief S64.29).
- Isolated agent browser versus user browser choice: none found (brief S64.31).
- Web and Mobile site permission or data controls: none found.
- CLI and VS Code site settings of their own: the CLI uses domain rules and workspace rules, but a per-site browser permission screen was not found.

## 4. Required behaviour

**Established requirements**

- The user decides which websites the assistant may read or act on. (source: brief S64.28)
- A setting decides whether the assistant's browser keeps cookies and sign-ins between tasks. (source: brief S64.29)
- The user can clear the cookies and site data the assistant's browser holds. (source: brief S64.30)
- The user chooses whether the assistant works in an isolated browser or in their own signed-in browser. (source: brief S64.31)
- Chrome must have per-site allow/deny prompts, an allowlist and blocklist, and history access only by explicit request. (source: doc: docs/product/requirements.md (section 14))
- AGI in Chrome settings must include site permissions, allowlist, blocklist and browser action mode. (source: doc: docs/product/requirements.md (section 16.9))
- An action the user cannot undo asks first and names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. In Chrome an unapproved site cannot be automated; the panel says it needs approval.
2. An admin blocklist entry denies a site even after the user approves it.
3. A malformed admin policy denies every capability until it reads cleanly.
4. Adding a site to Blocked sites revokes its browser consent.
5. In Desktop, a site not in either list asks before the pane opens it; Cancel leaves it unopened.
6. Clear browsing data shows a confirm that says data is deleted and cannot be recovered; confirming shows 'Browsing data cleared.'
7. The pane refuses every permission request including camera, microphone and screen share.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Isolated versus own-browser choice is currently fixed: the pane is isolated and the paired Chrome is the person's own; a choice would mean letting the assistant drive either [inferred].
- The persistent partition means sign-ins survive restarts, which is what a session persistence setting would control [inferred from browserPane.ts:18].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a persistence switch for the pane (session-only or persistent).
- [proposed] Add 'Clear site data' for sites the Chrome agent used, if the agent gains its own profile.
- [proposed] Show the admin policy state in Chrome options so a denied-all state is explained.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | Site policy engine | `packages/contracts/types/src/site-policy.ts` | Patterns, capabilities, precedence, admin parse, denial messages. |
| service | Chrome site policy store | `apps/extension/src/features/site-policy/store.ts` | Reads managed then local policy and the user allowlist; evaluateSiteAccess. |
| service | Chrome user blocklist | `apps/extension/src/features/site-policy/userBlocklist.ts` | Blocklist storage and consent revocation. |
| component | Blocked sites section | `apps/extension/src/features/options/blocked-sites-section.ts` | Options row for the blocklist. |
| component | Site permission policy row | `apps/extension/src/features/options/site-permission-policy.ts` | Browser control mode select. |
| service | Site allowlist helpers | `apps/extension/src/features/options/site-allowlist.ts` | Origin normalisation, host patterns for approved sites. |
| service | Browser control consent | `apps/extension/src/features/computer-use/browserControlConsent.ts` | Per-origin consent and host permission. |
| service | Ask before acting | `apps/extension/src/features/computer-use/askBeforeActing.ts` | Permission mode storage and logic. |
| service | Chrome policy checks | `apps/extension/src/background/policy.ts` | Allowlist storage key and message policy (line 34, 531). |
| service | Desktop browser pane | `apps/desktop/electron/browserPane.ts` | Session partition, permission refusal, site lists, clearBrowserPaneData. |
| schema | Pane contract | `packages/contracts/local-runtime/src/browser-pane.ts` | Site decision, host normalisation, limits. |
| service | Desktop dispatcher | `apps/desktop/electron/runtime/dispatcher.ts` | browser_sites_read, remove, block, browser_pane_clear_data (2480-2487). |
| component | BrowserPaneSettings | `apps/web/features/desktop-host/components/BrowserPaneSettings.tsx` | Desktop Settings Browser section. |
| service | Web runtime client | `apps/web/features/desktop-host/lib/runtime-client.ts` | readBrowserSites, blockBrowserSite, clearBrowserPaneData (1009-1024). |
| service | Desktop browser steps | `apps/desktop/electron/browser/browserSteps.ts` | Applies workspace website rules to paired-browser steps. |
| service | CLI domain rules | `apps/cli/src/features/exec/tools/mod.rs` | Workspace site refusal and domain rule check for browser_navigate (1028-1040, 1351-1356). |
| test | Site policy tests | `packages/contracts/types/src/__tests__/site-policy.test.ts` | Contract tests for the engine. |
| test | Extension site policy tests | `apps/extension/__tests__/site-policy-engine.test.ts` | Pattern and precedence tests. |
| test | Pane settings test | `apps/web/features/desktop-host/__tests__/BrowserPaneSettings.test.tsx` | Lists, block, clear confirm. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Before any Chrome action or download, the extension loads the admin policy (managed first, then local copy) and the user's allowlist and evaluates the page and target for the capability. | device | apps/extension/src/features/site-policy/store.ts:63-110 |
| The result is allowed, or denied with a reason: admin-blocked, outside-admin-allowlist, not-allowlisted, admin-unavailable. | device | packages/contracts/types/src/site-policy.ts:172-215 |
| A denial raises BrowserSitePermissionRequired (needs approval) or an error with the org wording. | device | store.ts:91-110 |
| Desktop pane: each main-frame request is checked in the session's request hook; blocked or unknown loads are cancelled and the refused host is reported to the page UI. | device | apps/desktop/electron/browserPane.ts:129-139 |
| Clear browsing data: the web settings page calls browser_pane_clear_data; the main process clears storage and cache of the pane session. | device | BrowserPaneSettings.tsx:98-112; dispatcher.ts:2486-2488; browserPane.ts:423-427 |
| Workspace website rules (from the account) travel with a paired-browser step and are checked in Desktop and again in Chrome. | device | browserSteps.ts:143-185; desktopCommands.ts:266-312 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Approved site origins | chrome.storage.local (SITE_ALLOWLIST_STORAGE_KEY) plus Chrome host permissions | no (local storage); the workspace admin copy is synced into local storage by the signed-in surface per code comments (store.ts:11-15) | until the person removes the site |
| User blocklist | chrome.storage.local key agi_site_blocklist | no | until removed |
| Admin site policy | chrome.storage.managed (enterprise) or chrome.storage.local key agi_admin_site_policy | managed by the admin; the local copy is written by the signed-in surface | admin controlled |
| Pane allowed and blocked lists | desktop-browser-sites.json in the Desktop user data folder, mode 0600 | no | until removed (Settings, Remove) |
| Pane cookies, sign-ins, site storage and cache | Electron partition persist:agi-browser-pane | no | deleted by Clear browsing data; otherwise kept across restarts |

**Models and providers.** Model independent. Site rules and clearing are enforced on the device. The workspace rules that Desktop sends with a step come from the account; their origin was not traced.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Chrome site settings: no account needed to edit; a run needs one. Desktop settings: none found. |
| Permissions | Chrome host permissions and browser-control consent per origin; the pane refuses all page permissions (browserPane.ts:125-128). |
| Subscription | none found in the code for site permissions or clearing data. |
| Limits and metering | Pane lists 200 entries each (browser-pane.ts:20); admin policy structure validated by parseAdminSitePolicy. |
| Feature flags | The Desktop settings section renders only if the host reports browser pane support (BrowserPaneSettings.tsx:60-63, 85). |
| Model compatibility | none found |
| Provider restrictions | none found |
| Local mode | All of it runs on the device. The pane and its settings need no cloud. Chrome site policy is evaluated locally, but the Chrome agent run itself needs AGI Cloud. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unreadable admin policy | Every capability denied everywhere until it reads cleanly. | store.ts:6-10, 63-70 |
| Local storage unreadable | Treated as no policy; the user allowlist also fails, so everything is denied with the ordinary not-approved wording. | store.ts:55-62 |
| Invalid site name | Desktop: 'Enter a site name such as example.com.' | BrowserPaneSettings.tsx:37, 89-93 |
| Too many blocked sites | 'Up to 200 sites can be blocked.' | browserPane.ts:102-104 |
| Save fails | Desktop shows 'That change could not be saved.' for a failed call; the file save failure itself only logs. | BrowserPaneSettings.tsx:81; browserPane.ts:82-84 |
| Empty lists | 'None yet. The browser asks before opening a site for the first time.' and 'None.' | BrowserPaneSettings.tsx:31-32 |
| Cancel clearing | Nothing deleted. | BrowserPaneSettings.tsx:98-112 (confirm flow) |
| Settings page outside Desktop | Renders nothing. | BrowserPaneSettings.tsx:85; BrowserPaneSettings.test.tsx:88 |
| Offline | not handled in the code; all of this is local. | searched apps/desktop/electron/browserPane.ts and apps/extension/src/features/site-policy/store.ts: no network calls |
| Accessibility | The block field has an sr-only label; messages use role alert or status. | BrowserPaneSettings.tsx:137-139, 183-190 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/types/src/__tests__/site-policy.test.ts`: Site policy contract (name only; contents not opened).
- `apps/extension/__tests__/site-policy-engine.test.ts`: Pattern parsing, wildcard subdomains, no scheme or port crossing, precedence including admin block over user approval.
- `apps/extension/__tests__/site-policy-publication.test.ts`: Policy publication (name only).
- `apps/extension/__tests__/site-permission-policy.test.ts`: Browser control row (name only).
- `apps/extension/__tests__/site-allowlist-host-permission.test.ts`: Allowlist and host permission (name only).
- `apps/extension/__tests__/computer-use-browser-control-consent.test.ts`: Browser control consent (name only).
- `apps/desktop/electron/__tests__/browserPane.test.ts`: Local pages open without asking; ask, refuse and remember; blocked redirects held; pages get no permissions; pane stays in the window.
- `apps/web/features/desktop-host/__tests__/BrowserPaneSettings.test.tsx`: Lists and removes allowed sites; blocks and refuses malformed; asks before clearing and names what is lost; hidden outside the shell.
- `apps/desktop/electron/__tests__/browserSteps.test.ts`: Workspace website rules on paired-browser steps.

**Test scenarios**

- **Unapproved site**
  1. Open a task on a site never approved.
  2. Start the task.
  - Expected: Panel shows needs approval; no action runs until approved.
- **Admin block wins**
  1. Install an admin policy blocking a host for automation.
  2. Approve the host as a user.
  3. Start a task.
  - Expected: Denied with the org wording.
- **Bad admin policy**
  1. Write a malformed admin policy document.
  2. Start a task on an approved site.
  - Expected: Denied with an admin-unavailable reason.
- **Pane asks**
  1. Open the Desktop pane.
  2. Type an unlisted site, press Cancel; type again and press Allow.
  - Expected: First try shows the refused message; second opens the page and the host appears in Allowed sites.
- **Clear data**
  1. Sign in to a test site in the pane.
  2. Settings, Browser, Clear browsing data, Clear.
  3. Reopen the site.
  - Expected: 'Browsing data cleared.' and the site is signed out.
- **Pane permissions**
  1. Open a page in the pane that asks for the camera.
  - Expected: The request is refused with no prompt.

**Where to look when it fails**

- Denial reasons: admin-unavailable, admin-blocked, outside-admin-allowlist, not-allowlisted, invalid-url, unsupported-scheme (site-policy.ts:22-29).
- Desktop console '[browser-pane] could not save the site lists' (browserPane.ts:83).
- Chrome cancellation reason site_access_withdrawn.
- File desktop-browser-sites.json in the Desktop user data folder.

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/064-browser-assistant-experience.md](../../70-qa/test-plans/desktop/064-browser-assistant-experience.md)
- Chrome: [70-qa/test-plans/chrome/064-browser-assistant-experience.md](../../70-qa/test-plans/chrome/064-browser-assistant-experience.md)

## 10. Gaps and dependencies

- **No session persistence setting for any assistant browser.** Affects: Desktop pane users. Evidence: browserPane.ts:18 fixed persistent partition; brief S64.29. Work needed: Design the setting and wire it to the partition.
- **No isolated versus own-browser choice anywhere.** Affects: All. Evidence: brief S64.31; docs/architecture/desktop-local-runtime.md:301. Work needed: Product decision, then build.
- **Chrome has no clear-site-data control for anything the assistant keeps.** Affects: Chrome. Evidence: brief S64.30 chrome missing; none found. Work needed: Decide what Chrome holds that the person could clear, then add it.
- **Web and Mobile have no site permission surface; CLI relies on domain rules only.** Affects: Web, Mobile, CLI, VS Code. Evidence: brief S64.28 lists chrome only. Work needed: Product decision.
- **The pane's site decisions and the Chrome allowlist are two separate lists with no shared owner.** Affects: Desktop plus Chrome users. Evidence: browserPane.ts:44-96 versus site-policy/store.ts. Work needed: Consider one owner per AGENTS.md section 3.
- **Brief citation for Chrome site permissions (side_panel.ts:7640, site-permission-policy.ts:236) is partly wrong: that file's line 236 is beyond the file (136 lines).** Affects: Knowledge base accuracy. Evidence: apps/extension/src/features/options/site-permission-policy.ts has 136 lines. Work needed: Correct the citation.
- Not built on: Web, Mobile, CLI, VS Code (from the capability ledger).

**Depends on**

- surface:chrome
- surface:desktop
- surface:web
- SYS-authorization-and-workspaces
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-observability-and-operations
- F064-07
- F064-08
- F064-11
- file:packages/contracts/types/src/site-policy.ts
- file:apps/desktop/electron/browserPane.ts

## Unknown

- How the workspace admin copy of the policy and the website rules sent with steps are produced and synced was not traced.
- Whether Chrome keeps any state the person could meaningfully clear was not examined.
- Whether the pane handles downloads or window.open permissions beyond what was read.
- Contents of site-policy-publication, site-permission-policy and site-allowlist tests were not opened.
- How the pane's persistent sign-ins interact with account sign-out was not examined.
