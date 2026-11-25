---
id: "F050-07"
type: "feature"
title: "Music generation and style"
aliases: ["Original music generation", "Vocal or instrumental choice", "Genre, mood, instrumentation and tempo controls", "S50.15 to S50.20", "music model type"]
area: "50 Audio overviews, speech generation, and music"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S50.15", "S50.16", "S50.17", "S50.18", "S50.19", "S50.20"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-voice-and-media", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-files-artifacts-and-storage", "SYS-api-and-contracts", "SYS-local-inference", "surface:web", "surface:mobile", "surface:desktop", "mode:cloud", "mode:own-key", "mode:local"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F050-07 Music generation and style

Music generation and style would let a person create an original track and choose vocal or instrumental, genre, mood, instruments and tempo. No music generation code exists in any of the six apps. Only a placeholder 'music' label exists in shared type lists.

Area: [50. Audio overviews, speech generation, and music](README.md). Requirement items: [S50.15](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5015), [S50.16](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5016), [S50.17](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5017), [S50.18](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5018), [S50.19](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5019), [S50.20](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5020).

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

**What it does.** Would turn a text request into an original piece of music and expose style controls: vocal or instrumental (S50.16), genre (S50.17), mood (S50.18), instrumentation (S50.19) and tempo as BPM or feel (S50.20). Today it does nothing: the brief marks all six items missing on every app (brief: S50.15 to S50.20).

**Why it exists.** The brief lists it as a Should so AGI Workforce can match assistants that offer audio creation. The product guidance asks to evaluate music and sound generation, supported formats and usage restrictions before building (doc: docs/product/competitive-guidance.md:207, docs/product/competitive-guidance.md:416). No founder decision for or against music was found [inferred from search of docs/decisions].

**Who uses it.** Nobody yet. Intended users would be creators, marketers and hobbyists who want a short original track without a music tool.

**Problems it solves**

- Would remove the need to leave the assistant for a separate music tool.
- Would let a person steer style with plain controls instead of long prompts.

**Use cases**

- Create a calm instrumental track for a video intro at a slow tempo.
- Ask for an upbeat vocal pop song with guitar and drums.
- Pick mood 'tense' and genre 'electronic' for a game trailer.

## 2. User experience

**Where to find it**

- Web: not present. No music control found in apps/web (search for music, lyrics found none in UI code).
- Desktop: not present.
- Mobile: not present.
- CLI: not present.
- VS Code extension: not present.
- Chrome extension: not present.

**Before you start**

- None can apply because the feature does not exist. Account and plan rules are unknown.

**Screens and controls**

- None exist. Brief controls that should exist: vocal/instrumental switch, genre, mood, instruments, tempo (brief: S50.16 to S50.20) [proposed layout left to design].

**Journey**

1. Not available. [proposed] 1. Person opens a music option. 2. Describes the track. 3. Sets vocal or instrumental, genre, mood, instruments, tempo. 4. Starts generation. 5. Plays the result.

**What the person sees and gets**

- None. A person who types a music request in chat gets a normal text reply from a chat model; no music file is produced [inferred from no music route or tool found].

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing generates music. Search for music, lyrics, spotify, cover art and custom voice across apps, packages, crates, docs and services found no generation code.

**Incomplete**

- The word 'music' exists only as a label: a model type in the shared type list (packages/contracts/types/src/model-catalog.ts:239), an artifact type (packages/contracts/types/src/conversation.ts:89), and copies in desktop (apps/desktop/src/types/chat.ts:15, apps/desktop/src/constants/llm.ts:44, apps/desktop/src/runtime/TauriRuntime.ts:286, apps/desktop/src/runtime/persistedCloudMessage.ts:136). No model in the catalog files carries it (search of models.json and models.curation.json for the label found none).

**Present but disconnected or switched off**

- An ElevenLabs connector entry describes 'Generate speech, sound effects, and music' on desktop and is marked comingSoon (apps/desktop/src/features/connectors/connectorDefinitions.ts:870-881). It is a catalog listing, not a music feature. The web entry says 'speech generation, voice cloning, and audio production' (apps/web/features/connectors/data/connectors.ts:427-428) and the web catalog registers it as an api-key connector with runtime-discovered actions (apps/web/lib/connectors/catalog.ts:206). Whether it works end to end was not established.

**Not available**

- Music generation on web, desktop, mobile, CLI, VS Code and Chrome (brief: S50.15 to S50.20 all 'missing').
- No API route for music (brief status 'api missing').

## 4. Required behaviour

**Established requirements**

- The user can generate an original piece of music. (source: S50.15 brief)
- The user chooses vocal or instrumental output. (source: S50.16 brief)
- The user sets genre. (source: S50.17 brief)
- The user sets mood. (source: S50.18 brief)
- The user sets instrumentation. (source: S50.19 brief)
- The user gives tempo guidance as BPM or feel. (source: S50.20 brief)
- Audio work such as music must be evaluated for supported formats, timing and usage restrictions before building. (source: docs/product/competitive-guidance.md:416)

**Acceptance criteria**

1. A person on each app can start a music request and receives an audio file or playable track.
2. The request accepts a vocal or instrumental choice and the result matches it.
3. Genre, mood, instruments and tempo values appear in the request and change the result.
4. A free-plan, paid-plan and signed-out person each get the outcome the subscription rules define, with a clear message when denied.
5. Failures (provider error, quota, timeout) show a readable message and allow retry.
6. The provider and model used are shown and come from the model catalog, not a literal in code.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Needs a model of type 'music' in the catalog before any consumer can route to it, because the type exists but no model uses it [inferred].
- Metering must count music generation in the shared subscription system like other paid media [inferred from SYS requirement].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Start with web and mobile, then share one contract in a shared package.
- [proposed] Offer a small preset list for genre and mood read from one shared list, not hardcoded per app.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | MODEL_TYPES | `packages/contracts/types/src/model-catalog.ts` | Lists 'music' as a model type at line 239. No model uses it. |
| config | ArtifactType | `packages/contracts/types/src/conversation.ts` | Lists 'music' as an artifact type at line 89. No renderer found. |
| config | desktop chat ArtifactType copy | `apps/desktop/src/types/chat.ts` | Desktop copy of the artifact type list including 'music' (line 15). |
| config | desktop LLM model type | `apps/desktop/src/constants/llm.ts` | Desktop model type union including 'music' (line 44). |
| service | TauriRuntime artifact kinds | `apps/desktop/src/runtime/TauriRuntime.ts` | Artifact kind list including 'music' (line 286). |
| service | persistedCloudMessage artifact kinds | `apps/desktop/src/runtime/persistedCloudMessage.ts` | Artifact kind list including 'music' (line 136). |
| store | skillMarketplaceStore creative tags | `apps/desktop/src/stores/skillMarketplaceStore.ts` | Keyword list with 'music' for skill search (line 104). |
| config | ElevenLabs desktop connector entry | `apps/desktop/src/features/connectors/connectorDefinitions.ts` | Coming-soon listing that mentions music (lines 870-881). |
| config | ElevenLabs web connector entry | `apps/web/features/connectors/data/connectors.ts` | Web listing, speech generation and voice cloning summary (lines 427-428). |
| config | web connector catalog | `apps/web/lib/connectors/catalog.ts` | Registers elevenlabs as an api-key connector (line 206). |
| config | connector trust copy | apps/web/../../packages/contracts/cloud-contracts/src/connector-trust-copy.ts (not found) | Marks elevenlabs 'read-write' (line 97) and names it (line 200). |
| config | directory categorize | `apps/web/lib/connectors/directory/categorize.ts` | Sorts directory items into a media category using the word music (line 403). |
| config | audit missing list | `audit/missing/050-audio-overviews-speech-generation-and-music.md` | Records S50.15 to S50.20 as open, wave 4, for all apps and api. |
| config | model catalog curation | `packages/ai/model-registry/catalog/models.curation.json` | The only place a model may be added; holds no music model. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Nothing runs. No route, tool or screen starts a music job. A music request typed in chat is handled as ordinary text. | our servers | No music code found by search across apps, packages, crates, services; chat-system-prompt only forbids reproducing song lyrics (apps/web/lib/prompts/chat-system-prompt.ts:993). |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No music data is created. | none found in the code | not applicable | not applicable |

**Models and providers.** No music model or provider is wired. The type 'music' is reserved in the shared list (packages/contracts/types/src/model-catalog.ts:239). The only audio provider code found is OpenAI text to speech for read-aloud (apps/web/app/api/voice/speech/route.ts:102-105), which is not music.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code |
| Permissions | none found in the code |
| Subscription | none found in the code. Music is not mentioned in plan rules found. |
| Limits and metering | none found in the code |
| Feature flags | none found in the code. The ElevenLabs connector entry on desktop uses comingSoon: true (apps/desktop/src/features/connectors/connectorDefinitions.ts:870-881). |
| Model compatibility | No catalog model has type music. Compatibility unknown. |
| Provider restrictions | Unknown. ElevenLabs is named in a connector listing only. |
| Local mode | No local music generation exists. Whether local music is possible on device is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All states (loading, error, retry, cancel, timeout, offline) | not handled in the code because the feature does not exist | No music code found. |
| Person asks chat for music | A text reply only. No audio. [inferred] | No music route found; apps/web/app/api/voice has only live, speech, transcribe. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- none found

**Test scenarios**

- **Confirm no music control on web**
  1. Open the web app chat.
  2. Look in the composer, tools menu and settings for a music option.
  - Expected: None exists today. When built, a music option appears.
- **Ask chat for a track**
  1. Type 'make a 30 second instrumental track' in chat on each app.
  - Expected: Today a text reply with no audio. After build, a playable track.
- **Catalog check**
  1. Inspect packages/ai/model-registry/catalog/models.curation.json for a model of type music.
  - Expected: None today; after build exactly one routed slot per default.
- **Free vs paid access**
  1. After build, request music as Free and as a paid plan.
  - Expected: Behaviour matches the subscription rules and shows a clear denial where applicable.

**Where to look when it fails**

- Search the repo for 'music' to see whether any new route or tool was added.
- audit/missing/050-audio-overviews-speech-generation-and-music.md shows whether the rows are still open.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No music generation at all** Affects: All six apps and the API. Evidence: Brief S50.15 to S50.20 missing on every app; audit/missing/050-audio-overviews-speech-generation-and-music.md. Work needed: Choose a provider route, add a catalog model of type music, add a server route, usage metering and a UI on each app.
- **No catalog model of type music** Affects: Routing for any future feature. Evidence: packages/contracts/types/src/model-catalog.ts:239 lists the type; no model entry found. Work needed: Add a curated model then run the sync step.
- **No decision on whether and how music is offered** Affects: Product scope. Evidence: No decision found under docs/decisions for S50.15 to S50.20. Work needed: Record a decision with plan, provider and usage limits.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-voice-and-media
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-files-artifacts-and-storage
- SYS-api-and-contracts
- SYS-local-inference
- surface:web
- surface:mobile
- surface:desktop
- mode:cloud
- mode:own-key
- mode:local

## Unknown

- Which provider or model would generate music.
- Which plans would include music and the limits.
- Whether local music generation on device is feasible.
- Whether the ElevenLabs connector can generate music in practice; only listings were read.
- Default length and file format.
