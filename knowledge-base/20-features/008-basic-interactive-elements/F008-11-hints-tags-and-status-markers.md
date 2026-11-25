---
id: "F008-11"
type: "feature"
title: "Hints, tags and status markers"
aliases: ["Tooltip", "Popover", "Hover card", "Citation preview", "Badge", "Tag", "Avatar", "Author label", "You said", "Assistant said", "S8.37 to S8.42"]
area: "8 Basic interactive elements"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S8.37", "S8.38", "S8.39", "S8.40", "S8.41", "S8.42"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-shared-ui-and-design", "SYS-chat-turn-pipeline", "file:packages/ui/unified-chat/src/components/markdown/CitationChip.tsx", "file:packages/ui/ui/src/primitives/Popover.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F008-11 Hints, tags and status markers

Small helpers that explain or label things: tooltips on hover or focus, popovers that open from a button, a preview card on citation chips, badges and tags, and a marker that says who wrote each message. Web and Chrome are most complete; the CLI uses glyph prefixes.

Area: [8. Basic interactive elements](README.md). Requirement items: [S8.37](../../10-requirements/capabilities/008-basic-interactive-elements.md#s837), [S8.38](../../10-requirements/capabilities/008-basic-interactive-elements.md#s838), [S8.39](../../10-requirements/capabilities/008-basic-interactive-elements.md#s839), [S8.40](../../10-requirements/capabilities/008-basic-interactive-elements.md#s840), [S8.41](../../10-requirements/capabilities/008-basic-interactive-elements.md#s841), [S8.42](../../10-requirements/capabilities/008-basic-interactive-elements.md#s842).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives short explanations, floating panels, status marks and author markers so the interface stays clean but understandable.

**Why it exists.** Icon-only controls need names, citations need a preview, and screen reader users need to know who wrote a message (doc: knowledge-base/data/area-briefs/008-basic-interactive-elements.md S8.37 to S8.42).

**Who uses it.** Everyone reading chat; assistive technology users especially.

**Problems it solves**

- Unclear icon buttons.
- Leaving the page to check a source.
- Not knowing which text is yours and which is the assistant's.

**Use cases**

- Hover a citation chip on web and read the source title and site.
- Open the web files menu popover from the composer.
- Read 'You said:' and 'Assistant said:' with a screen reader.
- See the CLI prefix '> ' for your lines and a star for the assistant.

## 2. User experience

**Where to find it**

- Web: citation chips in markdown answers (packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:125-190); files popover (apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:280-282); author headings in message bubbles (apps/web/features/chat/components/messages/MessageBubble.tsx:2588-2590).
- Desktop: Electron shows hosted web (doc: AGENTS.md section 5).
- Mobile: bubble label 'Your message: ...' or role label (apps/mobile/src/features/chat/components/MessageBubble.tsx:2217-2221); project badges on the Projects tab (brief: projects.tsx:312).
- CLI: line prefixes '> ' user, a star assistant, a diamond teammate, an info mark system (apps/cli/src/tui/tui_app.rs:2880-2899); effort picker overlay (apps/cli/src/tui/widgets/effort_picker.rs).
- VS Code: author label 'You said:' via prependAuthor (webviewContent.ts:4934,5771); title attributes such as 'Attach or use tools' on the plus button (webviewContent.ts:3356).
- Chrome: title copied from aria-label on badges (apps/extension/src/side_panel.ts:12867); in-page launcher tooltip (apps/extension/src/features/content/in-page-panel/launcher.ts:54); attach menu items with role menuitem.

**Before you start**

- Hover cards need a message with citations.

**Screens and controls**

- Web citation chip: link pill with favicon, site name and '+N' for extra sources (CitationChip.tsx:155-172).
- Web preview: floating card above the chip listing each source (CitationChip.tsx:174-188).
- Shared Badge: pill with default, secondary, destructive and outline looks (packages/ui/ui/src/primitives/Badge.tsx:7-24).
- Shared Avatar: image with fallback (packages/ui/ui/src/primitives/Avatar.tsx).

**Journey**

1. Hover or focus a control or chip.
2. The tooltip or preview appears after a short delay (delay 150 ms in markdown content, MarkdownContent.tsx:938).
3. Move away or press Escape to hide.
4. Click a popover trigger; press Escape or click outside to close.

**What the person sees and gets**

- Preview card lists source titles; the chip aria-label lists source numbers and sites (CitationChip.tsx:128-140).
- Mobile announces 'Your message: <first 100 characters>' (MessageBubble.tsx:2219).

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Shared Tooltip, Popover, Badge and Avatar primitives exist (packages/ui/ui/src/primitives/Tooltip.tsx, Popover.tsx, Badge.tsx, Avatar.tsx).
- Popover content scrolls inside the available height and keeps a collision margin (Popover.tsx:35-41).
- Web mounts a tooltip provider in the app shell (apps/web/shared/components/layout/WebAppShell.tsx).
- Web author markers are screen-reader-only headings 'You said:' and 'Assistant said:' (MessageBubble.tsx:2588-2590; unified-chat MessageBubble.tsx:733,793).
- Citation chip preview is implemented with the Tooltip primitive (CitationChip.tsx:150-188).
- Mobile bubbles carry author in an accessibility label (MessageBubble.tsx:2217-2221).
- VS Code prepends an author label (webviewContent.ts:5771).
- CLI shows a distinct prefix per role (tui_app.rs:2880-2899).

**Incomplete**

- The brief's 'hover card' is built on a tooltip, not a dedicated hover card primitive (CitationChip.tsx:150).
- Badge renders a plain div with no status role (Badge.tsx:28-30); status meaning relies on the caller.
- Mobile and CLI tooltips and mobile popovers: no status in the brief and none searched deeply.
- Author markers: no visible avatar image on web; the marker is hidden text, so sighted users rely on bubble position [inferred from sr-only class at MessageBubble.tsx:2588].

**Present but disconnected or switched off**

- nothing found

**Not available**

- Hover cards on VS Code and Chrome (brief missing).
- Tags and badges on Chrome: brief says unverified; not checked here (unknown).

## 4. Required behaviour

**Established requirements**

- Tooltips show on hover and focus for controls. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S8.37)
- Popovers open from a trigger and dismiss on Escape or outside click. (source: S8.38 in the same brief)
- Hover cards show a rich preview of a link, mention or citation. (source: S8.39 in the same brief)
- Badges show a count or status; tags categorise and are distinct from status badges. (source: S8.40 and S8.41 in the same brief)
- Message authors are distinguished visually and for assistive technology. (source: S8.42 in the same brief)

**Acceptance criteria**

1. On web, hovering a citation chip shows a card listing its sources and moving away hides it.
2. On web, keyboard-focusing a citation chip also shows the card [inferred from Tooltip behaviour; check].
3. Pressing Escape closes the web files popover and focus returns to the trigger.
4. A screen reader reads 'You said:' before the user's message on web and VS Code.
5. On mobile, a message bubble reads 'Your message: ...'.
6. In the CLI, user and assistant lines start with different prefixes.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Badges that show status should expose that status as text, not colour alone [inferred from the contrast rules in the brief].
- Tooltips must not be the only place a control's name appears [inferred from S8.04 in the same brief].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a dedicated hover card primitive, or rename the feature to 'citation preview'.
- [proposed] Show a visible author marker on web as well as the hidden text.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Tooltip primitives | `packages/ui/ui/src/primitives/Tooltip.tsx` | Tooltip wrapper |
| component | Popover primitives | `packages/ui/ui/src/primitives/Popover.tsx` | Popover wrapper |
| component | Badge | `packages/ui/ui/src/primitives/Badge.tsx` | Badge variants |
| component | Avatar | `packages/ui/ui/src/primitives/Avatar.tsx` | Avatar and fallback |
| component | CitationChip | `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | Citation chip with preview card |
| component | MarkdownContent | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Mounts tooltip provider for chips (line 938) |
| component | ComposerFilesMenu | `apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx` | Popover from the plus control |
| component | MessageBubble (web) | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Author headings, icon actions |
| component | MessageBubble (shared) | `packages/ui/unified-chat/src/components/MessageBubble.tsx` | Shared bubble with author headings |
| component | MessageBubble (mobile) | `apps/mobile/src/features/chat/components/MessageBubble.tsx` | Bubble accessibility label |
| component | CLI transcript renderer | `apps/cli/src/tui/tui_app.rs` | Role prefixes |
| component | CLI effort picker | `apps/cli/src/tui/widgets/effort_picker.rs` | Floating overlay |
| component | VS Code webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | title attributes, popup menus, author label |
| component | Chrome launcher tooltip | `apps/extension/src/features/content/in-page-panel/launcher.ts` | agi-tooltip styling |
| test | Avatar.test | `packages/ui/ui/src/primitives/__tests__/Avatar.test.tsx` | Avatar primitive |
| test | accessibleNames.webview.test | `apps/extension-vscode/src/__tests__/accessibleNames.webview.test.ts` | VS Code accessible names |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Pointer or focus events open the floating element from local state. | device | CitationChip.tsx:150-188 |
| Citation data (title, URL, site) is read from the message already loaded; no new request was found. | device | CitationChip.tsx:125-140 reads items from props |
| The favicon image may load from an outside site. | outside service | CitationFavicon used at CitationChip.tsx:162; the source host of the icon was not opened (unknown) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Open or hover state | Component memory | No | Discarded |

**Models and providers.** Citations come from answers that used search; which model or provider produced them is outside this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None found for the controls. |
| Permissions | None found. |
| Subscription | None found. Badges can display plan or model text, supplied by other features. |
| Limits and metering | None found. |
| Feature flags | None found. |
| Model compatibility | Citations exist only when the answer has sources. |
| Provider restrictions | None found. |
| Local mode | Controls run on the device in Local mode; a favicon fetch would use the network [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Broken favicon | Fallback globe icon | CitationChip.tsx:66 |
| Touch device with no hover | Chip is a link; hover preview not available by touch; behaviour: not established | CitationChip.tsx:145 |
| Many sources | '+N' count on the chip | CitationChip.tsx:171 |
| Escape | Popover closes through its primitive; checked by library behaviour [inferred] | Popover.tsx |
| Offline | Not handled in the code | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/ui/src/primitives/__tests__/Avatar.test.tsx`: Avatar primitive
- `apps/extension-vscode/src/__tests__/accessibleNames.webview.test.ts`: Accessible names in the VS Code webview
- `apps/mobile/__tests__/BadgeTwoWordLabel.test.tsx`: Mobile badge labels
- `apps/web/features/chat/components/messages/MessageBubble.test.tsx`: Web message bubble

**Test scenarios**

- **Citation preview**
  1. Open an answer with citations on web.
  2. Hover a chip.
  - Expected: Card lists source titles and sites.
- **Popover dismissal**
  1. Open the composer plus menu.
  2. Press Escape, then reopen and click outside.
  - Expected: Closes both times.
- **Screen reader author**
  1. Use a screen reader on a web chat.
  - Expected: 'You said:' and 'Assistant said:' are read before each message.
- **Mobile author**
  1. Turn on a screen reader on mobile and focus a message.
  - Expected: 'Your message: ...' is read.
- **CLI prefixes**
  1. Send a prompt in the CLI.
  - Expected: Your line starts '> ' and the reply starts with a star.
- **Chrome badge title**
  1. Hover a badge in the side panel.
  - Expected: Title text equals its aria-label.

**Where to look when it fails**

- No logs. Inspect the accessibility tree in the browser.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/008-basic-interactive-elements.md](../../70-qa/test-plans/web/008-basic-interactive-elements.md)
- Desktop: [70-qa/test-plans/desktop/008-basic-interactive-elements.md](../../70-qa/test-plans/desktop/008-basic-interactive-elements.md)
- Mobile: [70-qa/test-plans/mobile/008-basic-interactive-elements.md](../../70-qa/test-plans/mobile/008-basic-interactive-elements.md)
- CLI: [70-qa/test-plans/cli/008-basic-interactive-elements.md](../../70-qa/test-plans/cli/008-basic-interactive-elements.md)
- VS Code: [70-qa/test-plans/vscode/008-basic-interactive-elements.md](../../70-qa/test-plans/vscode/008-basic-interactive-elements.md)
- Chrome: [70-qa/test-plans/chrome/008-basic-interactive-elements.md](../../70-qa/test-plans/chrome/008-basic-interactive-elements.md)

## 10. Gaps and dependencies

- **No dedicated hover card; preview is a tooltip.** Affects: Web. Evidence: CitationChip.tsx:150. Work needed: Decide if rich hover card behaviour (keeps open on hover) is wanted.
- **Web author marker is invisible text only.** Affects: Sighted users. Evidence: MessageBubble.tsx:2588. Work needed: Optional visible marker.
- **Mobile, CLI tooltip and mobile popover status unknown.** Affects: Mobile, CLI. Evidence: brief has no status. Work needed: Verify or mark n/a.
- **Chrome badges and tags unverified.** Affects: Chrome. Evidence: brief. Work needed: Check and record.
- **Badge has no status semantics.** Affects: Screen reader users. Evidence: Badge.tsx:28-30. Work needed: Callers must add text or role.

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline
- file:packages/ui/unified-chat/src/components/markdown/CitationChip.tsx
- file:packages/ui/ui/src/primitives/Popover.tsx

## Unknown

- Where the favicon is fetched from.
- Whether Radix tooltip opens on keyboard focus in this build (library behaviour, not run).
- Chrome author marker implementation.
- Mobile and CLI tooltip support.
- Which web files hold the tags the brief cites (line references stale).
