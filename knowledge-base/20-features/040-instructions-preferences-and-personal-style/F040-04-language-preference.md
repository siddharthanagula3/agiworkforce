---
id: "F040-04"
type: "feature"
title: "Language preference"
aliases: ["Response language", "Reply language", "Language preference", "Match my message", "S40.14", "S40.15", "Units and formats"]
area: "40 Instructions, preferences, and personal style"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S40.14", "S40.15"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "api:PUT /api/settings/preferences", "table:user_settings", "SYS-chat-turn-pipeline", "F040-02", "file:packages/contracts/types/src/response-style-preferences.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F040-04 Language preference

Sets the language replies are written in, separate from the interface language. Default is 'Match my message'. Available on Web and Desktop, Mobile, CLI and VS Code through account preferences. Units, date and number format preferences do not exist on any app.

Area: [40. Instructions, preferences, and personal style](README.md). Requirement items: [S40.14](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4014), [S40.15](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4015).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Stores a language tag (for example fr or pt-BR) or 'auto'. When set, the prompt gets 'Respond in <language name> unless the user asks for another language.' as the first style line (packages/contracts/types/src/response-style-preferences.ts:145-152,184-191).

**Why it exists.** The interface language is a different choice: a person may read the app in one language and write to the assistant in another (response-style-preferences.ts:21-26).

**Who uses it.** Multilingual people and non-English speakers.

**Problems it solves**

- Assistant answers in the wrong language.
- Setting the display language should not change answers.

**Use cases**

- A German-interface user keeps English answers by leaving 'Match my message'.
- A user picks French so all replies are French.
- A CLI user runs /personalize set language pt-BR.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Personalization, 'Style and tone', select 'Response language' (PersonalizationSection.tsx:429-442). Options: 'Match my message' then each selectable language in its own name.
- Mobile: Personalization, chips 'Response Language' (index.tsx:621-629).
- CLI: /personalize set language <auto|tag> (personalization.rs:83-89,253-262).
- VS Code: 'Code: Personalization', item 'Language' with an input box (personalization.ts:199-220).
- Chrome: none found.
- Units and formats: none found on any app.

**Before you start**

- Signed in to save to the account; Mobile Local keeps it on the device.

**Screens and controls**

- Web select; Mobile chips; CLI argument; VS Code input box that accepts 'en', 'de', 'pt-BR' and empty for auto.

**Journey**

1. Open the control.
2. Choose a language or Match my message.
3. Save (Web autosave, Mobile Save).
4. New Cloud chats answer in that language unless asked otherwise.

**What the person sees and gets**

- Web 'Saved'. CLI '<Reply language> set to <value>.' VS Code shows the value in the item description.
- No confirmation of the language name sent.

**Settings**

- Namespace 'personalization' key responseLanguage.
- Display language is a separate setting (General, 'Display Language', GeneralSection.tsx:531).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server normalises the tag with a regular expression and falls back to auto for bad values (response-style-preferences.ts:145-152).
- Language name is produced with Intl.DisplayNames in English (response-style-preferences.ts:171-177).
- Web, Mobile, CLI and VS Code save the field (PersonalizationSection.tsx:230-234,299; cloudSettingsMapping.ts:137-150; personalization.rs:83-89; personalization.ts:199-220).
- Test: user-identity.test.ts:79-103 checks that language is stated and omitted when not chosen.

**Incomplete**

- CLI language validation accepts tags by hand-written rules (personalization.rs:253-262) that differ from the shared regular expression [inferred, not compared line by line].
- Web stores any string as responseLanguage when it is non-empty; the server then validates it (PersonalizationSection.tsx:231-234).

**Present but disconnected or switched off**

- none found

**Not available**

- Units, date and number format preferences (brief S40.15) on every app: a search for unit system and format preference names found nothing.
- Chrome control.

## 4. Required behaviour

**Established requirements**

- The user can set the language replies are written in, separate from the interface language. (source: brief S40.14)
- The user can set units and date or number formatting preferences that replies follow. (source: brief S40.15)

**Acceptance criteria**

1. Choosing French on Web adds 'Respond in French unless the user asks for another language.' to the prompt.
2. Leaving Match my message adds no language line.
3. Changing Display Language does not change Response language.
4. A malformed tag stored in settings is treated as auto.
5. CLI refuses an invalid tag with a message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Language line comes first because a wrong language makes later lines moot (response-style-preferences.ts:179-183).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add units and formats fields (metric or imperial, date order, number separators) in the same section.
- [proposed] Use one shared language-tag validator for CLI and server.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | RESPONSE_LANGUAGE_AUTO and readResponseLanguage | `packages/contracts/types/src/response-style-preferences.ts` | Validates and renders the language line. |
| component | PersonalizationSection language select | `apps/web/features/settings/sections/PersonalizationSection.tsx` | Web control. |
| config | SELECTABLE_LANGUAGES | apps/web/app/i18n/index (not found) (not found) | Languages offered in the select (imported at PersonalizationSection.tsx:15). |
| service | formatResponseStyleLines | `apps/web/lib/server/user-identity.ts` | Produces the line on the server. |
| screen | Personalization (mobile) language chips | `apps/mobile/src/features/settings/personalization/index.tsx` | Mobile control. |
| service | cloudSettingsMapping | `apps/mobile/services/cloudSettingsMapping.ts` | Syncs responseLanguage. |
| command | /personalize language | `apps/cli/src/cloud/personalization.rs` | CLI control and validation. |
| command | agi-workforce.personalize Language item | `apps/extension-vscode/src/features/personalization/personalization.ts` | VS Code control. |
| endpoint | PUT /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Saves it. |
| test | user-identity.test.ts | `apps/web/lib/server/__tests__/user-identity.test.ts` | Language line present or absent. |
| test | response-style-preferences.test.ts | `apps/web/lib/preferences/__tests__/response-style-preferences.test.ts` | Language tag normalising and order. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a language. | device | PersonalizationSection.tsx:441 |
| Saved to the account namespace. | our servers | route.ts:98-131 |
| Server validates the tag, resolves a name and writes the line first among style lines. | our servers | response-style-preferences.ts:147-191 |
| Model replies in that language. | outside service | [inferred] |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| responseLanguage | user_settings namespace 'personalization'; Mobile Local device store | Yes for the account | Reset writes 'auto' |

**Models and providers.** Text instruction; the model must be able to write the language: not checked in code (unknown).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in needed to save to the account. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | project uses_account_style turns the language line off for that project (project dialog text says 'style, length and language'). |
| Model compatibility | Depends on the model's language ability: not checked in code. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local applies it on the device (personalization.ts:25-30). Web local model gets it from our server. CLI refuses outside Managed mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Invalid tag | Treated as auto. | response-style-preferences.ts:147-152 |
| Unknown language name | The raw tag is used as the name. | response-style-preferences.ts:171-177 |
| Loading, load or save failure | Same as F040-01. | PersonalizationSection.tsx:609-655 |
| User asks for another language in a message | The line says unless the user asks for another language. | response-style-preferences.ts:189 |
| Offline | Save fails with the error state on Web. | PersonalizationSection.tsx:313 |
| Accessibility | Labelled select; Mobile chips are accessible buttons [inferred]. | PersonalizationSection.tsx:674-700 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/__tests__/user-identity.test.ts`: Language stated, technical level and formatting, omitted when none.
- `apps/web/lib/preferences/__tests__/response-style-preferences.test.ts`: Well-formed tags kept; language named first.
- `apps/mobile/__tests__/Personalization.test.tsx`: Mobile screen and Reset (includes language reset).
- `apps/cli/src/cloud/personalization.rs`: Inline tests; language validation itself has no test found.

**Test scenarios**

- **Set French**
  1. Choose French in Response language on Web.
  2. Ask in English for a recipe.
  - Expected: Reply in French.
- **Interface vs reply**
  1. Set Display Language to German.
  2. Keep Response language on Match my message.
  3. Write in English.
  - Expected: Interface German, reply English.
- **Bad tag from CLI**
  1. Run /personalize set language 1234.
  - Expected: Refused with a message.
- **Units missing**
  1. Look for a units or date-format control on every app.
  - Expected: None exists (confirms the gap).

**Where to look when it fails**

- user_settings.personalization.responseLanguage value.
- If reply language is wrong, inspect the <response_style> block for the 'Respond in' line.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/web/040-instructions-preferences-and-personal-style.md)
- Desktop: [70-qa/test-plans/desktop/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/desktop/040-instructions-preferences-and-personal-style.md)
- Mobile: [70-qa/test-plans/mobile/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/mobile/040-instructions-preferences-and-personal-style.md)
- CLI: [70-qa/test-plans/cli/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/cli/040-instructions-preferences-and-personal-style.md)
- VS Code: [70-qa/test-plans/vscode/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/vscode/040-instructions-preferences-and-personal-style.md)

## 10. Gaps and dependencies

- **Units and date or number formats do not exist.** Affects: All apps. Evidence: no code found; brief S40.15 missing everywhere. Work needed: Design fields, add to shared types, server lines and each screen.
- **Brief shows Chrome as done for language; no control found.** Affects: Chrome. Evidence: no personalization code in apps/extension. Work needed: Correct status or build control.
- **CLI language validation differs from the shared validator.** Affects: CLI. Evidence: personalization.rs:253-262 vs response-style-preferences.ts:145. Work needed: Share the validator.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- mode:local
- api:PUT /api/settings/preferences
- table:user_settings
- SYS-chat-turn-pipeline
- F040-02
- file:packages/contracts/types/src/response-style-preferences.ts

## Unknown

- How model quality in each language is handled: not in code.
- Whether Chrome should offer language: no requirement beyond the brief.
- Whether Intl.DisplayNames output is accepted by all models: untested.
