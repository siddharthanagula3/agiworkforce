---
id: "F085-03"
type: "feature"
title: "Writing-style sample"
aliases: ["Writing-style personalization (S85.04)", "Custom style", "Create Custom Style", "Writing sample", "Response style selector", "StyleSelector"]
area: "85 Personalization and data settings"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "n/a", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S85.04"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "mode:local", "SYS-chat-turn-pipeline", "SYS-sync-and-continuity", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "table:user_settings", "api:PUT /api/settings/preferences", "F085-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F085-03 Writing-style sample

On web and desktop, a person picks a preset style and length for one chat from the composer, or creates a named custom style with a pasted writing sample. The sample is added to that chat's request as fenced data so replies match its tone. Mobile, VS Code, Chrome have no sample control.

Area: [85. Personalization and data settings](README.md). Requirement items: [S85.04](../../10-requirements/capabilities/085-personalization-and-data-settings.md#s8504).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the person choose per chat a style (Default, Concise, Explanatory, Learning, Formal or a custom one) and length (Brief, Default, Thorough). A custom style carries a name, an instruction and an optional writing sample of up to 1200 characters (apps/web/features/chat/stores/style-store.ts:20-38,348).

**Why it exists.** People want replies in their own voice, as Claude's styles feature allows, without rewriting instructions.

**Who uses it.** Web and Desktop (hosted web) chat users.

**Problems it solves**

- Drafts that sound generic.
- Needing a different tone for one chat without changing account settings.

**Use cases**

- Paste an email the person wrote and chat to draft replies in that voice.
- Pick Concise for a quick question.
- Create a style called 'Pirate' with an instruction.

## 2. User experience

**Where to find it**

- Web and Desktop: the chat composer's Response style control (apps/web/features/chat/components/Composer/StyleSelector.tsx:195,347).
- Settings > Personalization 'Reset response style' also clears it (PersonalizationSection.tsx:367-372).
- Mobile has a chat style preset (not a sample); no writing-sample field was found (grep for sampleText in apps/mobile found none).

**Before you start**

- A chat composer on web or desktop. Custom styles sync to the account when signed in (style-store.ts:118,252-260).

**Screens and controls**

- Preset list with descriptions: Default 'Your style from Settings', Concise 'Short and direct', Explanatory 'Reasoning and context', Learning 'Step by step, with check-ins', Formal 'Formal register' (StyleSelector.tsx:30-36).
- Length options Brief 'Shortest answer that works', Default 'Your length from Settings', Thorough 'Full background and examples' (style-store.ts:337-346).
- 'Create Custom Style' form: 'Style name', 'Paste a writing sample and we'll match its tone...', 'Style instruction (e.g. 'Write like a pirate')' (StyleSelector.tsx:347-395).
- Edit and Delete per custom style; delete asks and says it is removed on every device and cannot be recovered (StyleSelector.tsx:121-135,319-329).

**Journey**

1. Open the style control in the composer.
2. Pick a preset and length, or press 'Create Custom Style', paste a sample, save.
3. Send a message; the instruction text is attached to that request.
4. Replies follow the style until the selection changes.

**What the person sees and gets**

- The active style is shown in the control with accent colour (StyleSelector.test.tsx:29-43).
- No preview of the effect on a reply was found.

**Settings**

- Account default style and length come from Settings > Personalization (F085-02).
- Selection per conversation is stored on the browser (style-store.ts:252-262).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- getStyleInstruction builds an override notice, the style text, the length text and, for a custom style, the fenced writing sample capped at 1200 characters (style-store.ts:348-381).
- The sample is fenced as untrusted data and told never to be followed as instructions or quoted back (style-store.ts:350-363).
- The composer attaches the text as styleInstruction on send (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3923,4553).
- The stream hook adds it as a system message for Cloud requests (apps/web/lib/hooks/useChatStream.ts:4533-4534) and as a system block for on-device model chats (4473-4492).
- Custom styles are saved to the account group 'response-style' 600 ms after a change and merged with held edits made before the account copy was read (style-store.ts:118,270-345).
- Per-conversation selection is kept in browser storage under agi-response-style (style-store.ts:252-262).

**Incomplete**

- How the server treats a client-sent system message was not opened, so whether the sample reaches the model unchanged is unconfirmed.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Mobile: no writing sample or custom style (brief missing; code search agrees).
- VS Code: none (brief).
- Chrome: none (brief).
- CLI: not listed in the brief and not examined.

## 4. Required behaviour

**Established requirements**

- The user can give a sample of their own writing or a named custom style and replies imitate it. (source: S85.04 Should (brief))
- The sample is treated as data and bounded. (source: apps/web/features/chat/stores/style-store.ts:350-363)

**Acceptance criteria**

1. A custom style with a sample produces a request whose system text contains a writing_sample fenced block no longer than 1200 characters.
2. A preset style adds no sample block.
3. Deleting a style asks for confirmation and removes it after reload on another browser.
4. A style edit made before the account copy loaded is kept after load.
5. An instruction hidden inside the sample is not followed (manual check).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The sample works in both Cloud and on-device model chats because both paths add styleInstruction.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add the same control to Mobile and a link in Chrome and VS Code.
- [proposed] Show which style is active inside the chat.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| store | useStyleStore | `apps/web/features/chat/stores/style-store.ts` | Selection, custom styles, instruction builder, account sync. |
| component | StyleSelector | `apps/web/features/chat/components/Composer/StyleSelector.tsx` | Composer control and create form. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Passes styleInstruction on send (lines 3923,4553). |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Adds the instruction as a system message (lines 4473-4534). |
| service | preferences client | `apps/web/app/settings/_lib/preferences-client.ts` | Reads and saves the response-style group. |
| endpoint | GET/PUT /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Stores group 'response-style'. |
| service | fenceUntrustedContent | `packages/platform/utils` | Fences the sample (imported from @agiworkforce/utils; path not opened). |
| component | PersonalizationSection reset | `apps/web/features/settings/sections/PersonalizationSection.tsx` | Calls resetToDefault (line 370). |
| table | user_settings | `apps/web/app/api/settings/preferences/route.ts` | Holds customStyles (group 'response-style'). |
| store | browser localStorage agi-response-style | `apps/web/features/chat/stores/style-store.ts` | Local cache of styles and per-chat selections. |
| test | style-store writing-sample tests | `apps/web/features/chat/stores/style-store.writing-sample.test.ts` | Sample sent, fenced, bounded. |
| test | style-store account-sync tests | `apps/web/features/chat/stores/style-store.account-sync.test.ts` | Held edits and account merge. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person creates a style; it is stored locally and queued for account save. | device | style-store.ts:150-175 |
| After 600 ms the custom styles are saved to the account group. | device and our servers | style-store.ts:270-345 |
| On send the composer builds the instruction text from the selection. | device | ChatComposerNew.tsx:3923; style-store.ts:365-381 |
| The hook sends it as a system message with the chat request, or adds it to an on-device model's prompt. | device and our servers | useChatStream.ts:4473-4534 |
| The model replies using the sample as a guide. | outside service | [inferred] the model is called through the chat pipeline |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Custom styles (name, instruction, sample, created time) | user_settings group 'response-style' and browser localStorage | Yes across browsers when signed in | Deleted by the person; deletion says it cannot be recovered |
| Per-chat selection | browser localStorage | No | Until cleared by the browser or reset |

**Models and providers.** The text goes to whichever model handles the chat. Results differ by model [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signing in is needed to sync styles; local selection works without account sync. |
| Permissions | Own styles only. |
| Subscription | none found in the code. |
| Limits and metering | Sample limit 1200 characters; style group saved debounced 600 ms. |
| Feature flags | none found in the code. |
| Model compatibility | Not model-specific in code. |
| Provider restrictions | none found in the code. |
| Local mode | On-device model chats on web or desktop add the same instruction locally (useChatStream.ts:4473-4492). Account sync of styles needs the network. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Account copy unreadable | Edits stay local and are merged later. | style-store.ts:206-232 |
| Edit cancelled | Stored style unchanged. | StyleSelector.test.tsx:109 |
| Empty sample | No sample block is added. | style-store.ts:353-357 |
| Style deleted while selected | Selection falls back to default. | style-store.ts:175-190 |
| Retired preset names | Mapped to current presets. | style-store.ts:27-33 |
| Offline | Save to account silently retries on the next change. | style-store.ts:337-343 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/stores/style-store.writing-sample.test.ts`: Sample sent, fenced as data, bounded, absent for presets, composition after edits.
- `apps/web/features/chat/stores/style-store.account-sync.test.ts`: Keeping local changes while unread, merging held changes, saving.
- `apps/web/features/chat/components/Composer/StyleSelector.test.tsx`: Active styling, editing, cancel and create flows.

**Test scenarios**

- **Sample reaches request**
  1. Create a style with a 2000-character sample
  2. Send a message
  3. Inspect the outgoing request
  - Expected: A fenced writing_sample block of at most 1200 characters.
- **Cross-browser sync**
  1. Create a style on browser A
  2. Open browser B signed in to the same account
  - Expected: The style is listed.
- **Reset**
  1. Select a custom style
  2. Press 'Reset response style' in Personalization
  - Expected: Selection returns to Default.

**Where to look when it fails**

- Browser localStorage key agi-response-style.
- user_settings group 'response-style'.
- Network call PUT /api/settings/preferences with namespace response-style.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/085-personalization-and-data-settings.md](../../70-qa/test-plans/web/085-personalization-and-data-settings.md)
- Desktop: [70-qa/test-plans/desktop/085-personalization-and-data-settings.md](../../70-qa/test-plans/desktop/085-personalization-and-data-settings.md)

## 10. Gaps and dependencies

- **No writing-sample control on Mobile, VS Code or Chrome.** Affects: Mobile, VS Code, Chrome. Evidence: S85.04 brief; mobile grep for sampleText found none. Work needed: Add a control or decide it is web-only.
- **Server handling of a client-sent system message for style is not confirmed.** Affects: Web and Desktop. Evidence: useChatStream.ts:4533-4534. Work needed: Check the request processor's treatment and moderation of client system segments.
- **No visible proof in chat that the style applied.** Affects: Web. Evidence: No indicator found. Work needed: Optional indicator.
- Not built on: Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- mode:local
- SYS-chat-turn-pipeline
- SYS-sync-and-continuity
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- table:user_settings
- api:PUT /api/settings/preferences
- F085-02

## Unknown

- Server treatment of client-sent system messages.
- Whether CLI has any style sample feature.
- What the mobile chat style presets contain beyond the system prompt builder (chatExecutionStore.ts:2776-2781).
- The path of the fence helper inside packages.
