# Mobile Release Strategy — Hardening-First, Local-LLM-Led

Status: ACTIVE DIRECTION (founder-stated 2026-05-31). Plan; no code yet pending gap-verification + research.
Owner: founder + platform
Last updated: 2026-05-31

## Goal (founder's words, distilled)

1. **Ship the mobile app to App Store + Play Store FAST.**
2. **Harden what already exists FIRST** (the app is structurally complete — ~67 screens — so this is a
   hardening + polish pass, not a greenfield build). Then release **features to TestFlight one by one**.
3. **Primary product = LOCAL LLMs + their interface + the thinking block.** Then match ChatGPT/Claude mobile
   _only where a small local model can realistically deliver it_.

## The core product thesis (why local-first wins despite small models)

Sub-4B on-device models can't do heavy tasks and drain battery on mobile GPUs — so we DON'T compete on raw
capability. We win on **privacy**: the user's data never leaves the device. Target use-cases:

- Sensitive/company/private information the user won't share with any cloud
- Emotional support / journaling / personal conversations
- Personalization that stays on-device
- Offline use
  Anything heavy (deep research, image gen, big-context coding, web search, connectors) is CLOUD mode — a
  SEPARATE mode (chats transfer local↔cloud, with a consent flash on local→cloud).

## Sequencing (locked)

- **Phase A — HARDEN what exists** (pre-submission): the audit's P1s + the TRUE gap list (from gap-verify
  workflow w2mtl50bv) for already-built features. No new features. Make the local path rock-solid:
  thinking block (already built — verify+polish), local model download/run, chat, settings, biometric,
  remoteChatGate fail-closed, error/empty states. Get it submittable.
- **Phase B — Submit to App Store + Play Store** (local-first build; cloud behind invite/alpha as it lands).
- **Phase C — TestFlight feature rollout, one by one**: local auto-model-selection by modality
  (spec ready: docs/plans/mobile-local-auto-model-selection-2026-05-31.md), then the real gaps from the
  TRUE gap list, then cloud-mode features as the Clerk/Neon work matures.

## Inputs feeding this (already on disk)

- TRUE gap list: produced by workflow w2mtl50bv (corrects the over-reporting parity spec).
- On-device LLM research: deep-research workflow wf_a05cc8ce-9ed (which models run on most phones; tools/
  vision/function-calling; runtimes; battery; OSS projects) → will land as a cited report.
- Parity design patterns: docs/plans/mobile-parity-design-spec-2026-05-31.md (USE for design, NOT for status).
- Auto-model-selection spec: docs/plans/mobile-local-auto-model-selection-2026-05-31.md.

## Hard rules carried in

- Local & cloud are SEPARATE modes; local→cloud transfer requires consent flash.
- No BYOK on mobile (Desktop/CLI only).
- remoteChatGate stays fail-closed; local chats stay on-device.
- Work in main, commit per feature; light verify (typecheck+build); founder does device UX testing.
- Verify before building — the parity spec over-reports gaps (e.g. thinking block was claimed missing but is
  fully built). Never duplicate working code.

## Open question for founder (after research lands) — PARTIALLY RESOLVED 2026-05-31

- DEFAULT download model: **Qwen3 1.7B/4B** (RESOLVED 2026-05-31). ~~Gemma-3n~~ needs LiteRT-LM and we're
  ExecuTorch-only → Qwen3 is the wired `.pte` default (tool-use+vision); Hammer for function-calling; LFM2 to A/B.
- RUNTIME: **Option B** — ship ExecuTorch+Qwen3 now; add **Cactus** post-launch (Tier 2.5) for Gemma-4 + on-device
  AUDIO, gated on license review + iOS spike. The `packages/local-llm` 3-tier abstraction already supports this.
  Detail: `docs/plans/mobile-ondevice-runtime-future-2026-05-31.md`.
- Min device tier: **6GB+ RAM (≈ iPhone 12+, Android last ~4 yrs).** (resolved)
- Detail + rationale + tradeoffs: `docs/plans/mobile-ondevice-llm-research-2026-05-31.md` ("Founder decisions").
- Unblocks Phase-A: model-card copy, tokens/sec display, capability flags (vision+audio), download-UX sizing.

---

## TRUE GAP LIST OUTCOME (2026-05-31, workflow w2mtl50bv)

Verified 81 items vs ACTUAL code: **67 already-built · 8 partial · 6 real-gap · 0 wrong-claim.**
The parity spec over-reported by ~83%. Full detail: `docs/plans/mobile-TRUE-gap-list-2026-05-31.md`.
Already-built (do NOT rebuild): thinking chip+sheet+parsing+duration, voice full-screen (STT+TTS+waveform),
artifacts gallery+detail, model picker (local+cloud sections, badges, auto-modes, extended-thinking toggle),
attachment preview bar, empty state + greeting + task chips, citations, download status badges.

### Phase-A local polish backlog (the ONLY build set before submission) — small

1. Effort control → API: UI+store exist (AddToChatSheet, agentControlStore) but `effort` never sent;
   add to body in `chatExecutionStore.ts:579` + `streaming.ts attemptStream`. (low)
2. Thinking-chip capability gating: guard `hasReasoning` render by model capability so non-thinking local
   models don't show empty chips (`MessageBubble.tsx:95,334`). (low)
3. tokens/sec on local model card: add to `detailForLocalModel()` `service.ts:249-254` + ModelDef. (low)
4. History search wiring: `SearchBar` built but not connected to `DrawerContent` (~line 443-483). (low)
5. Send-failure error toast/banner with retry (chat screen; offline queue is currently silent). (low)
6. Skeleton loaders (message list) + error screens (ModelMissing/DiskFull/NetworkError) in edge-cases. (medium)
   Plus audit P1s: iOS min-version (eas.json 12.0 → 13.0+ per Expo 55), voice "offline" badge copy.

### DECISIONS (founder, 2026-05-31)

- **HOLD Phase-A coding until the on-device-LLM deep-research (wsq6bzm62) lands.** The default-model +
  runtime choice informs the local-mode polish (model card, tokens/sec, download UX, capability flags).
- **Cloud-only screens stay OUT of local mode** (Profile, Billing, Usage, image-generation UI,
  Model&Thinking cloud sub-screen). Build them in the CLOUD track when Clerk/Neon matures. NOT Phase-A,
  NOT gated rows in local — fully separate, per the local/cloud separation rule.
