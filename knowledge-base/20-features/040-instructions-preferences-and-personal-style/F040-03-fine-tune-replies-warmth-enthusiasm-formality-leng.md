---
id: "F040-03"
type: "feature"
title: "Fine-tune replies (warmth, enthusiasm, formality, length, headings, emoji, technical depth)"
aliases: ["Fine-tune replies", "Characteristics", "Response length", "Technical level", "Preferred formatting", "Warmth", "Enthusiasm", "Headers and lists", "Emoji", "S40.06", "S40.07", "S40.09", "S40.10", "S40.11", "S40.12", "S40.13"]
area: "40 Instructions, preferences, and personal style"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S40.06", "S40.07", "S40.09", "S40.10", "S40.11", "S40.12", "S40.13"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "mode:local", "api:PUT /api/settings/preferences", "table:user_settings", "store:agi-response-style", "SYS-chat-turn-pipeline", "F040-02", "F040-05", "file:packages/contracts/types/src/response-style-preferences.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F040-03 Fine-tune replies (warmth, enthusiasm, formality, length, headings, emoji, technical depth)

Individual dials for replies: four Less/Default/More traits (Warmth, Enthusiasm, Headers and lists, Emoji), plus Response length, Technical level and Preferred formatting. Saved on the account in Personalization; Web also has a per-chat length in the composer. There is no separate formality dial: formal tone is the Formal style preset.

Area: [40. Instructions, preferences, and personal style](README.md). Requirement items: [S40.06](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4006), [S40.07](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4007), [S40.09](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4009), [S40.10](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4010), [S40.11](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4011), [S40.12](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4012), [S40.13](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4013).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Each chosen value becomes one guidance sentence in the <response_style> block (packages/contracts/types/src/response-style-preferences.ts:184-213). Traits stored as 0 to 100 are shown as Less (20), Default (50) or More (80) (same file:109-127). A trait near neutral adds nothing.

**Why it exists.** So people can tune tone and shape of answers without writing instructions.

**Who uses it.** Anyone on Web, Desktop (Electron web view), Mobile; CLI and VS Code can set them through account preferences.

**Problems it solves**

- Replies too wordy, too formal or too full of emoji.
- Replies pitched at the wrong technical level.
- Wrong shape: prose where a list is wanted.

**Use cases**

- A beginner picks Technical level Beginner so terms are defined.
- A user sets Emoji to Less so none appear.
- A chat needs a brief answer: pick Brief in the composer Response length group.
- A CLI user runs /personalize set warmth more.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Personalization, 'Style and tone' (Response length, Technical level, Preferred formatting) and 'Characteristics' (Warmth, Enthusiasm, Headers and lists, Emoji) (PersonalizationSection.tsx:390-471). The draft's 'Settings, General' is out of date.
- Web composer: style menu group 'Response length' with Brief, Default, Thorough (StyleSelector.tsx:253-274; style-store.ts:338-346).
- Mobile: Personalization screen: chips 'Response Length' (Default, Shorter, Longer), 'Technical Level', and a 'Response Style' card with a row per trait that opens a sheet (index.tsx:604-650).
- CLI: /personalize set <warmth|enthusiasm|headings|emoji> <less|default|more>, technical, formatting, length (personalization.rs:27-118,134-140).
- VS Code: Personalization quick pick: Technical level, Formatting, Length, and Tone items Warmth, Enthusiasm, Headers and lists, Emoji (personalization.ts:158-238).
- Chrome: none found.

**Before you start**

- Signed in to save to the account.
- Mobile Local mode keeps them on the device.

**Screens and controls**

- Web: native select boxes with labelled rows; trait options Less, Default, More.
- Mobile: chips and a bottom sheet for each trait (TraitLevelSheet).
- VS Code: three choices per trait: Default, a low text and a high text (personalization.ts:226-236).
- CLI: argument validation messages such as 'Warmth takes less, default or more.' (personalization.rs:252).

**Journey**

1. Open the screen or command.
2. Choose a value for each dial.
3. Web autosaves; Mobile needs Save; CLI and VS Code save at once.
4. Send a chat; the matching sentences are in the prompt.

**What the person sees and gets**

- Web 'Saved' status line; Mobile screen closes on Save.
- No preview of the sentences sent.
- CLI /personalize show lists each field with less, default, more or 'not set' (personalization.rs:165-203).

**Settings**

- Namespace 'personalization' keys technicalLevel, preferredFormatting, preferredLength, warmth, enthusiasm, headersLists, emoji.
- localStorage per-conversation length key agi-response-style.
- Per-project switch 'Use your response style' covers all of these (F040-05).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: seven account controls save to the 'personalization' namespace and the server converts them to prompt lines (PersonalizationSection.tsx:299,394-471; user-identity.ts:146-148,285; response-style-preferences.ts:184-213).
- Web per-chat length: Brief and Thorough add a sentence; Default adds nothing (style-store.ts:330-336,365-381).
- Mobile: same fields, thresholds 75 and 25 for the local block, scores 20/50/80 saved (personalization.ts:5-6; response-style-preferences.ts:111-115).
- CLI: all four traits, technical level, formatting and length can be set with validation (personalization.rs:56-117,226-262).
- VS Code: all of the above except per-chat length (personalization.ts:158-238).

**Incomplete**

- Formality has no dial on any app; the nearest control is the Formal style preset (response-style-preferences.ts:53). The brief's formality entry (S40.07) cites trait code that does not contain formality.
- The CLI's own chat styles have no length control (brief S40.06 CLI missing; output_styles.rs has none).
- Per-chat length exists only on Web; Mobile length is account-wide only (index.tsx:604-611).

**Present but disconnected or switched off**

- none found

**Not available**

- Per-chat length on Mobile, CLI, VS Code and Chrome.
- Any of these dials on Chrome.

## 4. Required behaviour

**Established requirements**

- The user can set how long replies should be and replies follow it. (source: brief S40.06)
- The user can choose a more or less formal register. (source: brief S40.07)
- The user can ask for warmer or cooler tone. (source: brief S40.09)
- More or less enthusiasm. (source: brief S40.10)
- Headings and lists versus prose. (source: brief S40.11)
- More or less emoji. (source: brief S40.12)
- How technical replies should be. (source: brief S40.13)

**Acceptance criteria**

1. Setting Emoji to Less adds 'Do not use emoji.' to the account style lines.
2. Setting Warmth to Default sends no warmth line.
3. Setting Technical level to Expert adds the expert sentence.
4. Choosing Brief in the Web composer adds the short-answer sentence for that conversation only.
5. Out-of-range trait values stored by any app are clamped to 0..100.
6. Invalid CLI value is refused with a message listing allowed values.
7. With the project switch 'Use your response style' off, none of these lines are sent for chats in that project.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Trait scores between 31 and 69 act as Default on the server band (response-style-preferences.ts:79,118-122 uses a 20 point band around 50).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a formality trait or document that Formal style is the only control.
- [proposed] Bring per-chat length to Mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | TRAIT_GUIDANCE and normalizer | `packages/contracts/types/src/response-style-preferences.ts` | All dial values, guidance sentences, clamping and level bands. |
| component | PersonalizationSection | `apps/web/features/settings/sections/PersonalizationSection.tsx` | Web dials. |
| service | buildCustomInstructionsPreamble | `apps/web/lib/server/user-identity.ts` | Adds the style lines to the prompt. |
| store | useStyleStore (length) | `apps/web/features/chat/stores/style-store.ts` | Per-conversation Brief, Default, Thorough. |
| component | StyleSelector length group | `apps/web/features/chat/components/Composer/StyleSelector.tsx` | Response length buttons. |
| screen | Personalization (mobile) | `apps/mobile/src/features/settings/personalization/index.tsx` | Chips, trait rows and sheet. |
| service | renderPersonalizationBlock | `apps/mobile/src/features/memory/services/personalization.ts` | Mobile Local sliders to sentences. |
| service | cloudSettingsMapping | `apps/mobile/services/cloudSettingsMapping.ts` | Maps traits to the account namespace. |
| command | /personalize | `apps/cli/src/cloud/personalization.rs` | Sets traits, level, formatting, length. |
| command | agi-workforce.personalize | `apps/extension-vscode/src/features/personalization/personalization.ts` | VS Code dial items. |
| endpoint | PUT /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Saves the namespace. |
| table | user_settings | `apps/web/lib/server/user-identity.ts` | Holds the values. |
| test | response-style-preferences.test.ts | `apps/web/lib/preferences/__tests__/response-style-preferences.test.ts` | Normalising and lines. |
| test | personalization-reaches-model.test.ts | `apps/web/lib/server/__tests__/personalization-reaches-model.test.ts` | Mobile slider lines reach the model. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person sets a dial; value stored as a string choice or a 0..100 score. | device | PersonalizationSection.tsx:362-365; responseStyleTraitScore (response-style-preferences.ts:124-127) |
| Value saved to the account namespace. | our servers | route.ts:98-131 |
| On each Cloud turn the server normalises the namespace and writes one line per non-default dial, in the order language, level, formatting, style, length, traits. | our servers | response-style-preferences.ts:184-213; user-identity.ts:285 |
| Per-chat length sentence is prepended by the client as a system message. | device | style-store.ts:365-381; useChatStream.ts:4533 |
| Provider generates the reply. | outside service | [inferred] SYS-chat-turn-pipeline |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Dial values | user_settings namespace 'personalization'; Mobile Local device store | Yes for the account; Mobile Local no | Reset writes defaults |
| Per-chat length | localStorage agi-response-style | No | Default selections are removed |

**Models and providers.** Text only; no model or provider specific handling found [inferred]. Whether a given model obeys the sentences is not tested in the repository (unknown).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in needed to save on the account. |
| Permissions | none found in the code. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | personalization:false on temporary chats; project uses_account_style. |
| Model compatibility | Not model specific [inferred]. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local applies the dials on the device. CLI /personalize and Web account dials for a local model need the account and our server. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Value not recognised | Falls back to the neutral value. | response-style-preferences.ts:129-133,154-169; response-style-preferences.test.ts:10 |
| Trait not a number | Ignored. | response-style-preferences.ts:135-143 |
| Trait near neutral | No line is sent. | response-style-preferences.ts:204-210; test line 69 |
| Loading, load failure, save failure | Same as F040-01 (controls disabled, Retry, Try again). | PersonalizationSection.tsx:609-655 |
| Mobile in-between score | Replaced only for the trait whose level is picked. | Personalization.test.tsx:178 |
| CLI display | Scores up to 30 show less, from 70 more. | personalization.rs:187-196 |
| Offline | Per-chat length works offline; account dials need the network to save. | PersonalizationSection.tsx:313 |
| Accessibility | Each select has a label element; Mobile trait rows have accessibility labels. | PersonalizationSection.tsx:674-700; index.tsx:234 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/preferences/__tests__/response-style-preferences.test.ts`: Normalising, ordering of lines, neutral traits ignored.
- `apps/web/lib/server/__tests__/personalization-reaches-model.test.ts`: Slider ends, clamping, non-finite values, style block with profile.
- `apps/web/lib/server/__tests__/user-identity.test.ts`: Language, technical level and formatting reach the prompt.
- `apps/web/features/settings/sections/PersonalizationSection.test.tsx`: Four characteristics render as Less, Default, More selects.
- `apps/mobile/__tests__/Personalization.test.tsx`: Trait levels, picking a level and saving its score.
- `apps/mobile/__tests__/personalization-block.test.ts`: High and low slider sentences.

**Test scenarios**

- **Emoji off**
  1. Set Emoji to Less on Web.
  2. Ask for a friendly greeting.
  - Expected: Reply has no emoji.
- **Neutral sends nothing**
  1. Leave all dials at Default and Not set.
  2. Send a chat.
  - Expected: No <response_style> block (setup reports none if profile also empty).
- **Composer Brief**
  1. Choose Brief in Response length.
  2. Ask a one-line question.
  - Expected: One-line answer; a new chat is back on Default.
- **CLI invalid value**
  1. In Managed mode run /personalize set warmth hot.
  - Expected: 'Warmth takes less, default or more.'
- **Mobile cloud sync**
  1. Set Warmth More and Save in Cloud mode.
  2. Open Web Personalization.
  - Expected: Web shows Warmth More.

**Where to look when it fails**

- Compare namespace 'personalization' in user_settings.
- Chat setup personalization field.
- Normalizer in response-style-preferences.ts shows what is dropped.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/web/040-instructions-preferences-and-personal-style.md)
- Desktop: [70-qa/test-plans/desktop/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/desktop/040-instructions-preferences-and-personal-style.md)
- Mobile: [70-qa/test-plans/mobile/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/mobile/040-instructions-preferences-and-personal-style.md)
- CLI: [70-qa/test-plans/cli/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/cli/040-instructions-preferences-and-personal-style.md)
- VS Code: [70-qa/test-plans/vscode/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/vscode/040-instructions-preferences-and-personal-style.md)

## 10. Gaps and dependencies

- **No formality dial exists.** Affects: All apps. Evidence: TRAIT_GUIDANCE has warmth, enthusiasm, headersLists, emoji only (response-style-preferences.ts:86-97). Work needed: Add a trait or correct brief S40.07.
- **Brief cites GeneralSection.tsx for these controls; they live in PersonalizationSection.tsx.** Affects: Engineers. Evidence: PersonalizationSection.tsx:394-471. Work needed: Update the brief references.
- **Per-chat length only on Web.** Affects: Mobile, CLI, VS Code, Chrome. Evidence: style-store.ts; mobile index.tsx has account length only. Work needed: Decide parity.
- **Mobile Local uses cut-offs 75 and 25 while the server uses a 20 point band.** Affects: Mobile Local users with in-between scores. Evidence: personalization.ts:5-6; response-style-preferences.ts:79. Work needed: Use the shared level function.
- **No proof that models obey a dial; only prompt text is tested.** Affects: All. Evidence: tests only check prompt lines. Work needed: Add an eval or manual check.
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
- store:agi-response-style
- SYS-chat-turn-pipeline
- F040-02
- F040-05
- file:packages/contracts/types/src/response-style-preferences.ts

## Unknown

- Whether Chrome has any length or dial control: none found.
- Whether models obey the dial text: no eval in the files read.
- Whether Mobile pushes dial changes immediately or on the next sync cycle.
- Exact label of the Web composer length chip beyond 'Response length' (aria-label at StyleSelector.tsx:258).
