---
id: "F050-10"
type: "feature"
title: "Track output: cover art, metadata, playback, sharing"
aliases: ["Cover art", "Track title and metadata", "Playback and seek", "Download and sharing", "S50.26 to S50.29"]
area: "50 Audio overviews, speech generation, and music"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S50.26", "S50.27", "S50.28", "S50.29"]
depends_on: ["F050-07", "SYS-files-artifacts-and-storage", "SYS-voice-and-media", "SYS-shared-ui-and-design", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "surface:web", "surface:mobile", "surface:desktop"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F050-10 Track output: cover art, metadata, playback, sharing

Track output would give a generated music track cover art, a title and metadata, playback with a seek bar, and download or share. Nothing is built. Existing audio playback in the product is for spoken replies only, and downloading generated speech is deliberately not built.

Area: [50. Audio overviews, speech generation, and music](README.md). Requirement items: [S50.26](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5026), [S50.27](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5027), [S50.28](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5028), [S50.29](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5029).

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

**What it does.** Would present a finished track: cover image (S50.26), title and metadata (S50.27), play and seek (S50.28), and download and sharing (S50.29). Not built on any app.

**Why it exists.** Brief Should lines S50.26 to S50.29. A track is only useful if it can be heard, named and kept.

**Who uses it.** Nobody yet. Intended: anyone who generates a track.

**Problems it solves**

- Lets a person hear and scrub through a result.
- Lets a person keep or send the file.
- Gives each track a recognisable look and name.

**Use cases**

- Play a track and jump to the chorus.
- Download the file for a video edit.
- Share a link with a teammate.

## 2. User experience

**Where to find it**

- Web: no music player. Spoken replies are read aloud from a message action (brief S50.01: apps/web/features/chat/components/messages/MessageBubble.tsx:3049), which is not a track player.
- Desktop: not present for tracks.
- Mobile: not present for tracks. Spoken replies exist (apps/mobile/src/features/voice/services/tts.ts:39).
- CLI: not present.
- VS Code extension: not present.
- Chrome extension: not present.

**Before you start**

- A generated track (F050-07), which does not exist.

**Screens and controls**

- None for tracks. [proposed] cover image, title, play and pause, seek bar, download, share.

**Journey**

1. Not available. [proposed] 1. Track finishes. 2. Card shows cover and title. 3. Person plays and seeks. 4. Downloads or shares.

**What the person sees and gets**

- None for tracks.

**Settings**

- None found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Nothing for tracks.

**Incomplete**

- Spoken-reply playback exists for chat messages but is a different feature (brief S50.01 'done' on web, desktop, mobile). Its code was not opened for this page beyond the brief's paths.

**Present but disconnected or switched off**

- The shared artifact type list contains 'music' (packages/contracts/types/src/conversation.ts:89) but no music renderer was found.

**Not available**

- Cover art, metadata, playback with seek, download and sharing for generated music on all six apps (brief: S50.26 to S50.29 missing).
- Downloading generated speech is a recorded decision not to build it (doc: docs/decisions/2026-09-27-founder-decisions.md:250-258). Whether the same stance applies to music is unknown.

## 4. Required behaviour

**Established requirements**

- Cover art is generated for a track. (source: S50.26 brief)
- A generated track has a title and metadata. (source: S50.27 brief)
- Generated music has playback and seek controls. (source: S50.28 brief)
- Generated music can be downloaded and shared. (source: S50.29 brief)
- Generated speech is not offered for download, following the leaders. (source: docs/decisions/2026-09-27-founder-decisions.md:250-258)

**Acceptance criteria**

1. A finished track shows a cover image and a title.
2. Play, pause and seek work and show current time and length.
3. Download saves a playable audio file.
4. Share produces a link or system share sheet and respects privacy settings.
5. If cover art fails, the track still plays with a fallback image.
6. Metadata includes at least the title and length [inferred minimum].

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Playback needs an accessible name and keyboard control on web [inferred from the accessibility rules of the product].
- Download for music conflicts in spirit with the no-download decision for speech only if the decision is read broadly; a separate decision is needed [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Reuse the image generation pipeline for cover art once it is confirmed to exist.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | ArtifactType | `packages/contracts/types/src/conversation.ts` | Reserved 'music' artifact type (line 89). |
| config | desktop chat ArtifactType | `apps/desktop/src/types/chat.ts` | Desktop copy (line 15). |
| service | persistedCloudMessage | `apps/desktop/src/runtime/persistedCloudMessage.ts` | Persists artifact kinds including 'music' (line 136). |
| service | TauriRuntime | `apps/desktop/src/runtime/TauriRuntime.ts` | Artifact kinds list including 'music' (line 286). |
| component | Web MessageBubble read-aloud | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Reply read-aloud control (brief S50.01, line 3049). Speech, not music. |
| hook | useTTS | `apps/web/lib/hooks/useTTS.ts` | Web speech playback hook (brief S50.01, line 175). Speech, not music. |
| service | Mobile tts service | `apps/mobile/src/features/voice/services/tts.ts` | Mobile speech playback (brief S50.01, line 39). Speech, not music. |
| endpoint | POST /api/voice/speech | `apps/web/app/api/voice/speech/route.ts` | Server text-to-speech route; returns speech audio; not music. |
| config | founder decisions | `docs/decisions/2026-09-27-founder-decisions.md` | Records that downloading generated speech is not built (lines 250-258). |
| config | audit missing list | `audit/missing/050-audio-overviews-speech-generation-and-music.md` | Open rows S50.26 to S50.29. |
| config | MODEL_TYPES | `packages/contracts/types/src/model-catalog.ts` | Lists 'image' and 'music' types; cover art would need an image model. |
| config | area brief | `knowledge-base/data/area-briefs/050-audio-overviews-speech-generation-and-music.md` | Should lines. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| No track output flow exists. | our servers | No music, cover art or share code found. |
| The only audio output in the product is speech: web posts text to the speech route, which checks the provider rules and returns audio. | our servers | apps/web/app/api/voice/speech/route.ts:54-56, 102-122 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No track files, covers or metadata exist. | none found in the code | not applicable | not applicable |

**Models and providers.** No music or cover model is wired. Speech uses a live OpenAI text-to-speech slot named voice_speech (apps/web/app/api/voice/speech/route.ts:102-105).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for tracks. The speech route requires a user id (apps/web/app/api/voice/speech/route.ts:160) [inferred it signs in]. |
| Permissions | none found in the code |
| Subscription | none found in the code for tracks |
| Limits and metering | none found in the code for tracks. Speech is metered and capped at 4,000 characters (apps/web/app/api/voice/speech/route.ts:48). |
| Feature flags | none found in the code |
| Model compatibility | Unknown for music and cover art. |
| Provider restrictions | Unknown for music. Speech refuses providers that may train on content when the privacy setting says so (apps/web/app/api/voice/speech/route.ts:106-113). |
| Local mode | No local track output exists. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| All track states (loading, error, seek, offline, retry) | not handled in the code because there are no tracks | No music player found. |
| Speech route busy or down | Returns friendly messages for 429 and 5xx; applies to speech only | apps/web/app/api/voice/speech/route.ts:63-67 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/voice/speech/__tests__/route.test.ts`: Speech route only: rejects unknown voice (line 324), validation, rate-limit gate (line 250). Not music.

**Test scenarios**

- **No player for tracks**
  1. Search each app for a track card or seek bar.
  - Expected: None today.
- **Playback and seek**
  1. After build, play a track and drag the seek bar.
  - Expected: Audio jumps and time updates.
- **Download**
  1. After build, download a track and open it in a player.
  - Expected: A valid audio file with the title.
- **Cover failure**
  1. Force cover generation to fail.
  - Expected: Fallback image and playable track.
- **Share privacy**
  1. Share a track as a signed-out viewer.
  - Expected: Access follows the chosen visibility.

**Where to look when it fails**

- Speech route returns error.code values such as model_may_train; track route has none yet.
- Check audit/missing/050-*.md.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No track card, cover, metadata, player or share** Affects: All six apps. Evidence: Brief S50.26 to S50.29 missing. Work needed: Design a shared track component in the shared UI package; add storage and share rules.
- **No decision on downloading generated audio for music** Affects: Product scope and legal. Evidence: Speech download decided against (docs/decisions/2026-09-27-founder-decisions.md:250-258); music not decided. Work needed: Record a decision citing current leader behaviour.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- F050-07
- SYS-files-artifacts-and-storage
- SYS-voice-and-media
- SYS-shared-ui-and-design
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- surface:web
- surface:mobile
- surface:desktop

## Unknown

- Where tracks would be stored and for how long.
- Share link visibility rules.
- Audio file format.
- Whether cover art uses the existing image generation path.
