---
id: "F012-05"
type: "feature"
title: "Search, research, agentic and coding entries"
aliases: ["Search entry", "Deep Research", "Work mode", "Agentic entry", "Coding entry", "Code", "Web search"]
area: "12 New-chat experience"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S12.10", "S12.11", "S12.15", "S12.16"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F012-05 Search, research, agentic and coding entries

Switches the next message into web search, deep research, multi-step Work, or a coding session. Web: /search, plus-menu 'Deep Research', the Chat | Work switch, and a sidebar Code entry that opens /code. Mobile has Web search and Deep research toggles and Work. CLI, VS Code and Chrome cover parts.

Area: [12. New-chat experience](README.md). Requirement items: [S12.10](../../10-requirements/capabilities/012-new-chat-experience.md#s1210), [S12.11](../../10-requirements/capabilities/012-new-chat-experience.md#s1211), [S12.15](../../10-requirements/capabilities/012-new-chat-experience.md#s1215), [S12.16](../../10-requirements/capabilities/012-new-chat-experience.md#s1216).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Sets the composer to use web search, deep research, Work (agentic) or opens the coding surface.

**Why it exists.** Heavier modes cost more and need explicit choice; the leaders offer them from the composer (brief S12.10, S12.11, S12.15, S12.16).

**Who uses it.** People needing sourced answers, long research, multi-step tasks, or code work.

**Problems it solves**

- Getting current information.
- Running multi-step tasks with tools.
- Starting code work in a repository.

**Use cases**

- Type /search latest AI news on web.
- Turn on Deep Research in the plus menu before a question.
- Switch to Work and describe a multi-step task.
- Click Code in the sidebar to open the cloud coding page.

## 2. User experience

**Where to find it**

- Web and Desktop (Electron): plus menu row 'Deep Research' (ComposerPlusMenu.tsx:187,1305-1312); '/search' (slashCommands.ts:31-37); Chat | Work segment; sidebar 'Code' button (Sidebar.tsx:515,612) opening /code (WebChatPage.tsx handleSidebarOpenCode; apps/web/app/code/page.tsx).
- Mobile: Add to chat toggles 'Web search' and 'Deep research' (AddToChatSheet.tsx:1225,1235), Work through handleTapWorkMode (chat.tsx:941).
- CLI: agent turns by default; plan mode via /plan; no research entry found.
- VS Code: Action sheet; coding is the product. Search setup: webSearchSetup flow (ChatStateManager.ts:2360-2460).
- Chrome: in-page and side panel browser task tools (side_panel.ts:8249); no search or research entry found.

**Before you start**

- Deep Research: billing policy loaded, plan allows, capability decision allows, model supports it (ChatComposerNew.tsx:1621-1627,6095-6107).
- Mobile Deep research: cloud mode, model flagged research and search, canUseDeepResearch (AddToChatSheet.tsx:230-235).
- Mobile Web search: cloud mode, canUseWebSearch, Auto model or a model with search or generic search backend (AddToChatSheet.tsx:238-249).

**Screens and controls**

- Plus menu toggle 'Deep Research' with a title explaining why disabled: 'Upgrade to use Deep Research', 'Checking your plan…', or "Deep Research isn't available for this model. Choose Auto or a model that supports Deep Research."
- Mobile toggle rows with on/off accessibility labels.
- Work segment as in F012-04.
- Sidebar 'Code' rail button and a Home/Code switch (Sidebar.tsx:612-635).

**Journey**

1. Open a new chat.
2. Choose the entry (slash, plus menu toggle, Work segment, sidebar Code).
3. Type the message.
4. Send; the turn runs with the mode.
5. Leave the mode by toggling off or switching back to Chat.

**What the person sees and gets**

- Toggle state shown in the menu; tools label list on queued follow-ups (ChatComposerNew.tsx:3408).
- Disabled reasons as hover titles.
- /code page for coding.

**Settings**

- Web Chat/Work default in general settings.
- Mobile feature toggles stored in the chat store.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web /search sets webSearchEnabled and marks searchRequested, or hands over to Auto (ChatComposerNew.tsx:3190-3207).
- Web Deep Research toggle with entitlement and model gating (ChatComposerNew.tsx:1621-1627,6095-6111).
- Free-trial sessions force research off (ChatComposerNew.tsx:2212-2214).
- Web Work mode with entitlement guard, deep link /agi-work sets initial work mode (apps/web/app/chat/page.tsx:12-17; WebChatPage.tsx:1329-1340).
- Web sidebar Code opens CloudCodePage (Sidebar.tsx:515; code/page.tsx:2-11).
- Mobile Web search and Deep research toggles and Work switch (AddToChatSheet.tsx:1225-1240; chat.tsx:941-947; chat.tsx:402-405 reverts Work if not unlocked).

**Incomplete**

- Deep link ?mode=agiwork does nothing alone: parseNewChatEntry returns null without a draft or a source (new-chat-entry.ts:75); only the /agi-work path passes the mode.
- CLI: coding entry is the CLI itself; agentic is default; research missing (no research command found in the files searched).
- VS Code: search needs a setup flow when no provider is configured (ChatStateManager.ts:2360-2460); research missing.
- Mobile coding entry not found in chat.tsx (grep for coding returned nothing).

**Present but disconnected or switched off**

- Mobile rows behind FEATURES.research, FEATURES.webSearch flags (AddToChatSheet.tsx:231,239).

**Not available**

- Chrome search and research entries (brief: missing).
- CLI research (brief: missing).

## 4. Required behaviour

**Established requirements**

- The user can explicitly start a web search for the next message. (source: brief S12.10)
- The user can switch on deep research for the next message. (source: brief S12.11)
- The user can start agentic multi-step work rather than a plain chat. (source: brief S12.15)
- The user can start a repository-aware coding session from the new-chat surface. (source: brief S12.16)
- Search, web research and code availability depend on a provider route or AGI harness, not the model alone. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. Web /search with a search-capable model turns web search on and sends.
2. Web Deep Research row is disabled with a reason on a model without support.
3. A free-trial web session cannot keep Deep Research on.
4. Clicking Code opens /code.
5. Mobile Local mode shows neither Web search nor Deep research.
6. Signed-out mobile tap on Work starts sign-in rather than switching.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Plan limits for research probably come from the capability decision, not constants [inferred from ChatComposerNew.tsx:1621].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a Deep Research entry to CLI and Chrome, or record the deviation.
- [proposed] Make ?mode=agiwork alone a valid deep link.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Research gate, /search handling, Work mode. |
| component | ComposerPlusMenu research row | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | MenuToggleRow 'Deep Research'. |
| config | slash commands | `packages/ui/unified-chat/src/lib/slashCommands.ts` | /search definition. |
| screen | /chat route | `apps/web/app/chat/page.tsx` | Initial Work mode from path. |
| screen | /code route | `apps/web/app/code/page.tsx` | Renders CloudCodePage. |
| component | CloudCodePage | `apps/web/features/code/CloudCodePage.tsx` | Managed coding page. |
| component | Sidebar Code entry | `packages/ui/ui/src/sidebar/Sidebar.tsx` | Rail button and Home/Code switch. |
| hook | useNewChatEntry | `apps/web/features/chat/hooks/use-new-chat.ts` | Applies deep-link work mode. |
| service | new-chat-entry | `apps/web/features/chat/lib/new-chat-entry.ts` | Link parsing. |
| component | AddToChatSheet toggles | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Web search and Deep research rows. |
| screen | Mobile chat tab | `apps/mobile/app/(app)/(tabs)/chat.tsx` | Work mode tap and revert. |
| command | CLI plan mode | `apps/cli/src/tui/tui_app.rs` | /plan and mode descriptions. |
| service | VS Code web search setup | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Search provider setup flow. |
| component | Chrome browser task tool | `apps/extension/src/side_panel.ts` | runBrowserTaskTool for agentic page work. |
| test | NewChatDeepLink test | `apps/web/app/chat/__tests__/NewChatDeepLink.test.tsx` | Work path deep link. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Choosing the mode sets composer toggles on the device. | device | ChatComposerNew.tsx:1112; 3190-3207 |
| On send, the web page passes the toggles to the chat send path, which calls our chat service; search and research run on the server route or a provider tool. | our servers | ChatComposerNew.tsx:4545 workMode in send; pipeline in SYS-chat-turn-pipeline (not traced) |
| Opening /code loads the managed coding page, which runs tasks in a managed environment. | our servers | apps/web/app/code/page.tsx:5-6 description 'isolated managed environment' |
| CLI agent runs tools on the device; the model call goes to the chosen provider (which provider depends on the access mode). | device | tui_app.rs mode descriptions 5429-5441 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Composer toggles | Web chat store (memory) | No | Cleared with the composer |
| Research and Work results | Conversation messages and metadata | Through the account | unknown |

**Models and providers.** Research needs a model flagged for research and search on Mobile (AddToChatSheet.tsx:230-235); Auto handles search on web when a generic search backend is configured (ChatComposerNew.tsx:1615,3190).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; free-trial sessions have no research or Work. |
| Permissions | Capabilities canUseDeepResearch, canUseWebSearch, canUseAgiWork. |
| Subscription | Deep research shows 'Upgrade to use Deep Research' for plans without it (ChatComposerNew.tsx:6096-6097). Plan names not read. |
| Limits and metering | none found at the entry; usage block objects are passed to the composer (WebChatPage.tsx:7713 usageBlock) but not traced. |
| Feature flags | Mobile FEATURES.research, FEATURES.webSearch; web capability decisions. |
| Model compatibility | Search and research depend on model capability flags and Auto. |
| Provider restrictions | Search needs a configured search backend or native search. |
| Local mode | Mobile Local hides search and research. Web and Desktop Electron chat have no Local mode (apps/desktop/electron/config.ts:8). CLI Local runs on device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Plan not ready | Row disabled with 'Checking your plan…'. | ChatComposerNew.tsx:6098-6099 |
| Model unsupported | Row disabled with explanation. | ChatComposerNew.tsx:6102-6103 |
| Work lost entitlement | Mode reverts to chat. | ChatComposerNew.tsx:3913; chat.tsx:402-405 |
| Offline / timeout / retry | not handled in the entry code read. | not found |
| Accessibility | Mobile rows carry on/off labels. | AddToChatSheet.tsx:1641 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/chat/__tests__/NewChatDeepLink.test.tsx`: Work path opens Work; lookalike path does not.
- `apps/web/features/chat/lib/new-chat-entry.test.ts`: Deep link parsing (body not opened).
- `apps/web/features/chat/hooks/useNewChat.test.tsx`: Applying the entry once (body not opened).
- `apps/web/features/chat/components/Composer/ComposerPlusMenu.test.tsx`: Plus menu rows (body not opened).
- `apps/web/features/chat/components/Composer/ChatComposerNew.chatSlashCommands.test.tsx`: Slash commands in composer (body not opened).

**Test scenarios**

- **Search**
  1. Choose Auto or a search-capable model.
  2. Type /search news; Enter.
  - Expected: Message sent with search on.
- **Research gated**
  1. Free-trial session; open plus menu.
  - Expected: Deep Research disabled or off.
- **Work path**
  1. Open /agi-work signed in with entitlement.
  - Expected: Composer in Work mode.
- **Code**
  1. Click Code in the sidebar.
  - Expected: /code page loads.
- **Mobile Local**
  1. Switch to Local; open Add to chat.
  - Expected: No Web search or Deep research rows.

**Where to look when it fails**

- Capability denial text from describeCapabilityDenial.
- Web: network errors from the chat send call.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/012-new-chat-experience.md](../../70-qa/test-plans/web/012-new-chat-experience.md)
- Desktop: [70-qa/test-plans/desktop/012-new-chat-experience.md](../../70-qa/test-plans/desktop/012-new-chat-experience.md)
- Mobile: [70-qa/test-plans/mobile/012-new-chat-experience.md](../../70-qa/test-plans/mobile/012-new-chat-experience.md)
- CLI: [70-qa/test-plans/cli/012-new-chat-experience.md](../../70-qa/test-plans/cli/012-new-chat-experience.md)
- VS Code: [70-qa/test-plans/vscode/012-new-chat-experience.md](../../70-qa/test-plans/vscode/012-new-chat-experience.md)
- Chrome: [70-qa/test-plans/chrome/012-new-chat-experience.md](../../70-qa/test-plans/chrome/012-new-chat-experience.md)

## 10. Gaps and dependencies

- **?mode=agiwork alone is ignored** Affects: Web, Desktop. Evidence: new-chat-entry.ts:75. Work needed: Return an entry when mode is set.
- **Research missing on CLI, VS Code, Chrome; search missing on Chrome** Affects: CLI, VS Code, Chrome. Evidence: brief S12.10-S12.11; no entry found in files read. Work needed: Implement or record deviation.
- **Mobile coding entry not found** Affects: Mobile. Evidence: grep in chat.tsx. Work needed: Verify elsewhere or record.
- **Brief line pointers stale** Affects: All. Evidence: ChatComposerNew.tsx:4562 etc. are unrelated now. Work needed: Regenerate brief.
- **Limits by plan not established** Affects: All. Evidence: no limits read. Work needed: Read the entitlement tables in SYS-subscriptions.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud

## Unknown

- Plan limits for research and Work.
- How the server executes search and research.
- Mobile coding entry.
- CLI research absence confirmed only by not finding a command.
- Whether Chrome has a search toggle in the side panel.
