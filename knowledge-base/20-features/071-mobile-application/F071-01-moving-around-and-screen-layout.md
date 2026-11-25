---
id: "F071-01"
type: "feature"
title: "Moving around and screen layout"
aliases: ["Drawer", "Side panel", "Sidebar", "Navigation drawer", "Native navigation", "Tablet layout", "Foldable adaptation", "Landscape adaptation", "Orientation lock", "S71.01", "S71.25", "S71.26", "S71.27"]
area: "71 Mobile application"
available_on: ["mobile"]
implementation: {web: "n/a", desktop: "n/a", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S71.01", "S71.25", "S71.26", "S71.27"]
depends_on: ["surface:mobile", "mode:local", "mode:cloud", "file:apps/mobile/app/(app)/_layout.tsx", "file:apps/mobile/src/shared/hooks/useTabletLayout.ts", "file:apps/mobile/src/shared/hooks/useResponsiveLayout.ts", "file:apps/mobile/src/features/shell/drawerGestures.ts", "file:apps/mobile/lib/v1FeatureFlags.ts", "SYS-shared-ui-and-design", "SYS-sync-and-continuity"]
basis: "code inspection"
second_reader: "6 of 11 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F071-01 Moving around and screen layout

How the AGI Mobile app moves between chats, lists and settings. Phones get a slide-out drawer plus stack pages with back gestures. Windows 1000 points wide or more get a permanent side panel. Camera and scan pages do not show the permanent panel (on a phone they keep the swipe-open overlay drawer) and the voice page turns the drawer swipe off. Phones stay in portrait. Tablets may rotate. Mobile only.

Area: [71. Mobile application](README.md). Requirement items: [S71.01](../../10-requirements/capabilities/071-mobile-application.md#s7101), [S71.25](../../10-requirements/capabilities/071-mobile-application.md#s7125), [S71.26](../../10-requirements/capabilities/071-mobile-application.md#s7126), [S71.27](../../10-requirements/capabilities/071-mobile-application.md#s7127).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the Mobile app its frame. A drawer holds the Local/Cloud mode switch, search, new chat, destinations (projects, library, images, schedules and others), recent chats, settings. Stack pages open on top. The layout changes with the window width, and the screen orientation is locked for phones.

**Why it exists.** The brief asks for native patterns: a swipeable drawer plus stack routes with back gestures (S71.01), a wider tablet layout that adapts to split view (S71.25), foldable adaptation (S71.26) and landscape adaptation (S71.27). (doc: knowledge-base/data/area-briefs/071-mobile-application.md)

**Who uses it.** Every person who uses AGI Mobile on a phone or tablet, in Local mode or Cloud mode.

**Problems it solves**

- Reach chats and tools with one thumb on a phone.
- Use the room on a tablet instead of a stretched phone layout.
- Stop the drawer swipe from fighting the Back swipe on settings pages or the voice screen.
- Keep the camera and voice pages full screen.

**Use cases**

- Swipe from the left edge on a phone, then tap a recent chat to open it.
- Open Settings and swipe from the left edge to go Back.
- Use a large iPad window where the drawer stays open beside the chat.
- Watch a video full screen in landscape on a phone, then return to portrait.

## 2. User experience

**Where to find it**

- Mobile: the whole app shell. The menu control is the round button with accessibility label 'Open navigation drawer' (apps/mobile/src/shared/components/DrawerButton.tsx:70-95).
- Mobile drawer rows: Search, 'New chat', destination rows, Recents, 'See all chats', Settings (keys drawer.newChat, search, drawer.recents, drawer.seeAllChats, settings) (apps/mobile/src/features/drawer/components/DrawerContent.tsx:631-912).
- Web, Desktop, CLI, VS Code, Chrome: not part of this feature (brief gives a status for the mobile app only).

**Before you start**

- None for Local mode. The drawer lists only rows allowed in the current mode (isShownInMode) and by feature flags (apps/mobile/src/features/drawer/components/DrawerContent.tsx:563-573).
- Some rows need Cloud mode, a signed-in account, or a plan capability: Images needs Cloud mode and a signed-in account; AGI Work tasks need Cloud mode, the plan and the granted capability (DrawerContent.tsx:337-349, 563-573).

**Screens and controls**

- Drawer (overlay on narrow windows, permanent panel on wide ones) with a Local/Cloud mode switch, Search, New chat, a 'More' fold, Projects, Recents list with long-press actions, 'See all chats', Settings and (only in Cloud mode, signed in, on a free plan, where native purchases are enabled) an Upgrade row (DrawerContent.tsx:323-420, 631-912).
- Menu button with an unread-notification pip; on a permanent sidebar it becomes a blank slot and shows only a pip link 'Open notifications, N unread' (DrawerButton.tsx:50-95).
- Settings stack: Back by edge swipe or back control.
- Camera and scan pages: full window; they are drawerType 'front', so there is no permanent sidebar, but on phones the swipe-open overlay drawer is kept (apps/mobile/app/(app)/_layout.tsx:23-28).
- Voice page: always dark, drawer swipe off.

**Journey**

1. Open the app. On a phone the chat shows with the drawer closed.
2. Swipe from the left edge (40 points on iOS, 64 on Android, drag of at least 60 on iOS or 96 on Android) or tap the menu button.
3. Tap a chat, a destination or Settings. The drawer closes and the page opens.
4. In Settings, swipe from the left edge or tap Back to return one page.
5. On a window 1000 points wide or more, the drawer is already open at 280 points wide and the menu button is gone.
6. Rotate an iPhone or an Android phone: the screen stays portrait, except while a video or a presentation viewer is open.

**What the person sees and gets**

- The drawer slides over the page with a scrim (apps/mobile/app/(app)/_layout.tsx:55-70).
- The active chat row is highlighted and unread chats show a dot (DrawerContent.tsx:500-560).
- Unread count shows on the menu button and is read out in its label (DrawerButton.tsx:77-84).

**Settings**

- Chat list arrangement: 'In one list' or 'By project' (drawer.inOneList, drawer.byProject) stored in the settings store (DrawerContent.tsx:358-380).
- The 'More' fold and the folded Projects section remember their state (DrawerContent.tsx:352-357).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Drawer type is 'front' (overlay) on narrow windows and 'permanent' when the window is 1000 points wide or more (280 drawer + 720 content) (apps/mobile/src/shared/hooks/useResponsiveLayout.ts:3-9, 24-47; apps/mobile/src/features/shell/drawerGestures.ts:23-45).
- The draft's 768 and 1024 are not the drawer switch. A window width of 768 gives size class 'tablet' and a window width of 1024 or more gives size class 'regular'. isTablet is true when the screen's larger side is 1024 or more (apps/mobile/src/shared/hooks/useTabletLayout.ts:5-6, 40-50).
- Split view is detected as a window narrower than the screen by at least 8 points on a tablet-size screen (useTabletLayout.ts:9, 51).
- Settings pages turn the drawer swipe off so the edge swipe means Back (apps/mobile/app/(app)/_layout.tsx:20-22, 122).
- Camera and scan are drawerType 'front' even where a sidebar is permanent, so on phones they keep the swipe-open overlay drawer. Only the voice route turns the swipe off (_layout.tsx:23-28, 130-134).
- A leftover open state is closed when the window grows to the permanent width (_layout.tsx:30-41).
- Phones are locked to portrait at app start by lockPhonePortrait (apps/mobile/app/_layout.tsx:122, 129; apps/mobile/src/shared/hooks/useLandscapeWhileOpen.ts:23-25). A phone is any non-iPad iOS device or an Android device whose smaller side is under 600 dp (useLandscapeWhileOpen.ts:11-16).
- Only the video player and the presentation deck viewer free rotation while open (apps/mobile/src/features/chat/components/VideoPlayerModal.tsx:47; apps/mobile/src/features/chat/components/artifact-viewers/presentation/PresentationDeckView.tsx:161).
- iPad lists all four orientations and multitasking is on (supportsTablet true, requireFullScreen false) (apps/mobile/app.config.js:156-186). A native Android plugin lets screens with smallest width 600 dp or more rotate and re-decides when the size changes (apps/mobile/native/android/withAGITabletOrientation.cjs:14-34).
- Message list and composer keep a reading column up to 720 points wide on large windows (apps/mobile/src/shared/layout/contentColumn.ts:3-25; apps/mobile/src/features/chat/components/MessageList.tsx:367-370).
- The drawer shows only DRAWER_RECENT_LIMIT recent chats (pinned first) and at most 6 projects in Cloud mode [apps/mobile/src/features/drawer/components/DrawerContent.tsx:446-470, 481-493].

**Incomplete**

- Landscape on phones: the brief wants the chat re-laid out in landscape (S71.27) but the code locks phones to portrait. Only two viewers rotate. (apps/mobile/app.config.js:158; useLandscapeWhileOpen.ts:23-52)
- Foldables: only window-size changes are handled, through the Android orientation plugin and the width-based layout. No hinge or fold event code was found. (apps/mobile/native/android/withAGITabletOrientation.cjs; search for fold/hinge in apps/mobile returned only a test case name)

**Present but disconnected or switched off**

- The Upgrade row in the drawer shows only in Cloud mode, signed in, on a free plan tier, and when storePurchases.json sets nativePurchases true (NATIVE_PURCHASES_AVAILABLE). FEATURES.billing is not part of that check, and this page does not say what the JSON value is. (DrawerContent.tsx:396-402, 910-915; apps/mobile/src/features/billing/nativePurchaseAvailability.ts:3)
- Companion pages are registered as drawer screens but FEATURES.companion is false. (apps/mobile/lib/v1FeatureFlags.ts:16; _layout.tsx:110-114)

**Not available**

- Hinge-aware layout on any app.
- Web, Desktop, CLI, VS Code and Chrome: not applicable to this feature.

## 4. Required behaviour

**Established requirements**

- The phone app navigates with native patterns: a swipeable drawer plus stack routes with back gestures. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.01)
- On tablets the app uses a wider layout (persistent drawer, multi-column grids) and adapts to split view. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.25)
- On foldables the layout adapts when the device folds or unfolds, ideally around the hinge. The brief status is not applicable anywhere. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.26)
- Rotating the phone to landscape re-lays out the chat usefully. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S71.27)
- The design contract names breakpoints: compact phone, phone, tablet, narrow desktop, desktop, wide desktop. (source: docs/product/experience-contract.md:164 (doc: docs/product/experience-contract.md))

**Acceptance criteria**

1. On a phone, a swipe from the left edge opens the drawer and a tap on a recent chat opens it and closes the drawer.
2. On Settings pages the edge swipe goes Back and does not open the drawer.
3. With a window 1000 points wide or more the drawer is permanent and the menu button is not shown. Narrowing the window below 1000 closes any stale open state and the overlay drawer works.
4. Opening camera or scan shows no permanent sidebar (on a phone the swipe-open overlay drawer remains); opening voice shows no drawer and voice does not react to an edge swipe.
5. An iPhone and a small Android phone stay in portrait when turned; an iPad and an Android tablet rotate.
6. Opening a video or a presentation on a phone allows landscape and closing it returns to portrait.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief status 'done' for S71.27 conflicts with the portrait lock, so the status is either stale or means tablets only. [inferred]
- A tablet in portrait between 768 and 999 points gets the overlay drawer, not a permanent one. [inferred from useResponsiveLayout.ts:24-47]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide and record whether phone landscape is a product requirement. If yes, unlock rotation for the chat and re-lay out the composer. If no, change S71.27 to match the code.
- [proposed] Add a posture or hinge signal for foldables only if a target device needs it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | App layout with drawer | `apps/mobile/app/(app)/_layout.tsx` | Declares the drawer, gesture options and which screens hide the drawer or turn the swipe off. |
| component | DrawerContent | `apps/mobile/src/features/drawer/components/DrawerContent.tsx` | Drawer body: mode switch, search, new chat, destinations, projects, recents. |
| hook | useTabletLayout / getTabletLayout | `apps/mobile/src/shared/hooks/useTabletLayout.ts` | Size class, orientation, isTablet, isSplitView from window and screen sizes. |
| hook | useResponsiveLayout / getResponsiveLayout | `apps/mobile/src/shared/hooks/useResponsiveLayout.ts` | Permanent-drawer threshold, drawer width, grid columns. |
| other | drawerGestureOptions | `apps/mobile/src/features/shell/drawerGestures.ts` | Edge width, swipe distance and drawer type per platform and layout. |
| hook | useDrawerDismiss, useDrawerScrollMemory | `apps/mobile/src/features/shell/useDrawerDismiss.ts` | Closes the overlay on back or tap away and remembers drawer scroll. |
| component | DrawerButton | `apps/mobile/src/shared/components/DrawerButton.tsx` | Menu button with unread pip; becomes a blank slot beside a permanent sidebar. |
| other | openNearestDrawer | `apps/mobile/src/navigation/openNearestDrawer.ts` | Walks up navigators to the nearest drawer and opens it. |
| hook | useGoBack | `apps/mobile/src/shared/hooks/useGoBack.ts` | Back with a fallback route when no history exists. |
| hook | useLandscapeWhileOpen / lockPhonePortrait | `apps/mobile/src/shared/hooks/useLandscapeWhileOpen.ts` | Portrait lock for phones, with temporary release for viewers. |
| config | Expo app config | `apps/mobile/app.config.js` | orientation portrait, iPad orientations, supportsTablet, screen-orientation plugin, tablet orientation plugin. |
| integration | Android tablet orientation plugin | `apps/mobile/native/android/withAGITabletOrientation.cjs` | Patches MainActivity to rotate on screens 600 dp or wider and lock portrait otherwise. |
| other | contentColumn | `apps/mobile/src/shared/layout/contentColumn.ts` | Reading, form and grid column widths for large windows. |
| component | MessageList | `apps/mobile/src/features/chat/components/MessageList.tsx` | Applies the reading column to the thread on wide windows. |
| config | v1 feature flags | `apps/mobile/lib/v1FeatureFlags.ts` | Switches that hide drawer rows and screens (companion, schedules, research, cloud tasks, projects). |
| config | Native purchase availability | `apps/mobile/src/features/billing/nativePurchaseAvailability.ts` | Reads storePurchases.json nativePurchases; switches the drawer Upgrade row (NATIVE_PURCHASES_AVAILABLE). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app reads window and screen size and chooses overlay or permanent drawer. | device | apps/mobile/src/shared/hooks/useTabletLayout.ts:24-51, 70-80 |
| A swipe or a tap on the menu opens the drawer; a row tap calls router.navigate and closes the drawer. | device | apps/mobile/src/features/drawer/components/DrawerContent.tsx:411-418 |
| At start the root layout locks a phone to portrait through expo-screen-orientation. | device | apps/mobile/app/_layout.tsx:129; apps/mobile/src/shared/hooks/useLandscapeWhileOpen.ts:18-25 |
| Drawer rows read conversations and projects from device stores; in Cloud mode the list is the cloud conversation store (cloudConversations) that a sync loop fills, in Local mode the local store, then the list is filtered by execution mode. Recents are capped by DRAWER_RECENT_LIMIT. | device and our servers | apps/mobile/src/features/drawer/components/DrawerContent.tsx:446-455, 481-493 (source chosen by app mode, then filtered by executionModeForConversation; 481-493 is the pinned/recent slicing); sync itself is outside this feature (see SYS-sync-and-continuity) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Chat list arrangement, More fold and projects fold choices | settings store on the device | unknown (not traced) | kept until app data is cleared; not traced further |
| Recent chats shown in the drawer | local chat store (Local) or Cloud chat store (Cloud) | Cloud rows come from the server; Local rows stay on the device | owned by the chat features, not this one |

**Models and providers.** None. Navigation does not call a model or provider. The drawer filters conversations by their execution mode so Local and Cloud lists stay separate (DrawerContent.tsx:446-455, 481-493).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account is needed to use the shell in Local mode. The Images row needs Cloud mode and a signed-in account. The AGI Work row needs Cloud mode, the plan and the granted capability (DrawerContent.tsx:337-349). Whether the Cloud mode switch needs a sign-in is decided by cloudUnlocked in useAppModeSwitch (DrawerContent.tsx:333, 637), which this page does not trace. |
| Permissions | None for navigation. |
| Subscription | Images and AGI Work task rows depend on the plan capability documents (DrawerContent.tsx:337-345, 563-568). Drawer itself has no plan rule. The Upgrade row shows only on a free plan tier. |
| Limits and metering | The drawer shows only DRAWER_RECENT_LIMIT recent chats (pinned first) and at most 6 projects in Cloud mode (apps/mobile/src/features/drawer/components/DrawerContent.tsx:446-470, 481-493). No usage metering found in the code. |
| Feature flags | FEATURES.schedules, research and cloudTasks change which rows show, and FEATURES.projects gates the projects section (DrawerContent.tsx:563-571, 452; apps/mobile/lib/v1FeatureFlags.ts). FEATURES.billing does not: the Upgrade row follows NATIVE_PURCHASES_AVAILABLE (storePurchases.json nativePurchases), Cloud mode, a signed-in Clerk user and a free plan tier (DrawerContent.tsx:396-402; apps/mobile/src/features/billing/nativePurchaseAvailability.ts:3). |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | The shell works fully in Local mode with no sign-in. Rows that are Cloud-only are hidden by isShownInMode (DrawerContent.tsx:568). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Window narrows from permanent width | A drawer state left open is closed so it does not return open. | apps/mobile/app/(app)/_layout.tsx:30-41; test:apps/mobile/__tests__/FullScreenRouteDrawer.test.tsx |
| Android system back gesture at the left edge | Drawer band is widened by 24 points and needs a longer drag (96) so both gestures work. | apps/mobile/src/features/shell/drawerGestures.ts:4-12 |
| No history on a screen opened by a link | useGoBack navigates to a fallback route. | apps/mobile/src/shared/hooks/useGoBack.ts:8-16 |
| Android hardware back with the overlay drawer open | useDrawerDismiss closes the drawer. Detail not traced. | apps/mobile/src/features/drawer/components/DrawerContent.tsx:409 |
| Large text or screen reader | Rows are 44 points high with button roles and selected state; unread count is read in the menu label. | DrawerContent.tsx:500-525; DrawerButton.tsx:77-84 |
| Foldable fold or unfold on Android | Orientation is re-decided from the smallest width; no hinge logic. | apps/mobile/native/android/withAGITabletOrientation.cjs; test:apps/mobile/__tests__/tablet-orientation-plugin.test.ts |
| Loading, offline, error, retry | not handled in the code for the shell itself; chat and sync features own those. | searched DrawerContent.tsx and _layout.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/src/shared/hooks/__tests__/useTabletLayout.test.ts`: Size class resolution, readable column width, content width minus drawer, window-versus-screen reading, a full-width small tablet is not split view, including a foldable cover-screen case.
- `apps/mobile/src/features/shell/__tests__/drawerGestures.test.ts`: Edge returned to content when drawer is permanent; Android swipe band past system back; iOS band; open state read from history.
- `apps/mobile/__tests__/FullScreenRouteDrawer.test.tsx`: Open drawer state closes when the window grows past the permanent-sidebar width; nothing happens when already closed.
- `apps/mobile/__tests__/voice-route-drawer-swipe.test.ts`: No edge swipe on the dark voice screen; edge swipe kept on chat routes.
- `apps/mobile/__tests__/RootLayoutPortraitLock.test.tsx`: A phone is held in portrait as the app module loads.
- `apps/mobile/__tests__/LandscapeWhileOpen.test.tsx`: iPhone portrait with release while a viewer is open; iPad free to turn; Android phone vs tablet by smaller side.
- `apps/mobile/__tests__/tablet-orientation-plugin.test.ts`: Android plugin: phones stay portrait, large screens rotate, size change re-decides.
- `apps/mobile/__tests__/ipad-multitasking-config.test.ts`: supportsTablet and requireFullScreen false; portrait setting.
- `apps/mobile/__tests__/SettingsBackNavigation.test.tsx`: Settings pages pop back to their caller or fall back only without history.
- `apps/mobile/__tests__/DrawerContent.test.tsx`: Drawer content rows and behaviour (titles not read in detail).

**Test scenarios**

- **Phone drawer swipe**
  1. Open a chat on a phone.
  2. Swipe from the left edge.
  3. Tap a recent chat.
  - Expected: Drawer opens over the chat, the chosen chat opens and the drawer closes.
- **Settings back swipe**
  1. Open Settings, then a sub-page.
  2. Swipe from the left edge.
  - Expected: The sub-page goes back one level; the drawer does not open.
- **Permanent sidebar**
  1. On an iPad, use a window 1000 points or wider.
  2. Narrow the window with Split View below 1000 points.
  - Expected: Sidebar stays open when wide, becomes an overlay drawer with a menu button when narrow, with no stale open state.
- **Full-screen pages**
  1. Open the camera screen and the voice screen on a tablet with a permanent sidebar.
  - Expected: No permanent sidebar shows on either page (camera and scan are drawerType 'front', so a phone keeps the swipe-open overlay drawer there); voice ignores edge swipes.
- **Orientation**
  1. Turn an iPhone to landscape in a chat.
  2. Open a video and turn again.
  3. Repeat on an iPad.
  - Expected: Phone stays portrait in chat, may turn in the video viewer and returns to portrait after closing. iPad turns freely.

**Where to look when it fails**

- Warnings from the console with prefix '[RootLayout]' for startup problems.
- Check Dimensions values with the layout tests when a window picks the wrong drawer type.
- Orientation: check expo-screen-orientation lock call (lockPhone swallows errors silently, useLandscapeWhileOpen.ts:19-21).

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/071-mobile-application.md](../../70-qa/test-plans/mobile/071-mobile-application.md)

## 10. Gaps and dependencies

- **Phones cannot use landscape in chat although the brief wants landscape adaptation.** Affects: Mobile phones (iOS and Android).. Evidence: apps/mobile/app.config.js:158; apps/mobile/src/shared/hooks/useLandscapeWhileOpen.ts:23-25; S71.27. Work needed: Product decision, then unlock rotation for chat and verify composer and thread layout, or correct the brief.
- **No hinge or fold-state handling.** Affects: Foldable devices on Android.. Evidence: No code found by search; test case name only in useTabletLayout.test.ts. Work needed: Only if foldables are a target: add a window-info signal and layout rules.
- **Brief names 768 and 1024 as the tablet switch, but the permanent drawer starts at 1000 points.** Affects: Tablets 768-999 points wide (portrait iPad, small Android tablet).. Evidence: apps/mobile/src/shared/hooks/useResponsiveLayout.ts:3-9, 24-47. Work needed: Decide if portrait tablets should get a permanent drawer; align the brief or the threshold.

**Depends on**

- surface:mobile
- mode:local
- mode:cloud
- file:apps/mobile/app/(app)/_layout.tsx
- file:apps/mobile/src/shared/hooks/useTabletLayout.ts
- file:apps/mobile/src/shared/hooks/useResponsiveLayout.ts
- file:apps/mobile/src/features/shell/drawerGestures.ts
- file:apps/mobile/lib/v1FeatureFlags.ts
- SYS-shared-ui-and-design
- SYS-sync-and-continuity

## Unknown

- Whether drawer settings (list arrangement, folds) sync across devices; not traced.
- Exact behaviour of Android hardware back with the drawer open (useDrawerDismiss not read in detail).
- Whether the Cloud mode switch needs a signed-in account: decided by cloudUnlocked in useAppModeSwitch, not traced.
- Whether the widget-setup route and widget plugin work; outside this feature.
- Brief status 'done' for S71.27 against the portrait lock: which is intended is not recorded.

## Second reader's check

A second reader checked 11 statements of this page against the code: 6 correct, 5 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3):** "768 sets the 'tablet' size class and 1024 (largest screen side) sets isTablet" The code shows: 768 sets sizeClass 'tablet' from window width, but 1024 also sets sizeClass 'regular' from window width. isTablet uses the largest screen side >= 1024. Split view is window width <= screen width - 8 on a tablet screen. (apps/mobile/src/shared/hooks/useTabletLayout.ts:5-6,40-50). **Corrected:** 768 gives size class 'tablet' and window width 1024 or more gives 'regular'. isTablet is true when the screen's larger side is 1024 or more.
- **Partly wrong (section 3):** "The Upgrade row appears only when native purchases are available; billing is off in the feature flags so it is hidden (DrawerContent.tsx:337-345; v1FeatureFlags.ts:6)" The code shows: showUpgrade is gated by NATIVE_PURCHASES_AVAILABLE (read from storePurchases.json), Cloud mode, a signed-in Clerk user and a free plan tier. It does not read FEATURES.billing. The cited lines 337-345 are the AGI Work gate; showUpgrade is at 396-402. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:396-402,910-915; apps/mobile/src/features/billing/nativePurchaseAvailability.ts:3; apps/mobile/lib/v1FeatureFlags.ts:6). **Corrected:** The Upgrade row shows only in Cloud mode, signed in, on a free plan, and when storePurchases.json sets nativePurchases true. FEATURES.billing is not part of that check, and the page does not say what the JSON value is.
- **Partly wrong (section 7):** "Feature flags: FEATURES.schedules, research, cloudTasks and billing change which rows show (DrawerContent.tsx:563-568)" The code shows: The row filter uses schedules, research and cloudTasks (plus showImages and showAgiWork). billing is not used there. Also FEATURES.projects gates the project list at line 452. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:563-571,452). **Corrected:** FEATURES.schedules, research and cloudTasks (and projects for the projects section) change which rows show. billing does not; the Upgrade row follows NATIVE_PURCHASES_AVAILABLE.
- **Partly wrong (section 7):** "Account: Cloud destinations and the Cloud mode switch need a signed-in account (DrawerContent.tsx:337-345)" The code shows: Lines 337-345 only gate the AGI Work row (Cloud mode, plan capability, granted canUseAgiWork). The Images row needs Cloud mode plus a Clerk sign-in (347-349). The mode switch uses cloudUnlocked from useAppModeSwitch (333, 637); the page did not read that hook, so the sign-in claim for the switch is not shown by the cited lines. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:333,337-349,637). **Corrected:** The Images row needs Cloud mode and a signed-in account. The AGI Work row needs Cloud mode, the plan and the granted capability. Whether the Cloud switch needs sign-in is decided by cloudUnlocked in useAppModeSwitch, which the page does not trace.
- **Partly wrong (section 6):** "Drawer rows read conversations from device stores; Cloud rows come from the Cloud message store a sync loop fills; list filtered by execution mode" The code shows: In Cloud mode the list is the cloud conversation store (cloudConversations), in Local mode the local store, then filtered by executionModeForConversation === appMode. The cited lines are 446-455, not 481-496 (that range is the pinned/recent slicing). Code comment says the local store holds a stale mirror for Cloud rows. Recents are capped by DRAWER_RECENT_LIMIT. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:446-455,481-493). **Corrected:** Cited lines should be 446-455. The source store is chosen by mode and then filtered by execution mode; recents are capped by DRAWER_RECENT_LIMIT (the page does not say so).

**Facts the page missed**

- The Upgrade row also needs a free plan tier, Cloud mode and a signed-in Clerk user, and its on/off switch is storePurchases.json nativePurchases (apps/mobile/src/features/billing/nativePurchaseAvailability.ts:3; DrawerContent.tsx:396-402), not FEATURES.billing.
- The drawer shows only DRAWER_RECENT_LIMIT recent chats (pinned first) and at most 6 projects in Cloud mode (apps/mobile/src/features/drawer/components/DrawerContent.tsx:446-470, 481-493). The page's Limits row says none found.
- Camera and scan keep the swipe-open overlay drawer on phones; only voice disables the swipe (apps/mobile/app/(app)/_layout.tsx:25-28). The page's 'Camera, scan and voice pages hide the drawer' overstates this.
