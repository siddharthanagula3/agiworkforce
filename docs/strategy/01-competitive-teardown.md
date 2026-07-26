# Competitive Teardown — Claude & ChatGPT/Codex Application Suites

Status: Strategy analysis (not source-of-truth)
Owner: Founder
Last updated: 2026-06-27
Companion docs: `02-gap-analysis.md`, `05-gtm-pricing-business-model.md`

This is the anatomy of the two suites AGI is benchmarked against, as of June 2026. It answers the first half of the brief: _what features, runtimes, architecture, and operational machinery make these applications exist?_ Read it with `02-gap-analysis.md`, which maps each capability to AGI's actual code.

All competitor facts are web-sourced (June 2026) with the most load-bearing claims cited inline. Anything flagged **[unverified]** could not be confirmed against a primary source — do not repeat it in investor materials without checking.

---

## 1. The single most important strategic insight

Neither Anthropic nor OpenAI builds "seven apps." Each builds **one agent runtime and one model platform, then ships thin clients over it.**

- Anthropic's consumer surfaces run off **one account, one usage pool, one model set**. Claude Cowork (desktop knowledge-work agent) and the Claude Code IDE/CLI/cloud surfaces are the **same agentic engine** re-skinned for terminal, desktop GUI, browser, and IDE.
- OpenAI ships one account + the **Responses API as a stateful agent runtime** (built-in web search, file search, code interpreter, computer use, remote MCP, a shell tool, and a hosted container workspace), fronted by ~10 client surfaces.

The implication for AGI is the most consequential architectural fact in this entire analysis: **the surfaces are the cheap, replicable part. The defensible, expensive parts are (1) the model + routing + agent-runtime layer, (2) the permission/trust/safety system, and (3) the ecosystem standards (MCP, Skills).** AGI's monorepo already reflects this instinct — shared `packages/` and `crates/` with thin per-surface clients — which is the correct shape. The risk is spreading effort across six surfaces instead of hardening the one runtime they all depend on.

---

## 2. Claude application suite (Anthropic, June 2026)

### 2.1 The seven surfaces

| Surface                  | Runtime / stack                                                              | What it is                                                             | Most decision-relevant fact                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Desktop (mac/Win)**    | **Electron** (confirmed by Claude Code team on HN)                           | Chat + Cowork + Computer Use + the MCP/Connectors hub                  | The coding-agent company ships an Electron desktop app. This is AGI's clearest technical wedge: **Rust/Tauri is a genuine, defensible differentiator.** |
| **Web (claude.ai)**      | Framework **[unverified]** (React/Next inferred, not confirmed)              | Chat, Projects, Artifacts, Memory, Research, Connectors, voice         | 200K-token context across paid plans; Projects use RAG retrieval, not full-context stuffing.                                                            |
| **Mobile (iOS/Android)** | **Publicly unknown** — do not assert native vs. RN                           | Thin client + remote control for cloud Claude Code sessions            | Anthropic has _not_ disclosed its mobile stack. AGI's Expo/React Native choice is defensible and not a known disadvantage.                              |
| **Claude Code (CLI)**    | **TypeScript + Ink (React-for-CLI) + Yoga + Bun**, npm-distributed, Node 18+ | Agentic terminal coder; >$500M run-rate within 3 months of GA          | Design philosophy = "thinnest possible shell over the model"; the team _deletes_ code as models improve. ~90% written by Claude Code itself.            |
| **IDE integrations**     | VS Code ext + JetBrains plugin; both are **clients of Claude Code**          | In-editor chat, diffs, plan mode, checkpoints                          | When active, runs a local MCP server named `ide` bound to `127.0.0.1` with a fresh per-session token. Same extension installs into Cursor/forks.        |
| **Claude for Chrome**    | Chrome/Edge MV3 extension + native-messaging bridge to Claude Code           | Browser agent: navigates, clicks, fills forms, multi-tab workflows     | Shares your existing browser login state. **The prompt-injection arms race lives here** (ShadowPrompt, ClaudeBleed — continuous patching).              |
| **Claude Cowork**        | Ships inside Claude Desktop (Electron); GA April 9 2026                      | Agentic _non-coding_ knowledge work (decks, sheets, reports, file ops) | Reaches for **connectors first, browser second, computer-use last** — "most precise tool first." Scans model activations to detect prompt injection.    |

### 2.2 The shared platform

- **Model lineup (updated 2026-07-25):** Fable 5 (frontier, above Opus), Mythos 5 (gated cyber-defense sibling), Opus 5, Sonnet 5, and Haiku 4.5. AGI follows a latest-family-only picker policy and keeps older Opus/Sonnet releases out of the selectable roster.
- **API economics:** prompt caching (cache-hit = 0.1× input), Batch API (50% off input _and_ output), server-side tools (web search $10/1k searches, code execution 1,550 free container-hours/mo). 1M context at standard rates on the top models. New billing surfaces in 2026: Claude Consumption Units via AWS Marketplace, Managed Agents billed on tokens + **$0.08/session-hour**.
- **Consumer pricing:** Free $0; Pro $20 (includes Claude Code, Cowork, Design); Max 5x $100 / Max 20x $200; Team $25–$125/seat; Enterprise $20/seat + usage. Limits are now expressed as **relative multiples + two weekly caps**, not published token/hour numbers.
- **MCP (Model Context Protocol):** open-sourced Nov 2024, **donated to the Linux Foundation Dec 2025**. Official MCP Registry + Anthropic's own Connectors Directory ("over 200" official; third-party trackers claim 343–511 **[unverified]**). MCP "Apps" now render UI (charts/forms/dashboards) inline in chat.
- **Artifacts:** side-window runnable outputs with versioning, publish/share, persistent storage (20MB/artifact), and **AI-powered artifacts** — the single most novel distribution mechanic in the suite: viewers authenticate with _their own_ Claude account, usage counts against _their_ subscription, free to share at any scale, runs on Anthropic's infra.
- **Projects / Memory / Skills / Plugins:** per-project RAG knowledge + isolated memory; auto-synthesized memory refreshed every 24h; **Agent Skills** (`SKILL.md` + progressive disclosure) published as an **open cross-platform standard** (agentskills.io) deliberately adopted by competitors; plugins bundle skills + agents + hooks + commands + MCP/LSP and install from marketplaces.
- **Infra:** three-silicon strategy (AWS Trainium, Google TPU, NVIDIA GPU); >$100B / 10-year AWS commitment; Project Rainier >1M Trainium2 chips. Run-rate revenue surpassed $30B.

---

## 3. ChatGPT + Codex suite (OpenAI, June 2026)

### 3.1 Surfaces and the runtime split that matters

| Surface                     | Runtime / stack                                                                                                                    | Decision-relevant fact                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web (chatgpt.com)**       | **Remix / React Router v7 — NOT Next.js** (confirmed)                                                                              | OpenAI deliberately chose client-rendered + on-demand fetch over SSR-heavy Next. Free tier now shows ads ("Sponsored Tips").                             |
| **Desktop macOS**           | **Fully native** (not Electron, not Catalyst)                                                                                      | Native unlocks "Work with Apps" (reads/edits IDEs, Notes, terminals) and Record Mode (system-audio meeting capture).                                     |
| **Desktop Windows**         | **Electron** (~260MB)                                                                                                              | OpenAI eats the cost of _two_ desktop stacks; macOS leads on every premium feature.                                                                      |
| **Mobile iOS/Android**      | **Native SwiftUI + Jetpack Compose** (confirmed by OpenAI engineers); preview-first + snapshot testing                             | Rules out React Native for OpenAI's own apps. ~1.1B mobile MAU.                                                                                          |
| **Codex (dev suite)**       | **CLI rewritten in Rust** (`codex-rs`, native sandboxing); IDE ext; native desktop app; cloud VMs; Chrome ext; GitHub/Slack/Linear | >5M weekly active users; ~20% non-developers. `AGENTS.md` is the shared instruction format across all surfaces.                                          |
| **Custom GPTs + GPT Store** | No-code builder + OpenAPI Actions                                                                                                  | 3M+ GPTs; builder revenue US-only and opaque. Monetization energy has visibly shifted _away_ from the Store toward Apps-in-ChatGPT and Agentic Commerce. |

### 3.2 The shared platform

- **Models (mid-2026):** GPT-5.5 (flagship) + GPT-5.5 Pro; GPT-5.4 family (mini/nano); GPT-5.3-Codex; the new **GPT-5.6 "Sol/Terra/Luna"** scheme (number = generation, name = durable capability tier — OpenAI's escape from the point-release ladder). The o-series is effectively absorbed into GPT-5. A continuously-trained **auto-router** picks Instant vs. Thinking.
- **Responses API** = the flagship interface _and_ an agent runtime: stateful loop, built-in web_search / file_search / code_interpreter / image_generation / computer use / remote MCP, plus a 2026 shell tool, hosted container workspace, context compaction, and reusable "skills."
- **Apps & connectors:** Apps SDK built on MCP (interactive third-party apps, App Directory live); 12+ enterprise connectors with per-user-permission-respecting "Company knowledge" + write actions; Agentic Commerce (ACP) with Stripe ("Buy it in ChatGPT").
- **Cross-cutting:** Projects, Memory ("Dreaming" = background synthesis), Canvas, Scheduled Tasks, Advanced Voice (live camera + screen share), Deep Research, GPT Image 2 (native-reasoning image gen), Agent Mode (its own virtual computer).
- **Scale/infra:** ~900M weekly active users; ~$25B+ annualized revenue; confidential S-1 filed June 2026; multi-cloud GW-scale compute (Oracle/Stargate, Nvidia, AMD, AWS, CoreWeave) + its own Broadcom-built "Jalapeño" inference ASIC.

---

## 4. What it actually takes to make a suite like this exist

This is the bill of materials. The hard, expensive, non-negotiable parts are bolded.

**Model + inference layer (the moat and the cost center).** **Either own frontier models** (multi-billion-dollar training + multi-GW multi-vendor compute) **or rent via API and accept margin compression + dependence** — there is no cheap middle. Plus inference serving (low-latency + batch + caching tiers, autoscaling across accelerators), and a model-versioning discipline (pinned snapshot IDs, deprecation calendars, tokenizer-change handling, a single `models.json` source of truth read by every surface). _AGI rents — see `05` for what that does to the business model._

**Agent runtime — build once, reuse everywhere.** A "thin shell over the model" harness: tool-use/agent loop, filesystem + bash tools, **subagents with isolated context**, sessions/checkpoints, human-in-the-loop approvals. An **MCP client with tool-deferral** (load tools only when used). A **permission/policy system** (per-action allow/always/reject, static command analysis, tiered project/user/org settings) — Anthropic's engineers call this the most complex part. **Sandboxing** for autonomous runs (credentials kept outside the sandbox).

**The surfaces (comparatively cheap thin clients).** Desktop (Electron is the pragmatic incumbent choice; native unlocks OS integrations; **Tauri/Rust is AGI's wedge**), web SPA, mobile (native or cross-platform — an open design choice), CLI (Node/TS+Ink is proven; OpenAI proved Rust also works), IDE extensions (VS Code Marketplace + Open VSX + JetBrains; the `127.0.0.1` MCP `ide` server pattern), a browser extension with a native-messaging bridge.

**Sync + data backend.** Unified account + conversation-history sync; **one shared usage-accounting service**; Projects/RAG (vector retrieval); Memory (synthesis pipeline, per-scope isolation, edit/reset/export); Artifacts hosting (persistent storage, publishing, the viewer-pays auth routing); Skills/plugins distribution (a registry with safety screening + SHA pinning).

**Billing + metering.** Subscription tiers + relative-multiplier rate limiting + weekly caps + overage; API token metering with caching/batch discounts; consumption-unit and session-hour billing for agents; App Store / Play Store IAP handling.

**Trust & safety (the ongoing tax — do not underestimate).** A prompt-injection program: hardened system prompts, classifiers, activation-level injection detection, published red-team metrics, and a **continuous vulnerability-patching pipeline**. Category blocks, action confirmations, site/app permission models, incognito/no-train modes. _This becomes load-bearing the moment an agent touches a browser or the OS._

**Enterprise + compliance.** SSO/SCIM, audit logs, a Compliance API, OpenTelemetry/SIEM streaming, RBAC, spend limits, data residency, customer-managed keys, HIPAA-readiness, retention/deletion controls, managed deployment.

**Org functions / ongoing ops.** Model research/training (or provider management); inference/SRE/capacity; applied product per surface; developer relations + an SDK/MCP/Skills ecosystem team; security/red-team; trust & safety + abuse/fraud; enterprise sales + support; legal (provider terms, app-store policy, data governance); finance (compute is the dominant line); and continuous app-store review-compliance across iOS, Android, Chrome Web Store, VS Code Marketplace, JetBrains Marketplace, and cloud marketplaces.

---

## 5. The competitive read for AGI

The replicable layer is the surfaces. The durable layer is the model economics, the agent-safety engineering, and the ecosystem standards. AGI cannot out-spend either incumbent on compute, and cannot match frontier model quality. So AGI's strategy must derive its defensibility from the **three things the incumbents are structurally unwilling or unable to do**:

1. **Local-first / no-egress privacy** — incumbents cannot lead here without cannibalizing their inference revenue and data flywheel.
2. **Multi-provider neutrality + BYOK at no markup** — incumbents are single-lab by definition. (Caveat: neutral aggregators like OpenRouter/Poe are _not_ conflicted out — see `05`.)
3. **Rust-first desktop** — a real technical/quality edge versus the Electron incumbents, but a _feature_, not a moat on its own.

These map directly to AGI's stated differentiators. The rest of this package stress-tests whether they add up to a venture-scale business (`05`, `06`) and what it takes to build them to 1M users (`03`, `04`, `07`).

---

## Sources

Primary (Anthropic): claude.com/pricing, /product/cowork, /blog/claude-for-chrome, /blog/claude-powered-artifacts; anthropic.com/news/claude-opus-5, /engineering/desktop-extensions, /engineering/equipping-agents-for-the-real-world-with-agent-skills, /news/anthropic-amazon-compute; platform.claude.com/docs/en/about-claude/models/overview; code.claude.com/docs (vs-code, chrome, agent-sdk, skills, discover-plugins); support.claude.com (usage limits, artifacts, projects, memory); modelcontextprotocol.io/specification/2025-11-25.
Primary (OpenAI): openai.com/index (introducing-gpt-5-5, previewing-gpt-5-6-sol, introducing-apps-in-chatgpt, codex-for-almost-everything, new-tools-for-building-agents); developers.openai.com/codex (models, cli, cloud, app); help.openai.com (projects, connectors, voice).
Independent/corroborating: newsletter.pragmaticengineer.com/p/how-claude-code-is-built; dbreunig.com (Electron, quoting HN); emergetools.com (OpenAI mobile native stack); medium.com/kristiyan-velkov (ChatGPT Remix); infoq.com (Codex Rust rewrite); thehackernews.com + cyberscoop.com (Chrome-extension injection vulns).
Flagged **[unverified]**: claude.ai frontend framework; Claude mobile stack; connector counts above "over 200"; exact rate-limit numbers (both vendors now publish qualitative limits).
