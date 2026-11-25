---
id: "F007-10"
type: "feature"
title: "Printing"
aliases: ["Print", "Print conversation", "Print-specific layouts", "print-conversation", "data-print-scope", "Export sheet Print", "S7.32"]
area: "7 Layout systems"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S7.32"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "SYS-shared-ui-and-design", "SYS-files-artifacts-and-storage", "file:apps/web/features/chat/lib/print-conversation.ts", "file:apps/web/app/globals.css", "file:apps/mobile/services/fileCreation.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F007-10 Printing

Print gives a clean paper copy of a whole conversation. On Web and Desktop, the chat menu's Print item turns on a print-only layout that hides app chrome, forces black on white, avoids splitting messages and shows link addresses. On Mobile, the export sheet's Print option sends a styled HTML copy to the printer.

Area: [7. Layout systems](README.md). Requirement items: [S7.32](../../10-requirements/capabilities/007-layout-systems.md#s732).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Web and Desktop: Print in the conversation title menu calls printConversation, which marks the page as printing the transcript and calls the browser print dialog (apps/web/features/chat/lib/print-conversation.ts:1-30; apps/web/features/chat/components/ConversationTitleMenu.tsx:189-194). Mobile: the export sheet offers Print and Export as PDF (apps/mobile/src/features/chat/components/ConversationExportSheet.tsx:55-66).

**Why it exists.** Brief S7.32 asks for a print layout without app chrome, with the whole content, paper-friendly colours and sensible page breaks. The code comment says a plain Ctrl+P could only print the rows in the virtual list (WebChatPage.tsx:7403-7406).

**Who uses it.** Web and Desktop users with an open conversation; Mobile users with a conversation that has messages.

**Problems it solves**

- Printing a long chat used to print only the visible rows plus chrome (apps/web/app/globals.css:1850-1860).
- Dark themes wasted toner.
- Links in print had no visible address.

**Use cases**

- Print a conversation for a meeting.
- Save a conversation as PDF through the print dialog.
- Print from a phone to a nearby printer.
- Print with long code blocks wrapped.

## 2. User experience

**Where to find it**

- Web and Desktop: open a conversation, open the conversation title menu, choose 'Print' (the menu also has 'Share…' and 'Export…') (apps/web/features/chat/components/ConversationTitleMenu.tsx:182-201).
- Mobile: open a conversation, open the export sheet and choose 'Print' ('Send the styled document to a printer'); 'Export as PDF' sits beside it (ConversationExportSheet.tsx:55-66).
- Desktop uses the same hosted web page, so the same menu applies [inferred; apps/desktop shows hosted app per AGENTS.md section 5].

**Before you start**

- An open conversation with messages. Mobile: empty conversations show an alert 'Nothing to Export' (ConversationExportSheet.tsx near line 102 per alert text).

**Screens and controls**

- Title menu item 'Print' with a printer icon.
- Browser or OS print dialog.
- Mobile export sheet with five options: Export as PDF, Print, Export as Text, Export as Markdown, Copy All Messages.

**Journey**

1. Open the menu and choose Print.
2. The page sets the print scope, waits two animation frames, then calls window.print (print-conversation.ts:8-26).
3. Choose a printer or Save as PDF in the dialog.
4. After printing the scope is removed, or after 1 second if the event never fires (print-conversation.ts:19-29).
5. Mobile: choose Print; the OS print sheet opens with the styled HTML.

**What the person sees and gets**

- Paper or PDF containing only the transcript, black on white, with link addresses after links.
- Mobile: alert 'Print Failed' with 'Could not open printing for this conversation. Try again.' on error; cancelling the print sheet is silent (apps/mobile/services/fileCreation.ts:821-830).

**Settings**

- none found for print; the browser's print dialog holds paper size and margins.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- printConversation sets html data-print-scope='transcript', waits for layout, prints, and cleans up on afterprint or after 1 second (apps/web/features/chat/lib/print-conversation.ts:1-30).
- The message list watches that attribute and raises the render count to every row, so the whole transcript is in the page (apps/web/features/chat/components/messages/ChatMessageList.tsx:1172-1185, 1270-1273, 2110).
- Print CSS hides elements marked data-print-hide, aside, nav, role toolbar and the composer; forces white background and black text; removes list height limits; keeps messages and code blocks together; appends http link addresses (apps/web/app/globals.css:1862-1920).
- Mobile Print builds HTML from the messages and calls the OS print service (apps/mobile/services/fileCreation.ts:821-830).
- Mobile export styles include page break rules for tables, quotes and images (apps/mobile/services/exportMarkdownHtml.ts:46-62).

**Incomplete**

- The brief says the menu call expands the virtual list first. In the code, WebChatPage calls printConversation() with no onExpand (WebChatPage.tsx:7407); the expansion happens instead because ChatMessageList observes the attribute. The onExpand option is unused by the page.
- The brief says mobile builds an exported HTML or file instead of printing. The code has a real Print option too (fileCreation.ts:821-830).
- Brief CSS line range 1862-1920 matches; ChatMessageList.tsx:1954 is not the print code (the print code is at 1172-1185, 1270-1273, 2110).
- Print hides every aside and nav element, so a conversation using those tags inside messages would lose that content (globals.css:1865-1869) [inferred risk].

**Present but disconnected or switched off**

- printConversation's onExpand and waitMs options exist and are covered by tests but no caller passes them (print-conversation.ts:2-3; WebChatPage.tsx:7407).

**Not available**

- CLI, VS Code, Chrome: no print layout (brief lists none; no code searched there).
- Print of a report on Web or Desktop uses a different path if any; the brief mentions reports but no report print code was found.

## 4. Required behaviour

**Established requirements**

- Printing a conversation or report produces a print-specific layout: no app chrome, the whole content, paper-friendly colours and sensible page breaks. (source: S7.32 (brief))
- The menu calls printConversation(), which sets data-print-scope='transcript' and expands the virtual list; print CSS hides sidebars, nav, toolbars and the composer, forces white and black, avoids splitting a message and appends link addresses. (source: brief Should lines for S7.32)

**Acceptance criteria**

1. Printing a 200 message conversation on Web includes the first and the last message.
2. The printed page has no sidebar, header navigation, toolbar or composer.
3. Text is black on white even when the app uses a dark theme.
4. A message is not split across a page when it fits on one page; long code lines wrap.
5. Each http link shows its address in brackets after it.
6. After the print dialog closes, the app returns to its normal look.
7. On Mobile, Print opens the OS print sheet and cancelling does not show an error.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Desktop should print as web does because the Electron window shows the hosted page [inferred]. Not verified.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Remove the unused onExpand option or use it.
- [proposed] Print also the research report view.
- [proposed] Limit the aside and nav hiding to the app shell.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | printConversation (web) | `apps/web/features/chat/lib/print-conversation.ts` | Sets the scope, waits, prints, cleans up. |
| component | ConversationTitleMenu Print item | `apps/web/features/chat/components/ConversationTitleMenu.tsx` | Shows the Print menu item when onPrint is given (lines 58, 189-194). |
| screen | WebChatPage print wiring | `apps/web/features/chat/pages/WebChatPage.tsx` | Imports the function (254) and passes onPrint (7407). |
| component | ChatMessageList print scope | `apps/web/features/chat/components/messages/ChatMessageList.tsx` | Observes the attribute and renders all rows while printing (1172-1185, 1270-1273, 2110). |
| config | print stylesheet | `apps/web/app/globals.css` | The @media print rules scoped to data-print-scope (lines 1850-1920). |
| service | printConversation (mobile) | `apps/mobile/services/fileCreation.ts` | Builds HTML and calls Print.printAsync; also PDF export (174-211, 821-830). |
| service | export HTML styles | `apps/mobile/services/exportMarkdownHtml.ts` | Content styles including page break rules (line 46 onwards). |
| component | ConversationExportSheet | `apps/mobile/src/features/chat/components/ConversationExportSheet.tsx` | The sheet with Print and other export options and its alerts. |
| screen | Mobile chat screen | `apps/mobile/app/(app)/chat/[id].tsx` | Opens the export sheet. |
| test | print-conversation.test.ts | `apps/web/features/chat/lib/print-conversation.test.ts` | Scope, order, cleanup tests. |
| test | conversation-export-formats.test.ts | `apps/mobile/__tests__/conversation-export-formats.test.ts` | Mobile print and PDF tests. |
| test | ConversationExportSheet.test.tsx | `apps/mobile/__tests__/ConversationExportSheet.test.tsx` | Export sheet tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person chooses Print; the page sets data-print-scope on the document element. | device | print-conversation.ts:7-8 |
| The message list sees the attribute and renders every row. | device | ChatMessageList.tsx:1172-1185, 1270-1273, 2110 |
| After two animation frames the page calls window.print; the print stylesheet applies. | device | print-conversation.ts:12-26; globals.css:1862-1920 |
| The browser or OS shows the print dialog; the scope is removed on afterprint or after 1 second. | device | print-conversation.ts:19-29 |
| Mobile: messages become markdown then HTML and go to the OS print service. | device | fileCreation.ts:821-830 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Printed output | paper, or a PDF file the person saves | no | outside the app |
| data-print-scope attribute | page document in memory | no | removed after printing |

**Models and providers.** No model or provider takes part. Messages already in the app are printed.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The conversation must be open in the signed-in chat; the print code itself checks no account. |
| Permissions | The OS print service. Nothing else found. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. Mobile refuses empty content with 'Cannot print empty content' (fileCreation.ts:823). |
| Feature flags | none found in the code. |
| Model compatibility | not applicable; no model is used. |
| Provider restrictions | none found in the code. |
| Local mode | Printing works on content already on the device and calls no server in the print code; it works in all three ways of running. A Local conversation is printed like any other. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Afterprint never fires | Scope removed after 1 second. | print-conversation.ts:28 |
| Server render | The function returns without doing anything when there is no window. | print-conversation.ts:5 |
| Very long conversation | All rows are rendered during printing, which may be slow; no limit or progress shown. | ChatMessageList.tsx:2110 (not handled in the code: no progress or cap) |
| Mobile empty conversation | Alert 'Nothing to Export'. | apps/mobile/src/features/chat/components/ConversationExportSheet.tsx:102 area (alert text) |
| Mobile print cancelled | Swallowed silently. | apps/mobile/services/fileCreation.ts:827-828 |
| Mobile print error | Alert 'Print Failed'. | ConversationExportSheet.tsx (alert text 'Print Failed') |
| Desktop Electron print | No Electron print code found (no webContents.print call); how window.print behaves in the Electron window is unknown. | grep of apps/desktop/electron found none |
| Accessibility | The menu item is a normal menu item with an icon and text; print output accessibility not handled in the code. | ConversationTitleMenu.tsx:189-194 |
| Offline | Print needs no network; images that are not already loaded may be missing [inferred]. | print-conversation.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/lib/print-conversation.test.ts`: Scope is set during print, expand callback runs before print, scope cleared on afterprint, scope cleared even without afterprint.
- `apps/mobile/__tests__/conversation-export-formats.test.ts`: Mobile print and PDF with title once in the header.
- `apps/mobile/__tests__/ConversationExportSheet.test.tsx`: Export sheet behaviour (not read in detail).
- `apps/mobile/__tests__/ConversationExportSheet.markdownTitle.test.tsx`: Title handling in the export sheet (not read in detail).

**Test scenarios**

- **Print a long conversation on Web**
  1. Open a conversation with more than 100 messages.
  2. Open the title menu and choose Print.
  3. Look at the preview, first and last page.
  - Expected: Whole conversation, no sidebar or composer, black on white.
- **Dark theme print**
  1. Switch to dark theme.
  2. Print preview.
  - Expected: White background, black text.
- **Links and code**
  1. Print a conversation with a link and a long code block.
  - Expected: The link address follows the link text; the code wraps and is not cut.
- **Scope cleanup**
  1. Print, then cancel the dialog.
  2. Check the app look.
  - Expected: The app returns to normal with no print attribute left.
- **Desktop print**
  1. In the Desktop app choose Print on a conversation.
  - Expected: A print dialog opens with the same layout (not verified by any file I read).
- **Mobile print**
  1. Open the export sheet in a conversation, choose Print, then cancel.
  - Expected: OS print sheet opens; cancelling gives no error.

**Where to look when it fails**

- Inspect html element for data-print-scope while printing.
- Mobile alert texts 'Print Failed' and 'Nothing to Export'.
- Mobile error text 'Cannot print empty content' (fileCreation.ts:823).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/007-layout-systems.md](../../70-qa/test-plans/web/007-layout-systems.md)
- Desktop: [70-qa/test-plans/desktop/007-layout-systems.md](../../70-qa/test-plans/desktop/007-layout-systems.md)
- Mobile: [70-qa/test-plans/mobile/007-layout-systems.md](../../70-qa/test-plans/mobile/007-layout-systems.md)

## 10. Gaps and dependencies

- **Desktop print is not backed by any Electron code or test; it relies on the hosted page's window.print.** Affects: Desktop users. Evidence: No print call in apps/desktop/electron. Work needed: Verify in the real app, then add a test or a native print call if it fails.
- **Unused onExpand and waitMs options.** Affects: Maintainers. Evidence: print-conversation.ts:2-3; WebChatPage.tsx:7407. Work needed: Remove or use.
- **Brief text about mobile and about where expansion happens does not match the code.** Affects: Readers of the brief. Evidence: fileCreation.ts:821-830; ChatMessageList.tsx:2110. Work needed: Correct the brief.
- **No print for research reports found, although S7.32 mentions reports.** Affects: Web, Desktop, Mobile. Evidence: no print code in research components found by searching for print-conversation and data-print-scope. Work needed: Check report views and add print if missing.
- **Print CSS hides every aside and nav element.** Affects: Web and Desktop. Evidence: globals.css:1865-1869. Work needed: Scope to app shell elements.
- **No test of the print stylesheet itself.** Affects: Web and Desktop. Evidence: tests found cover only the function. Work needed: Add a browser test with print media emulation.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- SYS-shared-ui-and-design
- SYS-files-artifacts-and-storage
- file:apps/web/features/chat/lib/print-conversation.ts
- file:apps/web/app/globals.css
- file:apps/mobile/services/fileCreation.ts

## Unknown

- Whether window.print works as expected inside the Electron window.
- Whether research reports can be printed on Web, Desktop or Mobile.
- How a printed conversation looks for images, charts and artifacts.
- The exact line of the mobile 'Nothing to Export' alert.
