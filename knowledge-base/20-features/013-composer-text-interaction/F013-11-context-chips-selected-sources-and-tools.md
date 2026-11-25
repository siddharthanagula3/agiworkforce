---
id: "F013-11"
type: "feature"
title: "Context chips, selected sources and tools"
aliases: ["Context chips", "Selected sources", "Tool chips", "Active options", "Skill chip", "Attachment chips", "Queued message tool label"]
area: "13 Composer text interaction"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "built", chrome: "partial"}
verification: {web: "partly seen (1 of 3)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S13.31", "S13.32", "S13.33"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "F013-09", "F013-10", "F013-12", "SYS-shared-ui-and-design", "SYS-chat-turn-pipeline"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F013-11 Context chips, selected sources and tools

Small labelled items near the composer show what the next message will carry: skill, project or folder, connector context, attachments, and active tools. Web shows tools as one 'Active options' pill plus a count on the + button; Mobile shows Research and Run code chips. Not every chip has an x.

Area: [13. Composer text interaction](README.md). Requirement items: [S13.31](../../10-requirements/capabilities/013-composer-text-interaction.md#s1331), [S13.32](../../10-requirements/capabilities/013-composer-text-interaction.md#s1332), [S13.33](../../10-requirements/capabilities/013-composer-text-interaction.md#s1333).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 3) |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Makes attached context and switched-on tools visible and removable before sending, and labels a queued follow-up with its own tools.

**Why it exists.** People should see exactly what a message will include (brief S13.31 to S13.33).

**Who uses it.** Everyone composing a message on any app.

**Problems it solves**

- Sending with a forgotten tool on
- Not knowing which skill or project is active
- Queued messages carrying hidden options

**Use cases**

- Pick a skill and see '/name' with an x.
- Turn on Deep Research and see 'Deep Research' in the pill.
- Queue a follow-up and see its tool label.
- Mobile: see 'Run code' chip when code is on.

## 2. User experience

**Where to find it**

- Web and Desktop: above the input (skill, connector context, folder chips) and in the footer (Active options pill, + button count) (ChatComposerNew.tsx:5155-5210,6230-6247).
- Mobile: skill chip, media mode chip, tool status chips and queued rows (ChatInput.tsx:1703,1699,1806,1851).
- VS Code: chips for project context, 'Browse the web for current sources', next effort and attachments (webviewContent.ts:3300-3336).
- Chrome: skill chip and page chips in the attachment strip (side_panel.ts:10510).
- CLI: attachment chip line for staged images and generated images (tui_app.rs:3122-3135).

**Before you start**

- The thing must be chosen first: skill, tool, project, file.

**Screens and controls**

- Web skill chip button 'Remove NAME skill'; connector context button 'Remove selected connector context'; folder chip 'Clear working folder'; project chip 'Clear project or folder selection' (ChatComposerNew.tsx:5163,5190,5214,7080).
- Web pill 'Active options: ...' with '+N' (ChatComposerNew.tsx:6233); + button label 'Add attachments and tools: N active' (ChatComposerNew.tsx:5968).
- Queued list 'Queued messages' rows with Edit, Cancel, and a tools label (ChatComposerNew.tsx:5010-5057).
- Mobile 'Clear selected Skill' button (ChatInput.tsx:1722).

**Journey**

1. Pick a skill, tool, project, folder or file from the menus or @.
2. A chip or pill appears near the box.
3. Remove with the x on a chip, or turn the tool off in the + menu for tool pills.
4. Send; what shows is what is sent.

**What the person sees and gets**

- Send preview summary lists tool names such as Web search, Deep Research, Run code, Extended thinking, Skill (WebChatPage.tsx:1921-1937).
- Queued row shows '· Web search' style label (ChatComposerNew.tsx:5025).

**Settings**

- none found for chips themselves.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web skill, connector context, working folder and project chips with removal buttons (ChatComposerNew.tsx:5155-5230).
- Web activeToolLabels drive the queued label and the preview so they match (ChatComposerNew.tsx:3406-3430).
- Web Active options pill and + count from the explicit options (ChatComposerNew.tsx:4850-4872).
- Mobile skill chip with clear button, tool status chips for Research and Run code (ChatInput.tsx:585-612,1703-1750,1806-1845).
- Mobile attachment strip and queued follow-ups.
- VS Code chips with remove buttons (webviewContent.ts:3300-3336).
- Chrome skill chip with remove (side_panel.ts:10510-10535) and page chips.
- CLI chip line for staged images (tui_app.rs:3270-3280).

**Incomplete**

- Web has two lists: Active options (skill, research, code, office) and activeToolLabels (adds Work, Web search, thinking, connector items), so the pill and the queued label can differ; the code comment says search and thinking are not + menu settings (ChatComposerNew.tsx:4840-4849).
- Web and Mobile tool indicators are not removable by an x on the chip itself; removal is in the + menu or by toggle (Mobile chips have no button: ChatInput.tsx:1817-1842).
- CLI only shows image chips; no skill or tool chips (tui_app.rs:3270-3285).
- Chrome has no tool chips (brief S13.33).

**Present but disconnected or switched off**

- none found

**Not available**

- Selected-source chips in the CLI; tool chips in CLI and Chrome (brief).

## 4. Required behaviour

**Established requirements**

- Context attached to the next message (skill, project, folder, files, page) shows as removable chips. (source: brief S13.31)
- Sources chosen for the next message (web search, connector resources, a page) show as chips before sending. (source: brief S13.32)
- Tools switched on for the next message (research, code, office files) show as chips near the composer. (source: brief S13.33)

**Acceptance criteria**

1. Choose a skill; a chip appears; click its x; the skill is not in the send.
2. Turn on Deep Research and Run code; the Active options pill names the first and shows +1.
3. Queue a message with web search on; its row shows the label.
4. Select a connector resource; the resource chip shows and its x clears it.
5. Mobile: with Research on, a 'Research' chip is visible and screen readers read 'Deep Research active'.
6. CLI: stage an image; the chip row appears and can be dropped.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The pill and the queued label should list the same tools; they come from different arrays today [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Use one list for the pill, the queued label and the preview.
- [proposed] Give tool chips their own x on Web and Mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatComposerNew chips | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Skill, connector, folder, project chips; Active options pill; queued list. |
| component | AttachmentPreview | `apps/web/features/chat/components/Composer/AttachmentPreview.tsx` | Attachment chips with Remove. |
| component | WebChatPage send preview | `apps/web/features/chat/pages/WebChatPage.tsx` | sendPreviewToolNames and presentation. |
| store | composer toggles in chat store | `apps/web/shared/stores/web-chat-store.ts` | Per-conversation tool toggles and selected skill. |
| component | mobile ChatInput chips | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Skill, media mode, tool and queued chips. |
| component | mobile MediaModeChip | `apps/mobile/src/features/chat/components/MediaModeChip.tsx` | Image or video mode chip with exit. |
| component | mobile AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Sets tools and reads the skill selection store. |
| component | VS Code chips | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | attachment-chip elements for context. |
| component | Chrome attachment preview | `apps/extension/src/side_panel.ts` | renderSkillChip and page chips. |
| component | CLI chips | `apps/cli/src/tui/tui_app.rs` | attachment_chip_line and generated_chip_line. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Choices set composer toggles or attachments in local state. | device | ChatComposerNew.tsx:3381-3395 |
| Chips render from that state. | device | ChatComposerNew.tsx:5155-5230 |
| On send the same toggles and attachments go into the chat request. | device and our servers | WebChatPage.tsx:1921-1937 |
| Mobile skill name is sent only in Cloud mode. | device and our servers | apps/mobile/app/(app)/(tabs)/chat.tsx:541 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Selected skill, tool toggles | conversation toggles in the web chat store; mobile skill selection store | No evidence of sync (unknown) | Cleared on send for the skill on Chrome (side_panel.ts:8873) |

**Models and providers.** Whether a tool chip can appear depends on model caps and plan (mobile researchActive at ChatInput.tsx:570-584). Chips do not call a model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Mobile tool chips need a signed-in Cloud chat (ChatInput.tsx:570). |
| Permissions | Mobile chips need granted capabilities canUseDeepResearch and canUseCloudExecution (ChatInput.tsx:576,584). |
| Subscription | Tool availability follows plan capability; chips merely reflect it. |
| Limits and metering | none found in the code for chips. |
| Feature flags | Mobile FEATURES.research and FEATURES.codeExecution (ChatInput.tsx:571,578). |
| Model compatibility | Requires model capability research, search, codeExecution for mobile chips. |
| Provider restrictions | none found in the code |
| Local mode | Mobile tool chips are not shown outside signed-in Cloud chat. Web chips work for any mode; on-device models restrict attachments. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Recording or transcribing (mobile) | Chips hide. | ChatInput.tsx:1699,1806 |
| Image or video mode | A mode pill with exit replaces attachments for generation. | ChatComposerNew.tsx:6262 |
| Many options | Pill shows the first label and +N. | ChatComposerNew.tsx:6243 |
| Accessibility | Pill is role status with the full list; count badge is text not colour only. | ChatComposerNew.tsx:5985 |
| Disabled composer | + button disabled and dimmed. | ChatComposerNew.tsx:5957 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ComposerPlusMenu.test.tsx`: + menu rows (titles not read).
- `apps/web/features/chat/components/Composer/ChatComposerNew.followUpQueue.test.tsx`: Queued follow-ups (titles not read).
- `apps/mobile/src/features/chat/components/__tests__/ChatInput.skillMention.test.tsx`: Skill chip set after choosing a skill.
- `apps/web/features/chat/components/Composer/AttachmentPreview.test.tsx`: Attachment chips (titles not read).

**Test scenarios**

- **Skill chip**
  1. Choose a skill.
  2. Remove it with x.
  3. Send.
  - Expected: Send has no skill.
- **Tool pill**
  1. Turn on Deep Research and Run code in + menu.
  - Expected: Pill shows the first and +1; + shows 2.
- **Queued label**
  1. Start a reply, queue a message with web search on.
  - Expected: Queued row shows the tool label.
- **Mobile chips**
  1. Cloud chat with research-capable model, turn on Research.
  - Expected: Research chip shows.
- **CLI image chip**
  1. /attach an image.
  - Expected: A chip row appears above the text.

**Where to look when it fails**

- No log lines; inspect composer toggle state in the chat store.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/013-composer-text-interaction.md](../../70-qa/test-plans/web/013-composer-text-interaction.md)
- Desktop: [70-qa/test-plans/desktop/013-composer-text-interaction.md](../../70-qa/test-plans/desktop/013-composer-text-interaction.md)
- Mobile: [70-qa/test-plans/mobile/013-composer-text-interaction.md](../../70-qa/test-plans/mobile/013-composer-text-interaction.md)
- CLI: [70-qa/test-plans/cli/013-composer-text-interaction.md](../../70-qa/test-plans/cli/013-composer-text-interaction.md)
- VS Code: [70-qa/test-plans/vscode/013-composer-text-interaction.md](../../70-qa/test-plans/vscode/013-composer-text-interaction.md)
- Chrome: [70-qa/test-plans/chrome/013-composer-text-interaction.md](../../70-qa/test-plans/chrome/013-composer-text-interaction.md)

## 10. Gaps and dependencies

- **Two different tool lists on Web: pill and queued label can disagree.** Affects: Web, Desktop. Evidence: ChatComposerNew.tsx:3406 versus 4850. Work needed: Share one derived list.
- **Tool indicators have no per-chip remove control.** Affects: Web, Mobile. Evidence: ChatComposerNew.tsx:6230; ChatInput.tsx:1817. Work needed: Add x or decide against.
- **CLI shows no skill, source or tool chips; Chrome shows no tool chips.** Affects: CLI, Chrome. Evidence: tui_app.rs:3122-3135; brief S13.33. Work needed: Add compact status text.
- **Web Work mode and web search appear in the queued label but not in the pill.** Affects: Web. Evidence: ChatComposerNew.tsx:3408-3411. Work needed: Align.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- F013-09
- F013-10
- F013-12
- SYS-shared-ui-and-design
- SYS-chat-turn-pipeline

## Unknown

- Whether web composer toggles persist per conversation or reset on reload.
- Whether VS Code shows tool chips beyond the ones listed.
- Where the mobile skill selection store file lives (not opened).
