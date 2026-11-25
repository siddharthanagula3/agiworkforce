---
id: "F040-08"
type: "feature"
title: "Learn style from writing samples"
aliases: ["Writing-style examples", "Learn style from writing samples", "Writing sample", "sampleText", "S40.20", "S40.21", "S40.22"]
area: "40 Instructions, preferences, and personal style"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S40.20", "S40.21", "S40.22"]
depends_on: ["F040-09", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "surface:web", "surface:desktop", "mode:local", "mode:own-key", "mode:cloud", "table:user_settings"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F040-08 Learn style from writing samples

A person pastes a sample of their own writing into a custom style on Web (and Desktop through the hosted app), and later replies are asked to match its tone. Connecting a writing source such as documents or email, and reading a learned style summary, are not built anywhere.

Area: [40. Instructions, preferences, and personal style](README.md). Requirement items: [S40.20](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4020), [S40.21](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4021), [S40.22](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4022).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stores a pasted writing sample inside a custom style. When that style is used, a bounded, fenced copy of the sample is added to the instruction so the model can copy tone, vocabulary and sentence shape.

**Why it exists.** Briefs S40.20, S40.21 and S40.22 ask for samples, a connected writing source and a readable learned-style summary, so replies sound like the person.

**Who uses it.** Web and Desktop people who write emails, posts or documents and want drafts in their own voice.

**Problems it solves**

- Replies sound generic and not like the user.
- Describing a voice in words is hard; a sample shows it.
- Pasted samples are treated as data so text inside them cannot give the model orders.

**Use cases**

- Paste three paragraphs of a newsletter and ask for a draft in the same voice.
- Keep two styles: one from formal client emails, one from casual posts.
- Edit the sample later and see replies change.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): composer Style button > 'Create Custom Style' > field 'Writing sample' (StyleSelector.tsx:341-386).
- Mobile, CLI, VS Code, Chrome: no sample field found.
- Connected writing source (S40.21) and learned summary (S40.22): not on any app.

**Before you start**

- An open chat composer on Web or Desktop.
- A name and a style instruction are both required to save (StyleSelector.tsx:165, 406).

**Screens and controls**

- 'Name' input (placeholder 'Style name').
- 'Writing sample' textarea, 3 rows, placeholder 'Paste a writing sample and we'll match its tone...'.
- 'Style instruction' textarea.
- Buttons 'Save' or 'Save changes', and 'Cancel'.

**Journey**

1. Open Style > Create Custom Style.
2. Type a name.
3. Paste a sample; if the instruction is empty and the sample is longer than 20 characters, the instruction fills with 'Match the tone, vocabulary, and sentence structure of my writing sample.'
4. Edit the instruction if wanted and press Save.
5. The style becomes active and the menu closes.
6. Send a message; the sample goes with the instruction on that turn.

**What the person sees and gets**

- The Style button shows the custom style's name.
- Replies follow the voice; no summary of what was learned is shown.
- No error is shown if the account save fails; the local copy stays (style-store.ts:313-315).

**Settings**

- None specific. The sample lives inside each custom style and syncs with the account namespace response-style.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: sampleText is a field of every custom style (style-store.ts:91-97).
- Web: the sample is trimmed, cut to 1200 characters and wrapped by fenceUntrustedContent with a rule not to follow instructions in it or quote it back (style-store.ts:348-363).
- Web: only a custom style adds the sample; presets do not (style-store.ts:378).
- Web: edits to the sample change what the model is told (writing-sample test).
- Web: delete confirmation says the sample is removed from the account on every device (StyleSelector.tsx:121-136).

**Incomplete**

- The form textarea has no maxLength, while only the first 1200 characters are sent, so a longer paste is saved but partly ignored and nothing tells the person (StyleSelector.tsx:378-385; style-store.ts:356).
- Sample is optional; the style only needs name and instruction (StyleSelector.tsx:165).
- Desktop 'partial' in the status table comes from the same hosted web code [inferred]; no separate Desktop code was opened.

**Present but disconnected or switched off**

- The sample is not used by the Web code composer because the selector is hidden there (CodeComposer.tsx:2158).

**Not available**

- S40.21 connect a writing source (documents, email): no code on any app.
- S40.22 learned writing-style summary: no code on any app.
- Samples on Mobile, CLI, VS Code and Chrome: none found.
- A decision record says the CLI does not add 'an output style derived from a sample' (doc: docs/decisions/2026-09-27-founder-decisions.md:467).

## 4. Required behaviour

**Established requirements**

- The user can give samples of their own writing so replies match their voice. (source: S40.20 (brief))
- The user can connect a source of their writing (documents or email) for the assistant to learn their style from. (source: S40.21 (brief))
- The user can read a summary of the writing style the assistant has learned from them. (source: S40.22 (brief))
- Custom styles sync to the account through the user_settings namespace response-style. (source: doc: docs/decisions/wire-or-cut.md (row 'Styles and response length sync'))
- The CLI does not add an output style derived from a sample (terminal scope). (source: doc: docs/decisions/2026-09-27-founder-decisions.md:467)

**Acceptance criteria**

1. Saving a custom style with a sample keeps the sample when the style is reopened for editing.
2. A turn with that style sends text that contains the sample inside a writing_sample block.
3. A sample longer than 1200 characters sends only the first 1200.
4. A sample that says 'ignore previous instructions' does not change the model's behaviour beyond tone [needs a live run].
5. A style without a sample adds no sample text.
6. After deleting the style the sample is no longer sent.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the sample goes into the request text, in Cloud and own-key modes it reaches the chosen provider; in Local mode it stays with the on-device model [inferred from useChatStream.ts:4473-4489].
- The person should be told when the sample is longer than what is used. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a character counter and warn above 1200 characters.
- [proposed] Build S40.21 as a consent-based import of selected documents, and S40.22 as a readable, editable summary the person can delete.
- [proposed] Add samples to custom styles on Mobile when custom styles are added.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| store | CustomStyle.sampleText and writingSampleBlock | `apps/web/features/chat/stores/style-store.ts` | Stores the sample and builds the fenced, bounded block. |
| component | StyleSelector create/edit form | `apps/web/features/chat/components/Composer/StyleSelector.tsx` | The 'Writing sample' textarea and auto-fill of the instruction. |
| service | fenceUntrustedContent | `packages/utils (imported as @agiworkforce/utils)` (not found) | Wraps the sample as untrusted data; exact file not opened. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Calls getStyleInstruction on send (lines 3923, 4553). |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Sends the instruction as a system message to Cloud or the local model. |
| service | preferences-client | `apps/web/app/settings/_lib/preferences-client.ts` | fetchStoredPreferenceNamespace and savePreferenceNamespace used for sync. |
| endpoint | PUT/GET /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Saves and reads the response-style namespace for the signed-in user. |
| table | user_settings | `apps/web/db/neon/0028_user_settings.sql` | JSON settings per user that holds the namespace. |
| config | MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH | `packages/contracts/cloud-contracts/src/managed-cloud-settings-client.ts` | Names the preferences endpoint path. |
| test | writing-sample test | `apps/web/features/chat/stores/style-store.writing-sample.test.ts` | Covers sample in instruction, fencing, bound, empty sample, edit. |
| test | account-sync test | `apps/web/features/chat/stores/style-store.account-sync.test.ts` | Covers saving styles to the account and held changes. |
| test | StyleSelector test | `apps/web/features/chat/components/Composer/StyleSelector.test.tsx` | Covers form fields labels and edit flow. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person pastes a sample; the form fills a default instruction if empty. | device | StyleSelector.tsx:150-159 |
| Save calls addCustomStyle or updateCustomStyle with the trimmed sample. | device | StyleSelector.tsx:161-176; style-store.ts:184-206 |
| After 600 ms the custom styles list, samples included, is saved to the account namespace response-style. | our servers | style-store.ts:300-317; route.ts:185-250 |
| On each send the sample is trimmed, cut to 1200 characters and fenced as untrusted. | device | style-store.ts:353-363 |
| The text is sent as a system message with the turn; the model then writes the reply. | device and our servers | useChatStream.ts:4533-4535 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Writing sample text inside each custom style | Browser localStorage 'agi-response-style' and the user_settings JSON for the account (table:user_settings) | Yes, debounced 600 ms after create, edit or delete | Deleted from the account when the style is deleted; the confirmation says it cannot be recovered (StyleSelector.tsx:125-126) |

**Models and providers.** The sample is ordinary instruction text, so any model on any route can receive it. In Cloud or own-key mode it is sent to the selected provider with the turn [inferred]. No model-specific handling was found.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Saving to the account needs sign-in; a failed read keeps the local copy and holds changes until the account copy is read (style-store.ts:229-248, 285-298). Local-only use works signed out [inferred]. |
| Permissions | The preferences endpoint requires a CSRF token, a rate limit check and a user-scoped database session (route.ts:185-195). |
| Subscription | none found in the code |
| Limits and metering | Sample bound of 1200 characters per turn (style-store.ts:348). Endpoint rate limit key 'settings-org-patch' (route.ts:189). Maximum size of the stored namespace: unknown. |
| Feature flags | none found in the code |
| Model compatibility | Works with any model that accepts a system message; quality of voice matching is not measured in the code. |
| Provider restrictions | none found in the code |
| Local mode | Web with an on-device model: the sample is added to the local system blocks and does not need our servers for the reply (useChatStream.ts:4473-4489). Account sync of the style itself still talks to our servers when signed in. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty sample | No sample block is added. | style-store.ts:353-355 |
| Sample over 1200 characters | Silently cut to 1200 on send; saved in full. | style-store.ts:356 |
| Sample contains instructions | Fenced as untrusted with a rule to ignore instructions in it. | style-store.ts:350-362 |
| Account copy not yet read | Edits are held and merged after the account copy loads; nothing is overwritten before it is read. | style-store.ts:281-298 |
| Save to account fails | Swallowed; local value kept; next change retries. | style-store.ts:313-315 |
| Offline | Local cache renders; sync waits. | style-store.ts:235-239 |
| Cancel the form | Form closes and values reset; stored style untouched. | StyleSelector.tsx:178-182 |
| Accessibility | Each field has a visible label tied to the input. | StyleSelector.tsx:360-400 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/stores/style-store.writing-sample.test.ts`: Sample included, fenced, bounded, absent when empty, edit changes the instruction.
- `apps/web/features/chat/stores/style-store.account-sync.test.ts`: Changes held until the account copy is read, then saved.
- `apps/web/features/chat/components/Composer/StyleSelector.test.tsx`: Create and edit form with labelled fields.

**Test scenarios**

- **Create a style with a sample**
  1. Open Style > Create Custom Style.
  2. Name it 'My voice', paste a 300-character sample.
  3. Check the instruction field, then Save.
  - Expected: Instruction auto-filled with the matching sentence; style becomes active and is listed.
- **Sample reaches the request**
  1. Use the style and send a message with network inspection open.
  - Expected: The first system message holds the sample inside a writing_sample block.
- **Long sample**
  1. Paste 3000 characters, save, send.
  - Expected: Only the first 1200 characters appear in the request.
- **Another device**
  1. Create the style on Web device 1.
  2. Sign in on device 2 and open a composer.
  - Expected: The style with its sample appears after the account copy is read.
- **Missing features**
  1. Look in Settings and the composer for a way to connect documents or email, and for a learned style summary.
  - Expected: Neither exists.

**Where to look when it fails**

- Network: PUT /api/settings/preferences, body namespace 'response-style'.
- Server log line 'Failed to persist user settings' on write error (route.ts).
- Local store 'agi-response-style' in browser storage.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/web/040-instructions-preferences-and-personal-style.md)
- Desktop: [70-qa/test-plans/desktop/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/desktop/040-instructions-preferences-and-personal-style.md)

## 10. Gaps and dependencies

- **Connecting a writing source (S40.21) is not built.** Affects: All apps. Evidence: Brief status all missing; no code found. Work needed: Design consent, source picker, import pipeline and deletion.
- **A learned writing-style summary (S40.22) is not built.** Affects: All apps. Evidence: Brief status all missing. Work needed: Create a summary generated from samples, show it, allow edit and delete.
- **Samples are missing on Mobile, CLI, VS Code and Chrome.** Affects: Those apps' users. Evidence: Brief S40.20; mobile styles are presets only (chatExecutionStore.ts:1189-1195). Work needed: Add custom styles with samples to Mobile first, others per decision on scope.
- **No warning when a sample is longer than the 1200 characters used.** Affects: Web and Desktop users. Evidence: StyleSelector.tsx:378-385 has no limit; style-store.ts:356. Work needed: Add a counter or raise the limit.
- **Sample voice quality has no measured check.** Affects: Product quality. Evidence: No eval file found for it. Work needed: Add a sample-based evaluation.
- Not built on: Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F040-09
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- surface:web
- surface:desktop
- mode:local
- mode:own-key
- mode:cloud
- table:user_settings

## Unknown

- Where the Desktop 'done' status for S40.20 comes from: the brief lists no Desktop code, and the hosted app is assumed.
- Maximum accepted size of the stored response-style namespace.
- How well replies match a sample: no evaluation was found.
- The exact file of fenceUntrustedContent was not opened.
