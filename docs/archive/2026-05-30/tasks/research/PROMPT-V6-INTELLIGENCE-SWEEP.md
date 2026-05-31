# AGI Intelligence Sweep V6 — 1000-source brief

**Goal:** in 8–16 working hours, produce a ≥1000-row evidence base on the AI-app market as of May 2026 — to feed AGI Mobile (Aug 2026), Desktop, and Web launch decisions in Q3 2026.

**Scope locked.** Do not expand. If V4 PRD lock conflicts with a finding, log it as `lock-challenge` and continue — never silently rewrite.

---

## Four-dimension search matrix

| Dim                              | Targets                                                                              | Source classes                                                                     | Time slice              |
| -------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------- |
| **A. Product UX**                | 25 apps × 6 surfaces (iOS / Android / web / desktop / CLI / ext)                     | App Store + Play + vendor blog + changelog + Reddit + X + GitHub + docs            | 2025-11-01 → 2026-05-17 |
| **B. Provider economics**        | 18 providers × 5 axes (TOS / pricing / caching / quotas / deprecation)               | vendor docs + TOS + pricing pages + engineering blogs + Reddit                     | 2025-11-01 → 2026-05-17 |
| **C. Compliance + store policy** | 4 regulators × 5 rules (Apple 5.1.2(i), 4.3, 2.5.2, EU AI Act, GDPR / state-privacy) | regulator pages + Apple forums + IAPP + GDPR-info + court records + dev complaints | 2024-08-01 → 2026-05-17 |
| **D. Launch + GTM**              | 5 channels × 3 metrics (acquisition / retention / churn) × 6 surfaces                | HN + r/SaaS + r/iOSProgramming + r/androiddev + ProductHunt + YouTube reviews      | 2025-11-01 → 2026-05-17 |

**Apps (25):** ChatGPT, Claude, Gemini, Perplexity, Copilot, Grok, DeepSeek, Kimi, Manus, Cursor, Continue.dev, Cody, Cline, Windsurf, Pi, Character.AI, You.com, Phind, Poe, MindMac, TypingMind, BoltAI, Chatbox, Jan, Msty.

**Providers (18):** Anthropic, OpenAI, Google, xAI, DeepSeek, Mistral, Perplexity, Moonshot, Zhipu, Qwen, Groq, Together, Fireworks, Azure OpenAI, AWS Bedrock, OpenRouter, Cloudflare Workers AI, Cohere.

Combinatorics: A 25 × 6 × 8 = 1,200 cells · B 18 × 5 × 5 = 450 cells · C 4 × 5 × 5 = 100 cells · D 5 × 3 × 6 = 90 cells = **~1,840 search cells**. Floor: 1 evidence row per 2 cells ≈ **920 rows minimum**; target ≥1,000.

**Recommend fan-out:** one subagent per dimension running passes 1-4 in parallel.

---

## Methodology — four passes, in strict order

1. **X / Twitter** — `from:vendor` queries, hashtag scans, replies to vendor accounts.
2. **Reddit + HN + dev forums** — high-upvote / high-comment threads only; flag astroturf.
3. **GitHub** — issue trackers, CHANGELOGs, milestones, release notes.
4. **Primary sources** — vendor docs, App Store / Play listings, regulator pages, court / commission filings.

No claim survives without a primary-source citation by Pass 4 close. Passes 1-3 are signal; Pass 4 is verification.

---

## Deliverables (all under `tasks/research/`)

1. **`_evidence.csv`** — append ≥1,000 new rows. Schema: `evidence_id, dimension, target, surface, source_class, source_url, captured_date, content_date, claim_text_<=240ch, metric, confidence (H|M|L), corroborating_ids, counter_evidence (Y|N), impacts_prd_section, notes`.
2. **`_search_log.csv`** — PRISMA-style. Every query logged including 0-hit / paywalled / language-blocked, with reason_excluded.
3. **`10-intelligence-sweep-may2026.md`** — 3,000–4,500 word synthesis. Four sections (A / B / C / D), each with top-10 findings, decision-impact bullets, anti-claims (V4 PRD assumptions the evidence contradicts), open gaps.
4. **`_risk_register.csv`** — append R-019+ rows for any new severity-3+ risk.
5. **`_decisions_to_lock.md`** — candidate locks for PRD V5 in `#NN — Title · Rationale · Source · PRD section it lands in` format.

---

## Quality bar

- Every numeric claim dated within 12 months of 2026-05-17.
- Every TOS / pricing / regulator quote verbatim with URL.
- Counter-evidence logged even when it doesn't shift the conclusion.
- Paywalled sources: log + skip — do not paraphrase from blog quotes.
- Mandarin / Chinese primary sources accepted with `[ZH] <URL>` + verbatim English translation.
- No claim about "all users / everyone reports / common pattern" without ≥3 independent corroborating sources.

---

## Anti-patterns — do not produce

- LLM-generated lists ("there are many apps including…") without a per-entry App Store / Play / GitHub / vendor URL.
- Pricing snapshots without a captured-date.
- "Reasonable assumption" claims without source.
- Silent overwrite of any V4 lock — log as `lock-challenge` with full evidence instead.

## V4 locks — do not re-research (use as ground state)

Mobile-first sequencing · Expo + RN + native modules · Tier hierarchy (Apple FM / Gemini Nano → react-native-executorch → llama.rn) · StoreKit IAP global default + EU external-link entitlement gating · Apple Small Business Program at 15 % · `@agiworkforce/llm-normalize` as canonical contract with `CacheIntent` / `CacheObservation` · telemetry off by default · BYOK + Local free-forever · 21 anti-pattern locks · 7 pricing guardrails + Token COGS budget · EU AI Act 2026-08-02 compliance gate · `models.json` SSOT · Pro Max $99 W6 build target · Apple 5.1.2(i) consent modal copy locked.

---

## Abort + stop conditions

- 16 h elapsed, < 800 rows → ship what you have with explicit gaps list.
- WWDC 2026 keynote drops a material on-device-AI change before write-up → pause; append addendum.
- Any one of the four dimensions returns < 100 sources after Pass 3 → log `under-sourced` for the next iteration scope.

---

_End of brief. Author against PRD V4 corpus at HEAD as of 2026-05-17. Self-contained — anything not in this brief is out of scope._
