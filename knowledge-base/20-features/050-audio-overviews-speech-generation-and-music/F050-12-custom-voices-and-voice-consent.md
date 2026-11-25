---
id: "F050-12"
type: "feature"
title: "Custom voices and voice consent"
aliases: ["Custom voices", "Voice cloning", "Voice consent and deletion", "Voice-likeness consent", "S50.31", "S50.32"]
area: "50 Audio overviews, speech generation, and music"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S50.31", "S50.32"]
depends_on: ["SYS-voice-and-media", "SYS-security-and-privacy", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-connectors-plugins-and-skills", "SYS-data-model-and-migrations", "SYS-authentication-and-identity", "provider:openai", "surface:web", "surface:mobile", "surface:desktop", "api:POST /api/voice/speech"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F050-12 Custom voices and voice consent

Custom voices would be a separate, consent-governed product with revoke and delete. Not built, and for custom voice creation the founder decision is not to build it, following Claude and OpenAI preset voices. Read-aloud accepts only a fixed list of preset voices.

Area: [50. Audio overviews, speech generation, and music](README.md). Requirement items: [S50.31](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5031), [S50.32](../../10-requirements/capabilities/050-audio-overviews-speech-generation-and-music.md#s5032).

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

**What it does.** Would let a person create a cloned or designed voice under its own consent and access rules (S50.31) and record, revoke and delete voice-likeness consent (S50.32). Neither exists.

**Why it exists.** Brief Should lines. Cloned voices carry impersonation risk, so the brief wants them governed. The founder decision keeps preset voices only, as Claude does, to prevent voice cloning and impersonation (doc: docs/decisions/2026-09-27-founder-decisions.md:250-258).

**Who uses it.** Nobody. Today people choose among preset voices for read-aloud.

**Problems it solves**

- Would prevent unconsented voice cloning.
- Would let a person withdraw their voice and delete it.

**Use cases**

- Create a voice from your own recording with a recorded consent statement.
- Revoke consent and have the voice removed.
- Block cloning of another person's voice.

## 2. User experience

**Where to find it**

- Web: no custom voice control. Voice and language choice for read-aloud is in settings (brief S50.02: apps/web/features/settings/sections/GeneralSection.tsx:1349) and chooses only preset voices.
- Desktop: same preset choice; no custom voice [inferred from brief S50.02 done].
- Mobile: preset voice and language settings (brief S50.02: apps/mobile/src/features/settings/voice-language/index.tsx:168).
- CLI: not present.
- VS Code extension: not present.
- Chrome extension: not present.

**Before you start**

- None; feature not built.

**Screens and controls**

- None for custom voices or consent. [proposed] a consent step, a voice list, revoke and delete buttons using the shared confirm action for irreversible deletes (AGENTS.md section 9).

**Journey**

1. Not available. [proposed] 1. Person records a sample and a consent statement. 2. Consent is stored. 3. Voice is created. 4. Person can revoke and delete.

**What the person sees and gets**

- None.

**Settings**

- Preset voice and language only (brief S50.02).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Read-aloud accepts a fixed list of preset voices with a default (apps/web/lib/voice/speech-voices.ts:1-19). The speech route validates the voice against that list and rejects others (apps/web/app/api/voice/speech/route.ts:54, apps/web/app/api/voice/speech/__tests__/route.test.ts:324-327).

**Incomplete**

- none found in the code

**Present but disconnected or switched off**

- The ElevenLabs connector entry on web mentions 'voice cloning' as a capability summary (apps/web/features/connectors/data/connectors.ts:427-428) and is registered as an api-key connector (apps/web/lib/connectors/catalog.ts:206). On desktop it is marked comingSoon (apps/desktop/src/features/connectors/connectorDefinitions.ts:870-881). No consent or deletion code exists. Whether it can clone a voice in practice was not established.

**Not available**

- Custom voice creation: brief marks S50.31 not applicable on all apps; founder decision confirms not built (docs/decisions/2026-09-27-founder-decisions.md:250-258).
- Voice consent recording, revoke and delete on all six apps (brief: S50.32 missing). No table or route found by search for voice consent.

## 4. Required behaviour

**Established requirements**

- Custom voices (cloned or designed) are a separate, governed product with its own consent and access rules. (source: S50.31 brief)
- Voice-likeness consent is recorded and the user can revoke it and delete the voice. (source: S50.32 brief)
- Preset voices only, no custom voice creation, to prevent cloning and impersonation, following Claude; live voice uses OpenAI voices. (source: docs/decisions/2026-09-27-founder-decisions.md:250-258)
- An action a user cannot undo asks first and names the consequence; permanent removal only from an explicit user action. (source: AGENTS.md section 9)

**Acceptance criteria**

1. Read-aloud on every app offers only the preset voices and rejects any other voice id.
2. No screen offers to clone a voice while the decision stands.
3. If custom voices are later built, consent is recorded before a voice exists and can be revoked.
4. Deleting a voice asks first, names what is lost, and removes the voice and its audio.
5. After revoke, the voice can no longer be used for generation.
6. A person's data deletion removes any stored voice and consent record.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- S50.32 stays open only if custom voices are built; with S50.31 not applicable, S50.32 has no object today [inferred]. The brief nevertheless lists S50.32 missing, which conflicts and needs an owner call.
- The ElevenLabs connector could expose cloning through a user's own key, outside AGI controls; consent would then rest with the vendor [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Record in the decision file whether a connector that clones voices is allowed, and if so how consent is shown.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | SPEECH_VOICES | `apps/web/lib/voice/speech-voices.ts` | Fixed preset voice list and default (lines 1-19). |
| endpoint | POST /api/voice/speech | `apps/web/app/api/voice/speech/route.ts` | Validates voice against the preset list (line 54); uses the voice_speech routing slot (line 102). |
| test | speech route test | `apps/web/app/api/voice/speech/__tests__/route.test.ts` | Includes 'rejects an unknown voice' (line 324). |
| hook | useTTS | `apps/web/lib/hooks/useTTS.ts` | Web read-aloud hook with voice and rate (brief S50.02, S50.03). |
| component | Web GeneralSection | `apps/web/features/settings/sections/GeneralSection.tsx` | Voice and speed controls for read-aloud (brief lines 1266, 1349). |
| screen | Mobile voice-language settings | `apps/mobile/src/features/settings/voice-language/index.tsx` | Mobile voice and language choice (brief S50.02, line 168). |
| screen | Mobile voice settings | `apps/mobile/src/features/settings/voice/index.tsx` | Mobile speaking-rate control (brief S50.03, line 405). |
| service | Mobile tts service | `apps/mobile/src/features/voice/services/tts.ts` | Mobile read-aloud playback (brief S50.01, line 39). |
| config | founder decisions | `docs/decisions/2026-09-27-founder-decisions.md` | Records preset voices only and no custom voice creation (lines 250-258). |
| config | ElevenLabs web connector data | `apps/web/features/connectors/data/connectors.ts` | Lists 'voice cloning' as capability summary (lines 427-428). |
| config | ElevenLabs desktop entry | `apps/desktop/src/features/connectors/connectorDefinitions.ts` | Coming-soon entry (lines 870-881). |
| config | web connector catalog | `apps/web/lib/connectors/catalog.ts` | Registers elevenlabs as api-key connector (line 206). |
| config | routing policies | `packages/ai/model-registry/catalog/routing-policies.json` | Holds the voice_speech routing slot used by the speech route. |
| config | live voice prompts | `apps/web/lib/voice/live-voice-prompts.ts` | Live voice behaviour; uses provider voices (decision D-2026-09-28-04). Content not read. |
| config | memory content policy | `packages/contracts/context/src/memory-content-policy.ts` | Matched search for voice terms; relevance unknown. |
| config | audit missing list | `audit/missing/050-audio-overviews-speech-generation-and-music.md` | Tracks open S50 rows; S50.31 not applicable. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a preset voice and plays a reply; the app posts text, voice and speed to the speech route. | device and our servers | apps/web/app/api/voice/speech/route.ts:52-56 |
| The server checks the privacy rule and model policy, picks the live text-to-speech model from the routing slot, and calls it. | our servers | apps/web/app/api/voice/speech/route.ts:102-121 |
| The provider returns audio; the server returns it to the app. | outside service | apps/web/app/api/voice/speech/route.ts:60-67 (provider failure messages) [inferred for the call itself] |
| No consent, voice creation or deletion step exists. | our servers | No consent code found by search. |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| No voice sample, voice model or consent record is created. | none found in the code | not applicable | not applicable |

**Models and providers.** Speech uses a text-to-speech model from the voice_speech routing slot and must be OpenAI (apps/web/app/api/voice/speech/route.ts:102-105). Live voice stays on the OpenAI live API with its voices (doc: docs/decisions/2026-09-27-founder-decisions.md:170-176).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The speech route needs a signed-in user [inferred from userId use at apps/web/app/api/voice/speech/route.ts:160]; custom voice: none found in the code. |
| Permissions | none found in the code for custom voices or consent |
| Subscription | none found in the code for custom voices. Free allowance for voice exists elsewhere (apps/web/lib/voice/free-voice-allowance.ts); its link to read-aloud was not established. |
| Limits and metering | Speech: 4,000 characters, speed 0.25 to 4 (apps/web/app/api/voice/speech/route.ts:48, 56); usage is accounted via a request hash (line 160). Custom voices: none found in the code. |
| Feature flags | ElevenLabs desktop entry comingSoon (apps/desktop/src/features/connectors/connectorDefinitions.ts:870-881). |
| Model compatibility | Preset voice ids are tied to the speech model family; which models accept which ids was not checked. |
| Provider restrictions | Speech route refuses a provider that may train on content when privacy settings forbid it (apps/web/app/api/voice/speech/route.ts:106-113). |
| Local mode | Whether Local mode read-aloud uses device voices and how custom voices relate is unknown; mobile has its own tts service (apps/mobile/src/features/voice/services/tts.ts:39) but its engine was not read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unknown voice id sent | Request rejected with 400 | apps/web/app/api/voice/speech/__tests__/route.test.ts:324-327 |
| Provider busy or down | Messages 'Read aloud is busy right now...' and 'The speech provider is unavailable...' | apps/web/app/api/voice/speech/route.ts:63-67 |
| Consent revoke, voice delete | not handled in the code | No consent or delete-voice code found. |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/voice/speech/__tests__/route.test.ts`: Speech route: unknown voice rejected, validation, rate-limit gate, voice marin with speed passed through.
- `apps/web/lib/voice/__tests__/free-voice-allowance.test.ts`: Free voice allowance rules; not custom voices.

**Test scenarios**

- **Unknown voice rejected**
  1. POST /api/voice/speech with voice 'not-a-voice'.
  - Expected: 400 invalid request.
- **No cloning control**
  1. Open voice settings on web and mobile.
  2. Look for record, upload or clone options.
  - Expected: Only preset voices today.
- **Preset voice plays**
  1. Pick a preset voice in settings.
  2. Play a reply.
  - Expected: Reply plays in that voice.
- **Consent revoke after build**
  1. Create a voice, revoke consent.
  - Expected: Voice unusable and removed after confirmation.
- **Connector cloning check**
  1. Connect ElevenLabs with a test key, if allowed.
  2. Ask for a cloned voice.
  - Expected: Outcome unknown; record it for the decision.

**Where to look when it fails**

- Speech route returns error code model_may_train and invalid_idempotency_key.
- Error text 'The voice_speech slot is not a live OpenAI TTS model' means the routing slot is wrong.
- No table for voices or consent was found.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No consent record, revoke or delete for voice likeness** Affects: All six apps and API (if custom voices are ever allowed). Evidence: Brief S50.32 missing; no code found. Work needed: Either record that it does not apply while custom voices are not built, or build consent storage, revoke and delete.
- **Brief and decision disagree in status** Affects: Planning. Evidence: S50.31 not applicable but S50.32 missing; decision D-2026-09-28-12 (docs/decisions/2026-09-27-founder-decisions.md:250-258). Work needed: Owner to mark S50.32 not applicable or open.
- **ElevenLabs connector advertises voice cloning with no governance** Affects: Web and desktop connector users. Evidence: apps/web/features/connectors/data/connectors.ts:427-428. Work needed: Decide whether to keep the wording and add consent guidance.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-voice-and-media
- SYS-security-and-privacy
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-connectors-plugins-and-skills
- SYS-data-model-and-migrations
- SYS-authentication-and-identity
- provider:openai
- surface:web
- surface:mobile
- surface:desktop
- api:POST /api/voice/speech

## Unknown

- Whether the ElevenLabs connector can clone voices in practice.
- Whether S50.32 stays open given S50.31 is not applicable.
- How Local mode read-aloud picks voices on device.
- Whether the free voice allowance applies to read-aloud.
- Which models accept which preset voice ids.
