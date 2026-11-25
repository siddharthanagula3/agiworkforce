---
id: "F069-02"
type: "feature"
title: "Responsive layout"
aliases: ["Responsive layout", "App shell", "WebAppShell", "Sidebar drawer", "Icon rail", "Open navigation", "S69.02"]
area: "69 Web application"
available_on: ["web"]
implementation: {web: "built", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "seen failing", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S69.02"]
depends_on: ["surface:web", "SYS-shared-ui-and-design", "file:apps/web/shared/components/layout/app-shell-layout.ts", "file:apps/web/shared/components/layout/WebAppShell.tsx", "F069-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F069-02 Responsive layout

The web app changes its navigation by window width. Under 768 pixels, navigation is a drawer opened by an 'Open navigation' button. A portrait tablet gets an icon rail that expands over the content. Wide windows and landscape tablets keep a persistent sidebar. Two code paths do this: the shared shell and the chat page.

Area: [69. Web application](README.md). Requirement items: [S69.02](../../10-requirements/capabilities/069-web-application.md#s6902).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | seen failing |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Picks one of three sidebar modes (drawer, rail, persistent) from the window size and orientation, and shows the sidebar in that form (apps/web/shared/components/layout/app-shell-layout.ts:24-48).

**Why it exists.** Navigation must not cover the reading column on a phone or a split-view tablet (app-shell-layout.ts:38-41 comment). The product contract also says persistent desktop sidebars become modal drawers on narrow screens (doc: docs/product/experience-contract.md section 5.2, line 197).

**Who uses it.** Anyone using the web app on a phone, tablet or desktop browser.

**Problems it solves**

- Sidebar crowding the text on narrow windows.
- Layout flash on first paint (SERVER_LAYOUT assumes a wide window) (app-shell-layout.ts:43-48).
- Losing scroll position when rotating the device (WebAppShell.tsx:200-218).

**Use cases**

- Phone user taps the menu button to switch conversations, then the drawer closes.
- Tablet user in portrait taps the icon rail to expand navigation over the chat.
- Desktop user collapses the sidebar and later widens the window; the choice is kept.
- iPad in split view gets the phone-style shell because of its width (app-shell-layout test name 'treats an iPad split view as the compact shell').

## 2. User experience

**Where to find it**

- surface:web: every signed-in page using the shell (WebAppShell is used by the tasks, library, developers and code pages) (apps/web/app/tasks/page.tsx; apps/web/features/library/components/LibraryView.tsx).
- surface:web: the chat page /chat has its own copy of the same behaviour built on the same layout function (apps/web/features/chat/pages/WebChatPage.tsx:1153, 1240-1245, 7226-7262). The chat page does not use WebAppShell (search of WebAppShell users found no chat file).
- Phone control: header button with accessible name 'Open navigation' (WebAppShell.tsx:650; chat page uses the translated key chat:openNavigation, 'Open navigation', WebChatPage.tsx:7332; packages/ui/i18n/locales/en/chat.json:62).
- Desktop collapse: the sidebar's collapse control and the keyboard shortcut Cmd or Ctrl+B (WebAppShell.tsx:440-452).

**Before you start**

- A browser window. No account rule specific to this feature.

**Screens and controls**

- Header bar with menu button and wordmark, phone only (WebAppShell.tsx:640-668).
- Modal drawer 'Navigation' on the left, max 85% of the width (WebAppShell.tsx:682-700).
- Icon rail on portrait tablets; pressing it opens the drawer (WebChatPage.tsx:7227-7229).
- Persistent sidebar with collapse toggle.

**Journey**

1. Open the app on a phone-width window; see the header and the menu button.
2. Tap 'Open navigation'; the drawer opens and the page behind becomes inert (WebAppShell.tsx:660-662).
3. Pick a destination; the drawer closes after navigation (WebAppShell.tsx:206-209; chat page closes it in each handler, WebChatPage.tsx:7109-7131).
4. Rotate or resize; the layout re-flows and the content scroll position is restored (WebAppShell.tsx:211-229).

**What the person sees and gets**

- Layout changes only; no toast.
- Shell sets data-shell-tier and data-shell-orientation attributes on the main area (WebAppShell.tsx:673-674) which tests can read.

**Settings**

- Sidebar collapsed preference kept in the UI store and used on wide windows only (WebAppShell.tsx:153-154, 632). Its survival of a resize is covered by a test named sidebar-collapse-preference (apps/web/shared/components/layout/__tests__/sidebar-collapse-preference.test.ts).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Layout function: width under 768 gives compact and drawer; 768 to 1023 gives tablet, rail in portrait and persistent in landscape; 1024 and above gives regular and persistent (app-shell-layout.ts:6-7, 24-48).
- The hook listens to resize and orientationchange (app-shell-layout.ts:50-74).
- WebAppShell: drawer, rail, scroll memory, focus return to the opener, closes on route change (WebAppShell.tsx:190-229, 682-715).
- Chat page: its own drawer and rail built on the same function, plus one extra rule: on a tablet, an open side panel (work, research, artifacts, sources) forces the rail (apps/web/features/chat/pages/web-chat-layout.ts:36-43).

**Incomplete**

- Scroll-position restore on rotation exists in WebAppShell. A search of WebChatPage.tsx for the same pattern found none; whether the message list does it separately is unknown.
- The chat page closes the drawer from each handler instead of on route change, so a navigation that bypasses those handlers would leave it open (WebChatPage.tsx:7109-7131 versus WebAppShell.tsx:206-209). [inferred]

**Present but disconnected or switched off**

- none found in the code

**Not available**

- The shell is in apps/web and is not shared with desktop, mobile, CLI, VS Code or Chrome. The brief marks them not applicable.

## 4. Required behaviour

**Established requirements**

- The web shell adapts to phone, tablet and desktop widths: drawer navigation below 768px, icon rail on portrait tablets, persistent sidebar on wide windows. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S69.02)
- Persistent desktop sidebars become modal drawers on narrow screens. (source: doc: docs/product/experience-contract.md:197)
- Exercise core flows at desktop and narrow mobile widths, with zoom and a screen reader; focus enters and returns from dialogs; controls have accessible names. (source: doc: docs/product/experience-contract.md:796 (W23))
- The first paint assumes a wide window so a mobile header does not flash. (source: apps/web/shared/components/layout/app-shell-layout.ts:43-48)

**Acceptance criteria**

1. At 767 px width the header shows 'Open navigation' and no sidebar.
2. At 800x1200 (portrait) the sidebar is an icon rail; pressing it opens the drawer over the content.
3. At 1000x700 (landscape tablet) the sidebar is persistent.
4. At 1024 px and wider the sidebar is persistent and the collapse control hides it.
5. Choosing a conversation in the drawer closes the drawer.
6. After collapsing the sidebar at a wide size, shrinking then widening the window restores the collapsed state.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The two implementations (shell and chat page) should behave the same; any difference is a defect [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Move the chat page onto WebAppShell, or move the drawer and rail into one shared component, so there is one place to fix.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| hook | useShellLayout / resolveShellLayout | `apps/web/shared/components/layout/app-shell-layout.ts` | Breakpoints 768 and 1024, orientation, sidebar mode. |
| component | WebAppShell | `apps/web/shared/components/layout/WebAppShell.tsx` | Shell for non-chat pages: header, drawer, rail, scroll memory. |
| component | Chat page layout wiring | `apps/web/features/chat/pages/WebChatPage.tsx` | Chat page drawer, rail and 'Open navigation' control (lines 1153-1245, 7226-7262). |
| hook | resolveChatSidebarMode | `apps/web/features/chat/pages/web-chat-layout.ts` | Tablet with open panel gets the rail. |
| component | Header | `apps/web/shared/components/layout/Header.tsx` | Header used by shell pages (exact role not traced). |
| store | UI store sidebarCollapsed | `apps/web/shared/components/layout/WebAppShell.tsx` | Reads sidebarCollapsed and setSidebarCollapsed from useUIStore (lines 153-154). |
| component | SidebarBrandRow | `apps/web/shared/components/layout/SidebarBrandRow.tsx` | Brand row inside the sidebar. |
| config | Chat labels | `packages/ui/i18n/locales/en/chat.json` | openNavigation text (line 62). |
| test | app-shell-layout test | `apps/web/shared/components/layout/__tests__/app-shell-layout.test.ts` | Breakpoint and rotation rules. |
| test | WebAppShell test | `apps/web/shared/components/layout/WebAppShell.test.tsx` | Shell behaviour. |
| test | web-chat-layout test | `apps/web/features/chat/pages/__tests__/web-chat-layout.test.ts` | Chat sidebar mode rule. |
| test | Sidebar drawer e2e | `apps/web/e2e/chat-sidebar-drawer.spec.ts` | Browser test of the drawer. |
| test | Phone layout e2e | `apps/web/e2e/phone-layout-rules.spec.ts` | Phone-width rules. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server renders with an assumed wide window. | our servers | app-shell-layout.ts:43-48 |
| After mount the hook reads window size and orientation and sets the layout; it listens for resize and rotation. | device | app-shell-layout.ts:50-74 |
| The shell renders drawer, rail or persistent sidebar from the mode. | device | WebAppShell.tsx:632-715 |
| Scroll position is remembered and restored when tier or orientation changes. | device | WebAppShell.tsx:211-229 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Sidebar collapsed choice | UI store (storage location not traced) | unknown | unknown |

**Models and providers.** Not involved.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for the layout itself; pages inside need sign-in. |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | not applicable |
| Provider restrictions | none found in the code |
| Local mode | Layout is the same in every mode; it runs on the device and needs no server call. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| First paint | Wide layout assumed, then corrected after mount. | app-shell-layout.ts:43-48 |
| Drawer open | Background content is hidden from assistive technology and inert. | WebAppShell.tsx:660-662 |
| Drawer close | Focus goes back to the opener, or to the menu button if the opener is gone. | WebAppShell.tsx:690-699 |
| Escape key | Closes the drawer unless a menu inside wants the key (keepOpenForMenuEscape). | WebAppShell.tsx:689 |
| Rotation or split view | Scroll position restored in the shell. | WebAppShell.tsx:211-229 |
| Touch | Menu button grows to 44 px on coarse pointers. | WebAppShell.tsx:652 |
| Consent banner | Shell ends above the fixed banner. | WebAppShell.tsx:624-627 |
| Offline, retry, timeout | not handled in the code (layout has no network state). | app-shell-layout.ts (whole file has no network handling) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/shared/components/layout/__tests__/app-shell-layout.test.ts`: Phone, portrait tablet, rotation, split view, breakpoint edges.
- `apps/web/shared/components/layout/WebAppShell.test.tsx`: Shell rendering.
- `apps/web/shared/components/layout/__tests__/sidebar-collapse-preference.test.ts`: Collapse preference.
- `apps/web/features/chat/pages/__tests__/web-chat-layout.test.ts`: Chat sidebar mode with open panel.
- `apps/web/e2e/chat-sidebar-drawer.spec.ts`: Drawer in a real browser.
- `apps/web/e2e/qa-05-responsive.spec.ts`: Responsive checks.

**Test scenarios**

- **Phone drawer**
  1. Set width 390.
  2. Open /chat.
  3. Press 'Open navigation'.
  4. Pick a conversation.
  - Expected: Drawer opens, then closes, and the chat opens.
- **Tablet portrait rail**
  1. Set 820x1180.
  2. Open /chat.
  3. Press the rail.
  - Expected: Rail shows icons; pressing it opens the drawer over the content.
- **Landscape tablet**
  1. Set 1000x700.
  - Expected: Persistent sidebar.
- **Collapse survives resize**
  1. At 1400 wide collapse the sidebar.
  2. Resize to 600, then back to 1400.
  - Expected: Sidebar is still collapsed.
- **Reading position**
  1. On a shell page such as /tasks scroll down.
  2. Rotate or resize across a tier.
  - Expected: Scroll position is kept.

**Where to look when it fails**

- data-shell-tier and data-shell-orientation attributes on the main area.
- data-testid mobile-nav-drawer and chat-mobile-nav-drawer.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/069-web-application.md](../../70-qa/test-plans/web/069-web-application.md)

## 10. Gaps and dependencies

- **Two separate drawer implementations (shell and chat page) with different close and scroll behaviour.** Affects: Web users on phones and tablets. Evidence: WebAppShell.tsx:206-229 versus WebChatPage.tsx:7109-7131. Work needed: Share the drawer, or add the same scroll memory and close rule to the chat page.
- **The draft named WebAppShell as the chat shell; the chat page does not use it.** Affects: Anyone reading the old description. Evidence: WebChatPage.tsx:1153. Work needed: Keep the corrected description.

**Depends on**

- surface:web
- SYS-shared-ui-and-design
- file:apps/web/shared/components/layout/app-shell-layout.ts
- file:apps/web/shared/components/layout/WebAppShell.tsx
- F069-01

## Unknown

- Where the sidebar collapsed preference is stored and whether it syncs.
- Whether the message list restores reading position on rotation in the chat page.
- Behaviour on very small or very tall windows beyond the tests.
