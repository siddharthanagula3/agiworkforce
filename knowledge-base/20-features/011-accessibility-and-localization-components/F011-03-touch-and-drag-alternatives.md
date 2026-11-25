---
id: "F011-03"
type: "feature"
title: "Touch and drag alternatives"
aliases: ["Touch equivalents for hover interactions (S11.10)", "Alternatives to drag-only operations (S11.11)", "hover:none", "pointer-coarse", "drag and drop alternative"]
area: "11 Accessibility and localization components"
available_on: ["web", "desktop", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S11.10", "S11.11"]
depends_on: ["surface:web", "surface:desktop", "surface:vscode", "surface:chrome", "file:apps/web/features/chat/components/SidePanelResizeHandle.tsx", "file:apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F011-03 Touch and drag alternatives

Makes actions that appear on mouse hover visible or tappable on touch screens, and gives drag actions (dropping files, resizing a panel) a button, menu or arrow-key alternative. Built on Web, Desktop, VS Code and Chrome; Mobile and CLI are not listed for these items.

Area: [11. Accessibility and localization components](README.md). Requirement items: [S11.10](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1110), [S11.11](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1111).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows hover-revealed buttons (copy, cancel, message actions) permanently on touch devices and on keyboard focus, offers 'attach' menus beside drop zones, and lets the resize handle be moved by arrow keys.

**Why it exists.** Touch screens never hover, and keyboard and switch users cannot drag. The product states that hover-only actions must also appear on keyboard focus and have touch alternatives (doc: docs/product/experience-contract.md:201).

**Who uses it.** Touch-screen users of the web app on phones and tablets, the Chrome side panel users on touch laptops, and keyboard-only users.

**Problems it solves**

- Copy and Retry buttons that are invisible without a mouse.
- Files that can only be attached by dropping them.
- A panel that can only be resized with a pointer.

**Use cases**

- Tap a message on a phone and see Retry, Edit, Copy.
- Attach a file from the files menu instead of dropping it.
- Resize the side panel with Arrow Left and Right.
- In VS Code, choose 'Attach workspace files' from the plus menu.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web): message action row below each message; tool-card Cancel and Copy icons; composer files menu with an 'Attach' button per file (apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:38,326).
- VS Code sidebar: plus menu 'Add context' with 'Attach workspace files', 'Selection' and more (webviewContent.ts:3198-3215).
- Chrome side panel: Copy button always visible when hover is not available (apps/extension/src/side_panel.ts:2453-2455).
- Resize: the separator handle between chat and side panel (apps/web/features/chat/components/SidePanelResizeHandle.tsx).

**Before you start**

- A touch screen or a keyboard-only setup.
- For file attach from the files menu, a signed-in web chat.

**Screens and controls**

- Message actions: labels 'Retry this message', 'Edit message', 'Copy message', 'Good response', 'Bad response' (apps/web/features/chat/components/messages/MessageBubble.tsx:3717-3806).
- Tool card icon buttons grow to 44px on coarse pointers (pointer-coarse:h-11 pointer-coarse:w-11) (packages/ui/unified-chat/src/components/ToolCallCard.tsx:535-566).
- Files menu 'Attach <file>' buttons (ComposerFilesMenu.tsx:326).
- Resize handle keyboard: Arrow Left, Arrow Right, Home, End.

**Journey**

1. On a touch device open a conversation.
2. Message actions are already visible (no hover needed).
3. Tap one to act.
4. To add a file, open the attach or files menu and choose the file instead of dragging.
5. To resize the artifacts or side panel, focus the handle and press arrow keys.

**What the person sees and gets**

- Buttons visible and large enough to tap.
- The attached file appears in the composer.
- The panel width changes and its aria-valuenow updates.

**Settings**

- None found: no setting controls these alternatives.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web message actions: opacity 0 until hover, but forced visible on focus-within, on [@media(hover:none)] and on pointer-coarse (apps/web/features/chat/components/messages/MessageBubble.tsx:3461,3702,4124).
- Shared MessageBubble used by Desktop Tauri and others: same pattern (packages/ui/unified-chat/src/components/MessageBubble.tsx:624).
- ToolCallCard hover actions revealed on group-hover, group-focus-within and hover:none (ToolCallCard.tsx:537-542).
- Chrome Copy button visible when hover is unavailable and on focus (apps/extension/src/side_panel.ts:2451-2455); coarse pointer targets 44px (side_panel.ts:5493-5495).
- Web files menu offers attach-by-button next to drop handling (ComposerFilesMenu.tsx:326; ChatComposerNew.tsx:472,818,2437 handles dropped files).
- SidePanelResizeHandle supports keyboard resize with ARIA valuenow, min, max (SidePanelResizeHandle.tsx:44-70); Desktop sidebar resizes by keyboard (apps/desktop/src/features/v3/__tests__/Sidebar.layoutA11y.test.tsx:188).
- VS Code composer accepts dropped files, and the plus menu gives a non-drag path (webviewContent.ts:7708-7724,3198-3200).

**Incomplete**

- Reorder by drag: no reorder-by-drag operation was audited, so whether every reorder has an alternative is unknown.
- Brief lists S11.11 web files as ArtifactsPanel.tsx:428 but that line is a dependency list, not a drag alternative; evidence for artifacts panel resize alternative is not confirmed.

**Present but disconnected or switched off**

- None found.

**Not available**

- Mobile and CLI: not listed in the brief for these items; Mobile uses native touch so hover is not applicable, and no drag operations were audited there.

## 4. Required behaviour

**Established requirements**

- Anything revealed on hover is also reachable by touch (always visible on touch screens or shown on tap). (source: brief S11.10 Should)
- Every drag operation (drop files, resize, reorder) has a non-drag alternative such as a button, menu or arrow keys. (source: brief S11.11 Should)
- Hover-only actions also appear on keyboard focus and have touch alternatives. (source: doc: docs/product/experience-contract.md:201)

**Acceptance criteria**

1. On a touch device, the message actions row is visible without hovering.
2. With the keyboard, Tab to a message action reveals it (focus-within).
3. Every drop zone has a button path that attaches the same file.
4. The resize handle responds to Arrow Left, Arrow Right, Home and End and updates aria-valuenow.
5. Touch targets for tool-card icon buttons are 44px on coarse pointers.
6. In the Chrome side panel on a touch device the Copy button is visible.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Desktop gets web behaviour via the hosted app [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Audit every sortable list for a move-up and move-down menu.
- [proposed] Add a test that fails when an opacity-0 hover reveal has no hover:none and focus-within sibling class.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Web MessageBubble | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Message actions with hover, focus-within, hover:none reveal (lines 3461,3702,4124). |
| component | Shared MessageBubble | `packages/ui/unified-chat/src/components/MessageBubble.tsx` | Same reveal pattern (line 624). |
| component | ToolCallCard | `packages/ui/unified-chat/src/components/ToolCallCard.tsx` | Cancel and Copy actions revealed on touch; 44px targets (lines 535-566). |
| component | ComposerFilesMenu | `apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx` | Attach by choosing a file (lines 38,177-180,326). |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Receives dropped files (lines 472,818,2437). |
| component | SidePanelResizeHandle | `apps/web/features/chat/components/SidePanelResizeHandle.tsx` | Pointer and keyboard resize. |
| component | ArtifactsPanel | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Artifacts panel cited by the brief for S11.11; alternative unverified. |
| component | Desktop Sidebar | `apps/desktop/src/features/v3/Sidebar.tsx` | Keyboard resizable sidebar (test at Sidebar.layoutA11y.test.tsx:188). |
| component | VS Code webview drop and plus menu | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Drop zone (7708-7724) and menu path (3198-3215). |
| component | Chrome side panel touch styles | `apps/extension/src/side_panel.ts` | hover:none and pointer:coarse CSS (2453-2455,5493-5495). |
| test | Sidebar.layoutA11y.test | `apps/desktop/src/features/v3/__tests__/Sidebar.layoutA11y.test.tsx` | Keyboard resize of the Desktop sidebar. |
| test | side-panel-a11y.test | `apps/extension/__tests__/side-panel-a11y.test.ts` | Touch target test for the permission chip (line 84). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CSS media queries (hover: none, pointer: coarse) and focus-within reveal the controls. | device | apps/web/features/chat/components/messages/MessageBubble.tsx:3702; apps/extension/src/side_panel.ts:2453 |
| A chosen file from the menu or a dropped file goes through the same composer attach handler. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2437; ComposerFilesMenu.tsx:180 |
| Where the file menu lists workspace files it fetches from our servers [inferred]; the attach step itself is local. | device and our servers | [inferred] ComposerFilesMenu has loading and error states (lines 241-242,308) |
| Keyboard resize calls setWidth and the width is kept by the store. | device | SidePanelResizeHandle.tsx:44-55 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Panel width. | a UI store (name not opened) [inferred] | unknown | unknown |

**Models and providers.** No model or provider takes part in revealing or resizing. Attached files later go to the chat turn (see SYS-files-artifacts-and-storage).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Attach from the files menu needs a signed-in web chat; reveal and resize rules need none. |
| Permissions | None found in the code. |
| Subscription | None found in the accessibility code; file upload limits belong to SYS-files-artifacts-and-storage and were not audited here. |
| Limits and metering | None found in the code for this feature. |
| Feature flags | None found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | None found in the code. |
| Local mode | Reveal and resize work offline on device; whether the files menu works in Local mode was not established. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading files menu | A spinner named by COMPOSER_FILES_LOADING_LABEL is shown. | ComposerFilesMenu.tsx:308 |
| Attach error | An attachError state exists in the menu. | ComposerFilesMenu.tsx:241 |
| Hover device with keyboard | Actions appear on focus-within. | MessageBubble.tsx:3702 |
| Resize beyond limits | Home and End jump to min and max; arrow steps are clamped through setWidth [inferred]. | SidePanelResizeHandle.tsx:46-48 |
| Collapsed Desktop rail | No resize handle on the collapsed rail. | apps/desktop/src/features/v3/__tests__/Sidebar.layoutA11y.test.tsx:205 |
| Offline, timeout, retry | not handled in the code for this feature. | none found in the files opened for reveal and resize |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/desktop/src/features/v3/__tests__/Sidebar.layoutA11y.test.tsx`: Desktop sidebar resize by keyboard and width bounds.
- `apps/extension/__tests__/side-panel-a11y.test.ts`: Chrome permission chip target size.
- `apps/mobile/__tests__/MessageBubbleAccessibility.test.tsx`: Mobile message actions on a reachable control and long-press alternative.
- `apps/web/e2e/chat-soft-keyboard.spec.ts`: Chat behaviour with a soft keyboard (file exists; content not read).

**Test scenarios**

- **Touch reveal**
  1. Open web chat in a phone-sized touch emulator.
  2. Open a conversation with an assistant message.
  - Expected: Retry, Edit, Copy and feedback buttons are visible without hover.
- **Attach without drag**
  1. Open the composer files menu.
  2. Choose a file via its Attach button.
  - Expected: The file is attached as if dropped.
- **Keyboard resize**
  1. Open a side panel, Tab to the separator.
  2. Press Arrow Left, Arrow Right, Home, End.
  - Expected: Width changes, aria-valuenow updates, never leaves min or max.
- **VS Code attach**
  1. Open the plus menu, choose 'Attach workspace files'.
  - Expected: Files are attached without dragging.

**Where to look when it fails**

- DevTools device emulation with hover: none.
- Check class list for pointer-coarse variants.
- Playwright traces.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/011-accessibility-and-localization-components.md](../../70-qa/test-plans/web/011-accessibility-and-localization-components.md)
- Desktop: [70-qa/test-plans/desktop/011-accessibility-and-localization-components.md](../../70-qa/test-plans/desktop/011-accessibility-and-localization-components.md)
- VS Code: [70-qa/test-plans/vscode/011-accessibility-and-localization-components.md](../../70-qa/test-plans/vscode/011-accessibility-and-localization-components.md)
- Chrome: [70-qa/test-plans/chrome/011-accessibility-and-localization-components.md](../../70-qa/test-plans/chrome/011-accessibility-and-localization-components.md)

## 10. Gaps and dependencies

- **No audit of reorder-by-drag lists.** Affects: Web, Desktop, VS Code.. Evidence: No reorder alternative found in the files opened.. Work needed: List every sortable surface and confirm a non-drag path.
- **Brief evidence for the artifacts panel resize alternative does not match the cited line.** Affects: Auditors.. Evidence: apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx:428 is a dependency array.. Work needed: Re-cite or build the alternative.
- **Mobile has no status for these items.** Affects: Mobile.. Evidence: brief S11.10 and S11.11 list no mobile status. Work needed: Decide not-applicable or test.
- **Tool-card approval buttons are small (h-6).** Affects: Touch users.. Evidence: ToolCallCard.tsx:412-436. Work needed: Check against touch target rule.

**Depends on**

- surface:web
- surface:desktop
- surface:vscode
- surface:chrome
- file:apps/web/features/chat/components/SidePanelResizeHandle.tsx
- file:apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design

## Unknown

- Where panel width is stored and whether it syncs.
- Whether the Chrome side panel has a file-drop zone and its alternative.
- Whether every reorder or sortable list in any app has an alternative.
- Mobile behaviour for these items.
