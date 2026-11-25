---
id: "F040-09"
type: "feature"
title: "Custom output styles"
aliases: ["Custom output styles", "Custom Style", "Create Custom Style", "output-styles/*.md", "S40.27"]
area: "40 Instructions, preferences, and personal style"
available_on: ["web", "desktop", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "built", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S40.27"]
depends_on: ["F040-07", "F040-08", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "surface:web", "surface:desktop", "surface:cli", "surface:vscode", "table:user_settings"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F040-09 Custom output styles

A person creates, names, edits and deletes their own response style and picks it in chats. Web and Desktop keep styles in the composer menu and sync them to the account. The CLI keeps them as markdown files. VS Code can create and edit but not delete. Mobile and Chrome have none.

Area: [40. Instructions, preferences, and personal style](README.md). Requirement items: [S40.27](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4027).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Gives people styles beyond the five presets. Each style has a name and an instruction (and, on Web, a writing sample). The chosen style is added to the model request as an instruction.

**Why it exists.** Brief item S40.27: 'The user can create, name, edit and delete their own output style and use it in chats.'

**Who uses it.** Web and Desktop chat users; CLI users who keep style files; VS Code users who want a standing reply style.

**Problems it solves**

- Presets do not fit every person's needs.
- Re-typing the same style request in every chat.
- Keeping a style on all devices (Web) or in a file the person owns (CLI).

**Use cases**

- Create 'Plain English' with the instruction 'Avoid jargon' and use it in many chats.
- CLI: /output-style new review 'Lead with risks' then /output-style review.
- VS Code: Output style > New custom style for terse code explanations.

## 2. User experience

**Where to find it**

- Web and Desktop: composer Style button > section 'Custom Styles' > 'Create Custom Style' (StyleSelector.tsx:283-348).
- CLI: /output-style new <name> <instructions>, /output-style delete <name>, or add ~/.agiworkforce/output-styles/<name>.md (claude_parity.rs:1304-1327; output_styles.rs:107-122).
- VS Code: chat actions menu item 'Output style' opens a quick pick with 'New custom style…' and 'Edit a custom style…' (webviewContent.ts:2949-2952; outputStyles.ts:65-78).
- Mobile and Chrome: not available.

**Before you start**

- Web: name and instruction both filled (Save is disabled otherwise, StyleSelector.tsx:406).
- CLI: a name of letters, digits, '-' or '_' up to 40, not a built-in name and not 'new', 'create', 'delete' or 'remove' (output_styles.rs:194-219).
- VS Code: a name up to 60 characters and instructions up to 4000 characters (outputStyles.ts:24-25, 47-63).

**Screens and controls**

- Web: rows with a pencil (aria-label 'Edit <name>') and trash ('Delete <name>') buttons; form fields 'Name', 'Writing sample', 'Style instruction'; buttons 'Save'/'Save changes' and 'Cancel'.
- Web delete asks 'Delete "<name>"?' with button 'Delete style' and says it is removed from the account on every device and cannot be recovered.
- CLI: slash commands and markdown files with optional front matter name and description.
- VS Code: quick pick 'Output style' > list, 'New custom style…', 'Edit a custom style…'; input boxes for name and instructions.

**Journey**

1. Open the style menu or command.
2. Choose create.
3. Enter name and instruction (and sample on Web).
4. Save.
5. The style becomes active (Web, VS Code) or is created as a file and selected with /output-style <name> (CLI).
6. Use it in chats.
7. Edit it from the pencil, the edit pick or the file.
8. Delete it from the trash button (Web) or /output-style delete (CLI).

**What the person sees and gets**

- Web: new style appears in the list, is marked selected, and the Style button shows its name.
- CLI: 'Created output style <name> at <path>. Switch with /output-style <name>; edit the file to refine it.' and 'Deleted output style <name> (<path>).'
- VS Code: toast 'Output style: <label>'.
- Errors in the CLI come back as plain sentences, for example 'X is a built-in style; choose another name.'

**Settings**

- Web: Settings > Personalization 'Reset response style' resets the selection but keeps custom styles (style-store.ts:225-227).
- CLI: ui.output_style default (config.rs:136).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: add, update and delete custom styles, each followed by a debounced save to the account (style-store.ts:184-223, 300-317).
- Web: delete asks first with a consequence message (StyleSelector.tsx:121-136; AGENTS.md section 9 asks for this) .
- Web: changes made before the account copy is read are held and replayed, so nothing is lost or overwritten (style-store.ts:281-298; account-sync test).
- Web: create makes the style active (style-store.ts:195).
- Web: delete clears the active choice if it was in use (style-store.ts:218).
- CLI: create, list, delete, name rules, ambiguity checks (output_styles.rs:208-271).
- CLI: user file with the same name as a built-in replaces it in the list (output_styles.rs:110-121).
- CLI: the selected style is added to the system prompt after a '## Output style:' marker (agent/mod.rs:1828-1844).
- VS Code: create and edit custom styles, stored in extension global state, applied as a text input on each turn (outputStyles.ts:65-139; ChatStateManager.ts:5355).

**Incomplete**

- Web form does not check for duplicate names or limit field length (StyleSelector.tsx:161-176).
- CLI has no edit command; people edit the file by hand (claude_parity.rs:1309-1313 message).
- VS Code has no delete for custom styles in the code opened (outputStyles.ts:65-125).
- CLI delete removes the file at once with no Trash step (output_styles.rs:257-260), while AGENTS.md section 9 says removed files go to the Trash first.

**Present but disconnected or switched off**

- Web style menu is hidden in the code composer (CodeComposer.tsx:2158).
- The header comment in output_styles.rs says the active style is saved in ~/.agiworkforce/config.toml, but the TUI saves a plain selection to the project config (tui_app.rs:5748-5753; config.rs:1195-1198).

**Not available**

- Mobile: only five fixed styles (chatExecutionStore.ts:1189-1195).
- Chrome extension: no code found.
- Brief says VS Code is 'missing' for S40.27, but VS Code has create and edit (outputStyles.ts:73-74); delete is missing.

## 4. Required behaviour

**Established requirements**

- The user can create, name, edit and delete their own output style and use it in chats. (source: S40.27 (brief))
- Brief status: Web, Desktop, CLI done; Mobile, VS Code, Chrome missing. (source: S40.27 (brief))
- An action a user cannot undo asks first and names the consequence; a file an agent removes goes to the Trash first. (source: doc: AGENTS.md section 9)
- Custom styles are written to the user_settings namespace 'response-style' and cached locally. (source: doc: docs/decisions/wire-or-cut.md (row 'Styles and response length sync'))

**Acceptance criteria**

1. Create a style with name and instruction: it appears in the list and is active.
2. Edit its instruction: the next turn uses the new text and no second style is made.
3. Delete it with confirmation: it disappears on Web, and on a second signed-in browser after reload.
4. If it was active, the style returns to Default.
5. Save is disabled when the name or instruction is empty.
6. CLI: /output-style new 'x' fails with the built-in message; /output-style new mystyle Be brief creates a markdown file; /output-style delete mystyle removes it.
7. CLI: a style named 'delete' is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Duplicate names on Web should be refused or disambiguated, as VS Code and the CLI do. [inferred]
- CLI deletion should be recoverable. [inferred from AGENTS.md section 9]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add delete to VS Code custom styles.
- [proposed] Move deleted CLI style files to the Trash.
- [proposed] Build custom styles on Mobile by reusing the Web payload.
- [proposed] Fix the stale header comment in output_styles.rs.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| store | useStyleStore custom style actions | `apps/web/features/chat/stores/style-store.ts` | addCustomStyle, updateCustomStyle, deleteCustomStyle, sync, migrate. |
| component | StyleSelector | `apps/web/features/chat/components/Composer/StyleSelector.tsx` | Menu, create/edit form, delete confirmation. |
| component | useConfirmAction | `packages/ui (@agiworkforce/ui)` | Shared confirmation dialog used for delete. |
| service | preferences-client | `apps/web/app/settings/_lib/preferences-client.ts` | Reads and saves the response-style namespace. |
| endpoint | /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | GET and PUT of the namespace with CSRF, rate limit, version conflict 412. |
| table | user_settings | `apps/web/db/neon/0028_user_settings.sql` | Stores the account's settings JSON. |
| service | output_styles module | `apps/cli/src/output_styles.rs` | Built-in list, user files, create, delete, name rules, parsing. |
| command | handle_output_style | `apps/cli/src/claude_parity.rs` | /output-style list, new, create, delete, remove, switch. |
| command | TUI /output-style | `apps/cli/src/tui/tui_app.rs` | Terminal UI route and persistence of a plain selection. |
| command | REPL persist_shared_ui_config | `apps/cli/src/repl/slash_commands.rs` | Saves a plain /output-style selection in the plain REPL. |
| config | ui.output_style | `apps/cli/src/config.rs` | Saved default style name. |
| service | built-in style texts | `crates/agiworkforce-agent-core/src/output_styles.rs` | Concise, study, proactive, explanatory and learning prompt texts used by the CLI. |
| component | chooseOutputStyle / outputStyleInput | `apps/extension-vscode/src/features/sidebar-webview/outputStyles.ts` | VS Code quick pick, custom style storage, turn input. |
| hook | ChatStateManager openOutputStyles | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Handles the menu message and adds the style input to each turn. |
| test | style-store account-sync test | `apps/web/features/chat/stores/style-store.account-sync.test.ts` | Create/edit/delete before and after account read. |
| test | StyleSelector test | `apps/web/features/chat/components/Composer/StyleSelector.test.tsx` | Edit form behaviour. |
| test | VS Code chatStateManager test | `apps/extension-vscode/src/__tests__/chatStateManager.test.ts` | Multiple named styles saved and used on a turn (line 4243). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: save in the form creates or updates the style in the store with a random id and timestamp. | device | style-store.ts:184-206; StyleSelector.tsx:161-176 |
| Web: a debounced PUT writes the whole customStyles list to the account namespace. | our servers | style-store.ts:300-317; route.ts:185-250 |
| Web: on mount the store reads the account copy and replays held edits. | our servers | style-store.ts:229-248; ChatComposerNew.tsx:1852-1855 |
| Web: on send the style instruction is attached to the request. | device and our servers | style-store.ts:365-381; useChatStream.ts:4533-4535 |
| CLI: create writes <name>.md with front matter into the output-styles folder in the config directory; select applies its text to the system message. | device | output_styles.rs:224-237; agent/mod.rs:1828-1844 |
| VS Code: styles live in extension global state; on each turn the selected style becomes a text input. | device | outputStyles.ts:122, 127-139 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Web custom styles (id, name, instruction, sampleText, createdAt) | Browser localStorage 'agi-response-style' and user_settings JSON on our servers | Yes, whole list per change (600 ms debounce) | Deleted on style delete with confirmation; cannot be recovered per the dialog text |
| CLI style files | output-styles folder inside the CLI config directory (file:<config dir>/output-styles/<name>.md) | No sync code found | remove_file on delete, no Trash (output_styles.rs:259) |
| VS Code custom styles and selection | Extension global state key agiWorkforce.outputStyles (store:agiWorkforce.outputStyles) | No sync code found | No delete path found |

**Models and providers.** A style is plain text added to the instructions, so any model or provider receives it. Nothing checks model support. On the CLI the style sits in the system message after the base instructions (output_styles.rs:8-18).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web: signed-out use keeps styles in the browser only; account sync needs sign-in [inferred from style-store.ts:229-240]. CLI and VS Code: no account needed for custom styles. |
| Permissions | Preferences endpoint: CSRF token, rate limit, user-scoped DB (route.ts:185-195). The namespace name must match a lowercase pattern (route.ts:28-31). |
| Subscription | none found in the code. No plan check or custom style count limit was found. |
| Limits and metering | VS Code: name 60 characters, instructions 4000 (outputStyles.ts:24-25). CLI: name 40 characters (output_styles.rs:202). Web: no limit found in the form. Number of styles: none found. |
| Feature flags | none found in the code |
| Model compatibility | Any model. |
| Provider restrictions | none found in the code |
| Local mode | Web with an on-device model still receives the instruction; style editing and storage work offline and sync later. CLI and VS Code files and state are on the device in every mode. Imported or custom CLI styles apply in Local, own-key and Managed sessions alike [inferred]; account preferences are separate and reach only Managed Cloud turns (claude_parity.rs:1400-1407). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty name or instruction (Web) | Save button disabled. | StyleSelector.tsx:406 |
| Duplicate name (Web) | not handled in the code; a second style with the same name is created. | StyleSelector.tsx:161-176 |
| Duplicate or built-in name (CLI, VS Code) | Refused with a message. | output_styles.rs:212-231; outputStyles.ts:47-57 |
| Delete active style | Web returns to Default; CLI returns the session to default and says so. | style-store.ts:218; claude_parity.rs:1321-1324 |
| Two CLI files define the same name | Delete refuses and lists the paths. | output_styles.rs:262-269 |
| Offline (Web) | Edits stay local; held until the account copy is read. | style-store.ts:235-247, 285-287 |
| Account save error (Web) | Silently ignored; retried at the next mutation. | style-store.ts:313-315 |
| Version conflict from server | The endpoint can return 412; the style store does not use expectedVersion, so last write wins [inferred]. | route.ts:235-246; style-store.ts:308-311 |
| Accessibility | Edit and delete buttons have aria-labels; fields are labelled; the form scrolls into view. | StyleSelector.tsx:90-93, 319, 329, 360-400 |
| CLI unknown style | resolve falls back to default; the command says 'No output style named'. | output_styles.rs:146-151; claude_parity.rs:1334-1339 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/stores/style-store.account-sync.test.ts`: Create, edit and delete before and after the account copy is read; no save when nothing changed.
- `apps/web/features/chat/components/Composer/StyleSelector.test.tsx`: Edit form opens on the chosen style, writes back with updateCustomStyle, cancel leaves it alone, labelled fields.
- `apps/web/features/chat/stores/style-store.writing-sample.test.ts`: Edited custom style changes the instruction.
- `apps/cli/src/output_styles.rs`: Inline tests: built-in list, unknown fallback, delete targets the right file, names with spaces, refused action names, ambiguous delete (lines 282-374).
- `apps/cli/src/claude_parity.rs`: Inline test for case-insensitive style selection (line 3192).
- `apps/cli/src/tui/tui_app.rs`: Inline test of /output-style grammar and persisting a plain selection (line 10243).
- `apps/extension-vscode/src/__tests__/chatStateManager.test.ts`: Multiple named styles, edit, selection kept for a new manager, style used on the turn (line 4243).
- `apps/extension-vscode/src/__tests__/composerControls.send.webview.test.ts`: The Output style menu item posts openOutputStyles (line 180).

**Test scenarios**

- **Create, use, edit, delete on Web**
  1. Style > Create Custom Style, name 'Plain', instruction 'Avoid jargon', Save.
  2. Send a message.
  3. Pencil > change instruction > Save changes.
  4. Trash > Delete style.
  - Expected: Style listed and active; request carries the instruction; edit keeps one style; delete removes it and returns to Default.
- **Account sync**
  1. Create a style on device A.
  2. Wait a few seconds.
  3. Open Web on device B signed in.
  - Expected: Style appears on B.
- **Edit before account read**
  1. Go offline, create a style, go online and reload.
  - Expected: The style is merged into the account copy and kept.
- **CLI create and delete**
  1. /output-style new brief Keep it short
  2. /output-style brief
  3. /output-style delete brief
  - Expected: File created; style active; file removed and session returns to default.
- **CLI refused names**
  1. /output-style new delete x
  2. /output-style new concise x
  - Expected: Both refused with their messages.
- **VS Code delete**
  1. Output style > Edit a custom style…
  2. Look for a delete action.
  - Expected: No delete exists (confirms the gap).

**Where to look when it fails**

- Web: PUT /api/settings/preferences responses; log 'Failed to persist user settings'.
- CLI: error strings from output_styles::create and delete; 'Failed to persist output style' from the TUI.
- VS Code: global state key agiWorkforce.outputStyles; warning 'That output style name is no longer available.'

**Hands-on test plans**

- Web: [70-qa/test-plans/web/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/web/040-instructions-preferences-and-personal-style.md)
- Desktop: [70-qa/test-plans/desktop/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/desktop/040-instructions-preferences-and-personal-style.md)
- CLI: [70-qa/test-plans/cli/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/cli/040-instructions-preferences-and-personal-style.md)
- VS Code: [70-qa/test-plans/vscode/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/vscode/040-instructions-preferences-and-personal-style.md)

## 10. Gaps and dependencies

- **Mobile has no custom styles.** Affects: Mobile users. Evidence: chatExecutionStore.ts:1189-1195 presets only; brief S40.27 mobile missing. Work needed: Add a custom style store and UI, syncing with the Web payload.
- **VS Code cannot delete a custom style, and the brief marks VS Code missing although create and edit exist.** Affects: VS Code users; brief accuracy. Evidence: outputStyles.ts:65-125. Work needed: Add delete with a confirmation; correct the brief status.
- **CLI delete is permanent with no Trash step.** Affects: CLI users. Evidence: output_styles.rs:257-260; AGENTS.md section 9. Work needed: Move the file to the OS Trash or a recoverable folder first.
- **Web form does not stop duplicate names or very long fields.** Affects: Web and Desktop users. Evidence: StyleSelector.tsx:161-176, 364-399. Work needed: Add duplicate check and length limits.
- **CLI has no edit command.** Affects: CLI users. Evidence: claude_parity.rs:1309-1313. Work needed: Add /output-style edit or open the file in the editor.
- **Web sync is last-write-wins without expectedVersion.** Affects: Users editing on two devices. Evidence: style-store.ts:308-311; route.ts:235-246. Work needed: Send expectedVersion and merge on 412.
- **Chrome has no custom styles.** Affects: Chrome users. Evidence: No code found. Work needed: Decide scope and build.
- Not built on: Mobile, Chrome (from the capability ledger).

**Depends on**

- F040-07
- F040-08
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- surface:web
- surface:desktop
- surface:cli
- surface:vscode
- table:user_settings

## Unknown

- Whether the server limits the size of the response-style namespace.
- Whether the CLI style folder syncs to any account.
- Whether VS Code has a delete path outside the files opened.
- The order of precedence when a Web custom style and saved Settings style both apply beyond the preamble text (style-store.ts:319-320).
