# PRD V4 — Appendix D: Scaling, observability, compliance

**Parent:** [`docs/PRD.md`](PRD.md) V4 | **Status:** locked | **Date:** 2026-05-17 | **Source basis:** `tasks/research/` (research pack 2026-05-17, 48 primary sources S001-S048).

This appendix consolidates the cross-cutting findings the research pack surfaced: scaling cost guardrails (Q6), cross-surface state-sync object taxonomy (Q7), observability stack + consent state machine (Q8), GDPR/CCPA/state privacy launch checklist + EU AI Act compliance gate (Q10), and the quarterly architecture-review + model-registry pricing-watch cadence (Q11/Q12).

It is **locked reference material** — every other PRD section may cite this appendix. Conflicts resolve in favor of the most recent commit timestamp.

---

## §D.1 — Scaling cost guardrails (Q6, R-016)

**Principle:** stay managed at 10K MAU; prepare hot-path extraction around 100K MAU; split infrastructure at 1M MAU. The knee point is not user count alone — it is **managed-cloud LLM token COGS plus chat/session volume plus realtime sync plus storage/egress**, whichever crosses 10 % of revenue first.

### Cost projections (engineering estimates — replace with observed COGS after launch)

Assumptions: 60 % BYOK / 40 % Hobby at 10K MAU; 50/50 at 100K; 50 % BYOK / 40 % Hobby / 10 % Pro+ at 1M.

| MAU      | Expected posture                           | Infra ex-LLM ($/mo) |                       LLM COGS risk ($/mo) | Trigger to escalate                                                              |
| -------- | ------------------------------------------ | ------------------: | -----------------------------------------: | -------------------------------------------------------------------------------- |
| **10K**  | Vercel Pro + Supabase Pro + Sentry minimal |           $100-$800 |       $500-$5,000 if managed-cloud is used | Cache-hit rate <30 % for 14 days; support backlog; abuse spike                   |
| **100K** | Still managed, hot paths monitored         |       $1,000-$8,000 |        $10,000-$80,000 without strict caps | Infra >10 % of revenue OR DB / edge saturation OR Realtime concurrent limits hit |
| **1M**   | Split gateway / queue / DB / analytics     |    $15,000-$80,000+ | Dominant cost; must be strictly tier-gated | Custom routing, committed-use vendor deals, self-hosted analytics                |

### Move triggers (per service)

- **Vercel** → migrate `/api/llm/v1/*` to dedicated Fly.io machines when monthly Vercel function-invocation cost >$2K OR p99 latency >2 s sustained
- **Supabase** → upgrade to Team tier when concurrent Realtime connections >500 sustained; consider read replicas at 100K MAU; consider dedicated Postgres at 1M MAU
- **Fly.io api-gateway** → multi-region when EU/Asia latency >300 ms p95
- **Hugging Face / R2 model CDN** → switch to R2 primary + HF mirror when monthly HF bandwidth bill >$500
- **Upstash Redis** → switch to self-hosted Redis on Fly.io when rate-limit operations exceed 100M/month

### Cost knee-point dashboard (W6 deliverable)

`services/api-gateway/admin/metrics` exposes Prometheus metrics for:

- per-tier monthly token spend
- per-provider monthly spend
- cache-hit rate per provider
- infra-cost-as-percent-of-revenue (estimated)
- Realtime concurrent connections
- DB connection pool utilization

Grafana dashboard (or equivalent) renders these. Founder reviews weekly Friday cadence ([§19 wave alignment](PRD.md#19--wave-alignment--engineering-effort)).

---

## §D.2 — Cross-surface state-sync object taxonomy (Q7)

**Principle:** use the lightest conflict-resolution model that the data class can tolerate. CRDT is reserved for genuinely collaborative documents; everything else uses simpler models.

| Object class                                         | Conflict resolution                                                     | Storage                                                                         | Rationale                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| User preferences (theme, default mode, model picker) | **Last-Write-Wins** with timestamp                                      | MMKV (mobile) / localStorage (web) / Tauri settings (desktop) + Supabase mirror | Single-user, low-frequency; LWW is cheap and obvious                      |
| Conversations + messages                             | **Append-only event log**                                               | SQLite (mobile/desktop local) + Supabase `messages` table (cloud)               | Messages are immutable once sent; new turns append; no co-editing in chat |
| Memory facts + custom instructions                   | **Last-Write-Wins** per fact                                            | sqlite-vec + Supabase `memory_facts`                                            | Single-user; latest edit wins; conflicts rare                             |
| Tool execution state                                 | **Server-authoritative**                                                | Server only (Supabase `workforce_executions`)                                   | Tools execute on server; clients observe                                  |
| Artifacts (HTML / Markdown / canvas)                 | **CRDT (Yjs / Automerge)** when shared with another user; LWW otherwise | Server-authoritative + CRDT delta sync                                          | Real-time co-editing requires CRDT — but only for explicitly-shared docs  |
| Project + Team metadata                              | **Last-Write-Wins** + admin override                                    | Supabase                                                                        | Single-author edit pattern; admins can resolve manually                   |
| Dispatch control messages                            | **HMAC-signed, ordered by sequence number**                             | Supabase Realtime + nonce cache                                                 | Already specified in [Appendix A §A.7](PRD-APPENDIX-A-DATA-MODELS.md)     |
| Schedules + cron tasks                               | **Server-authoritative**                                                | Supabase `scheduled_tasks`                                                      | Single source of truth on server                                          |

**v1 scope:** ship LWW for preferences/memory/projects; event-log for conversations; server-authoritative for everything else. **Defer CRDT-based artifact co-editing to v2** unless launch positioning requires real-time collaboration.

**Real-time co-editing is NOT a v1 launch feature.** If product evolves toward Notion-style real-time docs, the lift is: integrate Yjs (~1-2 dev-weeks per surface) + define artifact-doc schema + handle offline merge.

---

## §D.3 — Observability stack + consent state machine (Q8, R-011)

**Principle:** telemetry off by default. Every event class has an explicit consent gate before any data leaves the device. CI redaction tests prevent prompt/output/API-key capture.

### Stack (LOCKED)

| Concern                                | Tool                                       | Activation                        | Privacy controls                                                                                                                       |
| -------------------------------------- | ------------------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Crash reports (mobile + web + desktop) | **Sentry**                                 | Opt-in via Settings → Diagnostics | `beforeSend` strips strings >40 chars; PII scrubbing; no session replay on AI screens                                                  |
| Anonymous product analytics            | **PostHog** (EU cloud or self-hosted)      | Opt-in via Settings → Analytics   | `mask_all_text: true` on AI surfaces; `respect_dnt: true`; cookieless mode in EU; events list capped to navigation + onboarding funnel |
| Server-side traces                     | **OpenTelemetry** → Jaeger or Tempo        | Always-on (server only)           | Attribute filter excludes `message_content`, `prompt`, `response_body`, `api_key`; sampled at 10 %                                     |
| Server logs                            | Pino (Express) / tracing-subscriber (Rust) | Always-on                         | `redact: ['*.prompt', '*.response', '*.api_key']` config; structured JSON; 30-day retention                                            |
| Marketing analytics (web only)         | **Plausible** (self-hosted)                | Cookieless; no opt-in needed      | No prompts/responses ever touch marketing pages                                                                                        |
| Performance / RUM                      | Browser-native `PerformanceObserver`       | Opt-in                            | Aggregated metrics only; no individual user sessions                                                                                   |

**Excluded (do not adopt):**

- Firebase Crashlytics (Google account requirement undermines privacy positioning)
- Mixpanel / Amplitude (too much default event capture; not privacy-first)
- FullStory / Hotjar / LogRocket session replay (would capture prompts/responses — directly violates [§10 lock #20](PRD.md#10--anti-pattern-locks))
- Datadog RUM (heavy, expensive, privacy-default-off)

### Consent state machine

```
STATE: telemetry_consent ∈ {
  not_asked,        // fresh install
  declined,         // user opted out
  diagnostics_only, // crash + critical errors, no analytics
  full              // diagnostics + product analytics
}

INITIAL: not_asked

TRANSITIONS (always user-initiated, never automatic):
  not_asked → declined        : tap "No thanks" on consent banner
  not_asked → diagnostics_only: tap "Help us fix bugs" toggle
  not_asked → full            : tap "Help us improve AGI" toggle
  declined → diagnostics_only : Settings → Privacy → opt in
  declined → full             : Settings → Privacy → opt in
  diagnostics_only → full     : Settings → Privacy → upgrade
  full → diagnostics_only     : Settings → Privacy → downgrade
  * → declined                : Settings → Privacy → opt out

PERSISTENCE: MMKV (mobile) / localStorage (web) + Supabase mirror (cloud-mode users)
```

**Consent banner shows AFTER first message sent, not in onboarding.** Don't gate the first message on a consent dialog (research §08 + §10 alignment).

### Redaction test suite (W6 deliverable)

Every telemetry adapter has a unit test that:

1. Constructs a fake event with prompts / responses / API keys embedded
2. Runs the event through the scrubber
3. Asserts no >40-char string survived (Sentry rule)
4. Asserts `mask_all_text` regions left only `***` (PostHog rule)
5. Asserts OTel attribute filter dropped all flagged keys

Run in CI on every PR. Failing tests block merge.

---

## §D.4 — Privacy launch checklist (Q10, R-010)

Ship every item below **before** public mobile launch (M3 ≤ 2026-08-16). Mark each as `done` in `tasks/launch-checklist-2026-07-18.md`.

### Required at launch (privacy)

1. **Privacy notice at collection** — covers prompts, files, provider keys, telemetry, crash logs, provider-routing data, retention windows, subprocessor list. Web page at `/privacy`; mobile in-app screen + App Store listing reference. ([GDPR Art. 13](https://gdpr-info.eu/art-13-gdpr/))
2. **Data export workflow — two-layer architecture (V5 LOCKED, DSAR research 2026-05-18)**. Article 20 portability is satisfied by **two layers** stacked, not a single ciphertext blob:
   - **(a) Server-side metadata export** via `/api/user/export` — account ID, subscription state, login history, support tickets, abuse logs, consent ledger entries, billing records. Always in scope because AGI can identify and decrypt these.
   - **(b) Device-side readable export** via in-app "Export my data" button (Settings → Privacy) — the authenticated device generates a readable Markdown / JSON ZIP from its own SQLCipher-encrypted store. Ciphertext-only sync-row download is offered as an _optional secondary layer_ for technical users / migration; never as the sole portability response.
   - **Why two layers**: CJEU Breyer + EDPS v SRB establish that identifiability is contextual per-controller; the V5-research DSAR memo flags ciphertext-alone as a weak Article 20 response when the user has an authenticated device capable of generating a readable export. ([GDPR Art. 20](https://gdpr-info.eu/art-20-gdpr/))
3. **Data deletion workflow — explicit server-side encrypted row deletion (V5 LOCKED)**. `/api/user/delete-account` performs:
   - Hard-delete of server-side account metadata + consent-ledger entries within 30 days
   - Hard-delete of server-side encrypted sync rows (`conversations`, `messages`, `memory_facts`) within 30 days — even though AGI cannot read the content, the account-link is still personal data per CJEU contextual identifiability
   - Optional minimal **deletion-marker** record retained ONLY with narrow Virginia-style justification ("minimum data necessary to ensure deleted data stays deleted"), scoped fields, documented retention period (default: 90 days), separate purpose from primary processing
   - In-app **"Delete local data"** control in Settings → Privacy for device-side data (not "uninstall = sufficient" — CNIL mobile-app recommendation cuts against that)
   - Backup-retention statement disclosed in privacy notice: "encrypted sync rows are purged from primary storage within 30 days; backup snapshots are purged within 90 days." ([GDPR Art. 17](https://gdpr-info.eu/art-17-gdpr/))
4. **Retention settings** — user-configurable retention for conversations (default: forever; user can opt 30/90/365/forever); telemetry retention 30 days max; abuse log 1 year max; cache metadata 24 hours max.
5. **Consent ledger** — Supabase `consent_ledger` table records every consent grant: BYOK Apple 5.1.2(i) modal, telemetry opt-in, managed-cloud routing acknowledgment, marketing email opt-in. Immutable append-only.
6. **Global Privacy Control / opt-out flow** — respect `Sec-GPC: 1` header on web; CCPA/CPRA-compliant "Do Not Sell or Share" link on relevant pages. ([CCPA](https://oag.ca.gov/privacy/ccpa))
7. **DPA + subprocessor list** — public page at `/dpa` lists Vercel, Supabase, Sentry, PostHog, Plausible, Stripe, Anthropic, OpenAI, Google, Deepgram, Cloudflare, Hugging Face. Standard Contractual Clauses where required.
8. **Security controls** — encryption at rest (SQLCipher + Keychain), encryption in transit (TLS 1.3), least privilege (RLS on every Supabase table), audit logs for admin actions. ([GDPR Art. 32](https://gdpr-info.eu/art-32-gdpr/))
9. **AI transparency labels** — every chat surface labels: provider, model name, mode (Local / BYOK / Managed Cloud), and a "Why this answer?" affordance describing the routing decision.
10. **Safety reporting** — in-app "Report this output" flow ([Google Play AI-content policy](https://support.google.com/googleplay/android-developer/answer/13985936)).
11. **DPIA threshold check** — per [GDPR Art. 35](https://gdpr-info.eu/art-35-gdpr/), conduct Data Protection Impact Assessment if launching managed-cloud routing through major providers at scale. Result stored at `docs/security/dpia-2026-07.md`.
12. **State privacy laws** — implement generic DSAR (Data Subject Access Request) workflow that satisfies CCPA + Colorado + Connecticut + Virginia + Texas TDPSA + Florida + Oregon without per-state branching. Tracker reviewed at [IAPP US State Privacy Legislation Tracker](https://iapp.org/resources/article/us-state-privacy-legislation-tracker/). **Virginia §59.1-577** is the strongest U.S. statutory analogy for AGI's pseudonymous-data + separate-key architecture; cite it explicitly in the privacy notice.
13. **Article 11 evidentiary package + privacy-notice mode separation (V5 LOCKED, DSAR research 2026-05-18)**. Maintain a documented file at `docs/security/article-11-evidence.md` (NEW) recording: what data AGI can identify (account-linked metadata), what data AGI cannot identify or decrypt (encrypted sync content), what extra information from the user would enable identification (passphrase / device access), and the demonstration evidence (no key escrow, no server-side decryption key, no third-party recovery channel). Privacy notice **must separate Local mode from Cloud-sync mode** as distinct processing contexts under GDPR Articles 13-14. Local-mode section explicitly states: "AGI has no server copy of your Local-mode content. The controller cannot satisfy Articles 15-20 with respect to Local-mode data because the controller is not in a position to identify the data subject's Local-mode content per Article 11(2)." Cloud-sync section enumerates the controller's identifiability scope. CNIL mobile-app recommendation requires the publisher ensure user rights are respected even when implementation depends on a third party (OS uninstall is NOT a delegation of that duty).

### V4 — EU AI Act compliance gate (LOCKED 2026-08-02)

The EU AI Act enters **full application 2026-08-02** — within the AGI Mobile public launch window (target 2026-07-20 to 2026-08-16). Specific obligations active by that date that AGI must satisfy:

| Article / Obligation                                                                         | What it requires of AGI                                 | AGI implementation                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI literacy (Art. 4, active 2026-02-02)                                                      | "Sufficient level of AI literacy" for staff and users   | Onboarding screen explains AI is producing answers; help-center article "How AGI works"; team training log                                                                                                                   |
| Transparency for AI-generated content (active 2026-08-02)                                    | Users must know when content is AI-generated            | Every message bubble labeled with model / mode; "AI-generated" badge on artifacts                                                                                                                                            |
| Manipulation prohibitions (Art. 5, active 2026-02-02)                                        | No subliminal / manipulative AI                         | No dark patterns in onboarding; no fake-urgency upsell                                                                                                                                                                       |
| General-purpose AI provider obligations (Art. 53, active 2026-08-02 with enforcement powers) | Documentation, copyright respect, training-data summary | **AGI is a deployer, not a provider** — does not train its own models. Documents the upstream providers' compliance status.                                                                                                  |
| High-risk AI systems (Annex III)                                                             | Conformity assessment, registration                     | **AGI avoids high-risk use cases at launch** (no employment / education / credit / health / law-enforcement / migration / critical-infrastructure routing). Public copy and tier descriptions exclude regulated decisioning. |

**Compliance gate:** EU paid-tier flip MUST satisfy all above by 2026-08-02 OR EU launch delays to 2026-09 with public note.

---

## §D.5 — OWASP LLM Top 10 v2.0 mapping (Q9, R-015)

AGI's mapping to [OWASP LLM Top 10 v2.0 (2025)](https://genai.owasp.org/llm-top-10/) + [Agentic AI Threats & Mitigations 2026](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/):

| OWASP risk                              | AGI exposure                                                  | Mitigation                                                                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **LLM01 Prompt Injection**              | High — user prompts can contain injection; tool use amplifies | Per-action consent ([§12](PRD.md#12--security--privacy-model)); Prompt Guard 86M classifier on tool routes; system-prompt isolation; cross-prompt-injection-attack tests in CI       |
| **LLM02 Sensitive Info Disclosure**     | High — system prompts + tool descriptions could leak          | `apply-patch` `workspaceOnly: true` default ([Appendix A](PRD-APPENDIX-A-DATA-MODELS.md)); browser-tool `evaluate` gated default-false; redaction tests; system-prompt-leak detector |
| **LLM03 Supply Chain**                  | Medium — provider SDKs + MCP servers                          | SDK pins ([Appendix C](PRD-APPENDIX-C-MONOREPO-LAYOUT.md)); MCP vetted-registry default ([§17 risk #18](PRD.md#17--risk-register-top-15)); pnpm lockfile; SBOM generation in CI      |
| **LLM05 Improper Output Handling**      | Medium — markdown render of LLM output                        | DOMPurify on every render; CSP nonce per request ([§10 lock #6](PRD.md#10--anti-pattern-locks)); 52 `innerHTML` sites audited 2026-05-05                                             |
| **LLM06 Excessive Agency**              | High — tool use can have side effects                         | Per-action consent ladder (Default / Auto-read-only / Bypass-logged); audit log of every tool call; tool allowlist per conversation                                                  |
| **LLM07 System Prompt Leakage**         | Medium                                                        | Debug-only logging; opt-in; never log system prompts at info level; integration test asserts no system-prompt string >40 chars in logs                                               |
| **LLM08 Vector & Embedding Weaknesses** | Low (no public RAG corpus v1)                                 | Memory store is per-user, RLS-scoped; embeddings never leaked across users                                                                                                           |
| **LLM09 Misinformation**                | Medium — model hallucinations                                 | Provider + model labels on every bubble; "AI-generated, may be wrong" disclaimer; cite-source affordance for search-augmented routes                                                 |
| **LLM10 Unbounded Consumption**         | High — Hobby unit economics                                   | 7 pricing guardrails ([§16](PRD.md#16--pricing--billing-model)); rate limiting on every `/api/*`; per-user-per-tier-per-provider budget stop-loss; BYOK abuse detection              |

---

## §D.6 — Pricing-change watch + model-registry cadence (Q11/Q12)

`packages/types/src/model-registry.yaml` (W6 NEW) — explicit registry. Cron job hits provider pricing pages weekly, diffs, opens auto-PR on change.

### Quarterly architecture-review cadence

- **Q3 2026 review (2026-09-01):** post-mobile-launch health check. KPIs: cache-hit rate, gross margin per tier, crash-free sessions, App Review feedback. Re-validate the 10 stack-lock decisions from `tasks/research/00-MASTER-SYNTHESIS.md` §1.
- **Q4 2026 review (2026-12-01):** desktop / web / extensions polish status. Wave 7 planning.
- **Q1 2027 review (2027-03-01):** model-runtime deprecation register sweep — any models that hit EOL within 6 months get migration tasks.
- **Q2 2027 review (2027-06-01):** annual rebaseline; consider stack-lock revisions.

### Vendor roadmap horizon (12-month, per research §09)

| Item                                                         | Source                                                                                                          | AGI impact                                                                 |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| MCP spec next milestone (`2026-06-30-RC`)                    | [MCP roadmap milestones](https://github.com/modelcontextprotocol/specification/milestones)                      | Watch for breaking changes; pin to `2025-11-25` spec until RC stabilizes   |
| EU AI Act enforcement powers (2026-08-02)                    | [EU Commission](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)                      | Compliance gate in §D.4                                                    |
| OWASP LLM Top 10 v3 (~2026 H2)                               | OWASP project                                                                                                   | Re-map mitigations when published                                          |
| Apple iOS 27 + Foundation Models v2 (~2026-09 WWDC followup) | [Apple developer news](https://developer.apple.com/news/)                                                       | Likely capability expansion (vision, multilingual); upgrade Tier 1 routing |
| Android 16 + Gemini Nano updates (Google I/O 2026 follow-on) | [Android developers blog](https://android-developers.googleblog.com/)                                           | Watch for AICore expansion to more devices                                 |
| Anthropic Claude 5 (rumored 2026 H2)                         | [Anthropic news](https://anthropic.com/news)                                                                    | Likely API-stable; update `model-registry.yaml`                            |
| OpenAI GPT-6 (rumored 2027)                                  | [OpenAI blog](https://openai.com/blog)                                                                          | Likely API-stable; watch deprecation of GPT-5.x                            |
| Stripe API next version (Dahlia 2026-04-22 → next, ~2027 Q1) | [Stripe versioning](https://docs.stripe.com/api/versioning)                                                     | Plan SDK upgrade by Q2 2027                                                |
| Veo 4 / Imagen 5 (rumored 2026 H2)                           | Google AI announcements                                                                                         | Update `SLOT_REGISTRY` when GA                                             |
| MediaPipe LLM Inference deprecated (in 2025-12)              | Google AI Edge                                                                                                  | Migrate any reference uses to LiteRT-LM                                    |
| Sora 2 EOL (2026-09-24)                                      | [OpenAI deprecations](https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation) | Already excluded from AGI catalog                                          |

---

## §D.7 — NIST AI RMF risk register pointer

The full machine-readable risk register lives at [`tasks/research/_risk_register.csv`](../tasks/research/_risk_register.csv). 18 NIST AI RMF-aligned rows mapped to Govern / Map / Measure / Manage functions. Top-5 severity-5 risks mirrored as PRD §17 risks #16-#20.

**Refresh cadence:** quarterly architecture review. Add new rows for every new feature in the same severity / mitigation / revisit-trigger format.

---

## §D.8 — Acceptance criteria for V4 launch (consolidated)

These are the launch-blocking criteria the research pack identified. Mobile M3 (2026-08-16) cannot proceed without all green.

| #   | Acceptance criterion                                                                                            | Owner           | Verification                                                      |
| --- | --------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------- |
| 1   | StoreKit IAP screens implemented + tested via Sandbox; App Review notes describe storefront-aware purchase flow | mobile-engineer | TestFlight build + Detox e2e + App Review note review             |
| 2   | Apple 5.1.2(i) BYOK consent modal renders + accept-only-on-tap                                                  | mobile-engineer | Detox e2e ([PRD-MOBILE §13](PRD-MOBILE.md#13--security--privacy)) |
| 3   | Cache-hit rate dashboard live in `services/api-gateway/admin/metrics` showing real ≥30 % over 7 days            | platform        | Grafana panel + screenshot                                        |
| 4   | Telemetry redaction CI tests passing on every PR                                                                | platform        | `pnpm test -- redaction`                                          |
| 5   | Local crash-free sessions ≥99.5 % on iPhone 15 Pro + Pixel 8 Pro + 1 older iPhone + 1 mid-Android               | mobile-engineer | TestFlight + Play Internal Testing crash dashboards               |
| 6   | Privacy launch checklist (§D.4) — all 12 items shipped                                                          | founder         | Manual sign-off                                                   |
| 7   | EU AI Act compliance gate (§D.4) — transparency labels, AI literacy, deployer registration if needed            | founder + legal | Pre-EU launch review                                              |
| 8   | OWASP LLM Top 10 v2.0 mitigations — all 10 mapped + implemented per §D.5                                        | platform        | Security audit                                                    |
| 9   | Model-registry pricing watch cron job live + emitting weekly diffs                                              | platform        | Cron logs + PR history                                            |
| 10  | NIST AI RMF risk register live in `tasks/research/_risk_register.csv` + reviewed                                | founder         | Manual sign-off                                                   |

If any one fails: launch delays by milestone. No partial launch.

---

_End of Appendix D. Return to [PRD V4](PRD.md). All claims trace to `tasks/research/` primary-source citations (S001-S048)._
