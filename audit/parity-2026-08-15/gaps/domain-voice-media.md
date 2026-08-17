# Domain audit: Voice + Image + Video (§16–17)

Scope: composer dictation and voice settings on Web/Desktop/Mobile/Chrome
(`apps/web/app/settings/voice/page.tsx`, `apps/desktop/src/features/settings/VoiceSettings.tsx`,
`apps/mobile/app/(app)/voice.tsx`, `apps/extension/src/features/side-panel/voice.ts`); the
desktop native voice loop (`apps/desktop/src/features/voice/VoiceMode.tsx`,
`apps/desktop/src/stores/settings/voice.ts`, `apps/desktop/src-tauri/src/features/speech/**`,
`apps/desktop/src-tauri/src/sys/commands/{voice,voice_global}.rs`); managed image generation
(`apps/web/app/api/media/image/generate/route.ts`, `apps/web/features/chat/components/ImageGenerationCard.tsx`,
`apps/mobile/src/features/image/services/imagegen.ts`, `apps/desktop/src/api/cloudApi.ts`); and
managed video generation (`apps/web/app/api/media/video/{generate,status}/route.ts`,
`apps/web/lib/services/video-job-reconciliation-service.ts`,
`apps/mobile/src/features/video/services/videogen.ts`, `apps/desktop/src-tauri/src/sys/commands/media.rs`).
Benchmarked against `shots-chatgpt-ios-health-voice-work.md` §2 (Advanced Voice Mode),
`shots-chatgpt-web-macos.md` §2.6 (Voice settings), `shots-claude-ios.md` §29–30 (Voice settings),
`chatgpt-web-desktop.md` §11–12, `chatgpt-mobile.md` §3–4, `claude-mobile.md` §5–6, and
`cross-cutting-and-complaints.md` §1–3.

## Summary

This domain has one story with two very different chapters. **Image generation is a genuine
strength**: a real, catalog-driven, per-provider aspect-ratio system, honest "this is a new
version, not an edit" disclosure, server-side C2PA-style provenance, and correct owner-scoped,
authenticated delivery on every surface. The prior audit's one filed defect against it (aspect
ratios collapsing to three sizes) has already been fixed in code since that audit ran.
**Video generation's backend was substantially rebuilt in the six days before this reading** —
durable per-job rows with claim/lease semantics, a resumable poll UI with an explicit "Resume"
button, upload-failure compensation, and a fail-closed billing gate that refuses the request
_before_ charging if storage isn't configured — which closes most of what the prior `PP-19`
capability audit (2026-08-09) found broken on Web. But that same rebuild switched video delivery
to the same relative, same-origin `/api/files/{id}` URL pattern images already use safely on Web
— and **nobody carried the URL-absolutization step that Mobile's own `imagegen.ts` and Desktop's
own `cloudApi.ts` already do for images** over to the new video path. The result: a Max‑15x/
Enterprise user who generates a video on Mobile pays for it and gets a silent no‑op tap, forever.
Desktop is worse: the native Tauri shell's live composer and message renderer have **no image or
video generation UI or rendering path at all** — `CloudRuntime.ts` declares
`supportsImageGeneration = true` and a fully-built, correctly-URL-resolving `generateCloudImage`
function exists, but nothing in the shared `unified-chat` composer ever reads that flag or calls
that function, and the parallel Rust `media_generate_video` command it explicitly reports as "not
yet implemented" is real, registered as a live LLM tool, and would still hand back an unresolved
relative URL if it ever fired. Separately, this product has **no live, full-duplex conversational
voice anywhere** — every surface offers push-to-talk dictation or (Mobile only) a turn-based
STT→text→TTS loop, honestly labeled as such, but nothing that lets a user talk _and_ be
interrupted the way ChatGPT's GPT-Live or Claude's Voice mode do. None of this is invisible on
inspection — the product is honest about every one of these gaps in its own UI copy — but "the
control says the feature doesn't exist" is a materially better failure mode than what mobile video
generation does today, which is bill the user and say nothing at all.

## What's already strong (do not rebuild)

| Capability                                                                  | Where                                                                                                                          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-provider aspect-ratio catalog, not a lossy 3-bucket collapse            | `apps/web/features/chat/lib/imageGenerationOptions.ts:49-104`                                                                  | 12 named ratios (`1:1` through `21:9`), filtered per model's real `imageApi` (`gemini`/`imagen`/`openai`) against `IMAGE_PICKER_RATIOS_BY_API`; the server route (`apps/web/app/api/media/image/generate/route.ts:676`) forwards the exact ratio string to Gemini instead of re-deriving it from width>height. This fixes the exact bug `docs/agent-context/phase4-capability-audit.md` PP-18 flagged on 2026-08-09 — that finding is stale. |
| Honest "new version, not an edit" framing                                   | `apps/web/features/chat/components/ImageGenerationCard.tsx:560-567,694`                                                        | The removed "Select region to edit — Coming soon" strip is documented in a comment explaining _why_ it was removed rather than left half-built; the button reads "New version" and the panel states "The image above is not modified"                                                                                                                                                                                                        |
| Server-side, re-emitted-on-download provenance marking                      | `apps/web/lib/compliance/ai-act.ts:1-30`, `apps/web/lib/server/media-storage.ts:303`                                           | `buildAiGeneratedProvenance` runs on the response that carries the artefact and is persisted alongside it so `/api/files/[id]` re-emits it on every later download — a client badge would disappear the moment bytes left the product, which the code comment explicitly calls out as the wrong design                                                                                                                                       |
| Durable, resumable video job pipeline (rebuilt since 2026-08-09)            | `apps/web/lib/services/video-job-reconciliation-service.ts:66-260`, `apps/web/app/api/media/video/generate/route.ts:1005-1024` | UUID job rows with claim/lease tokens, upload-failure compensation (`removePersistedVideo`), and a fail-closed gate (`isVideoStorageConfigured()`/`isVideoJobStoreReady()`) that throws _before_ `acquireVideoGenerationAdmission` reserves any credit — a billed-but-broken result (the exact PP-19 finding) can no longer happen on the happy path                                                                                         |
| Auto-resume + explicit Resume affordance on reload                          | `apps/web/features/chat/pages/WebChatPage.tsx:2575-2610`                                                                       | A `queued`/`processing` message auto-resumes its status poll once per page mount; after that window a visible "Resume" button lets the user manually re-trigger delivery — turns "closed the tab, lost the video" into "closed the tab, click Resume"                                                                                                                                                                                        |
| Mobile's own correct URL-absolutization pattern for images                  | `apps/mobile/src/features/image/services/imagegen.ts:100-117`                                                                  | `resolveGeneratedImageUri` validates the `/api/files/{uuid}` shape with a regex and joins it against `API_URL` before handing it to `<Image>` — this is the exact fix video needed and never got (see VOICE-MEDIA-002)                                                                                                                                                                                                                       |
| Desktop's own correct URL-absolutization pattern for images                 | `apps/desktop/src/api/cloudApi.ts:599-602`                                                                                     | `new URL(rawUri, cloudOrigin)` resolves the relative image path against `CLOUD_API_BASE_URL` before it reaches the UI — same missing step on the video path (see VOICE-MEDIA-001)                                                                                                                                                                                                                                                            |
| Honest Web voice-settings page, no fake disabled rows                       | `apps/web/app/settings/voice/page.tsx:38-62`                                                                                   | States plainly that composer dictation is real push-to-talk, not live conversation, and that "Managed voice is not available" — explicitly does not render persona/model/language rows the runtime can't back (already tracked and closed as `GAP-121`)                                                                                                                                                                                      |
| Mobile's honest "opens in browser" instead of a fake player                 | `apps/mobile/src/features/chat/components/GeneratedVideo.tsx:1-13`                                                             | A code comment states plainly that inline playback isn't available because no video dependency is bundled yet, and that a play-triangle that silently does something else "is exactly the kind of dead control the repo's rules forbid" — the right instinct, undermined only by VOICE-MEDIA-002's URL bug making even the honest fallback silently fail                                                                                     |
| Wake-word/barge-in default-off, per-toggle, no bulk "grant everything" trap | `apps/desktop/src/features/settings/VoiceSettings.tsx:551-660`                                                                 | Each control is its own toggle with its own explanatory subtitle, consistent with the benchmark's own "default-off, per-category" pattern (`shots-chatgpt-ios-health-voice-work.md` §1.4) rather than one master switch                                                                                                                                                                                                                      |

## Gaps

### 1. Video generation delivery is broken end-to-end on Desktop and Mobile — the two surfaces the founder named as the top release gate

The 2026-08-09 founder decision recorded in `docs/agent-context/HANDOFF.md:47-56` sets "Max 15x
image/video generation working end to end on Web, Mobile and both Desktop shells" as the single
highest-priority release gate, ahead of tool loops, artifacts, and connectors. As of this reading:

- **Web**: works (see Strengths above), with one residual reliability gap (VOICE-MEDIA-003).
- **Electron "AGI Cloud" shell**: by design loads the hosted web app directly
  (`audit/parity-2026-08-15/inventory/desktop-electron.md` §1), so it inherits Web's (mostly-fixed)
  behavior in its default mode.
- **Native Tauri shell**: **no reachable image or video generation exists in the live chat UI at
  all.** See VOICE-MEDIA-001.
- **Mobile**: generation completes and bills the user, then the result can never be viewed. See
  VOICE-MEDIA-002.

Two P0s below carry the detail. This is the most consequential finding in this domain audit and
the one most directly contradicted by a specific, named founder decision.

### 2. No live, full-duplex conversational voice anywhere in the product

Every surface's voice input is either composer dictation (speech → text, then a normal text turn)
or, on Mobile only, a real but strictly turn-based STT→text→TTS loop
(`apps/mobile/app/(app)/voice.tsx`) — not an interruptible, low-latency, always-listening
conversation. This is the single largest capability gap against both benchmarks: ChatGPT's
GPT-Live and Claude's Voice mode are both marketed, cross-surface, full-duplex features. Already
tracked strategically (no file:line) at `docs/current/gap-audit-2026-08-08.md` `P2-003`; see
VOICE-MEDIA-004 for the current surface-by-surface breakdown with citations. Desktop's own
composer-integrated voice loop is a special case of this and is covered separately as
VOICE-MEDIA-005, since it is fully built code with zero live callers rather than an unbuilt
capability.

**Do not just clone GPT-Live or Advanced Voice Mode when this gets built.** `chatgpt-mobile.md` §4
documents, with named sourcing, that OpenAI's GPT-Live replacement shipped **without** the live
camera/screen-share support the older Advanced Voice Mode had — a dated, still-current regression
users are stuck routing around by falling back to the legacy mode. AGI has nothing to regress _from_
yet, which is the one advantage of building this feature late: design the full-duplex voice
architecture to carry camera/screen context from day one rather than shipping voice-only first and
bolting on vision later under user pressure, the way OpenAI did.

### 3. Image editing is contracted but has zero producers

The managed-media wire contract (`packages/contracts/cloud-contracts/src/managed-media.ts:81-121`)
already defines `operation`/`source_image`/`mask_image` fields for real image edits, and the server
route has a code path for them (`apps/web/app/api/media/image/generate/route.ts:1033-1050`). No
client on any surface ever sends them. Today "editing" means "regenerate a whole new image from an
edited text prompt" — the UI is honest about this (see Strengths), but the underlying capability
gap is real: there is no selection/region tool, no true single-region inpaint, and no way to
preserve the rest of a generated image while changing one part of it. This matters more now than a
week ago — `chatgpt-web-desktop.md` §11 records ChatGPT's July 2026 shipped "expanded image-editing
viewer with Canvas and Focused modes" and a real selection tool for targeted edits. See
VOICE-MEDIA-008.

### 4. Video generation has no reference-image or start/extend input

`ManagedMediaVideoGenerationRequestSchema` (`packages/contracts/cloud-contracts/src/managed-media.ts:167-186`)
accepts only `prompt`/`duration_secs`/`resolution`/`aspect_ratio`/`generate_audio`/`provider`/`model`
— there is no field anywhere in the wire contract for a reference/source image, an end frame, or an
"extend this video" operation. `phase4-capability-audit.md` PP-19 independently confirms "No surface
anywhere claims video-to-video, extend, avatars, sound, music, podcasts, or speech-to-speech" — so
this is scope, not a broken promise, but it is a widening gap: Sora 2 inside ChatGPT supports
remix/extend, and Veo natively accepts reference/first-frame images upstream of AGI's own adapter.
See VOICE-MEDIA-009.

### 5. A live, misleading regulatory claim in Mobile's legal copy

`apps/mobile/app/legal/article-50.tsx:66-72` tells EU users under the Article 50(2) disclosure that
"every AI-generated text, audio, image or video you export is marked with a C2PA-style provenance
claim." The Web compliance module that actually implements this marking says the opposite about two
of those four media types, in its own top-of-file comment: **"Streamed chat text is NOT marked on
any surface and there is no web audio-generation route — both are open gaps, not something this
module quietly handles"** (`apps/web/lib/compliance/ai-act.ts:14-17`). The obligation is not
theoretical — the same file states AGI has served EU users since 2026-06-27 and the Article 50
obligation applies since 2026-08-02, both before this reading. See VOICE-MEDIA-006.

### 6. Desktop has three settings-panel voice controls that visibly turn on and then do nothing

- **Wake Word Detection**: clicking "Enable" starts a real, native microphone-based wake-word
  detector (not a stub) and the button turns green ("Listening"), but the Rust command discards the
  event channel the detector returns (`wake.start().await.map(|_| ())` at
  `apps/desktop/src-tauri/src/sys/commands/voice.rs:896`) and nothing anywhere ever emits or listens
  for a wake event. Saying the phrase does, and can, do nothing — ever. This one is **not** gated
  off; it is reachable and misleading today. See VOICE-MEDIA-007.
- **Barge-in Detection** and **Voice Persona**: both are real (a genuine `vad`-feature detector; a
  genuine `SpeechSynthesis` preview), but both only affect a text-to-speech reply loop
  (`useVoiceModeStore`) that has zero live render calls anywhere in the app — see VOICE-MEDIA-005,
  already tracked in full detail as `DESKTOP-VOICE-CONVERSATIONS-UNWIRED-01` in
  `docs/agent-context/known-flaws.md:3185` (High, Open).
- **System-wide Dictation**: unlike the two above, this one **is** correctly gated off in every
  shipped build — see the correction below.

### A correction to this domain's own brief and to a secondary inventory source

The task brief for this domain, and `audit/parity-2026-08-15/inventory/desktop-tauri.md` §6,
both assert that `voice_inject_text`'s documented safety precondition — "must not be wired into an
automatic dictation flow until [target-pinning/secure-field-refusal] lands" — has been violated in
shipping code. **Direct code verification shows this is false**, and the more authoritative
`docs/agent-context/known-flaws.md:505-512` (`DESKTOP-SYSTEM-DICTATION-UNWIRED-01`, dated after the
inventory doc) already reached the same correction independently: `system_dictation_available()` is
a hardcoded `false` (`apps/desktop/src-tauri/src/features/speech/dictation/coordinator.rs:36`), so
every `Global`-source dictation session is refused at admission and the UI renders "Unavailable"
with the button disabled (`apps/desktop/src/features/settings/VoiceSettings.tsx:594-596`). The
Rust-side global-hotkey release handler for the case that is reachable literally says **"No global
capture pipeline exists yet (plan phase 3+), so a release cancels rather than transcribes"**
(`apps/desktop/src-tauri/src/sys/commands/voice_global.rs:234-236`). Separately, the JS
`injectText`/`voiceInjectText` action chain
(`apps/desktop/src/stores/settings/voice.ts:744-751` → `apps/desktop/src/api/voice.ts:436-441`)
has **zero callers anywhere in the app outside its own definition** — it is not wired into the
global-PTT flow or any other flow; it merely sits in the same store file as `startGlobalPtt`, which
is what the inventory doc appears to have mistaken for wiring. This is not a live gap. A residual,
low-severity hardening recommendation is filed as VOICE-MEDIA-012 — the command remains registered
and invokable by _something_ in the future without redoing the deferred safety work, which is worth
closing off deliberately rather than leaving as an always-true "it's gated so it's fine" assumption.

## What NOT to copy

1. **Don't ship live voice without camera/screen context, the way GPT-Live did.** See the note
   under Gap 2 — this is a dated, sourced, still-current OpenAI regression
   (`chatgpt-mobile.md` §4). AGI has nothing to regress from yet; design the full-duplex
   architecture to include screen/camera grounding from the first release rather than a
   voice-only v1 that has to catch up later under complaint pressure.
2. **Don't adopt ChatGPT's "silent no-op" failure mode for anything billed.** Mobile's video
   generation (VOICE-MEDIA-002) already does the thing `cross-cutting-and-complaints.md` §8 warns
   against in a different context ("Don't let a cost-saving infra change silently become a quality
   regression") — a paid feature that fails with zero user-facing signal is worse than a feature
   that says plainly it doesn't work yet, which is the pattern Web's `/settings/voice` page and
   Mobile's `GeneratedVideo.tsx` already use correctly elsewhere in this same domain.
3. **The turn-based mobile voice screen is a legitimate design, not a placeholder to be ashamed
   of.** It is honestly labeled, has a working orb/phase UI, and reuses the same `sendMessage`
   pipeline as text chat (so tool-calling and agent work already flow through it transparently).
   When full-duplex voice ships, keep push-to-talk/turn-based as a supported, named mode rather
   than deleting it — Claude's own iOS settings expose exactly this choice
   (`shots-claude-ios.md` §30, "Hands free" vs. "Push to talk," each with its own documented
   trade-off) rather than forcing one architecture on every user.

## Gap list (severity-ordered)

| ID              | Sev | Feature                                                          | Surface                    |
| --------------- | --- | ---------------------------------------------------------------- | -------------------------- |
| VOICE-MEDIA-001 | P0  | Image/video generation unreachable in live Desktop chat          | desktop-tauri              |
| VOICE-MEDIA-002 | P0  | Mobile video generation billed but undeliverable                 | mobile                     |
| VOICE-MEDIA-003 | P1  | Web video jobs have no abandoned-job reconciliation sweep        | web, backend               |
| VOICE-MEDIA-004 | P1  | No full-duplex live voice on any surface but Mobile (turn-based) | cross-surface              |
| VOICE-MEDIA-005 | P1  | Desktop's built voice-conversation loop has zero live callers    | desktop-tauri              |
| VOICE-MEDIA-006 | P1  | Mobile legal copy overclaims text/audio provenance marking       | mobile                     |
| VOICE-MEDIA-007 | P2  | Desktop Wake Word Detection is a live, misleading dead control   | desktop-tauri              |
| VOICE-MEDIA-008 | P2  | Image editing is contracted but has zero producers               | web, mobile, desktop-tauri |
| VOICE-MEDIA-009 | P2  | Managed transcription still has no usage settlement              | backend                    |
| VOICE-MEDIA-010 | P2  | Video generation has no reference-image / extend input           | shared                     |
| VOICE-MEDIA-011 | P3  | No image annotation/markup tool before sending                   | cross-surface              |
| VOICE-MEDIA-012 | P3  | `voice_inject_text` should be hardened/removed while unused      | desktop-tauri              |

See `domain-voice-media.json` for full per-gap evidence, files, and recommendations.
