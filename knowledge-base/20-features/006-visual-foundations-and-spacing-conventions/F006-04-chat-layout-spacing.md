---
id: "F006-04"
type: "feature"
title: "Chat layout spacing"
aliases: ["Chat layout spacing", "Conversation-turn spacing", "Message action row", "Message-to-toolbar spacing", "Composer padding", "Page-edge gutters", "safe-area-bottom-additive"]
area: "6 Visual foundations and spacing conventions"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S6.17", "S6.18", "S6.19", "S6.20"]
depends_on: ["SYS-shared-ui-and-design", "SYS-chat-turn-pipeline", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "F006-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F006-04 Chat layout spacing

Spaces the conversation: a steady gap between turns, the action toolbar right under a message, padding inside the composer, and page-edge gutters of 16, 24 and 32 pixels that grow with window width. On phones the composer clears the home indicator.

Area: [6. Visual foundations and spacing conventions](README.md). Requirement items: [S6.17](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s617), [S6.18](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s618), [S6.19](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s619), [S6.20](../../10-requirements/capabilities/006-visual-foundations-and-spacing-conventions.md#s620).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | not stated on this page | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not stated on this page | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Web turns sit in .message-row with 6px vertical padding (apps/web/app/globals.css:828-830); the inner column is max-w-3xl with a 16px gutter (:843); the toolbar row has a minimum height and 32px buttons on mouse or 44px on touch (apps/web/features/chat/components/messages/messageActionRow.ts:1-5); the composer adds the iOS safe-area inset (globals.css:1362-1366); list pages use gutters of 16, 24 and 32px at sm and lg widths (apps/web/app/chat/library/page.tsx:11).

**Why it exists.** So the chat reads evenly, toolbars are easy to hit on a phone and the input is never hidden by the home indicator.

**Who uses it.** Everyone who chats; engineers building new pages that need the shared gutters.

**Problems it solves**

- Cramped or uneven message gaps
- Tiny touch targets on message actions
- Composer hidden by the iPhone home bar
- Text touching screen edges on narrow windows

**Use cases**

- Scroll a long conversation on web.
- Tap a reply on a phone to reveal its toolbar.
- Type in the composer on an iPhone with a home indicator.
- Open Library on a wide screen and see wider side gutters.

## 2. User experience

**Where to find it**

- Web and desktop: any chat; library, chats, health and finance pages use the stepped gutters (apps/web/app/chat/library/page.tsx:11).
- Mobile: chat screen (apps/mobile/src/features/chat/components/MessageList.tsx; ChatInput.tsx).
- CLI: terminal chat (apps/cli/src/tui/tui_app.rs).
- VS Code: sidebar chat (webviewContent.ts:608-613,698-703).
- Chrome: side panel chat (apps/extension/src/side_panel.ts).

**Before you start**

- None.

**Screens and controls**

- Per-message action row: copy, regenerate and others (apps/web/features/chat/components/messages/MessageBubble.tsx:3694-3704); older replies show it on hover or focus, the latest always (opacity classes at :3702-3704).
- Composer container with bottom padding (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4881).

**Journey**

1. Open a chat.
2. Read turns separated by a steady gap.
3. Hover or tap a message; the toolbar appears below it.
4. Type in the composer; on a phone the bottom padding equals 1rem plus the safe-area inset.

**What the person sees and gets**

- Toolbar fades in on hover and keyboard focus; on touch devices without hover it stays visible ([@media(hover:none)]:opacity-100, MessageBubble.tsx:3702).

**Settings**

- None; no control changes these spacings.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web turn gap: .message-row py-1.5 (globals.css:828-830) with flat feed (:833-836).
- Web column: .message-inner max-w-3xl, gap-3, px-gutter-compact (globals.css:843); the composer and follow-up rail share the same column and gutter (comment at :838-841).
- Web gutters: tokens gutter-compact 16px, gutter-regular 24px, gutter-wide 32px (foundation.css:299-301) used as px-gutter-compact sm:px-gutter-regular lg:px-gutter-wide on list pages (apps/web/app/chat/library/page.tsx:11; chats/page.tsx:15).
- Web toolbar: buttons h-11 w-11 and h-8 w-8 from sm, h-11 on coarse pointers, row min height likewise (messageActionRow.ts:1-5); the row uses gap-1 (MessageBubble.tsx:3698).
- Web composer: pb-4 plus .safe-area-bottom-additive, sticky on small screens and static from 768px (ChatComposerNew.tsx:4881; globals.css:1362-1371).
- Mobile composer: bottom padding Math.max(insets.bottom + 6, 16), 8 when keyboard is up (ChatInput.tsx:1679); reading column max 720 (apps/mobile/src/shared/layout/contentColumn.ts:5); list vertical padding 8 (MessageList.tsx:471).
- VS Code: message padding 9px 12px, actions gap via --message-actions-gap 4px and margin-top on the row (webviewContent.ts:247,608-613,698-702).
- Chrome: reading column 768px token (side_panel.css:34).

**Incomplete**

- Web chat column gutter stays 16px at every width; only list pages step to 24 and 32 (globals.css:843 versus library/page.tsx:11).
- Message-to-toolbar distance is set as a gap inside the message group; I did not find one named toolbar-distance token on web [inferred from reading messageActionRow.ts].
- CLI turn spacing and composer padding were not read at a located line; only the brief cites tui_app.rs:1460 and :1678, which showed unrelated code.

**Present but disconnected or switched off**

- none found

**Not available**

- Message toolbar on CLI (brief lists no CLI item for S6.18).

## 4. Required behaviour

**Established requirements**

- Consecutive conversation turns are separated by one defined vertical spacing value. (source: S6.17 (brief))
- The per-message action toolbar sits a defined distance below its message. (source: S6.18 (brief))
- The composer has defined internal padding around the input and its controls. (source: S6.19 (brief))
- Pages use defined page-edge gutters that step with viewport width. (source: S6.20 (brief))

**Acceptance criteria**

1. Web turns are 12px apart (two 6px paddings).
2. A web list page shows 16px side padding below 640px, 24px from sm, 32px from lg.
3. On touch screens the message action buttons are 44px.
4. On an iPhone, the composer's bottom padding includes the safe-area inset.
5. On desktop width, the composer is not sticky.
6. On mobile the composer clears the home indicator.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The chat column keeping 16px is deliberate so text, composer and follow-up rail share an edge (comment at globals.css:838-841).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Name a toolbar-distance token and use it across apps.
- [proposed] State in the design doc that the chat column does not step.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | gutter tokens | `packages/ui/design-tokens/src/foundation.css` | --gutter-compact, regular, wide (:299-301) and --space-* scale (:285-294) |
| config | web chat layout rules | `apps/web/app/globals.css` | .message-row, .message-inner, .safe-area-bottom-additive (:828-843,1362-1371) |
| component | ChatMessageList | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Renders .message-row groups (:779) |
| config | message action row constants | `apps/web/features/chat/components/messages/messageActionRow.ts` | Button and row sizes, icon size, tone |
| component | MessageBubble | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Action row markup (:3694-3704) |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Composer container and padding (:4881,5526) |
| screen | web list pages | `apps/web/app/chat/library/page.tsx` | Stepped gutters |
| component | mobile MessageList | `apps/mobile/src/features/chat/components/MessageList.tsx` | List padding |
| component | mobile ChatInput | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Safe-area aware composer padding (:1679) |
| config | mobile content column | `apps/mobile/src/shared/layout/contentColumn.ts` | Reading, form and grid column widths |
| component | VS Code chat styles | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Message padding and action gap (:247,608,698) |
| config | Chrome layout tokens | `apps/extension/src/side_panel.css` | --sp-reading-column and control sizes (:34-40) |
| component | CLI TUI | `apps/cli/src/tui/tui_app.rs` | Terminal layout (turn and composer lines not located) |
| test | ChatMessageList test | `apps/web/features/chat/components/messages/ChatMessageList.test.tsx` | Asserts px-gutter-compact on the column (:332) |
| test | ChatLoadingState test | `apps/web/features/chat/components/messages/ChatLoadingState.test.tsx` | Asserts px-gutter-compact (:37) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Messages render in rows; CSS gives each row 6px vertical padding and the column its gutter. | device | apps/web/app/globals.css:828-843 |
| The action row appears on hover or focus; on touch devices without hover it is always visible. | device | MessageBubble.tsx:3698-3704 |
| The browser exposes env(safe-area-inset-bottom); the composer adds it to its padding. | device | globals.css:1362-1364 |
| On mobile the safe-area hook feeds the composer padding. | device | apps/mobile/src/features/chat/components/ChatInput.tsx:540,1679 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No data is created by layout spacing | none | No | Not applicable |

**Models and providers.** Spacing does not depend on model or provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code |
| Local mode | Identical in Local mode; no sign-in or payment affects layout. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Touch device without hover | Action toolbar stays visible | MessageBubble.tsx:3702 |
| Open menu inside action row | Row stays visible while a control is expanded | MessageBubble.tsx:3702 (has-[[aria-expanded=true]]) |
| Keyboard up on mobile | Composer bottom padding drops to 8 | ChatInput.tsx:1679 |
| Desktop width (768px and up) | Composer padding drops the inset and is not sticky | globals.css:1366-1371 |
| Loading skeleton | Uses the same column and gutter | MessageBubbleSkeleton.tsx:34 |
| Error, retry, offline | not handled in the code for spacing | none found in the files read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/messages/ChatMessageList.test.tsx`: Column carries px-gutter-compact (:332)
- `apps/web/features/chat/components/messages/ChatLoadingState.test.tsx`: Loading column carries px-gutter-compact (:37)
- `apps/web/shared/components/__tests__/theme-contrast.test.ts`: Foundation layer tokens including space and gutter completeness (describe 'foundation layer', :1359)

**Test scenarios**

- **Turn gap**
  1. Open a chat with five turns
  2. Measure gap between rows in devtools
  - Expected: 12px between row text blocks
- **Stepped gutters**
  1. Open Library at 500px, 800px and 1300px wide
  - Expected: Side padding 16, 24 and 32px
- **Touch toolbar**
  1. Open a chat on a touch device
  2. Check action button size
  - Expected: 44px by 44px, toolbar visible without hover
- **Home indicator**
  1. Open web chat on an iPhone in a browser
  2. Look at the composer
  - Expected: Input and send button clear the home bar
- **Mobile composer**
  1. Open the mobile chat with and without keyboard
  - Expected: Padding 8 with keyboard, inset plus 6 (at least 16) without

**Where to look when it fails**

- Devtools box model of .message-row and .message-inner.
- iOS: view viewport-fit=cover in apps/web/app/layout.tsx.
- Mobile: log insets.bottom.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/web/006-visual-foundations-and-spacing-conventions.md)
- Desktop: [70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/desktop/006-visual-foundations-and-spacing-conventions.md)
- Mobile: [70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/mobile/006-visual-foundations-and-spacing-conventions.md)
- CLI: [70-qa/test-plans/cli/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/cli/006-visual-foundations-and-spacing-conventions.md)
- VS Code: [70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/vscode/006-visual-foundations-and-spacing-conventions.md)
- Chrome: [70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md](../../70-qa/test-plans/chrome/006-visual-foundations-and-spacing-conventions.md)

## 10. Gaps and dependencies

- **Chat column does not step with width** Affects: Web, desktop. Evidence: globals.css:843 uses px-gutter-compact only; S6.20. Work needed: Confirm intent; if stepping is required, add sm and lg gutters
- **No named toolbar-distance token** Affects: Web, mobile, VS Code. Evidence: messageActionRow.ts has sizes only; VS Code has --message-actions-gap (webviewContent.ts:247). Work needed: Share one token
- **CLI and Chrome spacing for turns, toolbar and composer not located** Affects: CLI, Chrome. Evidence: Brief lines did not match code I opened. Work needed: Locate and cite current lines or record n/a

**Depends on**

- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- F006-05

## Unknown

- Where the CLI sets turn spacing and composer padding.
- Chrome side panel turn gap and composer padding values.
- Whether the VS Code composer pads the safe area (not relevant to desktop IDE) [inferred n/a].
- The brief's line citations for ChatMessageList.tsx:988, MessageBubble.tsx:2787, ChatComposerNew.tsx:4123 and WebChatPage.tsx:5822 pointed to unrelated code; current lines for those rules are not captured.
- Mobile message bubble toolbar spacing (brief MessageBubble.tsx:917 not opened).
