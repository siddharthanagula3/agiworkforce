# AGI Workforce Auto-Routing Spec — Frozen 2026-05-07

> Source of truth for the auto-routing system across all 6 surfaces. Aligned via Q&A on 2026-05-07. **Do not edit without re-discussion.** Owner: Siddhartha.

---

## 1. Tier Matrix

| Tier      | Price                | Token cap/mo        | Pool                                                         | Auto          | Manual picker              | Tools                                                                | Specialty caps                                                                                             |
| --------- | -------------------- | ------------------- | ------------------------------------------------------------ | ------------- | -------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Free**  | $0                   | 100K + 5 msgs/day   | Pool B                                                       | Yes (forced)  | No                         | None                                                                 | None                                                                                                       |
| **Local** | $0                   | unlimited (own GPU) | Ollama / LMStudio                                            | No            | Yes (only mode)            | Per local model                                                      | n/a                                                                                                        |
| **BYOK**  | $0                   | own quota           | User's keys, manual select                                   | No            | Yes (only mode)            | Per user provider                                                    | n/a                                                                                                        |
| **Hobby** | $10 / ₹399 GST-incl¹ | 2M                  | Pool B (global) / Pool C (India) / Pool A (China — reserved) | Yes (forced)  | No                         | + web search + Projects light + voice 60 min/mo (with burn warnings) | 10 images/mo                                                                                               |
| **Pro**   | $29.99               | 10M                 | Sonnet 4.6 + Gemini 3.1 Pro + GPT-5.4 mini + Kimi K2.6       | Yes (default) | Yes (Advanced mode toggle) | + Artifacts + CU light + edit/review + voice 300 min/mo              | No video, no Opus, no GPT-5.5                                                                              |
| **Pro+**  | $49.99               | 10M                 | Pro pool + Opus 4.7 (15K/day) + GPT-5.5 (15K/day)            | Yes (default) | Yes (Advanced mode toggle) | + advanced CU + bigger Projects + voice 1500 min/mo                  | + 60 sec/mo Runway Gen-4 video (720p), US-only routing toggle                                              |
| **Max**   | $299.99              | 50M                 | Pro+ + Opus 1M/mo + GPT-5.5 1M/mo                            | Yes (default) | Yes (Advanced mode toggle) | + everything unlimited within caps + voice unlimited + cache-aware   | + 5 min/mo Runway Gen-4 video (720p, 1024p choice) + computer use 1K soft / 2.5K hard / mo + deep research |

Cap behavior (all paid tiers): warn at 80% / silent downgrade to workhorse at 100% / hard cap at 150%.

¹ Hobby pricing reconciled 2026-05-15 — `packages/types/src/billing-catalog.ts` lock: $10/mo, $59.88/yr (≈50% annual discount). Pro $29.99/mo $299.88/yr (~17% annual discount); Pro+ $49.99/mo $499.88/yr; Max $299.99/mo $2,999.88/yr.

China launch: BYOK-only at v1; Hobby tier reserved for when payment infra (Pingpong / Adyen-CN-acquirer) is solved.

## 2. Pool Definitions

### Pool B — Global default

| Slot                            | Model                         | API ID                                       | Pricing $/M (in/out) |
| ------------------------------- | ----------------------------- | -------------------------------------------- | -------------------- |
| Workhorse 80%                   | Gemini 3.1 Flash-Lite Preview | `gemini-3.1-flash-lite-preview`              | 0.25 / 1.50          |
| Escalation 12% (coding+complex) | GLM-4.7                       | `glm-4.7` (Z.AI primary, DeepInfra fallback) | 0.30 / 1.20          |
| Reasoning 8%                    | DeepSeek V4 Flash thinking    | `deepseek-v4-flash`                          | 0.14 / 0.28          |
| Image                           | Imagen 4 Fast                 | `imagen-4.0-fast-generate-001` (Vertex)      | $0.02/img            |

Worst case at 2M cap: ~$1.10 with caching. Expected: $0.55–0.70.

### Pool C — India variant

Same as Pool B, plus **Sarvam-M for Indic queries** when input contains >20% Devanagari/Tamil/Telugu/Bengali/Gujarati/Punjabi/Malayalam/Kannada Unicode. Sticky for the conversation. Sarvam free tier covers most Indic chat at near-zero COGS.

### Pool A — China variant (reserved)

Pool A Hobby (when shipped):
| Slot | Model |
|---|---|
| Workhorse 80% | DeepSeek V4 Flash |
| Escalation 12% | GLM-4.7 |
| Reasoning 8% | DeepSeek V4 Flash thinking |
| Image | Doubao Seedream / Imagen 4 Fast (Vertex `asia-southeast1`) |

Pool A Pro (when shipped): DeepSeek V4-Pro + GLM-5 (minimal, 2-model pool).

Pool A Pro+/Max: TBD when ready to launch CN.

### US-only Pro+ overlay

When Pro+ user toggles "Region: US/EU only", router skips Chinese vendors (DeepSeek / Kimi / Zhipu / Doubao / MiniMax). Falls back to: Sonnet 4.6 / Gemini 3.1 Pro / GPT-5.4 / Llama 4 (DeepInfra US) / Mistral. ~30% per-request cost increase absorbed by tier cap.

## 3. Routing Internals

- **Classifier**: heuristic-first (regex + length + attachment + Unicode-range), LLM-fallback when confidence <0.6 (Gemini 3.1 Flash-Lite, ~80ms p50). Hits 75–85% on heuristics alone.
- **Task taxonomy**: 11-value `RoutingTaskType` from `packages/types/src/runtime.ts` is canonical. All other taxonomies project into it.
- **Conversation context**: 5-turn sliding window with sticky pivot (running mode +0.1 confidence; override only when new turn confidence ≥0.85). Cumulative tokens >50K → force long_context.
- **Conversation continuity**: always pass full conversation history. Rely on prompt caching to keep cost low.
- **Prompt caching**: always-on. Cache system prompt + tool definitions block + conversation prefix at separate cache breakpoints.
- **Provider failover**: circuit breaker per provider. Trip at 5 consecutive 5xx OR 50% error rate over 60s. Open 30s, Half-Open with 1 probe. Silent failover to next model in chain.
- **Model selection logic**: `resolveAutoModeModel(autoModeId, tier, taskType?)` extended signature; backward compatible (undefined `taskType` falls back to general slot).
- **Indic detection**: Unicode-range scan of input, sticky for conversation. >20% Indic → swap workhorse to Sarvam-M.
- **Geo detection**: IP + billing address. China-detected → Pool A overlay (when launched). India-detected → Pool C overlay.

## 4. UX Decisions

- **Auto routing UX**: fully silent. No model chip, no toast, no model name visible to user. Model exposed only in API metadata for debugging.
- **Manual picker**: hidden behind 'Advanced mode' settings toggle on Pro/Pro+/Max. Off by default.
- **Cap-hit / blocked-feature UX**: inline contextual paywall card replaces the assistant response. Shows "Upgrade to [tier] for [feature]" + [Upgrade] [Try later] buttons.
- **Migration**: greenfield (no existing users to migrate).
- **First-time user**: Free tier with 100K + 5/day. Auto routes invisibly.

## 5. Geo + Localization

- **India**: ₹399 GST-inclusive Hobby ($3.97 net after 18% IGST). Razorpay UPI Autopay primary, card e-mandate fallback. Sarvam-M for Indic queries auto-detected.
- **China**: BYOK-only at v1. ¥35 Hobby reserved when payment processor solved (Pingpong / Adyen-CN-acquirer). Free 6-month grace period planned post-launch.
- **Rest of world**: $5 Hobby. Stripe primary.

## 6. Capabilities Gating

| Capability                                   | Free | Hobby                 | Pro                     | Pro+                    | Max                             |
| -------------------------------------------- | ---- | --------------------- | ----------------------- | ----------------------- | ------------------------------- |
| Text Auto routing                            | ✓    | ✓                     | ✓                       | ✓                       | ✓                               |
| Web search                                   | —    | ✓                     | ✓                       | ✓                       | ✓                               |
| Projects (saved chats)                       | —    | light                 | full                    | full                    | full                            |
| Artifacts                                    | —    | —                     | ✓                       | ✓                       | ✓                               |
| File uploads                                 | —    | —                     | ✓                       | ✓                       | ✓                               |
| Image gen (Imagen-4 Fast)                    | —    | 10/mo                 | unlimited within bucket | unlimited within bucket | unlimited within bucket         |
| Computer use                                 | —    | —                     | light                   | advanced                | unlimited (1K soft / 2.5K hard) |
| Code execution                               | —    | —                     | ✓                       | ✓                       | ✓                               |
| MCP servers                                  | —    | basic (with warnings) | ✓                       | advanced                | unlimited                       |
| Video gen (Runway Gen-4)                     | —    | —                     | —                       | 60 sec/mo @ 720p        | 5 min/mo @ 720p or 1024p        |
| Opus 4.7 access                              | —    | —                     | —                       | 15K tokens/day          | 1M tokens/mo                    |
| GPT-5.5 access                               | —    | —                     | —                       | 15K tokens/day          | 1M tokens/mo                    |
| Deep research                                | —    | —                     | —                       | —                       | ✓                               |
| Voice (Wispr-Flow: Whisper STT + AI rewrite) | —    | 60 min/mo             | 300 min/mo              | 1500 min/mo             | unlimited                       |
| US-only routing toggle                       | —    | —                     | —                       | ✓                       | ✓ (default)                     |

## 7. Telemetry + Privacy

- **Telemetry**: privacy-safe features only. Log message length bucket, has_code_block, has_attachment, attachment mime, language code, cumulative token bucket, classifier confidence, selected model, fallback chain, outcome metrics (latency, tokens, user_overrode, regenerated, thumbs). **Never log message text or hashes.** Hash userId with daily-rotated salt for cohort analysis. Retrain confidence model weekly.
- **Privacy policy**: explicit list of routing destinations (Google, Anthropic, OpenAI, Z.AI, DeepSeek, Moonshot, etc.). Pro+ users get a "no Chinese vendor routing" toggle.
- **Free tier disclosure**: Google AI Studio free tier may train on inputs. Disclose in privacy policy. Pro+ never uses free-tier routes.

## 8. Operational Landmines (next 90 days)

| Date                     | Event                                                        | Action                                                     |
| ------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------- |
| **2026-05-15 12:00 PT**  | Grok 4.1 Fast + 7 other Grok IDs deprecate                   | Don't include in any pool.                                 |
| **2026-05-31 15:59 UTC** | DeepSeek V4-Pro 75% promo expires                            | **Pre-emptively swap V4-Pro → Kimi K2.6 in Pro pool now**. |
| **2026-06-01**           | Gemini 2.0 Flash + 2.0 Flash-Lite shutdown                   | Confirm Pool B uses 3.1 Flash-Lite, not 2.x.               |
| **2026-06-30**           | Older Imagen 3 endpoints retire                              | Confirm we use `imagen-4.0-fast-generate-001`.             |
| **2026-07-24 15:59 UTC** | DeepSeek `deepseek-chat` and `deepseek-reasoner` aliases die | Pin `deepseek-v4-flash` everywhere.                        |

## 9. Rollout Sequence

| Phase       | Duration | Scope                                           |
| ----------- | -------- | ----------------------------------------------- |
| **Phase 1** | ~6 weeks | All 6 surfaces ship Free + Hobby simultaneously |
| **Phase 2** | ~3 weeks | All 6 surfaces ship Pro                         |
| **Phase 3** | ~3 weeks | All 6 surfaces ship Pro+                        |
| **Phase 4** | ~3 weeks | All 6 surfaces ship Max                         |

Total ~15 weeks.

## 10. Week 1 Engineering Scope

**Phase 1 prerequisites that block everything else:**

1. Update `packages/types/src/models.json` — Kimi K2.6 swap, current model IDs, current pricing
2. Extend `packages/types/src/model-catalog.ts:resolveAutoModeModel(autoModeId, tier, taskType?)`
3. Define new `SLOT_REGISTRY` entries for Pool B (workhorse_general / escalation_coding / reasoning slots with new model IDs)
4. Define new `TIER_POLICIES` entries for Free / Hobby (with cap behavior fields, capability gates)
5. Replace `unifiedLLMService.updateConfig()` global mutation with factory pattern (concurrency blocker)
6. Wire `canUserMakeUsagePricedRequest()` into `UnifiedLLMService.streamMessage()` (closes billing bypass)
7. Implement heuristic classifier in shared package (`packages/routing/src/classify.ts`)
8. Implement Indic Unicode-range detection in shared package
9. Implement quota tracking middleware (warn 80% / downgrade 100% / hard cap 150%)
10. Stub the inline paywall card UX in web chat (full impl in week 2)

**Out of scope for week 1:**

- LLM-fallback classifier wiring
- Geo overlay routing (Pool A/C)
- US-only routing toggle
- Privacy-safe telemetry pipeline
- Circuit breaker + failover
- Razorpay integration (week 3)
- Stripe price IDs for new tiers (week 2)

---

**Spec aligned across rounds 1–17 of Q&A on 2026-05-07. See conversation transcript for full reasoning trail.**
