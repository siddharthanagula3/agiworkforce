---
id: "F008-09"
type: "feature"
title: "Tabs, accordions and disclosure"
aliases: ["Tabs", "Tablist", "Accordion", "Disclosure", "Collapsible", "Show or hide details", "Thinking process toggle", "S8.31", "S8.32", "S8.33"]
area: "8 Basic interactive elements"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S8.31", "S8.32", "S8.33"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-shared-ui-and-design", "file:packages/ui/ui/src/primitives/Tabs.tsx", "file:packages/ui/ui/src/primitives/Collapsible.tsx", "file:packages/ui/ui/src/primitives/useTablistKeyboard.ts"]
basis: "code inspection"
second_reader: "11 of 13 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F008-09 Tabs, accordions and disclosure

Tabs switch panels, accordions open and close stacked sections, and disclosure toggles show one block of detail. Web, mobile and Chrome have tab lists; web and mobile expose expanded state on toggles. The CLI uses a tab strip in two screens and Ctrl-O to expand tool output.

Area: [8. Basic interactive elements](README.md). Requirement items: [S8.31](../../10-requirements/capabilities/008-basic-interactive-elements.md#s831), [S8.32](../../10-requirements/capabilities/008-basic-interactive-elements.md#s832), [S8.33](../../10-requirements/capabilities/008-basic-interactive-elements.md#s833).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Organises dense content: tabs for views (Sources, Report and Library), expandable steps in a plan, and Show or Hide for thinking text and tool detail.

**Why it exists.** Chat output can be long. Collapsing detail keeps the conversation readable and the state must reach assistive technology (doc: knowledge-base/data/area-briefs/008-basic-interactive-elements.md S8.31 to S8.33).

**Who uses it.** Every user reading answers, research and agent steps.

**Problems it solves**

- Walls of detail in the transcript.
- Screen reader users not knowing whether a section is open.
- Keyboard users unable to move between tabs.

**Use cases**

- Switch between Sources, Report and Library in the web research panel.
- Expand a plan step in the web StepsCard.
- Open 'Thinking process' under an answer.
- Switch plugin tabs in the CLI with Left and Right.

## 2. User experience

**Where to find it**

- Web: research panel tablist 'Research views' with three tabs, Sources, Report and Library (apps/web/features/chat/components/research/ResearchPanel.tsx:403-440; the Library tab starts at about line 438); steps list with expandable rows (apps/web/features/chat/components/cards/StepsCard.tsx:186-260); button 'Toggle thinking process visibility' (apps/web/features/chat/components/messages/MessageBubble.tsx:3478-3490).
- Desktop: public Electron window shows hosted web (doc: AGENTS.md section 5); retained Tauri code has its own tab pieces such as apps/desktop/src/ui/Tabs.tsx and role=tablist in apps/desktop/src/features/agi/AgentTaskPanel.tsx:73.
- Mobile: project tabs with role tab (apps/mobile/app/(app)/projects/[id].tsx:245-275); agent activity steps (AgentActivityTimeline.tsx:417-422); 'Show fewer sources' toggle (in AgentActivityTimeline.tsx and research/ResearchSourcesAppendix.tsx, not CollapsibleSources.tsx).
- CLI: plugin tabs Discover, Installed, Marketplaces, Errors with Left and Right (apps/cli/src/tui/widgets/screen_renderers.rs:590-663); agents tabs Agents, Running, Library (screen_renderers.rs:275-292); Ctrl-O expands or collapses tool output (apps/cli/src/tui/tui_app.rs:4056-4066).
- VS Code: tablist 'Session source' with Local and Cloud (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3036-3038); toggles with aria-expanded.
- Chrome: tablist 'AGI views' (apps/extension/src/side_panel.ts:13489-13496).

**Before you start**

- Some content to show: thinking steps exist only when the message has thinking steps (MessageBubble.tsx:3476).

**Screens and controls**

- Web tab buttons role=tab with aria-selected inside role=tablist (ResearchPanel.tsx:403-413).
- Web step toggle: button with aria-expanded inside a Radix collapsible (StepsCard.tsx:229-236).
- Mobile tabs: role tab with selected state (projects/[id].tsx:258-261).
- CLI tab strip: active tab shown in brackets on the agents screen (screen_renderers.rs:275-292).

**Journey**

1. See the tab row or the toggle.
2. Click or press a key to switch or expand.
3. Content for that tab or block appears; the control's selected or expanded state changes.
4. Click again to collapse.

**What the person sees and gets**

- Chevron icons flip between right and down (StepsCard.tsx:243-249; MessageBubble.tsx:3484-3488).
- Mobile hint reads 'Shows the details of this step' or 'Hides the details of this step' (AgentActivityTimeline.tsx:419-421).
- CLI status notice 'showing full tool output, Ctrl-O to collapse' (tui_app.rs:4060).

**Settings**

- None found for tabs and disclosure; web reduced motion or density settings were not checked.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web research tabs set role tab and aria-selected (ResearchPanel.tsx:403-413).
- Shared Tabs primitive wraps Radix tabs (packages/ui/ui/src/primitives/Tabs.tsx:1-63) and is used in several web screens, for example ArtifactPreview.tsx and AgentEditorPage.tsx.
- Shared useTablistKeyboard hook gives ArrowLeft/Right/Up/Down, Home and End (packages/ui/ui/src/primitives/useTablistKeyboard.ts:5-56). The shared Radix Tabs and this separate hook give arrow keys through different routes (Tabs.tsx:3-6 and useTablistKeyboard.ts:5-56) [source: review of F008-09].
- Web StepsCard uses a collapsible with aria-expanded (StepsCard.tsx:229-236) and a progress label '% complete' (line 177).
- Web thinking toggle has aria-expanded (MessageBubble.tsx:3481).
- Mobile steps toggle exposes expanded state (AgentActivityTimeline.tsx:422); CollapsibleSources.tsx does not expose expanded state (no accessibilityState or expanded in the file).
- Mobile project tabs set accessibilityState selected (apps/mobile/app/(app)/projects/[id].tsx:245-275).
- CLI tabs move with Right/Tab and Left/Shift-Tab (screen_renderers.rs:658-665).
- Chrome and VS Code expose a tablist role (side_panel.ts:13489; webviewContent.ts:3036).

**Incomplete**

- Web ResearchPanel tabs set aria-selected but the file does not use the arrow-key hook or tab panels (ResearchPanel.tsx has no ArrowRight or useTablistKeyboard match), so keyboard moves rely on Tab. The hook is used only in marketing CodeTabs among the apps searched (apps/web/features/marketing/components/system/CodeTabs.tsx).
- Mobile project tabs have no keyboard or arrow handling (apps/mobile/app/(app)/projects/[id].tsx:245-275) [source: review of F008-09].
- VS Code session toggle: whether arrow keys work was not checked.
- No accordion primitive exists; accordion behaviour is built from the Collapsible primitive per screen (packages/ui/ui/src/primitives/Collapsible.tsx:1-9).

**Present but disconnected or switched off**

- nothing found

**Not available**

- Accordion in the CLI, VS Code and Chrome: brief says missing and no accordion was found in the files read.

## 4. Required behaviour

**Established requirements**

- Tabs are a tablist switching panels with the selected tab exposed. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.31)
- An accordion is a stack of sections that expand and collapse, each with a labelled header. (source: S8.32 in the same brief)
- A disclosure control toggles one block of detail and exposes its expanded state. (source: S8.33 in the same brief)

**Acceptance criteria**

1. On web, the research panel exposes a tablist named 'Research views' with tabs Sources, Report and Library, and the active tab has aria-selected true.
2. With focus on a shared Tabs tab (Radix, Tabs.tsx:3-6), Right Arrow moves to the next tab and Home moves to the first; the separate useTablistKeyboard hook gives the same keys to hand-built tablists.
3. On web, the Thinking process button reports aria-expanded false then true after a click.
4. On mobile, an agent step with details announces expanded or collapsed.
5. In the CLI plugin screen, Right changes tab and Left goes back, wrapping at the ends.
6. In the CLI, Ctrl-O toggles full tool output and shows a status notice.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Tab lists should support arrow keys everywhere (WAI-ARIA pattern) [inferred; the shared hook exists for it].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Use useTablistKeyboard in ResearchPanel and other hand-built tablists.
- [proposed] Decide if a shared Accordion primitive is wanted or keep Collapsible and mark accordion n/a on CLI, VS Code, Chrome.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Tabs primitives | `packages/ui/ui/src/primitives/Tabs.tsx` | Radix tab wrappers |
| hook | useTablistKeyboard | `packages/ui/ui/src/primitives/useTablistKeyboard.ts` | Arrow, Home, End movement |
| component | Collapsible primitives | `packages/ui/ui/src/primitives/Collapsible.tsx` | Radix collapsible re-export |
| component | ResearchPanel | `apps/web/features/chat/components/research/ResearchPanel.tsx` | Sources, Report and Library tabs |
| component | StepsCard | `apps/web/features/chat/components/cards/StepsCard.tsx` | Expandable steps |
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Thinking toggle and long-message toggle |
| component | SettingsModal | `packages/ui/ui/src/settings-modal/SettingsModal.tsx` | Shared tablist at line 1212 |
| component | Desktop Tabs | `apps/desktop/src/ui/Tabs.tsx` | Retained Tauri tab component |
| screen | Mobile project screen tabs | `apps/mobile/app/(app)/projects/[id].tsx` | Tabs with selected state |
| component | AgentActivityTimeline | `apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx` | Expandable steps and 'Show fewer sources' toggle |
| component | CollapsibleSources | `apps/mobile/src/features/chat/components/CollapsibleSources.tsx` | Collapsible sources list; does not expose expanded state |
| component | ResearchSourcesAppendix (mobile) | `apps/mobile/src/features/chat/components/research/ResearchSourcesAppendix.tsx` | 'Show fewer sources' toggle |
| component | CLI plugin tabs | `apps/cli/src/tui/widgets/screen_renderers.rs` | PluginTabsView and agents tab strip |
| service | CLI Ctrl-O toggle | `apps/cli/src/tui/tui_app.rs` | EXPAND_TOOL_OUTPUT flag |
| component | VS Code webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Session source tablist and aria-expanded toggles |
| component | Chrome side panel tab bar | `apps/extension/src/side_panel.ts` | sp-tab-bar tablist |
| test | useTablistKeyboard.test | `packages/ui/ui/src/primitives/__tests__/useTablistKeyboard.test.tsx` | Arrow key contract |
| test | tablist-keyboard-contract.test | `apps/web/features/marketing/components/__tests__/tablist-keyboard-contract.test.ts` | Marketing tablist keyboard |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person clicks or presses a key on a tab or toggle. | device | ResearchPanel.tsx:407; StepsCard.tsx:229 |
| Local component state flips (selected tab or open flag) and the view re-renders. | device | MessageBubble.tsx:3477 (showThinking state); ResearchPanel.tsx:407 setTab |
| CLI toggles a process-wide flag and redraws. | device | tui_app.rs:4058 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Selected tab and open state | Component memory only; persistence was not found | No | Lost when the view closes [inferred] |

**Models and providers.** None. Thinking text shown by the toggle comes from a model's reasoning output, but the toggle itself does not call a model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found in the code for tabs, accordions and disclosure. |
| Permissions | None found. |
| Subscription | None found. |
| Limits and metering | None found. |
| Feature flags | None found. |
| Model compatibility | Thinking disclosure appears only when the message has thinking steps (MessageBubble.tsx:3476). |
| Provider restrictions | None found. |
| Local mode | Works fully on the device in Local mode; no network is involved. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No details | Mobile step has no button role when there are no details; web chevron hidden | AgentActivityTimeline.tsx:417; StepsCard.tsx:241 |
| Keyboard use of tabs | Shared hook handles arrows; hand-built web research tabs do not; mobile project tabs have no keyboard handling | useTablistKeyboard.ts; ResearchPanel.tsx; apps/mobile/app/(app)/projects/[id].tsx:245-275 |
| Wrap-around | CLI and the hook wrap from last to first | screen_renderers.rs:629-637; useTablistKeyboard.ts:44 |
| Loading, empty, error, offline | Not handled in these controls | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/ui/src/primitives/__tests__/useTablistKeyboard.test.tsx`: Arrow, Home and End movement
- `apps/web/features/marketing/components/__tests__/tablist-keyboard-contract.test.ts`: Marketing tablist uses the hook
- `apps/web/features/chat/components/messages/MessageBubble.test.tsx`: Web message bubble (exact toggle checks not opened)
- `apps/web/features/chat/components/messages/ToolTimeline.test.tsx`: Tool timeline (content not opened)

**Test scenarios**

- **Research tabs**
  1. Open a research answer on web.
  2. Click Report, then Sources, then Library.
  - Expected: aria-selected moves with the click.
- **Keyboard tabs**
  1. Focus a shared Tabs trigger.
  2. Press Right, Home, End.
  - Expected: Focus and selection follow.
- **Thinking toggle**
  1. Find an answer with thinking steps.
  2. Activate the toggle twice.
  - Expected: aria-expanded true then false and content shows then hides.
- **Mobile step**
  1. Open an agent run.
  2. Tap a step with details.
  - Expected: Details show and the hint changes to Hides.
- **CLI tabs**
  1. Open the plugin screen.
  2. Press Right four times.
  - Expected: Tabs cycle and return to Discover.
- **CLI Ctrl-O**
  1. Run a tool.
  2. Press Ctrl-O.
  - Expected: Full output and a notice for two seconds.

**Where to look when it fails**

- No logs; inspect aria attributes in browser tools; CLI snapshot tests live in apps/cli/src/tui/widgets/snapshots.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/008-basic-interactive-elements.md](../../70-qa/test-plans/web/008-basic-interactive-elements.md)
- Desktop: [70-qa/test-plans/desktop/008-basic-interactive-elements.md](../../70-qa/test-plans/desktop/008-basic-interactive-elements.md)
- Mobile: [70-qa/test-plans/mobile/008-basic-interactive-elements.md](../../70-qa/test-plans/mobile/008-basic-interactive-elements.md)
- CLI: [70-qa/test-plans/cli/008-basic-interactive-elements.md](../../70-qa/test-plans/cli/008-basic-interactive-elements.md)
- VS Code: [70-qa/test-plans/vscode/008-basic-interactive-elements.md](../../70-qa/test-plans/vscode/008-basic-interactive-elements.md)
- Chrome: [70-qa/test-plans/chrome/008-basic-interactive-elements.md](../../70-qa/test-plans/chrome/008-basic-interactive-elements.md)

## 10. Gaps and dependencies

- **Web research tabs lack arrow-key handling and tab panels.** Affects: Web keyboard and screen reader users. Evidence: ResearchPanel.tsx:403-440. Work needed: Adopt useTablistKeyboard and add role tabpanel with aria-controls.
- **Brief marks accordion missing on CLI, VS Code and Chrome and lists CLI tabs and disclosure as done; the CLI tab and disclosure code exists but not an accordion.** Affects: CLI, VS Code, Chrome. Evidence: S8.32; screen_renderers.rs; tui_app.rs:4056. Work needed: Decide if accordion applies there.
- **Brief line references stale (for example tui_app.rs:2605).** Affects: Documentation. Evidence: brief S8.33. Work needed: Refresh.
- **Open or selected state is not remembered.** Affects: All apps. Evidence: state is local to components. Work needed: Only if product wants persistence [proposed].

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-shared-ui-and-design
- file:packages/ui/ui/src/primitives/Tabs.tsx
- file:packages/ui/ui/src/primitives/Collapsible.tsx
- file:packages/ui/ui/src/primitives/useTablistKeyboard.ts

## Unknown

- Whether VS Code and Chrome tab lists handle arrow keys.
- Whether any accordion exists in VS Code or Chrome beyond the searches done.
- Which retained desktop components ship.
- Exact assertions inside the MessageBubble and ToolTimeline tests.

## Second reader's check

A second reader checked 13 statements of this page against the code: 11 correct, 2 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Wrong (section 2/3):** "Mobile 'Show fewer sources' toggle and sources toggle expose expanded state (CollapsibleSources.tsx:693-695, :695)" The code shows: CollapsibleSources.tsx has 287 lines, so lines 693-695 do not exist. The file has no 'Show fewer' text, no 'expanded' and no accessibilityState. The string 'Show fewer sources' is in AgentActivityTimeline.tsx and research/ResearchSourcesAppendix.tsx. (apps/mobile/src/features/chat/components/CollapsibleSources.tsx (287 lines; grep for fewer/expanded/accessibilityState finds nothing)). **Corrected:** The 'Show fewer sources' toggle is in AgentActivityTimeline.tsx and research/ResearchSourcesAppendix.tsx. CollapsibleSources.tsx does not expose expanded state.
- **Partly wrong (section 2/3):** "Web research panel tablist 'Research views' has tabs Sources and Report (ResearchPanel.tsx:403-440)" The code shows: The tablist labelled 'Research views' has three tabs: sources, report and library. The third tab starts at about line 438. The tabs set role=tab and aria-selected as stated. (apps/web/features/chat/components/research/ResearchPanel.tsx:403-440). **Corrected:** The 'Research views' tablist has three tabs: Sources, Report and Library.

**Facts the page missed**

- ResearchPanel has a third tab, Library (apps/web/features/chat/components/research/ResearchPanel.tsx:~438), that the page leaves out of its description, test scenario and acceptance criteria.
- Mobile project tabs set accessibilityState selected, but apps/mobile/app/(app)/projects/[id].tsx:245-275 has no keyboard or arrow handling. Mobile 'Show fewer sources' is in AgentActivityTimeline.tsx and research/ResearchSourcesAppendix.tsx, not CollapsibleSources.tsx.
- Shared Radix Tabs and the separate useTablistKeyboard hook give arrow keys through different routes (packages/ui/ui/src/primitives/Tabs.tsx:3-6 and useTablistKeyboard.ts:5-56). The page conflates them in criterion 2.
