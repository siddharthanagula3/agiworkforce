---
id: "F005-01"
type: "feature"
title: "Header and layout by screen size"
aliases: ["Application shell layout", "Responsive shell", "Sidebar collapse and drawer", "Open navigation", "Toggle sidebar", "Navigation drawer", "Icon rail", "S5.01 S5.05 S5.06 S5.35 S5.36 S5.37"]
area: "5 Application shell and navigation components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "partly seen (1 of 4)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S5.01", "S5.05", "S5.06", "S5.35", "S5.36", "S5.37"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:cloud", "SYS-shared-ui-and-design", "SYS-execution-boundaries", "file:apps/web/shared/components/layout/app-shell-layout.ts", "file:packages/ui/ui/src/sidebar/Sidebar.tsx", "store:agi-ui-store", "F005-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F005-01 Header and layout by screen size

The frame around every screen. It decides, by window width, whether navigation sits beside the content, shrinks to an icon rail, or hides behind a drawer opened from a header button. Web and Desktop share one shell. Mobile uses a native drawer. Sidebar resizing and a bottom tab bar do not exist.

Area: [5. Application shell and navigation components](README.md). Requirement items: [S5.01](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s501), [S5.05](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s505), [S5.06](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s506), [S5.35](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s535), [S5.36](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s536), [S5.37](../../10-requirements/capabilities/005-application-shell-and-navigation-components.md#s537).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | partly seen (1 of 4) |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | not stated on this page | built | not seen by a person |
| VS Code | not stated on this page | built | not seen by a person |
| Chrome | not stated on this page | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Chooses one of three navigation layouts from the window size and orientation, lets the person collapse and expand the sidebar, opens a slide-in drawer on narrow screens, and shows a thin header on phones. On Web and Desktop this is resolveShellLayout plus WebAppShell and the shared Sidebar. On Mobile it is the Expo drawer with swipe gestures and a hidden tab bar. (apps/web/shared/components/layout/app-shell-layout.ts:5-39) (apps/mobile/src/features/shell/drawerGestures.ts:27-48)

**Why it exists.** Navigation needs 260px to be useful, which does not fit a phone or a portrait tablet. The shell keeps the content readable at every width and keeps the person's collapse choice. [inferred] from the comment in (apps/web/shared/components/layout/app-shell-layout.ts:26-28).

**Who uses it.** Every signed-in person on Web, Desktop and Mobile. CLI, VS Code and Chrome have their own panels and were not traced for this feature.

**Problems it solves**

- A phone screen cannot hold a sidebar and a chat column side by side, so the sidebar becomes a drawer.
- A tablet in portrait gets an icon rail so the chat column stays readable.
- A returning person keeps the sidebar collapsed or expanded as they left it.
- Keyboard and screen-reader users cannot tab into the page behind an open drawer (the page is made inert).

**Use cases**

- On a laptop, press Ctrl/Cmd+B to hide the sidebar and give the chat more room.
- On a phone browser, tap Open navigation, pick a chat, and the drawer closes by itself.
- On a tablet in portrait, keep the icon rail and tap Toggle sidebar to open the full list over the content.
- On the phone app, swipe from the left edge to open the drawer.

## 2. User experience

**Where to find it**

- Web and Desktop (Electron window showing the hosted web app): the sidebar on the left; button labelled 'Toggle sidebar' (PanelLeft icon) at the top of the sidebar; on a narrow window a 48px header with a button labelled 'Open navigation' (Menu icon) at its left. (packages/ui/ui/src/sidebar/Sidebar.tsx:578) (apps/web/shared/components/layout/WebAppShell.tsx:641-653) (doc: AGENTS.md section 5 says the public Desktop shows the hosted web app)
- Web chat page: its own copy of the same wiring, with the drawer trigger inside the chat header, labelled by the key chat:openNavigation. (apps/web/features/chat/pages/WebChatPage.tsx:7234-7262, 7331)
- Mobile app: menu button at the left of the chat header, accessibility label 'Open navigation drawer' (adds the unread count when there are notifications); or swipe from the left edge. (apps/mobile/src/shared/components/DrawerButton.tsx:45-90)
- CLI, VS Code, Chrome: not traced (unknown).

**Before you start**

- Web and Desktop: the shell renders for signed-in routes; recents load only after sign-in settles. (apps/web/shared/components/layout/WebAppShell.tsx:244 comment)
- Mobile: none for the drawer itself; its contents depend on Local or Cloud mode (see F005-04).

**Screens and controls**

- Sidebar, expanded: default width 260px, 'Toggle sidebar' button with tooltip showing the shortcut (Ctrl+B or the Command key plus B). (packages/ui/ui/src/sidebar/Sidebar.tsx:159, 133-145)
- Sidebar, collapsed rail: 52px wide, icon-only buttons (Toggle sidebar, New chat, Code, Search, nav items) with tooltips, plus an account button. (packages/ui/ui/src/sidebar/Sidebar.tsx:115, 485-541)
- Narrow header: 'Open navigation' button, the wordmark, and an optional slot a page can fill. (apps/web/shared/components/layout/WebAppShell.tsx:641-663)
- Phone drawer on web: a left sheet 280px wide, at most 85% of the viewport, with a hidden title 'Navigation'. (apps/web/shared/components/layout/WebAppShell.tsx:683-720)
- Mobile drawer: front drawer on phones; a permanent 280px sidebar when the window is at least 1000 points wide. (apps/mobile/src/shared/hooks/useResponsiveLayout.ts:3-28)

**Journey**

1. Open the app. On first paint the shell assumes a desktop-sized window, then measures the real window and switches layout. (apps/web/shared/components/layout/app-shell-layout.ts:42-46, 55-71)
2. Wide window (1024px or more) or a landscape tablet (768px to 1023px): the sidebar sits beside the content. Click 'Toggle sidebar' or press Ctrl/Cmd+B to collapse it to the rail or expand it. (apps/web/shared/components/layout/WebAppShell.tsx:442-453)
3. Tablet in portrait: the sidebar stays a rail; the toggle and Ctrl/Cmd+B open the full sidebar as a drawer over the content. (apps/web/shared/components/layout/WebAppShell.tsx:626-632)
4. Under 768px: tap 'Open navigation'. The drawer slides in, the page behind it is inert. Close it with Escape, by tapping outside, by choosing something, or by navigating. (apps/web/shared/components/layout/WebAppShell.tsx:166-171, 639; apps/web/shared/components/layout/WebAppShell.test.tsx:776-880)
5. Mobile: swipe from the left edge or tap the menu button; the drawer closes when a destination is chosen. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:409-420)
6. Resize or rotate: the shell re-flows and restores the content scroll position. (apps/web/shared/components/layout/WebAppShell.tsx:204-222)

**What the person sees and gets**

- Layout change itself; tooltips on rail buttons after a 200ms pause. (packages/ui/ui/src/sidebar/Sidebar.tsx:118)
- A dot on the rail toggle when any chat is unread, with the accessible name 'Toggle sidebar, Unread'. (packages/ui/ui/src/sidebar/Sidebar.tsx:489-505)
- After the drawer closes, focus returns to the control that opened it. (apps/web/shared/components/layout/WebAppShell.tsx:692-704)

**Settings**

- Collapsed state is a stored preference named sidebarCollapsed in the zustand store with storage name 'agi-ui-store'. (apps/web/shared/stores/layout-store.ts:102-115)
- Desktop: the same value is also written to the shell's own window state through window_layout_read and window_layout_write. (apps/web/features/desktop-host/hooks/use-shell-layout.ts:19-47) (apps/web/features/desktop-host/lib/runtime-client.ts:262-267)
- No setting for sidebar width.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Three-tier layout resolver with 768px and 1024px breakpoints; compact gives a drawer, tablet portrait gives a rail, tablet landscape and regular give a persistent sidebar. (apps/web/shared/components/layout/app-shell-layout.ts:5-39)
- Collapse and expand through the toggle button and Ctrl/Cmd+B; on non-persistent layouts both toggle the drawer instead. (apps/web/shared/components/layout/WebAppShell.tsx:442-453, 463)
- Collapsed choice is saved and restored on the web; widening the window restores it because it is stored apart from the layout tier. (apps/web/shared/stores/layout-store.ts:113-115) (apps/web/shared/components/layout/WebAppShell.tsx:190-195)
- Drawer 280px wide, closes on Escape unless a row menu claims the key, closes on route change, page behind it is inert and aria-hidden. (apps/web/shared/components/layout/WebAppShell.tsx:168-170, 636-639, 690-694)
- The web chat page runs its own copy of this layout: in a tablet with a side panel open the sidebar drops to a rail. (apps/web/features/chat/pages/web-chat-layout.ts:36-43)
- Desktop menu command 'toggle-sidebar' flips the same store. (apps/web/features/desktop-host/hooks/use-host-commands.ts:26-31)
- Mobile: front drawer with edge swipe (40pt, Android 64pt), permanent drawer from 1000 points, tab bar disabled. (apps/mobile/src/features/shell/drawerGestures.ts:4-48) (apps/mobile/src/shared/hooks/useResponsiveLayout.ts:22-24) (apps/mobile/app/(app)/(tabs)/_layout.tsx:9-12)

**Incomplete**

- Mobile's permanent-sidebar threshold is 1000 points (280 plus 720), not the web's 768 and 1024 tiers, so the two surfaces differ on a tablet between 768 and 999. (apps/mobile/src/shared/hooks/useResponsiveLayout.ts:3-24)
- Chrome, VS Code and CLI layouts: the brief marks them built, but its line references do not match current code and nothing was traced here. (doc: knowledge-base/data/area-briefs/005-application-shell-and-navigation-components.md S5.01)

**Present but disconnected or switched off**

- Mobile tab bar: the Tabs layout renders no bar (tabBar returns null, style display none) while still declaring chat and projects tabs, so it is switched off on purpose. (apps/mobile/app/(app)/(tabs)/_layout.tsx:9-17)
- The Sidebar accepts a mode prop of local or cloud; Sidebar() does not read it, and the web shells pass 'cloud'. [inferred] from the destructured props at (packages/ui/ui/src/sidebar/Sidebar.tsx:146-205) and (apps/web/shared/components/layout/WebAppShell.tsx:573)

**Not available**

- Sidebar resize handle: no drag code in Sidebar.tsx (only a ResizeObserver for title truncation); width is the width prop, default 260. Web and Desktop. (packages/ui/ui/src/sidebar/Sidebar.tsx:159, 1127-1135) (doc: brief S5.06)
- Bottom navigation bar: not built on Web or Mobile. (doc: brief S5.36) (apps/mobile/app/(app)/(tabs)/_layout.tsx:9)
- Desktop does persist a secondary-panel width (secondaryPanelWidth) but not a sidebar width. (apps/web/features/desktop-host/hooks/use-shell-layout.ts:24-26)

## 4. Required behaviour

**Established requirements**

- Sidebar can be collapsed to a rail or hidden and expanded again. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.05)
- A drag handle resizes the sidebar and the width persists. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.06)
- On narrow screens navigation lives in a slide-in drawer opened from a header button, with focus management and dismissal. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.35)
- On phones a persistent bottom navigation bar switches between main areas. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.36)
- On tablet widths navigation and content sit side by side (persistent or rail) instead of a phone drawer. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.37)
- A persistent top header shows where the user is and the primary actions. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S5.01)

**Acceptance criteria**

1. At 1280px wide the sidebar is beside the content; Ctrl/Cmd+B collapses it to a 52px rail and again expands it; after a reload the choice is kept.
2. At 390px wide there is no persistent sidebar; 'Open navigation' opens a 280px drawer; Escape, a tap outside, or choosing a chat closes it and focus returns to the button.
3. With the drawer open, Tab does not reach the page behind it.
4. At 834x1112 (portrait tablet) the sidebar is a rail; the toggle opens the drawer; at 1180x820 it is persistent.
5. Widening the window from phone to desktop restores the person's collapse choice.
6. On the phone app a left-edge swipe opens the drawer and choosing a chat closes it.
7. Rotating a tablet keeps the chat scroll position.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Resize and bottom bar are listed as requirements by the brief but also look like deliberate choices (the bar is explicitly switched off); whether they are still wanted is a product decision. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide product-wise whether sidebar resize and a bottom bar are required; if not, remove S5.06 and S5.36 from the brief.
- [proposed] Align Mobile's persistent-drawer threshold with the web tiers, or document why they differ.
- [proposed] Move WebAppShell's and WebChatPage's duplicate drawer wiring into one component.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | resolveShellLayout and useShellLayout | `apps/web/shared/components/layout/app-shell-layout.ts` | Maps width and height to tier, orientation and sidebar mode; subscribes to resize and orientationchange |
| component | WebAppShell | `apps/web/shared/components/layout/WebAppShell.tsx` | Shell for non-chat routes: sidebar or rail, narrow header, drawer sheet, inert content, scroll restore |
| component | Sidebar | `packages/ui/ui/src/sidebar/Sidebar.tsx` | Shared sidebar: expanded (260px), collapsed rail (52px), toggle button, tooltips |
| config | searchShortcut constants | `packages/ui/ui/src/sidebar/searchShortcut.ts` | TOGGLE_SIDEBAR_SHORTCUT (B with Ctrl or Meta) and the search shortcut |
| component | WebChatPage sidebar wiring | `apps/web/features/chat/pages/WebChatPage.tsx` | Chat route's own Sidebar and Sheet drawer using the same layout hook |
| service | resolveChatSidebarMode | `apps/web/features/chat/pages/web-chat-layout.ts` | Drops a tablet sidebar to a rail when a secondary panel is open |
| store | useUIStore (sidebarCollapsed) | `apps/web/shared/stores/layout-store.ts` | Persisted collapse flag, storage name agi-ui-store |
| hook | useShellLayout (desktop host) | `apps/web/features/desktop-host/hooks/use-shell-layout.ts` | Reads and writes sidebar collapse and panel width in the desktop window state |
| hook | useHostCommands | `apps/web/features/desktop-host/hooks/use-host-commands.ts` | Turns the native menu 'toggle-sidebar' command into a store change |
| hook | useKeyboardShortcuts | `apps/web/features/chat/hooks/use-keyboard-shortcuts.ts` | Binds toggle-sidebar to the shell handler |
| config | shortcutRegistry (toggle-sidebar) | `packages/ui/unified-chat/src/lib/shortcutRegistry.ts` | Declares the toggle-sidebar shortcut for the help dialog |
| component | Drawer layout | `apps/mobile/app/(app)/_layout.tsx` | Expo drawer with gesture options and persistent mode on wide windows |
| service | drawerGestureOptions | `apps/mobile/src/features/shell/drawerGestures.ts` | Picks drawer type, edge width and swipe distance per platform |
| hook | getResponsiveLayout and useTabletLayout | `apps/mobile/src/shared/hooks/useResponsiveLayout.ts` | Decides persistent drawer and drawer width; tablet size class lives in useTabletLayout.ts |
| component | DrawerButton | `apps/mobile/src/shared/components/DrawerButton.tsx` | Header menu button with unread count; replaced by a notification pip when the drawer is permanent |
| config | Tabs layout | `apps/mobile/app/(app)/(tabs)/_layout.tsx` | Declares chat and projects tabs with the tab bar switched off |
| hook | useDrawerDismiss | `apps/mobile/src/features/shell/useDrawerDismiss.ts` | Closes the overlay drawer on dismissal (behaviour not read in detail) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser or Electron window loads the shell; first paint assumes a desktop layout. | device | apps/web/shared/components/layout/app-shell-layout.ts:42-46 |
| useShellLayout reads window width and height and re-reads on resize and orientationchange; sets tier, orientation and sidebar mode. | device | apps/web/shared/components/layout/app-shell-layout.ts:48-71 |
| Toggle click or Ctrl/Cmd+B calls handleToggleSidebar: flips the stored collapsed flag on persistent layouts, otherwise opens or closes the drawer. | device | apps/web/shared/components/layout/WebAppShell.tsx:442-453 |
| The stored flag is saved by zustand persist under agi-ui-store; on Desktop it is also sent to the window-state commands. | device | apps/web/shared/stores/layout-store.ts:102-115; apps/web/features/desktop-host/hooks/use-shell-layout.ts:35-47 |
| Mobile: the Expo drawer opens on edge swipe or the menu button; layout class is computed from window size. | device | apps/mobile/app/(app)/_layout.tsx:44-71 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| sidebarCollapsed flag | Browser storage under agi-ui-store; on Desktop also the app window state | Not synced between devices; test states it is never sent anywhere (apps/web/shared/components/layout/__tests__/sidebar-collapse-preference.test.ts:7-11) | Stays until browser storage is cleared |
| Drawer open state, layout tier, content scroll position | Component memory only | No | Lost on reload |

**Models and providers.** No model or provider takes part. The layout makes no network call.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The layout needs no account. The shell's recents and account row need a signed-in person; the conversation list is auth-gated. (apps/web/shared/components/layout/WebAppShell.tsx:244) |
| Permissions | none found in the code for the layout. The Code button is removed when the workspace disables the code feature. (apps/web/shared/components/layout/WebAppShell.tsx:566) |
| Subscription | No plan gates the layout. The usage meter in the sidebar footer shows only for a paid plan with a usage summary. (apps/web/shared/components/layout/WebAppShell.tsx:583) |
| Limits and metering | none found in the code for the layout. |
| Feature flags | none found for the layout. Workspace feature list disabledFeatures can hide Code. (apps/web/shared/components/layout/WebAppShell.tsx:566) |
| Model compatibility | Not applicable; no model is involved. |
| Provider restrictions | Not applicable. |
| Local mode | Web has no Local mode and passes mode cloud to the sidebar. Mobile drawer works in both Local and Cloud and lists different destinations per mode. (apps/mobile/src/features/drawer/components/DrawerContent.tsx:330-335, 540-548) |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | The shell paints before account and conversations hydrate; the sidebar shows loading placeholders for rows. | apps/web/shared/components/layout/WebAppShell.test.tsx:585-612, 1105-1118 |
| Escape pressed while a row menu is open | The menu takes the key and the drawer stays open; the next Escape closes the drawer. | apps/web/shared/components/layout/WebAppShell.test.tsx:798-834 |
| Route change with drawer open | The drawer closes. | apps/web/shared/components/layout/WebAppShell.tsx:168-171 |
| Rotation or split-view resize | Content scroll position is restored. | apps/web/shared/components/layout/WebAppShell.tsx:204-222 |
| Browser storage unavailable | not handled in the code for sidebarCollapsed in layout-store.ts (zustand persist default); the unread store does guard storage but that is a different value. | apps/web/shared/stores/layout-store.ts:102-115 |
| Accessibility | Rail buttons have names and tooltips; touch targets grow to 44px on coarse pointers; toggle exposes aria-keyshortcuts; reduced motion not specific to the layout. | packages/ui/ui/src/sidebar/Sidebar.tsx:578-584, 1211-1213 |
| Mobile permanent drawer with a stale open state | A drawer left open from overlay mode is closed when the window becomes wide. | apps/mobile/app/(app)/_layout.tsx:32-40 |
| Offline, retry, cancel, timeout | not handled in the code; the layout has no network step. | apps/web/shared/components/layout/app-shell-layout.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/shared/components/layout/__tests__/app-shell-layout.test.ts`: Phone, portrait tablet, rotation, split-view widths and breakpoints of resolveShellLayout
- `apps/web/shared/components/layout/WebAppShell.test.tsx`: Persistent sidebar on desktop, Open navigation drawer on narrow, Escape and focus return, inert background, backdrop close, close on navigation, resize swap
- `apps/web/shared/components/layout/__tests__/sidebar-collapse-preference.test.ts`: Collapse preference stays in browser storage and is not sent anywhere
- `apps/web/shared/stores/layout-store.test.ts`: Layout store behaviour (contents not read in detail)
- `apps/web/features/chat/pages/__tests__/web-chat-layout.test.ts`: resolveChatSidebarMode
- `apps/web/features/desktop-host/__tests__/ShellLayout.test.tsx`: Desktop read and write of the shell layout (reads a mocked runtime client)
- `packages/ui/ui/src/sidebar/__tests__/Sidebar.collapse.test.tsx`: Icon rail paints no label text, controls keep accessible names, tooltip delay
- `packages/ui/ui/src/sidebar/__tests__/Sidebar.layout.test.tsx`: Sidebar layout (contents not read in detail)
- `packages/ui/ui/src/sidebar/__tests__/Sidebar.unreadRailDot.test.tsx`: Unread dot on the rail toggle
- `apps/mobile/src/features/shell/__tests__/drawerGestures.test.ts`: Drawer gesture options
- `apps/mobile/src/features/shell/__tests__/useDrawerDismiss.test.tsx`: Drawer dismissal hook
- `apps/mobile/__tests__/DrawerButtonUnreadBadge.test.tsx`: Unread badge on the drawer button

**Test scenarios**

- **Collapse and remember on Web**
  1. Open /chat at 1280x800 signed in.
  2. Press Ctrl/Cmd+B.
  3. Reload.
  - Expected: Sidebar shrinks to a 52px rail and is still a rail after the reload.
- **Phone drawer**
  1. Set the window to 390x844.
  2. Click 'Open navigation'.
  3. Press Tab several times.
  4. Press Escape.
  - Expected: 280px drawer opens; focus stays inside; Escape closes it and focus returns to the button.
- **Tablet portrait**
  1. Set 834x1112.
  2. Check the sidebar.
  3. Click 'Toggle sidebar'.
  4. Rotate to 1180x820.
  - Expected: Rail first, drawer after the click, persistent sidebar after rotation; chat scroll position is unchanged.
- **Desktop native menu**
  1. In the Electron app choose the menu item that toggles the sidebar.
  2. Quit and reopen.
  - Expected: Sidebar toggles; collapsed state is restored from the window state. Not run by this page.
- **Phone app drawer**
  1. Open the mobile app.
  2. Swipe from the left edge.
  3. Tap a chat.
  - Expected: Drawer opens and closes on selection. On a 1000-point-wide tablet it is permanent.
- **Absence checks**
  1. Try dragging the sidebar edge on Web.
  2. Look for a bottom tab bar on Mobile.
  - Expected: Nothing resizes; no bar appears (confirms the gaps).

**Where to look when it fails**

- data-shell-tier and data-shell-orientation attributes on #main-content show the resolved layout. (apps/web/shared/components/layout/WebAppShell.tsx:672-673)
- Inspect browser storage key agi-ui-store for sidebarCollapsed.
- Mobile: the drawer-unread-badge test id and drawer.body test id mark the drawer.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/web/005-application-shell-and-navigation-components.md)
- Desktop: [70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/desktop/005-application-shell-and-navigation-components.md)
- Mobile: [70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/mobile/005-application-shell-and-navigation-components.md)
- CLI: [70-qa/test-plans/cli/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/cli/005-application-shell-and-navigation-components.md)
- VS Code: [70-qa/test-plans/vscode/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/vscode/005-application-shell-and-navigation-components.md)
- Chrome: [70-qa/test-plans/chrome/005-application-shell-and-navigation-components.md](../../70-qa/test-plans/chrome/005-application-shell-and-navigation-components.md)

## 10. Gaps and dependencies

- **No sidebar resize handle** Affects: Web and Desktop users. Evidence: No drag handler in packages/ui/ui/src/sidebar/Sidebar.tsx; brief S5.06. Work needed: Decide if wanted; if yes add a handle, a width store, and persistence (the desktop window-state already holds panel width)
- **No bottom navigation bar** Affects: Web phone and Mobile users. Evidence: apps/mobile/app/(app)/(tabs)/_layout.tsx:9; brief S5.36. Work needed: Product decision; otherwise retire the requirement
- **Mobile and Web use different tablet breakpoints** Affects: Tablet users of the phone app versus the web. Evidence: apps/mobile/src/shared/hooks/useResponsiveLayout.ts:7,22 versus apps/web/shared/components/layout/app-shell-layout.ts:5-6. Work needed: Align or document
- **Layout of CLI, VS Code and Chrome not traced; brief code references are stale** Affects: Those three apps. Evidence: brief S5.01 and S5.35 line numbers do not match apps/cli/src/tui/tui_app.rs or apps/extension/src/side_panel.ts. Work needed: Re-trace and refresh the brief
- **Two copies of the drawer wiring (WebAppShell and WebChatPage)** Affects: Engineers; risk of drift. Evidence: apps/web/shared/components/layout/WebAppShell.tsx:683-720 and apps/web/features/chat/pages/WebChatPage.tsx:7234-7262. Work needed: Extract one component

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:cloud
- SYS-shared-ui-and-design
- SYS-execution-boundaries
- file:apps/web/shared/components/layout/app-shell-layout.ts
- file:packages/ui/ui/src/sidebar/Sidebar.tsx
- store:agi-ui-store
- F005-04

## Unknown

- Layout of the CLI terminal UI, the VS Code side panel and the Chrome side panel was not traced.
- What useDrawerDismiss does on Android back or tap outside was not read.
- Whether browser storage failures are handled for layout-store persistence.
- Whether the Tauri build (apps/desktop/src/features/v3/Sidebar.tsx) uses the same shared Sidebar; it exists but was not opened.
- The literal value of the Sidebar mode prop effect, if any outside Sidebar.tsx.
