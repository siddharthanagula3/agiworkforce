---
id: "F013-03"
type: "feature"
title: "Enter key choice and shortcuts"
aliases: ["Send with Enter", "Send key", "agiWorkforce.composer.enterBehavior", "Enter-to-send preference", "Undo and redo", "External editor key", "S13.08", "S13.10"]
area: "13 Composer text interaction"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S13.08", "S13.10"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:cloud", "file:apps/web/shared/stores/web-settings-store.ts", "SYS-sync-and-continuity", "SYS-shared-ui-and-design", "F013-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F013-03 Enter key choice and shortcuts

Choose whether Enter sends or adds a line, and use undo and redo while writing. Web has a 'Send with Enter' switch (the rich editor ignores it), VS Code has a 'Send key' setting, mobile, CLI and Chrome have no setting. Undo is browser-native on web, has its own stack in the CLI, and is unverified on mobile and VS Code.

Area: [13. Composer text interaction](README.md). Requirement items: [S13.08](../../10-requirements/capabilities/013-composer-text-interaction.md#s1308), [S13.10](../../10-requirements/capabilities/013-composer-text-interaction.md#s1310).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person pick the key that sends (Enter, or Cmd/Ctrl+Enter) and revert edits with the standard shortcuts. Cmd/Ctrl+Enter keeps sending in every mode on web.

**Why it exists.** People who write long prompts or use input methods want Enter to add a line. The guidance lists 'Enter preferences' (doc: docs/product/competitive-guidance.md section 5.3, item 17).

**Who uses it.** Writers of long prompts, developers who use Enter for lines, anyone who mistypes and wants undo.

**Problems it solves**

- Accidental sends when Enter was meant as a line break.
- Lost text after a mistaken edit (undo).
- Editing a long draft with a familiar tool (CLI external editor).

**Use cases**

- Turn 'Send with Enter' off on web so Cmd/Ctrl+Enter sends.
- Set VS Code 'Send key' to 'Enter, or Cmd/Ctrl+Enter with several lines'.
- Press Cmd/Ctrl+Z to undo a paste in the web box.
- In the CLI press Ctrl+_ to undo and Ctrl+Shift+Z to redo.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, General, section 'Composer', switch 'Send with Enter' with hint 'Off: Enter starts a new line and Cmd + Enter sends.' (Ctrl + Enter off Mac) (apps/web/features/settings/sections/GeneralSection.tsx:607-624, :320-326).
- VS Code: Settings webview, row 'Send key' with options 'Enter', 'Enter, or Cmd/Ctrl+Enter with several lines', 'Cmd/Ctrl+Enter' (apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1445-1460); also the VS Code setting agiWorkforce.composer.enterBehavior (apps/extension-vscode/package.json:1251).
- CLI: keys only; no setting found in apps/cli/src/tui/tui_app.rs.
- Mobile and Chrome: no setting found in ChatInput.tsx or side_panel.ts.

**Before you start**

- Web: the switch saves locally for everyone; syncing to the account needs sign-in (apps/web/features/settings/components/CloudSettingsSync.tsx:62).
- None for the others.

**Screens and controls**

- Web switch 'Send with Enter' (default on, apps/web/shared/stores/web-settings-store.ts:133).
- VS Code select 'Send key' (webviewContent.ts:5088-5100 shows the label of the active key in the Send button title).
- CLI: Ctrl+_ (also Ctrl+7, Ctrl+Shift+-) undo; Ctrl+Shift+Z or Ctrl+Alt+_ or Ctrl+Alt+7 redo; Ctrl+E or Ctrl+G opens the external editor (apps/cli/src/tui/composer_edits.rs:79-106).
- Web/Chrome/mobile: platform undo shortcuts.

**Journey**

1. 1. Web: open Settings, General, Composer; turn 'Send with Enter' off.
2. 2. In the chat box press Enter: a new line appears.
3. 3. Press Cmd/Ctrl+Enter: the message sends.
4. 4. Press Cmd/Ctrl+Z after a paste or edit to undo; Shift+Cmd/Ctrl+Z to redo.

**What the person sees and gets**

- VS Code Send button title shows the active send key, for example 'Send (Enter)' or 'Send (Cmd+Enter)' (webviewContent.ts:5101-5120).
- CLI: after an external editor edit the draft replaces the composer text; an error is shown as a status notice (tui_app.rs:7303-7315).

**Settings**

- web setting key sendWithEnter, synced in the 'appearance' preference namespace (apps/web/features/settings/lib/appearance-namespace.ts:12, :26, :157) saved to the settings preferences path (packages/contracts/cloud-contracts/src/managed-cloud-settings-client.ts:15).
- VS Code agiWorkforce.composer.enterBehavior: enter, modifierIfMultiline, modifier (package.json:1251-1262).
- VS Code agiWorkforce.composer.escapeStops (default off) is a related stop setting (package.json:1264).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web textarea: Enter sends only when sendWithEnter is on or Cmd/Ctrl is held; Shift+Enter never sends (ChatComposerNew.tsx:1792, :4651-4662).
- Web: Cmd/Ctrl+Shift+Enter calls the inverted send (steer vs queue while a reply runs) (ChatComposerNew.tsx:4637-4647, :4070).
- Web setting store default true and setter (web-settings-store.ts:133, :175); switch UI (GeneralSection.tsx:607-624); synced with the account through CloudSettingsSync (CloudSettingsSync.tsx:73, :104, :132).
- VS Code: three modes read in the webview keydown; the Send title shows keys; settings change reaches the webview (webviewContent.ts:5088-5100, :5875-5990, :8037-8040; apps/extension-vscode/src/platform/config.ts:282).
- CLI: own undo stack of 200 entries, typing runs grouped, external editor via VISUAL then EDITOR then vi (composer_edits.rs:3, :140-147); handled in the idle composer (tui_app.rs:4042-4056, :7303).
- Chrome: helper functions insert text through execCommand so browser undo keeps working (apps/extension/src/features/side-panel/composerText.ts:1-20).

**Incomplete**

- Web rich editor arm does not receive the setting: ComposerRichEditor passes no sendShortcut to ComposerEditor, whose default is Enter (ComposerInput.tsx:160-228; composer-editor/ComposerEditor.tsx:35, :94). With the editor on, Enter still sends when 'Send with Enter' is off. [inferred from reading both files]
- Mobile, CLI, Chrome: no Enter-to-send setting found. Chrome sends on Enter and also on Cmd/Ctrl+Enter because only Shift is excluded (side_panel.ts:14574) [inferred].
- Mobile and VS Code undo rely on the platform text input and were not verified. VS Code undo of programmatic edits is unknown.

**Present but disconnected or switched off**

- The shared unified-chat ChatInput supports a sendShortcut prop (packages/ui/unified-chat/src/components/ChatInput.tsx:178, :1042), but the desktop store dropped the setting (apps/desktop/src/stores/settingsStore.ts:315-324). Who else passes it is unknown.

**Not available**

- No Enter preference on mobile, CLI, Chrome.
- No redo shortcut or external-editor key in web, mobile, VS Code, Chrome.

## 4. Required behaviour

**Established requirements**

- The user can choose in settings whether Enter sends or inserts a newline (e.g. Cmd/Ctrl+Enter to send) (S13.08). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.08)
- Standard undo and redo shortcuts revert and reapply edits in the composer (S13.10). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.10)
- Enter preferences are part of text entry that must avoid accidental sends. (source: doc: docs/product/competitive-guidance.md (section 5.3, item 17))

**Acceptance criteria**

1. Web with the switch off: Enter adds a line, Cmd/Ctrl+Enter sends (textarea arm).
2. Web with the switch off and the editor arm on: record whether Enter still sends (expected by requirement: it adds a line).
3. The switch value survives reload and appears on a second device after sign-in.
4. VS Code 'modifier' mode: Enter adds a line and Cmd/Ctrl+Enter sends.
5. VS Code 'modifierIfMultiline': one-line Enter sends; after a second line Enter adds lines.
6. Cmd/Ctrl+Z restores the text before a paste (web textarea); CLI Ctrl+_ restores the text before the last edit group.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The Enter choice should apply to both web input arms [inferred from the single setting].
- Mobile, CLI and Chrome may not need an Enter preference if Return adds a line or Shift+Enter is the convention; the owner must decide [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass sendShortcut from the web setting to the rich editor.
- [proposed] Offer the same preference on Chrome.
- [proposed] Add tests for CLI undo, redo and external editor.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SendWithEnterRow | `apps/web/features/settings/sections/GeneralSection.tsx` | Switch 'Send with Enter' under Composer (:607). |
| store | web settings store | `apps/web/shared/stores/web-settings-store.ts` | sendWithEnter default true and setter; persisted under 'agiworkforce-web-settings' (:133, :175, :210). |
| service | CloudSettingsSync | `apps/web/features/settings/components/CloudSettingsSync.tsx` | Reads and writes sendWithEnter with the account (:73, :104). |
| schema | appearance namespace | `apps/web/features/settings/lib/appearance-namespace.ts` | Defines the synced appearance fields including sendWithEnter (:26, :119, :157). |
| config | settings preferences path | `packages/contracts/cloud-contracts/src/managed-cloud-settings-client.ts` | MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH '/api/settings/preferences' (:15). |
| component | ChatComposerNew keydown | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Reads sendWithEnter (:1792) and applies it in handleKeyDown (:4651-4662); inverted send (:4637). |
| component | ComposerInput | `apps/web/features/chat/components/Composer/ComposerInput.tsx` | Rich-editor arm that does not receive sendShortcut. |
| hook | ComposerSubmitKeymap | `packages/ui/unified-chat/src/composer-editor/extensions/submit-keymap.ts` | Applies sendShortcut in the editor; Mod+Enter always sends. |
| component | ComposerEditor | `packages/ui/unified-chat/src/composer-editor/ComposerEditor.tsx` | UndoRedo extension via createComposerExtensions (extensions/index.ts:25); sendShortcut prop (:94). |
| config | composer.enterBehavior | `apps/extension-vscode/package.json` | VS Code setting with three values (:1251). |
| config | VS Code settings schema | `apps/extension-vscode/src/features/settings/settingsProtocol.ts` | zod enum for composer.enterBehavior (:117). |
| component | VS Code webview send keys | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | composerKeys (:5088), enterNeedsModifier (:5096), keydown (:5875). |
| service | composer_edits | `apps/cli/src/tui/composer_edits.rs` | ComposerUndo stack, key tests, PastedTexts, external editor. |
| component | TUI key handling | `apps/cli/src/tui/tui_app.rs` | Undo and redo keys (:4042), external editor key (:4054), editor run (:7303). |
| service | Chrome composerText | `apps/extension/src/features/side-panel/composerText.ts` | Text insertion helpers using execCommand so browser undo works. |
| test | GeneralSection test | `apps/web/features/settings/sections/GeneralSection.test.tsx` | Composer region contains the 'Send with Enter' switch (:269). |
| test | appearance namespace test | `apps/web/features/settings/lib/__tests__/appearance-namespace.test.ts` | Round trip of sendWithEnter in the namespace. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person flips the switch; the store updates and persists in browser storage. | device | web-settings-store.ts:175, :210 |
| CloudSettingsSync debounces and writes the changed field to the preferences endpoint when signed in. | our servers | CloudSettingsSync.tsx:165-185; managed-cloud-settings-client.ts:15 |
| On Enter, handleKeyDown reads the store value and sends or leaves the newline. | device | ChatComposerNew.tsx:4651-4662 |
| CLI undo: each key press records before and after text; undo restores the earlier text and cursor. | device | composer_edits.rs:16-62; tui_app.rs:7296 |
| CLI external editor: the terminal is restored, the editor is started on a temporary file, the result replaces the draft. | device | tui_app.rs:7303-7315; composer_edits.rs:140-163 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| sendWithEnter value | Browser storage 'agiworkforce-web-settings' and the account preferences (namespace 'appearance') | Yes for signed-in web users through CloudSettingsSync | Server table behind the preferences path not read: unknown |
| VS Code enterBehavior | VS Code settings | By VS Code settings sync if the user enables it [inferred] | VS Code owns it |
| CLI prompt draft in a temp file agi-prompt-<id>.md | OS temp directory | No | Removed after the editor exits (composer_edits.rs:157) |

**Models and providers.** None: this feature does not involve a model or provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Local switch needs none; cloud sync of the web value needs sign-in (CloudSettingsSync.tsx:62). |
| Permissions | CLI external editor starts a program named by VISUAL or EDITOR (composer_edits.rs:141-147); no prompt. |
| Subscription | none found in the code. |
| Limits and metering | CLI undo depth 200 (composer_edits.rs:3). Others: none found. |
| Feature flags | Web editor arm switch decides whether the setting is honoured (see incomplete). |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Fully device-side; works without a subscription. Cloud sync of the web value is the only server step. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Slash or mention menu open | Menus own Enter; Enter does not send (web). | ChatComposerNew.tsx:4579-4600, :4655 |
| IME composing | No send with either key. | ChatComposerNew.tsx:4579; submit-keymap.ts:41-43 |
| Settings fail to load | Sync keeps the local value; CloudSettingsSync guards against overwriting a namespace it failed to read. | CloudSettingsSync.tsx:247-249 (comment) |
| CLI editor missing or exits non-zero | Status notice with the error; draft unchanged. | composer_edits.rs:158-162; tui_app.rs:7312-7314 |
| CLI undo while a reply runs | not handled in the code read: the in-turn draft editor has no undo. | tui_app.rs:4650-4668 (edit_turn_draft has no undo key arm) |
| Mobile and VS Code undo | unknown; platform input. | no undo code found in ChatInput.tsx or webviewContent.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/settings/sections/GeneralSection.test.tsx`: The Composer region contains the 'Send with Enter' switch.
- `apps/web/features/settings/lib/__tests__/appearance-namespace.test.ts`: sendWithEnter in the appearance namespace patch.
- `apps/web/features/settings/components/__tests__/CloudSettingsSync.test.tsx`: Sync of appearance fields including sendWithEnter.
- `apps/web/e2e/composer-editor.spec.ts`: Editor arm Enter and Cmd+Enter sends (default setting only).
- `apps/extension-vscode/src/__tests__/followUpBehavior.webview.test.ts`: VS Code send with Cmd/Ctrl+Enter and the modifierIfMultiline mode (:182, :210).
- `apps/extension-vscode/src/__tests__/configDefaults.test.ts`: Default key for composerEnterBehavior (:58).

**Test scenarios**

- **Web switch off, textarea**
  1. Settings, General, Composer: turn off 'Send with Enter'.
  2. In a chat press Enter, then Cmd/Ctrl+Enter.
  - Expected: Enter adds a line; Cmd/Ctrl+Enter sends.
- **Web switch off, editor arm**
  1. Open /chat?composer=editor.
  2. Turn off the switch.
  3. Press Enter.
  - Expected: By requirement a new line; by code reading the message sends (gap).
- **VS Code multiline mode**
  1. Set Send key to 'Enter, or Cmd/Ctrl+Enter with several lines'.
  2. Type one line, Enter; then type two lines, Enter.
  - Expected: First sends; second adds a line.
- **CLI undo**
  1. Type 'hello world', paste a line, press Ctrl+_ , then Ctrl+Shift+Z.
  - Expected: Undo removes the last edit group; redo restores it.
- **CLI external editor**
  1. Set EDITOR to a text editor.
  2. Type text, press Ctrl+E, edit and save.
  - Expected: The composer shows the edited text.
- **Sync**
  1. Turn the switch off on one browser.
  2. Open the account on another.
  - Expected: The switch is off there too.

**Where to look when it fails**

- Web: localStorage key 'agiworkforce-web-settings'.
- Web: network call to the settings preferences path.
- CLI: status notice text 'No editor is set; set VISUAL or EDITOR.' or 'Could not start <editor>'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/013-composer-text-interaction.md](../../70-qa/test-plans/web/013-composer-text-interaction.md)
- Desktop: [70-qa/test-plans/desktop/013-composer-text-interaction.md](../../70-qa/test-plans/desktop/013-composer-text-interaction.md)
- Mobile: [70-qa/test-plans/mobile/013-composer-text-interaction.md](../../70-qa/test-plans/mobile/013-composer-text-interaction.md)
- CLI: [70-qa/test-plans/cli/013-composer-text-interaction.md](../../70-qa/test-plans/cli/013-composer-text-interaction.md)
- VS Code: [70-qa/test-plans/vscode/013-composer-text-interaction.md](../../70-qa/test-plans/vscode/013-composer-text-interaction.md)
- Chrome: [70-qa/test-plans/chrome/013-composer-text-interaction.md](../../70-qa/test-plans/chrome/013-composer-text-interaction.md)

## 10. Gaps and dependencies

- **Web rich editor ignores 'Send with Enter'.** Affects: Web and Desktop users on the editor arm.. Evidence: packages/ui/unified-chat/src/composer-editor/ComposerEditor.tsx:94 (default); apps/web/features/chat/components/Composer/ComposerInput.tsx:160-228 (no sendShortcut prop). Work needed: Pass sendShortcut from the setting and add a test.
- **No Enter preference on mobile, CLI or Chrome.** Affects: Users of those apps.. Evidence: none found in ChatInput.tsx, tui_app.rs, side_panel.ts. Work needed: Owner decides; add settings where needed.
- **Undo on mobile and VS Code unverified; no test for CLI undo, redo or external editor found.** Affects: Testers.. Evidence: apps/cli/src/tui/composer_edits.rs has no test module; apps/mobile/__tests__ search found none. Work needed: Add tests or run human checks.
- **The brief marks S13.08 missing on all apps but the code has it on web and VS Code.** Affects: Anyone reading the brief.. Evidence: GeneralSection.tsx:607; package.json:1251. Work needed: Correct the brief status.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:cloud
- file:apps/web/shared/stores/web-settings-store.ts
- SYS-sync-and-continuity
- SYS-shared-ui-and-design
- F013-01

## Unknown

- The HTTP method used by the preferences write (only the path was read), so no api name is listed.
- The database table behind account preferences.
- Whether VS Code undo works for programmatic edits.
- Who passes sendShortcut to the shared unified-chat ChatInput.
- Follow-up default for Cmd/Ctrl+Shift+Enter on web: store default 'queue' (web-settings-store.ts:136) versus an e2e title saying Enter steers by default (composer-follow-up-and-shortcuts.spec.ts:22).
