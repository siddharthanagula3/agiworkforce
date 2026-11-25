---
id: "F013-10"
type: "feature"
title: "@ mentions of projects, files, folders, apps, tabs and agents"
aliases: ["@ mentions", "Mention menu", "Mention suggestions", "@file", "@agent", "Add context by @", "Tabs and projects (Chrome)"]
area: "13 Composer text interaction"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S13.24", "S13.25", "S13.26", "S13.27", "S13.28", "S13.29", "S13.30"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-connectors-plugins-and-skills", "SYS-agents-tools-and-automation", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F013-10 @ mentions of projects, files, folders, apps, tabs and agents

Typing @ points a message at something. Web and Desktop list skills, projects, connected apps, local folders (desktop host only) and library files. CLI takes @path for files and folders, @agent-name and @server:uri. VS Code searches files. Chrome offers tabs and projects. Mobile offers skills and library files in Cloud.

Area: [13. Composer text interaction](README.md). Requirement items: [S13.24](../../10-requirements/capabilities/013-composer-text-interaction.md#s1324), [S13.25](../../10-requirements/capabilities/013-composer-text-interaction.md#s1325), [S13.26](../../10-requirements/capabilities/013-composer-text-interaction.md#s1326), [S13.27](../../10-requirements/capabilities/013-composer-text-interaction.md#s1327), [S13.28](../../10-requirements/capabilities/013-composer-text-interaction.md#s1328), [S13.29](../../10-requirements/capabilities/013-composer-text-interaction.md#s1329), [S13.30](../../10-requirements/capabilities/013-composer-text-interaction.md#s1330).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person name context inline: a skill, project, connector, folder, file, tab or agent, so the message carries it.

**Why it exists.** Naming context in place is faster than menus and matches ChatGPT and Claude (brief S13.24 to S13.30).

**Who uses it.** Chat users everywhere; developers in CLI and VS Code.

**Problems it solves**

- Attaching the right file or project quickly
- Pointing a turn at one connected app
- Reading a page in another tab

**Use cases**

- Web: type @rep and attach a library file.
- CLI: write 'explain @src/main.rs'.
- Chrome: type @ and choose a tab to include its page.
- CLI: '@agent-reviewer check this' runs that agent.

## 2. User experience

**Where to find it**

- Web and Desktop: type @ in the composer; menu labelled 'Mentions' with headings Skills, Projects, Connected apps, Local folders, Files (ChatComposerNew.tsx:5565).
- CLI: type @ at a word boundary to open the file picker (tui_app.rs:4129).
- VS Code: type @ then letters in the sidebar input (webviewContent.ts:8535); native chat panel mention @agi (apps/extension-vscode/package.json:891).
- Chrome: type @ in the side panel; headings Tabs and Projects (side_panel.ts:14376).
- Mobile: type @ in a signed-in Cloud chat; skill and file palettes (ChatInput.tsx:1554,1770,1785).
- Desktop tab choice: + menu 'Use the browser' dialog with 'Choose a tab' (BrowserToolsDialog.tsx:40).

**Before you start**

- Folder rows need the desktop host (ChatComposerNew.tsx:2933).
- Project rows need work mode Work or no Work mode and not image mode (ChatComposerNew.tsx:2911).
- Mobile and Chrome need a signed-in Cloud session (ChatInput.tsx:1554; side_panel.ts refreshMentionMenu checks managedCloudChatState ready).

**Screens and controls**

- Listbox rows with name and detail; arrows and Enter or Tab, or click (ChatComposerNew.tsx:4590-4608).
- Web caps: skills 12, projects 8, connected apps 6, folders 5 (ChatComposerNew.tsx:2899,2917,2929; use-mention-folders.ts:12).

**Journey**

1. Type @ and a few letters; the menu filters.
2. Choose a row; the @query text is removed from the message.
3. Skill sets the chip; project scopes the chat; connector is switched on and an @name reference is inserted; folder attaches its files; file attaches the library file.
4. Send; the chip or attachment travels with the message.

**What the person sees and gets**

- Folder: notice '{N} files in {folder} were not attached. Attach them from a local folder.' or '{folder} has no files this chat can read.' (ChatComposerNew.tsx:3077-3095).
- CLI: system lines 'Attached ...', '... was not inlined: reason' (tui_app.rs:4560-4572).
- Chrome: notices for site access refusal and draft changed during capture (side_panel.ts:14310-14330).

**Settings**

- CLI folder trust decides if file bytes are inlined (mentions.rs:315).
- Chrome asks a site read grant per tab (side_panel.ts:14312).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web order of rows is skills, projects, connected apps, folders, files (ChatComposerNew.tsx:2937-2951).
- Menu only owns Enter, Tab and arrows while it has rows, so an empty menu never swallows Enter (ChatComposerNew.tsx:4590-4594).
- Email addresses are not mentions (test title in ChatComposerNew.mentionMenu.test.tsx:120).
- Project mention calls the project picker and clears the folder (ChatComposerNew.tsx:3043-3050).
- Folder mention reads top level files of a workspace root up to the remaining attachment slots and reports left out and unreadable counts (use-mention-folders.ts:48-72).
- CLI: file and directory mentions inline text up to 256 KB, name larger files, send only the path for credential files and untrusted workspaces, route images and documents to attach, support line ranges (mentions.rs:28,315-433).
- CLI agent mention adds an instruction to run the named agent (mentions.rs:458; tui_app.rs:4573-4588).
- CLI @server:uri reads an MCP resource, up to 50,000 characters (agent/mod.rs:653,961-1001).
- VS Code file search from @ via the host (ChatStateManager.ts:1549).
- Chrome tabs and projects with read grant and page capture (side_panel.ts:14343-14470).
- Mobile skills and library files (SkillMentionPalette.tsx, FileMentionPalette.tsx).

**Incomplete**

- Web file mention attaches a Library file, not a workspace path (ChatComposerNew.tsx:3062-3071).
- Connector mention enables the connector toggle and writes @name text; whether the effect is for one message or the chat is not established (ChatComposerNew.tsx:3052-3060).
- Desktop tab choice is a dialog, not an @ menu row (BrowserToolsDialog.tsx:40).
- Agent mention in VS Code is the native chat participant, outside our composer (package.json:891).

**Present but disconnected or switched off**

- Folder arm on Web in a normal browser: hidden unless a desktop host exists (ChatComposerNew.tsx:2933).

**Not available**

- Repository mention on all apps (brief S13.28; no code found).
- Mobile project, folder, connected app, tab and agent mentions.
- Chrome file, folder, connector and agent mentions.
- VS Code project, folder, connector mentions.

## 4. Required behaviour

**Established requirements**

- Agent or assistant mention: address a message to an agent. (source: brief S13.24)
- Project mention scopes the message to a project. (source: brief S13.25)
- File mention includes the file's contents with the message. (source: brief S13.26)
- Folder mention makes the folder's contents available. (source: brief S13.27)
- Repository mention references a connected code repository. (source: brief S13.28)
- Browser-tab mention lets the user choose which tab. (source: brief S13.29)
- Connected-app mention references a connector or its resources inline. (source: brief S13.30)

**Acceptance criteria**

1. Web: type @ with no letters; rows appear in the stated order.
2. Web: with no match, Enter sends the message.
3. Web: choosing a project scopes the chat to it.
4. Desktop: choose a local folder; its files attach up to the limit and a notice names the rest.
5. CLI: '@README.md' inlines the file; a 300 KB file is named but not inlined.
6. CLI: an untrusted workspace sends only the path.
7. Chrome: choosing a tab asks for site access and adds a page chip.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief's repository mention could build on connectors; not designed in code [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add Mobile project and connector mentions.
- [proposed] Add a repository row backed by connected GitHub.
- [proposed] Show the connector mention's scope in the chip.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatComposerNew mention logic | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Items, selection handlers, menu, key handling. |
| service | matchMentionQuery | `packages/ui/unified-chat/src/lib/mentionQuery.ts` | Finds the @query before the caret. |
| other | mention editor extension | `packages/ui/unified-chat/src/composer-editor/extensions/mention.ts` | Editor arm trigger and commit. |
| hook | useMentionFolders | `apps/web/features/chat/hooks/use-mention-folders.ts` | Lists workspace roots and reads a folder for mention. |
| component | BrowserToolsDialog | `apps/web/features/desktop-host/components/BrowserToolsDialog.tsx` | Desktop tab chooser. |
| service | CLI mentions | `apps/cli/src/mentions.rs` | Candidates, ranking, expansion, agent mentions. |
| command | CLI mention popup | `apps/cli/src/tui/tui_app.rs` | open_mention_popup and resolve_composer_mentions. |
| service | CLI MCP resource mentions | `apps/cli/src/agent/mod.rs` | Parse and read @server:uri. |
| component | VS Code mention dropdown | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | detectMention and fileSearch request. |
| service | VS Code fileSearch | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Returns mention targets. |
| config | VS Code chat participant | `apps/extension-vscode/package.json` | Declares participant agi and its commands. |
| component | Chrome mention menu | `apps/extension/src/side_panel.ts` | Tabs and projects options, tab capture. |
| component | mobile FileMentionPalette | `apps/mobile/src/features/chat/components/FileMentionPalette.tsx` | Library files by search. |
| component | mobile SkillMentionPalette | `apps/mobile/src/features/skills/SkillMentionPalette.tsx` | Skills by search. |
| service | trailingMention | `apps/mobile/src/features/chat/utils/fileMention.ts` | Detects a trailing @query. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The caret text is matched to an @query and the menu opens. | device | mentionQuery.ts:8-17 |
| Library files and skills are fetched for the menu. | device and our servers | ChatComposerNew.tsx:2931 useLibraryFiles |
| Folder rows come from the desktop host's workspace roots and files are read locally. | device | use-mention-folders.ts:21-72 |
| CLI expands mentions into file context blocks before sending to the model. | device | mentions.rs:315; tui_app.rs:4544 |
| The chosen context travels with the chat request. | device and our servers | ChatComposerNew.tsx:3043-3071 |
| Chrome captures the tab page text locally after a site grant, then sends it with the message. | device and our servers | side_panel.ts:14318-14335 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Attached folder or library files | composer attachment list; uploaded on send | On send | Per attachment rules in F013-12 and files system page |
| Chrome page text snapshot | side panel memory (pendingBrowserContextTabs) | On send | Cleared after send [inferred] |

**Models and providers.** None choose the mention; the receiving model sees file text in the prompt. CLI privacy mode controls MCP resource reads (agent/mod.rs:967).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web library files and skills need sign-in; Mobile and Chrome mentions need a signed-in Cloud session. |
| Permissions | Chrome asks per-site read grant; CLI refuses paths outside the workspace and credential files (mentions.rs:330-360). |
| Subscription | none found in the code for mentions themselves; attachment limits per message apply (attachmentsPerMessage in ChatComposerNew.tsx:3077). |
| Limits and metering | Folder read limit is the remaining attachment slots; CLI 256 KB per file, 20000 candidates, 200 directory entries; MCP resource 50000 characters. |
| Feature flags | none found in the code |
| Model compatibility | attachmentsUnavailable disables file and folder rows for models or modes that cannot take attachments (ChatComposerNew.tsx:1582). |
| Provider restrictions | none found in the code |
| Local mode | CLI mentions work locally; the file bytes go to whatever model the session uses. Web folder reads are local before attach; with an on-device model attachments are blocked (localAttachmentConflict, ChatComposerNew.tsx:1595). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading skills…' row; files show loading state. | ChatComposerNew.tsx:5574 |
| Error | 'Skills are temporarily unavailable.' and a files error line. | ChatComposerNew.tsx:5577,5700 |
| Empty | 'No matching skills.' and 'No matching projects.'; empty menu does not swallow Enter. | ChatComposerNew.tsx:5580,4590 |
| Folder partially unreadable | Notice with counts. | ChatComposerNew.tsx:3077-3095 |
| Draft changed during Chrome tab capture | Notice and nothing attached. | side_panel.ts:14323 |
| Untrusted CLI workspace | Only the path is sent. | mentions.rs:344-350 |
| No workspace files | CLI status 'no workspace files to mention'. | tui_app.rs:4597 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ChatComposerNew.mentionMenu.test.tsx`: Enter commits the highlighted skill, arrows move, empty query sends, project scoping, emails not mentions, download cap notice.
- `packages/ui/unified-chat/src/composer-editor/__tests__/mention.test.ts`: Editor mention extension (titles not read).
- `apps/cli/src/mentions.rs`: In-file tests: ranking, parsing, inlining, untrusted workspace, workspace escape, oversize file, image routing.
- `apps/extension-vscode/src/__tests__/fileMention.webview.test.ts`: Line range kept, host-prefilled draft, picker not reopened after Escape.
- `apps/extension-vscode/src/__tests__/mentionSearch.test.ts`: Mention search (titles not read).
- `apps/mobile/src/features/chat/components/__tests__/FileMentionPalette.test.tsx`: Mobile file palette (titles not read).
- `apps/mobile/src/features/chat/components/__tests__/ChatInput.skillMention.test.tsx`: Skill list, chip set, Run code, bare @ lists all.

**Test scenarios**

- **Web menu order**
  1. Sign in on desktop host, type @.
  - Expected: Headings in order Skills, Projects, Connected apps, Local folders, Files.
- **Empty menu Enter**
  1. Type @zzzz with nothing matching, press Enter.
  - Expected: Message is sent.
- **CLI size cap**
  1. Mention a 300 KB text file.
  - Expected: Named, not inlined, with a 'larger than 256 KB' line.
- **Chrome tab**
  1. Open two tabs, type @ in the side panel, pick one.
  - Expected: Site access is requested then a page chip appears.
- **Mobile Local**
  1. In Local mode type @.
  - Expected: No palette (Cloud only).

**Where to look when it fails**

- CLI chat lines 'was not inlined: reason'.
- Chrome side panel notices spMentionAttachmentBusy, spMentionDraftChanged.
- Network errors from the library files request in the menu.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/013-composer-text-interaction.md](../../70-qa/test-plans/web/013-composer-text-interaction.md)
- Desktop: [70-qa/test-plans/desktop/013-composer-text-interaction.md](../../70-qa/test-plans/desktop/013-composer-text-interaction.md)
- Mobile: [70-qa/test-plans/mobile/013-composer-text-interaction.md](../../70-qa/test-plans/mobile/013-composer-text-interaction.md)
- CLI: [70-qa/test-plans/cli/013-composer-text-interaction.md](../../70-qa/test-plans/cli/013-composer-text-interaction.md)
- VS Code: [70-qa/test-plans/vscode/013-composer-text-interaction.md](../../70-qa/test-plans/vscode/013-composer-text-interaction.md)
- Chrome: [70-qa/test-plans/chrome/013-composer-text-interaction.md](../../70-qa/test-plans/chrome/013-composer-text-interaction.md)

## 10. Gaps and dependencies

- **Repository mention does not exist on any app.** Affects: All apps. Evidence: brief S13.28. Work needed: Design and build a repository row from connected GitHub.
- **Mobile has no project, folder, connector, tab or agent mention.** Affects: Mobile. Evidence: ChatInput.tsx:1770-1795 skill and file only. Work needed: Add or decide to leave out.
- **Web agent mention is missing; only CLI and the VS Code native panel have one.** Affects: Web, Desktop, Mobile, Chrome. Evidence: brief S13.24. Work needed: Define agents as mention targets.
- **Desktop browser tab is a dialog, not an inline mention.** Affects: Desktop. Evidence: BrowserToolsDialog.tsx:40-45. Work needed: Add a tab row to the mention menu if wanted.
- **Brief says Mobile file mention is missing; code has library files and skills.** Affects: Documentation. Evidence: ChatInput.tsx:1785. Work needed: Correct brief S13.26.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-connectors-plugins-and-skills
- SYS-agents-tools-and-automation
- SYS-execution-boundaries

## Unknown

- Whether the connector mention applies to one message or the whole chat.
- Exact CLI key (Enter or Tab) that accepts a mention.
- Whether the desktop Tauri build, retained internally, has its own mention code (not read).
- What the VS Code dropdown does for folders.
