# Voice AI reverse-engineering report: Lemon and Wispr Flow

Status: Reference (founder-dropped, 2026-07-20)
Owner: Platform lead
Scope note: roadmap reference for the voice/dictation lane (turn-based voice is
shipped; realtime/duplex is provider-gated — see project-voice-duplex memory).
NOT an implementation trigger under the 2026-07-16 feature freeze. Key
overlaps with current repo state: the ASR pricing figures match the
2026-07-20 catalog verification (gpt-4o-transcribe $0.006/min); the
privacy-mode/push-to-talk/zero-retention lessons align with the
desktop-trust-boundary-01 slice; the report's "typed planner + confirmation +
idempotent tools" agent blueprint matches the AGI executor architecture.

**Research cutoff:** July 20, 2026.

This is a public-source, functional reverse engineering based on first-party pages, privacy and terms documents, app stores, launch pages, demos, public user reports, GitHub projects, developer forums, infrastructure case studies, and independent tests. It does not rely on decompiled proprietary code.

### Evidence labels

- **Verified:** First-party documentation, current store listing, official infrastructure partner, or directly published company statement.
- **Reported:** User review, independent test, promotional demo, or third-party teardown. These can be version-specific.
- **Inferred:** Architecture deduced from verified behavior and common implementation patterns.

---

## Executive synthesis

Wispr Flow and Lemon share a dictation core but are fundamentally different products.

| Dimension                  | Lemon                                                                                                              | Wispr Flow                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Primary product            | A voice-controlled desktop agent                                                                                   | A system-wide AI dictation keyboard                                                              |
| Main output                | Polished text **and completed tasks**                                                                              | Polished text inserted into the active application                                               |
| Interaction                | Speak an instruction; Lemon decides whether to dictate, edit, search, or act                                       | Hold or toggle a trigger, speak, and receive cleaned text                                        |
| Context                    | Selected text, active-screen context, optional screenshots, web search, connected accounts, workflow memory        | Active application, nearby text, dictionary, style, snippets, and optional active-window context |
| Action scope               | Email, calendar, documents, search, application and URL actions, multi-step work                                   | Dictation, selected-text editing, formatting, snippets, and command mode                         |
| Current distribution       | macOS; Windows and mobile waitlists                                                                                | macOS, Windows, iPhone, and Android                                                              |
| Proprietary technical clue | Cloud audio and screen processing, third-party LLMs, OAuth integrations; GCP and Supabase are maker-declared clues | Fine-tuned Llama cleanup models served through Baseten on AWS                                    |
| Hardest part to reproduce  | Safe contextual planning and reliable side-effecting actions                                                       | Latency, correction quality, personalization, and cross-application insertion reliability        |

The shortest path to an equivalent product:

1. Build a Wispr-like dictation engine.
2. Add selected-text commands and personalization.
3. Add Lemon's intent router, observation broker, connectors, planner, confirmation layer, and workflow memory.

The exact ASR model used by either product is not publicly established. Wispr's transcript-cleanup stack is much better documented than Lemon's internal stack. The real moat is unlikely to be raw speech recognition alone: it is the combination of endpointing, context selection, accepted-correction data, latency engineering, application integration, and trust.

---

# Phase 1 — Direct product profiles (condensed to load-bearing facts)

## Lemon (heylemon.ai)

- Mac voice assistant: spoken instructions → polished writing or finished tasks; Fn-key activation; no separate chat window.
- Verified capabilities: system-wide dictation, drafting, selected-text editing, contextual generation, explicit screenshot capture, web search, OAuth email/calendar/docs/contacts/files access, local app/URL actions, workflow memory, Privacy Mode (zero-retention plan feature), user-initiated (not autonomous) actions.
- Privacy policy: real-time voice streaming, stored audio, screen-region capture on activation, third-party LLMs under no-retention/no-training terms; raw integration content transient, user-visible outputs retained. Documentation ambiguity between in-product Privacy Mode and email-based opt-out/default retention.
- Stack clues: GCP + Supabase (maker-entered on Product Hunt, Medium confidence); exact ASR/agent model/desktop framework unknown. No public API, SDK, changelog, or engineering blog.
- Pricing (July 2026): Basic free — 25 agent tasks/day, unlimited dictation, 10-workflow memory, Privacy Mode. Pro $199/yr (vs $240 monthly reference = $20/mo); unlimited tasks. macOS DMG only; Windows/mobile waitlists.
- Key design clue: unlimited dictation vs METERED agent tasks — dictation has predictable unit cost; agent tasks fan out to larger models, retrieval, connector calls, retries.

## Wispr Flow (wisprflow.ai)

- System-wide voice dictation replacing typing: filler removal, spoken self-correction resolution ("two—actually three"), punctuation/lists, app + nearby-text context, 100+ languages, whisper mode, custom + auto-learned dictionary, snippets, styles, selected-text commands, Command Mode, developer/code mode (camelCase, snake_case, CLI), team + enterprise (SSO/SAML, dashboards, enforced privacy), local transcript recovery, cross-device sync.
- VERIFIED stack (Baseten case study): fine-tuned Llama cleanup models on Baseten/AWS, TensorRT-LLM + Chains; whole post-speech pipeline target ~700 ms p99; ~250 ms for 100+ cleanup tokens. Exact ASR model NOT public.
- Data controls (2026-06-17): cloud transcription always; Privacy Mode governs training/eval use; Private Cloud Sync governs retention; zero-retention = Privacy Mode ON + Private Cloud Sync OFF. App name used for formatting; nearby textbox content for caps/commands; optional Context Awareness sends active-window TEXT. Local recovery on-device.
- Third-party teardown (April 2026, version-specific): Electron shell + native Swift helper, event taps, Accessibility insertion, local SQLite; a stale-modifier-key incident suppressed spacebar input. Screenshot claims disputed/version-dependent.
- Platforms: macOS/Windows hold-to-talk; iPhone keyboard (iOS keyboard extensions have NO mic access — containing-app handoff required); Android floating bubble via overlay + Accessibility service, 5-min session limit, OEM battery-manager kills.
- Pricing (July 2026): Basic free (2,000 words/wk desktop, 1,000 iPhone, Android unlimited-for-now); Pro $15/mo or $12/mo annual; Enterprise custom; 14-day trial.
- Independent test: ~3.9% WER, ~1.5 s post-stop latency (6 recordings — small sample). Business Insider reported an accidental-activation incident pasting private speech into a work app → design lesson: unmistakable recording state, easy cancel, timeouts, stuck-trigger safeguards.

---

# Phase 2 — Reproduction evidence

Open-source clones prove the core loop is commodity: FreeFlow (MIT, macOS hold-to-talk + cleanup via Groq/OpenAI), Voicetypr (AGPL-3.0, Rust+Tauri, local-first), Yap (MIT, local whisper), Unramble reference (persistent OpenAI Realtime WebSocket + warm backup + HTTP fallback), SpeechOS (browser SDK).

> Global trigger → audio capture → streaming or local ASR → cleanup model → context-aware validation → active-cursor insertion.

Hard parts: consistently fast, accurate, unobtrusive, private, reliable across hundreds of apps.

OS constraints: macOS event taps + Accessibility (modifier-state bugs are a real failure class); Windows RegisterHotKey + TSF/UI Automation (UIPI blocks injecting into elevated apps); iOS keyboard extensions lack mic access; Android IME vs overlay+Accessibility bubble (store scrutiny, OEM service kills).

---

# Phase 3 — Build blueprint (full detail retained)

## Layering

| Layer                         | Purpose                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Shared dictation core         | Audio capture, endpointing, ASR, cleanup, context, personalization, insertion, recovery                            |
| Flow-equivalent product layer | Cross-platform voice keyboard, styles, snippets, command mode, developer mode, team controls                       |
| Lemon-equivalent agent layer  | Intent routing, screen/account context, retrieval, planning, connectors, confirmations, execution, workflow memory |

Build the dictation loop first; every agent action depends on correctly understanding speech (names, numbers, dates, negation).

## Client-server event protocol

session.start {session_id, device_id, language_hints[], mode: dictate|edit_selection|command, active_app, field_type, context_capabilities} / audio.append {sequence, pcm_or_opus_bytes, capture_timestamp} / context.update {selected_text, nearby_text, dictionary_entries[], style_id, protected_tokens[]} / session.commit {final_audio_sequence} / session.cancel. Server: transcript.partial|final, rewrite.partial|final, confirmation.required, session.completed, session.error. Monotonic sequence numbers so retries cannot duplicate text or re-execute actions.

## Trigger UX

Push-to-talk (cleanest endpoint) + toggle (accessibility, needs accidental-activation safeguards). Always show mic state, device, duration, cancel, mode, completion/error. Watchdog cancels on inconsistent key state / lost permission / prolonged silence; force modifier release on hook teardown.

## Audio pipeline

Mic → format conversion → mono resample (16/24 kHz) → optional AEC → AGC → noise suppression (RNNoise/WebRTC) → VAD (Silero/WebRTC) → PCM/Opus 10-20 ms frames → transport, with client ring buffer. Do NOT apply aggressive suppression unconditionally (distorts whispering, names, fricatives, accents); keep before/after DSP fixtures.

## ASR strategy

Two interchangeable cloud streaming providers behind one interface (Deepgram/AssemblyAI class); persistent warm WebSocket; stream during speech; key-release endpointing; regional routing + short-lived fallback connection; opt-in raw/final transcript capture for eval; local whisper.cpp/faster-whisper only after cross-app UX is reliable. TTS only needed for spoken confirmations/voice mode.

## Cleanup stage (the differentiator)

1. Stabilize partials (stable prefix vs unstable tail). 2. Deterministic normalization. 3. Protected-span detection (names, numbers, dates, URLs, emails, paths, code, quotes, dictionary). 4. Contextual cleanup via SMALL low-latency LLM (1-8B fine-tuned on raw-ASR→accepted-text pairs — Wispr's fine-tuned Llama validates this). 5. Semantic validation (reject changed negation/quantities/entities/modality). 6. Safe fallback to raw transcript.

Invariants: preserve meaning, never invent, preserve negation/uncertainty/names/numbers/links/code, remove fillers only when replacement intent is clear, nearby text only for caps/spelling/formatting/referents, never ANSWER dictated content, structured-schema output, code mode preserves delimiters/indentation/identifiers.

Highest-value training signal: the diff between system insertion and what the user actually keeps.

## Context broker

Minimum: app id, control type, selection, 1-2 nearby paragraphs (500-1,500 char budget), cursor, language hints, dictionary, snippets, style, recent corrections. Agent-only extensions: doc title/URL, accessibility-tree summary, user-approved screenshot, clipboard on explicit reference, search results, connected accounts. ALL observed content is UNTRUSTED DATA, never instructions (prompt injection).

## Insertion hierarchy

1. Native text-service/accessibility mutation → 2. app-specific adapter → 3. clipboard paste w/ preserve+restore → 4. synthetic keystrokes. Safeguards: never touch secure fields, detect elevated processes, release modifiers, undoable insertions, local recovery buffer, dedup via session+insertion IDs, verify focus/selection unchanged before replacing. Adapters for Electron editors, contenteditable, Office, Google Docs, Slack, Teams, terminals, IDEs, remote desktop.

## Personalization

Record output + local edit diff → candidate vocab/style corrections → exclude secrets/long numerics/secure fields/one-off pastes → repeated evidence or explicit confirmation before dictionary entry → scope (global/language/app) → confidence decay → full user inspect/edit/export/delete. Workflow memory in DISTINCT categories (communication prefs, entities, samples, workflow templates, connector prefs, explicit facts) — provenance, scope, retention, deletion per item; NOT one opaque vector DB.

## Agent layer

Intent taxonomy: DICTATE / EDIT_SELECTION / FORMAT_SELECTION / ANSWER_FROM_CONTEXT / SEARCH_AND_ANSWER / DRAFT_ARTIFACT / PROPOSE_ACTION / EXECUTE_CONFIRMED_ACTION / RUN_SAVED_WORKFLOW. Dictation bypasses the planner.

Tools are typed with declared risk (read_only | reversible | external_side_effect | destructive), required scopes, validate/preview/execute(idempotencyKey). draft_email needs no confirmation (doesn't send); send_email/create_event/post_message always confirm at the last moment; run_local_command omitted from v1. Safety: instruction/data separation, untrusted content cannot alter policy, narrow OAuth scopes, idempotency keys, human-readable audit, step cancellation, drafts over sends, re-read state before delayed commits, exact timezone handling, screen content never enters long-term memory without explicit request.

## Latency budget (700 ms p99 parity target)

Commit/flush 10-40 → network+gateway 50-150 → ASR finalize 100-250 (bulk during speech) → context 5-30 (prefetched) → cleanup 100-250 (warm small model) → validation 10-40 → insertion 10-80. Stages OVERLAP. Tactics: persistent connections, prefetch context during speech, continuous partials, prewarmed replicas, region-local dictionary/style cache, key-release endpointing, racing backup connections only when justified, raw-transcript fallback on cleanup deadline miss, progressive status. Agent tasks are seconds-scale: show interpreted instruction immediately, stream progress, confirm.

## Privacy design

One switch showing the exact resulting state: audio retention Off / transcript cloud history Off / screenshot retention Off / context retention Off / training Off / third-party zero-retention contract / local recovery On-Off. Zero-retention mode = no persistent audio, transcript, screenshot, context, model request body, or app log. Training data plane separate from analytics. Secure fields disable everything. Least-privilege OAuth, immediate revocation. Logs carry IDs/timing/versions/errors, never raw content.

## Key challenges table (retained verbatim in spirit)

Spoken course corrections (train on backtracking) · meaning drift (protected tokens + semantic checks) · names/jargon (dictionary bias + aliases) · whispered speech (dedicated test set, gentler DSP) · code switching (language hints, constrained sets) · code/CLI (literal protection, code mode) · streaming partial revisions (stable-prefix tracking) · cross-app insertion (adapter matrix) · hotkey state (watchdog + forced release + native helper) · iOS keyboard audio (containing-app handoff) · Android service survival (foreground service + OEM guidance) · Windows elevated apps (UIPI) · accidental recording (PTT default, visible state, timeout, cancel) · agent prompt injection (instruction/data separation) · duplicate side effects (idempotency + action-state DB) · cloud cost (routing, compact models, quotas, local options) · permission trust (progressive onboarding).

## Evaluation metrics

WER/CER · protected-token retention (>99.9% numeric/identifier) · semantic preservation · correction resolution rate · user edit distance · repeated-error rate · e2e p50/p95/p99 (p95 < 1 s; path to 700 ms p99) · insertion success by app (≥99% on declared matrix) · clipboard preservation · CPU/memory/battery · accidental activations per device-hour · crash-free sessions (>99.9%) · agent task success · unintended side-effect rate (zero unconfirmed in red-team suite) · privacy-network audit (no content egress in analytics).

## Development sequence

1 macOS dictation foundation → 2 cleanup parity → 3 context + personalization → 4 Windows → 5 mobile → 6 selected-text command mode → 7 agent foundation (read-only tools) → 8 side-effecting tools (typed confirmation, idempotency, audit) → 9 workflow memory → 10 enterprise controls.

## Cost model

ASR examples (July 2026): AssemblyAI streaming ~$0.15/hr (~$2.50/1,000 min); whisper-1 $0.006/min (~$6/1,000 min); realtime transcription ~$0.017/min (~$17/1,000 min). monthly_cost_per_user = dictated_minutes × (ASR + cleanup inference + streaming network) + connector/agent model cost + storage/sync + support/observability. Wispr prices as transcription-heavy subscription; Lemon meters agent tasks — matching their cost structures.

## Recommended default build

Swift/AppKit macOS shell + Rust shared core + Tauri/React settings UI; native capture + WebRTC/RNNoise + Silero VAD + Opus over persistent WebSocket; two cloud ASR providers first, local whisper later; small fine-tuned Llama/Qwen cleanup on vLLM/TensorRT-LLM + deterministic protected-token validator; Accessibility-first context (selection + nearby text; screenshots only for agent tasks); insertion hierarchy with encrypted local recovery; Go/Rust gateway + Python model services + Postgres + Redis + encrypted OAuth vault, no persistent audio by default; agent extension = intent router + observation broker + typed planner + confirmation policy engine + idempotent tool executor + narrow connectors + auditable workflow memory.

---

# Confidence table (abridged)

High confidence, verified: Lemon cloud voice streaming, explicit screenshots, OAuth + third-party LLMs; Wispr cloud transcription, fine-tuned Llama cleanup on Baseten/AWS, nearby-text + app-identity context, iOS containing-app constraint. Medium: Lemon GCP/Supabase (maker-declared); Wispr Electron+Swift helper (one tested build). Low/unknown: both products' exact ASR; Lemon's desktop framework and agent model; Wispr ordinary-screenshot claims (disputed/version-dependent). No production source or public SDK found for either.

Source URLs: heylemon.ai (+/pricing, /privacy-policy), producthunt.com/products/lemon-3 and /wisprflow, wisprflow.ai (/features, /data-controls, /post/technical-challenges, /post/enterprise-privacy-and-security-overview, /whats-new, /pricing), docs.wisprflow.ai, baseten.co/resources/customers/wispr-flow, wensenwu.com/thoughts/wispr-flow-investigation, news.ycombinator.com/item?id=41696153, businessinsider.com voice-to-text review 2026-5, voice-list.com/reviews/wispr-flow, github.com/zachlatta/freeflow, github.com/snakers4/silero-vad, developer.apple.com (CustomKeyboard, cgevent), learn.microsoft.com (RegisterHotKey), developer.android.com (creating-input-method), developers.deepgram.com, assemblyai.com, elevenlabs.io, play.google.com com.wispr.flowapp.
