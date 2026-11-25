---
id: "F013-09"
type: "feature"
title: "Slash commands, templates and skills"
aliases: ["Slash commands", "/ menu", "Command palette (mobile)", "Custom commands", "Prompt templates", "Saved prompts", "Prompt shortcuts", "Skill invocation", "Commands menu"]
area: "13 Composer text interaction"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "built", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S13.21", "S13.22", "S13.23"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-connectors-plugins-and-skills", "SYS-subscriptions-entitlements-and-usage", "SYS-model-catalog-and-routing", "api:GET /api/skills", "api:GET /api/settings/preferences"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F013-09 Slash commands, templates and skills

Typing / opens a filtered list of commands, your own saved prompt templates and skills. Web and Desktop have built-in tool commands plus Custom commands from Settings. CLI, VS Code and Chrome have their own lists. Mobile has four commands and no templates. A skill is chosen for the next message and shows as a chip.

Area: [13. Composer text interaction](README.md). Requirement items: [S13.21](../../10-requirements/capabilities/013-composer-text-interaction.md#s1321), [S13.22](../../10-requirements/capabilities/013-composer-text-interaction.md#s1322), [S13.23](../../10-requirements/capabilities/013-composer-text-interaction.md#s1323).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives a quick keyboard route to run a command, insert a saved template with the typed text filled in, or pick a skill for one message.

**Why it exists.** Power features such as search, think, code and reusable prompts need a fast route without menus (brief S13.21 to S13.23).

**Who uses it.** Everyone who types in a composer; developers in CLI and VS Code; people who reuse prompts.

**Problems it solves**

- Hunting through menus
- Retyping a standard prompt
- Not knowing which skills exist

**Use cases**

- Type /search latest news to force web search.
- Create /standup in Settings and reuse it with {{input}}.
- Choose a skill for one message and see its chip.
- In Chrome, /summarize the page.

## 2. User experience

**Where to find it**

- Web and Desktop: type / in the composer; menu titled 'Slash commands' with groups Commands, Your skills, plugin names, Skills (apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:300).
- Web and Desktop templates: Settings, General, 'Custom commands' with dialog 'New custom command' (apps/web/features/settings/sections/GeneralSection.tsx:333; CustomCommandsSettings.tsx:95).
- Web and Desktop skills: + menu row 'Skills' and the @ menu (ComposerPlusMenu.tsx:183).
- Mobile: type / for a palette of /image, /voice, /compare, /export (apps/mobile/src/features/chat/components/CommandPalette.tsx:15); skills via the add sheet and @ (AddToChatSheet.tsx:1328).
- CLI: press / on an empty composer to open the command popup (apps/cli/src/tui/tui_app.rs:10821).
- VS Code: the '/' button titled 'Commands' with a 'Filter actions…' box (webviewContent.ts:3357).
- Chrome: type / in the side panel; Skills row in the attach menu (side_panel.ts:15118).

**Before you start**

- Web slash menu opens only when the whole message is one /word with no space (ChatComposerNew.tsx:635).
- Skills need the skill list to load; own skills need an account.
- Mobile skill chip is for Cloud messages only (ChatInput.tsx:1706).

**Screens and controls**

- Slash list with name, description, example and icon; arrow keys, Enter or Tab choose, Escape closes (SlashCommandMenu.tsx:245-262).
- Status line under the box: '/search runs on send with: ...' or the reason the command is unavailable (ChatComposerNew.tsx:6989-7002).
- Skill chip '/name' with a 'Remove NAME skill' button (ChatComposerNew.tsx:5155-5166).
- Custom command form: name (2 to 32 lowercase letters, digits, hyphen), description, template with {{input}} (CustomCommandsSettings.tsx:25,95).

**Journey**

1. Type / in an empty box; the menu opens and filters as you type.
2. Use arrows and Enter or Tab, or click a row.
3. Built-in tool commands switch the tool on and leave your text; chat commands run or ask for an argument; custom commands replace the box with the template; skills set the chip and keep your text.
4. Add your own text after the command and send; the status line shows it runs on send.

**What the person sees and gets**

- Notices when a command cannot run: '/search needs a model that can search the web...' and similar (ChatComposerNew.tsx:3190-3235).
- A command that cannot run does not clear the input (ChatComposerNew.tsx:3354).

**Settings**

- Web and Desktop: Custom commands list, synced to the account under the preferences namespace custom_commands (apps/web/features/settings/lib/custom-commands-namespace.ts:3; CloudSettingsSync.tsx:171-176).
- CLI: markdown files in command folders (apps/cli/src/custom_commands.rs:1-8).
- Chrome: saved shortcuts become slash commands (apps/extension/src/features/side-panel/pageCommands.ts:67-100).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Desktop built-in commands /search /think /image /code, plus /browser /terminal /database when the platform capability exists (packages/ui/unified-chat/src/lib/slashCommands.ts:27-85).
- Web conversation commands /new /rename /archive /pin /share /model /status appear only when the host supplies the action (apps/web/features/chat/lib/chat-slash-commands.ts:26,66-80).
- Enter or Tab picks the highlighted row and the send path skips Enter while the menu is open (SlashCommandMenu.tsx:245; ChatComposerNew.tsx:4657).
- Custom commands: template with {{input}}, or the typed text appended (ChatComposerNew.tsx:3177-3186); name uniqueness among custom commands (web-settings-store.ts:28).
- Free-model hand-over: the command stays in the draft and applies on send (ChatComposerNew.tsx:3360-3368).
- Skill selection sets the chip and turns on tools the skill requires (ChatComposerNew.tsx:3381-3395).
- CLI registry merges built-ins, skills, prompts and custom markdown commands, user roots before project roots (tui_app.rs:718; custom_commands.rs:1-8).
- VS Code builds menu entries from CLI commands plus its own (surfaceMenu.ts:252).
- Chrome: six page commands plus saved prompt shortcuts, matched only without a space (pageCommands.ts:116-130); accepting inserts the command and a space, it does not send (side_panel.ts:14225).
- Chrome skill menu from the account's own skills with a chip (side_panel.ts:15118-15180).
- Mobile palette shows /image, /voice, /compare, /export filtered by availability (ChatInput.tsx:1553-1566).

**Incomplete**

- Custom command names are not checked against built-in commands, and custom commands are looked up first, so a custom 'search' would shadow the built-in [inferred] (ChatComposerNew.tsx:3177; CustomCommandsSettings.tsx:35-50).
- Mobile has no templates and its palette opens on any text starting with / even with spaces (ChatInput.tsx:1553).

**Present but disconnected or switched off**

- none found

**Not available**

- Mobile custom commands (templates).
- Chrome has no Settings list named Custom commands; its templates come from saved shortcuts, with the same {{input}} placeholder (pageCommands.ts:92).

## 4. Required behaviour

**Established requirements**

- The user can insert a saved prompt template (a custom command), filling in their own text. (source: brief S13.21)
- Typing / opens a filtered list of commands chosen by keyboard or pointer. (source: brief S13.22)
- The user can explicitly invoke a Skill so the next message runs with it. (source: brief S13.23)

**Acceptance criteria**

1. Type / in an empty web composer; the list opens; typing 'se' filters to /search.
2. Press Enter on a highlighted row; the message is not sent.
3. Type 'hello /search'; the menu does not open.
4. Create a custom command with {{input}}; picking it and typing text yields the filled template on send.
5. Choose a skill; a chip appears and removing it clears the skill from the send.
6. Pick /image on a plan without images; a reason is shown and the box keeps its text.
7. CLI: press / on an empty composer; the popup opens without a second slash.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A command that needs a plan feature should show the plan reason; the web does for /image through the plan hint (ChatComposerNew.tsx:3213-3220) [inferred acceptable].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Reject custom command names that equal a built-in command.
- [proposed] Bring templates to Mobile or state why not.
- [proposed] Make Mobile open its palette only for a bare /word like the web.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SlashCommandMenu | `apps/web/features/chat/components/Composer/SlashCommandMenu.tsx` | Builds and filters the grouped list; key handling. |
| component | ChatComposerNew slash logic | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Predicate, resolve, commit, pending status line, skill select. |
| config | BUILT_IN_SLASH_COMMANDS | `packages/ui/unified-chat/src/lib/slashCommands.ts` | Shared built-in command definitions and capability filter. |
| service | chat-slash-commands | `apps/web/features/chat/lib/chat-slash-commands.ts` | Conversation commands and /status lines. |
| component | CustomCommandsSettings | `apps/web/features/settings/components/CustomCommandsSettings.tsx` | Create, edit, delete templates. |
| store | web settings store customCommands | `apps/web/shared/stores/web-settings-store.ts` | Persisted custom commands (store name agiworkforce-web-settings). |
| service | custom-commands-namespace | `apps/web/features/settings/lib/custom-commands-namespace.ts` | Account sync shape and merge. |
| component | CloudSettingsSync | `apps/web/features/settings/components/CloudSettingsSync.tsx` | Sends and reads custom commands via /api/settings/preferences. |
| component | ComposerPlusMenu Skills | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | Skills submenu and Manage skills. |
| component | mobile CommandPalette | `apps/mobile/src/features/chat/components/CommandPalette.tsx` | Four mobile commands. |
| component | mobile AddToChatSheet skills | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Skill chooser row. |
| command | CLI custom commands | `apps/cli/src/custom_commands.rs` | Loads markdown commands from user and project folders. |
| command | CLI command registry | `apps/cli/src/command_registry.rs` | Merges built-ins, skills and prompts. |
| component | VS Code slash menu | `apps/extension-vscode/src/features/surfaces/surfaceMenu.ts` | slashMenuEntries. |
| component | Chrome pageCommands | `apps/extension/src/features/side-panel/pageCommands.ts` | Page slash commands and shortcut expansion. |
| service | Chrome skillsClient | `apps/extension/src/features/cloud-bridge/skillsClient.ts` | Fetches the account's own skills from /api/skills. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Typed text is tested by the slash predicate and the menu opens. | device | ChatComposerNew.tsx:2818-2825 |
| Installed plugin commands are loaded for the menu. | device and our servers | SlashCommandMenu.tsx:166 loadInstalledPlugins [inferred: source of the plugin list not read] |
| Selection resolves the command against model capability, plan and host; applies toggles or template text. | device | ChatComposerNew.tsx:3175-3300 |
| On send the resulting text and toggles go to the chat turn; the skill name goes with the request. | device and our servers | ChatComposerNew.tsx:3624-3650 |
| Custom commands sync to the account preferences. | device and our servers | CloudSettingsSync.tsx:171-176 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Custom commands (id, name, description, template) | browser settings store and account preferences namespace custom_commands | Yes | Until the user deletes them |
| CLI custom command files | markdown files in project and user command folders | No | User managed |
| Chrome saved shortcuts | chrome.storage.local key agi_saved_shortcuts | No | User managed, max 50 (shortcuts.ts:19) |

**Models and providers.** Commands change which tools are on; whether a model can search, think or run code is read from the catalog caps (ChatComposerNew.tsx:1643-1700). Template text is sent to the selected model like any message.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web slash needs none to type; skills and account sync need sign-in. Chrome skills need a token (skillsClient.ts:29). |
| Permissions | /browser, /terminal, /database depend on platform capabilities (slashCommands.ts:53-85). |
| Subscription | /image is unavailable with a plan hint when the plan lacks image generation (ChatComposerNew.tsx:3213-3220); Mobile /image checks the billing plan (ChatInput.tsx:1555-1560). |
| Limits and metering | Custom command name 2 to 32 characters (CustomCommandsSettings.tsx:25); Chrome shortcuts max 50; menu limits none found. |
| Feature flags | Mobile uses FEATURES.imageGen (ChatInput.tsx:1555). |
| Model compatibility | /search needs a search-capable model or Auto; /think needs a reasoning model; /code needs code-run capability (ChatComposerNew.tsx:3188-3250). |
| Provider restrictions | A free model that cannot use the requested tool gets 'This free model cannot use the requested tool. Choose Free Auto first.' (ChatComposerNew.tsx:704). |
| Local mode | Templates and the slash menu work offline. Tool commands depend on the selected model; Mobile marks /compare as a Cloud command (CommandPalette.tsx:59). CLI commands run locally. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty list | The menu closes when no suggestion matches and Enter then sends normally. | SlashCommandMenu.tsx:243-262,301 |
| Loading skills | Skill rows are simply absent until loaded; plugin load failure logs a warning. | SlashCommandMenu.tsx:167-173 |
| Unavailable command | Notice with reason, text kept. | ChatComposerNew.tsx:3351-3356 |
| IME composition | The menu ignores keys while composing. | ChatComposerNew.tsx:4582 |
| Duplicate name | Form refuses a taken name. | CustomCommandsSettings.tsx:47 |
| Accessibility | Menu has the label 'Slash commands'; mobile rows carry an accessibility label noting Cloud. | SlashCommandMenu.tsx:285; CommandPalette.tsx:76 |
| Offline or timeout | not handled in the code for the menu itself. | searched SlashCommandMenu.tsx; no network call except the plugin list load |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/SlashCommandMenu.test.tsx`: Opens on the popover layer, omits /image or /code when unavailable, ranks and groups skills, Commands heading first.
- `apps/web/features/chat/components/Composer/ChatComposerNew.chatSlashCommands.test.tsx`: Which conversation commands are listed, running with argument, notices, /model, /status.
- `apps/web/features/chat/commands/__tests__/slash-capability-filter.test.ts`: Desktop-only commands dropped on web and mobile.
- `apps/web/features/settings/components/CustomCommandsSettings.test.tsx`: Add, update, delete, refuse a taken name.
- `packages/ui/unified-chat/src/lib/__tests__/slashCommands.test.ts`: Shared command helpers (titles not read).
- `apps/mobile/__tests__/CommandPaletteBoundary.test.tsx`: /compare omitted without host action, tagged as Cloud.
- `apps/mobile/src/features/chat/components/__tests__/ChatInput.skillMention.test.tsx`: Skill chip set from @ mention; Run code switched on when needed.
- `apps/extension/__tests__/side-panel-slash-command-registry.test.ts`: Commands declared once, autocomplete from registry.
- `apps/cli/src/tui/tui_app.rs`: In-file tests: slash_key_opens_palette_without_inserting_duplicate_slash and others.

**Test scenarios**

- **Menu open and filter**
  1. Type / in an empty web composer.
  2. Type se.
  - Expected: List filters to /search; Escape closes it.
- **Enter does not send**
  1. Open the menu, press Enter.
  - Expected: The row applies; nothing is sent.
- **Template fill**
  1. Settings, Custom commands, add /ask with 'Explain {{input}}'.
  2. In chat type /ask then select, add text, send.
  - Expected: The message sent is the filled template.
- **Plan gate**
  1. On a plan without images, pick /image.
  - Expected: A reason shows and the text stays.
- **Skill chip**
  1. Open + then Skills, choose one.
  - Expected: A chip shows; removing it clears it; sending uses it.
- **Mobile palette**
  1. Type / in a Cloud chat on Mobile.
  - Expected: /image, /voice, /export listed; /compare tagged Cloud.

**Where to look when it fails**

- Console warning '[slash-commands] Installed plugin commands are unavailable'.
- Settings store key agiworkforce-web-settings in browser storage.
- PUT /api/settings/preferences failures.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/013-composer-text-interaction.md](../../70-qa/test-plans/web/013-composer-text-interaction.md)
- Desktop: [70-qa/test-plans/desktop/013-composer-text-interaction.md](../../70-qa/test-plans/desktop/013-composer-text-interaction.md)
- Mobile: [70-qa/test-plans/mobile/013-composer-text-interaction.md](../../70-qa/test-plans/mobile/013-composer-text-interaction.md)
- CLI: [70-qa/test-plans/cli/013-composer-text-interaction.md](../../70-qa/test-plans/cli/013-composer-text-interaction.md)
- VS Code: [70-qa/test-plans/vscode/013-composer-text-interaction.md](../../70-qa/test-plans/vscode/013-composer-text-interaction.md)
- Chrome: [70-qa/test-plans/chrome/013-composer-text-interaction.md](../../70-qa/test-plans/chrome/013-composer-text-interaction.md)

## 10. Gaps and dependencies

- **Mobile has no custom commands or templates.** Affects: Mobile. Evidence: CommandPalette.tsx:15-45 lists four fixed commands. Work needed: Add template insertion or document the decision.
- **A custom command can share a built-in name and takes priority.** Affects: Web, Desktop. Evidence: ChatComposerNew.tsx:3177; CustomCommandsSettings.tsx:35-50. Work needed: Block reserved names in the form.
- **Mobile palette opens for any text starting with a slash, even with spaces.** Affects: Mobile. Evidence: ChatInput.tsx:1553. Work needed: Match the web predicate.
- **Brief says Chrome lacks skill invocation; code has it.** Affects: Documentation. Evidence: side_panel.ts:15122-15180. Work needed: Update brief S13.23.
- **Brief says templates are done on VS Code and Chrome; the code shows VS Code takes commands from the CLI listing and Chrome from saved shortcuts, so it is only partly the same feature.** Affects: VS Code, Chrome. Evidence: surfaceMenu.ts:252-292; pageCommands.ts:67. Work needed: Verify in the apps.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-connectors-plugins-and-skills
- SYS-subscriptions-entitlements-and-usage
- SYS-model-catalog-and-routing
- api:GET /api/skills
- api:GET /api/settings/preferences

## Unknown

- Whether the CLI popup uses Enter or Tab to choose (not read).
- What value TEMPORARY_CHAT_LABEL has.
- Whether VS Code shows user templates beyond what the CLI lists.
- Whether plugin commands load from our servers or the device.
