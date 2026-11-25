---
id: "GAPS-AREA-050"
type: "gap-list"
title: "Gaps: Audio overviews, speech generation, and music"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 50. Audio overviews, speech generation, and music

52 open gaps that touch this area. Area page: [20-features/050-audio-overviews-speech-generation-and-music](../../20-features/050-audio-overviews-speech-generation-and-music/README.md).

## CMP-WP253

**Voice: language, style and speed selects**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F050-02](../../20-features/050-audio-overviews-speech-generation-and-music/F050-02-voice-language-and-speed-for-playback.md)
- Detail: No style, model or intelligence choice Voice carousel, language picker and read-aloud and conversation speed exist; no style, model or intelligence choice.
- Evidence: apps/web/features/settings/sections/VoiceSection.tsx:11-12; apps/web/features/settings/sections/GeneralSection.tsx:747-830

## GAP-AREA050-LW04

**Web has no language choice for playback; language follows the picked device voice.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-050
- Detail: Area 50. Audio overviews, speech generation, and music
- Evidence: apps/web/lib/hooks/useTTS.ts:360-362

## GAP-AREA050-LW06

**If the speech model is not live, the route throws a plain Error instead of returning a JSON error body, so the client sees a server error.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-050
- Detail: Area 50. Audio overviews, speech generation, and music
- Evidence: apps/web/app/api/voice/speech/route.ts:102-105

## GAP-AREA050-LW07

**The desktop and web hooks duplicate the same Markdown stripping code.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-050
- Detail: Area 50. Audio overviews, speech generation, and music
- Evidence: apps/web/lib/hooks/useTTS.ts:116-139; apps/desktop/src/hooks/useTTS.ts:12-30

## GAP-CAP-voice-06

**Voice speed and pace: None known for apps with voice; WP253 notes no style choice on web.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F050-02](../../20-features/050-audio-overviews-speech-generation-and-music/F050-02-voice-language-and-speed-for-playback.md)
- Requirement items: S50.03
- Detail: Claude yes, ChatGPT partly; AGI built

## GAP-CAP-voice-23

**Read a reply aloud: QA findings file (results/page/findings.json, code-read) says read aloud speaks the raw markdown so cards and charts read as 'code block omitted'. Privacy copy gap for cloud speech. A person saw uneven indentation of the Read message aloud menu item (cosmetic, W-6).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F050-01](../../20-features/050-audio-overviews-speech-generation-and-music/F050-01-read-aloud-a-reply.md), [F050-02](../../20-features/050-audio-overviews-speech-generation-and-music/F050-02-voice-language-and-speed-for-playback.md)
- Requirement items: S50.01, S50.02, S50.03
- Detail: Claude unknown, ChatGPT partly; AGI partly built

## GAP-F050-01-01

**Chrome extension read aloud exists but the brief, ledger and draft mark Chrome as missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-01](../../20-features/050-audio-overviews-speech-generation-and-music/F050-01-read-aloud-a-reply.md)
- Detail: Affects: Documentation, test planning; Chrome users. Work needed: Correct the brief and ledger row for S50.01 Chrome to built (device voice).
- Evidence: apps/extension/src/features/side-panel/bubbles.ts:627-629; brief S50.01

## GAP-F050-01-02

**Web blocks read aloud for Local and own-key replies even though the device voice would keep the text on the device.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-01](../../20-features/050-audio-overviews-speech-generation-and-music/F050-01-read-aloud-a-reply.md)
- Detail: Affects: Web and public Desktop users on Local or own-key. Work needed: Decide the rule; if wanted, allow device-voice-only read aloud for those replies.
- Evidence: apps/web/lib/read-aloud-policy.ts:16-26

## GAP-F050-01-03

**Text cleaning differs: Mobile and Chrome do not strip Markdown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-01](../../20-features/050-audio-overviews-speech-generation-and-music/F050-01-read-aloud-a-reply.md)
- Detail: Affects: Mobile, Chrome. Work needed: Use one shared cleaner; add tests per app.
- Evidence: apps/mobile/src/features/chat/components/MessageBubble.tsx:2024; apps/extension/src/features/side-panel/bubbles.ts:625-628

## GAP-F050-01-04

**Server voice is OpenAI only and not selected through the model catalog family path the product requires.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-01](../../20-features/050-audio-overviews-speech-generation-and-music/F050-01-read-aloud-a-reply.md)
- Detail: Affects: All server-voice users. Work needed: Allow other speech providers behind the voice_speech slot.
- Evidence: apps/web/app/api/voice/speech/route.ts:102-105

## GAP-F050-01-05

**No read aloud on CLI or VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-01](../../20-features/050-audio-overviews-speech-generation-and-music/F050-01-read-aloud-a-reply.md)
- Detail: Affects: CLI, VS Code users. Work needed: Product decision first; the experience contract does not require it (doc: docs/product/experience-contract.md:641).
- Evidence: no speech code in apps/cli/src or apps/extension-vscode/src

## GAP-F050-01-06

**Decision doc says web read aloud runs entirely on the browser engine; the code now has a server voice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-01](../../20-features/050-audio-overviews-speech-generation-and-music/F050-01-read-aloud-a-reply.md)
- Detail: Affects: Engineers reading docs. Work needed: Update the decision text; code wins.
- Evidence: doc: docs/decisions/wire-or-cut.md:425 versus apps/web/lib/hooks/useTTS.ts:41-66

## GAP-F050-01-07

**Server error messages are never shown on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-01](../../20-features/050-audio-overviews-speech-generation-and-music/F050-01-read-aloud-a-reply.md)
- Detail: Affects: Web users hitting quota or kill switch. Work needed: Surface quota or policy refusals instead of the generic toast or silent fallback.
- Evidence: useTTS.ts:60 returns null on any non-OK response

## GAP-F050-01-NOTBUILT

**Read aloud a reply: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F050-01](../../20-features/050-audio-overviews-speech-generation-and-music/F050-01-read-aloud-a-reply.md)
- Requirement items: S50.01
- Detail: CLI: S50.01; VS Code: S50.01

## GAP-F050-02-01

**No way to choose the server voice; the person hears a fixed default.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-02](../../20-features/050-audio-overviews-speech-generation-and-music/F050-02-voice-language-and-speed-for-playback.md)
- Detail: Affects: Web, public Desktop, Mobile Cloud. Work needed: Add a picker and send the voice field.
- Evidence: apps/web/lib/voice/speech-voices.ts:19; useTTS.ts:58

## GAP-F050-02-02

**Mobile Cloud ignores chosen voice, pitch and language on the server voice.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-02](../../20-features/050-audio-overviews-speech-generation-and-music/F050-02-voice-language-and-speed-for-playback.md)
- Detail: Affects: Mobile Cloud. Work needed: Send the settings the route supports, or tell the person which settings apply.
- Evidence: apps/mobile/src/features/voice/services/serverSpeech.ts:46-51

## GAP-F050-02-03

**No read-aloud language setting on Web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-02](../../20-features/050-audio-overviews-speech-generation-and-music/F050-02-voice-language-and-speed-for-playback.md)
- Detail: Affects: Web. Work needed: Decide whether language is derived from the voice; document it.
- Evidence: GeneralSection.tsx:808-858 has voice only

## GAP-F050-02-04

**Speed ranges differ per app (web 0.8-1.35, mobile 0.5-2, Chrome 0.75-2).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-02](../../20-features/050-audio-overviews-speech-generation-and-music/F050-02-voice-language-and-speed-for-playback.md)
- Detail: Affects: All. Work needed: Pick one scale or label them consistently.
- Evidence: web-settings-store.ts:46-50; voice/index.tsx:437-444; read-aloud/index.ts:3

## GAP-F050-02-05

**Whether settings sync across a person's devices is not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-02](../../20-features/050-audio-overviews-speech-generation-and-music/F050-02-voice-language-and-speed-for-playback.md)
- Detail: Affects: All. Work needed: Confirm with the sync system owner.
- Evidence: no sync code found for these keys in files opened

## GAP-F050-02-NOTBUILT

**Voice, language and speed for playback: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F050-02](../../20-features/050-audio-overviews-speech-generation-and-music/F050-02-voice-language-and-speed-for-playback.md)
- Requirement items: S50.02, S50.03
- Detail: CLI: S50.02, S50.03; VS Code: S50.02, S50.03

## GAP-F050-03-01

**No startup cleanup for temporary mp3 files left by a crash.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-03](../../20-features/050-audio-overviews-speech-generation-and-music/F050-03-download-generated-speech.md)
- Detail: Affects: Mobile Cloud. Work needed: Sweep stale read-aloud-* files on start, or confirm the OS clears cache.
- Evidence: serverSpeech.ts:65-88 cleans only in the live session

## GAP-F050-03-02

**None between decision and code; the decline matches the code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-03](../../20-features/050-audio-overviews-speech-generation-and-music/F050-03-download-generated-speech.md)
- Detail: Affects: none. Work needed: none
- Evidence: doc: docs/decisions/2026-09-27-founder-decisions.md:250-258

## GAP-F050-04-01

**Whole feature missing: sources, narrator or hosts, length, instructions, regenerate.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-04](../../20-features/050-audio-overviews-speech-generation-and-music/F050-04-audio-overview-from-sources.md)
- Detail: Affects: Web, Desktop, Mobile, CLI, VS Code, Chrome, API. Work needed: Product decision to build; design script generation, speech, metering and Local behaviour.
- Evidence: audit/ledger/ecosystem-capability-ledger.jsonl:1633-1641

## GAP-F050-04-02

**No speech route for long text: one request is capped at 4,000 characters.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-04](../../20-features/050-audio-overviews-speech-generation-and-music/F050-04-audio-overview-from-sources.md)
- Detail: Affects: A future overview. Work needed: Chunking is already done in clients; a server pipeline would need its own.
- Evidence: apps/web/app/api/voice/speech/route.ts:48

## GAP-F050-04-03

**No decision record says whether the feature will be built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-04](../../20-features/050-audio-overviews-speech-generation-and-music/F050-04-audio-overview-from-sources.md)
- Detail: Affects: Planning. Work needed: Record a decision.
- Evidence: search of docs/decisions found no S50.05-S50.14 entry

## GAP-F050-04-NOTBUILT

**Audio overview from sources: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F050-04](../../20-features/050-audio-overviews-speech-generation-and-music/F050-04-audio-overview-from-sources.md)
- Requirement items: S50.05, S50.06, S50.07, S50.08, S50.09, S50.10, S50.13
- Detail: Web: S50.05, S50.06, S50.07, S50.08, S50.09, S50.10, S50.13; Desktop: S50.05, S50.06, S50.07, S50.08, S50.09, S50.10, S50.13; Mobile: S50.05, S50.06, S50.07, S50.08, S50.09, S50.10, S50.13; CLI: S50.05, S50.06, S50.07, S50.08, S50.09, S50.10, S50.13; VS Code: S50.05, S50.06, S50.07, S50.08, S50.09, S50.10, S50.13; Chrome: S50.05, S50.06, S50.07, S50.08, S50.09, S50.10, S50.13

## GAP-F050-05-01

**Transcript and source links missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-05](../../20-features/050-audio-overviews-speech-generation-and-music/F050-05-overview-transcript-and-source-links.md)
- Detail: Affects: All apps. Work needed: Build after F050-04; store script with provenance.
- Evidence: audit/ledger/ecosystem-capability-ledger.jsonl:1639-1640

## GAP-F050-05-02

**No data model for per-line source provenance.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-05](../../20-features/050-audio-overviews-speech-generation-and-music/F050-05-overview-transcript-and-source-links.md)
- Detail: Affects: Future feature. Work needed: Design the schema in the data model and contracts packages.
- Evidence: No schema found in searches

## GAP-F050-05-NOTBUILT

**Overview transcript and source links: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F050-05](../../20-features/050-audio-overviews-speech-generation-and-music/F050-05-overview-transcript-and-source-links.md)
- Requirement items: S50.11, S50.12
- Detail: Web: S50.11, S50.12; Desktop: S50.11, S50.12; Mobile: S50.11, S50.12; CLI: S50.11, S50.12; VS Code: S50.11, S50.12; Chrome: S50.11, S50.12

## GAP-F050-06-01

**Interrupt and ask missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-06](../../20-features/050-audio-overviews-speech-generation-and-music/F050-06-interrupt-an-overview.md)
- Detail: Affects: All apps. Work needed: Decide if offered; if so build after F050-04 on the live voice foundation.
- Evidence: audit/ledger/ecosystem-capability-ledger.jsonl:1642

## GAP-F050-06-02

**Brief says 'where offered' but no decision names where.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-06](../../20-features/050-audio-overviews-speech-generation-and-music/F050-06-interrupt-an-overview.md)
- Detail: Affects: Planning. Work needed: Record the decision.
- Evidence: search of docs/decisions found no S50.14 entry

## GAP-F050-06-NOTBUILT

**Interrupt an overview: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F050-06](../../20-features/050-audio-overviews-speech-generation-and-music/F050-06-interrupt-an-overview.md)
- Requirement items: S50.14
- Detail: Web: S50.14; Desktop: S50.14; Mobile: S50.14; CLI: S50.14; VS Code: S50.14; Chrome: S50.14

## GAP-F050-07-01

**No music generation at all**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-07](../../20-features/050-audio-overviews-speech-generation-and-music/F050-07-music-generation-and-style.md)
- Detail: Affects: All six apps and the API. Work needed: Choose a provider route, add a catalog model of type music, add a server route, usage metering and a UI on each app.
- Evidence: Brief S50.15 to S50.20 missing on every app; audit/missing/050-audio-overviews-speech-generation-and-music.md

## GAP-F050-07-02

**No catalog model of type music**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-07](../../20-features/050-audio-overviews-speech-generation-and-music/F050-07-music-generation-and-style.md)
- Detail: Affects: Routing for any future feature. Work needed: Add a curated model then run the sync step.
- Evidence: packages/contracts/types/src/model-catalog.ts:239 lists the type; no model entry found

## GAP-F050-07-03

**No decision on whether and how music is offered**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-07](../../20-features/050-audio-overviews-speech-generation-and-music/F050-07-music-generation-and-style.md)
- Detail: Affects: Product scope. Work needed: Record a decision with plan, provider and usage limits.
- Evidence: No decision found under docs/decisions for S50.15 to S50.20

## GAP-F050-07-NOTBUILT

**Music generation and style: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F050-07](../../20-features/050-audio-overviews-speech-generation-and-music/F050-07-music-generation-and-style.md)
- Requirement items: S50.15, S50.16, S50.17, S50.18, S50.19, S50.20
- Detail: Web: S50.15, S50.16, S50.17, S50.18, S50.19, S50.20; Desktop: S50.15, S50.16, S50.17, S50.18, S50.19, S50.20; Mobile: S50.15, S50.16, S50.17, S50.18, S50.19, S50.20; CLI: S50.15, S50.16, S50.17, S50.18, S50.19, S50.20; VS Code: S50.15, S50.16, S50.17, S50.18, S50.19, S50.20; Chrome: S50.15, S50.16, S50.17, S50.18, S50.19, S50.20

## GAP-F050-08-01

**No lyrics, structure or length modes**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-08](../../20-features/050-audio-overviews-speech-generation-and-music/F050-08-lyrics-song-structure-and-length.md)
- Detail: Affects: All six apps and API. Work needed: Build after F050-07, add inputs, validation and limits.
- Evidence: Brief S50.21 to S50.23 missing; audit/missing/050-*.md

## GAP-F050-08-02

**No limit for lyrics length defined**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-08](../../20-features/050-audio-overviews-speech-generation-and-music/F050-08-lyrics-song-structure-and-length.md)
- Detail: Affects: Future music users. Work needed: Set a limit in shared configuration, not a constant.
- Evidence: none found in the code

## GAP-F050-08-NOTBUILT

**Lyrics, song structure and length: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F050-08](../../20-features/050-audio-overviews-speech-generation-and-music/F050-08-lyrics-song-structure-and-length.md)
- Requirement items: S50.21, S50.22, S50.23
- Detail: Web: S50.21, S50.22, S50.23; Desktop: S50.21, S50.22, S50.23; Mobile: S50.21, S50.22, S50.23; CLI: S50.21, S50.22, S50.23; VS Code: S50.21, S50.22, S50.23; Chrome: S50.21, S50.22, S50.23

## GAP-F050-09-01

**No templates**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-09](../../20-features/050-audio-overviews-speech-generation-and-music/F050-09-music-templates-and-remix.md)
- Detail: Affects: All six apps. Work needed: Define template data in shared config and a picker per app.
- Evidence: Brief S50.24 missing

## GAP-F050-09-02

**No remix**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-09](../../20-features/050-audio-overviews-speech-generation-and-music/F050-09-music-templates-and-remix.md)
- Detail: Affects: All six apps and API. Work needed: Store tracks, add a vary action and a provider route that supports it.
- Evidence: Brief S50.25 missing

## GAP-F050-09-NOTBUILT

**Music templates and remix: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F050-09](../../20-features/050-audio-overviews-speech-generation-and-music/F050-09-music-templates-and-remix.md)
- Requirement items: S50.24, S50.25
- Detail: Web: S50.24, S50.25; Desktop: S50.24, S50.25; Mobile: S50.24, S50.25; CLI: S50.24, S50.25; VS Code: S50.24, S50.25; Chrome: S50.24, S50.25

## GAP-F050-10-01

**No track card, cover, metadata, player or share**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-10](../../20-features/050-audio-overviews-speech-generation-and-music/F050-10-track-output-cover-art-metadata-playback-sharing.md)
- Detail: Affects: All six apps. Work needed: Design a shared track component in the shared UI package; add storage and share rules.
- Evidence: Brief S50.26 to S50.29 missing

## GAP-F050-10-02

**No decision on downloading generated audio for music**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-10](../../20-features/050-audio-overviews-speech-generation-and-music/F050-10-track-output-cover-art-metadata-playback-sharing.md)
- Detail: Affects: Product scope and legal. Work needed: Record a decision citing current leader behaviour.
- Evidence: Speech download decided against (docs/decisions/2026-09-27-founder-decisions.md:250-258); music not decided

## GAP-F050-10-NOTBUILT

**Track output: cover art, metadata, playback, sharing: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F050-10](../../20-features/050-audio-overviews-speech-generation-and-music/F050-10-track-output-cover-art-metadata-playback-sharing.md)
- Requirement items: S50.26, S50.27, S50.28, S50.29
- Detail: Web: S50.26, S50.27, S50.28, S50.29; Desktop: S50.26, S50.27, S50.28, S50.29; Mobile: S50.26, S50.27, S50.28, S50.29; CLI: S50.26, S50.27, S50.28, S50.29; VS Code: S50.26, S50.27, S50.28, S50.29; Chrome: S50.26, S50.27, S50.28, S50.29

## GAP-F050-11-01

**No music-service connector**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-11](../../20-features/050-audio-overviews-speech-generation-and-music/F050-11-music-service-playback.md)
- Detail: Affects: All six apps. Work needed: Add a connector entry, OAuth app, trust rules and tool actions; register in the connector catalog.
- Evidence: Brief S50.30 missing

## GAP-F050-11-02

**API surface not listed in the brief**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-11](../../20-features/050-audio-overviews-speech-generation-and-music/F050-11-music-service-playback.md)
- Detail: Affects: API consumers. Work needed: Decide whether an API applies.
- Evidence: Brief S50.30 status omits api

## GAP-F050-11-NOTBUILT

**Music-service playback: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F050-11](../../20-features/050-audio-overviews-speech-generation-and-music/F050-11-music-service-playback.md)
- Requirement items: S50.30
- Detail: Web: S50.30; Desktop: S50.30; Mobile: S50.30; CLI: S50.30; VS Code: S50.30; Chrome: S50.30

## GAP-F050-12-01

**No consent record, revoke or delete for voice likeness**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-12](../../20-features/050-audio-overviews-speech-generation-and-music/F050-12-custom-voices-and-voice-consent.md)
- Detail: Affects: All six apps and API (if custom voices are ever allowed). Work needed: Either record that it does not apply while custom voices are not built, or build consent storage, revoke and delete.
- Evidence: Brief S50.32 missing; no code found

## GAP-F050-12-02

**Brief and decision disagree in status**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-12](../../20-features/050-audio-overviews-speech-generation-and-music/F050-12-custom-voices-and-voice-consent.md)
- Detail: Affects: Planning. Work needed: Owner to mark S50.32 not applicable or open.
- Evidence: S50.31 not applicable but S50.32 missing; decision D-2026-09-28-12 (docs/decisions/2026-09-27-founder-decisions.md:250-258)

## GAP-F050-12-03

**ElevenLabs connector advertises voice cloning with no governance**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F050-12](../../20-features/050-audio-overviews-speech-generation-and-music/F050-12-custom-voices-and-voice-consent.md)
- Detail: Affects: Web and desktop connector users. Work needed: Decide whether to keep the wording and add consent guidance.
- Evidence: apps/web/features/connectors/data/connectors.ts:427-428

## GAP-F050-12-NOTBUILT

**Custom voices and voice consent: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F050-12](../../20-features/050-audio-overviews-speech-generation-and-music/F050-12-custom-voices-and-voice-consent.md)
- Requirement items: S50.32
- Detail: Web: S50.32; Desktop: S50.32; Mobile: S50.32; CLI: S50.32; VS Code: S50.32; Chrome: S50.32
