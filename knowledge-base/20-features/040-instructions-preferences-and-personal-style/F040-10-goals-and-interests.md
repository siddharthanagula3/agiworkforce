---
id: "F040-10"
type: "feature"
title: "Goals and interests"
aliases: ["Goals and interests", "S40.04", "More about you (nearest existing field)"]
area: "40 Instructions, preferences, and personal style"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S40.04"]
depends_on: ["SYS-memory-projects-and-context", "SYS-authentication-and-identity", "SYS-api-and-contracts", "SYS-chat-turn-pipeline", "F040-11", "surface:web", "surface:mobile", "mode:cloud", "table:user_settings"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F040-10 Goals and interests

A place to record goals and interests so the assistant can use them. The brief marks it missing on every app and no dedicated goals or interests field exists. A free-text 'More about you' box on Web and Mobile mentions interests and is the nearest feature.

Area: [40. Instructions, preferences, and personal style](README.md). Requirement items: [S40.04](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4004).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a person state what they are working toward and what they care about, so replies take that into account. Today no dedicated control does this.

**Why it exists.** Brief item S40.04: 'The user can record their goals and interests so the assistant can take them into account.'

**Who uses it.** Web, Desktop, Mobile, CLI, VS Code and Chrome users in the future; today nobody can use a dedicated control.

**Problems it solves**

- Repeating long-term context in every chat.
- Replies that ignore what the person is trying to achieve.

**Use cases**

- 'I am studying for a nursing exam in March' shapes examples.
- 'I like hiking and photography' shapes suggestions.
- A founder records quarterly goals to keep advice on target.

## 2. User experience

**Where to find it**

- No dedicated goals or interests control on any app.
- Nearest: Web Settings > Personalization, textarea 'More about you' with hint 'Interests, values or background AGI should keep in mind.' (PersonalizationSection.tsx:572-600). Desktop shows the hosted web app (doc: AGENTS.md section 5) [inferred].
- Mobile: Personalization settings field 'More about you', placeholder 'Interests, values or background to keep in mind' (apps/mobile/src/features/settings/personalization/index.tsx:551-561).
- CLI: personalization key aboutYou exists (cloud/personalization.rs:45); how it is shown was not opened further.

**Before you start**

- Signed-in account for the nearest field to be saved to the account [inferred].

**Screens and controls**

- 'More about you' multi-line text with a character counter 'n / limit' (Web).

**Journey**

1. Open Settings > Personalization.
2. Type interests or background in 'More about you'.
3. Save.
4. New Managed Cloud turns include the text as 'More about the user, in their words: ...' (user-identity.ts:188) [as built for background, not a goals feature].

**What the person sees and gets**

- A counter shows characters used; saving shows the settings save result (not opened in detail).

**Settings**

- More about you (aboutYou), stored in the personalization namespace.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Mobile have a free-text field called 'More about you' whose hint names interests, values and background (PersonalizationSection.tsx:572-600; mobile personalization/index.tsx:551-561).
- The server turns aboutYou into a line in the identity block, limited to 1500 characters (user-identity.ts:150, 163-188).

**Incomplete**

- The field is one box for background; there is no separate goals list, no interests tags, and no per-field on/off or review of what is used.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Dedicated goals field: no code on Web, Desktop, Mobile, CLI, VS Code or Chrome.
- Dedicated interests field: same.
- Brief S40.04 has no code locations; a search of the Web settings, mobile personalization, CLI personalization, VS Code personalization and shared types found only the 'More about you' mentions.

## 4. Required behaviour

**Established requirements**

- The user can record their goals and interests so the assistant can take them into account. (source: S40.04 (brief))
- Brief status: missing on Web, Desktop, Mobile, CLI, VS Code, Chrome. (source: S40.04 (brief))

**Acceptance criteria**

1. A person can enter goals and interests in a labelled field in Settings on each app.
2. The text is saved to the account and shown again after reload.
3. A new chat's request includes the text when personalization is on.
4. Turning personalization off, or a Temporary chat, leaves it out.
5. The person can clear it in one action.
6. In Local mode the text stays on the device unless the person chooses otherwise.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because 'More about you' already covers interests, a first step could relabel or extend it rather than add a new store. [inferred]
- It should follow the same trust boundaries as other personal context: Local data not routed to Cloud without consent (doc: AGENTS.md section 6).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add two labelled fields, 'Goals' and 'Interests', beside 'More about you', sharing the same account namespace and the same send path.
- [proposed] Show the saved text under the effective instructions view (F040-11).
- [proposed] Decide with the owner whether 'More about you' already satisfies S40.04 and update the brief status.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PersonalizationSection | `apps/web/features/settings/sections/PersonalizationSection.tsx` | Web 'More about you' textarea and save. |
| service | user-identity | `apps/web/lib/server/user-identity.ts` | Normalises aboutYou (max 1500) and writes it into the identity lines for the model. |
| screen | Mobile personalization | `apps/mobile/src/features/settings/personalization/index.tsx` | Mobile 'More about you' field. |
| service | cloudSettingsMapping | `apps/mobile/services/cloudSettingsMapping.ts` | Maps Mobile personalization to the cloud settings (listed by the brief for S40.02). |
| service | CLI personalization | `apps/cli/src/cloud/personalization.rs` | aboutYou key for the CLI (line 45). |
| endpoint | /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Account storage for personalization namespaces. |
| test | personalization-reaches-model test | `apps/web/lib/server/__tests__/personalization-reaches-model.test.ts` | Checks personalization text reaches the model request. |
| service | VS Code personalization | `apps/extension-vscode/src/features/personalization/personalization.ts` | Quick pick edits for name, role, style, level, formatting, length, language; no goals or interests item found. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person types in 'More about you' and saves; the value is sent to the account personalization namespace. | device and our servers | PersonalizationSection.tsx:259-293 |
| On a Managed Cloud turn the server reads the value, trims it to 1500 characters and adds it to the identity block. | our servers | user-identity.ts:150-188 |
| A dedicated goals or interests path does not exist. | device | No code found |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| aboutYou text (nearest field) | Account settings JSON (table:user_settings) and local caches on each app | Yes through the preferences endpoint [inferred from PersonalizationSection.tsx:293] | Kept until the person edits or clears it; deletion path not traced |

**Models and providers.** The text is added as instruction text, so any model receives it on Managed Cloud turns. How Local and own-key turns use it on Web and Mobile was not traced.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Needs sign-in for account storage [inferred]. |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | 1500 characters for aboutYou on the server (user-identity.ts:150). |
| Feature flags | none found in the code |
| Model compatibility | Any model. |
| Provider restrictions | none found in the code |
| Local mode | A dedicated goals feature does not exist, so nothing runs. For 'More about you', the CLI states that account preferences reach Managed Cloud turns only and are not applied in Local or own-key sessions (claude_parity.rs:1400-1407); Web local-model turns read a local personal context (useChatStream.ts:4465-4472). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Feature absent | No control, no error; the person can only use 'More about you'. | No code found |
| Text over the limit | Web input is cut to the maximum when typed; the server trims to 1500. | PersonalizationSection.tsx:593; user-identity.ts:163 |
| Empty value | The line is left out of the identity block. | user-identity.ts:169-188 |
| Offline, retry, timeout | not handled in the code opened for this feature. | Not traced |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/__tests__/personalization-reaches-model.test.ts`: Personalization values reach the model request (exact cases not listed here).

**Test scenarios**

- **Confirm absence**
  1. Open personalization settings on each app.
  2. Look for 'Goals' or 'Interests' controls.
  - Expected: None exist; only 'More about you' on Web and Mobile.
- **Nearest field reaches the model**
  1. Enter 'I like hiking' in More about you and save.
  2. Start a new Cloud chat and ask for weekend ideas.
  - Expected: The request identity block contains 'More about the user, in their words: I like hiking'.
- **Temporary chat**
  1. Repeat in a Temporary chat.
  - Expected: Personalization is left out unless the chat is set to personalized (useChatStream.ts:4465-4467).

**Where to look when it fails**

- Request body of the chat call: system identity block text.
- Server file user-identity.ts for the aboutYou line.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No dedicated goals or interests field on any app.** Affects: All six apps. Evidence: Brief S40.04 all missing; searches found only 'More about you'. Work needed: Decide scope with the owner, then add fields on the shared personalization path.
- **Brief status and code differ in meaning: a free-text field mentions interests.** Affects: Planning accuracy. Evidence: PersonalizationSection.tsx:581. Work needed: Decide if S40.04 is satisfied by relabelling.
- **No way to see that goals or interests are used in a chat.** Affects: All apps. Evidence: No effective-instruction view on Web, Mobile (F040-11). Work needed: Include in the effective instructions view.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-memory-projects-and-context
- SYS-authentication-and-identity
- SYS-api-and-contracts
- SYS-chat-turn-pipeline
- F040-11
- surface:web
- surface:mobile
- mode:cloud
- table:user_settings

## Unknown

- Whether the owner treats 'More about you' as covering S40.04.
- How the CLI and VS Code show or edit aboutYou: only cloud/personalization.rs:45 was seen.
- How Local and own-key turns on Web and Mobile use the field.
- Whether any design document for goals exists: none found under docs/product or docs/decisions.
