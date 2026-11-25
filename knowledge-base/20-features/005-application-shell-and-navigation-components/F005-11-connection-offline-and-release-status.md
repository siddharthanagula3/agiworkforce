---
id: "F005-11"
type: "feature"
title: "Connection, offline and release status"
aliases: ["Offline indicator", "Network status indicator", "Sync status bar", "Connection status", "Release or update indicator", "Update ready notice", "OfflineBanner (mobile)"]
area: "5 Application shell and navigation components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S5.32", "S5.33", "S5.34"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "SYS-sync-and-continuity", "SYS-observability-and-operations", "store:offline-queue", "file:packages/client/client-runtime/src/offline-sync/index.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F005-11 Connection, offline and release status

Shows when the device is offline or sync is syncing, queued or failing, and tells Desktop users a new release is ready. Web shows a status bar with Retry on error. Mobile shows an offline banner. CLI shows a connection line in /status. VS Code and Chrome have connection items. Release notices exist on Desktop and CLI only.

Area: [5. Application shell and navigation components](README.md). Requirement items: [S5.32](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s532), [S5.33](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s533), [S5.34](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s534).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Displays network and sync state, offers Retry when sync fails, and announces a downloaded or available app update.

**Why it exists.** People need to know why a change has not saved and when to update (S5.32, S5.33, S5.34).

**Who uses it.** Everyone on Web, Desktop and Mobile; CLI users running /status.

**Problems it solves**

- Wondering whether work is saved while offline.
- Not knowing queued changes exist.
- Missing a desktop update.

**Use cases**

- Lose Wi-Fi on Web: a bar shows offline, with 'N pending' when changes are queued.
- Sync fails: bar shows error and Retry.
- Desktop downloads an update: the update row tells the person.
- CLI /status shows whether AGI Cloud is reachable.

## 2. User experience

**Where to find it**

- Web and Desktop: status bar at the top centre of the page, label 'Network status indicator' (apps/web/shared/components/OfflineIndicator.tsx:124-134), mounted from apps/web/app/AppRuntimeMounts.tsx:22.
- Desktop: menu entry 'Check for Updates…' (apps/desktop/electron/appMenu.ts:136, 574 non-mac) and an update notice and row in the web UI (apps/web/features/desktop-host/components/DesktopUpdateNotice.tsx, DesktopUpdateRow.tsx).
- Mobile: banner at the top: 'You're offline. Local chats still work on this device.' (apps/mobile/src/features/edge-cases/components/copy.ts:21; OfflineBanner mounted in apps/mobile/app/_layout.tsx:1006).
- CLI: '/status' prints a connectivity line (apps/cli/src/repl/slash_commands.rs:283-286; apps/cli/src/cloud/client.rs:1143).
- VS Code and Chrome: brief says connection done, offline missing; not verified here.

**Before you start**

- Web: nothing; the manager starts on mount.
- Desktop update notice: a Desktop shell exposing the update bridge.

**Screens and controls**

- Bar with icon, message, optional error text, 'Last synced: <time>' when online, a 'Retry' button (error only), '<N> pending' and 'Syncing…' chips.
- Mobile banner: icon and text only, no button.

**Journey**

1. 1. Network drops; the bar appears with the offline message.
2. 2. Changes made offline are queued; the bar shows 'N pending'.
3. 3. Network returns; sync runs and shows 'Syncing…'.
4. 4. If sync fails, error message and Retry appear; click Retry.
5. 5. When all is synced the bar disappears.

**What the person sees and gets**

- Message text from the sync manager: 'Sync failed - will retry' for error (packages/client/client-runtime/src/offline-sync/index.ts:262) and others for online, offline and syncing.
- Error detail 'Sync did not finish. Retry when you are online.' as fallback (OfflineIndicator.tsx:150).

**Settings**

- Desktop update check runs about once a day and a dismissed version is remembered (DesktopUpdateNotice.tsx:8-10).
- Sync retry timing is set by retryBaseMs and retryMaxMs defaults in the sync manager (offline-sync/index.ts:78-79).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web indicator with visibility rule: always, offline, queued, syncing or error (OfflineIndicator.tsx:60-67).
- role=status and aria-live polite (OfflineIndicator.tsx:132-134).
- Retry button only in the error state (OfflineIndicator.tsx:176-188).
- Sync manager with exponential retry and queue count (packages/client/client-runtime/src/offline-sync/index.ts:123-151).
- Desktop update-ready event pushed to the page, with a pending-update query on subscribe (apps/desktop/electron/preload.ts:121-141; main.ts:626, 2455).
- Mobile OfflineBanner uses network status and announces politely (OfflineBanner.tsx:9-27).
- CLI connectivity line, which says AGI Cloud is not used when the session is not managed (apps/cli/src/cloud/client.rs:1143-1146).

**Incomplete**

- When offline and not in error, no reconnect button is shown, which does not meet the brief's 'offers reconnect' (doc: brief S5.32; code OfflineIndicator.tsx:176).
- Mobile banner has no retry (OfflineBanner.tsx).

**Present but disconnected or switched off**

- none found

**Not available**

- Release indicator on Web and Mobile (brief S5.34).
- Offline indicator on CLI, VS Code, Chrome (brief S5.33).

## 4. Required behaviour

**Established requirements**

- A status indicator shows whether the app is connected to its backend/runtime and offers reconnect when not. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.32)
- When the device loses network, a visible offline indicator appears and clears when back online. (source: S5.33 Should (same brief))
- The app tells the user when a new release is available (or just installed) and how to get it. (source: S5.34 Should (same brief))

**Acceptance criteria**

1. Going offline on Web shows the bar within a moment and it carries role=status.
2. Queued changes show '<N> pending'.
3. Coming online clears the bar once synced.
4. Sync error shows Retry; clicking it starts a sync.
5. Mobile airplane mode shows the banner and returning online removes it.
6. Desktop with a downloaded update shows the update notice with the version.
7. CLI /status shows a connectivity line.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- An offline bar with a Reconnect action would meet S5.32 better [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a Reconnect button when offline.
- [proposed] Add a release notice on Web (new deploy) and Mobile (store update).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | OfflineIndicator | `apps/web/shared/components/OfflineIndicator.tsx` | Web status bar |
| component | AppRuntimeMounts | `apps/web/app/AppRuntimeMounts.tsx` | Mounts the indicator |
| service | offlineSync wrapper | `apps/web/lib/offline/offlineSync.ts` | Binds the shared manager to the web queue |
| store | offlineQueue | `apps/web/lib/offline/offlineQueue.ts` | Queued changes (internals not read) |
| service | createOfflineSyncManager | `packages/client/client-runtime/src/offline-sync/index.ts` | State machine, retry, status text |
| test | offline-sync test | `packages/client/client-runtime/src/offline-sync/__tests__/offline-sync.test.ts` | Manager behaviour |
| component | OfflineBanner | `apps/mobile/src/features/edge-cases/components/OfflineBanner.tsx` | Mobile banner |
| hook | useNetworkStatus | `apps/mobile/hooks/useNetworkStatus.ts` | Mobile online flag (imported; body not read) |
| config | EDGE_COPY | `apps/mobile/src/features/edge-cases/components/copy.ts` | Mobile offline text |
| screen | Root layout | `apps/mobile/app/_layout.tsx` | Mounts the banner |
| component | DesktopUpdateNotice | `apps/web/features/desktop-host/components/DesktopUpdateNotice.tsx` | Update available or ready notice |
| component | DesktopUpdateRow | `apps/web/features/desktop-host/components/DesktopUpdateRow.tsx` | Update row in desktop settings |
| service | preload onRuntimeEvent | `apps/desktop/electron/preload.ts` | Delivers update-ready to the page |
| service | update-ready event | `apps/desktop/electron/main.ts` | Sends update-ready and answers pendingUpdate |
| command | Check for Updates | `apps/desktop/electron/appMenu.ts` | Menu entry |
| event | update-ready | `packages/contracts/local-runtime/src/protocol.ts` | Runtime event type |
| service | connectivity_line | `apps/cli/src/cloud/client.rs` | CLI cloud reachability line |
| command | /status | `apps/cli/src/repl/slash_commands.rs` | Prints status including connectivity |
| test | OfflineIndicator error test | `apps/web/shared/components/OfflineIndicator.error.test.tsx` | Error state |
| test | DesktopUpdateNotice test | `apps/web/features/desktop-host/__tests__/DesktopUpdateNotice.test.tsx` | Update notice |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Indicator starts the sync manager and subscribes to its state | device | OfflineIndicator.tsx:30-46 |
| Manager tracks online flag and queued count; on online it syncs the queue | device | offline-sync/index.ts:109-151 |
| Queue sync sends queued changes to our servers | device and our servers | apps/web/lib/offline/offlineSync.ts:8-12 binds syncOfflineQueue; server calls in offlineQueue.ts not read |
| Retry button calls retrySync | device | OfflineIndicator.tsx:176-179 |
| Desktop main process emits update-ready; preload relays it; the page shows a notice | device | main.ts:2455; preload.ts:121-141; DesktopUpdateNotice.tsx:40-50 |
| Desktop host checks for an update about once a day and the page shows the result; the update source (an outside service) was not traced | device | DesktopUpdateNotice.tsx:8-10, 60-65 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Queued offline changes | web offline queue (apps/web/lib/offline/offlineQueue.ts; storage type not read) | yes, when online | unknown |
| Last update check time and dismissed version | browser local storage keys agi-desktop-update-last-check:v1 and agi-desktop-update-dismissed-version:v1 | no | kept until cleared |

**Models and providers.** No model or provider takes part. In CLI, connectivity is checked only for managed (Cloud) sessions; own-key and local sessions print that AGI Cloud is not used.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The Web indicator mounts for all pages in AppRuntimeMounts; no sign-in check in the component. Queue sync needs a session [inferred]. |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | Retry backoff base and max delays (offline-sync/index.ts:78-79). |
| Feature flags | none found in the code |
| Model compatibility | not applicable |
| Provider restrictions | CLI connectivity probe is skipped unless privacy mode is managed (client.rs:1144-1146). |
| Local mode | Mobile banner states 'Local chats still work on this device', so offline does not block Local chat. On Web the bar reports sync state only; whether Local inference continues offline on Web was not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| offline | Bar with offline icon and message; no reconnect button | OfflineIndicator.tsx:60-67, 176 |
| syncing | Spinner and 'Syncing…' | OfflineIndicator.tsx:200-205 |
| queued | 'N pending' | OfflineIndicator.tsx:192-197 |
| error | Error text and Retry | OfflineIndicator.tsx:160-188 |
| reconnect | Manager retries with exponential delay and syncs on online | offline-sync/index.ts:123-151 |
| recovered | Bar hides when online with nothing queued and not syncing or error | OfflineIndicator.tsx:60-67 |
| update download failure | Alert with message in the update notice | DesktopUpdateNotice.tsx:15-24 |
| accessibility | Web: role=status, polite live region; mobile: role alert, polite live region; reduced motion respected for spinner (motion-safe) | OfflineIndicator.tsx:132-134, 105; OfflineBanner.tsx:30-33 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/shared/components/OfflineIndicator.error.test.tsx`: Error state (contents not read)
- `packages/client/client-runtime/src/offline-sync/__tests__/offline-sync.test.ts`: Manager
- `apps/web/features/desktop-host/__tests__/DesktopUpdateNotice.test.tsx`: Update notice
- `apps/web/features/desktop-host/__tests__/DesktopUpdateRow.test.tsx`: Update row
- `apps/desktop/electron/__tests__/appMenu.test.ts`: Menu including update entry

**Test scenarios**

- **Go offline on Web**
  1. Open Web
  2. Switch network off in dev tools
  - Expected: Bar shows offline; returns online and hides after sync
- **Queue count**
  1. Go offline
  2. Make a change that queues
  3. Look at the bar
  - Expected: 'N pending' appears
- **Retry**
  1. Force the sync call to fail
  2. Click Retry
  - Expected: Sync reruns
- **Mobile airplane mode**
  1. Turn on airplane mode in the app
  - Expected: Banner appears; Local chat still works
- **Desktop update**
  1. Stage an update
  2. Open the desktop app
  - Expected: Update-ready notice with version
- **CLI status**
  1. Run /status in a managed session
  - Expected: Connectivity line with result

**Where to look when it fails**

- Console lines prefixed '[OfflineSync]' (offline-sync/index.ts:51-52).
- Desktop events recorded with recordDesktopEvent for failed loads.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/web/005-application-shell-and-navigation-components.md)
- Desktop: [70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md)
- Mobile: [70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md)
- CLI: [70-qa/test-plans/cli/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/cli/005-application-shell-and-navigation-components.md)
- VS Code: [70-qa/test-plans/vscode/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/vscode/005-application-shell-and-navigation-components.md)
- Chrome: [70-qa/test-plans/chrome/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/chrome/005-application-shell-and-navigation-components.md)

## 10. Gaps and dependencies

- **No reconnect action when offline** Affects: Web, Desktop, Mobile. Evidence: OfflineIndicator.tsx:176 only in error; OfflineBanner.tsx. Work needed: Add Reconnect/Retry when offline [proposed]
- **No release indicator on Web and Mobile** Affects: Web, Mobile. Evidence: brief S5.34. Work needed: Decide how a web deploy or store update is announced
- **No offline indicator on CLI, VS Code, Chrome** Affects: CLI, VS Code, Chrome. Evidence: brief S5.33. Work needed: Add per app
- **Web bar does not say whether Local chat still works offline** Affects: Web, Desktop. Evidence: Mobile copy says so (copy.ts:21); Web message from manager has no such text. Work needed: Establish behaviour then add text [proposed]

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- SYS-sync-and-continuity
- SYS-observability-and-operations
- store:offline-queue
- file:packages/client/client-runtime/src/offline-sync/index.ts

## Unknown

- Storage type and server calls of the web offline queue.
- Whether VS Code and Chrome connection items work as the brief says (line citations did not match).
- How the desktop update source is chosen.
- useNetworkStatus implementation on mobile.
- CLI release notice (brief cites tui_app.rs:4615, which holds paste handling in the lines read).
- Whether Local chat on Web works offline.
