---
id: "F008-12"
type: "feature"
title: "Progress, loading and feedback messages"
aliases: ["Progress bar", "Spinner", "Loading indicator", "Skeleton", "Toast", "Alert", "Banner", "Pagination", "Load more", "Empty state", "Error state", "S8.43 to S8.50"]
area: "8 Basic interactive elements"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "partly seen (1 of 8)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S8.43", "S8.44", "S8.45", "S8.46", "S8.47", "S8.48", "S8.49", "S8.50"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-shared-ui-and-design", "SYS-observability-and-operations", "SYS-chat-turn-pipeline", "file:packages/ui/ui/src/primitives/Spinner.tsx", "file:apps/mobile/src/shared/components/Toast.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F008-12 Progress, loading and feedback messages

Feedback while the app works or has nothing to show: progress bars and spinners, skeleton placeholders, toasts that fade, inline alerts, banners, Load more paging, empty states and error states with a Retry. Web, mobile and the CLI cover most; Chrome has no toast and VS Code has no skeleton.

Area: [8. Basic interactive elements](README.md). Requirement items: [S8.43](../../10-requirements/capabilities/008-basic-interactive-elements.md#s843), [S8.44](../../10-requirements/capabilities/008-basic-interactive-elements.md#s844), [S8.45](../../10-requirements/capabilities/008-basic-interactive-elements.md#s845), [S8.46](../../10-requirements/capabilities/008-basic-interactive-elements.md#s846), [S8.47](../../10-requirements/capabilities/008-basic-interactive-elements.md#s847), [S8.48](../../10-requirements/capabilities/008-basic-interactive-elements.md#s848), [S8.49](../../10-requirements/capabilities/008-basic-interactive-elements.md#s849), [S8.50](../../10-requirements/capabilities/008-basic-interactive-elements.md#s850).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 8) |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Tells the person what is happening, what went wrong and what to do next.

**Why it exists.** Silent waits and silent failures make the product feel broken; a bare spinner is not accessible (doc: knowledge-base/data/area-briefs/008-basic-interactive-elements.md S8.43 to S8.50).

**Who uses it.** Every user on every app.

**Problems it solves**

- Not knowing whether work is running.
- Errors without a way to recover.
- Empty lists with no next step.
- Long lists that load all at once.

**Use cases**

- Retry a failed turn on web.
- See 'Load more' under a long projects list.
- Read a toast on mobile after an action.
- See 'Start a conversation' in a new VS Code chat.

## 2. User experience

**Where to find it**

- Web: spinner and progress primitives (packages/ui/ui/src/primitives/Spinner.tsx, Progress.tsx); steps progress label '% complete' (StepsCard.tsx:177); toasts via the Sonner toaster at top centre with close button (apps/web/app/Providers.tsx:26-31); turn error notice with 'Retry' (apps/web/features/chat/pages/WebChatPage.tsx:6885-6925); usage banner (packages/ui/unified-chat/src/components/UsageWarningBanner.tsx); projects 'Load more' button (apps/web/app/chat/projects/page.tsx:467-480).
- Desktop: Electron shows hosted web (doc: AGENTS.md section 5).
- Mobile: Toast (apps/mobile/src/shared/components/Toast.tsx), 'Loading projects' indicator and 'Retry loading projects' button (apps/mobile/app/(app)/(tabs)/projects.tsx:305-320), 'Load more archived chats' (apps/mobile/app/(app)/settings/archived-chats.tsx:583-592), endless list in library (apps/mobile/src/features/library/index.tsx:964-965).
- CLI: status notice line for 2 seconds (apps/cli/src/tui/tui_app.rs:52,2422), spinner glyph in tool cells (tui_app.rs:334-339).
- VS Code: progressbar element, runtime status, 'Start a conversation' empty state, info and warning messages (webviewContent.ts:3139,3122,172; apps/extension-vscode/src/core/commandSetup.ts:254-313).
- Chrome: status regions with aria-live (apps/extension/src/side_panel.ts:6344,10765,12170); no toast found.

**Before you start**

- None; these appear as work happens.

**Screens and controls**

- Spinner: role status with hidden text 'Loading...' (Spinner.tsx:22-27).
- Progress: role progressbar with value now, min and max (Progress.tsx:25-31).
- Skeleton: hidden from assistive tech (Skeleton.tsx:25).
- Alert: role alert, polite or assertive live region (Alert.tsx:25-31).
- Pagination: nav with Previous and Next labels (Pagination.tsx:10-20,66-95).
- Empty state: role status with title, text and optional action (EmptyState.tsx:19-47).

**Journey**

1. Start an action.
2. See a spinner, bar or skeleton.
3. On success see content or a toast; on failure see an alert or error state.
4. Use Retry or the recovery action.
5. For long lists, press Load more or Next.

**What the person sees and gets**

- Mobile toast stays 5 s, 8 s when it has an action (Toast.tsx:13-14).
- CLI notice disappears after 2 s (tui_app.rs:52).
- Web turn error shows a 'Retry' button named 'Retry this turn' (WebChatPage.tsx:6911-6918).

**Settings**

- Mobile toast animation respects reduce motion (Toast.tsx:11,16 imports useReduceMotion).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Spinner has an accessible name through hidden text (Spinner.tsx:22-27).
- Progress sets progressbar role and values; accessible name is left to the caller (Progress.tsx:25-31), and StepsCard supplies one (StepsCard.tsx:177).
- Skeleton primitive supports pulse, wave or none (Skeleton.tsx:9-17); web has MessageBubbleSkeleton and ChatLoadingSkeleton.
- Web toaster is mounted in Providers with close button (Providers.tsx:26-31) and its test exists.
- Mobile toast queue with action, tap guard and timers (Toast.tsx:13-60).
- Alert primitive with live-region semantics (Alert.tsx:20-35).
- Web turn error uses role alert and a Retry action (WebChatPage.tsx:6885-6925).
- Mobile projects shows loading, error with alert role, Retry and empty text 'No archived projects' / 'No matches' (projects.tsx:305-325,408-420).
- Pagination primitive plus Load more buttons on web and mobile (Pagination.tsx; projects/page.tsx:467; archived-chats.tsx:583).
- VS Code has status regions and a progressbar (webviewContent.ts:2918,3122,3139) and an empty state (line 172).
- CLI has a timed notice and spinner glyph (tui_app.rs:52,334-339).

**Incomplete**

- Progress primitive has no default accessible name (Progress.tsx:25-31).
- Skeleton is aria-hidden, so loading is not announced by itself (Skeleton.tsx:25).
- Mobile toast live-region announcement: not found in the 80 lines read (only the action has a role and label).

**Present but disconnected or switched off**

- nothing found

**Not available**

- Skeletons on VS Code and Chrome (brief missing).
- Toast on Chrome (brief missing; none found).
- Pagination on VS Code (brief missing); Chrome unverified.

## 4. Required behaviour

**Established requirements**

- Progress indicators have an accessible name; determinate bars or indeterminate spinners. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.43)
- Skeletons stand in for content while it loads. (source: S8.44 in the same brief)
- Toasts are transient, non-blocking and dismiss themselves. (source: S8.45 in the same brief)
- Inline alerts use alert or status semantics; banners are full-width strips for system or account messages. (source: S8.46 and S8.47 in the same brief)
- Pagination (next, previous, page numbers or Load more) lets people move through a long list. (source: S8.48 in the same brief)
- Empty states show a message and a next step; error states show a view-level message with a recovery action. (source: S8.49 and S8.50 in the same brief)

**Acceptance criteria**

1. A spinner on web exposes role status with the text 'Loading...'.
2. A progress bar always has an accessible name where it is used.
3. A failed web turn shows an alert with a Retry button that resends the turn.
4. On mobile, the Projects tab shows 'Loading projects', then an alert with 'Retry loading projects' when sync fails.
5. Pressing 'Load more' on web projects adds the next page and disables the button while loading.
6. A mobile toast disappears after about 5 seconds without input.
7. An empty VS Code chat shows 'Start a conversation'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A toast should be announced by assistive tech since it vanishes [inferred; check mobile and web Sonner config].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give Progress a required label prop.
- [proposed] Announce skeleton loads with a status region.
- [proposed] Add a toast or equivalent status to Chrome and a skeleton to VS Code.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Spinner | `packages/ui/ui/src/primitives/Spinner.tsx` | Loading spinner with hidden text |
| component | Progress | `packages/ui/ui/src/primitives/Progress.tsx` | Progress bar |
| component | Skeleton | `packages/ui/ui/src/primitives/Skeleton.tsx` | Skeleton blocks |
| component | SonnerToaster | `packages/ui/ui/src/primitives/SonnerToaster.tsx` | Toast host and toast function |
| component | Alert | `packages/ui/ui/src/primitives/Alert.tsx` | Inline alert |
| component | Pagination | `packages/ui/ui/src/primitives/Pagination.tsx` | Pagination parts |
| component | EmptyState | `packages/ui/ui/src/primitives/EmptyState.tsx` | Empty state |
| component | Web Providers | `apps/web/app/Providers.tsx` | Mounts toaster |
| component | WebChatPage turn error | `apps/web/features/chat/pages/WebChatPage.tsx` | Error notice with Retry |
| component | UsageWarningBanner | `packages/ui/unified-chat/src/components/UsageWarningBanner.tsx` | Banner with status role |
| component | MessageBubbleSkeleton | `apps/web/features/chat/components/messages/MessageBubbleSkeleton.tsx` | Web message skeleton |
| component | Projects page | `apps/web/app/chat/projects/page.tsx` | Load more |
| component | Mobile Toast | `apps/mobile/src/shared/components/Toast.tsx` | Toast store and view |
| screen | Mobile projects tab | `apps/mobile/app/(app)/(tabs)/projects.tsx` | Loading, error, empty states |
| screen | Mobile archived chats | `apps/mobile/app/(app)/settings/archived-chats.tsx` | Load more |
| component | CLI status notice | `apps/cli/src/tui/tui_app.rs` | Timed notice and spinner glyph |
| component | VS Code webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Status regions, progressbar, empty state |
| component | Chrome side panel | `apps/extension/src/side_panel.ts` | Status regions |
| test | Alert.test | `packages/ui/ui/src/primitives/__tests__/Alert.test.tsx` | Alert tests |
| test | SonnerToaster.test | `packages/ui/ui/src/primitives/__tests__/SonnerToaster.test.tsx` | Toaster tests |
| test | Pagination.test | `packages/ui/ui/src/primitives/__tests__/Pagination.test.tsx` | Pagination tests |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A feature sets loading, error or empty state in its store. | device | projects.tsx:305-320 (syncStatus) |
| The matching primitive renders; a toast call adds an entry to a store with a timer. | device | Toast.tsx:40-60 |
| Retry or Load more repeats the request to the server for that list. | our servers | projects/page.tsx:471 loadMoreProjects; endpoint: unknown |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Toast entries | In-memory store (mobile) | No | Removed on timeout or dismiss (Toast.tsx:44-52) |

**Models and providers.** No model takes part. Error text may come from a failed model turn (provider_not_configured case, WebChatPage.tsx:6885) but the controls just show it.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found for the controls. |
| Permissions | None found. |
| Subscription | The usage banner shows plan or usage messages supplied by other features (UsageWarningBanner.tsx); the controls themselves have no entitlement rule. |
| Limits and metering | Toast times 5 s and 8 s are constants (Toast.tsx:13-14); CLI notice 2 s (tui_app.rs:52). |
| Feature flags | None found. |
| Model compatibility | None. |
| Provider restrictions | Web error action points to a Status page when a provider is not configured (WebChatPage.tsx:6897-6905). |
| Local mode | All controls work on the device in Local mode; messages shown depend on the feature that raised them. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner or skeleton | Spinner.tsx; Skeleton.tsx |
| Error with retry | Alert with Retry | WebChatPage.tsx:6911-6918; projects.tsx:319-325 |
| Offline | Mobile shows an offline message for refresh failures | projects.tsx:314-316 (PROJECTS_REFRESH_OFFLINE_MESSAGE) |
| Empty | EmptyState with action; mobile shows 'No matches' or 'No archived projects' | EmptyState.tsx; projects.tsx:411-418 |
| Load more in flight | Web button disabled; mobile label becomes 'Loading…' | projects/page.tsx:475; archived-chats.tsx:592 |
| Reduced motion | Mobile toast reads the reduce motion setting | Toast.tsx:11 |
| Toast tap guard | Ignores taps for 400 ms after a toast with an action closes | Toast.tsx:15,40-52 |
| Timeout of long loads | Not handled in these primitives | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/ui/src/primitives/__tests__/Alert.test.tsx`: Alert primitive
- `packages/ui/ui/src/primitives/__tests__/SonnerToaster.test.tsx`: Toaster primitive
- `packages/ui/ui/src/primitives/__tests__/Pagination.test.tsx`: Pagination primitive
- `packages/ui/ui/src/primitives/__tests__/Pagination.i18nCatalogue.test.tsx`: Pagination text catalogue
- `apps/mobile/__tests__/EmptyState.test.tsx`: Mobile empty state
- `apps/mobile/__tests__/ArchivedChatsScreen.test.tsx`: Archived chats incl. load more
- `apps/mobile/__tests__/ImageGenProgress.test.tsx`: Mobile image progress

**Test scenarios**

- **Turn failure**
  1. Cause a model turn to fail on web (for example with no provider key).
  2. Read the notice.
  - Expected: Alert with message and Retry or Status link.
- **Projects load more**
  1. Open web Projects with more than one page.
  2. Click Load more.
  - Expected: Next page appends; button disabled during load.
- **Mobile toast**
  1. Trigger an action that shows a toast.
  2. Wait.
  - Expected: Gone after about 5 s (8 s with action).
- **Mobile sync error**
  1. Go offline, open Projects in Cloud mode.
  - Expected: Alert text and 'Retry loading projects' button.
- **VS Code empty**
  1. Open a new chat in the sidebar.
  - Expected: 'Start a conversation'.
- **CLI notice**
  1. Press Ctrl-O.
  - Expected: Notice for 2 s.

**Where to look when it fails**

- Check aria roles in dev tools; Mobile logs warnings via console (for example '[ChatScreen] Image generation failed:').

**Hands-on test plans**

- Web: [70-qa/test-plans/web/008-basic-interactive-elements.md](../../70-qa/test-plans/web/008-basic-interactive-elements.md)
- Desktop: [70-qa/test-plans/desktop/008-basic-interactive-elements.md](../../70-qa/test-plans/desktop/008-basic-interactive-elements.md)
- Mobile: [70-qa/test-plans/mobile/008-basic-interactive-elements.md](../../70-qa/test-plans/mobile/008-basic-interactive-elements.md)
- CLI: [70-qa/test-plans/cli/008-basic-interactive-elements.md](../../70-qa/test-plans/cli/008-basic-interactive-elements.md)
- VS Code: [70-qa/test-plans/vscode/008-basic-interactive-elements.md](../../70-qa/test-plans/vscode/008-basic-interactive-elements.md)
- Chrome: [70-qa/test-plans/chrome/008-basic-interactive-elements.md](../../70-qa/test-plans/chrome/008-basic-interactive-elements.md)

## 10. Gaps and dependencies

- **Progress has no default accessible name.** Affects: All apps using the primitive. Evidence: Progress.tsx:25-31. Work needed: Require aria-label.
- **No toast on Chrome, no skeleton on VS Code and Chrome.** Affects: Chrome, VS Code. Evidence: brief S8.44, S8.45. Work needed: Add or mark n/a.
- **Mobile toast announcement not found.** Affects: Mobile screen reader users. Evidence: Toast.tsx lines 1-110 read. Work needed: Confirm and add a live announcement.
- **Brief code references are stale (for example WebChatPage.tsx:5569).** Affects: Documentation. Evidence: WebChatPage.tsx:5560-5640 is edit handling. Work needed: Refresh.
- **Pagination on VS Code and Chrome unclear.** Affects: VS Code, Chrome. Evidence: brief. Work needed: Verify.

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-shared-ui-and-design
- SYS-observability-and-operations
- SYS-chat-turn-pipeline
- file:packages/ui/ui/src/primitives/Spinner.tsx
- file:apps/mobile/src/shared/components/Toast.tsx

## Unknown

- Whether the web toaster announces toasts to screen readers.
- Server endpoints behind Load more.
- Chrome pagination and toast alternatives.
- Whether any timeouts are applied to long loads.
- Exact desktop retained skeleton and pagination code.
