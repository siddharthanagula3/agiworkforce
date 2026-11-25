---
id: "F050-08"
type: "feature"
title: "Lyrics, song structure and length"
aliases: ["Lyrics input", "Song-structure guidance", "Short and long generation modes", "S50.21 to S50.23"]
area: "50 Audio overviews, speech generation, and music"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S50.21", "S50.22", "S50.23"]
depends_on: ["F050-07", "F050-10", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-voice-and-media", "SYS-security-and-privacy", "SYS-api-and-contracts", "surface:web", "surface:mobile", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F050-08 Lyrics, song structure and length

Lyrics, song structure and length would let a person supply lyrics, guide verse, chorus and bridge order, and pick a short or long generation mode for music. Nothing is built on any of the six apps, and it depends on music generation, which also does not exist.

Area: [50. Audio overviews, speech generation, and music](README.md). Requirement items: [S50.21](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5021), [S50.22](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5022), [S50.23](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5023).

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

**What it does.** Would add three inputs to music creation: lyrics text (S50.21), structure guidance such as verse, chorus, bridge (S50.22) and a short or long mode (S50.23). Today none exists.

**Why it exists.** The brief states it as a Should (brief: S50.21 to S50.23). It only has meaning once music generation exists (F050-07).

**Who uses it.** Nobody yet. Intended: songwriters and creators who already have words.

**Problems it solves**

- Lets a person keep their own words instead of accepting invented ones.
- Gives control over song shape and length and so cost.

**Use cases**

- Paste a finished chorus and ask for a pop setting.
- Ask for verse, chorus, verse, bridge, chorus.
- Choose short mode for a quick preview before a long render.

## 2. User experience

**Where to find it**

- Web: not present.
- Desktop: not present.
- Mobile: not present.
- CLI: not present.
- VS Code extension: not present.
- Chrome extension: not present.

**Before you start**

- Music generation (F050-07), which does not exist.

**Screens and controls**

- None exist. Brief controls: lyrics box, structure guide, short or long mode.

**Journey**

1. Not available. [proposed] 1. Open music creation. 2. Paste or write lyrics. 3. Arrange sections. 4. Choose short or long. 5. Generate.

**What the person sees and gets**

- None.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing. Search for lyrics across apps, packages, crates, docs and services found no lyric input.

**Incomplete**

- The chat system prompt forbids reproducing song lyrics at length for copyright, which is a text rule, not a lyrics feature (apps/web/lib/prompts/chat-system-prompt.ts:993).

**Present but disconnected or switched off**

- Support-agent policy treats requests to write a song or lyrics as out of scope for support (apps/web/lib/support/agent/policy/out-of-scope.ts:91). This concerns the support bot only.

**Not available**

- Lyrics input, structure guidance and short or long mode on all six apps and the API (brief: S50.21 to S50.23 missing).

## 4. Required behaviour

**Established requirements**

- The user supplies lyrics for generated music. (source: S50.21 brief)
- The user guides song structure (verse, chorus, bridge). (source: S50.22 brief)
- The user chooses short or long generation mode. (source: S50.23 brief)

**Acceptance criteria**

1. A lyrics field accepts pasted text and the result uses those words when vocals are chosen.
2. Section order given by the person is followed in the output.
3. Short and long modes produce clearly different lengths.
4. Over-long lyrics are rejected with a message that states the limit.
5. The copyright rule for reproducing others' lyrics is still honoured in chat.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Lyrics are user content and must follow the same privacy and moderation rules as other user text [inferred from AGENTS.md section 6].
- Long mode likely costs more and needs its own metering [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer section chips (verse, chorus, bridge) that can be dragged to reorder.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | chat system prompt copyright rule | `apps/web/lib/prompts/chat-system-prompt.ts` | Forbids long reproduction of song lyrics (line 993). Not a lyrics feature. |
| config | support out-of-scope policy | `apps/web/lib/support/agent/policy/out-of-scope.ts` | Treats song and lyric writing as outside support scope (lines 91, 96). |
| test | chat system prompt lineage test | `apps/web/lib/prompts/__tests__/chat-system-prompt-joined-lineages.test.ts` | Matched the search term; covers the prompt text. |
| config | MODEL_TYPES | `packages/contracts/types/src/model-catalog.ts` | Reserved 'music' type (line 239). |
| config | ArtifactType | `packages/contracts/types/src/conversation.ts` | Reserved 'music' artifact type (line 89). |
| config | audit missing list | `audit/missing/050-audio-overviews-speech-generation-and-music.md` | Open rows for S50.21 to S50.23. |
| config | area brief | `knowledge-base/data/area-briefs/050-audio-overviews-speech-generation-and-music.md` | Source of the Should lines. |
| config | memory content policy | `packages/contracts/context/src/memory-content-policy.ts` | Matched search for lyrics; rule on what is kept in memory. Relevance to lyrics unknown. |
| service | speech route (adjacent) | `apps/web/app/api/voice/speech/route.ts` | Existing audio route, speech only, limit 4,000 characters (line 48). |
| config | speech voice list | `apps/web/lib/voice/speech-voices.ts` | Fixed voices for spoken replies; not singing. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No flow exists. Lyrics typed into chat are plain text sent to a chat model. | our servers | No lyrics or music route found; apps/web/app/api/voice has live, speech, transcribe only. |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No lyrics or structure data stored. | none found in the code | not applicable | not applicable |

**Models and providers.** No model or provider is wired for lyrics-to-music. Unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code |
| Feature flags | none found in the code |
| Model compatibility | Unknown; depends on a future music model. |
| Provider restrictions | Unknown. |
| Local mode | No local lyrics-to-music exists in the code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states | not handled in the code because the feature does not exist | No lyrics, structure or length code found. |
| Copyrighted lyrics pasted by a person | Not handled for music. In chat the model is told not to reproduce lyrics at length. | apps/web/lib/prompts/chat-system-prompt.ts:993 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/prompts/__tests__/chat-system-prompt-joined-lineages.test.ts`: Prompt text; matched the search term. Whether it asserts the lyrics rule was not read.

**Test scenarios**

- **No lyrics control**
  1. Open each app and look for a lyrics field in any audio screen.
  - Expected: None today.
- **Lyrics used in output**
  1. After build, paste two lines and choose vocal.
  2. Play the result.
  - Expected: The sung words match.
- **Structure order**
  1. Set verse, chorus, bridge, chorus.
  2. Generate.
  - Expected: Sections appear in that order.
- **Short vs long**
  1. Generate once in short and once in long mode.
  - Expected: Long is longer and metered higher.

**Where to look when it fails**

- Check audit/missing/050-audio-overviews-speech-generation-and-music.md for open rows.
- Search for a lyrics route after any build.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No lyrics, structure or length modes** Affects: All six apps and API. Evidence: Brief S50.21 to S50.23 missing; audit/missing/050-*.md. Work needed: Build after F050-07, add inputs, validation and limits.
- **No limit for lyrics length defined** Affects: Future music users. Evidence: none found in the code. Work needed: Set a limit in shared configuration, not a constant.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F050-07
- F050-10
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-voice-and-media
- SYS-security-and-privacy
- SYS-api-and-contracts
- surface:web
- surface:mobile
- mode:cloud

## Unknown

- Maximum lyrics length and languages supported.
- What 'long' means in duration.
- Whether the memory content policy affects stored lyrics.
- Provider support for lyric alignment.
