---
id: "F040-01"
type: "feature"
title: "About you (name, background, role)"
aliases: ["About you", "Personalization: About you", "What should AGI call you", "Preferred name", "Nickname (mobile)", "Occupation (mobile)", "More about you", "S40.01", "S40.02", "S40.03", "user_profile block"]
area: "40 Instructions, preferences, and personal style"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S40.01", "S40.02", "S40.03"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "api:GET /api/settings/preferences", "api:PUT /api/settings/preferences", "api:GET /api/memory/local-context", "table:user_settings", "table:profiles", "store:mobile-local-settings", "SYS-authentication-and-identity", "SYS-memory-projects-and-context", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "F040-05", "file:apps/web/lib/server/user-identity.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F040-01 About you (name, background, role)

Lets a signed-in person tell AGI what to call them, what their work is and a free-text background note. The text is saved to the account and added to Cloud chat requests as a user-preference block, never as system authority. Web (and the Electron Desktop that shows it), Mobile, CLI and VS Code can set it.

Area: [40. Instructions, preferences, and personal style](README.md). Requirement items: [S40.01](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4001), [S40.02](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4002), [S40.03](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4003).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Stores a preferred name (60 characters), a work description (120 characters) and an about-you note (1500 characters) on the account, and folds them into a <user_profile> block that is added to the model prompt for Managed Cloud chats (apps/web/lib/server/user-identity.ts:160-210). The block says it is user preference, not system authority, and asks the model to use the name sparingly and never to open a reply (user-identity.ts:182-190).

**Why it exists.** So replies fit the person without them repeating who they are in every chat. [inferred] The product aim in docs/product/definition.md lists profile instructions and personalization as canonical account state.

**Who uses it.** Any signed-in person on Web, Desktop (Electron shows the hosted web app), Mobile, CLI (Managed mode) and VS Code. Chrome has no editing screen; it only receives the effect through Managed Cloud turns [inferred].

**Problems it solves**

- The assistant does not know the person's name or job.
- The person has to restate background in each new chat.
- A name typed in capitals is not shouted back (the name is title-cased by normalizeDisplayName, tested in apps/web/lib/server/__tests__/personalization-reaches-model.test.ts:80-130).

**Use cases**

- A teacher types 'Ada' as name and 'Education' as work so examples are about classrooms.
- A founder writes 'I run a small bakery and I am learning to code in the evenings' in More about you.
- A CLI user runs /personalize set name Ada to change the name from the terminal.
- A person clears the name so the assistant never uses a name (an empty name is treated as an explicit opt out, apps/web/lib/server/__tests__/user-identity.test.ts:104-142).

## 2. User experience

**Where to find it**

- Web and Desktop (Electron shows the hosted web app, AGENTS.md section 5 and apps/desktop/electron/config.ts:17): Settings, Personalization, section 'About you' (apps/web/features/settings/sections/PersonalizationSection.tsx:525-602). The draft's 'Settings, General' is out of date: the fields are in PersonalizationSection, and their storage namespace is named 'general' (PersonalizationSection.tsx:29).
- Mobile: Profile, row 'Personalization' (apps/mobile/app/(app)/profile/index.tsx:196-197), screen titled 'Personalization' (or 'Cloud Personalization' in Cloud mode) with fields 'Full Name', 'Nickname', 'Occupation', 'More about you' (apps/mobile/src/features/settings/personalization/index.tsx:479-560).
- CLI (Managed mode only): slash command /personalize with fields name, work, about (apps/cli/src/cloud/personalization.rs:27-48,134-140).
- VS Code: command 'Code: Personalization' (apps/extension-vscode/package.json command agi-workforce.personalize); items 'What should AGI call you?' and 'What do you do?' (apps/extension-vscode/src/features/personalization/personalization.ts:133-142). About-you text is not offered there.
- Chrome: no editing screen found in apps/extension (a search for personalization terms found only a greeting-name opt-out read in apps/extension/src/features/cloud-bridge/capabilityDocument.ts:28-49).

**Before you start**

- Signed in to an AGI account: the preferences endpoint is user scoped (apps/web/app/api/settings/preferences/route.ts:134-135).
- CLI: the session must be in Managed (Cloud) mode; Local and own-key sessions are refused (apps/cli/src/cloud/personalization.rs, test at the end of the file).
- VS Code: signed in to AGI Cloud, otherwise a warning with a 'Sign in' button appears (personalization.ts:257-264).

**Screens and controls**

- Web: text input 'What should AGI call you?' with hint 'Leave empty to skip names.' (60 characters); select 'What best describes your work?' with a fixed list of roles (apps/web/features/settings/constants/work-descriptions.ts:1-15) and a placeholder 'Select a role...'; text area 'More about you' with counter 'n / 1500' (PersonalizationSection.tsx:531-600).
- Mobile: text inputs with the same 60 and 120 limits (apps/mobile/src/features/settings/personalization/personalizationFieldLimits.ts:1,3), 'More about you' limited to 1500 (index.tsx:65), a Save button in the header with label 'Save personalization settings' (index.tsx:490).
- CLI: /personalize show | set <field> <value> | clear <field>.
- VS Code: quick pick list with input boxes that validate the length.

**Journey**

1. Open the Personalization screen (or run /personalize).
2. Type or select the name, work and background.
3. Web: edits save by themselves 400 ms after the last keystroke and the status line shows 'Saved' (PersonalizationSection.tsx:327-346,651-653). Mobile: tap Save. CLI: the command saves at once. VS Code: each pick saves at once.
4. Start or continue a Cloud chat. The next request includes the profile block (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3992-4004).

**What the person sees and gets**

- Web: 'Loading personalization…' while loading, 'Saved' after a save, red alert with 'Try again' on a failed save, red alert with 'Retry' on a failed load (PersonalizationSection.tsx:609-655).
- Mobile: Save button disabled until a change; an inline error 'Enter your full name.' if a previously set full name is cleared (index.tsx:384-389).
- CLI: '<label> set to <value>.' or '<label> cleared.' (personalization.rs:220-223).
- The person cannot see the exact block sent to the model on Web or Mobile; the CLI shows an 'In effect' overview of output style and instruction files only.

**Settings**

- Namespace 'general' keys preferredName, workDescription, aboutYou (PersonalizationSection.tsx:288-296).
- Namespace 'personalization' keys nickname, occupation, aboutYou written by Mobile and read as a fallback (user-identity.ts:272-281).
- Per-chat switch personalization:false on temporary chats unless the person allows it (apps/web/lib/hooks/useChatStream.ts:836-840).
- Per-project switch 'Use your profile and instructions for AGI' (see F040-05).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: form saves to /api/settings/preferences in two namespaces with debounce, retry and flush on leaving (PersonalizationSection.tsx:273-360).
- Server: formatPersonalizationBlock builds the block and returns null when every field is empty (user-identity.ts:160-175).
- Server: buildCustomInstructionsPreamble reads the 'general' namespace first and falls back to Mobile's 'personalization' namespace for name, work and about-you (user-identity.ts:250-290).
- Server: the block is read for every chat surface except 'api' and skipped when the request says personalization:false (request-processor.ts:3992-4004).
- Web and Desktop local-model turns fetch the same text from /api/memory/local-context when signed in (apps/web/app/api/memory/local-context/route.ts:7-22; apps/web/features/chat/lib/local-personal-context.ts:163-185; useChatStream.ts:4465-4490).
- Mobile Local mode builds its own block on the device (apps/mobile/src/features/memory/services/personalization.ts:17-34; personalContext.ts:36-46) and Mobile Cloud mode sends none from the client because the server assembles it (apps/mobile/stores/chat/chatExecutionStore.ts:2815-2818).
- CLI /personalize reads and patches the account preferences (apps/cli/src/cloud/personalization.rs:142-224).
- VS Code edits name and work through account preferences (personalization.ts:242-283).

**Incomplete**

- VS Code has no item for the about-you text (personalization.ts:131-142 lists only name and work), while the CLI's /personalize does set it ('about', 1500 characters, personalization.rs:42-48).
- Mobile Local mode block does not carry the 'user preference, not system authority' wording that the server block has (personalization.ts:17-34 versus user-identity.ts:176-178).
- Work description is a fixed list on Web (work-descriptions.ts:1-15) but free text of up to 120 characters on Mobile, CLI and VS Code.

**Present but disconnected or switched off**

- Desktop Tauri build has its own CustomInstructionsSettings but it is internal code, not the public Desktop (apps/desktop/src/features/settings/CustomInstructionsSettings.tsx; AGENTS.md section 5).

**Not available**

- Chrome: no screen to edit these fields (apps/extension).
- Goals and interests as a separate field (brief S40.04, status missing on all apps); the free-text About you is the nearest place.

## 4. Required behaviour

**Established requirements**

- The user can tell the assistant what to call them and replies address them that way. (source: brief S40.01)
- The user can give background about themselves that the assistant keeps in mind. (source: brief S40.02)
- The user can state a role or profession and replies are tailored to it. (source: brief S40.03)
- Profile instructions and personalization are canonical Cloud account state that converges across Web, Mobile Cloud, Desktop Cloud and eligible Chrome Managed Cloud. (source: doc: docs/product/definition.md (continuity bullet) and docs/product/requirements.md:268-273)
- Saved text is sent as user preference, not as system authority. (source: apps/web/lib/server/user-identity.ts:176-178)

**Acceptance criteria**

1. After saving name 'Ada' on Web, the next Cloud chat request contains a <user_profile> block with 'preferred name is Ada'.
2. With all three fields empty, no profile block is sent.
3. Typing more than 60 characters in the name field is stopped at 60; about-you stops at 1500.
4. A name saved empty on Web is not replaced by the Mobile nickname.
5. A temporary chat (personalization off) sends no profile block.
6. In CLI Local or own-key mode, /personalize show is refused with the 'nothing is sent to your AGI cloud account in this mode' message.
7. A failed save shows an error with a retry control and keeps the draft.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The same profile should apply on Chrome Managed Cloud turns because the server adds it for every non-api surface [inferred from request-processor.ts:3992-3993].
- A text edited on one surface should show on another after reload because all use the same namespaces [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the person the exact profile text that will be sent, as the CLI does for instruction files.
- [proposed] Give VS Code and Mobile the same 'not system authority' framing as the server block.
- [proposed] Add a Chrome screen or a link to Personalization on the web.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PersonalizationSection | `apps/web/features/settings/sections/PersonalizationSection.tsx` | Web and Desktop form: name, work, about-you, autosave, load and save status. |
| config | WORK_DESCRIPTIONS | `apps/web/features/settings/constants/work-descriptions.ts` | Fixed list of work roles offered on Web. |
| service | formatPersonalizationBlock | `apps/web/lib/server/user-identity.ts` | Builds the <user_profile> text; limits 60, 120, 1500. |
| service | buildCustomInstructionsPreamble | `apps/web/lib/server/user-identity.ts` | Reads both namespaces and the project scope and returns the block. |
| service | request-processor customInstructionsPromise | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Calls the builder per chat turn; skips for the api surface or personalization:false. |
| endpoint | GET/PUT /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Stores and returns namespaces in user_settings; PUT merges patches. |
| table | user_settings | `apps/web/lib/server/user-identity.ts` | settings JSON column read by 'select settings from public.user_settings' (user-identity.ts:38-41). |
| table | profiles | `apps/web/lib/server/user-identity.ts` | display_name read as the full name (readProfileRow). |
| endpoint | GET /api/memory/local-context | `apps/web/app/api/memory/local-context/route.ts` | Gives local-model turns the account instructions text. |
| service | readLocalPersonalContext | `apps/web/features/chat/lib/local-personal-context.ts` | Caches the local-context answer for Web and Electron local turns. |
| screen | Personalization screen | `apps/mobile/src/features/settings/personalization/index.tsx` | Mobile form: Full Name, Nickname, Occupation, More about you. |
| config | personalizationFieldLimits | `apps/mobile/src/features/settings/personalization/personalizationFieldLimits.ts` | 60 and 120 character limits that match the server. |
| service | renderPersonalizationBlock | `apps/mobile/src/features/memory/services/personalization.ts` | Mobile Local mode profile text. |
| service | buildPersonalContextBlocks | `apps/mobile/src/features/memory/services/personalContext.ts` | Wraps profile and memory into system messages. |
| service | cloudSettingsMapping | `apps/mobile/services/cloudSettingsMapping.ts` | Maps Mobile personalization to the 'personalization' and 'general' namespaces. |
| command | /personalize | `apps/cli/src/cloud/personalization.rs` | CLI read, set and clear of account preference fields. |
| command | agi-workforce.personalize | `apps/extension-vscode/src/features/personalization/personalization.ts` | VS Code quick pick for name, work and style. |
| service | accountPreferences | `apps/extension-vscode/src/utils/accountPreferences.ts` | VS Code GET and PUT against /api/settings/preferences. |
| test | personalization-reaches-model | `apps/web/lib/server/__tests__/personalization-reaches-model.test.ts` | Proves name, work and instructions reach the prompt. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person edits the fields; Web debounces 400 ms then PUTs two namespaces. | device | apps/web/features/settings/sections/PersonalizationSection.tsx:281-346 |
| Server merges the patch into user_settings.settings under the namespace and returns the new version. | our servers | apps/web/app/api/settings/preferences/route.ts:98-131 |
| On a Cloud chat turn the server reads both namespaces and the project scope, builds the block and puts it in the stable personalized layer. | our servers | apps/web/lib/server/user-identity.ts:250-290; request-processor.ts:2102-2125,3992-4004 |
| The assembled prompt goes to the chosen model provider. | outside service | [inferred] managed chat routes to a provider through the chat turn pipeline; not traced in this page (SYS-chat-turn-pipeline). |
| Web or Electron local-model turn: the device asks /api/memory/local-context for the text, caches it for 60 seconds, and prepends it as a system message to the on-device model. | device and our servers | apps/web/features/chat/lib/local-personal-context.ts:22,163-185; apps/web/lib/hooks/useChatStream.ts:4465-4500 |
| Mobile Local mode: the device builds the block from its local settings store and prepends it; Cloud mode: the client sends none and the server adds it. | device | apps/mobile/stores/chat/chatExecutionStore.ts:2815-2820 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| preferredName, workDescription, aboutYou, instructions, instructionsEnabled | public.user_settings.settings JSON, namespace 'general' | Yes, read by every surface through the same endpoint | Kept until the person edits or clears it; clearing writes an empty string (web) or null (CLI); no delete flow found |
| Mobile nickname, occupation, aboutYou, customInstructions | user_settings namespace 'personalization' and the device store | Mobile pushes through the settings sync endpoint (apps/mobile/services/cloudSyncEngine.ts:929) | Local mode values stay on the device; cloud values follow the account |
| Full name | profiles.display_name | Mobile patches /api/me (index.tsx:419-426) | Kept with the profile |

**Models and providers.** The block is plain text added to the prompt, so it does not depend on which model or provider answers [inferred]. It is only added for Managed Cloud turns on the server, and for local-model turns through the local-context fetch. For own-key mode on Web the code path was not traced: unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in needed to save or load on every app (preferences route is user scoped; VS Code and CLI refuse without a token). Mobile Local mode keeps the text on the device without an account (personalContext.ts:39). |
| Permissions | Each person edits only their own settings row (getUserScopedDb, route.ts:134-135). No role rules found. |
| Subscription | none found in the code for the About you fields. [inferred] They are available on every plan. |
| Limits and metering | Field limits 60, 120, 1500. The settings route has a rate limit named 'settings-activity' on read and 'settings-org-patch' on write (route.ts:136,180). No usage metering found. |
| Feature flags | Per-request personalization:false for temporary chats (useChatStream.ts:836-840); per-project uses_account_instructions (migration 0310). |
| Model compatibility | Not model specific [inferred]; text only. |
| Provider restrictions | none found in the code for this feature. |
| Local mode | Mobile Local: block built on the device from local settings, no server call. CLI Local and own-key: /personalize refused and nothing is read from the account (personalization.rs tests). Web or Electron with a local model: text comes from our server through /api/memory/local-context, so sign-in and a network call are needed; without it the turn runs without it (personalContextMissing flag, useChatStream.ts:4486). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web fields disabled with 'Loading personalization…'. | PersonalizationSection.tsx:624-630 |
| Load error | Fields stay disabled, alert with Retry. | PersonalizationSection.tsx:631-640; PersonalizationSection.test.tsx:142 |
| Empty | No block is sent when every field is empty. | user-identity.ts:160-175 |
| Save failure | Draft kept, alert 'Your personalization was not saved.' with Try again; saved again only when asked. | PersonalizationSection.tsx:133,313-318,641-649; test at PersonalizationSection.test.tsx:248 |
| Server read failure | Chat continues with no personalization and a warning log 'Custom instructions read failed; sending none'; the chat setup reports 'unavailable'. | request-processor.ts:4000-4004,2355-2361 |
| Name cleared | Stays cleared; Mobile nickname is not used as a fallback. | user-identity.ts:272-281; user-identity.test.ts:104-142 |
| Offline | Web save fails with the error state; local-model turn keeps an already cached context. Mobile Local works offline. | local-personal-context.ts:104-106 comment; personalContext.ts:39 |
| Account switch on Mobile | Dirty draft of the old owner is discarded. | apps/mobile/__tests__/Personalization.test.tsx:386 |
| Accessibility | Labels tied to inputs; Mobile controls carry accessibilityLabel; text at 12px minimum on web. | PersonalizationSection.tsx:531-557; PersonalizationSection.test.tsx:107 |
| Timeout and cancel | not handled in the code for the form itself (no cancel on Web; Mobile asks to discard on back with unsaved changes) | apps/mobile/src/features/settings/personalization/index.tsx:403-410 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/__tests__/personalization-reaches-model.test.ts`: Name, work, instructions reach the block; empty returns null; name case handling; preference framing; Mobile nickname fallback.
- `apps/web/lib/server/__tests__/user-identity.test.ts`: Cleared name or about-you does not fall back to the Mobile copy; switch-off behaviour.
- `apps/web/features/settings/sections/PersonalizationSection.test.tsx`: Layout order, loading, load failure and Retry, saving both namespaces with merge, coalescing and failed-save retry.
- `apps/mobile/__tests__/Personalization.test.tsx`: Mobile screen fields, save, dirty-state, scope change and account switch.
- `apps/mobile/__tests__/PersonalizationFieldLimits.test.tsx`: 60 and 120 character limits.
- `apps/mobile/__tests__/personalization-block.test.ts`: Mobile Local block text.
- `apps/cli/src/cloud/personalization.rs`: Inline tests: refusal in Local and own-key modes; style value validation.

**Test scenarios**

- **Name reaches a Cloud chat**
  1. Sign in on Web.
  2. Open Settings, Personalization, type 'Ada' in 'What should AGI call you?'.
  3. Wait for 'Saved'.
  4. Send 'what is my name?' in a new chat.
  - Expected: The reply uses the name Ada and does not open with it.
- **Empty profile**
  1. Clear name, work and About you.
  2. Send a chat.
  - Expected: Chat setup reports personalization 'none'; no <user_profile> block is sent.
- **Cross-surface**
  1. Set nickname on Mobile in Cloud mode and Save.
  2. Reload Web Personalization.
  - Expected: Web shows the name (Mobile writes the 'general' namespace too, cloudSettingsMapping.ts:151-156).
- **CLI refusal**
  1. Start the CLI in Local mode.
  2. Run /personalize show.
  - Expected: The message says nothing is sent to your AGI cloud account in this mode.
- **Failed save**
  1. Block the network.
  2. Edit About you.
  - Expected: Alert 'Your personalization was not saved.' with Try again; text stays.

**Where to look when it fails**

- Server log 'Custom instructions read failed; sending none' (request-processor.ts:4002).
- Server log 'Failed to read profile identity settings' (user-identity.ts:78).
- Table public.user_settings, column settings, keys 'general' and 'personalization'.
- Chat setup field personalization: off, unavailable, applied or none (request-processor.ts:2355-2361).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/web/040-instructions-preferences-and-personal-style.md)
- Desktop: [70-qa/test-plans/desktop/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/desktop/040-instructions-preferences-and-personal-style.md)
- Mobile: [70-qa/test-plans/mobile/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/mobile/040-instructions-preferences-and-personal-style.md)
- CLI: [70-qa/test-plans/cli/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/cli/040-instructions-preferences-and-personal-style.md)
- VS Code: [70-qa/test-plans/vscode/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/vscode/040-instructions-preferences-and-personal-style.md)

## 10. Gaps and dependencies

- **The brief says Chrome has this done, but no Chrome screen exists.** Affects: Chrome users. Evidence: search of apps/extension found only capabilityDocument.ts:28-49 reading preferredName for a greeting opt-out. Work needed: Decide whether Chrome edits it or links to Web; correct the brief status.
- **Mobile Local-mode block lacks the non-authority wording and uses a different phrasing than the server.** Affects: Mobile Local users. Evidence: personalization.ts:17-34 versus user-identity.ts:176-178. Work needed: Share one formatter in a shared package.
- **Draft/brief line references to GeneralSection.tsx are out of date; the screen is PersonalizationSection.** Affects: Engineers and testers. Evidence: PersonalizationSection.tsx:29,525-602; GeneralSection.tsx has no personalization fields (search). Work needed: Update the brief.
- **Goals and interests field does not exist.** Affects: All apps. Evidence: brief S40.04 missing. Work needed: Add a field or document that About you covers it.
- **VS Code has no About you item.** Affects: VS Code users. Evidence: personalization.ts:131-142. Work needed: Add an input box for aboutYou.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- api:GET /api/settings/preferences
- api:PUT /api/settings/preferences
- api:GET /api/memory/local-context
- table:user_settings
- table:profiles
- store:mobile-local-settings
- SYS-authentication-and-identity
- SYS-memory-projects-and-context
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- F040-05
- file:apps/web/lib/server/user-identity.ts

## Unknown

- Whether own-key (BYOK) chats on Web receive the profile block: the request processor path for own-key was not traced.
- Whether the Chrome extension chat sends a surface value that the server treats as non-api (inferred only).
- Whether /settings/general named in the CLI footer (personalization.rs:180) still resolves to the Personalization screen.
- Whether Mobile pushes instructionsEnabled with the 'general' namespace (no code for it found).
- Whether any plan limits these fields: none found.
