---
id: "F074-06"
type: "feature"
title: "Site access and site permissions"
aliases: ["Site access", "Per-site permissions", "Browser control", "Approved sites", "Blocked sites", "Allow for this task", "Always allow on this site", "S74.13", "S74.14", "agi_site_allowlist"]
area: "74 Browser extension"
available_on: ["chrome"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "built"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S74.13", "S74.14"]
depends_on: ["surface:chrome", "SYS-security-and-privacy", "SYS-authorization-and-workspaces", "SYS-execution-boundaries", "SYS-agents-tools-and-automation", "store:chrome.storage.local", "F074-03", "F074-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F074-06 Site access and site permissions

In the Chrome extension, AGI asks for a site's access before it reads or acts there. A card offers 'Allow for this task', 'Always allow on this site' (acting only) or 'Decline'. In Options the person sets the Browser control mode (Auto, Ask first, Full access, YOLO), approves sites and lists blocked sites. Organisation policy can override.

Area: [74. Browser extension](README.md). Requirement items: [S74.13](../../10-requirements/capabilities/074-browser-extension.md#s7413), [S74.14](../../10-requirements/capabilities/074-browser-extension.md#s7414).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Controls which sites the extension may read or act on. It asks Chrome for host access, keeps one-time grants temporary, keeps lists of approved and blocked sites, applies an optional organisation policy, and sets how often AGI asks before acting. (apps/extension/src/side_panel.ts:7785-8030; apps/extension/src/features/options/site-permission-policy.ts; apps/extension/src/features/site-policy/store.ts)

**Why it exists.** Brief S74.13: before reading a site the extension asks Chrome for that site's access explicitly. S74.14: the user reviews and changes which sites the extension may use and how. (doc: knowledge-base/data/area-briefs/074-browser-extension.md) Requirements ask for per-site allow/deny prompts and an allowlist/blocklist (doc: docs/product/requirements.md lines 1200-1215).

**Who uses it.** Every Chrome extension user who reads pages or uses browser control; organisation admins who set a site policy.

**Problems it solves**

- No silent access to sites.
- Temporary access that ends with the task.
- A block list that stops AGI reading or acting on chosen sites.
- Admin control over sites.

**Use cases**

- Allow a shopping site for one task only.
- Always allow a trusted internal site for browser control.
- Block a banking site entirely.
- Set Browser control to Ask first to confirm every action.

## 2. User experience

**Where to find it**

- surface:chrome side panel chat: a card titled 'AGI needs access to $HOST$' with buttons 'Allow for this task', 'Always allow on this site' (act only) and 'Decline' (apps/extension/_locales/en/messages.json:4280-4308; apps/extension/src/features/side-panel/bubbles.ts:1399-1432).
- surface:chrome Options page, section 'Permissions' (apps/extension/src/options.ts:1297): row 'Browser control' with options Auto, Ask first, Full access, YOLO (apps/extension/src/features/options/site-permission-policy.ts:60-90).
- Options: current site with 'Add' or 'Remove', and a 'Grant full browser control' confirmation (options.ts:1380-1560).
- Options: 'Blocked sites' with an input 'example.com', add and remove (messages.json:4923-4930; features/options/blocked-sites-section.ts).
- Chrome's own site access prompt and chrome://extensions site access list.

**Before you start**

- Signed in for chat; the card appears during chat turns. Options can be opened from the panel menu (background.ts OPEN_EXTENSION_SETTINGS).
- Chrome 132 or newer (manifest.json:87).
- Account sites (AGI web, API and sign-in hosts) are refused for browser control (features/computer-use/accountOrigins.ts; options.ts:1527-1531).

**Screens and controls**

- Access card (read body: AGI can read this page's text and ordinary form values for this task, sent to AGI Cloud, passwords and payment fields excluded; act body: AGI can act through Chrome's debugger, Chrome shows a banner) (messages.json:4290-4296).
- Browser control select with live description and 'Saving…' status.
- Consent box for 'Grant full browser control' with headline 'This grants full DevTools-Protocol control' (features/computer-use/browserControlConsent.ts:7-18).
- Notices: 'Chrome did not grant access to $HOST$', 'Skipped: you declined access to $HOST$', 'You blocked AGI on $HOST$...' (messages.json:4360-4372, 4913-4915).

**Journey**

1. 1. A task needs a page. The panel checks the blocked list, then the policy (side_panel.ts:7785-7830).
2. 2. If the site is not already allowed, a card appears in the chat (side_panel.ts:7930-7990).
3. 3. The person chooses. For once or always Chrome shows its own site access prompt (side_panel.ts:7937-7952).
4. 4. If Chrome grants, the task goes on. 'Once' is remembered only for the task and released after it; 'Always' adds the site to the approved list and records browser control consent (side_panel.ts:7971-7980, 7995-8010).
5. 5. In Options the person can later add, remove, block or change the default mode.

**What the person sees and gets**

- Progress line 'Waiting for access to $HOST$' (messages.json:4330).
- Result lines 'Always allowed $HOST$' and allowed-once text.
- Status text in Options such as '<origin> approved with full browser control.' or 'Chrome did not grant site access for <origin>, so browser control was not enabled.' (options.ts:1535-1560).

**Settings**

- Browser control mode (stored under ASK_BEFORE_ACTING_KEY), default Auto (features/options/site-permission-policy.ts:20-40).
- Approved sites (agi_site_allowlist, SP_SITE_ALLOWLIST_KEY) and browser control consent (agi_cu_browser_control_consent).
- Blocked sites (agi_site_blocklist).
- Organisation policy (agi_admin_site_policy, enterprise managed storage wins over local) (features/site-policy/store.ts:20-60).
- Page assistant overlay setting (see F074-03).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Before a page read for a chat turn: blocked list, policy check, then a request for Chrome host access (side_panel.ts:6539-6558, 7785-7830).
- Card with once, always (act scope only) and decline choices (features/side-panel/bubbles.ts:1399-1432).
- One-time grants are recorded as transient and removed after the task, unless the site was already granted (side_panel.ts:7897-7990; features/computer-use/transientHostPermissions.ts).
- Chrome refusal ends the request with a not-granted message (side_panel.ts:7957-7961).
- YOLO mode shows no card: the site must already be approved and Chrome-permitted, otherwise 'Approve $HOST$ in Permissions before starting an unattended task on this site.' (side_panel.ts:7810-7838; messages.json:5202).
- Organisation block is refused with the policy's reason; an unreadable policy denies all (side_panel.ts:7820-7840; features/site-policy/store.ts:11-60).
- Four Browser control modes with descriptions (features/options/site-permission-policy.ts:22-40).
- Blocked sites: AGI never reads, acts or lists them from history; blocking also removes approval (messages.json:4927-4929).
- Options approval asks Chrome first and records nothing unless Chrome grants (options.ts:1525-1560).
- Direct attach paths (page button, @ tabs) call Chrome for site access themselves through requestReadGrant (features/side-panel/readGrant.ts).

**Incomplete**

- The card's 'Always' choice is not offered for plain reading; reading is one task at a time (bubbles.ts:1417-1424). This may be intended. [inferred]

**Present but disconnected or switched off**

- none found.

**Not available**

- Other apps have no site permission model of this kind. Private windows: extension not allowed (manifest.json:9). Per-site settings of finer scope than origin (paths) were not found.

## 4. Required behaviour

**Established requirements**

- Before reading a site, the extension asks Chrome for that site's access explicitly. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.13)
- The user reviews and changes which sites the extension may use and how. (source: S74.14 (same brief))
- Chrome must include per-site allow/deny prompts and allowlist/blocklist; page content is untrusted; high-impact actions need confirmation. (source: doc: docs/product/requirements.md lines 1186-1218)
- Auto, the default mode, stops for crucial actions; Ask first confirms every action; no mode completes a purchase. (source: doc: apps/extension/docs/threat-model.md:22-27)

**Acceptance criteria**

1. Asking AGI to read a not-yet-allowed site shows the access card before anything is read.
2. 'Decline' leaves the page unread and tells the person.
3. 'Allow for this task' lets the task read the page and, after the task, the Chrome host access is gone unless it was already there.
4. A site added to Blocked sites is refused everywhere with the blocked message.
5. In Options, choosing a mode saves it and shows its description; a failed save restores the old mode.
6. In YOLO, an unapproved site gives the 'Approve $HOST$ in Permissions' message and no card.
7. Approving a site from Options does nothing if Chrome refuses the grant.
8. An organisation policy block shows the policy's reason.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Reading and acting use the same grant machinery with different scope. [inferred] (side_panel.ts:7785)

**Proposed improvements** (suggestions, not requirements)

- [proposed] List current Chrome host grants inside Options so leftovers are visible.
- [proposed] Explain Always for reading, or state why it is excluded.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | requestBrowserSiteAccess | `apps/extension/src/side_panel.ts` | Whole access flow: checks, card, Chrome request, grants (7785-8030). |
| component | buildSiteGrantCard | `apps/extension/src/features/side-panel/bubbles.ts` | The access card (1399-1432). |
| service | requestReadGrant | `apps/extension/src/features/side-panel/readGrant.ts` | Temporary read access for direct attach paths (31-75). |
| service | site allowlist helpers | `apps/extension/src/features/options/site-allowlist.ts` | Normalise origins, host patterns, request and remove Chrome permission (1-111). |
| service | browser control consent | `apps/extension/src/features/computer-use/browserControlConsent.ts` | Consent record and Chrome host permission (92-160). |
| service | oneTimeSiteGrants | `apps/extension/src/features/computer-use/oneTimeSiteGrants.ts` | One-time grant records. |
| service | transientHostPermissions | `apps/extension/src/features/computer-use/transientHostPermissions.ts` | Tracks temporary Chrome grants so they can be released. |
| service | hostPermissionReconcile | `apps/extension/src/features/computer-use/hostPermissionReconcile.ts` | Releases site access allowed only once, on start and install (background.ts:7684-7697). |
| service | GRANT_SITE_ONCE / REVOKE_SITE_ONCE / CHECK_SITE_ONCE | `apps/extension/src/background.ts` | Worker side of one-time acting grants (5400-5420). |
| component | Browser control policy row | `apps/extension/src/features/options/site-permission-policy.ts` | Mode select with Auto, Ask first, Full access, YOLO (40-136). |
| service | askBeforeActing | `apps/extension/src/features/computer-use/askBeforeActing.ts` | Reads and stores the permission mode (ASK_BEFORE_ACTING_KEY). |
| screen | Options permissions section | `apps/extension/src/options.ts` | Approved sites list, consent prompt, blocked sites (1297, 1380-1560). |
| component | Blocked sites section | `apps/extension/src/features/options/blocked-sites-section.ts` | Add, list and remove blocked sites. |
| store | agi_site_blocklist | `apps/extension/src/features/site-policy/userBlocklist.ts` | Blocklist storage and isUserBlockedSite (11, 65-96). |
| service | site policy store | `apps/extension/src/features/site-policy/store.ts` | Reads org and user policy and evaluates access (1-144). |
| config | managed-schema.json | `apps/extension/managed-schema.json` | Schema for enterprise-managed storage (declared at manifest.json:35-37; contents not read). |
| service | accountOrigins | `apps/extension/src/features/computer-use/accountOrigins.ts` | Refuses browser control on AGI account origins. |
| test | site-permission-policy test | `apps/extension/__tests__/site-permission-policy.test.ts` | Browser control row (10 tests). |
| test | site-policy-engine test | `apps/extension/__tests__/site-policy-engine.test.ts` | Policy evaluation (24 tests). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The panel checks the blocked list, org policy and current mode on the device. | device | apps/extension/src/side_panel.ts:7810-7840 |
| A card in the chat asks the person to allow once, always or decline. | device | features/side-panel/bubbles.ts:1399-1432 |
| Chrome shows its own site access prompt and records the grant. | device | features/computer-use/browserControlConsent.ts:92-105 |
| For once, the grant is tracked as transient and removed after the task; for always, the site is written to the approved list. | device | side_panel.ts:7971-8010; 7742-7748 |
| The page text or screenshots are sent to AGI Cloud only when the task runs and the person sent a turn. | our servers | messages.json:4290-4296 (card text); doc: apps/extension/docs/threat-model.md objectives |
| Enterprise policy, if present, is read from Chrome managed storage first, then a local workspace copy. | device | features/site-policy/store.ts:20-60 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Approved sites list | chrome.storage.local key agi_site_allowlist | no (only four boolean preferences and the dictation language sync via Chrome Sync, doc: threat-model.md:35-37) | Kept until removed in Options. |
| Browser control consent per origin | chrome.storage.local key agi_cu_browser_control_consent | no | Removed when the site is removed; Chrome host permission removed too. |
| Blocked sites | chrome.storage.local key agi_site_blocklist | no | Kept until removed. |
| Org policy document | chrome.storage.managed or local key agi_admin_site_policy | set by admin tooling (how the local copy is delivered was not read) | Replaced by admin. |
| One-time grant records | Extension storage via transientHostPermissions | no | Released after the task and reconciled on start (background.ts:7684-7697). |

**Models and providers.** The access check uses no model. Once access is granted, page text goes to AGI Managed Cloud; the extension never sends to a provider directly.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The card appears during chat turns, which need a signed-in account; Options works without one. [inferred] |
| Permissions | Optional host permissions for all http and https origins, granted per origin through Chrome; source host permissions for loopback and AGI hosts (apps/extension/manifest.json:26-32). |
| Subscription | none found in the code for site permissions; plan rules apply to the chat turn. |
| Limits and metering | none found in the code. |
| Feature flags | Permission mode setting; in-page panel setting; org policy (agi_admin_site_policy). |
| Model compatibility | not applicable. |
| Provider restrictions | none for permissions; chat is Managed Cloud only. |
| Local mode | Permissions are enforced on the device in every case. The extension has no Local inference mode; localhost pages count as approved by Chrome at install and the stored record is the only check there (doc: apps/extension/docs/threat-model.md capability table). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Blocked site | Refused with the blocked message pointing to Options. | side_panel.ts:7806-7808; messages.json:4913 |
| Org policy denies | Refused with the policy's reason. | side_panel.ts:7820-7840 |
| Policy unreadable | Denies every capability until readable. | features/site-policy/store.ts:11-60 |
| Chrome refuses grant | Declined with 'Chrome did not grant access to $HOST$'. | side_panel.ts:7957-7961; messages.json:4370 |
| Access revoked during the task | 'Chrome site access was revoked during this task.' | side_panel.ts:7871-7880 |
| Tab changed while the card is open | The request is dismissed and any new grant removed. | side_panel.ts:7937-7956 |
| Panel closed with a card open | pendingSiteGrants are dismissed. | side_panel.ts:7731, 7918-7922 |
| Account origin | Refused for browser control. | side_panel.ts:7822-7826; options.ts:1527-1531 |
| Options save fails | Mode restored and an error text shown. | site-permission-policy.ts:108-118 |
| Accessibility | Card has role group with a labelled title and focuses the first button; mode select is labelled and described. | bubbles.ts:1406-1413; side_panel.ts:8029; site-permission-policy.ts:73-82 |
| Offline | not handled in the code for the permission step itself, which is device-only. | apps/extension/src/side_panel.ts:7785-7830 (no network call in the permission checks) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/site-permission-policy.test.ts`: Browser control mode row (10 tests).
- `apps/extension/__tests__/site-policy-engine.test.ts`: Policy evaluation (24 tests).
- `apps/extension/__tests__/site-policy-publication.test.ts`: Policy publication (name only).
- `apps/extension/__tests__/site-allowlist-host-permission.test.ts`: Allowlist and Chrome host permission (6 tests).
- `apps/extension/__tests__/site-allowlist-options.test.ts`: Options allowlist (name only).
- `apps/extension/__tests__/user-site-blocklist.test.ts`: Blocklist (5 tests).
- `apps/extension/__tests__/browser-one-time-site-grant.test.ts`: One-time grants (6 tests).
- `apps/extension/__tests__/browser-task-site-grants.test.ts`: Task site grants (name only).
- `apps/extension/__tests__/browser-transient-host-permissions.test.ts`: Transient host permissions (name only).
- `apps/extension/__tests__/host-permission-reconcile.test.ts`: Reconcile on start (name only).
- `apps/extension/__tests__/computer-use-browser-control-consent.test.ts`: Browser control consent (name only).
- `apps/extension/__tests__/computer-use-permission-mode.test.ts`: Permission modes (name only).
- `apps/extension/__tests__/read-grant.test.ts`: Temporary read grants (8 tests).
- `apps/extension/__tests__/unattended-browser-mode.test.ts`: YOLO unattended mode (name only).

**Test scenarios**

- **Allow once**
  1. Make sure a site is not approved.
  2. Ask AGI to read the page and press 'Allow for this task' then accept Chrome's prompt.
  3. After the answer, open chrome://extensions site access.
  - Expected: The page is read; afterwards the site access is gone.
- **Decline**
  1. Repeat and press 'Decline'.
  - Expected: The page is not read and the person is told the access was declined.
- **Chrome refuses**
  1. Repeat, press Allow, then deny Chrome's prompt.
  - Expected: 'Chrome did not grant access to <host>' and nothing is read.
- **Blocked site**
  1. Add the site under Blocked sites.
  2. Ask AGI to read it.
  - Expected: Refused with the blocked message; no card.
- **Mode change**
  1. In Options choose Ask first, then act on a site.
  - Expected: Every action asks first; the description line matches the mode.
- **YOLO unapproved**
  1. Set YOLO, start an unattended task on an unapproved site.
  - Expected: The 'Approve <host> in Permissions' message and no card.

**Where to look when it fails**

- Messages quoted above.
- Worker log 'Released site access that was allowed only once' and 'Site access could not be reconciled' (background.ts:7667-7670).
- Storage keys agi_site_allowlist, agi_cu_browser_control_consent, agi_site_blocklist, agi_admin_site_policy in devtools.
- chrome://extensions site access list.

**Hands-on test plans**

- Chrome: [70-qa/test-plans/chrome/074-browser-extension.md](../../70-qa/test-plans/chrome/074-browser-extension.md)

## 10. Gaps and dependencies

- **Always allow is not offered for reading, only acting.** Affects: surface:chrome people who read the same site often. Evidence: features/side-panel/bubbles.ts:1417-1424. Work needed: Confirm intent; document it or add a read-only approval.
- **No place in Options was found that lists leftover Chrome host grants beyond approved sites.** Affects: surface:chrome. Evidence: options.ts allowlist section lists approved sites only (1380-1560). Work needed: Optional list or link to chrome://extensions.
- **Private/incognito and browser-difference messaging missing (S74.26, S74.27).** Affects: surface:chrome. Evidence: Brief items chrome missing; manifest.json:9. Work needed: Add copy.
- **How the local copy of the org policy is delivered was not established.** Affects: admin documentation. Evidence: features/site-policy/store.ts comment mentions a workspace copy synced by the signed-in surface. Work needed: Trace the writer.

**Depends on**

- surface:chrome
- SYS-security-and-privacy
- SYS-authorization-and-workspaces
- SYS-execution-boundaries
- SYS-agents-tools-and-automation
- store:chrome.storage.local
- F074-03
- F074-04

## Unknown

- Contents of managed-schema.json and how admins deliver the workspace copy of the policy.
- Full text of the Options Permissions section beyond the lines read.
- Whether file URL access guidance (requirements doc) exists in the extension.
- Contents of the tests marked name only.
