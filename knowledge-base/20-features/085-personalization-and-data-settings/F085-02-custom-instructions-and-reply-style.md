---
id: "F085-02"
type: "feature"
title: "Custom instructions and reply style"
aliases: ["Custom instructions (S85.02)", "Communication style (S85.03)", "Instructions for AGI", "Personalization", "Response style", "Characteristics", "/personalize", "Reset response style", "Code: Personalization"]
area: "85 Personalization and data settings"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S85.02", "S85.03", "S85.25"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "SYS-memory-projects-and-context", "SYS-chat-turn-pipeline", "SYS-api-and-contracts", "SYS-sync-and-continuity", "table:user_settings", "table:user_projects", "api:GET /api/settings/preferences", "api:PUT /api/settings/preferences", "api:GET /api/memory/local-context", "F085-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F085-02 Custom instructions and reply style

A person writes standing instructions and details about themselves, and picks style, length, technical level, formatting, language and tone traits. The server adds them to later Cloud chats on that account. A project can opt out. Reset exists for the style block on web and mobile; one-action reset of everything does not exist.

Area: [85. Personalization and data settings](README.md). Requirement items: [S85.02](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8502), [S85.03](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8503), [S85.25](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8525).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Stores a profile (preferred name, work, about you), standing instructions and response-style choices on the account, and adds them as a block to the model request for later chats (apps/web/lib/server/user-identity.ts:160-205,250-292).

**Why it exists.** People want the assistant to follow their preferences every time without repeating them, as Claude and ChatGPT allow.

**Who uses it.** Anyone signed in on Web, Desktop, Mobile, CLI (style fields only) and VS Code (name, work and style, plus editor-local instructions).

**Problems it solves**

- Repeating the same preferences in every chat.
- Replies with the wrong length, tone, language or formatting.
- Project-specific needs that conflict with personal preferences.

**Use cases**

- Set Response length to Shorter and Technical level to Expert.
- Write 'when learning new concepts, I find analogies particularly helpful' as instructions.
- Turn instructions off for a while without deleting the text.
- Make a project follow only its own instructions.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web): Settings > Personalization (apps/web/features/settings/sections/PersonalizationSection.tsx:379).
- Mobile: Settings > Assistant > Personalization (apps/mobile/src/features/settings/index.tsx:775).
- CLI: slash command /personalize (apps/cli/src/repl/slash_commands.rs:262).
- VS Code: command 'Code: Personalization' (apps/extension-vscode/package.json:748-749; commandSetup.ts:2667).
- Project: Project settings dialog, section 'Personalization' with two checkboxes (apps/web/features/projects/components/ProjectSettingsDialog.tsx:340-376).
- Chrome: no control found.

**Before you start**

- Signed in for account-wide effect. Mobile Local mode keeps its own local copy and uses it on the device (apps/mobile/src/features/settings/personalization/index.tsx:259-268).
- CLI: a Managed Cloud session; Local and BYOK sessions refuse (apps/cli/src/cloud/personalization.rs:394-408).

**Screens and controls**

- Web: sections 'Style and tone' (Response style, Response length, Technical level, Preferred formatting, Response language with 'Match my message'), 'Characteristics' (four Less/Default/More selects and 'Reset response style'), 'Instructions for AGI' (switch 'Apply instructions for AGI', 2000-character box), 'About you' (nickname, 'What best describes your work?', up to 1500 characters) (PersonalizationSection.tsx:390-600).
- Mobile: Nickname, Occupation, More about you, Custom Instructions, Style Preset, Response Length, Technical Level, Response Language, four trait rows, 'Reset response style', explicit save (personalization/index.tsx:394-430,566-594).
- CLI fields: name, work, about, style, technical, formatting, length, language, warmth, enthusiasm, headings, emoji (cloud/personalization.rs:27-124). There is no instructions field.
- VS Code quick pick: 'What should AGI call you?', 'What do you do?', Style, Technical level, Formatting, Length, Language, Tone traits (personalization.ts:134-232).

**Journey**

1. Web: open Settings > Personalization, change a field; the page saves by itself 400 ms after the last edit and shows 'Saved' or an error with Retry (PersonalizationSection.tsx:273-335).
2. Send the next message in a Cloud chat; the server builds the block and sends it with the request (request-processor.ts:3993-4005).
3. To stop: switch off 'Apply instructions for AGI' (text kept) or clear the field.
4. Mobile: edit fields and press save; leaving with changes asks to discard (index.tsx:355-440).
5. CLI: '/personalize set length shorter' or '/personalize clear length' (cloud/personalization.rs:134-154).

**What the person sees and gets**

- Web: 'Saved', or 'Your personalization was not saved.' with a Retry button; toast 'Response style is back to the defaults.' after reset (PersonalizationSection.tsx:76-82,367-372).
- CLI prints '<label> set to <value>.' or '<label> cleared.' (cloud/personalization.rs:215-224).
- Effect on replies is not shown in a visible badge [inferred from the code searched].

**Settings**

- Project checkboxes 'Use your profile and instructions for AGI' and 'Use your response style' (ProjectSettingsDialog.tsx:353,370).
- Mobile temporary chat 'Personalized' / 'Unpersonalized' switch (TemporaryChatBanner.tsx:17-18).
- Web composer style selector overrides the saved style for one chat (see F085-03).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server builds one block with optional user_profile, response_style and user_instructions tags; the header says it is user preference, not system authority (apps/web/lib/server/user-identity.ts:160-205).
- Two stored groups are read at send time: 'general' (web fields) and 'personalization' (mobile sliders and style); the comment records that mobile sliders were once stored and ignored (user-identity.ts:250-292).
- Only the first active account instruction is used; web's block is read before mobile's, and a switched-off block is not a candidate (user-identity.ts:294-302; apps/web/lib/preferences/instruction-preferences.ts:55-62).
- Project opt-out: when a project turns off instructions and style, nothing is added; with only style on, only style is added (user-identity.ts:213-262).
- Chat requests skip the block for the api surface and when personalization is false (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3993-3995).
- A read failure sends no instructions and logs a warning (turn-context-service.ts:283-289; request-processor.ts:3999-4005).
- Live voice sessions also read the preamble (apps/web/app/api/voice/live/sessions/lib/live-voice-context.ts:179).
- Free-quota lane builds the block when personalization is not false (turn-context-service.ts:338-415).
- Web saves both namespaces with merge and handles version conflicts (apps/web/app/api/settings/preferences/route.ts:176-250).
- Mobile in Local mode renders the personalization block on the device with local settings (apps/mobile/stores/chat/chatExecutionStore.ts:2815-2816; personalization.ts:17-79); in Cloud mode the server assembles it (chatExecutionStore.ts:2800).
- Web or Desktop chats that use an on-device model fetch the account's block from the server and cache it for 60 seconds (apps/web/features/chat/lib/local-personal-context.ts:28,137; apps/web/lib/hooks/useChatStream.ts:4467-4492).
- CLI reads and writes the style fields through /api/settings/preferences (cloud/personalization.rs:159-224).
- VS Code writes name, work and style to the account with patchAccountPreferences (personalization.ts:242-276) and keeps its own instructions in editor state, up to 8000 characters (apps/extension-vscode/src/features/instructions/customInstructions.ts:14-16).

**Incomplete**

- CLI cannot set instructions: the show command says to use the web settings page (cloud/personalization.rs:178-181).
- VS Code: where the person edits the editor-local instructions was not opened; they are not the account instructions (customInstructions.ts:48-76).
- Mobile writes instructions into 'general' and a customInstructions key in 'personalization' (apps/mobile/services/cloudSettingsMapping.ts:137-160); the server reads the key named instructions in 'personalization' [inferred], and mobile does not write the web on/off flag.

**Present but disconnected or switched off**

- Web Personalization switch off keeps text but is not sent (PersonalizationSection.tsx:489-505).
- The 'Personalized' switch on a mobile temporary chat can send personalization false (chatExecutionStore.ts:3453-3455).

**Not available**

- Chrome: no instruction or style editor found in apps/extension/src.
- One-action 'reset personalization' for instructions, style and memory: not offered on any app (S85.25 brief). Style-only reset exists on web and mobile; CLI clears one field at a time.

## 4. Required behaviour

**Established requirements**

- The user can write custom instructions on the surface and they apply to that surface's chats until changed or switched off. (source: S85.02 Should (brief))
- The user can choose how the assistant communicates (tone, length, formatting) and replies follow it. (source: S85.03 Should (brief))
- One action resets personalization (instructions, style, memory) to defaults after confirmation. (source: S85.25 Should (brief))
- Every visible setting persists and changes behaviour; read or save failures expose retry; account switches invalidate cached preferences. (source: doc: docs/product/experience-contract.md:792)
- Saved instructions reach the model in a block wrapped in user_instructions tags. (source: apps/web/lib/server/user-identity.ts:195-197)

**Acceptance criteria**

1. After saving instructions on web, the next Cloud chat request carries a block containing the text inside user_instructions tags.
2. Switching 'Apply instructions for AGI' off keeps the text and removes it from the next request.
3. A project with 'Use your profile and instructions for AGI' off and 'Use your response style' off gets no block.
4. Empty fields send no block (the function returns null).
5. A failed save shows 'Your personalization was not saved.' and Retry works.
6. 'Reset response style' returns the style, length, level, formatting, language and trait fields to defaults.
7. /personalize set length shorter changes the stored value and /personalize show displays 'shorter'.
8. A Local or BYOK CLI session refuses /personalize.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Web and mobile share the same stored fields for name, work, about and instructions through the 'general' group.
- [inferred] A mismatch between mobile's customInstructions key and the server key is hidden because mobile also writes 'general'.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add one Reset personalization action after a confirmation naming what is cleared.
- [proposed] Add an instructions field to the CLI.
- [proposed] Show a small notice in chat that personalization was applied.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | formatPersonalizationBlock | `apps/web/lib/server/user-identity.ts` | Builds the tagged block (line 160). |
| service | buildCustomInstructionsPreamble | `apps/web/lib/server/user-identity.ts` | Reads both groups and the project scope (line 250). |
| service | readProjectPersonalizationScope | `apps/web/lib/server/user-identity.ts` | Reads uses_account_instructions and uses_account_style (line 213). |
| service | instruction blocks | `apps/web/lib/preferences/instruction-preferences.ts` | Scopes, enabled flag, first active block. |
| service | response style helpers | `apps/web/lib/preferences/response-style-preferences.ts` | Re-exports shared style choices and guidance text. |
| service | turn context assembly | `apps/web/lib/services/turn-context-service.ts` | Calls the preamble builder with project id (line 283). |
| service | request processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Starts the preamble read per request (line 3993). |
| endpoint | GET/PUT /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Stores namespaces with merge and version checks. |
| endpoint | GET /api/memory/local-context | `apps/web/app/api/memory/local-context/route.ts` | Gives on-device chats the account block. |
| component | PersonalizationSection | `apps/web/features/settings/sections/PersonalizationSection.tsx` | Web editor with autosave and reset. |
| component | ProjectSettingsDialog | `apps/web/features/projects/components/ProjectSettingsDialog.tsx` | Project opt-out checkboxes. |
| endpoint | PATCH /api/projects/[id] | `apps/web/app/api/projects/[id]/route.ts` | Saves uses_account_instructions and uses_account_style (lines 188,190). |
| screen | Mobile Personalization | `apps/mobile/src/features/settings/personalization/index.tsx` | Mobile editor with explicit save. |
| service | cloudSettingsMapping | `apps/mobile/services/cloudSettingsMapping.ts` | Maps mobile fields to account groups (lines 137-160). |
| service | renderPersonalizationBlock | `apps/mobile/src/features/memory/services/personalization.ts` | On-device block for Local mode. |
| command | /personalize | `apps/cli/src/cloud/personalization.rs` | CLI show, set and clear. |
| command | Code: Personalization | `apps/extension-vscode/src/features/personalization/personalization.ts` | VS Code quick-pick editor. |
| service | custom instructions (editor-local) | `apps/extension-vscode/src/features/instructions/customInstructions.ts` | Host and workspace instructions in editor state. |
| table | user_settings | `apps/web/lib/server/user-identity.ts` | settings JSON holding the general and personalization groups (lines 47-60). |
| table | user_projects | `apps/web/lib/server/user-identity.ts` | Project opt-out columns (line 217-221). |
| store | useStyleStore | `apps/web/features/chat/stores/style-store.ts` | Reset hook called by 'Reset response style' (PersonalizationSection.tsx:370). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person edits fields; web autosaves two groups, 'general' and 'personalization', after 400 ms. | device and our servers | PersonalizationSection.tsx:273-335 |
| Server merges the patch into user_settings with a version check and returns the saved value. | our servers | apps/web/app/api/settings/preferences/route.ts:176-250 |
| On the next Cloud message the server reads both groups and the project's opt-out and builds the block. | our servers | user-identity.ts:250-292; request-processor.ts:3993-4005 |
| The block is added to the model request and the model replies; the block is skipped for the api surface or when personalization is false. | our servers | request-processor.ts:3993-3995 |
| On-device model chats on web and desktop fetch the block from the server (cached 60 s) and add it locally. | device and our servers | local-personal-context.ts:28-110; useChatStream.ts:4467-4492 |
| Mobile Local mode builds the block from the on-device settings with no network. | device | chatExecutionStore.ts:2815-2816 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Preferred name, work, about you, instructions, enabled flag | user_settings.settings group 'general' | Yes across apps through /api/settings/preferences | Overwritten on edit; erased with the account |
| Style, length, level, formatting, language, trait scores | user_settings.settings group 'personalization' | Yes | Same |
| Mobile Local personalization | mobile local settings store | No (Local copy separate from cloud copy) | On device until cleared |
| VS Code instructions | editor globalState and workspaceState | No | Until changed |
| Project opt-out flags | user_projects columns | With the project | With the project |

**Models and providers.** The block is plain text added to the request, so it works with any model or provider the router picks [inferred]. How each provider treats it was not opened.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Account required for account-wide effect; Local mobile works without sign-in on the device. |
| Permissions | A user edits only their own settings. Project opt-out needs project edit rights (route at apps/web/app/api/projects/[id]/route.ts not examined for roles). |
| Subscription | No plan check found in /api/settings/preferences or in the preamble builder. |
| Limits and metering | Instructions 2000 characters, about you 1500, name 60, work 120 (user-identity.ts:25-27; PersonalizationSection.tsx:73-75). Preferences writes are rate-limited under settings-org-patch (preferences/route.ts:179). |
| Feature flags | none found in the code. |
| Model compatibility | Not model-specific. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local uses on-device settings and no network. Web or Desktop on-device model chats need the account to fetch the block; when it is unavailable the flag personalContextMissing is passed to the local turn (useChatStream.ts:4504 area). CLI Local and BYOK sessions refuse /personalize (cloud/personalization.rs:394-408). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web disables every field until stored values load; load failure keeps fields disabled with Retry. | PersonalizationSection.tsx:195-250; test PersonalizationSection.test.tsx:122-142 |
| Save failure | Shows error, keeps dirty state, Retry resends. | PersonalizationSection.tsx:300-360 |
| Empty | No block is sent when all fields are empty. | user-identity.ts:167-175 |
| Concurrent edit elsewhere | Server answers 412 SETTINGS_VERSION_CONFLICT. | preferences/route.ts:240-250 |
| Leaving with unsaved changes | Web flushes on unmount; mobile asks to discard. | PersonalizationSection.tsx:346-352; personalization/index.tsx:401-407 |
| Read failure at send time | Chat continues with no instructions. | turn-context-service.ts:283-289 |
| Screen readers | Mobile traits carry accessibility labels with the level; web switch has aria-label. | personalization/index.tsx:234; PersonalizationSection.tsx:492 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/__tests__/user-identity.test.ts`: Switched-off text kept but not sent, no promotion of the other surface's instruction, name fallbacks, language and level lines.
- `apps/web/lib/server/__tests__/personalization-reaches-model.test.ts`: Name, work and instructions reach the prompt; nothing sent when empty.
- `apps/web/features/settings/sections/PersonalizationSection.test.tsx`: Layout, loading and load-failure behaviour, switch off/on, saving both groups with merge, coalesced saves.
- `apps/mobile/__tests__/personalization-block.test.ts`: Mobile block text: empty for defaults, slider lines, name preference.
- `apps/mobile/__tests__/Personalization.test.tsx`: Mobile screen header, inputs, trait levels and saving.
- `apps/cli/src/cloud/personalization.rs`: In-file tests: style accepts learning; Local and BYOK refuse reads, writes, memory switch and never-remember (lines 386-408).
- `apps/extension-vscode/src/__tests__/customInstructions.test.ts`: Host versus workspace instruction choice and the bounded turn prelude.
- `apps/web/features/projects/components/__tests__/ProjectSettingsDialog.chat-defaults.test.tsx`: Project chat defaults (file titles not read).

**Test scenarios**

- **Instructions reach a Cloud chat**
  1. Save instructions on web
  2. Send a message that asks the assistant to repeat its standing preferences
  3. Inspect the request or logs
  - Expected: The request contains user_instructions with the saved text.
- **Switch off keeps text**
  1. Turn off 'Apply instructions for AGI'
  2. Send a message
  3. Reload the page
  - Expected: Text remains in the box, not in the request.
- **Project opt-out**
  1. In a project turn off both personalization checkboxes
  2. Send a message in that project
  - Expected: No profile, style or instruction block is added.
- **Mobile Local**
  1. Switch the phone to Local mode
  2. Set Response Length shorter and save
  3. Chat with an on-device model offline
  - Expected: Reply follows the style; no network call is made for the block.
- **CLI**
  1. Run /personalize set style formal in a Managed Cloud session
  2. Run /personalize show
  - Expected: Shows formal; the same value appears on web.

**Where to look when it fails**

- Log 'Custom instructions read failed; sending none' (turn-context-service.ts:287; request-processor.ts:4002).
- Table user_settings settings->'general' and settings->'personalization'.
- HTTP 412 code SETTINGS_VERSION_CONFLICT on saves.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/085-personalization-and-data-settings.md](../../70-qa/test-plans/web/085-personalization-and-data-settings.md)
- Desktop: [70-qa/test-plans/desktop/085-personalization-and-data-settings.md](../../70-qa/test-plans/desktop/085-personalization-and-data-settings.md)
- Mobile: [70-qa/test-plans/mobile/085-personalization-and-data-settings.md](../../70-qa/test-plans/mobile/085-personalization-and-data-settings.md)
- CLI: [70-qa/test-plans/cli/085-personalization-and-data-settings.md](../../70-qa/test-plans/cli/085-personalization-and-data-settings.md)
- VS Code: [70-qa/test-plans/vscode/085-personalization-and-data-settings.md](../../70-qa/test-plans/vscode/085-personalization-and-data-settings.md)

## 10. Gaps and dependencies

- **No one-action reset of instructions, style and memory.** Affects: All apps. Evidence: S85.25 brief 'not applicable anywhere'; only style reset found (PersonalizationSection.tsx:367). Work needed: Design and add a confirmed reset naming what is lost.
- **CLI has no instructions field although the brief marks custom instructions done.** Affects: CLI. Evidence: cloud/personalization.rs:27-124,178-181. Work needed: Add an instructions field or accept a link.
- **Chrome has no editor and the effect there is unverified.** Affects: Chrome. Evidence: no match in apps/extension/src. Work needed: Verify the surface sent by Chrome and add an editor or link.
- **Mobile may not carry the web on/off flag for instructions.** Affects: Mobile and web users sharing an account. Evidence: cloudSettingsMapping.ts:151-160 has no instructionsEnabled. Work needed: Check whether a mobile save clears the web flag.
- **VS Code instructions are not the account instructions.** Affects: VS Code. Evidence: customInstructions.ts:48-76. Work needed: Decide whether to sync or label them.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- SYS-memory-projects-and-context
- SYS-chat-turn-pipeline
- SYS-api-and-contracts
- SYS-sync-and-continuity
- table:user_settings
- table:user_projects
- api:GET /api/settings/preferences
- api:PUT /api/settings/preferences
- api:GET /api/memory/local-context
- F085-03

## Unknown

- Where an editor user sets VS Code's own instructions.
- Which surface value Chrome sends and so whether account instructions apply to Chrome chats.
- Whether a mobile save clears the web enabled flag.
- How the server treats client-sent system messages (relevant to style, see F085-03).
- Whether Desktop Local mode (Electron) has any personalization path other than the on-device fetch.
- Exact trait labels shown on web (RESPONSE_STYLE_TRAITS not opened).
