---
id: "F011-01"
type: "feature"
title: "Screen-reader names, labels and headings"
aliases: ["Accessible control labels (S11.01)", "Semantic heading hierarchy (S11.02)", "Accessible tool and approval status (S11.09)", "aria-label", "accessibilityLabel", "accessibilityRole header"]
area: "11 Accessibility and localization components"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "built", cli: "n/a", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S11.01", "S11.02", "S11.09"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "file:packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx", "file:packages/contracts/types/src/tool-approval-policy.ts", "SYS-shared-ui-and-design", "SYS-agents-tools-and-automation", "SYS-chat-turn-pipeline"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F011-01 Screen-reader names, labels and headings

Gives every control in the Web, Desktop, Mobile, VS Code and Chrome apps a spoken name, gives each screen a top heading, and tells a screen reader whether a tool step is running, done, failed or waiting for approval. Approve and Deny buttons carry names. The CLI has its own screen-reader mode (see F011-04 and F011-06).

Area: [11. Accessibility and localization components](README.md). Requirement items: [S11.01](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1101), [S11.02](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1102), [S11.09](../../10-requirements/capabilities/011-accessibility-and-localization-components.md#s1109).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | built | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Makes controls, headings and tool or approval status readable by a screen reader. Names come from visible text or an aria-label on web-based surfaces, and from accessibilityLabel and accessibilityRole on mobile. Tool steps and approval cards expose their state as text, not only as a colour or icon.

**Why it exists.** Blind and low-vision people cannot use an icon-only button or an unlabelled approval card. The product requires every icon-only control to have an accessible name (doc: docs/product/experience-contract.md:168) and lists screen-reader checks as a release gate (doc: docs/product/experience-contract.md:750).

**Who uses it.** People who use VoiceOver, TalkBack, NVDA, JAWS or other assistive technology, on Web, Desktop (which shows the hosted web app), Mobile, the VS Code extension and the Chrome extension. Also testers and engineers who audit names.

**Problems it solves**

- An icon-only button is read as 'button' with no purpose.
- A tool run that waits for approval looks idle to someone who cannot see the card.
- A screen has no heading to jump to.

**Use cases**

- A screen-reader user reaches Allow and Deny on a tool approval card in web chat and hears their text.
- A VoiceOver user on the phone opens the agent activity list and hears 'Show agent activity: <summary>' with an expanded or collapsed state.
- A VS Code user tabs through the sidebar and every icon button has a name such as Sessions, Settings, New chat.
- A user jumps by heading to the conversation title (web h1).

## 2. User experience

**Where to find it**

- Web and Desktop (Electron shows the hosted web app, CLOUD_APP_ORIGIN) chat: conversation title is an h1 in the shared header, with buttons 'Rename conversation' and 'Conversation options' (apps/web/features/chat/components/ConversationTitleMenu.tsx:119,140; packages/ui/unified-chat/src/components/ConversationHeader.tsx:88-92). WebChatPage also renders an sr-only h1 (apps/web/features/chat/pages/WebChatPage.tsx:7313).
- Web and Desktop: the 'Agent activity' section is a button named 'Show agent activity: <summary>' or 'Hide agent activity: <summary>' (packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:869,877-884). Tool approval buttons read 'Allow', 'Allow for this chat', 'Deny' (packages/ui/unified-chat/src/components/ToolCallCard.tsx:412-436; packages/contracts/types/src/tool-approval-policy.ts:23-32).
- Mobile: agent activity row named 'Show agent activity: <summary>' / 'Hide ...'; each step 'title, status'; approvals are 'Approve <tool> action', 'Approve <step>', 'Deny <step>', 'Reject <tool>' (apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:417-418,1034-1044; apps/mobile/src/shared/components/ApprovalModal.tsx:222; apps/mobile/src/features/companion/components/DispatchTaskReply.tsx:304,313; apps/mobile/src/features/companion/components/CodeSessionParts.tsx:268,293; apps/mobile/src/features/companion/components/AgentDashboard.tsx:422,434).
- VS Code sidebar: icon buttons 'Sessions', 'Settings', 'New chat', 'More actions', 'Stop response', 'Send' and a visually hidden h2 'Conversation' above the transcript (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:2928-2942,3161,3365-3366).
- Chrome side panel: composer controls 'Message AGI', 'Send message', 'Add attachment', 'Voice input' (apps/extension/__tests__/side-panel-a11y.test.ts:19-27 asserts them in source).

**Before you start**

- A screen reader or accessibility inspector on the device.
- No sign-in or plan is needed for names themselves; the screens they sit on may need one (see access_and_usage).

**Screens and controls**

- Web/Desktop: skip link 'Skip to main content' (apps/web/shared/components/accessibility/SkipLinks.tsx:12; mounted at apps/web/app/layout.tsx:179), conversation header h1, agent activity section, tool call cards.
- Mobile: 152 accessibilityRole='header' uses across apps/mobile/src and apps/mobile/app (counted with grep), timeline rows, approval sheets.
- VS Code: header icon buttons, transcript log with heading, onboarding dialog with h2 headings (webviewContent.ts:3070-3103).
- Chrome: side-panel composer, tabs with roving tabindex and tabpanels (apps/extension/__tests__/side-panel-a11y.test.ts:34-63).

**Journey**

1. Open the app with a screen reader on.
2. Move to the next control or heading; the reader says the name and role.
3. Start an agent turn; the activity button names the current work.
4. When a tool needs approval, the activity live region says 'Approval needed: <step>' (AgentActivityTimeline.tsx:369-376) and the card shows Allow and Deny buttons.
5. Activate Allow or Deny; the step state changes to approved or denied and the summary updates.

**What the person sees and gets**

- Spoken names and roles.
- A polite live region phrase for activity state (web/desktop).
- Mobile step label 'summary, <status label>' (AgentActivityTimeline.tsx:729-730).

**Settings**

- No setting turns these names on or off. Language of names is not switchable: many are fixed English strings (see gaps).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web/Desktop shared header renders the conversation title as an h1 and names its icon buttons (packages/ui/unified-chat/src/components/ConversationHeader.tsx:88-92,194-198).
- Web/Desktop activity timeline: section aria-label 'Agent activity', sr-only polite live region, toggle button with aria-expanded and a name that includes the summary, icons marked aria-hidden (AgentActivityTimeline.tsx:869-898).
- Announcement text covers waiting for input, approval needed, waiting for desktop, paused, failed, finished with errors, stopped, completed, working (AgentActivityTimeline.tsx:369-384).
- Tool call card approval buttons have visible text names Allow, Allow for this chat, Deny (ToolCallCard.tsx:412-436); its Cancel and Copy icon buttons have aria-labels (ToolCallCard.tsx:549,563).
- Inline tool call rows are role=button with aria-label built from label, suffix and completion text (packages/ui/unified-chat/src/components/InlineToolCall.tsx:343-349).
- Mobile: timeline rows have accessibilityRole, label with status and expanded state; Retry, Resend, Show earlier steps have labels (apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:417-422,499-500,912-913,1123-1124).
- VS Code: sidebar icon buttons have aria-label; accessibleNames test renders the webview and checks names for default, onboarding and settings states (apps/extension-vscode/src/__tests__/accessibleNames.webview.test.ts:91,108,126).
- Chrome: composer controls named; tabs have tabpanels and roving tabindex (apps/extension/__tests__/side-panel-a11y.test.ts).

**Incomplete**

- Web and Desktop control-name coverage is not machine-checked across all controls: the brief marks S11.01 unverified for web, desktop and Chrome (doc: knowledge-base/data/area-briefs/011-accessibility-and-localization-components.md S11.01).
- Mobile ApprovalModal does not set accessibilityViewIsModal; it is on a pending list of five modal files, so VoiceOver and TalkBack can keep reading the screen behind it (apps/mobile/__tests__/modal-accessibility-semantics.test.ts:13-19; apps/mobile/src/shared/components/ApprovalModal.tsx:110 has <Modal without that prop).
- Announcement and many label strings are English literals, not translated (AgentActivityTimeline.tsx:369-384; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:1043,1124).

**Present but disconnected or switched off**

- None found: no flag turns names off.

**Not available**

- CLI has no aria names; its screen-reader mode is a separate feature (apps/cli/src/lib.rs:442-448).
- Several brief code pointers no longer match the file lines (for example apps/mobile/app/(app)/notifications/index.tsx:93 is a colour switch, and webviewContent.ts:44 is escapeHtml), so the brief's evidence for S11.01 is stale.

## 4. Required behaviour

**Established requirements**

- Every interactive control exposes an accessible name (visible text, aria-label or platform equivalent) that says what it does. (source: brief S11.01 Should)
- Each screen has a top heading and sections use nested headings, so screen-reader users can jump by heading. (source: brief S11.02 Should)
- Tool steps and approval requests expose their state (running, done, failed, waiting for approval) to assistive tech, with labelled approve and deny controls. (source: brief S11.09 Should)
- Every icon-only control has an accessible name and tooltip where discoverability matters. (source: doc: docs/product/experience-contract.md:168)
- Keyboard, screen reader, focus, touch, reduced motion and contrast are verified before release. (source: doc: docs/product/experience-contract.md:750)
- Failure of a name shows as a missing name, not as silence (from the draft 'should' list). (source: task brief for F011-01)

**Acceptance criteria**

1. With a screen reader on web chat, every button in the header, composer and message actions is announced with a name that states its action; none is announced as just 'button'.
2. Each web chat page has exactly one h1; jumping by heading reaches the conversation title.
3. A tool step that needs approval is announced as 'Approval needed' and the Allow and Deny buttons are reachable and named.
4. On iOS and Android, a swipe through the agent activity list announces each step with its status, and expanded state is spoken.
5. When the mobile ApprovalModal opens, the screen behind it is not reachable by screen reader (currently fails: pending list).
6. In the VS Code sidebar and Chrome side panel, no button, tab or menu item is announced without a name.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Names should be translated with the app language; today many are English literals [inferred from the string literals cited above].
- The Desktop public app inherits web behaviour because Electron loads the hosted web app (apps/desktop/electron/main.ts:1065-1067) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an automated axe sweep over signed-in chat, settings and approval states on web, and record the result in a report like apps/web/reports/a11y-report.json, which today covers only five public pages.
- [proposed] Fix the five PENDING mobile modals, starting with ApprovalModal, and shrink the list in modal-accessibility-semantics.test.ts.
- [proposed] Move announcement and label strings into the i18n catalogue.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ConversationHeader | `packages/ui/unified-chat/src/components/ConversationHeader.tsx` | Shared header with h1 title and named icon buttons (lines 75-198). |
| component | ConversationTitleMenu | `apps/web/features/chat/components/ConversationTitleMenu.tsx` | Web title menu: 'Rename conversation', 'Conversation options', loading status (lines 39-41,119,140). |
| component | WebChatPage | `apps/web/features/chat/pages/WebChatPage.tsx` | Renders the sr-only h1 for the chat page (line 7313). |
| component | SkipLinks | `apps/web/shared/components/accessibility/SkipLinks.tsx` | 'Skip to main content' link; mounted in the root layout (apps/web/app/layout.tsx:179). |
| component | AgentActivityTimeline (shared) | `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx` | Activity section, live region, toggle button name, announcement builder (lines 369-384,869-898). |
| component | ToolCallCard | `packages/ui/unified-chat/src/components/ToolCallCard.tsx` | Approval notice with Allow, Allow for this chat and Deny buttons; Cancel and Copy icon buttons (lines 289,412-436,549,563). |
| component | InlineToolCall | `packages/ui/unified-chat/src/components/InlineToolCall.tsx` | Inline tool row with role=button and composed aria-label (lines 343-349,437,471,533). |
| config | TOOL_APPROVAL_ACTION_LABELS | `packages/contracts/types/src/tool-approval-policy.ts` | One source for approval button text (line 23). |
| component | Mobile AgentActivityTimeline | `apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx` | Native timeline rows with accessibilityRole, label, state and hint (lines 417-422,729-730,1034-1044). |
| component | Mobile ApprovalModal | `apps/mobile/src/shared/components/ApprovalModal.tsx` | Approve and reject controls with labels (line 222); lacks accessibilityViewIsModal. |
| component | DispatchTaskReply / CodeSessionParts / AgentDashboard | `apps/mobile/src/features/companion/components/DispatchTaskReply.tsx` | Companion approve and deny controls named after the step (lines 304,313); siblings CodeSessionParts.tsx:268,293 and AgentDashboard.tsx:422,434. |
| component | Mobile settings screen frame | apps/mobile/src/features/settings/common.tsx (not found) | Settings screen container; header roles are applied across mobile screens (152 uses of accessibilityRole header). |
| component | VS Code sidebar webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | HTML for the sidebar: aria-labelled buttons, hidden h2 'Conversation', onboarding dialog headings (lines 2928-2942,3070-3103,3161,3365). |
| component | Chrome side panel | `apps/extension/src/side_panel.ts` | Builds composer, tabs and menus with aria attributes. |
| component | Chrome schedules section | `apps/extension/src/features/side-panel/schedulesSection.ts` | Schedules panel styles and markup in the side panel. |
| test | accessibleNames.webview.test | `apps/extension-vscode/src/__tests__/accessibleNames.webview.test.ts` | Renders the VS Code webview and checks control names in three states. |
| test | modal-accessibility-semantics.test | `apps/mobile/__tests__/modal-accessibility-semantics.test.ts` | Requires accessibilityViewIsModal on every Modal except the pending list. |
| test | side-panel-a11y.test | `apps/extension/__tests__/side-panel-a11y.test.ts` | Checks Chrome side-panel names, tabs and tabpanels by reading source. |
| test | accessibility-audit e2e | `apps/desktop/e2e/accessibility-audit.spec.ts` | Desktop accessibility audit (WCAG 2.1 A/AA per its describe title). |
| other | a11y-audit script | `apps/web/scripts/a11y-audit.mjs` | Script that produces apps/web/reports/a11y-report.json; VS Code has its own at apps/extension-vscode/scripts/a11y-audit.mjs. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app renders markup with names, roles and headings (web React, mobile React Native props, VS Code and Chrome HTML). | device | packages/ui/unified-chat/src/components/ConversationHeader.tsx:88-92; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:417-422 |
| The platform accessibility layer (browser tree, VoiceOver, TalkBack) exposes names to the reader. | device | [inferred] platform behaviour, no repo code |
| Tool and approval state comes from the agent activity state, which the chat turn pipeline fills; the timeline turns it into a label and a live phrase. | device and our servers | packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:369-384,821 (rendering is on device; the activity state is produced by the turn, see SYS-chat-turn-pipeline) |
| Approve or Deny calls the onApprove, onApproveForChat or onReject callbacks the host app supplies. | device | packages/ui/unified-chat/src/components/ToolCallCard.tsx:77-79,412-436 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No data is created by names or headings; approval decisions are created by the callbacks, not by this feature. | not applicable to this feature | not applicable | not applicable |

**Models and providers.** Names and headings do not depend on any model or provider. Tool status text comes from the activity state; which model produced the tool call does not change the label [inferred from the announcement builder using only status fields].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | No account is needed for names. The chat, settings and approval screens that carry them sit behind the apps' own sign-in rules, which this feature does not change. |
| Permissions | None found in the code for names. Approval buttons exist only when the host passes onApprove or onReject (ToolCallCard.tsx:289). |
| Subscription | None found in the code: no plan or entitlement check was found in the accessibility code I opened. |
| Limits and metering | None found in the code. |
| Feature flags | None found in the code for names or headings. |
| Model compatibility | Any model: labels are built from activity status, not model output. |
| Provider restrictions | None found in the code. |
| Local mode | Works in Local mode: all rendering and naming run on the device and need no server (packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx runs in the client). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web conversation title shows a role=status, aria-busy, 'Loading conversation title' placeholder. | apps/web/features/chat/components/ConversationTitleMenu.tsx:39-41 |
| Empty | A finished or cancelled run with no reportable work renders nothing, so no empty activity control is left. | packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:860-866 |
| Error or failed step | Announces 'Agent activity failed' or 'finished with errors'; mobile and web show Retry with a label. | AgentActivityTimeline.tsx:380-382; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:912-913 |
| Approval expired | Approval buttons are hidden when the approval is expired. | packages/ui/unified-chat/src/components/ToolCallCard.tsx:289 |
| Not expandable | The toggle is disabled and named 'Agent activity: <summary>' with no expanded state. | AgentActivityTimeline.tsx:876-883 |
| Modal on mobile | Most modals set accessibilityViewIsModal; ApprovalModal and four others do not yet. | apps/mobile/__tests__/modal-accessibility-semantics.test.ts:13-19 |
| Offline, retry, timeout | not handled in the code for this feature: names do not change with connectivity. The mobile offline banner has its own alert role. | apps/mobile/src/features/edge-cases/components/OfflineBanner.tsx:30-32 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/accessibleNames.webview.test.ts`: Renders the sidebar webview and checks that controls have names in default, onboarding and settings states.
- `apps/extension/__tests__/side-panel-a11y.test.ts`: Source checks for named composer controls, keyboard-native menu items, tab and tabpanel pairing, roving tabindex.
- `apps/mobile/__tests__/modal-accessibility-semantics.test.ts`: Every Modal sets accessibilityViewIsModal except a named pending list.
- `apps/mobile/__tests__/MessageBubbleAccessibility.test.tsx`: Native message bubble accessibility structure and action controls.
- `apps/web/features/chat/components/dialogs/__tests__/GlobalSearchDialog.a11y.test.tsx`: Accessibility of the web global search dialog.
- `apps/web/features/chat/components/Voice/__tests__/VoiceComposer.a11y.test.tsx`: Accessibility of the web voice composer.
- `apps/web/shared/components/accessibility/SkipLinks.test.tsx`: The skip link.
- `apps/web/e2e/auth-accessibility.spec.ts`: Accessibility of the sign-in screens in a browser.
- `apps/desktop/e2e/accessibility-audit.spec.ts`: Desktop audit against WCAG 2.1 A and AA.
- `apps/desktop/wdio/specs/accessibility.spec.ts`: Real keyboard navigation and ARIA on the desktop app, including the composer accessible name.
- apps/web/reports/a11y-report.json (not found) (not found): A recorded automated scan (generated 2026-09-10) of 5 public pages in light and dark with 0 violations; it does not cover signed-in chat.

**Test scenarios**

- **Approval card by screen reader (web)**
  1. Sign in to web, start a task that asks for tool approval.
  2. Turn on VoiceOver or NVDA.
  3. Tab to the approval card.
  - Expected: Reader says 'Allow', 'Allow for this chat' and 'Deny' as buttons; the activity region says 'Approval needed'.
- **Heading jump**
  1. Open any conversation on web.
  2. Use the reader's next-heading key.
  - Expected: Focus lands on the conversation title (h1) first; no empty heading is spoken.
- **Mobile approval modal focus**
  1. On iOS with VoiceOver, trigger a tool approval that opens the approval modal.
  2. Swipe right repeatedly.
  - Expected: Only the modal content is reachable (today this is expected to fail because the flag is missing; record the result).
- **VS Code names**
  1. Open the sidebar, run the accessibleNames test or inspect with the accessibility tree.
  - Expected: Every button, menu and input has a non-empty name.
- **Chrome tabs**
  1. Open the side panel and use arrow keys on the tab list with a screen reader.
  - Expected: Each tab is named and controls a labelled tabpanel.

**Where to look when it fails**

- Browser accessibility tree (Chrome DevTools) for empty names.
- accessibleNames test failure output names the element (id and class).
- Playwright traces from apps/web/e2e and apps/desktop/e2e.
- Mobile: the pending list in modal-accessibility-semantics.test.ts.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/011-accessibility-and-localization-components.md](../../70-qa/test-plans/web/011-accessibility-and-localization-components.md)
- Desktop: [70-qa/test-plans/desktop/011-accessibility-and-localization-components.md](../../70-qa/test-plans/desktop/011-accessibility-and-localization-components.md)
- Mobile: [70-qa/test-plans/mobile/011-accessibility-and-localization-components.md](../../70-qa/test-plans/mobile/011-accessibility-and-localization-components.md)
- VS Code: [70-qa/test-plans/vscode/011-accessibility-and-localization-components.md](../../70-qa/test-plans/vscode/011-accessibility-and-localization-components.md)
- Chrome: [70-qa/test-plans/chrome/011-accessibility-and-localization-components.md](../../70-qa/test-plans/chrome/011-accessibility-and-localization-components.md)

## 10. Gaps and dependencies

- **Mobile ApprovalModal and four other modals do not hide the screen behind them from assistive tech.** Affects: Mobile users with VoiceOver or TalkBack, at tool approval time.. Evidence: apps/mobile/__tests__/modal-accessibility-semantics.test.ts:13-19. Work needed: Add accessibilityViewIsModal to the five files and empty the pending list.
- **No recorded accessibility scan of signed-in chat, settings or approvals on web, desktop or Chrome.** Affects: Web, Desktop, Chrome.. Evidence: apps/web/reports/a11y-report.json lists only Home, Sign in, Pricing, Features - Agents, Download; brief S11.01 unverified.. Work needed: Run and store an automated and manual sweep of signed-in states.
- **Announcement and label strings are English literals.** Affects: Non-English users on all apps.. Evidence: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:369-384; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:1043. Work needed: Route through the i18n catalogue and plural rules.
- **Brief code pointers for S11.01 and S11.09 are stale.** Affects: Auditors using the brief.. Evidence: apps/mobile/app/(app)/notifications/index.tsx:93 and webviewContent.ts:44 do not hold labels.. Work needed: Refresh the brief from the implementation map above.
- **Approval buttons in the shared ToolCallCard have no aria-label and a 24px height (h-6); their name is the visible text only.** Affects: Touch and screen-magnifier users on web and Desktop.. Evidence: packages/ui/unified-chat/src/components/ToolCallCard.tsx:412-436. Work needed: Check touch target size against the product's own target rule; unknown which rule applies.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- file:packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx
- file:packages/contracts/types/src/tool-approval-policy.ts
- SYS-shared-ui-and-design
- SYS-agents-tools-and-automation
- SYS-chat-turn-pipeline

## Unknown

- Whether web and Desktop controls outside the files I opened all have names: not verified.
- Which minimum touch target rule the product applies to approval buttons.
- Whether Desktop Tauri src (apps/desktop/src) is shipped to any user; AGENTS.md says it is internal.
- The CLI heading and label equivalent is not covered here.
