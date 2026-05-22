# AGI — a16z Speedrun pitch deck v2 — design prompt

**Author:** founder · **Date:** 2026-05-17 · **Target:** Claude Design agent · **Replaces:** `~/Downloads/AGI Workforce Pitch Deck.html` (outdated; rename → `v1`, do not overwrite).

---

## Mission

Build a 12-slide seed pitch deck for AGI, targeting a16z Speedrun application + 2-minute Progress Day pitch. The deck doubles as a standalone written submission for non-Speedrun seed VCs.

Preserve the existing file's HTML+React+Babel implementation pattern (`slides.jsx` + `deck-stage.js` + `tweaks-panel.jsx`). This historical prompt used the former PRD V4 as ground truth; current pitch work should start from `docs/current/product-suite.md` and `docs/current/commercial-and-launch.md`.

---

## What changed since the old deck — discard

| Old (discard)                       | New (use)                                                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand: "AGI Workforce"              | Brand: **AGI** (locked 2026-05-15; repo path stays `agiworkforce`)                                                                            |
| Hobby $5/mo                         | Hobby **$10/mo** (`packages/types/src/billing-catalog.ts` SSOT)                                                                               |
| "4 brands plugged in"               | **10+ providers** (Anthropic, OpenAI, Google, xAI, DeepSeek, Mistral, Perplexity, Moonshot, Zhipu, Qwen, plus Ollama/LMStudio local + custom) |
| "Mobile in store review"            | **Mobile launches 2026-08-06.** M0 spike running this week (May 17-23) → M1 alpha → Jun 21 → M2 TestFlight → Jul 19 → M3 public → Aug 6-16    |
| "Trillion-dollar net worth mission" | **Drop entirely.** a16z reads main-character syndrome as a red flag                                                                           |
| "1,500 features / 4,500 tests"      | Use only V4-PRD-verifiable: 1,488 Tauri backend commands, ~200 Rust files, ~155K LOC of terminal UI, 6 surfaces shipping                      |
| "$5M of working software" appraisal | Drop. Unverifiable appraisals are credibility cost                                                                                            |
| Pre-seed framing                    | **Seed** (Speedrun's standard check size, $1M post-money note typical)                                                                        |

---

## Ground-truth sources (read before writing slide copy)

- `docs/current/product-suite.md` — current product thesis, surfaces, trust modes, and sync boundary
- `docs/current/commercial-and-launch.md` — current commercial, waitlist, and managed-compute posture
- `docs/archive/2026-05-21-docs-consolidation/PRD.md` — archived historical PRD source material
- `docs/archive/2026-05-21-docs-consolidation/PRD-MOBILE.md` — archived historical mobile PRD source material
- `tasks/research/00-MASTER-SYNTHESIS.md` + V6 sweep deltas (Kimi K2.6, DeepSeek V4-Flash, Apple Foundation Models, Apple 5.1.2(i), EU AI Act Aug 2 2026)
- `packages/types/src/billing-catalog.ts` — pricing SSOT
- Brand palette LOCKED: teal `#21808d` + terracotta `#da7756`

---

## The 12 slides

One idea per slide. ≤25 words of body copy per slide. "Visually boring" is good — clarity over decoration (per YC + a16z Speedrun explicit guidance).

### 1 — Title (inherit v1 terminal-cover aesthetic)

Founder explicitly likes the v1 cover. Preserve its shape:

- **Top-left chrome:** `agiworkforce :: 01 cover` system label + `01 / 12` page indicator in mint-green
- **Terminal pill:** `$ ./agi --pitch --seed` (the v1 used `./agiworkforce --pitch --pre-seed` — update to current brand)
- **Eyebrow:** `SEED · MAY 2026` in mint-green caps
- **Big headline (Inter Tight 600, ~7rem):** _"I shipped 1.5M+ lines of code. Solo. In nine months."_
  - Tactical update from v1: the "$5M+" mythologized claim becomes the **verifiable** "1.5M+ lines of code." Same emotional hit, diligence-proof. Speaker notes still allow the $5M valuation footnote with COCOMO II methodology (see `pitch-deck-verified-numbers-2026-05-17.md` §"$5M+ value of code claim").
  - Highlight `1.5M+` in mint-green; rest in warm off-white `#E8F0E5`.
- **Sub-headline:** _AGI — one chat, every model, every device._
- **Strapline (italic, muted):** _Beyond one model. Beyond one surface._ **AGI in your hands.** (last 4 words in mint-green)
- **Footer-left:** Siddhartha Nagula · Founder & CEO · AGI Automation LLC
- **Footer-right:** agiworkforce.com · seed · May 2026

### 5 — Why now (a16z Speedrun's non-negotiable)

### 2 — Insight (lead with the strongest claim — a16z says lead with what's impressive)

> Every prior consumer-tech cycle ended in aggregation: browser, music, video, ride-share. AI is next. We're building the aggregator.

Sub: _"Anthropic ships only Claude. OpenAI ships only GPT. Google ships only Gemini. We ship all of them — and your private model — on every device."_

### 3 — Problem

Three stacked pains, each one line:

1. **$100/mo for the same conversation.** Claude $20 + ChatGPT $20 + Gemini $20 + Perplexity $20 + Cursor $20.
2. **Zero offline access.** On a plane, in a tunnel, at a client site — every consumer AI dies.
3. **Privacy theater.** Every prompt feeds a vendor's training pool unless the user reads 14 pages of opt-out fine print.

### 4 — Solution

> **One app. Every model. Free or BYOK. Works offline.**

- 10+ providers in one chat — switch mid-conversation (Claude → GPT → local Llama)
- Local mode runs on the phone — Apple Foundation Models, Gemini Nano, or downloadable Llama 3.2
- BYOK: users pay providers directly; AGI takes $0
- 6 surfaces share one identity: iOS, Android, Web, Desktop, CLI, Chrome + VS Code extensions

### 5 — Why now (a16z Speedrun's non-negotiable)

Three timing forces converging in 2026:

1. **Model fragmentation peaked.** 10+ frontier providers in 18 months. Users want to compare, not commit.
2. **On-device LLM became production-viable.** Apple Foundation Models (iOS 26, GA June 2025) + Gemini Nano AICore + react-native-executorch (Llama 3.2 3B on iPhone 15 Pro). First-time-shippable private mobile AI.
3. **Compliance window opens.** Apple 5.1.2(i) (Nov 2025) penalizes undisclosed third-party AI; EU AI Act Article 50 (active 2026-08-02) requires disclosure on AI-generated content. Both **reward** a privacy-first product. We launch with the regulation, not against it.

### 6 — Product

Three screens side-by-side (use the actual reference screenshots at `~/Desktop/reference/ui/`):

- **Mobile:** chat thread with model picker pill (`Claude · GPT · Gemini · local`)
- **Desktop:** Cmd-K palette + active conversation view
- **CLI:** `agi exec` running locally with model badge

Caption: _"The same conversation, anywhere, with any model — including the one in your pocket that never phones home."_

### 7 — Market

Three numbers, each sourced in speaker notes:

- **700M+** ChatGPT weekly active users (OpenAI disclosure, 2025)
- **200M+** Claude users (Anthropic disclosure, 2025)
- **$200B+** AI infrastructure market by 2030 (Goldman / McKinsey consensus)

Wedge: AI power users paying for 2+ tools today + privacy-required professionals (lawyers, doctors, journalists) + off-grid users (pilots, sailors, frequent travelers). Conservative capture: 1% of cross-tool payers × $25 ARPU = **$150M ARR floor**.

### 8 — Business model

> **The Slack playbook for AI.**

- **Free forever** (BYOK + Local) — $0 infra cost per free user. No loss-leader.
- **Hobby $10/mo** — managed cloud on-ramp.
- **Pro $29.99 / Pro+ $49.99 / Pro Max $99 / Max $299.99** — escalating slots, frontier models, voice, agents.
- **Enterprise** — SSO + audit + dedicated routing. Contact sales.

15% effective Apple commission via Small Business Program (qualifies <$1M annual proceeds). 3% Stripe on web. **Net ARPU on Pro: ~$25.**

### 9 — Competition

Three competitor classes, each structurally unable to copy:

| Class                                          | Their lock-in                | Why they can't copy                                      |
| ---------------------------------------------- | ---------------------------- | -------------------------------------------------------- |
| **Frontier vendors** (Claude, ChatGPT, Gemini) | Locked to their own model    | Cannibalizes their per-seat subscription                 |
| **Aggregator APIs** (OpenRouter, Together)     | Developer API only           | No consumer UX, no mobile app, no on-device LLM          |
| **BYOK clients** (TypingMind, MindMac, BoltAI) | Desktop-only, single-surface | No mobile, no on-device LLM, no cross-surface continuity |

> **No competitor ships consumer × multi-provider × multi-surface × on-device LLM together.** That's the moat.

### 10 — Technical depth (inherit v1 slide-5 stat-grid aesthetic — founder explicitly likes this)

**Headline:** _"One founder. AI-orchestrated. In production today."_ (with "In production today." in mint-green)

**System label:** `agiworkforce :: 10 technical depth` · `10 / 12`

**Left two-thirds: 6-card grid** (3 cols × 2 rows, mint-green numbers, monospace ledger captions). All numbers verified by 16-auditor team `pitch-deck-numbers` (see `pitch-deck-verified-numbers-2026-05-17.md`):

```
1.5M+                 ~4,000               6
lines of code         commits              surfaces
production            in 6.5 months        iOS · Android · Web ·
TypeScript + Rust     1 founder            Desktop · CLI · ext

1,488                 4,200+               12+
Tauri commands        automated tests      AI providers
backend depth         across surfaces      Claude · GPT · Gemini ·
137 source files                           local · 9 more
```

**Right one-third: terminal pane** (dark panel `#0d1411`, mint-green strokes, JetBrains Mono):

```
$ tree packages/
├── @agiworkforce/unified-chat
├── @agiworkforce/api
├── @agiworkforce/types
├── @agiworkforce/llm-normalize
├── providers/anthropic
├── providers/openai
├── providers/google
├── providers/ollama
├── providers/xai
├── providers/deepseek
├── @agiworkforce/mcp
├── @agiworkforce/skills
├── @agiworkforce/browser-tool
└── @agiworkforce/apply-patch

$ cargo check --workspace
✓ GREEN  1.4s  19 crates

$ git log --oneline | wc -l
3988
```

**Source-trace footer (tiny, muted):** `verified 2026-05-17 · team pitch-deck-numbers · 16 auditors`

**What changed from v1's slide 5:** "150+ database upgrades" (overstated 3.5×) replaced with the verified 1,488 Tauri commands. "1,500+ product features wired" (unverifiable) replaced with the verified ~4,000 commits. "3,500+ changes" upgraded to 3,988 actual. "4,500+ tests" softened to 4,200+ (defensible floor). Every number on this slide is grep-traceable to HEAD.

### 11 — Team / Founder investment memo (a16z Speedrun says investors flip here FIRST)

> **Siddhartha Nagula** — Founder & CEO
> 6 years AI/ML engineering · MS Computer Science, UT Arlington · Solo build of 6-surface AGI in 9 months · Indian national, O-1A pathway in progress · Based Arlington TX, building SF.

**The wedge of being solo:** decision speed of one engineer who is also designer, PM, and operator. AGI shipped six surfaces and 1,488 backend commands in nine months — faster than most seed-funded teams cover one surface.

**Hiring next 12 months:** technical co-founder (Aug 2026), mobile engineer + growth lead (Q4 2026), founding designer (Q4 2026).

**Advisors sought:** consumer-AI distribution (App Store / Play ASO, growth loops) + provider commercial-team relationships at Anthropic / OpenAI / Google.

### 12 — Ask

> **Raising $X seed**, 18-month runway, target close [DATE].

- 40% **distribution** — App Store launch, ASO, dev relations, conferences, paid acquisition
- 30% **engineering** — mobile, on-device runtimes, MCP marketplace, SSO + enterprise
- 20% **compliance + legal** — EU AI Act Aug 2 gate, App Review consultations, IP strategy
- 10% **first 3 hires**

**Milestones:** Aug 6 2026 mobile launch · Month 6 $1M ARR floor · Month 12 100K MAU + Series A position.

Contact: ceo@agiagentautomation.com · agiworkforce.com

---

## Design constraints (LOCKED)

- **HTML deliverable** matching existing file shape — React via `@babel/standalone`, single self-contained file. Keep `slides.jsx` + `deck-stage.js` + `tweaks-panel.jsx` pattern; rewrite content.
- **Slide count: exactly 12.** No appendix, no bonus slides. Speedrun pitch is 2 minutes.
- **One idea per slide.** Body copy ≤25 words. Supporting items ≤5 per slide.
- **Visually boring** — big type, lots of negative space, charts legible at thumbnail size.
- **Palette:**
  - Canvas: `#0A0E0A` background, `#E8F0E5` text (matches existing).
  - Accents: teal `#21808d` (model-name highlights / CTA) + terracotta `#da7756` (numbers / data emphasis).
- **Type:** Inter Tight 300/400/500/600/700 (matches existing). JetBrains Mono for numeric and code.
- **No emojis.** No icon libraries beyond Lucide stroke-only at 1.75. No gradient text. No animation beyond fade-in.
- **Every numeric claim cites a source** in the speaker-notes JSON block (keep existing `<script type="application/json" id="speaker-notes">` pattern; expand to 12 entries, ≤120 words each, written in spoken-pitch register).

## Verified numbers pack (single source of truth)

Every numeric claim on this deck must trace to `docs/design/pitch-deck-verified-numbers-2026-05-17.md`. That doc was produced by 16 parallel auditors (`team pitch-deck-numbers`) on 2026-05-17 against repo HEAD. If a claim isn't in that pack, it doesn't ship on the deck.

## Reference decks (study before designing — these are the gold standard)

- **Airbnb 2009 seed** — 14 slides, $600K from Sequoia. Cleanest "problem → solution → market → traction → team → ask" template ever shipped.
- **Coinbase 2012 seed** — 12 slides, YC-stage. Minimal design, dense numbers, no decoration.
- **Brex 2018 Series B** — strong "why now" + competition framing under time pressure.
- **Sequoia canonical 10** — Purpose / Problem / Solution / Why Now / Market / Competition / Product / Business Model / Team / Financials.
- **a16z Speedrun guidance** (Substack, 2025): "Go as simple as possible. Don't use complicated lingo, don't use complicated charts. Cover: problem, solution, market, traction, team, why now. No fluff. No jargon. Just facts and clarity. **Investors flip to the founder memo first.**"
- **YC seed deck guidance**: "Visually stunning slides often hurt seed-stage pitches. Your slides should be visually boring with clear, large text emphasizing the key points."

## Output

Single self-contained HTML file at `~/Downloads/AGI Pitch Deck v2.html`. Do NOT overwrite v1 — rename v1 to `AGI Pitch Deck v1.html` first. Include:

1. The 12 slides as rendered components in `slides.jsx`.
2. The speaker-notes JSON block expanded to 12 entries.
3. The tweaks panel for live editing palette + spacing (matches existing pattern).
4. `<title>` of "AGI — Seed Pitch · May 2026".

Return only the file. No accompanying commentary.

## Quality bar

- A non-AI seed investor should be able to read all 12 slides in under 90 seconds and answer correctly: what does AGI do, who's it for, why now, what's the moat, what's the ask?
- Every claim is either traceable to V4 PRD or sourced in speaker notes.
- No slide depends on the next for context — each is self-contained.
- The deck reads identically in PDF export and live presentation mode (no animation-dependent content).

---

_End of brief. Author against V4 PRD HEAD 2026-05-17. Self-contained — anything not in this brief is out of scope. If a V4 PRD lock conflicts with anything here, defer to the PRD and flag inline as `lock-challenge`._
