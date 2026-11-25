---
id: "F007-04"
type: "feature"
title: "Collapsible navigation and responsive shell"
aliases: ["Collapsible secondary navigation", "Responsive panel stacking", "Mobile bottom-sheet adaptation", "Tablet two-column adaptation", "Safe-area and virtual-keyboard accommodation", "Resizable left sidebar (not present)", "App shell layout", "S7.10", "S7.12", "S7.25", "S7.26", "S7.27", "S7.28"]
area: "7 Layout systems"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "n/a", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S7.12", "S7.25", "S7.26", "S7.27", "S7.28", "S7.10"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "SYS-shared-ui-and-design", "store:agi-ui-store", "file:apps/web/shared/components/layout/app-shell-layout.ts", "file:apps/mobile/src/shared/hooks/useResponsiveLayout.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F007-04 Collapsible navigation and responsive shell

How the app frame adapts to the window. Web has three tiers: phone (drawer), tablet (icon rail in portrait) and wide (permanent sidebar). Mobile uses a permanent drawer from 1000 points, otherwise an overlay drawer. Pickers become bottom sheets on phones, the composer lifts above the keyboard, and no app lets the left sidebar be resized.

Area: [7. Layout systems](README.md). Requirement items: [S7.12](../../10-requirements/capabilities/007-layout-systems.md#s712), [S7.25](../../10-requirements/capabilities/007-layout-systems.md#s725), [S7.26](../../10-requirements/capabilities/007-layout-systems.md#s726), [S7.27](../../10-requirements/capabilities/007-layout-systems.md#s727), [S7.28](../../10-requirements/capabilities/007-layout-systems.md#s728), [S7.10](../../10-requirements/capabilities/007-layout-systems.md#s710).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | built | built | not seen by a person |
| Chrome | not stated on this page | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Collapses or reopens the conversation list, turns side panels into overlays and pickers into sheets on small screens, gives tablets a two-column shell, and keeps the composer clear of notches and the on-screen keyboard.

**Why it exists.** One product runs on phones, tablets and wide monitors. The contract says desktop sidebars become modal drawers on narrow screens, modals become full-screen sheets where two columns do not fit, and nothing may cover send controls or safe areas (doc: docs/product/experience-contract.md:197, docs/product/experience-contract.md:202, docs/product/experience-contract.md:203).

**Who uses it.** Everyone, most visibly phone and tablet users and people with narrow browser windows.

**Problems it solves**

- A permanent sidebar eating a small screen.
- Panels that squeeze the chat unreadably.
- A composer hidden by the keyboard or the home indicator.

**Use cases**

- Collapse the conversation list on a laptop to read more.
- Open the drawer on a phone by swiping from the left edge.
- Hold an iPad in portrait and keep a slim icon rail.
- Type on a phone and keep the composer above the keyboard.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): the chat sidebar and its collapse control; under 768 pixels a menu button labelled 'Open navigation' (apps/web/features/chat/pages/WebChatPage.tsx:7331, apps/web/shared/components/layout/WebAppShell.tsx:650).
- Mobile: swipe from the left edge or press the menu button in the chat header (apps/mobile/app/(app)/chat/[id].tsx:1658).
- VS Code: the AGI Code view sits in the activity bar and is shown or hidden with VS Code's own side bar controls [inferred] (apps/extension-vscode/package.json:953).
- Chrome: collapse behaviour unverified.
- CLI: not applicable.

**Before you start**

- None for collapse. The rail on web needs a tablet-size window; the permanent mobile drawer needs a window of 1000 points or more.

**Screens and controls**

- Web sidebar collapse toggle wired to handleToggleSidebar (apps/web/features/chat/pages/WebChatPage.tsx:7225).
- Web phone drawer: a left sheet 280 wide, max 85 percent of the screen (apps/web/features/chat/pages/WebChatPage.tsx:7251).
- Mobile drawer swipe: edge band 40 points (24 more on Android) and minimum drag 60 (96 on Android) (apps/mobile/src/features/shell/drawerGestures.ts:4, apps/mobile/src/features/shell/drawerGestures.ts:27).
- Web model and option pickers use a Drawer when the picker layout is 'mobile' (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1796).
- Mobile sheets: model picker and add-to-chat sheet (apps/mobile/app/(app)/chat/[id].tsx:2282).

**Journey**

1. Open the app; the shell picks a tier from the window size.
2. Phone: tap the menu or swipe to open the conversation drawer; pick a chat; the drawer closes.
3. Wide: click the sidebar toggle to collapse it to a narrow strip; click again to restore.
4. Tablet portrait: the sidebar shows icons; tapping the expand control opens the full list over the content.
5. Open a panel on a tablet; the sidebar drops to the rail so the chat keeps room.
6. Focus the composer on a phone; it moves above the keyboard.

**What the person sees and gets**

- Drawer slides over with a dimmed backdrop.
- The collapsed or expanded state is remembered on web (apps/web/shared/stores/layout-store.ts:113) and by the desktop shell (apps/web/features/desktop-host/hooks/use-shell-layout.ts:41).

**Settings**

- None visible. Mobile persistence of drawer state was not found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web shell tiers: under 768 compact with a drawer, 1024 and over regular with a persistent sidebar, in between tablet; tablet landscape persistent, tablet portrait rail (apps/web/shared/components/layout/app-shell-layout.ts:5, apps/web/shared/components/layout/app-shell-layout.ts:6, apps/web/shared/components/layout/app-shell-layout.ts:24).
- Web chat: on the tablet tier with a panel open the sidebar becomes a rail (apps/web/features/chat/pages/web-chat-layout.ts:36); sidebar renders collapsed in rail mode (apps/web/features/chat/pages/WebChatPage.tsx:7225).
- Web collapsed flag is persisted as part of 'agi-ui-store' (apps/web/shared/stores/layout-store.ts:102, apps/web/shared/stores/layout-store.ts:113).
- Web panels stack over the chat on narrow windows (see F007-02).
- Web keyboard: the composer lifts by the keyboard height when the layout viewport does not resize and the covered strip is 80 pixels or more (apps/web/features/chat/components/Composer/soft-keyboard-inset.ts:7, apps/web/features/chat/components/Composer/ChatComposerNew.tsx:980, apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4881); home indicator padding uses env safe-area (apps/web/app/globals.css:1362).
- Mobile: permanent drawer when the window is at least 1000 wide (280 drawer plus 720 content), overlay drawer up to 300 wide or 88 percent otherwise; grid columns 1, 2 or 3 by content width (apps/mobile/src/shared/hooks/useResponsiveLayout.ts:3, apps/mobile/src/shared/hooks/useResponsiveLayout.ts:22, apps/mobile/src/shared/hooks/useResponsiveLayout.ts:34).
- Mobile drawer type and swipe come from one gesture function (apps/mobile/app/(app)/_layout.tsx:58).
- Mobile keyboard: KeyboardAvoidingView with 'padding' on iOS and Android screens (apps/mobile/src/features/chat/chrome/keyboardSafeComposer.ts:14, apps/mobile/app/(app)/chat/[id].tsx:2282); the mobile chat header menu is hidden when the drawer is permanent (apps/mobile/app/(app)/chat/[id].tsx:1658).

**Incomplete**

- Mobile windows 768 to 999 points wide use the overlay drawer, not two columns, because the persistent drawer needs 1000 (apps/mobile/src/shared/hooks/useResponsiveLayout.ts:22). The brief marks mobile tablet two-column done (doc: knowledge-base/data/area-briefs/007-layout-systems.md).
- A comment in the chat screen says Android adjustResize handles the keyboard, but the hook returns 'padding' for Android screens; the hook is the code that runs (apps/mobile/app/(app)/chat/[id].tsx:2282, apps/mobile/src/features/chat/chrome/keyboardSafeComposer.ts:14).
- Chrome stacking and collapse: unverified; VS Code in-webview collapse not found.

**Present but disconnected or switched off**

- The 'compact' prop of WebChatPage removes the sidebar and all panels (apps/web/features/chat/pages/WebChatPage.tsx:7225).

**Not available**

- Resizable left sidebar on web, desktop and mobile. Searching the web app, desktop shell, mobile and shared packages found only a fixed design token width of 260 (packages/ui/design-tokens/src/index.ts:474).

## 4. Required behaviour

**Established requirements**

- Secondary navigation (conversation list, menus) can be collapsed and reopened (S7.12). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.12)
- On narrow windows side panels stack over the conversation (overlay or sheet) and return beside it when wide (S7.25). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.25)
- On phones menus and pickers open as bottom sheets (S7.26). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.26)
- On tablet widths the app shows two columns, navigation plus content (S7.27). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.27)
- Content and composer stay clear of notches and home indicators and adjust for the keyboard (S7.28). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.28)
- The user can drag or keyboard-adjust the left sidebar width (S7.10); status missing on web, desktop, mobile. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S7.10)
- Surfaces with a sidebar include collapse and expand. (source: doc: docs/product/requirements.md:439)
- The composer must not resize or overlap badly on small devices. (source: doc: docs/product/requirements.md:973)

**Acceptance criteria**

1. At 700 wide on web a menu button opens the drawer and a backdrop closes it.
2. At 900 wide in portrait on web the sidebar is a rail; in landscape at 900 wide it is persistent.
3. At 1100 wide the collapse toggle shrinks and restores the sidebar and the choice survives reload.
4. On a phone, focusing the composer lifts it above the keyboard and the send button stays visible.
5. On mobile at 1024 wide the drawer is permanent and the header menu is hidden; at 800 wide it is an overlay.
6. On iPhone the composer clears the home indicator.
7. There is no drag handle on the left sidebar on any app (S7.10 stays missing until built).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The tablet two-column requirement should be satisfied on mobile from 768 points [inferred from the web tier at 768 and the S7.27 wording]; the code starts at 1000.
- The sidebar width is fixed by design [inferred from the token and the negative search].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide the mobile persistent-drawer threshold against the 768 tablet tier.
- [proposed] Add a left sidebar resize handle on web and desktop that reuses SidePanelResizeHandle logic.
- [proposed] Record Chrome stacking and collapse results.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | resolveShellLayout and useShellLayout | `apps/web/shared/components/layout/app-shell-layout.ts` | Tier, orientation and sidebar mode. |
| service | resolveChatSidebarMode | `apps/web/features/chat/pages/web-chat-layout.ts` | Rail when a tablet has a panel open. |
| screen | WebChatPage shell | `apps/web/features/chat/pages/WebChatPage.tsx` | Sidebar, phone drawer sheet, Open navigation trigger, toggle handler. |
| component | WebAppShell | `apps/web/shared/components/layout/WebAppShell.tsx` | Shell for other pages with 'Open navigation' trigger and drawer. |
| store | layout-store | `apps/web/shared/stores/layout-store.ts` | sidebarCollapsed persisted as 'agi-ui-store'. |
| hook | useSoftKeyboardInset | `apps/web/features/chat/components/Composer/soft-keyboard-inset.ts` | Reads the visual viewport to lift the composer. |
| component | ChatComposerNew container | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Sticky bottom container with safe-area padding and keyboard lift (line 4881). |
| config | safe-area-bottom-additive | `apps/web/app/globals.css` | Padding for the home indicator (line 1362). |
| component | ComposerFooter pickers | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Picker Drawer on phone layout (line 1796). |
| hook | useResponsiveLayout / getResponsiveLayout | `apps/mobile/src/shared/hooks/useResponsiveLayout.ts` | Drawer and grid widths from window width. |
| hook | useTabletLayout | `apps/mobile/src/shared/hooks/useTabletLayout.ts` | Size class (compact, tablet, regular at 768 and 1024) and split view detection. |
| service | drawerGestureOptions | `apps/mobile/src/features/shell/drawerGestures.ts` | Drawer type and swipe zones by platform. |
| screen | App drawer layout | `apps/mobile/app/(app)/_layout.tsx` | Drawer navigator wiring. |
| hook | useKeyboardSafeComposer | `apps/mobile/src/features/chat/chrome/keyboardSafeComposer.ts` | Keyboard behaviour for screens and modals. |
| screen | Mobile chat screen | `apps/mobile/app/(app)/chat/[id].tsx` | KeyboardAvoidingView, drawer button, sheets. |
| config | Design token sidebarWidth | `packages/ui/design-tokens/src/index.ts` | Fixed sidebar width 260 (line 474). |
| test | app-shell-layout test | `apps/web/shared/components/layout/__tests__/app-shell-layout.test.ts` | Tier boundaries. |
| test | mobile responsive-layout test | `apps/mobile/__tests__/responsive-layout.test.ts` | Drawer and grid policy. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The shell reads window width and height on mount and on resize and sets the tier. | device | (apps/web/shared/components/layout/app-shell-layout.ts:50) |
| The chat page picks drawer, rail or persistent sidebar and shows the matching control. | device | (apps/web/features/chat/pages/WebChatPage.tsx:1240) |
| The sidebar flag changes and is saved to browser storage, or sent to the Electron shell. | device | (apps/web/shared/stores/layout-store.ts:113, apps/web/features/desktop-host/hooks/use-shell-layout.ts:41) |
| The visual viewport shrinks when the keyboard opens; the hook computes the covered strip and the composer is translated up. | device | (apps/web/features/chat/components/Composer/soft-keyboard-inset.ts:14) |
| Mobile computes drawer width and persistence from window width and passes gesture options to the drawer navigator. | device | (apps/mobile/app/(app)/_layout.tsx:58) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Sidebar collapsed flag | Web browser storage 'agi-ui-store'; desktop shell window state | no | Kept until cleared |

**Models and providers.** Not involved.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code for the layout. Items shown inside the drawer follow plan rules elsewhere. |
| Limits and metering | none found in the code |
| Feature flags | none found in the code for the shell tiers |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Layout is identical in Local, own key and Cloud. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| First paint on web | Assumes a wide desktop window to avoid a phone header flash. | (apps/web/shared/components/layout/app-shell-layout.ts:50) |
| Permanent mobile drawer with stale open state | The drawer closes the stale open state. | (apps/mobile/app/(app)/_layout.tsx:58) |
| Invalid transient window size | Mobile clamps negative widths to 0. | (apps/mobile/src/shared/hooks/useResponsiveLayout.ts:22) |
| Browser chrome shrink under 80 pixels | Not treated as a keyboard. | (apps/web/features/chat/components/Composer/soft-keyboard-inset.ts:7) |
| Settings screens | Drawer swipe off so the native back swipe works. | (apps/mobile/app/(app)/_layout.tsx:58) |
| Voice screen | Drawer swipe disabled and drawer type front. | (apps/mobile/app/(app)/_layout.tsx:58) |
| Android edge | Swipe edge widened past the system back band. | (apps/mobile/src/features/shell/drawerGestures.ts:27) |
| Offline, retry | not handled in the code; not relevant to layout | Layout files contain no network logic (apps/web/shared/components/layout/app-shell-layout.ts:24) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/shared/components/layout/__tests__/app-shell-layout.test.ts`: Phone drawer, tablet portrait and landscape tiers, iPad split view, boundary values.
- `apps/web/features/chat/pages/__tests__/web-chat-layout.test.ts`: Rail at 820 portrait and when a tablet chat opens a panel; regular sidebar at 1024; one owner for the 768 boundary.
- `apps/web/shared/components/layout/WebAppShell.test.tsx`: Open navigation trigger, drawer, persistent sidebar and toggle behaviour.
- `apps/web/features/chat/components/Composer/__tests__/soft-keyboard-inset.test.ts`: Keyboard inset maths and composer lift.
- `apps/mobile/__tests__/responsive-layout.test.ts`: Drawer and grid policy by width, dismissible overlay drawer, bounded wide grid, invalid sizes.
- `apps/mobile/__tests__/responsive-layout-wiring.test.ts`: Authenticated drawer uses the shared policy.
- `apps/mobile/src/shared/hooks/__tests__/useTabletLayout.test.ts`: Tablet size classes.

**Test scenarios**

- **Web tiers**
  1. Resize a browser from 1200 to 700 wide.
  - Expected: Persistent sidebar, then rail or sidebar by orientation, then a menu button with drawer.
- **Collapse memory**
  1. Collapse the sidebar at 1200 wide.
  2. Reload.
  - Expected: Sidebar is still collapsed.
- **Phone keyboard**
  1. Open the web app on an iPhone.
  2. Tap the composer.
  - Expected: Composer sits above the keyboard and the home indicator.
- **Mobile drawer threshold**
  1. Open the mobile app in a 900 point window, then 1100 point.
  - Expected: Overlay drawer at 900; permanent at 1100.
- **Left sidebar resize absent**
  1. Hover the right edge of the left sidebar on web.
  - Expected: No resize cursor or handle exists.

**Where to look when it fails**

- Local storage key 'agi-ui-store' on web.
- No log lines or error names found.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/007-layout-systems.md](../../70-qa/test-plans/web/007-layout-systems.md)
- Desktop: [70-qa/test-plans/desktop/007-layout-systems.md](../../70-qa/test-plans/desktop/007-layout-systems.md)
- Mobile: [70-qa/test-plans/mobile/007-layout-systems.md](../../70-qa/test-plans/mobile/007-layout-systems.md)
- VS Code: [70-qa/test-plans/vscode/007-layout-systems.md](../../70-qa/test-plans/vscode/007-layout-systems.md)
- Chrome: [70-qa/test-plans/chrome/007-layout-systems.md](../../70-qa/test-plans/chrome/007-layout-systems.md)

## 10. Gaps and dependencies

- **Left sidebar cannot be resized on any app.** Affects: Web, Desktop, Mobile. Evidence: (doc: knowledge-base/data/area-briefs/007-layout-systems.md). Work needed: Build or drop the requirement.
- **Mobile two-column starts at 1000 points, not at the 768 tablet size.** Affects: Tablets 768 to 999 points wide. Evidence: (apps/mobile/src/shared/hooks/useResponsiveLayout.ts:22, apps/mobile/src/shared/hooks/useTabletLayout.ts:5). Work needed: Confirm intended; align brief or code.
- **Chrome stacking and collapse unverified.** Affects: Chrome. Evidence: (doc: knowledge-base/data/area-briefs/007-layout-systems.md). Work needed: Test in a real browser.
- **Misleading Android keyboard comment.** Affects: Maintainers. Evidence: (apps/mobile/app/(app)/chat/[id].tsx:2282). Work needed: Correct the comment.
- **Mobile drawer state persistence not found.** Affects: Mobile. Evidence: search of the drawer files. Work needed: Check whether needed.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- SYS-shared-ui-and-design
- store:agi-ui-store
- file:apps/web/shared/components/layout/app-shell-layout.ts
- file:apps/mobile/src/shared/hooks/useResponsiveLayout.ts

## Unknown

- Visible label of the web sidebar collapse toggle (not found in the files read).
- Whether VS Code and Chrome have an in-page collapse control.
- Mobile drawer state persistence.
- Real-device behaviour of the keyboard on Android.
- Whether the mobile tablet threshold of 1000 is an owner decision.
