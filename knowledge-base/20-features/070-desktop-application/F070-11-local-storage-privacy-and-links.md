---
id: "F070-11"
type: "feature"
title: "Local storage, privacy and links"
aliases: ["Storage settings", "Manage storage", "Clear cache", "Permissions (Desktop)", "System privacy settings", "Deep links", "agiworkforce-cloud://", "S70.29", "S70.30", "S70.31"]
area: "70 Desktop application"
available_on: ["desktop"]
implementation: {web: "n/a", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S70.29", "S70.30", "S70.31"]
depends_on: ["surface:desktop", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-sync-and-continuity", "F070-07", "file:apps/desktop/electron/runtime/storageService.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F070-11 Local storage, privacy and links

AGI Desktop on macOS shows what it stores locally and clears four kinds of data with confirmation, shows the three OS privacy permissions it needs with a button to open the right System Settings page, lists and removes the user's saved answers, and opens the right screen from agiworkforce-cloud:// links and notification clicks.

Area: [70. Desktop application](README.md). Requirement items: [S70.29](../../10-requirements/capabilities/070-desktop-application.md#s7029), [S70.30](../../10-requirements/capabilities/070-desktop-application.md#s7030), [S70.31](../../10-requirements/capabilities/070-desktop-application.md#s7031).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Storage reports sizes for coding sessions, worktrees, web cache, logs, caches and app data and offers clean-ups. Permissions reports Screen Recording, Accessibility and Microphone and the user's saved answers. Deep links route links and notification clicks into the app.

**Why it exists.** Users must be able to see and control what the app keeps and what it may do, and links from other apps or notifications must land on the right screen.

**Who uses it.** AGI Desktop users on macOS.

**Problems it solves**

- Disk use from worktrees and logs
- A denied OS permission that breaks computer use or dictation
- Opening a chat or settings page from a notification or link

**Use cases**

- Clear the web cache
- Delete archived sessions older than 30 days
- Open System Settings for Screen Recording
- Click a notification to open a session

## 2. User experience

**Where to find it**

- Settings > Storage (desktop app group) (apps/web/features/settings/components/WebSettingsModal.tsx:254; apps/web/features/desktop-host/components/StorageSettings.tsx:23).
- Settings > General: row 'Storage' with a 'Manage' button (DesktopSettingsSection.tsx:364-376).
- Settings > General > 'Permissions', and in Settings > Computer use (DesktopSettingsSection.tsx:449; ComputerUseSettings.tsx).
- Help > Troubleshooting > 'Clear Cache and Restart…' (appMenu.ts:570).
- Links: agiworkforce-cloud://<target>/<id> from other apps or notifications.

**Before you start**

- surface:desktop (Electron shell). Pages render nothing outside the shell (StorageSettings.tsx:115).

**Screens and controls**

- Storage: total, stacked bar, per-category list ('Coding sessions', 'Worktrees', 'Web cache', 'Logs', 'Caches', 'App data'), 'Data folder' path, 'Refresh' (StorageSettings.tsx:28-36).
- 'Clean up' rows: 'Web cache' (Clear), 'Old logs' (Delete), 'Old archived sessions' (Delete), 'Temporary command files' (Delete), each with a confirmation naming what is lost (StorageSettings.tsx:59-90).
- Permissions: 'Your answers' with 'Remove' or 'Ask again'; '<platform> privacy settings' group with status 'Allowed', 'Not allowed', 'Not asked yet', 'Blocked by your organization', 'Not needed on this computer' and button 'Open System Settings' (DesktopPermissionsSection.tsx:32-60).

**Journey**

1. Storage: open Settings > Storage; sizes are measured; choose a clean-up; confirm; the list refreshes.
2. Permissions: open Settings > General; read the status; press 'Open System Settings' for any not allowed; change it in macOS; return and the page re-reads on focus.
3. Links: click a link; the app focuses and routes to the page, or holds the link until the page is ready.

**What the person sees and gets**

- 'Measuring…', sizes with 'at least' when a folder was too large to finish, errors 'Storage use could not be measured.' and 'That could not be cleared.'
- Refusals such as 'A command is running. Clear temporary command files after it finishes.'
- Permission list refreshes on window focus and 'permission-changed' events.

**Settings**

- Auto-archive idle sessions and worktree location live in General (main.ts:1992+).
- Notification and deep-link behaviour has no settings.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Storage measure with entry and depth limits, never following links (storageService.ts:13-14, :100-150).
- Clean-ups: web cache through the session's cache clear; logs older than 7 days; archived sessions older than 30 days after an extra native confirmation with the count; command scratch folders older than a day, refused while a command runs (storageService.ts:174-196; dispatcher.ts:1564-1600; packages/contracts/local-runtime/src/storage.ts:30-32).
- Web-cache copy says you stay signed in; the code only clears the cache, not cookies or stored data (dispatcher.ts:1612-1613; StorageSettings.tsx:60-66). [inferred] sign-in is kept because cookies are not cleared.
- 'Clear Cache and Restart…' clears HTTP cache, code caches and shader and cache storage, keeps sign-in, chats, settings and folder permissions per its dialog (main.ts:2282-2320).
- OS permission status read from macOS: accessibility, screen and microphone; Windows only microphone; others 'not-required' (systemPermissions.ts:22-40).
- Open System Settings: for 'not-determined' microphone or screen it triggers the OS prompt instead; otherwise opens the privacy pane (systemPermissions.ts:48-70).
- Deep links: scheme registered; cold-start and second-instance links captured; queue of up to 20, 10 minute lifetime, persisted at mode 0600 in deep-link-queue.json excluding sign-in links (main.ts:2574-2590; deepLinkQueue.ts:4-5, :50, :83; main.ts:803).
- Routing targets chat, project, settings, code and product link targets; an id that does not name a known settings section yields no destination (deep-links.ts:39-54).
- Notification click with a deepLink value focuses the window and delivers the link (main.ts:565-585).

**Incomplete**

- General > Storage 'Manage' only shows the note 'Chats stay on this computer. Nothing was removed.'; it does not open the Storage pane (DesktopSettingsSection.tsx:186, :364-376).
- Unroutable link: the window is focused and nothing navigates; it is not sent to a fallback page (use-desktop-deep-links.ts:18-21; main.ts:695-720).

**Present but disconnected or switched off**

- none found

**Not available**

- surface:web, surface:mobile, surface:cli, surface:vscode, surface:chrome for these desktop panes.
- Granting an OS permission from inside the app: not possible; the app only prompts or opens settings.
- Clearing chats or account data from Storage: not offered.

## 4. Required behaviour

**Established requirements**

- The user can see and clear the desktop app's local cache and stored data. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S70.29)
- agiworkforce-cloud:// links and notification clicks open the app on the right screen. (source: S70.30 in the same brief)
- The app shows which OS privacy permissions and in-app grants it holds, explains how to change them, and lets the user revoke grants. (source: S70.31 in the same brief)
- Storage cleanup asks first. (source: docs/decisions/wire-or-cut.md:1067)
- A link opened while the app is closed is queued and delivered after start. (source: task brief for F070-11; deepLinkQueue.ts:4-5)

**Acceptance criteria**

1. Storage lists all six categories and a total that equals their sum.
2. Each clean-up shows a confirmation that names what is lost; Cancel changes nothing.
3. Clearing the web cache leaves the user signed in.
4. Deleting old archived sessions asks a second question with the number of sessions.
5. With Screen Recording denied the row says 'Not allowed' and 'Open System Settings' opens the right pane.
6. Removing a saved answer makes the app ask again next time.
7. A link clicked while the app is closed opens the right page after launch within 10 minutes; one older is discarded.
8. A link to an unknown settings section does not navigate.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] 'Clear the cache' in the brief means the web cache and other file clean-ups, since no pane clears chats.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make 'Manage' open the Storage pane.
- [proposed] Show a message when a link names a screen that does not exist.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | storageService | `apps/desktop/electron/runtime/storageService.ts` | Measures and cleans storage. |
| service | dispatcher storage cases | `apps/desktop/electron/runtime/dispatcher.ts` | desktop_storage_read and desktop_storage_clean, archived-session deletion with confirmation (lines 1564, 1603, 2533-2555). |
| component | StorageSettings | `apps/web/features/desktop-host/components/StorageSettings.tsx` | Storage pane. |
| service | systemPermissions | `apps/desktop/electron/runtime/systemPermissions.ts` | Reads OS permission status and opens settings. |
| component | DesktopPermissionsSection | `apps/web/features/desktop-host/components/DesktopPermissionsSection.tsx` | Answers and OS status list. |
| config | desktop-privacy contract | `packages/contracts/local-runtime/src/desktop-privacy.ts` | Permission kinds, labels, purposes. |
| config | storage contract | `packages/contracts/local-runtime/src/storage.ts` | Categories, cleanups, age limits. |
| service | deepLinkQueue | `apps/desktop/electron/deepLinkQueue.ts` | Queue, expiry and persistence of links. |
| service | deliverDeepLink / flushDeepLinks | `apps/desktop/electron/main.ts` | Receive, queue, focus and deliver links; notification click bridge. |
| hook | useDesktopDeepLinks | `apps/web/features/desktop-host/hooks/use-desktop-deep-links.ts` | Routes a delivered link in the page. |
| service | deepLinkDestination | `apps/web/features/desktop-host/lib/deep-links.ts` | Maps a link to an in-app path. |
| config | parseDesktopDeepLink | `packages/contracts/local-runtime/src/host-bridge.ts` | Scheme, targets, parsing. |
| store | deep-link-queue.json | `apps/desktop/electron/main.ts` | File in user data holding queued links (line 803). |
| component | WebSettingsModal sections | `apps/web/features/settings/components/WebSettingsModal.tsx` | Mounts Storage and General panes only in the shell. |
| config | electron-builder protocols | `apps/desktop/electron-builder.yml` | Declares the agiworkforce-cloud scheme. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Page asks main to measure or clean; main walks local folders and clears the web cache of the app's session. | device | dispatcher.ts:2533-2555; storageService.ts:100-196 |
| Main reads OS permission status and opens System Settings or the OS prompt. | device | systemPermissions.ts:22-70 |
| The OS hands a link to the app; main queues it, focuses the window and sends it to the signed-in page. | device | main.ts:691-725, :825-840 |
| The page maps the link to a route and navigates; the page itself is served by our web app. | device and our servers | use-desktop-deep-links.ts:18-21 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Local data measured and cleaned | AGI CLI home, worktrees folder, logs folder, user data, system temp | No | Deleted only on confirmed clean-up; permanent deletion, not Trash, for the clean-ups (storageService.ts:150-196) |
| Queued links | deep-link-queue.json, mode 0600 | No | Removed after delivery; entries older than 10 minutes dropped; sign-in links never written |
| Saved permission answers | Permission manager on the device | unknown | Removed by the user |

**Models and providers.** No model or provider takes part.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The panes are inside the signed-in hosted app; links reach the page only when a signed-in product page is showing, otherwise they wait (main.ts:825-830). |
| Permissions | macOS Screen Recording, Accessibility, Microphone; the app can only prompt or open settings. Folder access is in F070-07. |
| Subscription | none found in the code |
| Limits and metering | Measure limit 400,000 entries and depth 48; queue 20 links and 10 minutes; logs 7 days; archives 30 days. |
| Feature flags | none found in the code |
| Model compatibility | Not applicable. |
| Provider restrictions | none found in the code |
| Local mode | Everything here is on the device and needs no model, subscription or cloud call; link routing needs the signed-in page to load. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Measuring…' status | StorageSettings.tsx:30 |
| Failure | Alert text for read and clean errors | StorageSettings.tsx:31-32 |
| Partial measure | Sizes prefixed 'at least' | StorageSettings.tsx:36; storageService.ts:13 |
| Command running | Scratch clean-up refused | storageService.ts:186-190 |
| Nothing to delete | 'No session was archived more than 30 days ago.' | dispatcher.ts:1575-1579 |
| Permission not asked | Button triggers the OS prompt | systemPermissions.ts:50-62 |
| Restricted by organization | Shown as blocked in red | DesktopPermissionsSection.tsx:43-50 |
| Link while app closed | Held in queue and delivered after the page loads | main.ts:2574-2590; deepLinkQueue.ts |
| Undecodable or unknown link | Not queued to disk; page does not navigate | deep-links.ts:39-54 |
| Signed out | Links wait for the signed-in product page | main.ts:825-830 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/electron/__tests__/storageService.test.ts`: Categories, links not followed, log and scratch clean-up, web cache
- `apps/web/features/desktop-host/__tests__/StorageSettings.test.tsx`: Rendering, partial sizes, confirmations, refusals
- `apps/desktop/electron/__tests__/deepLinkQueue.test.ts`: Order, limit, expiry, persistence, nonce exclusion
- `apps/desktop/electron/__tests__/deepLink.test.ts`: Link parsing
- `apps/desktop/electron/__tests__/preloadDeepLinks.test.ts`: Preload delivery
- `apps/desktop/electron/__tests__/desktopLifecycle.test.ts`: Replay of held links after page load
- `apps/web/features/desktop-host/__tests__/ComputerUseSettings.test.tsx`: Permissions section reuse
- `apps/desktop/electron/__tests__/permissionManager.test.ts`: Saved permission answers

**Test scenarios**

- **Clear web cache**
  1. Settings > Storage
  2. Clear on Web cache
  3. Confirm
  - Expected: Total shrinks; still signed in
- **Old archives**
  1. Press Delete on Old archived sessions
  2. Confirm twice
  - Expected: Count asked; sessions removed; folder files untouched
- **Permission denied**
  1. Deny Screen Recording in macOS
  2. Open Permissions
  3. Press Open System Settings
  - Expected: Row says Not allowed; correct pane opens
- **Link while closed**
  1. Quit the app
  2. Open an agiworkforce-cloud://chat/<id> link
  - Expected: App launches and opens that chat
- **Unknown settings link**
  1. Open agiworkforce-cloud://settings/not-a-section
  - Expected: Window focuses; no navigation
- **Notification click**
  1. Trigger a session finished notification
  2. Click it
  - Expected: Session opens

**Where to look when it fails**

- '[deep-link] could not persist the link queue' warning
- '[troubleshooting] clearing the cache failed'
- DesktopRuntimeError codes in dispatcher results
- deep-link-queue.json in user data

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/070-desktop-application.md](../../70-qa/test-plans/desktop/070-desktop-application.md)

## 10. Gaps and dependencies

- **'Manage' in General > Storage does not lead to the Storage pane** Affects: surface:desktop users. Evidence: DesktopSettingsSection.tsx:186, :364-376; no test names it. Work needed: Open the Storage pane or remove the row
- **Unroutable link gives no message** Affects: surface:desktop users. Evidence: use-desktop-deep-links.ts:18-21. Work needed: Show a notice or route to home
- **Clean-ups delete permanently, not to Trash** Affects: surface:desktop users. Evidence: storageService.ts:150-196 vs AGENTS.md section 9 (agent removals); these are user-initiated and confirmed. Work needed: Confirm that is acceptable for user-initiated clean-ups
- **'Clear cache' scope not tied to sign-in by a test** Affects: surface:desktop. Evidence: storageService.test.ts only checks the session clear is called. Work needed: Add an end-to-end check that sign-in survives

**Depends on**

- surface:desktop
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-sync-and-continuity
- F070-07
- file:apps/desktop/electron/runtime/storageService.ts

## Unknown

- Whether session cookies are untouched by the cache clear on every OS (Electron behaviour not checked against its documentation)
- Windows and Linux permission and link behaviour (no builds)
- Whether saved permission answers sync
- Whether the General 'Manage' note is intended to be the whole feature
