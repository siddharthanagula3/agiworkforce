# Decisions locked — PRD V5

**Date:** 2026-05-17 (evening) · **Authority:** founder grant of full authority based on V6 intelligence sweep + 16-auditor codebase verification + web-verified primary sources · **Status:** LOCKED in `docs/PRD.md` V5.

Every decision below has at least one primary-source citation and lands in a specific PRD section. None of these are recommendations any more — they are commitments.

---

## §10 anti-pattern locks added (locks #22-26)

### #22 — Three-tier route default in `models.json`

- **Lands:** PRD §10 lock 22 · PRD §20 lock 18
- **Cascade:** Local (Apple Foundation Models / Gemini Nano AICore / executorch) → cache-aggressive middle (DeepSeek V4-Flash at 98% cache-hit discount OR Kimi K2.6 with auto-cache) → frontier (Claude Sonnet 4.6 / GPT-5.4 / Gemini 3.1 Pro)
- **Why:** Verified DeepSeek V4-Flash cache-hit at $0.0028/M vs Claude Sonnet at $3/M = ~1,070× cost gap. The middle tier explicitly bends the Token COGS curve before frontier escalation.
- **Sources:** [DeepSeek API docs](https://api-docs.deepseek.com/quick_start/pricing) · [Kimi platform docs](https://platform.kimi.ai/docs/models) · [Apple Foundation Models WWDC25](https://developer.apple.com/videos/play/wwdc2025/286/)
- **Enforcer:** `packages/routing/src/three-tier-router.ts` integration tests assert cascade order.

### #23 — Cache-discount magnitude raised from implicit 50% → verified 90%

- **Lands:** PRD §10 lock 23 · PRD §16 Token COGS budget · PRD §20 lock 19
- **Multiplier:** 0.10× on cached tokens (vs 0.50× V4 assumed).
- **Why:** OpenAI auto-cache ≥1,024 tokens = 90% off · Anthropic cache reads at 0.1× base input · DeepSeek V4-Flash 98% off. V4's implicit 50% understated savings.
- **Sources:** [OpenAI prompt caching](https://platform.openai.com/docs/guides/prompt-caching) · [Anthropic prompt caching](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) · [DeepSeek API docs](https://api-docs.deepseek.com/quick_start/pricing)
- **Enforcer:** `services/api-gateway/src/cost-estimator.ts` uses 0.10 multiplier.
- **Hit-RATE targets unchanged**: ≥30% pre-launch / ≥50% post-stabilization.

### #24 — `deprecation_date` field + alias-aware indirection per model

- **Lands:** PRD §10 lock 24 · PRD §20 lock 20
- **Urgent anchor entries:**
  - `kimi-k2.6` — replaces `kimi-k2-*` family **discontinued 2026-05-25** (7 days from V5 lock date)
  - `deepseek-v4-flash` — replaces alias-deprecated `deepseek-chat`, `deepseek-reasoner`
  - `deepseek-v4-pro` — carries `promo_expires_at: "2026-05-31T15:59:00Z"` flag + auto-reroute logic
  - `claude-opus-4-7` — released 2026-04-16, **tokenizer drift +0-35%** (effective cost up even at unchanged $5/$25 per-token price). All migration tests must re-baseline against Opus 4.7 token counts.
- **Sources:** [Kimi K2.6 release](https://platform.kimi.ai/docs/models) · [DeepSeek API docs](https://api-docs.deepseek.com/quick_start/pricing) · [Anthropic Opus 4.7 docs](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-7)
- **Enforcer:** CI test fails on any model entry without `deprecation_date` field. ESLint rule blocks string literals matching `kimi-k2-[^.]+`, `deepseek-chat`, `deepseek-reasoner` outside `models.json`.
- **Cron:** `scripts/check-pricing.ts` hits provider pages weekly, auto-PR on diff.

### #25 — Mobile v1 = controller + chat surface only (no in-app code execution)

- **Lands:** PRD §10 lock 25 · PRD §20 lock 21 · PRD §17 risk R-022 · PRD-MOBILE §6
- **Verified enforcement:** Apple update-blocked Replit + Vibecode on **2026-03-18**; pulled Anything from store on **2026-03-30**; Anything returned **2026-04-03** only after sandbox changes (external browser preview, no Apple-device-targeted code generation).
- **Sources:** [App Review Guideline 2.5.2 verbatim](https://developer.apple.com/app-store/review/guidelines/) · [MacRumors Mar 18](https://www.macrumors.com/2026/03/18/apple-blocks-updates-for-vibe-coding-apps/) · [MacRumors Mar 30](https://www.macrumors.com/2026/03/30/apple-pulls-vibe-coding-app/)
- **Revisit:** post-WWDC 2026 (June 8-12, 2026) only if Apple ships a sanctioned code-execution entitlement.
- **Enforcer:** mobile Detox e2e test fails if any UI element offers code-execution semantics on iOS surface.

### #26 — EU AI Act Article 50 disclosure + machine-readable marking ships pre-2026-08-02

- **Lands:** PRD §10 lock 26 · PRD Appendix D §D.4 · PRD §17 risk R-023
- **Article 50(1):** "you are interacting with AI" first-run disclosure on every AI surface.
- **Article 50(2):** machine-readable marking on AI-generated text / audio / image exports (C2PA-style provenance claims or invisible token-level watermarking via provider hooks).
- **Penalty exposure:** up to €15M or 3% global turnover.
- **Sources:** [EU AI Act Art 50](https://artificialintelligenceact.eu/article/50/) · [EU Commission AI Act page](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- **Chinese-HQ provider default-off** (DeepSeek, Kimi/Moonshot, Qwen, Zhipu) until per-provider user opt-in with named consent.
- **Enforcer:** `packages/compliance/src/article50.ts` runs in onboarding flow before first AI request; integration test asserts `<meta name="agi:ai-generated">` tag on every export.

---

## §17 risks added (R-021, R-022, R-023)

### R-021 — DeepSeek V4-Pro promo cliff (severity 3)

- **Trigger:** Any user-tier blended margin < 60% on the day post-2026-05-31.
- **Mitigation:** auto-reroute to V4-Flash or Sonnet 4.6 unless workload quality requires V4-Pro.

### R-022 — Apple 2.5.2 enforcement against in-app code execution (severity 4)

- **Trigger:** Any App Review contact citing 2.5.2.
- **Mitigation:** mobile v1 scoped to chat + workflow + remote-controller only. Revisit only post-WWDC 2026.

### R-023 — Chinese-HQ provider routing under EU + US-state ADMT (severity 3)

- **Trigger:** Any EU user report of unexpected Chinese-HQ provider routing.
- **Mitigation:** consent modal enumerates every named third-party AI provider; default-off for Chinese-HQ; route metadata `cn_hq: true` triggers extra consent affordance.

---

## §20 locked decisions added (#17-21)

### #17 — Mobile-first is FIRST-IN-TIME, not ONLY-IN-SCOPE

- **Refinement of V4 §20 lock #11** (which said mobile is the first implementation). V5 explicitly tightens: mobile leads the App Store / Play submission cycle; **web parity ships the same week** as mobile public launch; **desktop reaches W6 build-target stability BEFORE mobile launches** because the Claude Code Remote Control + Codex Mobile patterns prove the consumer surface is a controller of a desktop session, not standalone.
- **Why this matters:** V6 sweep evidence (Cursor $2B ARR multi-surface · Claude Code $2.5B run-rate · Codex Mobile May 2026) shows persistent cross-surface state is the retention moat. A mobile-only wrapper launch is the weakest competitive shape.

### #18 — Three-tier route default (see lock #22 above for detail)

### #19 — Cache-discount magnitude 90% (see lock #23 above for detail)

### #20 — Model deprecation calendar (see lock #24 above for detail)

### #21 — Mobile v1 = controller + chat only (see lock #25 above for detail)

---

## Sources cited

All primary; every web-verified 2026-05-17 evening.

- [Apple App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (5.1.2(i) + 2.5.2 verbatim)
- [Apple Small Business Program](https://developer.apple.com/app-store/small-business-program/)
- [Apple Foundation Models — WWDC 2025 session 286](https://developer.apple.com/videos/play/wwdc2025/286/)
- [Apple Newsroom — Foundation Models framework](https://www.apple.com/newsroom/2025/09/apples-foundation-models-framework-unlocks-new-intelligent-app-experiences/)
- [EU AI Act Article 50](https://artificialintelligenceact.eu/article/50/)
- [European Commission AI Act page](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- [DeepSeek API pricing docs](https://api-docs.deepseek.com/quick_start/pricing)
- [Moonshot Kimi platform model list](https://platform.kimi.ai/docs/models)
- [Anthropic Claude Opus 4.7 release notes](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-7)
- [Anthropic prompt caching docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)
- [OpenAI prompt caching guide](https://platform.openai.com/docs/guides/prompt-caching)
- [MacRumors — Vibe coding apps blocked Mar 18 2026](https://www.macrumors.com/2026/03/18/apple-blocks-updates-for-vibe-coding-apps/)
- [MacRumors — Anything pulled Mar 30 2026](https://www.macrumors.com/2026/03/30/apple-pulls-vibe-coding-app/)

---

_End of decisions-locked document. Next amendment requires a PR against `docs/PRD.md` per §21 lifecycle._
