# AGI PRD V5 — Research prompt for remaining gaps

**Date authored:** 2026-05-17
**Triggered by:** end-to-end verification of `docs/PRD.md` V4 + `docs/PRD-MOBILE.md` + `docs/PRD-APPENDIX-{A,B,C,D}.md` + `docs/PRD-RESOLUTIONS-AND-AUDIT.md` (39,911 words across 7 files).
**Scope:** ONLY items still ambiguous, under-researched, or marked `needs_full_pass` after V4. Items already settled (StoreKit IAP default, telemetry scrubbing locks, CacheIntent/CacheObservation contract, EU AI Act gate, 5 severity-5 risks #16–#20) are NOT re-asked.
**Methodology:** four-pass (X/Twitter → Reddit/HN → GitHub → primary sources / vendor docs / regulator pages).
**Deliverable shape:** mirrors existing `tasks/research/` pack — markdown report per group + PRISMA-style `_search_log.csv` + evidence rows added to `_evidence.csv` + risk-register deltas appended to `_risk_register.csv`.

---

## What V4 already locked (do NOT re-research)

1. Mobile-first sequencing, M0–M3 milestones, Aug 1–16 2026 launch window.
2. Stack: Expo + RN + native modules; no Swift/Kotlin rewrite v1.
3. Mobile runtime tier order: Apple Foundation Models / Gemini Nano (T1) → react-native-executorch (T2) → llama.rn (T3).
4. Excluded SDKs: Cactus, RunAnywhere, MediaPipe LLM Inference (mobile), MLX-Swift direct.
5. StoreKit IAP as the **default** global mobile purchase path; EU external-purchase link as a gated alternative.
6. Apple Small Business Program (15 %) baseline assumption.
7. `@agiworkforce/llm-normalize` as canonical app contract; CacheIntent / CacheObservation schemas defined.
8. Telemetry off by default; Sentry / PostHog / OTel scrubbers; no session replay on AI screens.
9. 21 anti-pattern locks including managed-cloud "customer application access" framing.
10. 7 pricing guardrails + Token COGS budget targets (cache-hit ≥30 % pre-launch / ≥50 % post-stabilization, ≥60 % gross margin).
11. EU AI Act compliance gate aligned to 2026-08-02.
12. Pro Max $99 tier as W6 build target.
13. 18-row NIST AI RMF risk register + top 5 mirrored to PRD §17 #16–#20.
14. Apple 5.1.2(i) consent modal copy in Appendix B §B.7.
15. Model defaults (Qwen 2.5 1.5B fast / Llama 3.2 3B capable / Gemma 3 4B vision / whisper-base.en / nomic-embed-text-v1.5).

Anything inside the 15 items above is locked. Use it as ground state; do not produce alternatives.

---

## Group A — Provider TOS & capability gaps still marked `needs_full_pass` in research §03

These rows in `tasks/research/03-developer-sdks-apis.md` provider capability matrix carry a `needs_full_pass` flag for TOS / capability detail. Each is BYOK-only on AGI (lower stakes than managed-cloud Anthropic/OpenAI/Google) but still a candidate for the mobile / desktop catalog. Confirm or revise.

### Q1 — Perplexity Sonar / Sonar Deep Research

- Pricing today (per-model + multi-component billing for Sonar Deep Research: search-result count, reasoning tokens, citation overhead).
- TOS posture on BYOK: does Perplexity contemplate third-party clients adding user keys?
- Rate limits at sustained usage (10 / 100 / 1000 req/min cohorts).
- Streaming/tool-call/structured-output capability.
- Is there a public deprecation policy for `sonar-small` / `sonar-medium` / `sonar-large` aliases?

### Q2 — Moonshot Kimi K2.6 / xAI Grok 4.20+4.3 / DeepSeek V4 Flash + V3.2 / Mistral Codestral 2508 / Zhipu GLM-4.7 / Qwen 3.6 Plus + Max Preview + 3 Coder Next

For each: pricing as of mid-May 2026; BYOK acceptable-use posture; deprecation calendar; structured-output and tool-call support; whether US-from-China-restricted-region routing has any export-control issues for AGI's mobile distribution.

### Q3 — Hosted-open-model aggregators (Groq / Together AI / Fireworks AI)

- BYOK posture (do they accept end-user keys via third-party client?).
- Rate-limit profile for free-tier and paid-tier keys.
- Model availability roadmap (especially Llama 4 hosted, Mixtral retirements).
- Do they allow downstream resale or just customer-app access?
- Latency benchmark vs direct provider for the top 5 routed models.

### Q4 — Enterprise gateways (Azure OpenAI / AWS Bedrock)

- Can a consumer mobile app reasonably support an end-user pasting Azure OpenAI / Bedrock keys? Or do these require enterprise identity binding that makes BYOK impractical on mobile?
- Data-residency story for an EU user routing through Azure / Bedrock keys their employer owns.
- Anything in their TOS that flags BYOK mobile clients differently from web?

### Q5 — OpenRouter as gateway route

- Concrete numbers on the BYOK surcharge (% above provider list) and how it scales by volume.
- TOS edge case: does OpenRouter forbid using their gateway from inside an aggregator client like AGI? PRD V4 §11 says "OpenRouter is an optional route, not a legal simplifier" — confirm with current OpenRouter terms text.
- Sticky cache semantics (provider-specific cache_control routed through OpenRouter — does it actually preserve provider TTL settings?).

---

## Group B — Mobile runtime ground-truth (PRD-MOBILE §8 Tier 1/2/3)

V4 locks tier order but does not have concrete benchmark numbers on real hardware. Mobile M0 spike (May 17-23) will produce some of this; the prompt is for **external benchmarks already public**, to triangulate before the spike runs.

### Q6 — Apple Foundation Models (iOS 26+)

- Public benchmarks (token/s decode, cold-start, peak RSS, thermal behavior) on iPhone 14 Pro / 15 / 15 Pro / 16 / 16 Pro across at least one foundation-models task class.
- What entitlements does an app need to call `FoundationModels.framework` in iOS 26.0 / 26.1?
- Are there any usage caps or quotas Apple imposes on third-party apps using on-device Foundation Models?
- iOS 27 + Foundation Models v2 rumor map (WWDC 2026 announcement scope, what's confirmed vs speculation; multilingual, vision, tool-use additions).
- Privacy Manifest categories required when an app uses Foundation Models on-device.

### Q7 — Gemini Nano via AICore + ML Kit GenAI (Android)

- Device-availability matrix as of May 2026 (Pixel 8 / 8 Pro / 9 / 9 Pro / Galaxy S24 / S24 Ultra / S25 — and the MediaTek/Qualcomm expansion path Google announced).
- Performance benchmarks on flagship devices.
- AICore download-on-demand UX (does the OS download the model silently, or does the app trigger it?).
- ML Kit GenAI feature surface: text rewrite, image description, proofread — are any of these worth wiring into AGI mobile v1 in addition to plain Gemini Nano inference?
- Android 16 + Gemini Nano roadmap (Google I/O 2026 follow-on items, AICore expansion to MediaTek Dimensity 9400 / Qualcomm 8 Gen 4).

### Q8 — react-native-executorch (T2)

- Production stability in May 2026: GitHub issue rate, version cadence, known crashes on iOS 17 / iOS 18 / iOS 26, Android 13/14/15/16.
- Real-world apps that ship react-native-executorch in production today (case studies, app names).
- ExecuTorch 1.0+ release notes — what changed vs the 0.x line that materially affects mobile chat?
- iOS Metal acceleration: does `react-native-executorch` use it by default for the standard GGUF/PTE formats AGI is shipping, or does the app need extra config?
- Android NPU acceleration on Qualcomm Hexagon / MediaTek APU — what works out of the box vs requires per-device tuning?

### Q9 — llama.rn (T3 fallback)

- New Architecture (Fabric + TurboModules) stability in v0.10+ as of May 2026.
- Crash-free session rates from any published apps that ship llama.rn in production.
- Maintainer activity (mybigday) — release cadence, response time on critical issues.
- Memory-pressure handling on devices with 4 GB / 6 GB RAM (the realistic floor AGI will hit).
- Quantization compatibility (Q4_K_M / Q5_K_M / Q8_0 behavior on iOS Metal vs Android CPU).
- whisper.cpp + llama.cpp coexistence — do they fight over shared memory or accelerator state?

---

## Group C — Apple App Store + Google Play 2026 reality

V4 has the policy text; the gap is enforcement / rejection patterns / approval timing. Real data > policy text.

### Q10 — Apple 5.1.2(i) rejection patterns 2026

The guideline updated Nov 2025. Six months in, what are real-world rejection examples?

- Search developer forums (developer.apple.com/forums, indie-hackers, hacker-news, /r/iOSProgramming, /r/apple) for AI BYOK apps that hit 5.1.2(i) rejection in 2026.
- What disclosure language survived review? What got rejected?
- Was a privacy-policy link alone ever accepted post-Nov-2025?
- Did pre-checked acceptance toggles trigger rejection?
- Did "I understand and accept" require explicit verb "consent" or was "accept" sufficient?
- Average review-cycle length for an AI app submitted Q1/Q2 2026.

### Q11 — Apple Small Business Program edge cases

PRD V4 assumes 15 % commission via SBP. Confirm operational reality:

- What counts as "proceeds" for the $1M threshold? (Apple's accounting vs developer's recognized revenue.)
- What happens at the moment a developer crosses $999,999 → $1,000,001 mid-year? Retroactive 30 % charge, or does the 15 % rate hold for the calendar year?
- Re-qualification rules: does AGI need to apply every year, or is renewal automatic if proceeds stayed under $1M?
- Does SBP apply to subscriptions specifically, or only to one-time IAPs?
- Any developer reports in 2025-2026 of SBP enrollment getting denied unexpectedly?

### Q12 — Apple Privacy Manifest required-reason API codes 2026

PRD-MOBILE §13 declares NSPrivacyAccessedAPICategory{UserDefaults, SystemBootTime, DiskSpace, FileTimestamp}. Confirm:

- The exact "approved reason" sub-codes Apple requires for each category as of May 2026 (Apple updates the approved-reasons list periodically).
- Whether on-device ML inference (Foundation Models, react-native-executorch, llama.rn) requires any additional category declaration (e.g., `NSPrivacyAccessedAPICategoryActiveKeyboards`, hardware identifiers).
- Common rejection patterns for Privacy Manifest gaps in 2026.

### Q13 — Google Play AI-Generated Content Policy + Data Safety reality

PRD-MOBILE §14 references the policy. Confirm operational details:

- Concrete examples of what "incorporate user feedback / reporting" means in practice — is an in-app "Report" button on every AI message sufficient, or does Google require backend moderation workflows?
- Data Safety section: how to declare "no data collected" when telemetry is opt-in (does turning telemetry on later require an update of the Data Safety form?).
- Rejection patterns for AI apps in Play 2026 (in particular, are local-only AI apps treated more permissively than cloud-routing ones?).
- Asset download disclosure: must the size be in the Play listing, or is in-app disclosure sufficient?
- Any current restrictions on apps that integrate Gemini Nano + third-party LLMs in the same UI?

### Q14 — ASO conversion benchmarks for AI productivity apps 2026

PRD-MOBILE §19 sets a 50 % onboarding-completion target. Triangulate from public data:

- Public ASO benchmark reports (Appfigures, AppTweak, Sensor Tower) for AI/Productivity category install→activation rates in 2026.
- How do "privacy-first" AI apps (DuckAssist, Brave Leo, others) compare to ChatGPT/Claude/Gemini for onboarding-completion + 7-day retention?
- Conversion benchmarks specifically for apps requiring a model download on first run.
- Top 5 search-keyword strategies for "private AI" / "local AI" / "offline AI" / "AI without internet" / "BYOK AI" in App Store + Play 2026.

---

## Group D — EU AI Act + privacy operational reality

V4 Appendix D §D.4 sets the compliance gate. The gap is enforcement record + operational implementation.

### Q15 — EU AI Act enforcement track record 2026

- Has the EU Commission published any enforcement actions against AI app providers (deployers, not providers) between 2024-08-02 and 2026-05-17?
- What does "AI literacy" obligation (Art. 4) operationally require — onboarding screen, help-center article, training log, or all three?
- For deployers of general-purpose AI (AGI's posture): what documentation must be maintained on file vs published?
- EU representative / Data Protection Authority registration: is this required for a US-incorporated app shipping to EU users via App Store?
- Concrete examples of "transparency labels" Commission has approved as compliant.

### Q16 — DSAR for hybrid local/cloud apps

V4 Appendix D §D.4 #2-3 specify `/api/user/export` and `/api/user/delete-account`. The hard case: how do you honor a DSAR when conversation data lives in **SQLCipher on the user's phone** and the cloud server only has E2EE ciphertext?

- Legal opinion / regulator guidance: does GDPR Art. 20 (portability) require server-side reconstruction, or does an in-app "export this device's data" satisfy the right?
- Same question for Art. 17 (erasure): is uninstalling the app sufficient for the device-side data?
- Reference implementations from privacy-first apps (Signal, Standard Notes, Cryptee, Proton) for DSAR-on-end-to-end-encrypted-data.
- Specific CCPA / state-law variations that might require different handling than GDPR.

### Q17 — Stripe Managed Payments (2026-04-22.dahlia) specifics

PRD V4 §10 lock #5 + risk #5 calls for the Dahlia upgrade. Confirm operational reality:

- What concretely differs in Dahlia vs clover (2026-02-25) for a recurring-subscription SaaS?
- Are there new webhook events AGI must handle?
- Managed Payments for in-app subscription: does it interact differently with Apple/Google IAP cohorts vs Stripe-direct web cohorts?
- Stripe Tax + Stripe Radar updates in Dahlia that affect AGI's cohort policy (web vs StoreKit users at the same tier).

---

## Group E — Operational benchmarks the V4 cannot fabricate

### Q18 — Prompt-caching real-world hit rates 2026

V4 §16 Token COGS budget targets ≥30 % cache-hit pre-launch / ≥50 % post-stabilization. What does literature show is actually achievable?

- Anthropic, OpenAI, Google: any published case studies of multi-provider client cache-hit rates?
- Engineering blog posts from companies running prompt-cached production traffic (Vercel, Cursor, Perplexity, Continue.dev, Cody) — what hit rate did they actually see?
- For a chat-app workload (vs RAG workload), what's a realistic ceiling on cache-hit rate?
- Specific Gemini cached-content storage cost: how does it compound at 10K MAU vs 100K MAU?

### Q19 — Multi-provider client churn / LTV benchmarks

PRD V4 §18 sets ≥100 % NRR among paid cohort. Triangulate against comparable apps:

- Published churn / LTV numbers from any multi-provider AI client: TypingMind, MindMac, BoltAI, Chatbox, LibreChat (especially the paid managed-hosting tiers some of them offer).
- Why do users leave multi-provider clients? (Cancel reasons logged by these apps.)
- BYOK → managed-cloud conversion rates in this category.

### Q20 — Vercel + Supabase + Fly.io scale economics May 2026

V4 Appendix D §D.1 has cost projections at 10K / 100K / 1M MAU but they are engineering estimates. Confirm with current pricing:

- Vercel Pro vs Enterprise pricing for an app serving 100K MAU with heavy SSE traffic to `/api/llm/v1/chat/completions`.
- Supabase Pro vs Team vs Enterprise: Realtime concurrent-connection limits, Postgres connection caps, RLS-policy evaluation overhead at scale.
- Fly.io machine pricing for the `api-gateway` Express service at 100K MAU.
- Cloudflare R2 / Hugging Face / BunnyCDN comparison for serving 2-4 GB GGUF model downloads to 100K MAU.

### Q21 — MCP marketplace launch reality (post-2025-11-25 spec)

PRD V4 §17 risk #18 + Appendix D §D.6 cite MCP `2026-06-30-RC` as the next milestone. What's actually happening in May 2026?

- Has a public MCP marketplace launched (Anthropic, Cursor, Claude Desktop, others)?
- What scopes / permissions does the live ecosystem use today?
- Are there any documented malicious-MCP-server incidents 2025-11 to 2026-05?
- What % of MCP servers in the wild require auth (OAuth 2.1) vs static API key?
- The 2026-06-30-RC milestone: what specific breaking changes vs 2025-11-25 are tracked in the GitHub milestones?

---

## Group F — Future-proofing one quarter ahead

### Q22 — iOS 27 + Foundation Models v2 (WWDC 2026 follow-on)

WWDC 2026 occurs early June; AGI Mobile launches July–August. What's already announced or strongly rumored that AGI should pre-bake support for?

- Foundation Models v2 capability expansion (vision, multilingual, tool-use, longer context).
- New entitlement requirements.
- New Privacy Manifest categories.
- Anything new for app-controlled model selection / fine-tuning.
- Apple Intelligence eligibility expansion (more iPhones / iPads).

### Q23 — Anthropic Claude 5 + OpenAI GPT-6 deprecation calendars

- Public timing leaks for Claude 5 (Anthropic news) — does it deprecate 4.6/4.7?
- GPT-5.5 (released April 23, 2026 per V4 §11) — does it have a deprecation calendar for 5.4? GPT-6 leak window.
- Gemini 4 timing post-3.1 — Google's pattern is roughly annual.
- DeepSeek V4 deprecation calendar (V4 already flagged alias-risk for `deepseek-chat`).
- Updates to `packages/types/model-registry.yaml` (W6 deliverable) — what alias-risk migrations are imminent?

---

## Workflow — four-pass methodology

**Mandatory order. Do not skip passes.**

### Pass 1 — X / Twitter

- Search the topic on x.com search (`from:` queries, hashtags, replies to vendor accounts).
- Capture concrete claims with screenshot-quote-and-link evidence.
- Note dates; ignore anything pre-2025-11-01 unless it's a primary vendor announcement.

### Pass 2 — Reddit + Hacker News + Developer forums

- Target subs: r/iOSProgramming, r/androiddev, r/MachineLearning, r/LocalLLaMA, r/ChatGPT, r/ClaudeAI, r/Bard, r/apple, r/ProductManagement, r/SaaS.
- Hacker News: search.algolia.com/hn for thread titles and high-comment threads.
- Capture: high-upvote / high-comment threads with reproducible quotes; flag astroturf patterns.

### Pass 3 — GitHub

- Issue trackers for: `react-native-executorch`, `llama.rn`, `whisper.cpp`, `sqlite-vec`, `expo`, `expo-router`, `nativewind`, `@anthropic-ai/sdk`, `openai-node`, `@google/generative-ai`, `modelcontextprotocol/specification`.
- Search closed + open issues; flag any production stability or licensing concerns.
- Read CHANGELOGs of pinned versions in PRD-MOBILE §8 "Locked versions."

### Pass 4 — Primary sources / vendor docs / regulator pages

- Apple developer docs, App Store Review Guidelines, EU DMA support page.
- Google Play policy center, Android developer docs, AICore developer guide.
- Anthropic Commercial Terms, OpenAI Services Agreement, Google Gemini API Terms, OpenRouter Terms.
- EU Commission AI Act page, GDPR-info.eu Article pages, IAPP US State Privacy Legislation Tracker.
- NIST AI RMF, OWASP LLM Top 10 v2.0, OWASP Agentic AI Threats 2026.
- Vendor pricing pages (verify current prices vs PRD numbers).

**No claims survive without a primary-source citation by the end of Pass 4.** Pass 1-3 are signal-gathering; Pass 4 is verification.

---

## Deliverables

### Per group, one markdown report

Path: `tasks/research/v5/{NN}-{group}.md` (N = 01-06, group = `provider-tos-gaps`, `mobile-runtime-benchmarks`, `apple-google-reality`, `eu-ai-act-privacy`, `operational-benchmarks`, `future-proofing`).

Each report contains:

1. **Recommendation** at top (one sentence) — what AGI should do based on findings.
2. **Why** (3–5 bullets).
3. **Detailed findings** organized by sub-question, each with:
   - Q##.# label matching this prompt
   - Bullet-point findings
   - Sources cited inline as `[S###]`
4. **Decision impact on PRD** — explicit list of which PRD sections / Appendix sections / risk-register rows / locked decisions need to update, and the exact diff.
5. **Sources** — every S### cited, with format `S### — Title (publisher, YYYY-MM-DD). URL. One-line context.`.

### Aggregate artifacts

1. **`tasks/research/v5/00-MASTER-SYNTHESIS.md`** — 3,500-5,000 words. Executive summary of all six groups. Top-10 takeaways. Top-5 new risks. List of PRD V4 → V5 deltas (numbered).

2. **`tasks/research/v5/_search_log.csv`** — PRISMA-style. Columns: `query, source_class (X|Reddit|HN|GitHub|VendorDoc|Regulator), date_run, hits, included_count, excluded_count, reason_excluded`.

3. **`tasks/research/v5/_evidence.csv`** — append-only matrix. Columns: `evidence_id, claim, group, q_number, source_id, source_url, evidence_date, confidence (high|medium|low), counter_evidence_present (yes|no), notes`.

4. **`tasks/research/v5/_risk_register_delta.csv`** — append-only rows extending the existing `_risk_register.csv`. Same schema (Risk ID R-019+, AI RMF function, Failure mode, Evidence, Likelihood, Severity, Mitigation, Residual risk, Revisit trigger).

5. **`tasks/research/v5/_decisions_to_lock.md`** — for any finding that resolves a `needs_full_pass` flag from V4, write the new lock candidate in PRD-style format: **#NN — [Decision title].** Rationale. Source. PRD section it lands in.

---

## Quality bar

- Every numeric claim cites a primary source dated within 12 months of 2026-05-17.
- Every screenshot / quote / forum excerpt is reproduced verbatim with link.
- Every "vendor says X" claim is verified against the vendor's current docs, not third-party reporting.
- Counter-evidence is logged even when it doesn't change the recommendation.
- No claim about "all users" / "everyone reports" / "common pattern" without ≥3 independent corroborating sources.
- Any item that can't reach primary-source confidence by Pass 4 closes as **`needs_further_research`** with a specific blocker (e.g., "Apple developer-account login required to view Privacy Manifest reason codes for 2026 update — defer to founder").

---

## Anti-patterns (do NOT produce)

- "Reasonable assumption" claims without source.
- Recommendations that conflict with V4 locks #1-#15 above. (If research suggests a lock is wrong, raise it as a **`lock-challenge`** with full evidence — do not silently rewrite.)
- LLM-generated competitor lists ("there are many AI apps, including…") — must be concrete named apps with App Store / Play / GitHub link.
- Pricing snapshots without a date.
- TOS quotes without URL and quoted exact text.

---

## Output sequence

1. Acknowledge prompt; confirm scope (this six-group set, not V4 re-research).
2. Run Pass 1 → 4 for Group A → F. Pass them as serially as needed for evidence chains but parallel-search inside each pass.
3. Write the six group reports + aggregate artifacts.
4. Return: a single short summary message with paths to all artifacts.

---

_End of V5 gap-research prompt. Author: Principal Architect against PRD V4 corpus at HEAD as of 2026-05-17. This prompt is the complete contract — anything not in this prompt is out of scope for V5 research._
