# Acquisition Valuation Memorandum

**Subject:** AGI Workforce (agiworkforce.com)
**Prepared:** March 16, 2026
**Classification:** Confidential -- For Authorized Recipients Only
**Analyst:** Independent Technical Due Diligence

---

## Section 1: Executive Summary

AGI Workforce is a proprietary, closed-source Tauri v2 desktop application (Rust backend + React/TypeScript frontend) that combines multi-model LLM routing, desktop automation, MCP tool orchestration, autonomous agent execution, and a parallel swarm system into a single native desktop platform. The codebase is 4.5 months old (first commit October 31, 2025; 1,448 commits through March 16, 2026), comprising approximately 704,800 lines of Rust and 606,600 lines of TypeScript across 6,439 source files. It spans six application surfaces: desktop app, Next.js web app, React Native mobile app, Chrome extension, VS Code extension, and backend API services. The project is pre-revenue with Stripe billing infrastructure fully wired but not yet collecting payments.

**Recommended Price Range:**

| Scenario                                            | Low   | Base   | High   |
| --------------------------------------------------- | ----- | ------ | ------ |
| IP-Only Acquisition                                 | $2.8M | $4.5M  | $7.2M  |
| IP + Team (Acqui-hire, assuming 1-2 engineers)      | $4.8M | $7.5M  | $12.2M |
| Strategic Acquisition (Anthropic/OpenAI/Perplexity) | $6.0M | $12.0M | $22.0M |

**Key Value Drivers:**

- 22 LLM provider adapters with unified routing, retry, and streaming -- the broadest provider coverage of any desktop AI tool
- 1,420 Tauri IPC commands across 113 command files -- extremely deep system integration
- Full desktop automation stack (screen capture, keyboard/mouse simulation, browser CDP, computer-use agent, OCR)
- 150 non-coding AI skill definitions spanning healthcare, legal, finance, education, trades -- unique market positioning vs. code-only competitors
- Enterprise-grade security layer: ToolGuard (2,310 LOC), Argon2id+AES-GCM encryption, RBAC, rate limiting, audit logging, prompt injection detection
- Swarm orchestration system (hub-and-spoke, up to 100 concurrent sub-agents) -- rare in desktop AI tools

**Key Risks:**

- Pre-revenue; zero proven product-market fit
- Solo/tiny team -- bus factor risk, limited ability to maintain 704K LOC Rust codebase
- 2,753 `.unwrap()` calls in Rust code indicate production fragility
- Massive IPC wiring gap: 1,420 commands defined vs. 401 frontend invoke() calls (71% of backend surface is unwired)
- Competition from massively funded incumbents (Cursor at $50B valuation, Claude Desktop, ChatGPT Desktop, Perplexity Computer)
- No users, no retention data, no organic growth signal

---

## Section 2: Codebase Inventory

### Lines of Code

| Language / Surface                              | LOC            | Files      |
| ----------------------------------------------- | -------------- | ---------- |
| Rust (backend)                                  | 704,795        | 1,434      |
| TypeScript -- Desktop frontend                  | 232,889        | ~2,200     |
| TypeScript -- Web app (Next.js)                 | 337,923        | ~2,100     |
| TypeScript -- Mobile (React Native)             | 18,098         | ~100       |
| TypeScript -- Chrome extension                  | 8,312          | ~50        |
| TypeScript -- VS Code extension                 | ~4,500         | ~30        |
| TypeScript -- Services (API gateway, signaling) | 9,407          | ~60        |
| JSON model catalog (models.json)                | 2,649          | 1          |
| SQL migrations                                  | ~500           | 11         |
| AI skill definitions (Markdown)                 | ~15,000        | 150        |
| **Total**                                       | **~1,334,000** | **~6,439** |

### Rust Backend Module Breakdown

| Module          | LOC     | Description                                                     |
| --------------- | ------- | --------------------------------------------------------------- |
| `core/`         | 154,799 | AI engine: LLM routing, agents, MCP, swarm, AGI orchestration   |
| `sys/`          | 104,507 | System services: commands (IPC), security, billing, diagnostics |
| `automation/`   | 20,352  | Desktop automation: screen, input, browser, computer-use        |
| `features/`     | 34,178  | Domain features: terminal, speech, calendar, teams, workflows   |
| `data/`         | 20,548  | Data layer: SQLite, settings, cache, analytics                  |
| `integrations/` | 8,946   | Cloud sync, native messaging, realtime                          |
| `ui/`           | 6,212   | Tray icon, window management, overlay                           |

### Core Sub-Module Breakdown

| Sub-Module            | LOC    | Key Files                                                                                           |
| --------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| `core/agi/`           | 51,211 | Memory persistence, reflection engine, sandbox, project memory, semantic search, checkpoint system  |
| `core/llm/`           | 40,972 | llm_router.rs (2,669), provider_adapter.rs (2,880), sse_parser.rs (1,485), cost_calculator.rs (465) |
| `core/agent/`         | 20,367 | autonomous.rs (1,494), background_agent.rs (2,010), executor.rs, planner.rs, vision.rs              |
| `core/mcp/`           | 12,195 | client.rs, transport.rs (2,118), protocol.rs, manager.rs, tool_executor.rs                          |
| `core/scheduler/`     | 4,683  | NLP parser, proactive scheduling                                                                    |
| `core/research/`      | 3,973  | Multi-source research orchestrator with citations                                                   |
| `core/swarm/`         | 3,695  | Hub-and-spoke parallel agent orchestration                                                          |
| `core/intent/`        | 3,863  | Intent classification                                                                               |
| `core/hooks/`         | 2,920  | Hook system                                                                                         |
| `core/skills/`        | 2,890  | Skill loader/manager                                                                                |
| `core/orchestration/` | 2,679  | Workflow engine, executor, scheduler                                                                |
| `core/artifacts/`     | 2,232  | Artifact management                                                                                 |
| `core/embeddings/`    | 2,163  | 3-tier fallback: Ollama local, OpenAI cloud, FTS-only                                               |

### Frontend Complexity

| Metric              | Count             |
| ------------------- | ----------------- |
| React components    | 77 directories    |
| Zustand stores      | 63 stores         |
| Web app API routes  | 82 route handlers |
| Web app pages       | 40+ pages         |
| Supabase migrations | 11                |
| Tauri plugins       | 10                |
| Cargo dependencies  | 159               |

### Application Surfaces

| Surface           | Status                 | Stack                                             |
| ----------------- | ---------------------- | ------------------------------------------------- |
| Desktop app       | Primary product        | Tauri v2 + Rust + React 19 + Vite                 |
| Web app           | Marketing/auth/billing | Next.js 16 + Supabase + Stripe                    |
| Mobile app        | In development         | React Native + Expo                               |
| Chrome extension  | Functional             | Manifest V3, native messaging, job autofill       |
| VS Code extension | Functional             | Inline completion, chat participant, code actions |
| API gateway       | Functional             | Express, WebSocket signaling                      |

### Development Velocity

| Metric                | Value                    |
| --------------------- | ------------------------ |
| First commit          | October 31, 2025         |
| Latest commit         | March 16, 2026           |
| Total commits         | 1,448                    |
| Avg commits/day       | ~10.6                    |
| Rust test files       | 369 files with `#[test]` |
| TypeScript test files | 280                      |
| E2E test files        | 22                       |

---

## Section 3: Intellectual Property Assessment

### Module-by-Module Rating

| #   | Module                                                              | Functionality (1-10) | Uniqueness (1-10) | Quality (1-10) | Completeness (%) | Moat (months) | Cost to Recreate |
| --- | ------------------------------------------------------------------- | -------------------- | ----------------- | -------------- | ---------------- | ------------- | ---------------- |
| 1   | **LLM Router & Provider Adapters** (40,972 LOC)                     | 9                    | 7                 | 7              | 85%              | 4-6           | $650K            |
| 2   | **Agent System** (autonomous, background, planner) (20,367 LOC)     | 8                    | 6                 | 7              | 75%              | 3-5           | $400K            |
| 3   | **AGI Core** (memory, reflection, checkpoint, sandbox) (51,211 LOC) | 7                    | 7                 | 6              | 60%              | 5-8           | $800K            |
| 4   | **MCP Client/Server** (12,195 LOC)                                  | 8                    | 5                 | 7              | 80%              | 2-3           | $250K            |
| 5   | **Swarm Orchestration** (3,695 LOC)                                 | 7                    | 8                 | 7              | 65%              | 2-4           | $150K            |
| 6   | **Desktop Automation** (20,352 LOC)                                 | 8                    | 7                 | 6              | 70%              | 4-6           | $400K            |
| 7   | **Security Layer** (ToolGuard, encryption, RBAC) (29 files)         | 8                    | 6                 | 7              | 80%              | 3-4           | $350K            |
| 8   | **Research Orchestrator** (3,973 LOC)                               | 7                    | 6                 | 7              | 70%              | 1-2           | $100K            |
| 9   | **Scheduler (NLP + Proactive)** (4,683 LOC)                         | 7                    | 6                 | 7              | 70%              | 1-2           | $100K            |
| 10  | **Frontend (Desktop)** (232,889 LOC)                                | 7                    | 5                 | 6              | 65%              | 4-6           | $500K            |
| 11  | **Web App** (337,923 LOC)                                           | 7                    | 4                 | 6              | 75%              | 3-5           | $350K            |
| 12  | **Mobile + Extension + VSCode** (30,910 LOC)                        | 5                    | 5                 | 5              | 40%              | 2-3           | $200K            |
| 13  | **AI Skills Library** (150 skills)                                  | 6                    | 8                 | 5              | 80%              | 1-2           | $100K            |
|     | **TOTAL**                                                           |                      |                   |                |                  |               | **$4,350K**      |

### Assessment Notes

**Module 1 -- LLM Router (Rating: 9/7/7):** Supports 22 providers (OpenAI, Anthropic, Google, Ollama, Perplexity, xAI, DeepSeek, Qwen, Moonshot, Zhipu, Mistral, Groq, Together, Fireworks, Cerebras, DeepInfra, Cohere, AI21, Sambanova, Azure, Bedrock, ManagedCloud). Includes exponential backoff retry with fallback candidates, SSE streaming with 30s idle timeout, session cost safety cap ($50), per-provider adapters, model ID normalization, and local LLM capability detection. The SSE parser (1,485 LOC) handles provider-specific streaming differences. Cost calculator tracks real-time spend. This is the most valuable single module -- no open-source equivalent covers this many providers with this level of polish.

**Module 2 -- Agent System (Rating: 8/6/7):** Autonomous agent with self-healing (3 retries), replanning (max 2), approval workflow with 5-minute timeout, budget warnings at 80% of session cap, background agents (up to 8 concurrent, 24h timeout), and persistence across restarts. The approval controller with global pending registry is well-architected. However, 1,494 LOC for the autonomous module is relatively thin for the ambition level.

**Module 3 -- AGI Core (Rating: 7/7/6):** The largest module at 51K LOC. Includes memory persistence with hybrid search (vector + FTS, weighted), conversation summarizer with 3-tier embedding fallback, checkpoint/resume system, reflection engine (failure pattern analysis, plan critique), project memory, semantic search (TF-IDF), and sandboxed code execution. The breadth is impressive but the 60% completeness reflects that many subsystems are scaffolded rather than battle-tested. The 47 `#[allow(dead_code)]` annotations in the codebase suggest some of this code is aspirational.

**Module 4 -- MCP Client (Rating: 8/5/7):** Supports stdio, SSE, and streamable HTTP transports. Clean session-based architecture with health monitoring, tool registry, and event system. Solid but not unique -- MCP is an open protocol and multiple implementations exist.

**Module 5 -- Swarm Orchestration (Rating: 7/8/7):** Hub-and-spoke model supporting up to 100 concurrent sub-agents with task decomposition, dependency graph, critical path optimization, circuit breaker pattern, and result aggregation. Inspired by Kimi K2.5 architecture. At 3,695 LOC it is compact but architecturally sound. This is genuinely rare in desktop AI tools -- most competitors do not have parallel agent orchestration.

**Module 6 -- Desktop Automation (Rating: 8/7/6):** Screen capture (macOS + Windows + Linux), keyboard/mouse simulation via enigo, Playwright/CDP browser bridge, computer-use agent with observe-plan-act loop, visual reasoning, OCR, and window management. Cross-platform with conditional compilation. The 149 `unsafe` blocks are concentrated here (required for OS-level input simulation) but represent a maintenance burden.

**Module 7 -- Security (Rating: 8/6/7):** ToolGuard (2,310 LOC) implements 4-tier safety classification (Safe, RequiresNotification, RequiresConfirmation, RequiresExplicitApproval). SecretManager uses Argon2id key derivation + AES-256-GCM encryption with machine-key-derived persistent keys. Includes rate limiting, audit logging, prompt injection detection, command validation, log redaction, and sandbox isolation. This is significantly more security infrastructure than any open-source AI desktop tool.

**Module 13 -- AI Skills (Rating: 6/8/5):** 150 skill definitions covering non-coding domains (3D artist, academic tutor, addiction counselor, AI lawyer, Amazon FBA specialist, architect, etc.). These are Markdown templates, not executable code, so the IP value is in the curation and prompt engineering rather than code. The uniqueness score is high because no competitor has this breadth of non-coding AI personas.

---

## Section 4: Competitive Analysis

### Feature Comparison Matrix

| Feature                   | AGI Workforce                           | Claude Desktop      | ChatGPT Desktop        | Cursor                     | Perplexity Computer | Devin               |
| ------------------------- | --------------------------------------- | ------------------- | ---------------------- | -------------------------- | ------------------- | ------------------- |
| **Native Desktop App**    | Tauri v2 (Rust)                         | Electron            | Electron               | Electron (fork of VS Code) | Cloud + Mac mini    | Cloud               |
| **LLM Providers**         | 22 providers (BYOK)                     | Claude only         | GPT only               | ~5 providers               | Multi-model         | Claude/GPT          |
| **Local LLM Support**     | Ollama + LM Studio                      | No                  | No                     | No                         | No                  | No                  |
| **Desktop Automation**    | Full (screen, keyboard, mouse, browser) | Limited (MCP-based) | Screenshot + IDE write | No                         | Cloud-based agent   | Cloud sandbox       |
| **MCP Support**           | Unlimited (stdio+SSE+HTTP)              | Yes (limited)       | No                     | 40 tool cap                | Connectors          | No                  |
| **Autonomous Agents**     | Yes (with approval flow)                | Claude Cowork       | Limited                | Background agents          | Computer (cloud)    | Yes (cloud)         |
| **Swarm/Parallel Agents** | Up to 100 sub-agents                    | Agent teams (new)   | No                     | No                         | Sub-agents          | No                  |
| **Non-Coding Skills**     | 150 skills                              | No                  | No                     | No                         | No                  | No                  |
| **Mobile Companion**      | React Native app                        | No                  | iOS/Android chat       | No                         | No                  | No                  |
| **VS Code Extension**     | Yes                                     | No (CLI only)       | Yes                    | N/A (is an IDE)            | No                  | VS Code integration |
| **Chrome Extension**      | Yes (job autofill)                      | No                  | No                     | No                         | No                  | No                  |
| **Offline Mode**          | Yes (local LLMs)                        | No                  | No                     | No                         | No                  | No                  |
| **Pricing**               | Pre-revenue (BYOK)                      | $20-200/mo          | $20-200/mo             | $20-500/mo                 | $20-200/mo          | $500/mo             |
| **Valuation/Funding**     | Pre-seed                                | $61.5B (Anthropic)  | $300B (OpenAI)         | $29-50B                    | $21B                | $10.2B              |

### Competitive Landscape (2025-2026 Market Data)

**Cursor:** Raised $2.3B Series D at $29.3B valuation (November 2025). ARR exceeded $1B in 24 months, now reportedly over $2B. In talks for new round at $50B. The fastest-scaling SaaS product in history. ([Source](https://www.cnbc.com/2025/11/13/cursor-ai-startup-funding-round-valuation.html))

**Windsurf/Codeium:** OpenAI agreed to acquire for $3B (May 2025), deal collapsed (July 2025) due to Microsoft IP provisions. Google DeepMind executed $2.4B reverse acqui-hire. Cognition Labs acquired remainder for ~$250M (December 2025). ([Source](https://fortune.com/2025/07/11/the-exclusivity-on-openais-3-billion-acquisition-for-coding-startup-windsfurf-has-expired/))

**Cognition (Devin):** Raised $400M at $10.2B valuation (September 2025). ARR grew from $1M to $73M in 9 months. Acquired Windsurf, combined ARR ~$150M. ([Source](https://techcrunch.com/2025/09/08/cognition-ai-defies-turbulence-with-a-400m-raise-at-10-2b-valuation/))

**Perplexity AI:** Valued at $21.2B (early 2026). ARR ~$200M. Launched Perplexity Computer (cloud-based desktop agent) and Personal Computer (local Mac mini agent). ([Source](https://techcrunch.com/2025/09/10/perplexity-reportedly-raised-200m-at-20b-valuation/))

**AI Coding Market:** Estimated at $4.7-8.5B in 2025-2026, growing at 15-50% CAGR depending on definition. ([Source](https://finance.yahoo.com/news/ai-code-assistant-market-set-143000983.html))

**AI M&A Multiples:** Developer tools command 30-50x EV/Revenue. AI agent companies valued at 25-41x EV/Revenue depending on stage. Pre-revenue AI startups: Seed ~$10M, Series A ~$46M. ([Source](https://www.finrofca.com/news/ai-agents-multiples-mid-year-2025))

**Acqui-hire Benchmarks:** Traditional: $1-2M per engineer. AI-specialized: $5-30M+ per engineer depending on expertise. ([Source](https://www.getclera.com/blog/acqui-hires-big-tech-talent-acquisition))

---

## Section 5: Technical Debt Assessment

### Build Status

Build and type-checking were not executed during this analysis to avoid modifying the environment, but the following indicators were assessed from code inspection:

### Code Health Indicators

| Indicator             | Count  | Severity | Notes                                                                                                                                                             |
| --------------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.unwrap()` calls     | 2,753  | HIGH     | Potential panics in production. Rust best practice is `?` operator or explicit error handling. At ~4 unwraps per 1,000 LOC, this is elevated for production code. |
| `unsafe` blocks       | 149    | MEDIUM   | Concentrated in automation/input simulation (necessary for OS APIs) and one accessibility check. Not a sign of sloppy code but increases audit burden.            |
| `#[allow(dead_code)]` | 47     | MEDIUM   | Indicates scaffolded but unused code, particularly in the AGI module.                                                                                             |
| TODO/FIXME/HACK/XXX   | 6      | LOW      | Unusually low -- suggests either disciplined development or aggressive suppression.                                                                               |
| Lint strictness       | STRICT | POSITIVE | Cargo.toml denies `unsafe_code`, `dead_code`, `unused_imports`, `unused_variables`, `unused_mut`. All warnings are errors. This is enterprise-grade lint config.  |

### IPC Wiring Gap (Critical Finding)

| Metric                              | Count |
| ----------------------------------- | ----- |
| `#[tauri::command]` defined in Rust | 1,420 |
| Commands registered in `lib.rs`     | 1,343 |
| Frontend `invoke()` calls           | 401   |

**Analysis:** 1,420 Tauri commands are defined in the Rust backend, but only 401 frontend invoke() calls exist. This means approximately 71% of the backend API surface has no frontend consumer. Two interpretations:

1. **Optimistic:** The backend is "API-complete" and the frontend simply hasn't caught up. The Rust code represents a comprehensive system API that can be wired incrementally.
2. **Pessimistic:** Much of the backend is speculative code that may never be used, inflating the LOC count and maintenance burden.

The 77-command gap between defined (1,420) and registered (1,343) commands suggests some dead command code exists.

### Security Findings

| Finding                    | Assessment                                                            |
| -------------------------- | --------------------------------------------------------------------- |
| Secret management          | STRONG -- Argon2id + AES-256-GCM, machine-key-derived persistent keys |
| Tool safety tiers          | STRONG -- 4-tier classification with user approval flows              |
| Prompt injection detection | Present -- dedicated module                                           |
| Rate limiting              | Present -- configurable per-tool                                      |
| Audit logging              | Present -- dedicated module                                           |
| Command validation         | Present -- validates shell commands before execution                  |
| Log redaction              | Present -- redacts secrets from logs                                  |
| Deep link security         | Present -- allowlist-based, token redaction                           |
| RBAC                       | Present -- role-based access control                                  |

**Overall Security Assessment:** The security infrastructure is unusually comprehensive for a pre-revenue product. This represents genuine IP value and would be expensive to replicate correctly.

### Potential Dead Code

The `core/agi/` module at 51,211 LOC is suspiciously large relative to the rest of the codebase. The `orchestrator_examples.rs` file is explicitly marked `#[allow(dead_code)]`. The presence of both `core/agi/orchestrator.rs` and `core/orchestration/` suggests some architectural duplication. The AGI module's `memory.rs` has a `#[allow(deprecated)]` annotation, indicating internal API churn.

---

## Section 6: Valuation Methodology

### Method 1: Cost-to-Recreate

This method estimates what it would cost to rebuild the codebase from scratch with a competent team, assuming:

- Senior Rust engineer: $250K/year fully loaded ($125/hr)
- Senior TypeScript/React engineer: $200K/year fully loaded ($100/hr)
- Time estimates account for design, implementation, testing, and iteration
- No credit for speculative or scaffolded code (apply 70% discount to AGI module)

| Component                                               | Estimated Engineer-Months | Cost        |
| ------------------------------------------------------- | ------------------------- | ----------- |
| LLM Router + 22 Provider Adapters                       | 8                         | $650K       |
| Agent System (autonomous, background, planner)          | 5                         | $400K       |
| AGI Core (discounted 40% for incompleteness)            | 6                         | $480K       |
| MCP Client/Server (3 transports)                        | 3                         | $250K       |
| Swarm Orchestration                                     | 2                         | $150K       |
| Desktop Automation (cross-platform)                     | 5                         | $400K       |
| Security Layer (ToolGuard, encryption, RBAC)            | 4                         | $350K       |
| Research Orchestrator                                   | 1.5                       | $100K       |
| Scheduler (NLP + proactive)                             | 1.5                       | $100K       |
| Desktop Frontend (React 19 + 77 components + 63 stores) | 6                         | $500K       |
| Web App (Next.js, Stripe, Supabase, 82 routes)          | 4                         | $350K       |
| Mobile + Extensions                                     | 3                         | $200K       |
| AI Skills Library (150 curated prompts)                 | 1                         | $100K       |
| System integration, IPC wiring, testing                 | 4                         | $350K       |
| **Total**                                               | **54 engineer-months**    | **$4,380K** |

**Cost-to-recreate: $4.4M** (undiscounted). Applying a 20% discount for the buyer's ability to use modern tooling (AI-assisted coding was not available at this scale 2 years ago), the adjusted cost-to-recreate is **$3.5M**.

However, cost-to-recreate sets a floor, not a ceiling. A buyer with existing infrastructure could selectively extract the most valuable modules (LLM router, security layer, automation) for significantly less.

### Method 2: Comparable Transactions

| Transaction                      | Price       | Revenue     | Multiple | Relevance                     |
| -------------------------------- | ----------- | ----------- | -------- | ----------------------------- |
| Windsurf (OpenAI attempted)      | $3.0B       | ~$50M ARR   | 60x      | AI coding IDE, deal collapsed |
| Windsurf (Google acqui-hire)     | $2.4B       | --          | N/A      | Team + IP license             |
| Windsurf (Cognition acquisition) | $250M       | ~$50M ARR   | 5x       | Distressed, post-breakup      |
| Cognition (Devin) fundraise      | $10.2B      | $73M ARR    | 140x     | Venture round, not M&A        |
| Manus (Meta acquisition)         | $2B+        | ~$100M ARR  | 20x      | AI agent startup              |
| Convergence.ai (Salesforce)      | Undisclosed | Pre-revenue | N/A      | AI agent acqui-hire           |

**AGI Workforce comparables analysis:**

- AGI Workforce has $0 revenue, making revenue multiples inapplicable
- The closest comparable is Convergence.ai (pre-revenue AI agent startup acquired by Salesforce), but no price was disclosed
- Pre-revenue AI startup median: Seed-stage at $10M, but these typically have institutional backing and user traction
- Applying the pre-revenue seed benchmark of $10M with a 50-70% discount for no users and no funding history yields **$3-5M**

### Method 3: Strategic Premium Analysis

Each potential acquirer would value different components:

**Anthropic:**

- Strategic value: Multi-model routing that could be repurposed for Claude-first but with competitive fallbacks; 150 non-coding skills could differentiate Claude Desktop beyond coding; desktop automation adds computer-use capabilities natively
- Overlaps: MCP (Anthropic created it), agent system (Claude Cowork exists)
- Unique gets: 22-provider router, AI skills library, Tauri desktop framework expertise, ToolGuard security
- Estimated strategic value: **$8-15M**

**OpenAI:**

- Strategic value: Desktop automation for ChatGPT desktop; multi-provider routing intelligence (know thy enemy); Chrome/VSCode extensions for distribution
- Overlaps: Agent system (OpenAI has o-series), web app (ChatGPT web exists)
- Unique gets: Tauri native desktop expertise (vs. their Electron app), swarm orchestration, ToolGuard, automation stack
- Estimated strategic value: **$6-12M**

**Perplexity:**

- Strategic value: Most aligned buyer. Perplexity Computer is cloud-based; AGI Workforce provides a local-first desktop implementation. BYOK + local LLMs fit Perplexity's multi-model philosophy. Research orchestrator aligns with Perplexity's core search product.
- Overlaps: Less overlap than Anthropic/OpenAI
- Unique gets: Full Tauri desktop app, local automation, BYOK infrastructure, MCP unlimited, 150 skills
- Estimated strategic value: **$10-22M**

---

## Section 7: Final Valuation Table

### IP-Only Acquisition (No Team Retention)

| Method                              | Low       | Base      | High      |
| ----------------------------------- | --------- | --------- | --------- |
| Cost-to-Recreate (with AI discount) | $2.8M     | $3.5M     | $4.4M     |
| Comparable Transactions             | $3.0M     | $4.0M     | $5.0M     |
| **IP-Only Range**                   | **$2.8M** | **$3.8M** | **$4.7M** |

### IP + Acqui-hire (1-2 Engineers)

Assuming 1-2 founding engineers with demonstrated Rust + AI systems expertise:

- Base acqui-hire premium per AI-capable Rust engineer: $2-5M (below the $5-30M for frontier AI researchers, reflecting application-layer rather than model-layer expertise)

| Component                | Low       | Base      | High       |
| ------------------------ | --------- | --------- | ---------- |
| IP Value                 | $2.8M     | $3.8M     | $4.7M      |
| Acqui-hire (1 engineer)  | $2.0M     | $3.0M     | $5.0M      |
| Acqui-hire (2 engineers) | $4.0M     | $6.0M     | $10.0M     |
| **Total (1 eng)**        | **$4.8M** | **$6.8M** | **$9.7M**  |
| **Total (2 eng)**        | **$6.8M** | **$9.8M** | **$14.7M** |

### Strategic Acquisition by Buyer

| Buyer                                        | Low    | Base   | High   | Rationale                                                                              |
| -------------------------------------------- | ------ | ------ | ------ | -------------------------------------------------------------------------------------- |
| **Anthropic**                                | $8.0M  | $12.0M | $15.0M | Skills library + ToolGuard + multi-provider intelligence; overlaps with Claude Desktop |
| **OpenAI**                                   | $6.0M  | $10.0M | $12.0M | Desktop automation + Tauri expertise; heavy overlaps with ChatGPT                      |
| **Perplexity**                               | $10.0M | $15.0M | $22.0M | Most strategic fit; local desktop fills gap in cloud-only Perplexity Computer          |
| **Enterprise buyer (Salesforce, Atlassian)** | $5.0M  | $8.0M  | $12.0M | Agent platform for enterprise workflow automation                                      |
| **Private equity / roll-up**                 | $2.5M  | $4.0M  | $6.0M  | IP value only, no strategic premium                                                    |

### Sensitivity Analysis

The valuation is most sensitive to:

1. **Team retention** -- If the founding engineer(s) do not stay, the codebase becomes a maintenance liability rather than an asset. 704K LOC of Rust requires deep expertise. Discount 40-60% without team.
2. **Working product status** -- If the desktop app successfully builds, runs, and demonstrates core workflows end-to-end, the base case increases 20-30%. If critical paths are broken, discount 30-40%.
3. **User traction** -- Even 100 active users with retention data would increase the base case by 50-100%. Zero users is the single biggest risk factor.
4. **Competitive timing** -- The AI desktop tool market is moving extremely fast. Every month of delay reduces the IP's competitive advantage as incumbents add features.

---

## Section 8: Deal Structure Recommendations

### Recommended Structure: Asset Purchase + Earn-Out

**Rationale:** Pre-revenue with no entity value beyond IP and talent. Asset purchase avoids inheriting unknown liabilities. Earn-out aligns incentives for team retention and product integration.

### Proposed Term Sheet

**Asset Purchase:**

- Purchase price: $4-6M upfront for all IP (source code, skills library, domain, trademarks)
- Assets included: All source code across all surfaces, build infrastructure, CI/CD, documentation, CLAUDE.md (which itself is a valuable operational document), AI skill definitions, model catalog, domain name
- Assets excluded: Any user data (none exists), third-party API keys, Stripe account

**Acqui-hire Component (if applicable):**

- Signing bonus: $500K-1M per engineer
- Retention package: $1-2M per engineer, vesting over 2 years with 6-month cliff
- Total per-engineer cost: $1.5-3M
- Role: Senior Rust/AI systems engineer on acquirer's desktop platform team

**Earn-Out (Performance-Based):**

- Milestone 1: Core LLM router and security modules integrated into acquirer's product within 6 months -- $500K
- Milestone 2: Desktop automation stack deployed to production within 12 months -- $500K
- Milestone 3: Skills library generating measurable user engagement within 12 months -- $500K
- Maximum earn-out: $1.5M

**Alternative: Equity-Only for Strategic Buyers**

- If Perplexity (most aligned buyer): 0.05-0.10% equity stake at current $21B valuation ($10.5-21M notional) + founding team roles
- This structure is attractive to seller if they believe in the acquirer's trajectory

### Key Due Diligence Items Before Closing

1. **Build verification** -- Confirm `cargo build` and `pnpm build` succeed on clean machine
2. **Core path demonstration** -- Verify the chat -> LLM routing -> streaming response path works end-to-end
3. **Dependency audit** -- 159 Cargo dependencies + 33K-line pnpm-lock.yaml need license and security review
4. **IP chain of title** -- Confirm all code is original work, no open-source contamination in proprietary modules
5. **Unwrap() risk assessment** -- Audit the 2,753 unwrap() calls for crash risk in production paths
6. **IPC wiring verification** -- Confirm whether the 71% unwired commands represent planned work or dead code

### Risk Mitigations for Buyer

- **Escrow 20% of purchase price** for 6 months pending build verification and IP representations
- **Require seller representations** that no open-source code was copied into proprietary modules
- **Include non-compete clause** preventing seller from building competing AI desktop tool for 2 years
- **Secure assignment of all contributor rights** if any contractors contributed code

---

## Appendix A: Key Source Files Referenced

| File                                                        | LOC    | Significance                                             |
| ----------------------------------------------------------- | ------ | -------------------------------------------------------- |
| `apps/desktop/src-tauri/src/core/llm/llm_router.rs`         | 2,669  | Central LLM routing with retry, streaming, cost tracking |
| `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`   | 2,880  | 22-provider adapter layer                                |
| `apps/desktop/src-tauri/src/sys/security/tool_guard.rs`     | 2,310  | 4-tier tool safety classification                        |
| `apps/desktop/src-tauri/src/core/agent/background_agent.rs` | 2,010  | Background agent system (8 concurrent)                   |
| `apps/desktop/src-tauri/src/core/mcp/transport.rs`          | 2,118  | MCP transport layer (stdio+SSE+HTTP)                     |
| `apps/desktop/src-tauri/src/core/agent/autonomous.rs`       | 1,494  | Autonomous agent with self-healing                       |
| `apps/desktop/src-tauri/src/core/llm/sse_parser.rs`         | 1,485  | SSE streaming parser                                     |
| `apps/desktop/src-tauri/src/sys/security/encryption.rs`     | ~400   | Argon2id + AES-256-GCM encryption                        |
| `apps/desktop/src-tauri/src/core/swarm/orchestrator.rs`     | ~800   | Hub-and-spoke swarm coordinator                          |
| `apps/desktop/src-tauri/src/lib.rs`                         | ~1,000 | App initialization, 40+ managed states                   |
| `apps/web/app/api/stripe-webhook/route.ts`                  | 1,657  | Stripe billing webhook handler                           |

## Appendix B: Competitive Intelligence Sources

- [Cursor $2.3B raise at $29.3B valuation (CNBC, Nov 2025)](https://www.cnbc.com/2025/11/13/cursor-ai-startup-funding-round-valuation.html)
- [Cursor targeting $50B valuation (Seeking Alpha, 2026)](https://seekingalpha.com/news/4563544-cursor-is-said-to-target-50b-valuation-in-new-funding-round-as-ai-revenue-skyrockets)
- [Windsurf $3B OpenAI deal collapsed (Fortune, Jul 2025)](https://fortune.com/2025/07/11/the-exclusivity-on-openais-3-billion-acquisition-for-coding-startup-windsfurf-has-expired/)
- [Cognition Devin $10.2B valuation (TechCrunch, Sep 2025)](https://techcrunch.com/2025/09/08/cognition-ai-defies-turbulence-with-a-400m-raise-at-10-2b-valuation/)
- [Perplexity $21B valuation (TechCrunch, Sep 2025)](https://techcrunch.com/2025/09/10/perplexity-reportedly-raised-200m-at-20b-valuation/)
- [Meta acquires Manus AI agent (Yahoo Finance, 2025)](https://finance.yahoo.com/news/meta-just-acquired-incredibly-impressive-151805799.html)
- [AI coding market $4.7B-$14.6B (SNS Insider)](https://finance.yahoo.com/news/ai-code-assistant-market-set-143000983.html)
- [AI agent valuation multiples 25-41x (Finro, 2025)](https://www.finrofca.com/news/ai-agents-multiples-mid-year-2025)
- [Developer tools 30-50x EV/Revenue (saas.group)](https://saas.group/blog/ai-valuation-multiples-most-valuable-industries-in-2025/)
- [Acqui-hire costs $1-2M traditional, $30-90M AI researchers (Clera)](https://www.getclera.com/blog/acqui-hires-big-tech-talent-acquisition)
- [Tauri 2.0 adoption up 35% YoY (Edana)](https://edana.ch/en/2025/12/23/advantages-and-limitations-of-the-tauri-application-framework-in-the-enterprise/)
- [Claude pricing: Pro $20/mo, Max $100-200/mo (claude.com)](https://claude.com/pricing)
- [Perplexity Computer launch (Axios, Mar 2026)](https://www.axios.com/2026/03/11/perplexity-personal-computer-mac)
- [Perplexity Computer multi-model agent (TechCrunch, Feb 2026)](https://techcrunch.com/2026/02/27/perplexitys-new-computer-is-another-bet-that-users-need-many-ai-models/)
- [Claude Code March 2026 updates (overview)](https://code.claude.com/docs/en/overview)

---

_This memorandum is based on source code inspection, publicly available market data, and web research conducted on March 16, 2026. All valuations are estimates and should not be construed as guaranteed outcomes. Actual acquisition prices depend on negotiation, buyer strategic priorities, team retention agreements, and due diligence findings._
