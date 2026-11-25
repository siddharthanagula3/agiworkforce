---
id: "F085-11"
type: "feature"
title: "Browsing access"
aliases: ["Browsing access", "Approved sites", "Site allowlist", "agi_site_allowlist", "Browser pairing", "Chrome (pairing section)", "Browser (desktop browser pane settings)", "Allowed sites", "Blocked sites", "S85.10"]
area: "85 Personalization and data settings"
available_on: ["desktop", "chrome"]
implementation: {web: "n/a", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "built"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S85.10"]
depends_on: ["SYS-agents-tools-and-automation", "SYS-security-and-privacy", "SYS-execution-boundaries", "SYS-authorization-and-workspaces", "surface:chrome", "surface:desktop", "store:chrome-storage-local", "store:desktop-browser-sites-file", "mode:local", "mode:cloud", "mode:own-key"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F085-11 Browsing access

Controls which websites AGI may read or act in. In the Chrome extension a site must be on the person's approved list and have Chrome host permission before the assistant acts. On Desktop the person can unpair the Chrome extension, and manage allowed and blocked sites for the built-in browser pane.

Area: [85. Personalization and data settings](README.md). Requirement items: [S85.10](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8510).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Chrome Options keeps a list of approved sites; removing one revokes browser-control consent and Chrome's host permission for it (apps/extension/src/options.ts:1451-1478). Desktop shows the pairing between this Mac and the Chrome extension and can unpair it (apps/web/features/desktop-host/components/BrowserPairingSection.tsx). Desktop also keeps allowed and blocked site lists for its browser pane (apps/web/features/desktop-host/components/BrowserPaneSettings.tsx).

**Why it exists.** An assistant that can click and type on websites needs the person's explicit, revocable permission, site by site. The brief asks that the person controls which websites the assistant may read or act in and can revoke it.

**Who uses it.** People using the Chrome extension or the Desktop app's browser tools.

**Problems it solves**

- Preventing action on sites the person did not approve.
- Cutting off the Desktop-to-Chrome link.
- Removing browser-pane approvals and blocking sites.

**Use cases**

- Open extension Options > Permissions and press Add for the site in the current tab.
- Press the x next to a site to revoke browser control.
- On Desktop open Settings > Capabilities > Chrome and press Unpair.
- On Desktop open Settings > Browser and Block a tracker site.

## 2. User experience

**Where to find it**

- Chrome: extension Options page, section 'Permissions', approved sites list, 'Add'/'Remove' button for the current site, and 'Grant full browser control' consent (apps/extension/src/options.ts:1295-1297, :1337-1343, :1354-1395).
- Desktop: Settings > Capabilities shows the 'Chrome' pairing section (apps/web/features/settings/sections/CapabilitiesSection.tsx:214; apps/web/features/desktop-host/components/BrowserPairingSection.tsx:15).
- Desktop: Settings section 'Browser' (browser-pane) with 'Allowed sites', 'Blocked sites', 'Browsing data' (apps/web/features/settings/components/WebSettingsModal.tsx:252; apps/web/features/desktop-host/components/BrowserPaneSettings.tsx:23-39).
- Web, Mobile, CLI, VS Code: not applicable (brief).

**Before you start**

- Chrome: open a website in a tab so Options can offer it (options.ts:1480-1492).
- Desktop pairing: Desktop app running with the browser host registered; the extension starts pairing from its side panel (BrowserPairingSection.tsx:15-20).

**Screens and controls**

- Chrome list rows show the origin, with ', browser control granted' when granted, and a remove button labelled 'Remove <origin>' (options.ts:1438-1457).
- Chrome help text: 'Approve a site so the assistant can act on it, and remove it any time.' (options.ts:1341).
- Chrome empty text 'No sites allowlisted yet.' (options.ts:1409).
- Desktop Unpair dialog 'Unpair this browser?' with button 'Unpair' (BrowserPairingSection.tsx:93-108).
- Desktop Browser page: Remove and Block buttons, field 'Site to block', button 'Clear browsing data' (BrowserPaneSettings.tsx:33-41).

**Journey**

1. Chrome: open the site, open Options, press Add; Chrome asks for host permission (needs a click) and the person may grant full browser control.
2. The assistant may now act there, subject to every action asking first.
3. To revoke, press the remove x; the app removes the origin, revokes consent and drops host permission.
4. Status line reads '<origin> removed. Browser control for it was revoked.' (options.ts:1469).

**What the person sees and gets**

- Chrome status text 'Removing <origin>…' then the removal message; errors 'Could not update approved sites.' (options.ts:1462-1475).
- Desktop 'Paired and answering' or 'Paired, not answering right now' with a fingerprint (BrowserPairingSection.tsx:150-153).
- Desktop errors 'The browser was not unpaired.' (BrowserPairingSection.tsx:27).

**Settings**

- Chrome storage keys: agi_site_allowlist and a user blocklist key (apps/extension/src/background/policy.ts:187; apps/extension/src/features/site-policy/userBlocklist.ts).
- Desktop browser pane lists saved in a sites file with mode 0600 (apps/desktop/electron/browserPane.ts:74-86).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Chrome allowlist normalised to http/https origins, deduplicated (apps/extension/src/features/options/site-allowlist.ts:1-41).
- Chrome host permission request, check and removal per approved origin (site-allowlist.ts:57-111).
- Removing a site removes the allowlist entry, revokes browser-control consent and removes host permission (apps/extension/src/options.ts:1451-1478).
- Saving the allowlist removes any matching entry from the user blocklist (options.ts:1171-1176).
- Messages from page tabs are classed 'allowlisted-tab' in a message policy table (apps/extension/src/background/policy.ts:14-34).
- Desktop gates each browser command twice: a stored permission (asked once per client) and, for the renderer, an 'Allow once' dialog titled 'Use the paired browser?'; the extension then applies its own site allowlist (apps/desktop/electron/runtime/dispatcher.ts:2089-2113, :2155-2210).
- Desktop unpair confirms first and removes the host (BrowserPairingSection.tsx:93-108).
- Desktop browser pane keeps allowed and blocked lists; Block refuses open panes on that site immediately (apps/desktop/electron/browserPane.ts:88-114; dispatcher.ts:2480-2486).

**Incomplete**

- The brief cites dispatcher.ts:924 as the browsing permission check; that line is a command requirements table, not the gate. The gate is runBrowserCommand (dispatcher.ts:~2155).
- The Chrome section label for the list was not read beyond the 'Permissions' section title.

**Present but disconnected or switched off**

- none found in the code.

**Not available**

- Web, Mobile, CLI and VS Code have no site access controls (brief: not applicable).

## 4. Required behaviour

**Established requirements**

- The user controls which websites or browser the assistant may read or act in, and can revoke that access (desktop and Chrome done). (source: S85.10 (brief))
- A site must be on the allowlist before the extension acts there; the allowlist is stored under agi_site_allowlist. (source: apps/extension/src/background/policy.ts:187; apps/extension/src/features/options/site-allowlist.ts:62-67)
- Removing a site removes its entry and revokes its browser control. (source: apps/extension/src/options.ts:1451-1478)
- Desktop asks before browser actions and the extension's own list is a second, independent gate. (source: apps/desktop/electron/runtime/dispatcher.ts:2086-2090)

**Acceptance criteria**

1. A site not on the Chrome list cannot receive page actions.
2. Adding a site requests Chrome host permission and records the origin.
3. Removing a site clears the list entry, browser-control consent and host permission.
4. A site on the allowlist but with host permission refused cannot be read.
5. Unpair on Desktop asks first and afterwards the extension is no longer answered.
6. A blocked site never opens in the Desktop browser pane, even if allowed.
7. The list survives restarting Chrome.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Browser actions need both Desktop permission and the Chrome allowlist, so either side can stop an action [inferred from dispatcher.ts:2086-2090].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the Chrome approved sites on Desktop's Chrome section so the two lists are visible in one place.
- [proposed] Fix the brief's code reference to the real gate.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | site-allowlist helpers | `apps/extension/src/features/options/site-allowlist.ts` | Origin normalising, host permission request/check/remove. |
| screen | Chrome Options permissions section | `apps/extension/src/options.ts` | Approved sites list, add and remove, consent prompt (lines 1295-1520). |
| config | SITE_ALLOWLIST_STORAGE_KEY | `apps/extension/src/background/policy.ts` | Storage key agi_site_allowlist (line 187) and message policy. |
| store | chrome.storage.local agi_site_allowlist | `apps/extension/src/background/policy.ts` | Persistent approved origins. |
| service | site policy store | `apps/extension/src/features/site-policy/store.ts` | Evaluates site policy (allowed, denied, not-allowlisted). |
| service | user blocklist | `apps/extension/src/features/site-policy/userBlocklist.ts` | Person's blocked sites. |
| component | BrowserPairingSection | `apps/web/features/desktop-host/components/BrowserPairingSection.tsx` | Desktop pairing status and Unpair. |
| component | BrowserPaneSettings | `apps/web/features/desktop-host/components/BrowserPaneSettings.tsx` | Allowed and blocked sites and Clear browsing data. |
| service | desktop runtime-client | `apps/web/features/desktop-host/lib/runtime-client.ts` | readBrowserPairing, unpairBrowser, readBrowserSites and related calls (line 1004-1022). |
| service | dispatcher runBrowserCommand | `apps/desktop/electron/runtime/dispatcher.ts` | Permission and Allow once gate for browser commands. |
| store | pairingStore | `apps/desktop/electron/browser/pairingStore.ts` | Pairing record, clearPairing. |
| service | browserPane | `apps/desktop/electron/browserPane.ts` | Site lists on disk and pane session. |
| test | site allowlist tests | `apps/extension/__tests__/site-allowlist-options.test.ts` | Options behaviour. |
| test | BrowserPairingSection test | `apps/web/features/desktop-host/__tests__/BrowserPairingSection.test.tsx` | Desktop pairing UI. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses Add in Chrome Options; the page asks Chrome for host permission inside the click. | device | apps/extension/src/features/options/site-allowlist.ts:81-97 |
| The origin is saved to chrome.storage.local. | device | apps/extension/src/options.ts:1170-1177 |
| Later the extension's background checks the sender is an allowlisted tab before it runs page actions. | device | apps/extension/src/background/policy.ts:14-34 |
| For Desktop-driven actions, Desktop checks the stored permission, optionally asks 'Allow once', then sends the command to the paired extension. | device | apps/desktop/electron/runtime/dispatcher.ts:2155-2210 |
| The extension applies its own allowlist and runs or refuses the action. | device | dispatcher.ts:2086-2090 |
| Removing a site deletes the entry, consent and host permission. | device | options.ts:1451-1478 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Approved site origins | chrome.storage.local key agi_site_allowlist | Not found to sync (local storage) | Until removed or the extension is uninstalled |
| Browser control consent per origin | extension storage (readBrowserControlConsent) | No evidence | Revoked when the site is removed |
| Desktop pairing record | app data folder via pairingStore | No | clearPairing on unpair |
| Browser pane allowed and blocked lists | sites file in app data, mode 0600 | No | Until removed |

**Models and providers.** No model decides access. A model may request a browser action, but the lists and permissions decide whether it runs.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Chrome allowlist works without signing in to AGI [inferred; no account call in site-allowlist.ts]. Desktop pairing is between the Mac and a browser on it. |
| Permissions | Chrome host permission (chrome.permissions) plus storage allowlist plus consent. Desktop permission subject per client (dispatcher.ts:2161-2166). |
| Subscription | none found in the code. |
| Limits and metering | Desktop browser pane allows up to MAX_BROWSER_SITES blocked sites (browserPane.ts:102). |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | The controls are entirely on the device and need no subscription or payment; in Local mode they still gate browser actions. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No site open | Label 'No site open'; Add disabled with tip to open a website. | options.ts:1480-1492 |
| Empty list | 'No sites allowlisted yet.' | options.ts:1409, :1436 |
| Site withheld by site policy | List item shows the reason; Add is disabled for a denied site. | options.ts:1429-1452, :1484-1487 |
| Storage read failure | Add disabled and 'Approved sites could not be loaded.' shown. | options.ts:1505-1511 |
| Host permission cannot be removed (required permission) | List entry still removed. | site-allowlist.ts:105-110 |
| Allowlist changed in another tab | List refreshes on storage change. | options.ts:1515-1518 |
| Desktop host not registered or bridge not listening | Specific messages shown. | BrowserPairingSection.tsx:19-22 |
| Unpair fails | 'The browser was not unpaired.' | BrowserPairingSection.tsx:27 |
| Request cancelled mid-command | Runtime returns cancelled. | dispatcher.ts:2159-2161 |
| Accessibility | Remove buttons carry aria-label; Desktop status uses aria-live. | options.ts:1451-1455; BrowserPairingSection.tsx:150 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/site-allowlist-storage-key.test.ts`: Storage key stability.
- `apps/extension/__tests__/site-allowlist-host-permission.test.ts`: Host permission helpers.
- `apps/extension/__tests__/site-allowlist-options.test.ts`: Options list behaviour.
- `apps/web/features/desktop-host/__tests__/BrowserPairingSection.test.tsx`: Desktop pairing section.
- `apps/web/features/desktop-host/__tests__/BrowserPaneSettings.test.tsx`: Allowed, blocked sites and Clear browsing data.

**Test scenarios**

- **Add and act**
  1. Open a site, Options > Add, grant permission.
  2. Ask the assistant to act on the site.
  - Expected: Action allowed after its normal approval.
- **Unlisted site**
  1. Ask the assistant to act on a site not on the list.
  - Expected: Refused with a not-allowlisted reason.
- **Remove**
  1. Press the remove x for the site.
  - Expected: Entry gone, consent revoked, Chrome no longer lists host permission.
- **Unpair**
  1. Desktop Settings > Capabilities > Chrome > Unpair, confirm.
  - Expected: State shows not paired; host removed; Chrome stops answering.
- **Block a site**
  1. Desktop Settings > Browser > Site to block: example.com > Block.
  - Expected: Open pane on that site is refused; site appears under Blocked sites.

**Where to look when it fails**

- Extension status line text in Options.
- chrome://extensions permissions page.
- Desktop runtime error codes permission-denied and cancelled (dispatcher.ts:2189-2207).

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/085-personalization-and-data-settings.md](../../70-qa/test-plans/desktop/085-personalization-and-data-settings.md)
- Chrome: [70-qa/test-plans/chrome/085-personalization-and-data-settings.md](../../70-qa/test-plans/chrome/085-personalization-and-data-settings.md)

## 10. Gaps and dependencies

- **The brief's code reference for the Desktop gate is wrong.** Affects: Documentation.. Evidence: apps/desktop/electron/runtime/dispatcher.ts:924 is a requirements table; gate at :2155-2210.. Work needed: Correct the brief.
- **Desktop does not show the Chrome extension's approved sites.** Affects: Desktop users managing access.. Evidence: BrowserPairingSection.tsx shows pairing state only.. Work needed: Optional read-only view.
- **Two separate site lists (Chrome approved sites and Desktop browser pane lists) can confuse people.** Affects: Desktop plus Chrome users.. Evidence: options.ts and BrowserPaneSettings.tsx hold different lists.. Work needed: Clarify copy.

**Depends on**

- SYS-agents-tools-and-automation
- SYS-security-and-privacy
- SYS-execution-boundaries
- SYS-authorization-and-workspaces
- surface:chrome
- surface:desktop
- store:chrome-storage-local
- store:desktop-browser-sites-file
- mode:local
- mode:cloud
- mode:own-key

## Unknown

- Where in the background the allowlist is actually enforced per action (only the policy table and storage key were read).
- Whether the Chrome approved sites sync between browsers.
- The exact label of the Chrome list inside the Permissions section.
- The value of MAX_BROWSER_SITES.
- Whether Desktop Settings reaches the Chrome section by the label 'Capabilities' in the navigation (only the section file name was read).
