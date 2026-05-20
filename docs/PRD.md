# AGI — Product Requirements Document (V5, web-verified)

**Status:** canonical product spec V5 — supersedes V4 (2026-05-17 morning). **V5 adds the V6 intelligence-sweep findings** (verified 2026-05-17 against Apple Developer guidelines, EU AI Act Service Desk, DeepSeek API docs, Moonshot Kimi platform docs, Anthropic Claude docs, Apple Foundation Models framework, Apple Small Business Program — every claim primary-source-cited) PLUS **today's 16-auditor codebase verification** (`tasks/research/PROMPT-V6-INTELLIGENCE-SWEEP.md` + `docs/design/pitch-deck-verified-numbers-2026-05-17.md`) PLUS **two consultation-prep research memos integrated 2026-05-18** (DSAR on E2EE hybrid local/cloud, Apple LoRA adapters under Guideline 2.5.2). **Last refresh:** 2026-05-18. **Owner:** Founder + platform engineering. **Supersession rule:** when this doc conflicts with any other repo doc, this doc wins until amended by PR.

**Docs audit note, 2026-05-20.** The newer Claude memory locks about local-only/cloud-waitlist scope are mobile-v1-specific per founder clarification. This PRD's platform Local + BYOK launch posture remains the repo-level story until amended by PR; mobile launch sections must defer to [`docs/decisions/CURRENT_DECISIONS.md`](decisions/CURRENT_DECISIONS.md).

**Reading shortcuts.** First-time on this repo? Start at [`ONBOARDING.md`](../ONBOARDING.md) at the repo root. Per-surface deep docs at [`docs/surfaces/`](surfaces/) (one file each for desktop / web / mobile / cli / chrome-extension / vscode-extension). Build commands at [`BUILD.md`](../BUILD.md). Current mobile-v1 launch clarification at [`docs/decisions/CURRENT_DECISIONS.md`](decisions/CURRENT_DECISIONS.md).

**Key V4 → V5 deltas (full-authority locked 2026-05-17 evening):**

1. **5 new anti-pattern locks** (§10 #22-26): three-tier router default · 90 % cache-discount baseline · model deprecation calendar · mobile v1 = controller+chat only (no in-app code execution) · EU AI Act Article 50 disclosure + machine-readable marking.
2. **3 new severity-3+ risks** (§17 #21-23): R-021 DeepSeek V4-Pro promo cliff 2026-05-31 15:59 UTC · R-022 Apple 2.5.2 enforcement against in-app code execution · R-023 Chinese-HQ provider routing under EU + US-state ADMT contexts.
3. **Mobile-first lock refined** (§20 #11): "mobile-FIRST in time, NOT mobile-ONLY in scope. Web parity ships same week as mobile launch. Desktop reaches W6 build-target stability BEFORE mobile launches" (V6 evidence: Claude Code Remote Control + Codex Mobile patterns prove mobile = desktop controller, not standalone surface).
4. **Token COGS budget refit**: cache-hit DISCOUNT magnitude assumption raised from implicit ~50 % to verified 90 % (OpenAI auto-cache 90 % off · Anthropic cache reads at 0.1× base input · DeepSeek V4-Flash 98 % off). Hit-RATE targets unchanged at ≥30 % / ≥50 %.
5. **Anthropic Opus 4.7 tokenizer drift acknowledged** (released 2026-04-16): new tokenizer ranges 1.0×–1.35× tokens for same text — effective cost-per-request rises 0-35 % even though per-token price is unchanged $5/$25 ([S-Anthropic](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-7)). All migration tests must re-baseline against Opus 4.7 token counts before rollout.
6. **Urgent operational items locked**:
   - **Kimi K2 family officially discontinued 2026-05-25** (7 days). `packages/types/src/models.json` MUST pin `kimi-k2.6` and drop `kimi-k2-*` aliases this sprint.
   - **DeepSeek V4-Pro promo expires 2026-05-31 15:59 UTC** — prices 4× to $1.74/$3.48 input/output unless extended. Auto-reroute logic to V4-Flash or Sonnet 4.6 ships before that date.
   - **Stripe API `clover` → `dahlia` (2026-04-22)** — W6 deliverable #17, complete this sprint.
7. **Numeric corrections from 16-auditor verification** (`docs/design/pitch-deck-verified-numbers-2026-05-17.md`): CLI 288 .rs files (was 200) · 19 Rust workspace crates (was 14) · 1,488 Tauri commands across 137 files (was 151) · 43 canonical Supabase migrations (was 27 / "150+" old-deck overstated) · 62 VS Code commands (was 55-56) · 25 VS Code settings (was 23) · 45 mobile screens (was 43) · RN 0.84.0 (was 0.83.6) · 24 CLI subcommands (was 22) · 1,320 cargo tests in CLI (was 999) · 3,988 git commits in 6.5 months · 4,200+ total tests workspace-wide · 1.5M production LOC verified by `tokei`.
8. **DSAR architecture refined to two-layer (Appendix D §D.4 #2-3 + new #13)**. Server-side metadata export + device-generated readable export — not single ciphertext blob. Server-side encrypted row deletion explicit (account-link is personal data per CJEU contextual identifiability). Article 11 evidentiary package documented at `docs/security/article-11-evidence.md` (NEW). Privacy notice separates Local mode + Cloud-sync mode as distinct processing contexts. Research memo: `tasks/research/PROMPT-DSAR-E2EE-RESEARCH.md`.
9. **Apple LoRA adapter v1.1+ candidate (§10 lock #25 extension)**. Apple's `.fmadapter` toolkit + Foundation Models Framework Adapter Entitlement + Apple-hosted Background Assets is the OFFICIAL distribution path. Verdict YES-with-conditions; gated on App Review consultation. Concrete plan: 2-3 narrow text-only adapters via Apple-hosted Background Assets. NOT a v1 launch blocker — v1 ships base Foundation Models only.

**Key V3 → V4 deltas (research-driven, every one cite-able to primary sources in `tasks/research/`):**

1. **StoreKit IAP becomes the default mobile purchase path** (was: external-purchase to web Stripe). External purchase is permitted in the US without entitlement; in the EU it requires the StoreKit External Purchase Link Entitlement Addendum with combined 7-20 % fees ([Apple DMA support](https://developer.apple.com/support/dma-and-apps-in-the-eu/)). Apple Small Business Program qualifies AGI for **15 % IAP commission** below $1M proceeds/year ([Apple SBP](https://developer.apple.com/app-store/small-business-program/)).
2. **Managed-cloud routing is framed as "AGI's customer application access," NOT API resale** ([Anthropic commercial terms](https://www.anthropic.com/legal/commercial-terms), [OpenAI Services Agreement](https://openai.com/policies/services-agreement/), [Google Gemini API Terms](https://ai.google.dev/terms)).
3. **Caching is not a single API.** `CacheIntent` + `CacheObservation` schemas in `@agiworkforce/llm-normalize` express intent; provider-specific adapters translate to Anthropic `cache_control`, OpenAI `prompt_cache_key`, Gemini cached-content resources ([§7 F2 + Appendix D](#7--feature-inventory--effort-sizing)).
4. **Five new severity-5 risks locked** (Token COGS blowout, Prompt/output telemetry leak, MCP exploit, Provider TOS breach from resale posture, Apple payment-steering rejection).
5. **EU AI Act full application 2026-08-02** — same window as Mobile launch. Compliance gate added per [Appendix D](PRD-APPENDIX-D-SCALING-OBSERVABILITY-COMPLIANCE.md) ([EU Commission](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)).
6. **Token COGS budget targets locked**: cache-hit ≥30 % pre-launch / ≥50 % post-stabilization; managed-cloud gross margin ≥60 %; per-tier-per-user-per-provider budget stop-loss.
7. **Telemetry scrubbing rules locked**: no session replay on AI screens; Sentry `beforeSend` redacts strings >40 chars; PostHog `mask_all_text` on AI surfaces; OTel attribute filter; CI redaction tests.
8. **Mobile on-device tier order validated**: platform-managed (Foundation Models / AICore) as **primary default**, react-native-executorch fallback, llama.rn for breadth — NOT a GGUF-first architecture.

**First implementation:** **Mobile**. Canonical surface PRD: [`docs/PRD-MOBILE.md`](PRD-MOBILE.md) (locked 2026-05-17). All mobile-specific decisions — stack, model picks, onboarding, Apple 5.1.2(i) compliance, M0–M3 timeline — live there and supersede the mobile column of §6 of this file.

**Companion appendices (locked):**

- [`docs/PRD-MOBILE.md`](PRD-MOBILE.md) — canonical surface PRD for the AGI mobile app, first implementation (M0 spike → M3 public launch targeted late July to mid-August 2026). Local + Cloud dual-mode, Expo + native module stack, Apple Foundation Models / Gemini Nano Tier-1, `react-native-executorch` Tier-2, `llama.rn` Tier-3 fallback.
- [`docs/PRD-APPENDIX-A-DATA-MODELS.md`](PRD-APPENDIX-A-DATA-MODELS.md) — every Supabase table, every RLS policy, every index, SQLite Local-mode schema, dispatch / stripe / waitlist tables.
- [`docs/PRD-APPENDIX-B-API-CONTRACTS.md`](PRD-APPENDIX-B-API-CONTRACTS.md) — every shipping endpoint with verb, path, auth class, request/response schema, rate-limit bucket; full Tauri command surface.
- [`docs/PRD-APPENDIX-C-MONOREPO-LAYOUT.md`](PRD-APPENDIX-C-MONOREPO-LAYOUT.md) — repo tree, per-surface build commands, env-var contract per surface, CI workflow contracts, version pins.
- [`docs/PRD-RESOLUTIONS-AND-AUDIT.md`](PRD-RESOLUTIONS-AND-AUDIT.md) — every error resolved across the repo, plus Delete / Update / Retain doc audit.

**Companion specs (kept):** [`AGI_WORKFORCE.md`](../AGI_WORKFORCE.md) (platform SSOT), [`MASTER_PLAN.md`](../MASTER_PLAN.md) (per-surface decision trail), [`docs/decisions/CURRENT_DECISIONS.md`](decisions/CURRENT_DECISIONS.md), [`docs/VISION.md`](VISION.md), [`docs/ROADMAP.md`](ROADMAP.md), [`docs/PRICING.md`](PRICING.md), [`docs/ARCHITECTURE.md`](ARCHITECTURE.md), [`docs/design/design-spec-2026-05-15.md`](design/design-spec-2026-05-15.md), [`docs/BILLION_DOLLAR_PLAYBOOK.md`](BILLION_DOLLAR_PLAYBOOK.md) (historical strategy), 18 ADRs in [`docs/decisions/`](decisions/).

This PRD is build-spec grade: a competent vibe-coder or LLM should be able to start from an empty monorepo, read PRD + four appendices, and produce a faithful AGI build. It is grounded in current repo state (verified 2026-05-17 across 22 parallel teammate reports + direct ground-truth reads of `AGI_WORKFORCE.md`, `packages/types/src/{billing,model}-catalog.ts`, `apps/web/package.json`, `apps/mobile/package.json`, `apps/web/app/api/stripe-webhook/lib/idempotency.ts`, `apps/cli/src/lib.rs`) and against current ecosystem facts as of **May 2026** (Claude Opus 4.7 / Sonnet 4.6, GPT-5.4 / 5.5, Gemini 3.1, Veo 3.1, Next.js 16.2.x, Stripe API `2026-04-22.dahlia`, MCP spec `2025-11-25`).

---

## §1 — Executive summary

AGI (full name AGI Workforce; public brand short-form **AGI**) is a unified client over 10+ AI provider APIs — Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Moonshot, Zhipu, Mistral (Codestral 2508), Ollama, LM Studio, plus user-defined custom endpoints — shipping six surfaces (Desktop, Web, Mobile, CLI, Chrome extension, VS Code extension) from one monorepo.

Tagline (LOCKED): _Beyond one model. Beyond one surface. AGI in your hands._
Strapline (LOCKED): _AGI — your AI team: Claude, GPT, Gemini, and your local models, in one app._
Hero microcopy (LOCKED): _What can I help with?_ / _Let's get to work._

**Three differentiators verified May 2026:**

1. **Multi-provider in one UI.** Switch providers mid-conversation. Anthropic's app is Claude-only, ChatGPT is OpenAI-only, Cursor is Anthropic-only, Perplexity has a picker but no continuity. We are the only place a single thread can flow Claude → GPT → Llama with state.
2. **BYOK + Local LLM as first-class.** Ollama and LM Studio both wired in `apps/cli/src/models.rs:133-139, :303`. Anthropic and OpenAI do not accept user-supplied keys at consumer surfaces. We do.
3. **Cross-provider session continuity.** `packages/llm-normalize` (30 files, ~2,633 LOC, ported from OpenClaw MIT, 4 test suites) normalizes tool-call schemas across providers. Google `tool_result.name` cross-provider break is **fixed and regression-tested** (`packages/providers/google/src/translate.ts:43-82`). Ollama multi-block tool result drop is **fixed and regression-tested** (`packages/providers/ollama/src/translate.ts:81-116`).

**Launch sequence:**

- **Now (May 2026):** Local-only + BYOK are live, free forever. CLI v1.0 already shipped.
- **First implementation in flight:** **AGI Mobile** per [`docs/PRD-MOBILE.md`](PRD-MOBILE.md) — dual-mode (Local + Cloud) iOS-first then Android, free-forever Local mode without account, BYOK Cloud free-forever, managed-cloud tiers waitlisted to Aug 1. M0 spike May 17–23; public launch targeted late July to mid-August 2026.
- **2026-08-01 (graduation):** Hobby / Pro / Pro+ / Pro Max / Max paid tiers flip from waitlist to live across surfaces. Stripe webhook idempotency RPC `process_stripe_event_idempotent` already live in production since 2026-05-13.
- **60–90 day waitlist period:** BYOK telemetry sets per-tier caps from data, not guesses. Eliminates fraud risk, Hobby unit-economics risk, and day-1 Stripe-launch dependency.
- **Other surfaces (Desktop / Web / Chrome ext / VS Code ext) continue on the existing W6 finalize track per §19;** they ship in parallel with Mobile but Mobile leads.

**Top-6 sharpest calls in this PRD (autonomously locked, no founder approval required):**

1. **Mobile is the first implementation.** Canonical mobile spec lives in [`docs/PRD-MOBILE.md`](PRD-MOBILE.md). M0 spike this week (May 17-23); public iOS + Android launch late July to mid-August 2026. Web's Aug 1 graduation still anchors the paid-tier flip across all surfaces, but mobile is the lead-surface product. Mobile ships dual-mode (Local on-device + Cloud BYOK), free forever for both, no account required for Local. App Review on iOS is the binding constraint we de-risk first. The other surfaces (Web finalize, Desktop W7 polish, extensions) continue on their tracks but follow mobile's launch.
2. **Pro Max $99 ships as a build target.** PRD specifies the exact `BillingPlanTier` enum edit + Stripe env-var contract; code must catch up before Aug 1. ([§16](#16--pricing--billing-model), [Appendix A](PRD-APPENDIX-A-DATA-MODELS.md))
3. **Video gen lands on Pro+ via Veo 3.1 Lite ($0.05/sec, 60 sec/mo).** Max gets Veo 3.1 Fast + Lite. Earlier V2 lock saying "Max only" rested on $0.75/sec mis-quote; current Google pricing of $0.05/sec Lite makes Pro+ inclusion safe. ([§16 F9 row](#16--pricing--billing-model))
4. **Apple 5.1.2(i) compliance:** explicit consent modal before first provider key is registered on iOS / iPadOS. Modal copy in [Appendix B §B.7](PRD-APPENDIX-B-API-CONTRACTS.md). Privacy-policy link alone is insufficient post-Nov-2025 Apple guideline update. Mobile PRD §13 + §14 implement this in full.
5. **Service-role-key sprawl gets a least-privilege migration.** 8 of 14 routes move to `getUserClient(jwt)` before Aug 1; the remaining 6 webhook/admin/directory-sync routes keep service-role with explicit policy comment. ([§12](#12--security--privacy-model), [Appendix B](PRD-APPENDIX-B-API-CONTRACTS.md))
6. **Legacy `apps/web/supabase/migrations/` directory deleted after a production-state audit.** Canonical `supabase/migrations/` (43 files + Stripe RPC) is single source of truth post-deletion. Runbook in [Appendix A §A.9](PRD-APPENDIX-A-DATA-MODELS.md).

**Success criteria, first 90 days post-Aug-1:** ≥10K BYOK / Local installs across six surfaces; ≥30 % activate Local mode in first 14 days; ≥3 repeatable acquisition sources contributing ≥10 % each; ≥$2K MRR by Oct 31. Kill / pivot triggers in [§18](#18--success-metrics--escalation-triggers).

---

## §2 — Strategic positioning

**Hypothesis:** the modern AI power user pays for three to five single-vendor apps — Claude Pro $20 + ChatGPT Plus $20 + Cursor $20 + Perplexity Pro $20 + occasional Replicate / Modal credits = $57–$80 /month. Each app locks them to one provider family. Each has its own keyboard shortcuts, history silo, billing surface, and policy. They want one place, one thread, one bill, and the freedom to compose providers per task.

**Why one chat layout (LOCKED — `docs/VISION.md`):** every surface renders the same chat shell. Claude Desktop splits Chat / Cowork / Code into three tabs; Codex Desktop splits Threads / Plugins / Automations; Perplexity splits chat / Computer / Skills / Connectors. AGI's contrarian bet: a unified inline layout is more discoverable, more learnable, and cheaper to ship in parallel across six surfaces. Concrete: Desktop's active chat is `ChatInterface` from `@agiworkforce/unified-chat` (245 files); Web's active chat is `apps/web/features/chat/` (113 components). Both consume the same store contract.

**Why 10+ providers:** Perplexity's composer dropdown showing Best / Sonar / GPT / Gemini / Claude is the proof-point that multi-provider in a composer is table-stakes. Competitors validated the pattern but cannot lock it down — Anthropic's app is by definition Claude-only and ChatGPT is by definition OpenAI-only. AGI exploits the structural opening that single-vendor apps cannot close.

**Why BYOK + Local LLM:** the only people who can ship BYOK + Local convincingly are aggregators. Anthropic cannot let you BYOK to OpenAI inside Claude Desktop. Cursor's pricing model breaks if users BYOK to non-Anthropic. Ollama and LM Studio ship local runners but no managed surface. AGI ships both.

**What competitors structurally cannot match:**

- Anthropic: cross-provider continuity, BYOK to non-Claude, local LLM.
- OpenAI / Codex: providers other than GPT-family, local LLM, BYOK for non-OpenAI keys.
- Cursor: BYOK Anthropic (forbidden under their pricing), general-productivity stack outside coding.
- Perplexity: BYOK at all (Perplexity is a search-optimized aggregator with model selection but no user keys), local LLM.
- Gemini: anything non-Google in the primary path.

**What we explicitly do not claim as differentiators** (already shipped by competitors, verified May 2026, no moat): mobile companion (Anthropic Dispatch GA 2026-03-17), CLI with TUI (Codex CLI Rust + agentic + MCP), computer use (Claude Cowork GA 2026-04-03), VS Code / JetBrains / Chrome extensions (Anthropic ships all). Our defense on these is **parity, not victory**.

---

## §3 — Target users & personas

Four primary personas. Each has a verbatim "I want…" quote synthesized from signals in `docs/research/v1-product-validation.md`, the Reddit / OpenRouter complaint corpus documented in `docs/BILLION_DOLLAR_PLAYBOOK.md`, and the launch-channel playbooks in `docs/launch/`.

### Persona A — Power Multi-Tool User (primary commercial target)

> "I want one bill, one history, and the ability to send the same paragraph through Claude for tone, GPT for structure, and Gemini for fact-check without copy-pasting between three browser tabs."

- **Stack today:** Claude Pro ($20) + ChatGPT Plus ($20) + Cursor ($20) + Perplexity Pro ($20) + occasional Replicate / Modal ≈ $57–$80 /mo.
- **Top-3 pains:** (i) context loss when switching apps, (ii) cost reconciliation across vendors, (iii) inconsistent UX (every app's hotkeys differ).
- **Top-3 jobs-to-be-done:** consolidate spend; preserve conversation history across providers; one keyboard muscle-memory.
- **Primary surface:** Desktop (Tauri 2). **Secondary:** Web for share/inspect, Mobile for capture.
- **Conversion path:** BYOK first month → Hobby second month if managed cloud feels worth $10 → Pro+ once they trust the routing.
- **Retention signal:** ≥3 different provider names in their last 30-day usage histogram.

### Persona B — Privacy-First Solo Pro

> "I want everything on my machine. I write contracts for clients. The day my AI tool sends a draft to a public API, I lose my license."

- **Stack today:** LM Studio + Ollama + a hand-rolled chat front-end + private fork of `oobabooga/text-generation-webui`.
- **Top-3 pains:** (i) janky chat UX in OSS clients, (ii) no mobile companion, (iii) MCP and tool plumbing requires Python.
- **Top-3 JTBD:** local-only by default; never have a "cloud-mode-on-by-accident" button; first-class MCP tools without writing glue.
- **Primary surface:** Desktop in **Local mode** (SQLite + Ollama/LM Studio, no Supabase touch). **Secondary:** CLI for scripts.
- **Conversion path:** Local-only free forever. Converts only if we ship a mobile companion that pairs to their Desktop over a local network. (Wave 7 deliverable; see [§19](#19--wave-alignment--engineering-effort).)
- **Retention signal:** zero outbound packets to `agiworkforce.com` over 30 days.

### Persona C — Coding Agent User

> "I want plan mode visible as a composer chip, not buried in `/plan`. I want my CLI session to resume in the desktop app when I close the laptop, and I want to switch models per file."

- **Stack today:** Cursor + Claude Code CLI + occasional ChatGPT Code Interpreter; rotates between OpenAI GPT-5.4 and Claude Sonnet 4.6 for cost/quality.
- **Top-3 pains:** (i) plan mode hidden until you remember the command, (ii) IDE locked to one model, (iii) approval prompts every action even on read-only ops.
- **Top-3 JTBD:** plan-mode UX matching Codex's composer chip (`~/Desktop/reference/ui/codex-desktop/02_composer_attachment-menu-photos-plan-mode-speed.png`); cross-surface session resume; granular per-action permission ladder.
- **Primary surface:** VS Code extension (62 commands, @agi chat participant, 13 keybindings, port 8787 desktop bridge). **Secondary:** CLI (22 subcommands, 1,337 unit tests), Desktop for long agentic runs.
- **Conversion path:** BYOK Anthropic + OpenAI in CLI / VS Code combo → Pro+ once they want multi-model side-by-side compose.
- **Retention signal:** ≥1 `update_plan` invocation per day in any of CLI / Desktop / VS Code.

### Persona D — Research-Heavy Worker

> "I want every Gemini-style Maps/Flights/YouTube card, Perplexity-style web search, and Claude-style PDF artifacts in the same answer. Right now I run three browser tabs and copy citations by hand."

- **Stack today:** Perplexity Pro + Gemini + Claude.ai for serious writing + a Notion-clone for storing artifacts.
- **Top-3 pains:** (i) citations don't transfer across apps, (ii) PDF / Markdown render quality varies wildly, (iii) connector quality (Drive / Notion / Gmail) is inconsistent.
- **Top-3 JTBD:** web search with first-class citations in chat; rich inline artifact viewer (HTML / Markdown split-view / PDF dark-mode / Rich-Text) matching Claude Desktop's `claude-chat-artifacts-and-tools/` 27-image set; connector breadth comparable to Anthropic's ~150+ directory.
- **Primary surface:** Web. **Secondary:** Desktop for long writing sessions.
- **Conversion path:** Free tier (Gemini-Flash-Lite workhorse, 100K tokens/mo) → Hobby ($10) once they hit the cap or want their first 10 image generations.
- **Retention signal:** ≥5 connector tools active (Gmail / Drive / Notion / GitHub / Slack baseline).

---

## §4 — User journey maps

Three canonical journeys, each grounded in code that ships today.

### Journey 1 — First-time install → first reply in Local mode (<5 min)

1. User downloads Desktop installer (Linux / macOS / Windows artifacts in `downloads/`).
2. First launch fires `OnboardingWizard.tsx` (single consolidated flow; legacy `ModeSelectionDialog` is deleted — `apps/desktop/src/components/Onboarding/` contains only `OnboardingWelcome.tsx`, `OnboardingWizard.tsx`, `index.ts`).
3. Mode picker step: Local vs Cloud. User picks Local.
4. Wizard detects Ollama / LM Studio via the desktop-Rust health probe (`apps/desktop/src-tauri/src/sys/commands/llm.rs`); if absent, links to install scripts; if present, shows model list.
5. User picks a model, hits compose, types a prompt. Sub-5-minute time-to-first-token target.
6. Storage: SQLite (`apps/desktop/src-tauri/data/db/`, SQLCipher-bundled). Supabase never touched. `packages/runtime/src/detect.ts` returns `isTauri: true`, `isCloudWeb: false`.

### Journey 2 — BYOK setup → cross-provider session

1. User signs in via Supabase OAuth on `/login` (web) or via Desktop OAuth handoff to `/api/device/poll`.
2. (iOS / iPadOS only) — onboarding shows the **BYOK Provider Disclosure & Consent** modal (Apple 5.1.2(i) compliance). Copy in [Appendix B §B.7](PRD-APPENDIX-B-API-CONTRACTS.md). User must explicitly accept before the provider-key form is unlocked.
3. Settings → Providers → Add key. Key flows through `packages/data-layer` to Stronghold (Desktop) / Keychain (Mobile, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`) / SecretStorage (VS Code) / `chrome.storage.session` (Chrome ext). Never plaintext at rest.
4. User starts a chat with Claude Sonnet 4.6; mid-message taps the in-composer model picker (Perplexity-style dropdown showing Anthropic / OpenAI / Google / xAI / DeepSeek / Perplexity / Moonshot / Zhipu / Codestral / Ollama / LM Studio / Custom).
5. Selects GPT-5.4 — conversation continues with full history. `packages/llm-normalize` and `packages/providers/google/src/translate.ts:43-82` rebuild the `toolUseId → functionName` map so tool calls survive the switch.
6. Switches to local Llama 3.x via Ollama. Tool result schemas normalized through `packages/providers/ollama/src/translate.ts:81-116`.

### Journey 3 — Daily-driver Power user, morning composer → artifact → cross-surface handoff

1. Morning: Cmd+Shift+Space invokes Desktop floating quick-chat (`App.tsx` `mode='floating'` route); types a question, gets answer pasted at cursor.
2. Switches to Desktop full window, opens the same conversation (`unifiedChatStore.ts` bridges desktop `chatStore` ↔ `@agiworkforce/unified-chat`).
3. Asks for a long-form artifact (Markdown / HTML / PDF). Artifact sidebar opens; toolbar shows Copy / Refresh / Print / Close / Download-all (parity target from `~/Desktop/reference/ui/claude/claude-chat-artifacts-and-tools/12, 13, 17, 24`).
4. Pivots to Cursor or VS Code via "Open in" menu (Codex Desktop pattern at `~/Desktop/reference/ui/codex-desktop/19`).
5. Resumes the same session in VS Code via @agi chat participant. Conversation history flows because `apps/extension-vscode/conversationStore` syncs against Supabase + local fallback.
6. Closes laptop. Phone wakes (Expo SDK 55 + RN 0.84.0). Drawer → Dispatch. Sees an outstanding agent task; reviews, approves. Dispatch HMAC envelope (HKDF-derived session key, ±30 s timestamp window, 60 s nonce cache) signs the response — desktop outbound-signing wiring lands before 2026-06-05 ([§17](#17--risk-register-top-15) risk 3).

---

## §5 — Competitive positioning matrix

Top wins, table-stakes (must match), and day-1 gaps we accept.

| Capability                        | AGI                                            | Claude.ai                  | ChatGPT                    | Cursor                  | Perplexity               | Gemini             |
| --------------------------------- | ---------------------------------------------- | -------------------------- | -------------------------- | ----------------------- | ------------------------ | ------------------ |
| Multi-provider mid-conversation   | ✅ 10+                                         | ❌ Claude only             | ❌ GPT only                | ❌ Anthropic only       | ⚠️ picker, no continuity | ❌ Google only     |
| BYOK any provider                 | ✅ all                                         | ❌                         | ❌                         | ❌ Anthropic-only seats | ❌                       | ❌                 |
| Local LLM (Ollama / LM Studio)    | ✅ both                                        | ❌                         | ❌                         | ❌                      | ❌                       | ❌                 |
| Cross-provider session continuity | ✅ llm-normalize                               | n/a                        | n/a                        | n/a                     | n/a                      | n/a                |
| Six surfaces from one codebase    | ✅ all 6                                       | ⚠️ 5                       | ⚠️ 4                       | ⚠️ 2                    | ⚠️ 4                     | ⚠️ 4               |
| Plan mode                         | ✅ `update_plan` + composer chip + CLI `/plan` | ❌                         | ❌                         | ❌                      | ❌                       | ✅ Gemini CLI      |
| Computer use                      | ⚠️ Pro+ light / Max advanced                   | ✅ Cowork GA               | ✅                         | ❌                      | ✅ Computer              | ❌                 |
| Voice (Wispr-Flow pattern)        | ✅ push-to-talk                                | ✅ Caps Lock               | ✅ Whisper                 | ❌                      | ✅ Comet floating        | ✅ duplex (Live)   |
| Image generation                  | ✅ Hobby 10/mo, Pro+ unlimited                 | ✅ inline                  | ✅ DALL-E                  | ❌                      | ✅                       | ✅ Imagen          |
| Video generation                  | ⚠️ Pro+ Veo Lite, Max Veo Fast                 | ❌                         | ✅ Sora 2 (EOL 2026-09-24) | ❌                      | ✅ basic                 | ✅ Veo + templates |
| Connectors                        | ⚠️ 31 wired (Gmail/Drive/Notion/…)             | ✅ ~150 directory          | ⚠️ GPTs only               | ❌                      | ✅ 12+ live              | ✅ Drive / Photos  |
| Inline artifacts (HTML/MD/PDF)    | ⚠️ wired, toolbar gap                          | ✅ 27-screen reference set | ⚠️ Canvas only             | ❌                      | ⚠️ basic                 | ⚠️ basic           |
| Mobile companion                  | ✅ Dispatch + chat peer                        | ✅ Dispatch                | ✅ ChatGPT mobile          | ❌                      | ✅ Perplexity mobile     | ✅ Gemini mobile   |
| Coding-agent depth                | ⚠️ CLI 22 sub / VS Code 62 cmds                | ✅ Claude Code             | ✅ Codex CLI               | ✅ best-in-class        | ❌                       | ⚠️ Gemini CLI      |

**Top-5 day-1 gaps we accept (deferred to post-Aug-1):**

1. Cowork-style autonomous tab (Anthropic's three-tab Chat / Cowork / Code split). Our bet: unified chat with inline tools is sufficient.
2. Per-turn reasoning toggle (currently per-model only).
3. Connector breadth on day 1 (we ship ~31; Anthropic ships ~150).
4. Workflow recording (Claude Chrome records page interactions; AGI defers).
5. Long-running autonomous agent threads (Cowork-style multi-hour runs).

---

## §6 — Surface coverage matrix

6 surfaces × 7 capability domains. **S** = ships, **P** = partial / behind flag, **D** = deferred to a later wave, **K** = skipped intentionally. **Mobile is the first implementation** — locked spec at [`docs/PRD-MOBILE.md`](PRD-MOBILE.md); rows below summarize, but PRD-MOBILE wins on any mobile-specific conflict.

|                                                                               | Chat                                   | Providers (10+)                                                                                   | MCP                                     | Computer use                                       | Dispatch                                              | Voice                                        | Image / Video gen                               |
| ----------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| **Desktop** (Tauri 2.11.1, 1,488 IPC commands, 749 .rs / 1,111 .ts/.tsx)      | S                                      | S                                                                                                 | S (stdio + SSE + HTTP)                  | S (OPA loop, macOS gate only v1; Linux/Windows P1) | P (HMAC code in; outbound wiring deadline 2026-06-05) | S (Whisper local + Deepgram cloud)           | S image / P video                               |
| **Web** (Next.js 16.2.x, 94 endpoints across 48 namespaces, 1,118 .ts/.tsx)   | S                                      | S                                                                                                 | S (HTTP only; stdio routed via gateway) | K (browser sandbox cannot do OS-level)             | K                                                     | S (`/api/voice/transcribe`)                  | S                                               |
| **Mobile** (Expo SDK 55 + RN 0.84.0; see [`PRD-MOBILE.md`](PRD-MOBILE.md))    | S                                      | S BYOK + **Local LLM** (Foundation Models / Gemini Nano / `react-native-executorch` / `llama.rn`) | S (HTTP only)                           | K                                                  | K (mobile v1 is chat-first, not a control plane)      | S (platform STT Tier 1 / whisper.cpp Tier 2) | P image (local Gemma 3 4B vision Tier 2 opt-in) |
| **CLI** (Rust 1.95.0 + Ratatui, 22 subcommands, 1,337 tests, 5.7MB binary)    | S                                      | S (12 named + Custom registry)                                                                    | S (stdio)                               | D                                                  | K                                                     | P (`/voice` STT)                             | K                                               |
| **Chrome ext** (MV3 v1.2.0, 22 test files / ~596 cases)                       | S (sidebar + popup)                    | S                                                                                                 | S (HTTP via bridge :8787)               | P (`browserTool` evaluate gated default-false)     | K                                                     | K                                            | K                                               |
| **VS Code ext** (v0.3.0, 62 commands, 25 settings, 13 keybindings, 352 tests) | S (@agi participant + sidebar webview) | S                                                                                                 | S (HTTP via bridge :8787)               | K                                                  | K                                                     | D                                            | K                                               |

Read this as: the platform's 75 % parity bar lands when every **P** turns **S** by 2026-08-01, and every **D** with a roadmap entry has a date. **Mobile changes from V2 PRD:** Dispatch K (mobile is chat-first in v1, not a control plane — Dispatch lives on Desktop ↔ Mobile via HMAC v2 envelope but the mobile-side initiator UI is deferred per PRD-MOBILE §20). The Local LLM addition is the headline mobile delta vs V2.

---

## §7 — Feature inventory + effort sizing

Effort scale: **XS** = ≤1 dev-day, **S** = 2–4 dev-days, **M** = 1 dev-week, **L** = 2 dev-weeks, **XL** = ≥1 dev-month. Wave column lands the build commitment.

### F1 — Chat core

| Subfeature                                                        | Status                            | Surfaces              | Effort | Wave         |
| ----------------------------------------------------------------- | --------------------------------- | --------------------- | ------ | ------------ |
| Composer with model picker in composer (design-spec lock #9)      | Ships                             | All 6                 | M      | shipped W4+5 |
| Conversation history with starred / pinned / scheduled            | Ships Desktop+Web; partial Mobile | All 6                 | S      | W6           |
| Message bubble with `data-role` attribute (e2e fixed 2026-05-16)  | Ships                             | Desktop, Web          | XS     | shipped      |
| Folder management + search                                        | Ships Web; planned Desktop        | Desktop, Web, Mobile  | M      | W6           |
| Branch navigator (fork at turn N)                                 | Ships CLI; partial Web            | All 6                 | M      | W6           |
| Thinking blocks collapsible (`MessageBubble.tsx:60, 402-405`)     | Ships                             | Desktop, Web          | XS     | shipped      |
| Adaptive Thinking toggle in composer                              | Gap                               | Desktop, Web, VS Code | S      | post-Aug-1   |
| Response style selector (Normal / Concise / Formal / Explanatory) | Gap                               | Desktop, Web          | S      | post-Aug-1   |

### F2 — Providers, BYOK, catalog

| Subfeature                                                                                                                       | Status                                                                                                                                                                                                                                                                                                                            | Surfaces             | Effort | Wave     |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------ | -------- |
| 10+ provider adapters (`packages/providers`, 8 adapters: anthropic, openai, google, ollama, deepseek, perplexity, xai, lmstudio) | Ships                                                                                                                                                                                                                                                                                                                             | All 6                | XL     | shipped  |
| BYOK key vault (Stronghold / Keychain / SecretStorage / chrome.storage.session)                                                  | Ships                                                                                                                                                                                                                                                                                                                             | All 6                | L      | shipped  |
| Cross-provider session continuity (`llm-normalize`, 30 files, 2,633 LOC, 4 test suites)                                          | Ships (Google + Ollama P0s fixed + regression-tested)                                                                                                                                                                                                                                                                             | All 6                | L      | shipped  |
| Models catalog reads from `models.json` (LOCKED rule #1, `memory/rule-models-json.md`)                                           | Ships CLI; **5 production fallbacks in Web violate**: `apps/web/core/ai/llm/providers/anthropic-claude.ts:665`, `apps/web/core/ai/llm/unified-language-model.ts:90,1016`, `apps/web/core/ai/llm/user-ai-preferences.ts:19`, `apps/web/shared/config/supported-models.ts:52`, `apps/web/core/ai/orchestration/model-router.ts:290` | All 6                | S      | W6 (fix) |
| Custom provider via TOML `[providers.*]` registry                                                                                | Ships CLI                                                                                                                                                                                                                                                                                                                         | CLI, Desktop         | S      | shipped  |
| Auto-fallback when primary provider rate-limits                                                                                  | Partial Web (`apps/web/lib/modelRouter.ts`)                                                                                                                                                                                                                                                                                       | Desktop, Web         | M      | W6       |
| Per-provider quota dashboards                                                                                                    | Gap                                                                                                                                                                                                                                                                                                                               | Desktop, Web, Mobile | M      | W6       |

### F3 — Model picker UX

| Subfeature                                                                              | Status                                                                                                | Surfaces              | Effort | Wave    |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------- | ------ | ------- |
| Composer dropdown (Best / Sonar / GPT / Gemini / Claude / Ollama-Local / LM Studio / …) | Ships Web; partial Desktop v3                                                                         | All 6                 | M      | W6      |
| Reasoning effort slider (low / med / high / max) — Codex pattern                        | Gap Desktop / Web; ships VS Code (`agiWorkforce.agent.effort`)                                        | Desktop, Web, VS Code | S      | W6      |
| Model descriptions ("Most capable", "Fastest")                                          | Gap (Chrome ext + VS Code lack)                                                                       | All 6                 | XS     | W6      |
| Per-tier slot routing from `SLOT_REGISTRY`                                              | Ships ([`tasks/auto-routing-spec.md`](../tasks/auto-routing-spec.md); 29 slots in `model-catalog.ts`) | All 6                 | L      | shipped |
| Manual override (Pro+ and up — `TIER_POLICIES.manualSelection: true`)                   | Ships                                                                                                 | All 6                 | S      | shipped |

### F4 — MCP

| Subfeature                                                                                                                 | Status                                       | Surfaces                                 | Effort | Wave    |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------- | ------ | ------- |
| `packages/mcp` client + 3 transports (stdio / SSE / streamable-http) per MCP spec 2025-11-25                               | Ships                                        | All 6 (stdio: Desktop+CLI; HTTP: others) | L      | shipped |
| Plugin manifest discovery (5 formats: `.agiworkforce-plugin`, `.claude-plugin`, `.codex-plugin`, `.app.json`, `.mcp.json`) | Ships (`crates/agiworkforce-plugin-runtime`) | CLI, Desktop                             | M      | shipped |
| MCP server health UI (enable / disable / status indicators)                                                                | Gap (Claude Code ships `/mcp` panel)         | Desktop, Web                             | M      | W6      |
| `agiworkforce-bot` MCP server (Slack / Gmail / Calendar prompts)                                                           | Partial                                      | Chrome, VS Code                          | M      | W6      |

### F5 — Computer use

| Subfeature                                                                                         | Status                         | Surfaces                | Effort | Wave       |
| -------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------- | ------ | ---------- |
| OPA loop (Observe-Plan-Act) with Anthropic vision (`automation/computer_use/`, 13 files, 47 tests) | Ships                          | Desktop (macOS only v1) | XL     | shipped W4 |
| Safety deny-list + window guard + modal-dialog detection                                           | Ships                          | Desktop                 | M      | shipped    |
| Accessibility permission gate (macOS `AXIsProcessTrusted`)                                         | Ships                          | Desktop                 | S      | shipped    |
| Linux window manager                                                                               | Gap (`window_manager.rs` TODO) | Desktop                 | M      | post-Aug-1 |
| Windows sandbox (Landlock-style)                                                                   | Stub (enum silent fallthrough) | Desktop                 | L      | post-Aug-1 |
| Per-action consent gates                                                                           | Ships                          | Desktop                 | S      | shipped    |

### F6 — Dispatch (mobile → desktop control plane)

| Subfeature                                                      | Status                                                                | Surfaces         | Effort | Wave    |
| --------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------- | ------ | ------- |
| Mobile Dispatch (Supabase Realtime, 3 channels)                 | Ships                                                                 | Mobile           | L      | shipped |
| HMAC v2 envelope (HKDF-SHA-256, ±30 s window, 60 s nonce cache) | Ships mobile inbound + desktop verify                                 | Mobile + Desktop | M      | shipped |
| **Desktop outbound signing wiring**                             | **Gap — code exists, signaling not wired. Hard deadline 2026-06-05.** | Desktop          | S      | W6 (P0) |
| Pairing code flow (QR on mobile, code on desktop)               | Ships                                                                 | Mobile + Desktop | S      | shipped |

### F7 — Voice (Wispr-Flow pattern, LOCKED)

| Subfeature                                                                                                      | Status                  | Surfaces        | Effort | Wave    |
| --------------------------------------------------------------------------------------------------------------- | ----------------------- | --------------- | ------ | ------- |
| System-wide push-to-talk hotkey → Whisper local → paste at cursor                                               | Ships                   | Desktop         | M      | shipped |
| Deepgram cloud STT via ephemeral token (mint server-side, ≤60 s TTL)                                            | Ships                   | Mobile, Web     | S      | shipped |
| Tier quotas (Hobby 60 / Pro 300 / Pro+ 1500 / Max unlimited min/mo)                                             | Wired in `tierGuard.ts` | All 6           | XS     | shipped |
| Voice rewrite slot (Gemini-3.1-flash-lite — $0.25/$1.50 per MTok, 3× cheaper than GPT-mini for simple rewrites) | Ships                   | Desktop, Mobile | S      | shipped |
| Barge-in (VAD-driven TTS interrupt)                                                                             | Behind feature flag     | Desktop         | M      | W7      |
| TTS via Piper local (offline, 10+ voices)                                                                       | Ships                   | Desktop         | M      | shipped |

### F8 — Image generation

| Subfeature                                                                 | Status                                   | Surfaces             | Effort | Wave       |
| -------------------------------------------------------------------------- | ---------------------------------------- | -------------------- | ------ | ---------- |
| `/api/media/image` Imagen 4 Fast workhorse ($0.02/image verified May 2026) | Ships (`SLOT_REGISTRY.image_generation`) | Web, Desktop, Mobile | S      | shipped    |
| Tier gates (Hobby 10/mo, Pro+ unlimited)                                   | Wired                                    | All 6                | XS     | shipped    |
| Progressive blur-to-sharp render                                           | Gap                                      | Desktop, Web         | S      | post-Aug-1 |
| Aspect / style selector                                                    | Gap                                      | Desktop, Web         | S      | post-Aug-1 |

### F9 — Video generation (V3 LOCK 2026-05-17 supersedes V2)

V2 said "Max only." V3 corrects: Veo 3.1 Lite at **$0.05/sec** (Google primary source) makes Pro+ inclusion safe within the 35% included-usage-budget ratio.

| Subfeature                                                                           | Status                                                                                  | Surfaces     | Effort | Wave                |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------ | ------ | ------------------- |
| Veo 3.1 Lite ($0.05/sec) routing — Pro+ gets 60 sec/mo (cost $3 vs $49.99 ARPU = 6%) | Wired in `SLOT_REGISTRY.video_generation` (slot name `video_generation_pro_plus`)       | Web, Desktop | S      | shipped (re-budget) |
| Veo 3.1 Fast ($0.15/sec) routing — Max gets 60 sec/mo (cost $9 vs $299.99 ARPU = 3%) | Ships                                                                                   | Web, Desktop | S      | shipped (re-budget) |
| Veo 3.1 Lite for Max — additional 5 min/mo ($15, 5% ARPU)                            | Add to `TIER_POLICIES.max`                                                              | Web, Desktop | XS     | W6                  |
| BYOK video on any tier (user supplies Runway / Veo / Sora key, pays vendor direct)   | Ships                                                                                   | Web, Desktop | XS     | shipped             |
| Multi-provider video router (Runway Gen-4 + Veo 3.1 + room for Kling / Pika)         | Partial                                                                                 | Web, Desktop | M      | W7                  |
| Sora 2 path retired                                                                  | LOCKED — Sora API discontinued 2026-09-24; consumer app shut down 2026-04-26 (verified) | Web, Desktop | XS     | shipped             |

### F10 — Search / research

| Subfeature                                                                                                                            | Status                   | Surfaces     | Effort | Wave    |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------ | ------ | ------- |
| Sonar workhorse (`SLOT_REGISTRY.search_fast`)                                                                                         | Ships                    | All 6        | S      | shipped |
| Deep research (`search_premium`, sonar-deep-research multi-component billing: $2/$8 + $2/M citation + $3/M reasoning + $5/1K queries) | Ships Pro+               | Desktop, Web | M      | shipped |
| Citation rendering with favicons                                                                                                      | Partial                  | Desktop, Web | S      | W6      |
| Scheduled / recurring searches                                                                                                        | Gap (Perplexity pattern) | Web          | M      | W7      |

### F11 — Artifacts

| Subfeature                                              | Status                            | Surfaces              | Effort | Wave       |
| ------------------------------------------------------- | --------------------------------- | --------------------- | ------ | ---------- |
| HTML / Markdown / PDF / Rich Text preview               | Partial Desktop+Web (toolbar gap) | Desktop, Web          | M      | W6         |
| Toolbar (Copy / Refresh / Print / Close / Download-all) | Gap                               | Desktop, Web, VS Code | S      | W6         |
| Multi-artifact response grid                            | Gap                               | Desktop, Web          | S      | post-Aug-1 |
| Inline preview pane (split source vs render)            | Partial                           | Desktop, Web          | M      | W6         |

### F12 — Connectors (data integrations) + Plugins (code-runnable skills)

Naming locked: Connectors = data integrations (Gmail, Drive, Notion, Slack, GitHub, Stripe, etc.). Plugins = code-runnable skills via MCP. Both ship.

| Subfeature                                                                                     | Status                       | Surfaces     | Effort | Wave       |
| ---------------------------------------------------------------------------------------------- | ---------------------------- | ------------ | ------ | ---------- |
| 31 connector IDs validated (`/api/connectors`)                                                 | Ships                        | All 6        | M      | shipped    |
| Gmail / Google Drive / Notion / GitHub / Slack / Stripe top-tier wires                         | Ships                        | All 6        | L      | shipped    |
| Connectors directory UI matching `claude-connectors-directory/` (19-page scroll, ~150 entries) | Gap                          | Desktop, Web | L      | post-Aug-1 |
| Custom MCP server install via marketplace                                                      | Ships CLI (`marketplace.rs`) | CLI, Desktop | M      | shipped    |
| MCP install / uninstall via Tauri                                                              | Ships                        | Desktop      | M      | shipped    |

### F13 — Billing & subscription

| Subfeature                                                                                                                                                                         | Status                      | Surfaces | Effort | Wave    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------- | ------ | ------- |
| 8 tiers in `billing-catalog.ts` SSOT (Local-only / BYOK / Free / Hobby / Pro / Pro+ / Max / Enterprise)                                                                            | LOCKED                      | All 6    | n/a    | shipped |
| **9th tier — Pro Max $99 (Wave 6 build target)** — add `'pro_max'` to `BillingPlanTier` enum + `BILLING_PLAN_PRICING` entry + `STRIPE_PRICE_PRO_MAX_{MONTHLY,YEARLY}` env contract | **Gap — ship before Aug 1** | All 6    | S      | W6      |
| Stripe checkout + webhook idempotency (RPC `process_stripe_event_idempotent` live in prod 2026-05-13; called from `apps/web/app/api/stripe-webhook/lib/idempotency.ts:12-15`)      | Ships                       | Web      | L      | shipped |
| Stripe API version: **upgrade `2026-02-25.clover` → `2026-04-22.dahlia`** (Managed Payments support)                                                                               | Gap                         | Web      | XS     | W6      |
| Pause / Downgrade / Cancel subscription flows                                                                                                                                      | Ships                       | Web      | S      | shipped |
| SpendStackImporter (CSV / JSON migration from competitor trackers)                                                                                                                 | Ships                       | Web      | S      | shipped |
| `WaitlistSignup` component + `waitlist_signups` Supabase table                                                                                                                     | **Gap — ship before Aug 1** | Web      | XS     | W6      |
| Pricing CTA flip "Subscribe" → "Join Waitlist"                                                                                                                                     | **Gap — ship before Aug 1** | Web      | XS     | W6      |

---

## §8 — Architecture & data flow

Full layout in [Appendix C](PRD-APPENDIX-C-MONOREPO-LAYOUT.md). Condensed view:

```
[ Desktop (Tauri 2.11.1) ]   [ Web (Next.js 16.2.x) ]   [ Mobile (Expo 55 + RN 0.84.0) ]
[ Chrome ext (MV3 v1.2.0) ]  [ VS Code ext (v0.3.0) ]   [ CLI (Rust 1.95.0 + Ratatui) ]
        │                          │                          │
        └──────────────────────────┼──────────────────────────┘
                                   ▼
       ┌──────────── shared TypeScript packages ────────────┐
       │ @agiworkforce/unified-chat (245 files)              │
       │ @agiworkforce/types (105) ← billing + model catalog │
       │ @agiworkforce/providers (81) ← 8 adapters           │
       │ @agiworkforce/llm-normalize (30 files, 2,633 LOC)   │
       │ @agiworkforce/llm-runtime, runtime, mcp, skills,    │
       │ apply-patch, browser-tool, design-tokens, …         │
       └─────────────────┬──────────────────┬────────────────┘
                         ▼                  ▼
          ┌─ services/api-gateway (Express 5.2, 15 routes) ─┐
          ┌─ services/signaling-server (Fly.io, WebRTC) ────┐
                         ▼                  ▼
       ┌─ Supabase (43 canonical migrations, RLS, us-east-2) ─┐
       │ Legacy `apps/web/supabase/migrations/` (50 files) DELETED after prod audit; see Appendix A §A.9 │
       └─────────────────────────────────────────────────────┘
       ┌─ Rust engine (CLI + Desktop backend) ───────────────┐
       │ 17 crates (14 active in workspace); shipping deps:  │
       │ agiworkforce-protocol, sandbox-policy, execpolicy,  │
       │ network-proxy, async-utils, 7 utils. 70 codex-rs    │
       │ port crates removed (Cargo.toml:4-9).               │
       └─────────────────────────────────────────────────────┘
```

**Four sequence traces:**

1. **BYOK send-message flow.** User types in composer → `unifiedChatStore` action → `providers/<id>/stream()` → `llm-normalize` schema clean → vendor SDK (`@anthropic-ai/sdk` 0.96.x, `openai` 6.38.x, `ollama`) → streaming chunks → store update → re-render. Authority: key never leaves device unencrypted.

2. **Local ↔ Cloud conversation migration.** User flips mode in `appModeStore`. SQLite snapshot exported via `data/db/repo` → posted to `/api/chat/conversations` (rate-limited `'chat-conversation'`) → upserts into Supabase `conversations` + `messages` (RLS-scoped). Realtime fan-out to other paired devices. Reverse migration: pull from Supabase → SQLite via `integrations/cloud`.

3. **Dispatch (mobile → desktop).** Mobile composes a control message. `dispatchRealtime.ts` writes to Supabase `dispatch_messages`, signed with HMAC v2 envelope (`{hmac, nonce, payload, ts, type}`, HKDF derivation from pairing code + sessionSalt). Realtime fan-out to desktop. Desktop `verifyInbound()` (in `dispatch_hmac.rs`) checks signature + nonce cache + timestamp window. Inbound: works. **Outbound desktop wiring is the open gap with hard deadline 2026-06-05.**

4. **Computer-use approval → execute → audit.** Model returns a tool call (e.g., `screen_click(x, y)`). Desktop renders an approval pill in the message bubble. User accepts → `automation/computer_use/observe_plan_act.rs` runs safety filter (deny list + window guard) → `action_executor.rs` issues macOS / Windows / Linux event via `enigo` → screenshot via `xcap` → `core/agi/checkpoint` writes audit row → result streamed back to model. macOS accessibility permission gate is non-negotiable.

---

## §9 — Naming & brand register

- **Product:** **AGI Workforce** (full / repo) / **AGI** (public brand).
- **Tagline (LOCKED):** _Beyond one model. Beyond one surface. AGI in your hands._
- **Strapline (LOCKED):** _AGI — your AI team: Claude, GPT, Gemini, and your local models, in one app._
- **Hero microcopy (LOCKED):** _What can I help with?_ / _Let's get to work._
- **Reserved lowercase terms (code + UI):** `computer use`, `plan mode`, `voice transcription`, `voice rewrite`, `Connectors`, `Plugins`, `Dispatch`. Anthropic's `Cowork` is NOT used; our equivalent is the unified chat.
- **Banned terms:** _GPTs_ (OpenAI's), _Sonar_ as a product noun (Perplexity's), _Artifacts_ in marketing copy (Anthropic's branded use; code keeps `artifacts/` for grep continuity but marketing uses _inline previews_).
- **Brand mark:** A / B / C SVG proposals at `docs/design/brand-mark-proposals/`. Founder picks before Aug 1. PRD does not lock the visual; PRD locks the color palette: teal `#21808d` primary, terracotta `#da7756` secondary (`packages/design-tokens`).
- **Store-listing brand (Aug-1 launch):** display name "AGI"; full name "AGI Workforce"; both appear on Apple App Store, Google Play, Chrome Web Store, VS Code Marketplace listings. Repo paths stay `agiworkforce`.

---

## §10 — Anti-pattern locks

Each lock has an enforcer.

1. **Never hardcode model IDs.** Read from `models.json`. Enforcer: `memory/rule-models-json.md` + pre-commit grep. **Open violators (W6 fix):** `apps/web/core/ai/llm/providers/anthropic-claude.ts:665` and 4 other Web files use `?? 'gpt-5.4'` fallbacks. CLI is clean (test fixtures only).
2. **No `ModeSelectionDialog` reintroduction.** Mode picker lives only inside `OnboardingWizard.tsx`. Enforcer: Playwright spec asserts zero matches.
3. **No `apps/web/components/UnifiedAgenticChat/`.** Active web chat is `apps/web/features/chat/` (113 files). Enforcer: existence test in CI.
4. **Desktop `apps/desktop/src/components/UnifiedAgenticChat/` is partially dead but actively imports `CommandPalette`, `SearchModal`, `KeyboardShortcutsOverlay`, `ToolLabel` from `App.tsx:26, 96-105`.** W6 fix: relocate the 4 live components to `apps/desktop/src/components/Shortcuts/` and `apps/desktop/src/components/Palette/`, then delete the legacy dir. Until that ships, the "commented dead code" claim in `CLAUDE.md` is incorrect and must read "partially-dead — 4 live re-exports."
5. **Stripe wire only from `apps/web/app/api/stripe-webhook/route.ts`.** Enforcer: ESLint `no-restricted-imports` for `stripe` package outside the webhook route. **Stripe API version:** `2026-04-22.dahlia` (W6 upgrade from `2026-02-25.clover`).
6. **CSP nonce required on every script tag.** Enforcer: `apps/web/proxy.ts` middleware + integration test. **`proxy.ts` not `middleware.ts`** per Next.js 16 convention.
7. **`unsafe_code` denied workspace-wide.** Enforcer: `apps/desktop/src-tauri/Cargo.toml` lint table.
8. **`await_holding_lock` warned.** Mutex must not be held across `.await`. Enforcer: clippy lint in `Cargo.toml`.
9. **`/api/stripe-webhook` runtime pinned `nodejs`.** Enforcer: integration test reads the export.
10. **`/api/stripe-webhook` excluded from `apps/web/proxy.ts` middleware** (proxy.ts regex). Enforcer: middleware integration test.
11. **Service-role-key restricted use.** Routes that may use `SUPABASE_SERVICE_ROLE_KEY`: `/api/stripe-webhook`, `/api/github/webhook`, `/api/webhooks/directory-sync`, `/api/admin/*`. Routes that must NOT (W6 migration to `getUserClient(jwt)`): `/api/auth/sso-check`, `/api/auth/set-token`, `/api/shared`, `/api/device/{poll,link,approve}`. Enforcer: ESLint custom rule in `eslint.config.mjs`.
12. **Native messaging manifest must be installable.** Currently `apps/extension/native-host/com.agiworkforce.browser.json.template` ships but no install script. W6 fix: ship `apps/extension/native-host/install.sh` that materializes the manifest to OS path OR drop `nativeMessaging` permission from `apps/extension/manifest.json` until the host binary exists.
13. **One chat layout per surface.** No Canvas / Images / Terminal as separate pages. Inline tools only. Enforcer: design-spec lock #1.
14. **Composer ≤ 760 px max-width, 16 px border-radius, model picker inside composer.** Enforcer: design-spec lock #8 + Tailwind class linter.
15. **Lucide React only for inline tool icons; stroke-width 1.75, stroke-only except CircleCheck.** Enforcer: design-spec lock #11 + import linter.
16. **Brand mark colors locked teal `#21808d` + terracotta `#da7756`** (`packages/design-tokens`). No re-skin without ADR + founder sign-off.
17. **All Supabase tables RLS-enabled.** Enforcer: migration linter (W6 — see [Appendix A §A.10](PRD-APPENDIX-A-DATA-MODELS.md)).
18. **Apple 5.1.2(i) BYOK consent.** Mobile onboarding must show explicit consent modal before first provider key registration. Enforcer: e2e Detox test asserting the modal renders + dismisses only via the explicit Accept button.
19. **Managed-cloud routing framed as "AGI's customer application access," NOT API resale.** No marketing copy uses "reseller of [provider]" or "unlimited [provider]." Provider AUP/usage policies flow down to AGI end users via onboarding consent ([research §06 / §08](../tasks/research/06-compliance-legal.md), [Anthropic commercial terms S006](https://www.anthropic.com/legal/commercial-terms), [OpenAI Services Agreement S009](https://openai.com/policies/services-agreement/), [Google Gemini Terms S012](https://ai.google.dev/terms)). Enforcer: ESLint custom rule scans `apps/web/marketing/` + `apps/mobile/onboarding/` for banned phrases; commercial-review trigger at >$5K/mo per-provider spend OR enterprise customer onboarding.
20. **Telemetry scrubbing on AI surfaces.** No session replay on `/chat/*` web routes or AI-Chat mobile screens. Sentry `beforeSend` strips strings >40 chars to prevent prompt-content capture. PostHog `mask_all_text` set on AI components. OpenTelemetry trace attributes filtered to exclude `message_content`, `prompt`, `response_body`, `api_key`. CI runs redaction unit tests on every PR. Enforcer: integration test grep-checks Sentry/PostHog/OTel config for required scrubbers.
21. **StoreKit IAP is the default mobile purchase path** for global sales. External purchase link is gated by storefront + entitlement: US storefront allows external links without entitlement; EU requires StoreKit External Purchase Link Entitlement Addendum (combined fees 7-20 % per [Apple EU update](https://developer.apple.com/support/dma-and-apps-in-the-eu/)). AGI's pre-revenue posture qualifies for Apple Small Business Program at 15 % IAP commission ([Apple SBP](https://developer.apple.com/app-store/small-business-program/)). **Verified 2026-05-17**: SBP threshold-crossing is forward-only — if AGI crosses $1M proceeds mid-year, the 30 % rate applies only to FUTURE sales, not retroactively. Enforcer: PRD-MOBILE §15 ships StoreKit IAP screens; App Review notes describe storefront gating.
22. **Three-tier route is the default in `packages/types/src/models.json`.** Default cascade: (1) Local — Apple Foundation Models (iOS 26+, GA WWDC 2025) / Gemini Nano AICore for on-device classification + routing; (2) Cache-aggressive — DeepSeek V4-Flash ($0.14/$0.28 with 98 % cache-hit discount at $0.0028/M) OR Kimi K2.6 (auto-cache at $0.15/M cached); (3) Frontier — Claude Sonnet 4.6 / GPT-5.4 / Gemini 3.1 Pro. The router reads `prompt_cache_hit_tokens` + `prompt_cache_miss_tokens` from provider responses into `CacheObservation`. Enforcer: `packages/routing/src/three-tier-router.ts` integration tests assert the cascade order; default-off for Chinese-HQ providers until user opt-in (per #26).
23. **Cache-discount magnitude assumption locked at 90 %.** Verified primary sources: OpenAI auto-cache ≥1,024 tokens at 10× off (90 % discount) · Anthropic cache reads at 0.1× base input · DeepSeek V4-Flash cache hit at 98 % off. V4's implicit 50 % discount baseline understated savings; V5 Token COGS budget re-models with 90 % discount magnitude on observed cache hits. Hit-RATE targets unchanged. Enforcer: `services/api-gateway/src/cost-estimator.ts` uses 0.10 multiplier on cached tokens.
24. **Every model entry in `models.json` carries a `deprecation_date` field + alias-aware indirection.** Hard-anchored entries this sprint: `kimi-k2.6` (replaces `kimi-k2-*` family discontinued **2026-05-25**, [S-Moonshot](https://platform.kimi.ai/docs/models)) · `deepseek-v4-flash` (replaces alias-deprecated `deepseek-chat`, `deepseek-reasoner`) · `deepseek-v4-pro` with `promo_expires_at: "2026-05-31T15:59:00Z"` flag + auto-reroute logic past expiry · `claude-opus-4-7` (released 2026-04-16, tokenizer drift +0-35 % per [S-Anthropic](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-7), all migration tests must re-baseline). Cron job (`scripts/check-pricing.ts`) hits provider pages weekly, opens auto-PR on diff. Enforcer: CI test fails on any model entry without `deprecation_date` field; ESLint rule blocks string literals matching `kimi-k2-[^.]+`, `deepseek-chat`, `deepseek-reasoner` outside this models.json file.
25. **Mobile v1 ships chat + workflow + remote-controller surface only — NO in-app code execution UX.** Verified by Apple's enforcement of Guideline 2.5.2 (verbatim: "may not download, install, or execute code which introduces or changes features or functionality of the app") against Replit + Vibecode (update-blocked 2026-03-18, [MacRumors](https://www.macrumors.com/2026/03/18/apple-blocks-updates-for-vibe-coding-apps/)) and Anything (pulled 2026-03-30, [MacRumors](https://www.macrumors.com/2026/03/30/apple-pulls-vibe-coding-app/)). Code execution UX lives on desktop / CLI / web. Revisit only after WWDC 2026 (June 8-12, 2026) clarifies any sanctioned code-execution entitlement. Enforcer: mobile e2e Detox test fails if any UI element offers code-execution semantics on iOS surface. **v1.1+ candidate (LoRA adapter research 2026-05-18)**: Apple's `.fmadapter` toolkit + Foundation Models Framework Adapter Entitlement + Apple-hosted Background Assets provides an OFFICIAL distribution path for custom LoRA adapters — Apple explicitly instructs developers to "host your adapters on a server" and download per-user via Background Assets. Verdict: YES-with-conditions, gated on Apple App Review consultation confirming 2.5.2 classification + Account-Holder applying for the Foundation Models Framework Adapter Entitlement. Recommended first wave: 2-3 narrow text-only adapters (summary-specialist, legal-review-specialist, voice-rewrite-specialist) via Apple-hosted Background Assets only. Defer medical / coding adapters until safety review clears. NO user-generated adapters. NO marketplace. NO file import. See `tasks/research/PROMPT-APPLE-LORA-ADAPTER-RESEARCH.md` for the consultation prep memo.
26. **EU AI Act Article 50 compliance ships pre-2026-08-02.** Article 50(1) "you are interacting with AI" first-run disclosure (covers V4's Apple 5.1.2(i) consent flow + adds explicit chatbot label). Article 50(2) machine-readable marking on AI-generated text / audio / image exports (C2PA-style provenance claims OR invisible token-level watermarking via provider hooks). Penalty exposure: up to €15M or 3 % global turnover ([EU AI Act Art 50](https://artificialintelligenceact.eu/article/50/)). Default off for Chinese-HQ providers (DeepSeek, Kimi/Moonshot, Qwen, Zhipu) until user opt-in with named-provider consent — provider routing in EU is a dual-jurisdiction non-starter without per-provider 5.1.2(i) + Article 50(1) disclosure. Enforcer: `packages/compliance/src/article50.ts` runs in onboarding flow before first AI request; integration test asserts `<meta name="agi:ai-generated"` tag on every export.

---

## §11 — Vendor partnership reality

Two lanes: **managed-eligible** (we route paid traffic) and **BYOK-only** (user supplies key, contract is with vendor).

**Managed-eligible (Hobby → Max):**

| Vendor    | Use                                           | Wire                          | Model May 2026                                                                                                                                                                                         |
| --------- | --------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anthropic | Coding / creative / computer-use orchestrator | `@anthropic-ai/sdk` 0.96.x    | Claude Opus 4.7 ($5/$25), Sonnet 4.6 ($3/$15), Haiku 4.5 ($1/$5)                                                                                                                                       |
| OpenAI    | Balanced workhorse, flagship reasoning, voice | `openai` 6.38.x               | GPT-5.4 ($2.50/$15), GPT-5.4-mini ($0.40/$1.60), **GPT-5.5 (NEW Apr 23 2026)**, Whisper-1, gpt-4o-mini-transcribe (recommended for new transcription)                                                  |
| Google    | Workhorse / multimodal / image / video        | `@google/generative-ai`, REST | Gemini 3.1 Flash-Lite ($0.25/$1.50), Gemini 3.1 Pro Preview ($2/$12 <200K / $4/$18 >200K), Imagen 4 Fast ($0.02/img), Veo 3.1 Lite ($0.05/sec), Veo 3.1 Fast ($0.15/sec), Veo 3.1 Standard ($0.40/sec) |

**BYOK-only (user supplies key):**

- xAI Grok 4.20 ($2/$6, 2M ctx), Grok 4.3 ($1.25/$2.50) — `Grok 4` generic is stale, retire in models.json.
- DeepSeek V4 Flash ($0.14/$0.28), DeepSeek V3.2 (`deepseek-chat`).
- Codestral 2508 ($0.30/$0.90) — replaces bare "Mistral" entry.
- Moonshot Kimi K2.6 ($0.60/$2.50 — V2 PRD said $0.95/$4.00, that was stale).
- Zhipu GLM-4.7 ($0.60/$2.20); GLM-5 roadmap.
- Qwen 3.6 Plus ($0.325/$1.95), Qwen 3.6 Max Preview, Qwen 3 Coder Next — generic "Qwen 3" is stale.
- Perplexity Sonar / Sonar Deep Research (multi-component billing).
- Groq, Together AI, Fireworks AI, Azure OpenAI, AWS Bedrock, OpenRouter, AI21, SambaNova, Cohere.

**Removed (do not list):** `gpt-5.4-codex` (does not exist as SKU; GPT-5.4 absorbs codex capabilities), Veo 3.0 preview models (EOL'd 2026-11-12).

**Excluded mobile-local SDKs (license / risk review, [`docs/PRD-MOBILE.md`](PRD-MOBILE.md) §8):**

- **Cactus / cactus-react-native** — engine LICENSE has funding/revenue thresholds (free only below $2M funding AND $2M revenue); telemetry flags in some SDK surfaces; source-build-heavy quickstart. Not suitable for a privacy-first product foundation. Reconsider only with a written commercial license.
- **RunAnywhere SDK** — raw LICENSE imposes free-use thresholds below $1M funding/revenue despite README claiming Apache-2.0; default-on anonymous analytics in Swift docs. README/LICENSE mismatch is a material risk. Reconsider only with a written commercial license.
- **MediaPipe LLM Inference (mobile API)** — Google deprecated this mobile API; current guidance routes mobile developers to LiteRT-LM. Do not use for greenfield mobile work.
- **MLX-Swift directly in a React Native bridge** — iOS-only and would force a separate Swift native module wrapping MLX into RN. Marginal perf vs `react-native-executorch` doesn't justify the second native runtime to maintain. (MLX-Swift remains a candidate if mobile splits into a separate native-Swift app at v2 per `docs/PRD-MOBILE.md` §21.)

### Mobile on-device runtime lane (LOCKED per [`docs/PRD-MOBILE.md`](PRD-MOBILE.md) §8)

| Tier                                      | iOS                                                                                        | Android                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Tier 1 (free, OS-resident, zero download) | Apple Foundation Models (iOS 26+, Apple-Intelligence devices, ~3B) via Swift native module | Gemini Nano via AICore + ML Kit GenAI (Pixel 8+, S24+, expanding MediaTek/Qualcomm 2026) via Kotlin native module |
| Tier 2 (downloadable, modern OS)          | `react-native-executorch` (iOS 17+) + Expo resource fetcher                                | `react-native-executorch` (Android 13+) + Expo resource fetcher                                                   |
| Tier 3 (universal fallback)               | `llama.rn` Expo config plugin (iOS 15+)                                                    | `llama.rn` Expo config plugin (Android 10+)                                                                       |

**Default mobile models** (Q4_K_M / Q4 quantization): Qwen 2.5 1.5B Instruct (~1.0 GB, "Fast"), Llama 3.2 3B Instruct (~1.8 GB, "Capable"), Gemma 3 4B vision variant (~2.5 GB, opt-in image analysis), TinyLlama 1.1B (~0.7 GB fallback for low-RAM devices), nomic-embed-text-v1.5 (~150 MB for memory / RAG), whisper-base.en (~140 MB for Tier-2 voice). MediaPipe LLM Inference (mobile) is deprecated by Google — do not reference.

**Explicitly excluded from v1 mobile** (license / risk per PRD-MOBILE §8): Cactus / cactus-react-native (engine license with >$2 M funding/revenue thresholds + default-on telemetry on some SDK surfaces); RunAnywhere (raw LICENSE imposes <$1 M funding/revenue free-use thresholds despite README claiming Apache-2.0; default-on anonymous analytics in Swift docs); MLX-Swift directly (iOS-only would force second native runtime + Swift module wrapping into RN — marginal perf gain vs `react-native-executorch` does not justify the maintenance cost).

**Managed cloud Hobby workhorse picks (from `SLOT_REGISTRY`):**

- General fast / workhorse: **gemini-3.1-flash-lite**.
- Escalation coding: **glm-4.7**.
- Reasoning premium fast: **deepseek-v4-flash**.

**No public "startup program" assumed.** Anthropic Partner, OpenAI Startup, Google for Startups, AWS Activate applications are listed in `tasks/launch-checklist-2026-07-18.md` as outreach items, not contracted credits.

**ToS posture (V4 lock).** Two distinct legal postures:

1. **BYOK lane**: user's contract is with the provider; AGI is a client. Always safe.
2. **Managed-cloud lane (Hobby+ tiers)**: AGI is the **customer application** under each provider's customer-application terms. We are not a reseller. Concretely:
   - **Anthropic** ([commercial terms](https://www.anthropic.com/legal/commercial-terms)): contemplates customer applications for the customer's own users; resale requires written approval. **AGI Hobby/Pro/Pro+/Max users are AGI's end users, not Anthropic's customers.** We flow Anthropic AUP down to our users in onboarding consent.
   - **OpenAI** ([Services Agreement](https://openai.com/policies/services-agreement/)): contemplates customer applications; explicitly prohibits reselling or leasing account access. **AGI is the OpenAI customer; AGI's end users are AGI's customers.**
   - **Google Gemini API** ([terms](https://ai.google.dev/terms)): 30-day pricing-change mechanic; grounding restrictions; agentic responsibility. **AGI accepts pricing-change risk** per §17 risk #19.
   - **OpenRouter (if used as gateway route)** ([terms](https://openrouter.ai/terms)): flows provider model terms down; prohibits competing API resale. **OpenRouter is an optional route, not a legal simplifier.**

**Commercial-agreement triggers (LOCKED):**

- Per-provider spend exceeds **$5K/month** sustained → engage provider commercial team for written terms
- Enterprise customer onboarding (AGI Enterprise tier with custom MSA) → engage provider for redistribution-rights clarity
- Volume aggregator behavior (single AGI key serving >10K monthly active routed users) → seek partnership status

**Public marketing language locked:** never use "unlimited Claude," "reseller of GPT," "wholesale Gemini access," "raw API resale." Always frame as AGI features powered by partner models. See [§10 anti-pattern lock #19](#10--anti-pattern-locks).

---

## §12 — Security & privacy model

**Per-route privacy labels and storage classification:**

| Route / surface                      | Data class                       | Storage                                                                                                                            | Retention          |
| ------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `/api/llm/v1/chat/completions` (web) | user message + provider response | not persisted on web; user controls retention                                                                                      | n/a                |
| Desktop chat                         | message + response               | SQLite (Local mode) or Supabase (Cloud mode) per `appModeStore`                                                                    | user-controlled    |
| Mobile chat                          | message + response               | MMKV (encrypted, 256-bit key in Keychain) + Supabase mirror if Cloud                                                               | user-controlled    |
| BYOK key                             | sensitive credential             | Stronghold (Desktop), Keychain `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (Mobile), VS Code SecretStorage, `chrome.storage.session` (Chrome) | until user removes |
| `/api/voice/transcribe`              | audio frames                     | ephemeral Deepgram token (≤60 s TTL) minted by `services/api-gateway`                                                              | per-request        |
| Dispatch messages                    | control plane                    | Supabase `dispatch_messages` RLS-scoped, HMAC v2 signed                                                                            | 30 days then purge |
| Stripe webhook events                | financial                        | `stripe_events` table + idempotency RPC, 60 s replay window                                                                        | 1 year             |

**Stronghold envelope** (Desktop): AES-GCM wrapped, key derived via Argon2 (t=3, m=64 MiB, p=1, min password 12 chars + 3-of-4 complexity). Brute-force rate-limiter: 5→30 s, 10→5 min, 20→restart-required (`master_password.rs`, 769 LOC, 22 crypto tests).

**Sandbox per platform:**

- macOS: Seatbelt (entitlements XML for fs / network / audio / input). Ships.
- Linux: bwrap (namespace isolation). Ships.
- Windows: stub. **W7 — must refuse hard on Windows until shipped, not silent-fallthrough.** ([§17](#17--risk-register-top-15) risk 10.)
- Landlock (Linux 5.13+): unwired stub. W7.

**Apple 5.1.2(i) (Nov 2025 update):**

> AGI Workforce app must **disclose** that user data (prompts, attachments, message content) is sent to third-party AI providers (OpenAI, Anthropic, Google, etc.) **and obtain explicit consent** before any such transmission. Privacy-policy link alone is insufficient.

Implementation:

- Mobile onboarding renders the **BYOK Provider Disclosure & Consent** modal before the provider-key form is unlocked. The modal lists every provider the user might route to, names their privacy policy, and includes an explicit "I understand and accept" toggle (not a checkbox pre-checked).
- Web has the same disclosure but follows web-tracking-consent norms (cookie banner pattern).
- Modal copy: see [Appendix B §B.7](PRD-APPENDIX-B-API-CONTRACTS.md).

**OWASP LLM Top 10 v2.0 mapping** (the version current as of May 2026; 2026 update is in survey phase):

- **LLM01 Prompt Injection** → mitigated by per-action consent (Computer Use, Plugins, browser-tool `evaluate` disabled by default) + [§17 risk 6 Chain 1](#17--risk-register-top-15).
- **LLM02 Sensitive Info Disclosure** → enforced by `audit/scan_paths.txt` (path traversal) + `apply-patch` `workspaceOnly: true` default + browser-tool profile-path enforcement.
- **LLM03 Supply Chain** → SDKs pinned (`@anthropic-ai/sdk` 0.96.x, `openai` 6.38.x, `@supabase/supabase-js` 2.105.x, etc.); pnpm lockfile; provider catalogs derived from `models.json` not vendor inventory.
- **LLM05 Improper Output Handling** → DOMPurify on LLM output before render (52 `innerHTML` sites audited 2026-05-05 + this PRD review); CSP nonce per request.
- **LLM06 Excessive Agency** → Tool consent ladder: Default (ask each action), Auto (read-only allowed), Bypass (logged). Configurable per-conversation.
- **LLM07 System Prompt Leakage** → never logged at info level; debug-only with explicit user opt-in.
- **LLM10 Unbounded Consumption** → `withRateLimit` on every `/api/*` route (223 sites verified; previously claimed 199 — stat updated this PRD); per-tier token caps in `TIER_POLICIES` enforced at slot-routing time.

**Audit-log export** (Enterprise): all admin events written to `audit_logs` table, exportable as JSONL via `/api/admin` (admin-key gated). SCIM directory sync planned W7.

**Service-role-key migration ([§10](#10--anti-pattern-locks) lock 11):**

| Route                             | Action                          | Reason                                            |
| --------------------------------- | ------------------------------- | ------------------------------------------------- |
| `/api/stripe-webhook`             | Keep service-role               | HMAC-verified webhook; must bypass user JWT       |
| `/api/github/webhook`             | Keep service-role               | HMAC-verified webhook                             |
| `/api/webhooks/directory-sync`    | Keep service-role               | HMAC-verified webhook                             |
| `/api/admin/*`                    | Keep service-role               | Admin operations explicit                         |
| `/api/auth/sso-check`             | Migrate to `getUserClient(jwt)` | User-scoped read; least-privilege                 |
| `/api/auth/set-token`             | Migrate to `getUserClient(jwt)` | User-scoped write                                 |
| `/api/shared`                     | Migrate to `getUserClient(jwt)` | Reads public/share links — service-role too broad |
| `/api/device/{poll,link,approve}` | Migrate to `getUserClient(jwt)` | Device pairing is user-scoped                     |

W6 deliverable. Enforced by ESLint rule on PR.

### Telemetry scrubbing rules (V4 LOCKED — research-pack §08 + R-011)

Telemetry-off-by-default is a brand-defining promise. The following technical controls implement it on every surface that touches AI content:

| Surface | Crash reporter                                                                                      | Product analytics                                                                               | OTel                                                                                                                  | Session replay                                               |
| ------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Web     | Sentry with `beforeSend` redaction; strings >40 chars dropped except specific safe-prefix allowlist | PostHog with `mask_all_text: true` on `/chat/*` routes; `respect_dnt: true`; cookieless EU mode | Server traces only; `prompt`, `response_body`, `api_key`, `message_content` attributes excluded by collector pipeline | **Disabled on AI surfaces.** Confirmed via integration test. |
| Mobile  | Sentry React Native with same scrubber; SDK initialized only after user opt-in                      | PostHog with same masks; events list minimized to navigation + onboarding-funnel only           | Disabled by default; opt-in for diagnostics                                                                           | **Disabled.**                                                |
| Desktop | Sentry Rust + JS; same scrubbers                                                                    | PostHog same as Mobile                                                                          | Tauri instrumentation off by default                                                                                  | **Disabled.**                                                |
| CLI     | Crash reporter only opt-in via `/diagnostics on`                                                    | Anonymous usage histogram opt-in via `/telemetry on`; never message content                     | Off                                                                                                                   | n/a                                                          |

**CI gates:** redaction unit tests for every event schema; grep checks against `eslint.config.mjs` deny-list for `console.log(JSON.stringify(message))` patterns; Sentry beforeSend asserted to exist in init code.

**Red team status:** `docs/security/red-team-2026-05-04.md` found 13 P0 / 43 P1 / 42 P2 / 21 P3 = 119 findings. As of 2026-05-17, P0 count is **5 open** (out of original 13). Open P0s feed [§17](#17--risk-register-top-15). The research-pack risk register (`tasks/research/_risk_register.csv`) adds 18 NIST AI RMF-aligned risks; top-5 severity-5 are mirrored in §17 #16-#20.

---

## §13 — Accessibility

**Target:** WCAG 2.2 AA on every surface.

- **Keyboard navigation:** all interactive elements tabbable. Composer Send is `Cmd/Ctrl+Enter` (design-spec lock #8). Sidebar collapse, theme cycle (`Cmd+Shift+L`), Quick Query (`Cmd+Shift+Space`), Floating window toggle.
- **Screen readers:** VoiceOver (macOS) + NVDA (Windows) verification on every Desktop / Web release. Aria-label required on icon-only buttons ([§10 lock #18](#10--anti-pattern-locks)).
- **Focus rings:** `focus-visible` on every interactive (Tailwind ring utilities). No `outline: none` without replacement.
- **Color contrast:** body text ≥ 4.5:1 against canvas (warm off-white `#faf9f7` light / `#1a1915` dark). Verified per `packages/design-tokens`.
- **axe-core in Playwright CI:** Desktop spec `accessibility-audit.spec.ts` runs axe on each merge. Web has parallel axe coverage. Mobile a11y is RN-AccessibilityInfo-based; automated coverage W7.
- **Themes:** 15 presets (Catppuccin / Dracula / GitHub / Gruvbox / Kanagawa / Monokai / Nord / One-Dark / Rose-Pine / Solarized / Tokyo-Night and variants). Claude Code's 6-theme set includes explicit colorblind variants; AGI matches via Gruvbox + Solarized (both colorblind-tested).

---

## §14 — Internationalization

**Locales wired today:** English (`en`), Spanish (`es`). Detected via `react-i18next` in Desktop and Web.

**Rollout (LOCKED, post-Aug-1):**

| Locale            | Surfaces day-1         | Target  | Notes                    |
| ----------------- | ---------------------- | ------- | ------------------------ |
| `en`              | All 6                  | shipped | —                        |
| `es`              | Desktop + Web          | Q3 2026 | partial; W6 polish       |
| `ja`              | Desktop + Mobile + Web | Q4 2026 | community-translated     |
| `de`              | Desktop + Web          | Q4 2026 | community-translated     |
| `fr`              | Desktop + Web          | Q4 2026 | community-translated     |
| `pt-br`           | Mobile + Web           | Q4 2026 | community-translated     |
| `ar` / `he` (RTL) | none                   | Wave 7  | RTL stylesheets deferred |

Translation namespace files: `chat.json`, `models.json`, `settings.json`, `errors.json`, `common.json`, `pricing.json`, `auth.json`.

---

## §15 — Analytics & observability

**Five week-1 events** (instrumentation must land before Aug-1 graduation):

1. `install` — first app open per surface; payload from referrer / utm / install_source.
2. `first_provider_keyed` — user added first BYOK key OR chose Local mode.
3. `first_message_sent` — first non-empty composer submit.
4. `upgrade_clicked` — paywall surface intersection.
5. `churn_signal` — 7-day no-open after `install`.

**Tooling:** Google Analytics 4 (web), Sentry for error capture (already wired in `apps/web/core/billing/token-enforcement-service.ts` and elsewhere), self-hosted Prometheus dashboard at `services/api-gateway/admin/metrics`. Plausible / PostHog / OpenTelemetry **not wired** as of 2026-05-17. Firebase Crashlytics planned for Mobile (W7).

**Cadence:** weekly Friday review of the five events + the 14-day funnel from `install` → `first_message_sent` → `upgrade_clicked`. Engineering on-call rotation owns error-budget breaches.

**Per-surface error budgets (initial):**

- Desktop: 99.5 % crash-free sessions per release (Sentry).
- Web: < 1 % p99 5xx on `/api/llm/v1/chat/completions` over 7-day window.
- Mobile: 99.0 % crash-free sessions.
- CLI: zero panics in production binary. Open work: 2,409 `unwrap()/expect()` calls to refactor to `?` ([§17](#17--risk-register-top-15) risk 13).

---

## §16 — Pricing & billing model

**8 tiers verified in `packages/types/src/billing-catalog.ts` (SSOT)** + **Pro Max as Wave 6 build target.** PRD specifies the exact code edit required.

### Current state (in code)

```ts
export type BillingPlanTier =
  | 'local-only'
  | 'byok'
  | 'free'
  | 'hobby'
  | 'pro'
  | 'pro_plus'
  | 'max'
  | 'enterprise';
```

### Required state by 2026-08-01 (W6 deliverable)

```ts
export type BillingPlanTier =
  | 'local-only'
  | 'byok'
  | 'free'
  | 'hobby'
  | 'pro'
  | 'pro_plus'
  | 'pro_max'     // NEW
  | 'max'
  | 'enterprise';

// add to BILLING_PLAN_PRICING:
pro_max: {
  id: 'pro_max',
  label: 'Pro Max',
  monthlyPriceUsd: 99,
  yearlyPriceUsd: 999,
},
```

Plus env-var contract: `STRIPE_PRICE_PRO_MAX_MONTHLY`, `STRIPE_PRICE_PRO_MAX_YEARLY`, plus matching `TIER_POLICIES.pro_max` block in `packages/types/src/model-catalog.ts`. Full `TIER_POLICIES` shape in [Appendix A §A.5](PRD-APPENDIX-A-DATA-MODELS.md).

### Full tier table (post-W6)

| Tier                   | Monthly USD | Yearly USD            | Stripe product        | Status                   |
| ---------------------- | ----------- | --------------------- | --------------------- | ------------------------ |
| Local-only             | $0          | $0                    | n/a                   | ✅ LIVE                  |
| BYOK                   | $0          | $0                    | n/a                   | ✅ LIVE                  |
| Free                   | $0          | $0                    | n/a                   | ✅ LIVE                  |
| Hobby                  | $10         | $59.88 (~50 % off)    | `prod_TeFMHLjQt0sgMy` | 📝 Waitlist → 2026-08-01 |
| Pro                    | $29.99      | $299.88 (~17 % off)   | `prod_TeFMDyIcU6xYJ3` | 📝 Waitlist → 2026-08-01 |
| Pro+                   | $49.99      | $499.88 (~17 % off)   | `prod_UTTTGQ9T01Ukge` | 📝 Waitlist → 2026-08-01 |
| **Pro Max (W6 build)** | **$99**     | **$999 (~17 % off)**  | **`prod_TBD_W6`**     | 📝 Waitlist → 2026-08-01 |
| Max                    | $299.99     | $2,999.88 (~17 % off) | `prod_TeFMn7oAjLQTvG` | 📝 Waitlist → 2026-08-01 |
| Enterprise             | Contact     | Contact               | n/a                   | Contact sales            |

### Included-usage budget

`INCLUDED_USAGE_BUDGET_RATIO = 0.35` (`billing-catalog.ts:12`). The user's monthly usage budget in cents = 35 % of price in cents. Rest covers infra, payment processing, margin.

### Cap behavior (LOCKED)

Warn at 80 % → downgrade slot at 100 % → hard cap at 150 %. `STANDARD_CAP_BEHAVIOR` shared frozen object in `model-catalog.ts`.

### Refund / pause / downgrade / cancel state machine

- **Pause:** subscription enters `paused`; access reduced to Free-tier; resume restores.
- **Downgrade:** at-period-end; slot recompute on rollover; over-cap usage carries forward.
- **Cancel:** at-period-end; user retains until period close. No refund pro-rate on standard tiers; Enterprise per MSA.
- **Refund:** 7-day no-questions window for first paid month; case-by-case thereafter.

### Video gating (V3 LOCK — supersedes V2 Max-only)

V2 said Max-only on the basis of $0.75/sec Veo cost. The real Veo 3.1 pricing is $0.05/sec Lite, $0.15/sec Fast, $0.40/sec Standard. V3 corrects:

| Tier          | Veo allotment                                         | Cost / mo      | % of ARPU      |
| ------------- | ----------------------------------------------------- | -------------- | -------------- |
| Pro+          | Veo 3.1 Lite, 60 sec/mo                               | $3             | 6 % of $49.99  |
| Max           | Veo 3.1 Fast, 60 sec/mo + Veo 3.1 Lite up to 5 min/mo | $9 + $15 = $24 | 8 % of $299.99 |
| BYOK any tier | unlimited via user's vendor key                       | $0 to AGI      | 0 %            |

Sora 2 path retired: API discontinued 2026-09-24, consumer app shut down 2026-04-26. Veo 3.0 preview models EOL'd 2026-11-12 — any code referencing `veo-3.0-*` is broken and must migrate to `veo-3.1-*`.

### BYOK posture (LOCKED)

BYOK keys are **never charged by us** and **never throttled by us**. Hobby and above buy managed cloud capacity; BYOK is the parallel free-forever path.

### Token COGS budget targets (V4 LOCKED — research §08)

Hobby $10/mo unit economics survive only if managed-cloud token COGS stays below 35 % of revenue (per `INCLUDED_USAGE_BUDGET_RATIO`). The research pack quantified the operational targets that make this viable:

| KPI                                                                 | Pre-launch target          | Post-stabilization target  | Source                                                                                                                        |
| ------------------------------------------------------------------- | -------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Cache-hit rate on managed-cloud prompts ≥1,024 tokens               | **≥30 %**                  | **≥50 %**                  | [research/\_risk_register R-004](../tasks/research/_risk_register.csv)                                                        |
| **Cache-discount magnitude per hit** (V5 LOCKED)                    | **90 %** (0.1× base input) | **90 %**                   | OpenAI auto-cache 10× off · Anthropic 0.1× cache reads · DeepSeek V4-Flash 98 % off — [§10 lock #23](#10--anti-pattern-locks) |
| Managed-cloud gross margin by paid tier                             | n/a                        | **≥60 %** after token COGS | [research/\_risk_register R-003](../tasks/research/_risk_register.csv)                                                        |
| Local-runtime crash-free sessions on locked hardware                | ≥99.5 %                    | ≥99.5 %                    | [research/04-ondevice-runtimes.md](../tasks/research/04-ondevice-runtimes.md) acceptance criteria                             |
| Telemetry leak tests (raw prompt/output/API-key findings)           | **0**                      | **0**                      | [§10 lock #20](#10--anti-pattern-locks)                                                                                       |
| App Store payment compliance issues at first review                 | **0**                      | **0**                      | [§10 lock #21](#10--anti-pattern-locks)                                                                                       |
| Models without `deprecation_date` in `models.json`                  | **0**                      | **0**                      | [§10 lock #24](#10--anti-pattern-locks)                                                                                       |
| In-app code-execution UX on iOS surface                             | **0**                      | **0**                      | [§10 lock #25](#10--anti-pattern-locks) — Apple 2.5.2 enforcement                                                             |
| EU AI Act Article 50 disclosure + marking shipped before 2026-08-02 | **yes**                    | **yes**                    | [§10 lock #26](#10--anti-pattern-locks) — €15M / 3 % turnover exposure                                                        |

**Seven pricing guardrails (LOCKED, per research §08):**

1. Route-level maximum cost per request (cap output tokens; reject requests projected to exceed cap).
2. User-level monthly managed-cloud budget (hard quota; warn 80 %; downgrade slot 100 %; hard cap 150 %).
3. Provider-level daily cap (prevents single-provider runaway).
4. Default output token cap by tier (Hobby 2K, Pro 4K, Pro+ 8K, Pro Max 16K, Max unlimited).
5. Cache hit-rate KPI dashboard + regression alerts (Sentry-based).
6. Degrade-before-block UX: when budget exhausted, downshift to mid-tier model (Sonnet→Haiku, GPT-5.4→GPT-5.4-mini, Gemini Pro→Flash-Lite) and notify user; do not silently fail.
7. BYOK escape hatch always one tap away (Cloud-mode users can add their own key any time).

### Pricing-change + deprecation registry (V4 LOCKED — research §08)

Maintain `packages/types/src/model-registry.yaml` (NEW W6) with:

```yaml
models:
  anthropic:claude-opus-4.7:
    status: stable
    input_per_mtok: 5.00
    output_per_mtok: 25.00
    cache_write_5m_multiplier: 1.25
    cache_read_multiplier: 0.10
    last_verified: 2026-05-17
  openai:gpt-5.4:
    status: stable
    cached_input_per_mtok: 0.25 # auto-cache hit rate
  google:gemini-3.1-pro:
    status: stable
    cache_storage_cost_per_mtok_hour: true
    ttl_guardrail_seconds: 300 # default short TTL to avoid storage bills
  deepseek:deepseek-chat:
    status: alias-risk
    migration_required: true
    migration_target: deepseek:deepseek-v4-flash
```

Cron job (W6) hits each provider pricing page weekly; diffs `last_verified` against current; opens auto-PR if any rate or cache-multiplier changed. Trigger: any change ≥15 % → freeze affected tier pricing + emergency PRD review.

### Waitlist mechanic (W6 deliverables)

Stripe price IDs exist in code and Stripe dashboard, but checkout is **dormant** until Aug 1. The Pricing CTA flips from "Subscribe" → "Join Waitlist". `WaitlistSignup` component reads email into a `waitlist_signups` Supabase table (schema in [Appendix A §A.6](PRD-APPENDIX-A-DATA-MODELS.md)). Aug 1 graduation flips checkout active; waitlisters get a conversion email.

---

## §17 — Risk register (top 15)

Severity × exploitability × effort. Each entry: **description → blast → mitigation → escalation trigger**.

1. **Apple 5.1.2(i) BYOK consent (top risk — Mobile is the first implementation, see [`docs/PRD-MOBILE.md`](PRD-MOBILE.md) §13 + §14).** Risk: iOS rejection if the explicit consent modal is missing or its copy is judged insufficient (Nov 2025 guideline update). **Blast: Mobile launch blocked → entire product roadmap slips because Mobile is the lead surface.** Mitigation: ship the modal ([Appendix B §B.7](PRD-APPENDIX-B-API-CONTRACTS.md) + PRD-MOBILE §11 onboarding branch B); e2e Detox test asserts render + accept-only-on-tap (PRD-MOBILE M2); legal counsel pre-briefed on PLA wording; submission notes cite Apple's guideline directly. Local mode is exempt from 5.1.2(i) (no third-party data sharing) — if Cloud-mode submission stalls, ship Local-only as a kill-criteria fallback per PRD-MOBILE §19. Trigger: any App Review rejection citing 5.1.2(i) → file Apple Developer support ticket within 24 h.
2. **Stripe RPC production-data verification.** `process_stripe_event_idempotent` is live in prod per `AGI_WORKFORCE.md:57`; end-to-end webhook idempotency under real-card load has not been smoke-tested. Blast: duplicate charges on launch. Mitigation: production smoke-test plan in `docs/launch/hobby-tier-checklist.md`; replay a test-event from Stripe dashboard before Aug-1 flip. Trigger: any `stripe_events.status = 'failed'` row at flip → halt billing.
3. **Desktop Dispatch outbound signing not wired** (hard deadline 2026-06-05). Risk: after that date, mobile rejects unsigned messages and Dispatch breaks. Blast: feature regression for the only mobile differentiator. Mitigation: ship the desktop outbound signer (S effort, ≤4 dev-days). Trigger: 2026-05-25 progress check; if not in PR by then, feature-flag mobile rejection off temporarily.
4. **Pro Max $99 ships in docs but not in code.** Risk: marketing leads to a tier that crashes at checkout. Blast: launch credibility. Mitigation: ship the `BillingPlanTier` + Stripe env contract + `TIER_POLICIES.pro_max` block (S effort) before Aug 1. Trigger: any user click on Pro Max waitlist that produces an exception in `lib/price-tier-mapping.ts`.
5. **Stripe API `2026-02-25.clover` is one major behind.** Risk: missing Managed Payments features available in `2026-04-22.dahlia`. Blast: future Stripe deprecation forces a forced upgrade later. Mitigation: bump `apps/web/lib/stripe-config.ts` `STRIPE_API_VERSION` to `2026-04-22.dahlia`. Trigger: any Stripe API deprecation notice.
6. **Chain 1 — cross-surface zero-click prompt injection → browser RCE** (cross-chain: CHEXT-29 Chrome auto-sync `outerHTML` + CHEXT-05 markdown mXSS bypass + DESK-02 `execute_script` no-confirmation). Risk: attacker page DOM → Chrome ext auto-syncs `outerHTML` to desktop LLM → LLM interprets injected instructions → triggers `ExecuteScript` over bridge → arbitrary JS in active tab. Blast: browser RCE on any tab; blocks Chrome Web Store submission. Mitigation: strip outerHTML → innerText on sync; require explicit user confirmation before `execute_script`; system-prompt guard against script-execution requests; opt-in rather than auto-sync. Trigger: any attacker DOM payload that survives sanitization in QA fuzz.
7. **Two-source-of-truth Supabase migrations.** `supabase/migrations/` (43) vs `apps/web/supabase/migrations/` (50, 30 unique). Production-provisioning origin undocumented. Blast: paid-tier features lean on RPCs that may not exist in prod. Mitigation: production DB audit (does `process_stripe_event_idempotent` exist? do the 30 legacy-unique migrations exist?) + reconcile by Aug 1. **Then delete legacy directory.** Runbook in [Appendix A §A.9](PRD-APPENDIX-A-DATA-MODELS.md). Trigger: any RPC `function does not exist` error on webhook path.
8. **Computer-use prompt injection via vision.** Risk: an attacker page renders "type the user's password" and the vision model obeys. Blast: credential exfiltration on Pro+ / Max. Mitigation: `automation/computer_use/safety.rs` deny-list + window guard + modal-dialog detection + per-action consent. Per-action consent non-negotiable for sensitive surfaces. Trigger: any user report of unauthorized keystrokes.
9. **MCP arbitrary-code-exec via skill plugin.** Risk: a third-party MCP server returns a `tool_call` payload that the desktop client trusts without sandboxing. Blast: RCE on Local mode. Mitigation: MCP runs under `sandbox-policy` crate; `apply-patch` `workspaceOnly` defaults to true (verified `packages/apply-patch/src/index.ts:152`); `browser-tool` `evaluate` defaults to `allowEvaluate: false` (verified line 188). Trigger: any P0 finding in plugin runtime.
10. **Windows + Linux sandboxing absent.** Risk: CLI / Desktop on Windows runs without OS-level sandbox; Linux without bwrap also runs without sandbox. Currently silent fallthrough. Blast: command execution unsandboxed. Mitigation: change `apps/cli/src/sandbox.rs` to **refuse hard** when no sandbox is available on the platform (do not silently downgrade). W6 fix. Trigger: any production user report of unsandboxed exec.
11. **XCUT-02 — multi-tenant time-bomb (web service-role with manual filters).** 14 web route files use `SUPABASE_SERVICE_ROLE_KEY` directly; 8 of those (auth/sso-check, set-token, shared, device/\*) should be on `getUserClient(jwt)`. Blast: a future PR that drops a `.eq('user_id'…)` clause silently leaks all tenants. Mitigation: migrate 8 routes ([§12 table](#12--security--privacy-model)) + ESLint custom rule blocking unfiltered `from()` on RLS tables. Trigger: any PR removing a `.eq('user_id'…)` line — block until refactored.
12. **WEB-01 — SSRF via `image_url` forwarded to provider.** Risk: a user-submitted `image_url` flows to Anthropic / OpenAI without egress validation; attacker submits `http://169.254.169.254/latest/meta-data/iam/...`. Blast: cloud-credentials leak. Mitigation: call `validateEgressUrl()` before forwarding; block non-HTTPS + RFC 1918 + link-local; extend `providerBaseUrlEnvMap` past the current 5-provider allowlist. Trigger: any P1 ticket on provider proxy.
13. **2,409 `unwrap()/expect()` in CLI / Desktop Rust** (per audit). Risk: silent panics on unexpected upstream behavior. Blast: user-visible crash. Mitigation: structured-error refactor — convert hot-path `unwrap`s to `?` with context. Trigger: any panic ticket from a paying user.
14. **TLS pinning absent in Mobile.** Risk: MITM on unsecured Wi-Fi. Blast: token / API-key exposure. Mitigation: ops-gated; add network pinning post-launch. Trigger: any reported credential leak — escalate to immediate ship.
15. **Native messaging host manifest absent.** `apps/extension/native-host/` ships only the `.template`. Chrome extension declares `nativeMessaging` permission. Without installable manifest the native bridge silently fails. Blast: dead feature path. Mitigation: ship `install.sh` OR drop the permission until the host binary exists. Trigger: any Chrome user reporting "bridge unavailable".

**V4 ADDITIONS — Research-pack severity-5 risks (from `tasks/research/_risk_register.csv` R-001 through R-018; top 5 mirrored here):**

16. **Token COGS blowout on managed-cloud tiers** (research R-003, severity 5). Risk: Hobby $10/mo unit economics collapse if cache-hit rate stays <30 % or output-token budget is uncapped. Blast: every paid user is a loss. Mitigation: 7 pricing guardrails in [§16 Token COGS budget](#16--pricing--billing-model); model-substitution table; per-user-per-tier-per-provider stop-loss; cache-hit KPI dashboard; abuse detection; output-token caps by tier. Trigger: any tier's blended COGS exceeds 35 % of revenue in a 7-day window OR cache-hit rate <30 % for 14 consecutive days.

17. **Prompt / output / API-key telemetry leak** (research R-011, severity 5). Risk: future Sentry exception, PostHog event, or OTel trace accidentally captures raw prompt or response content. Blast: privacy promise broken; loss of trust; potential GDPR Art. 32 / CCPA breach. Mitigation: telemetry-off-by-default; [§10 lock #20](#10--anti-pattern-locks); CI redaction tests; Sentry `beforeSend` >40-char string strip; PostHog `mask_all_text` on AI surfaces; OTel attribute filter; no session replay on AI screens. Trigger: any leak found in production logs.

18. **MCP server / tool-call exploit** (research R-009 + R-015, severity 5). Risk: third-party MCP server returns malicious payload that triggers unintended action; tool-call injection via prompt; agentic loop with elevated permissions. Blast: data exfiltration, account compromise, cross-user impact. Mitigation: vetted MCP server registry default; scoped permissions per tool; sandboxed execution; OAuth for tool authorization; human confirmation required for destructive actions; full audit-log of every tool invocation; Prompt Guard 86M classifier on tool routes ([S026](https://huggingface.co/meta-llama/Prompt-Guard-86M)). Trigger: any MCP server in registry flagged for malicious payload; any tool route 5xx-rate anomaly.

19. **Provider TOS breach from API-resale framing** (research R-002, severity 5). Risk: marketing copy, sales script, or product UI implies AGI resells provider capacity (e.g., "Claude included," "unlimited Claude," "Anthropic-powered tier"). Blast: provider revokes API access; product breaks for all managed-cloud users. Mitigation: [§10 lock #19](#10--anti-pattern-locks); ESLint rule scans marketing copy + onboarding strings; commercial-agreement triggers at $5K/mo per-provider OR enterprise customer OR >10K monthly active routed users; legal review of every public-facing page. Trigger: provider TOS update; provider abuse-team contact.

20. **Apple App Store payment-steering rejection** (research R-001, severity 5). Risk: iOS app attempts global external-purchase routing where storefront + entitlement rules don't permit; Apple rejects. Blast: Mobile launch blocked → entire product roadmap slips because Mobile is the lead surface. Mitigation: StoreKit IAP global default ([§10 lock #21](#10--anti-pattern-locks)); external link gated by storefront detection + entitlement state; Apple Small Business Program enrollment (15 % rate); App Review notes describe storefront-aware purchase flow; legal review of any "Subscribe on web" CTA. Trigger: any App Review rejection citing payment steering or 3.1.x → file Apple Developer support ticket within 24 h.

**V5 ADDITIONS — Web-verified 2026-05-17 (locked, full-authority):**

21. **DeepSeek V4-Pro promo cliff 2026-05-31 15:59 UTC** (severity 3, V5 R-021). Risk: post-cliff prices revert 4× from $0.435/$0.87 to $1.74/$3.48 per 1M tokens ([DeepSeek API docs](https://api-docs.deepseek.com/quick_start/pricing) verbatim: _"deepseek-v4-pro is currently offered at a 75% discount, extended until 2026/05/31 15:59 UTC"_). Blast: if V4-Pro is anywhere in the production route, blended COGS spikes overnight and the Hobby $10/mo tier breaks-even line moves. Mitigation: `packages/routing/src/three-tier-router.ts` auto-reroute past `promo_expires_at` to V4-Flash ($0.14/$0.28) or Claude Sonnet 4.6 ($3/$15) unless workload-specific quality requires V4-Pro. Trigger: any user-tier blended margin <60 % on the day post-2026-05-31 → escalate to founder + halt V4-Pro routing.

22. **Apple Guideline 2.5.2 enforcement against any in-app code execution** (severity 4, V5 R-022). Risk: AGI's roadmap includes CLI + code-related surfaces. Any code-execution UX shipped on the iOS app risks the Replit/Anything-style update-block or removal. Verified pattern: Apple update-blocked Replit + Vibecode on 2026-03-18 and pulled Anything from the store entirely on 2026-03-30; Anything returned 2026-04-03 only after agreeing to (a) open generated apps in external browser, not in-app web view, and (b) remove the ability to generate software specifically for Apple devices ([MacRumors](https://www.macrumors.com/2026/03/30/apple-pulls-vibe-coding-app/)). Mitigation: mobile v1 scoped to chat + workflow + remote-controller surface only ([§10 lock #25](#10--anti-pattern-locks)); revisit after WWDC 2026 (June 8-12, 2026) for any new entitlement announcements. Trigger: any review-team contact citing 2.5.2 → file Apple Developer support ticket within 24 h and pause feature flag.

23. **Chinese-HQ provider routing in EU + US-state ADMT contexts** (severity 3, V5 R-023). Risk: routing user data to DeepSeek, Kimi/Moonshot, Qwen, or Zhipu without per-provider Apple 5.1.2(i) consent ("including with third-party AI" — verbatim Apple guideline) and EU AI Act Article 50(1) disclosure is a dual-jurisdiction non-starter. Compounded by Zhipu's three 2026 price-raises in volatile commercial posture. Mitigation: lock consent modal to enumerate every named third-party AI provider in route; default-off for Chinese-HQ providers, user must opt-in explicitly per provider; route metadata flag `cn_hq: true` triggers an additional consent affordance. Trigger: any EU user report of unexpected Chinese-HQ provider routing → emergency feature flag + apology email.

---

## §18 — Success metrics & escalation triggers

**Week 1–2 (Aug 1 → Aug 14, 2026):**

- ≥1,000 BYOK / Local installs across six surfaces.
- ≥40 % of installs reach `first_message_sent`.
- ≥3 acquisition sources contributing ≥10 % each.
- ≥50 waitlist conversions on Hobby ($10/mo) — `upgrade_clicked` → checkout-completed.
- Five-event funnel instrumented; dashboards green.

**Month 1 (by Sep 1):**

- ≥5K BYOK / Local installs (cumulative).
- ≥10 % BYOK → Hobby conversion within 30 days of first install.
- ≥90 % crash-free sessions per surface.
- $1K MRR floor — if below, message problem, not feature.

**Month 3 (by Oct 31):**

- ≥10K installs across surfaces.
- Net Revenue Retention ≥ 100 % among paid cohort.
- MAU/DAU ≥ 25 % on Desktop.
- $2K MRR — escalation floor.

**Kill / pivot triggers per wave:**

- **W6 (Aug 1 graduation):** if Stripe webhook idempotency fails any replay test → delay flip 7 days. If 5 P0 audit items not closed → delay 14 days. If Apple consent modal rejected by App Review → resubmit with revised copy within 5 business days.
- **W7 (post-launch):** if BYOK → Hobby < 5 % at day 30 → revisit Hobby pricing (consider $5).
- **W8 (Q4):** if MRR < $2K → honest pivot assessment per `docs/launch/wave-3-playbook.md`.

---

## §19 — Wave alignment & engineering effort

| Wave                                             | Dates                   | Aggregate effort                    | Surfaces touched        | Status                                                                      |
| ------------------------------------------------ | ----------------------- | ----------------------------------- | ----------------------- | --------------------------------------------------------------------------- |
| **W0** (cleanup)                                 | 2026-05-03              | XL (−1.04M LOC)                     | All                     | ✅ shipped                                                                  |
| **W1** (CLI v1)                                  | 2026-05-03              | L                                   | CLI                     | ✅ shipped — 5 platform binaries via Homebrew + install.sh + GitHub Release |
| **W2** (Desktop v1 prep)                         | Weeks 2–5               | XL                                  | Desktop                 | 🔄 in progress                                                              |
| **W3** (Mobile + extensions + Hobby)             | Weeks 6–9               | XL                                  | Mobile, Chrome, VS Code | 🔄 in progress                                                              |
| **W4**                                           | 2026-05-08              | L                                   | Desktop, Web            | ✅ shipped                                                                  |
| **W5** (foundation)                              | 2026-05-13              | L                                   | All                     | ✅ shipped — tag `v0.7.0-foundation`                                        |
| **W4+5 v3 UI**                                   | 2026-05-16              | L                                   | All 6                   | ✅ shipped — PR #366 (38 commits / +19,659 LOC)                             |
| **W6 (finalize)**                                | 2026-05-17 → 2026-08-01 | **L–XL aggregate (~5–7 dev-weeks)** | All 6                   | 🚧 in flight                                                                |
| **Mobile M0 — spike**                            | 2026-05-17 → 2026-05-23 | XS (8-12 hours)                     | Mobile                  | 🚧 in flight (see [`PRD-MOBILE.md`](PRD-MOBILE.md) §18)                     |
| **Mobile M1 — Local hidden alpha**               | 2026-05-24 → 2026-06-21 | L (~80 hours)                       | Mobile                  | 🚧 in flight                                                                |
| **Mobile M2 — Cloud + TestFlight beta**          | 2026-06-22 → 2026-07-19 | L (~80 hours)                       | Mobile                  | 🚧 in flight                                                                |
| **Mobile M3 — App Store + Play public launch**   | 2026-07-20 → 2026-08-16 | L (~60 hours)                       | Mobile                  | 🚧 in flight                                                                |
| **W7** (post-launch polish + remaining surfaces) | Aug+                    | L                                   | All 6                   | 📝 planned                                                                  |

**Mobile is the lead surface.** Wave 6 platform work continues in parallel (Web paid-tier flip, Stripe API upgrade, Pro Max wiring, service-role migration, legacy-migrations deletion), but the cadence and gating decisions are anchored to Mobile M0-M3 milestones. Wave 6 platform work that is _not_ on the mobile critical path becomes Wave 7 if it slips. The Mobile critical path lives in [`PRD-MOBILE.md`](PRD-MOBILE.md) §18; the Wave 6 platform critical path follows.

**Wave 6 platform critical path (25 deliverables — replaces V2's 22 with the new corrections):**

| #   | Deliverable                                                                                                                              | Effort | Hard date      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------- |
| 1   | `BillingPlanTier` add `'pro_max'` + `BILLING_PLAN_PRICING.pro_max` ($99/$999)                                                            | XS     | 2026-06-15     |
| 2   | `STRIPE_PRICE_PRO_MAX_{MONTHLY,YEARLY}` env contract + Stripe product create                                                             | S      | 2026-06-15     |
| 3   | `TIER_POLICIES.pro_max` block in `model-catalog.ts`                                                                                      | XS     | 2026-06-15     |
| 4   | `WaitlistSignup` component + `waitlist_signups` Supabase table                                                                           | XS     | 2026-06-01     |
| 5   | Pricing CTA flip "Subscribe" → "Join Waitlist"                                                                                           | XS     | 2026-06-01     |
| 6   | 5-chip trust row on `/pricing`                                                                                                           | XS     | 2026-06-15     |
| 7   | Routing-WHY badge (explains which provider answered)                                                                                     | S      | 2026-06-30     |
| 8   | BYOK polish — per-provider quotas + auto-fallback + spend tracking + key rotation                                                        | M      | 2026-07-15     |
| 9   | Memory import / export protocol                                                                                                          | M      | 2026-07-15     |
| 10  | Multi-model side-by-side (2-col Pro+, 4-col Pro Max)                                                                                     | M      | 2026-07-15     |
| 11  | Aug 1 countdown banner                                                                                                                   | XS     | 2026-07-01     |
| 12  | Voice privacy lock                                                                                                                       | S      | 2026-06-30     |
| 13  | Chrome ext finalize                                                                                                                      | S      | 2026-07-15     |
| 14  | VS Code ext finalize                                                                                                                     | S      | 2026-07-15     |
| 15  | **Desktop Dispatch outbound signer** (hard deadline 2026-06-05)                                                                          | S      | **2026-06-05** |
| 16  | Apple 5.1.2(i) consent modal in Mobile onboarding                                                                                        | S      | 2026-06-15     |
| 17  | Stripe API version `clover` → `dahlia` upgrade                                                                                           | XS     | 2026-06-15     |
| 18  | Move CommandPalette / SearchModal / KeyboardShortcutsOverlay / ToolLabel out of `UnifiedAgenticChat/` → relocate, then delete legacy dir | S      | 2026-06-30     |
| 19  | Web hardcoded model-ID fallback removal (5 files)                                                                                        | S      | 2026-06-15     |
| 20  | Service-role-key migration of 8 routes to `getUserClient(jwt)`                                                                           | M      | 2026-06-30     |
| 21  | Legacy `apps/web/supabase/migrations/` reconciliation + deletion runbook                                                                 | S      | 2026-07-15     |
| 22  | CLI sandbox hard-refuse on Windows/Linux-no-bwrap (no silent fallthrough)                                                                | XS     | 2026-06-15     |
| 23  | Doc updates: `AGI_WORKFORCE.md` + `CLAUDE.md` Next.js 14 → 16; counts refresh; line 57 fix                                               | XS     | 2026-05-18     |
| 24  | Native messaging host install script                                                                                                     | S      | 2026-07-15     |
| 25  | OWASP LLM v2.0 reference in security docs                                                                                                | XS     | 2026-06-15     |

**Founder time budget:** ~10–15 productive dev-days/week (per `docs/launch/wave-3-playbook.md`). Wave 6 aggregate ≈ 5–7 dev-weeks → fits inside the 11-week window from 2026-05-17 to 2026-08-01 with slack for customer interviews (12–15 target), 60-second demo, Product Hunt scheduling, HN draft.

---

## §20 — Locked decisions (resolves V2 §20 open questions)

V2 had this section as "Open questions for founder." V3 closes them autonomously.

| #      | Decision                                                                                                                                                                                                                                                                                                                                                                                                                            | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | **`Plugins` + `Connectors` both kept**                                                                                                                                                                                                                                                                                                                                                                                              | Connectors = data integrations (Gmail, Drive). Plugins = code-runnable skills (MCP). Both terms ship. Internal `marketplace.rs` stays; doc adds the split.                                                                                                                                                                                                                                                                                                             |
| 2      | **Apple 5.1.2(i)** modal with explicit consent. Copy in [Appendix B §B.7](PRD-APPENDIX-B-API-CONTRACTS.md). Legal counsel reviews before iOS submission.                                                                                                                                                                                                                                                                            | Privacy-policy link alone is insufficient per Nov 2025 guideline update.                                                                                                                                                                                                                                                                                                                                                                                               |
| 3      | **Enterprise SSO IdPs at GA** = Okta + Azure AD + Google Workspace. OneLogin + Auth0 by request.                                                                                                                                                                                                                                                                                                                                    | Top three cover 80 %+ of enterprise demand. SCIM directory sync W7.                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4      | **V1-only locks from prior PRD draft (`~/.claude/.../memory/agi-prd-v1-*.md`)** absorbed where material; no further import required. PRD V3 is canonical.                                                                                                                                                                                                                                                                           | Local Claude Code cache is private. Anything material is now in repo.                                                                                                                                                                                                                                                                                                                                                                                                  |
| 5      | **PR creation policy:** push to `claude/refine-local-plan-FX7Er` only; no auto-PR per `CLAUDE.md`. Founder opens PR when ready.                                                                                                                                                                                                                                                                                                     | Repo convention.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 6      | **Brand mark A / B / C:** PRD locks the **policy** (founder picks visual; teal `#21808d` + terracotta `#da7756` color palette locked). Founder picks before Aug 1.                                                                                                                                                                                                                                                                  | A visual choice cannot be made autonomously without seeing the marks rendered.                                                                                                                                                                                                                                                                                                                                                                                         |
| 7      | **Pro Max anchor at $99** kept. Sits between Pro+ ($49.99) and Max ($299.99) to capture the "more than Pro+ but not $300" segment.                                                                                                                                                                                                                                                                                                  | Anchor pricing fills the 6× gap between Pro+ and Max. If telemetry from BYOK ramp shows weak demand at $99 by 2026-08-15, fold into Pro+ at higher cap.                                                                                                                                                                                                                                                                                                                |
| 8      | **Video V3 budget** (Veo 3.1 Lite Pro+ / Veo 3.1 Fast Max) supersedes V2 "Max only" lock.                                                                                                                                                                                                                                                                                                                                           | V2 was based on $0.75/sec mis-quote; verified $0.05/sec Lite makes Pro+ economical at 6 % of ARPU.                                                                                                                                                                                                                                                                                                                                                                     |
| 9      | **pnpm 9 → 11 upgrade deferred to W7.**                                                                                                                                                                                                                                                                                                                                                                                             | pnpm 11 requires Node 22 + pure ESM + supply-chain defaults; too risky for Aug 1 launch.                                                                                                                                                                                                                                                                                                                                                                               |
| 10     | **Rust toolchain 1.94 → 1.95 immediate; 1.96 (May 28, 2026) plan for W6 close.**                                                                                                                                                                                                                                                                                                                                                    | Rust patch upgrades are low-risk; 1.96 lands during W6.                                                                                                                                                                                                                                                                                                                                                                                                                |
| 11     | **Mobile is the first implementation.** Canonical spec at [`docs/PRD-MOBILE.md`](PRD-MOBILE.md). M0 spike May 17-23; M1 Local hidden alpha through Jun 21; M2 TestFlight beta through Jul 19; M3 public App Store + Play launch through Aug 16. Web/Desktop/extensions follow mobile. Mobile stays on Expo + native modules — no Swift/Kotlin rewrite v1. Cactus and RunAnywhere SDKs excluded for license + telemetry reasons.     | The hardest gate (Apple App Review for downloadable local AI with BYOK Cloud) is best discovered now, not after building three other surfaces. Mobile's distribution channel (App Store + Play) gives free acquisition that Web doesn't. The "AI on a plane" demo is the most viral artifact we'll ever have, and it's mobile-native by definition.                                                                                                                    |
| 12     | **`@agiworkforce/llm-normalize` is the canonical app-level contract** (validated by research §03). Raw vendor SDKs feed provider-specific adapters behind it; Vercel AI SDK is used for web streaming/UI only; LiteLLM / Vercel AI Gateway / OpenRouter / Portkey are optional pluggable routes. NO single gateway owns all traffic.                                                                                                | Provider semantics (caching directives, tool schemas, structured-output, files, grounding, safety policies, model aliases, commercial terms) are not converging at the edges that matter. An owned contract preserves BYOK / local / managed semantics; gateways reduce switching friction but cannot launder TOS or model removal.                                                                                                                                    |
| 13     | **Caching is NOT a single API.** `@agiworkforce/llm-normalize` exposes `CacheIntent` (intent) + `CacheObservation` (telemetry); provider-specific adapters translate to Anthropic `cache_control` / OpenAI auto + `prompt_cache_key` / Gemini cached-content resources. See [Appendix D](PRD-APPENDIX-D-SCALING-OBSERVABILITY-COMPLIANCE.md).                                                                                       | Anthropic explicit TTL-priced cache writes/reads ([S004](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)). OpenAI automatic ≥1,024 token threshold ([S007](https://platform.openai.com/docs/guides/prompt-caching)). Gemini has TTL **storage-cost billing dimension** ([S010](https://ai.google.dev/gemini-api/docs/caching)) — careless long TTL creates hidden cost line. Universal API would mask these differences and break unit economics. |
| 14     | **Managed-cloud is AGI customer application access, not API resale.** Flow down provider AUP. Commercial-agreement triggers at $5K/mo per-provider OR enterprise customer onboarding OR >10K monthly active routed users.                                                                                                                                                                                                           | Anthropic, OpenAI, Google terms all contemplate customer applications but restrict resale. AGI must never market as reseller. Lock prevents accidental TOS breach.                                                                                                                                                                                                                                                                                                     |
| 15     | **StoreKit IAP is the default mobile purchase path globally.** US storefront allows external links without entitlement; EU requires StoreKit External Purchase Link Entitlement (7-20 % combined fees). Apple Small Business Program qualifies AGI for 15 % IAP rate ([SBP](https://developer.apple.com/app-store/small-business-program/)).                                                                                        | V3 PRD claimed "global subscribe-on-web" was safe; research disproved this for global storefronts. SBP-15 % vs external-purchase-EU-7-20 % means StoreKit is competitive.                                                                                                                                                                                                                                                                                              |
| 16     | **On-device safety v1 = UX + report flow + injection guard. Heavy output classifier deferred to v1.1 pending mobile benchmarks.**                                                                                                                                                                                                                                                                                                   | Granite Guardian 2B too heavy for every mobile generation; Prompt Guard 86M/22M plausible for tool-route injection classification only. Store-policy obligations (reporting, safety UX) ship at launch; classifier ships after device benchmarks prove latency/accuracy ([S025](https://huggingface.co/ibm-granite/granite-guardian-3.1-2b), [S026](https://huggingface.co/meta-llama/Prompt-Guard-86M)).                                                              |
| **17** | **Mobile-first is FIRST-IN-TIME, not ONLY-IN-SCOPE.** Mobile leads the App Store / Play submission cycle because Apple Review is the hardest gate; **Web parity ships the same week** as mobile public launch; **Desktop reaches W6 build-target stability BEFORE mobile launches** because the Claude Code Remote Control + Codex Mobile patterns prove the consumer surface is a controller of a desktop session, not standalone. | V6 sweep evidence: Cursor's $2B ARR multi-surface strategy + Claude Code's $2.5B run-rate + Codex Mobile (May 2026) all converge on persistent cross-surface state as the retention moat. A mobile-only wrapper-style launch is the weakest competitive shape.                                                                                                                                                                                                         |
| **18** | **Three-tier route is the canonical default in `models.json`** — Local (Apple Foundation Models / executorch) → cache-aggressive (DeepSeek V4-Flash with 98 % cache discount or Kimi K2.6 with auto-cache) → frontier (Claude Sonnet 4.6 / GPT-5.4 / Gemini 3.1 Pro).                                                                                                                                                               | DeepSeek V4-Flash at $0.0028/M cached vs Claude Sonnet at $3/M = 1,070× cost gap on the cache-hot path. The middle tier exists explicitly to bend the Token COGS curve before frontier escalation. Default-off for Chinese-HQ providers until user opt-in.                                                                                                                                                                                                             |
| **19** | **Cache-discount magnitude raised from V4's implicit 50 % to verified 90 %.** Hit-RATE targets unchanged (≥30 % / ≥50 %).                                                                                                                                                                                                                                                                                                           | OpenAI auto-cache ≥1,024 tokens → 90 % off ([S-OpenAI](https://platform.openai.com/docs/guides/prompt-caching)). Anthropic cache reads at 0.1× base input → 90 % off ([S-Anthropic](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching)). DeepSeek V4-Flash cache hit at $0.0028/M vs $0.14 cache-miss → 98 % off. V4's 50 % assumption understated real-provider savings; correct baseline is 0.10× multiplier on cached tokens.                     |
| **20** | **Every model in `models.json` carries `deprecation_date` field + alias-aware indirection.**                                                                                                                                                                                                                                                                                                                                        | V5 reality check: **Kimi K2 family discontinues 2026-05-25** (7 days) → must pin `kimi-k2.6` immediately. **DeepSeek V4-Pro promo expires 2026-05-31 15:59 UTC** → auto-reroute logic before that date. **Anthropic Opus 4.7 tokenizer drift** (released 2026-04-16) shifts effective cost-per-request +0-35 % even at unchanged $5/$25 per-token price → all migration testing re-baselines.                                                                          |
| **21** | **Mobile v1 = chat + workflow + remote-controller surface only — NO in-app code-execution UX.** Revisit only post-WWDC 2026 (June 8-12, 2026) if Apple ships a sanctioned code-execution entitlement.                                                                                                                                                                                                                               | Verified Apple Guideline 2.5.2 enforcement record: Replit + Vibecode update-blocked 2026-03-18; Anything pulled 2026-03-30 then returned 2026-04-03 only after sandbox changes (external browser preview, no Apple-device-targeted code generation). The mobile surface is a controller of desktop / CLI / web — that's where code execution lives.                                                                                                                    |

---

## §21 — PRD lifecycle & governance

**Source of truth.** This file (`docs/PRD.md`) is canonical. Prior drafts in Claude Code local cache (`~/.claude/projects/.../memory/agi-prd-v*.md`) are private and not authoritative. Prior repo PRD V2 dated 2026-05-17 is superseded by this V3 file.

**Amendment process:**

1. Open a PR against `docs/PRD.md` with a §-level note in the PR body identifying the affected section(s).
2. If the change updates a LOCKED item, the PR must cite the upstream decision (memory file, ADR, chat transcript link, or founder sign-off comment).
3. Conventional Commits: `docs(prd): …`. Lowercase, ≤100 chars, `Co-Authored-By:` footer (commitlint enforced).
4. Surface-specific PRDs (mobile, vscode, chrome ext) land as separate `docs/PRD-<surface>.md` files cross-linked from this PRD's footer.

**Supersedence.** When this PRD V3 supersedes a prior decision, the prior decision moves to `docs/archive/` with a one-line note pointing at the new section. Active ADRs in `docs/decisions/` are not superseded automatically — they remain in force unless explicitly noted here.

**Review cadence.** Quarterly. Next review: 2026-08-15 (two weeks after Aug-1 graduation), with telemetry from the first 14 days in hand.

---

## §22 — Appendix index

- **[`PRD-MOBILE.md`](PRD-MOBILE.md)** — **canonical mobile-app PRD; first-implementation product.** Self-contained build spec for the AGI mobile app on iOS App Store + Google Play. Public launch target: late July to mid-August 2026. Inherits all platform appendix definitions; supersedes the platform PRD's mobile column on mobile-specific concerns.
- **[Appendix A — Data models](PRD-APPENDIX-A-DATA-MODELS.md)** — Supabase tables, RLS policies, indexes; SQLite Local-mode schema; dispatch / stripe / waitlist tables; SLOT_REGISTRY + TIER_POLICIES extraction; legacy-supabase deletion runbook.
- **[Appendix B — API contracts](PRD-APPENDIX-B-API-CONTRACTS.md)** — Every shipping web endpoint with verb, path, auth class, request schema, response schema, error codes, rate-limit bucket. Tauri command surface (1,488 commands grouped). Mobile Dispatch HMAC v2 envelope. Apple 5.1.2(i) consent-modal copy.
- **[Appendix C — Monorepo layout](PRD-APPENDIX-C-MONOREPO-LAYOUT.md)** — Repo tree to depth 3, ownership boundaries, build commands per surface, env-var contract per surface, CI workflow contracts, version pins for May 2026.
- **[Appendix D — Scaling, observability, compliance](PRD-APPENDIX-D-SCALING-OBSERVABILITY-COMPLIANCE.md)** — V4 NEW. Cost projections at 10K/100K/1M MAU; cross-surface state-sync object taxonomy (LWW / event-log / CRDT); observability stack + consent state machine; GDPR/CCPA/state privacy launch checklist; EU AI Act 2026-08-02 compliance gate; OWASP LLM Top 10 v2.0 mapping; quarterly architecture-review cadence; model-registry pricing-change watch.
- **[Resolutions and audit](PRD-RESOLUTIONS-AND-AUDIT.md)** — 32-row audit table of every error / conflict / gap found in repo (with severity + fix). Document audit: 4 Delete / 17 Update / 131 Retain. **V4 adds:** research-pack integration log (8 V3→V4 deltas).

**Research artifacts (V4 INPUTS):**

- [`tasks/research/00-MASTER-SYNTHESIS.md`](../tasks/research/00-MASTER-SYNTHESIS.md) — 3,906-word executive synthesis, 48 cited primary sources (S001-S048), 10-row stack-lock table, top-5 severity-5 risks, 20 takeaways
- [`tasks/research/07-cross-cutting.md`](../tasks/research/07-cross-cutting.md) — Q1-Q15 recommendations
- [`tasks/research/_evidence.csv`](../tasks/research/_evidence.csv) — 83 evidence rows
- [`tasks/research/_risk_register.csv`](../tasks/research/_risk_register.csv) — 18 NIST AI RMF-aligned risks
- [`tasks/research/_search_log.csv`](../tasks/research/_search_log.csv) — 16 PRISMA-style search log rows

---

_End of PRD V4. Generated 2026-05-17 against repo HEAD by Principal Architect with autonomous decision authority. V4 integrates research-pack findings from `tasks/research/` (48 primary sources, 18-row NIST AI RMF risk register, 83-row evidence matrix). V3 ancestor preserved git-history. 22 parallel teammate reconnaissance reports (V2 era) + 3 specialized PRD-V3 research teammates + 1 four-pass deep-research run (V4) + direct ground-truth reads. Effort sizing calibrated against `docs/launch/wave-3-playbook.md` cadence. Verbatim persona quotes synthesized from `docs/BILLION_DOLLAR_PLAYBOOK.md` competitor-research signals and Reddit / OpenRouter complaint corpora documented in `docs/research/v1-product-validation.md`._
