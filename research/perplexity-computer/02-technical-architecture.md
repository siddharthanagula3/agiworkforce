# Perplexity Computer: Technical Architecture Deep Dive

> Research compiled 2026-02-28 | 20+ sources including official blog, CEO interviews, E2B engineering blog, technical analysis articles

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [The 19-Model Orchestra](#2-the-19-model-orchestra)
3. [Orchestration Engine](#3-orchestration-engine)
4. [Sub-Agent Architecture](#4-sub-agent-architecture)
5. [Sandbox and Compute Environment](#5-sandbox-and-compute-environment)
6. [Memory and Persistence](#6-memory-and-persistence)
7. [Checkpoint and Human-in-the-Loop System](#7-checkpoint-and-human-in-the-loop-system)
8. [Parallel Execution Mechanics](#8-parallel-execution-mechanics)
9. [Credit System and Cost Per Operation](#9-credit-system-and-cost-per-operation)
10. [Connectors and Integrations](#10-connectors-and-integrations)
11. [Security Architecture](#11-security-architecture)
12. [Open Source Components](#12-open-source-components)
13. [Development History](#13-development-history)
14. [Architecture Comparison](#14-architecture-comparison)
15. [Key Takeaways for AGI Workforce](#15-key-takeaways-for-agi-workforce)

---

## 1. System Overview

Perplexity Computer is a **cloud-based, multi-model, multi-agent orchestration platform** launched February 25, 2026. It represents a fundamental departure from single-model chatbots toward a model-agnostic orchestration layer that routes tasks across 19 frontier models.

**Core Philosophy** (CEO Aravind Srinivas, Fortune interview):
- "The orchestration is the product. The model is a tool."
- "When you build a team, you don't build a homogenous group where everyone has the same skills. You build a team with diverse strengths. We're applying that same logic to AI workflows."

**Key architectural differentiators:**
- Cloud-only execution (no local machine control)
- 19 models running simultaneously with intelligent routing
- Tasks execute for hours, days, or months asynchronously
- Background execution continues when user is offline
- Model-agnostic design (models can be swapped without system redesign)
- User-overridable routing (pin specific models to specific subtasks)

---

## 2. The 19-Model Orchestra

### Confirmed Models (6 explicitly named across all sources)

| Model | Provider | Primary Role | Task Types |
|-------|----------|-------------|------------|
| **Claude Opus 4.6** | Anthropic | Core reasoning engine + orchestrator | Orchestration, coding, complex reasoning, task decomposition |
| **Google Gemini** | Google | Deep research + sub-agent creation | Multi-step research, academic analysis, sub-agent spawning |
| **Grok** (likely Grok 4) | xAI | Fast lightweight tasks | Quick queries, simple transformations, speed-sensitive ops |
| **ChatGPT 5.2** | OpenAI | Long-context recall + broad search | Wide web search, long-document analysis, comprehensive retrieval |
| **Nano Banana** | Google | Image generation | Visual content creation, design assets |
| **Veo 3.1** | Google | Video production | Video generation, motion content |

### Probable Additional Models (remaining ~13 based on Perplexity platform capabilities)

Based on Perplexity's known model integrations, help center docs, and Computer's stated capabilities:

| Category | Likely Model | Evidence |
|----------|-------------|---------|
| **Perplexity Own - Search** | Sonar (built on Llama 3.3 70B) | Primary search model, 1200 tok/s on Cerebras infra |
| **Perplexity Own - Reasoning** | Sonar Reasoning Pro | Chain-of-thought reasoning with built-in web search |
| **Perplexity Own - Deep Research** | Sonar Deep Research | Autonomous multi-query research, structured reports |
| **Perplexity Own - Uncensored Reasoning** | R1 1776 (based on DeepSeek R1) | Open-sourced by Perplexity, censorship-free |
| **Code Generation** | Claude 4.0 Sonnet | Available on platform, efficient coding |
| **Multimodal** | Gemini 2.5 Pro | State-of-the-art multimodal understanding |
| **Fast Reasoning** | o4-mini (OpenAI) | Available on platform for fast reasoning |
| **Image Generation Alt** | Flux1 Pro | Confirmed on Perplexity platform |
| **Image Generation Alt** | DALL-E variant | Referenced in platform docs |
| **General Purpose** | GPT-5 | Available to Pro/Max subscribers |
| **General Purpose** | GPT-4.1 | Available to Pro/Max subscribers |
| **Speed** | Claude Sonnet 4.5/Haiku | Fast, cheap tasks |
| **Specialized** | Additional task-specific model(s) | Not publicly disclosed |

**Important**: Perplexity has NOT disclosed the complete 19-model list. The above is reconstructed from platform documentation, help center articles, and technical analysis. The roster is explicitly designed to evolve as better models emerge. The "19 models" number may include variant configurations (e.g., same base model with different system prompts for different skill types).

---

## 3. Orchestration Engine

### Architecture

```
User Request (natural language)
    |
    v
+----------------------------------+
|   ORCHESTRATOR (Claude Opus 4.6) |
|   - Understand user intent       |
|   - Task decomposition           |
|   - Model-to-task matching       |
|   - Dependency graph creation    |
|   - Result synthesis             |
+----------------------------------+
    |         |         |
    v         v         v
+-------+ +-------+ +-------+
| Agent | | Agent | | Agent |   <-- Sub-agents (parallel)
| Gemini| | Grok  | | Sonar |
+-------+ +-------+ +-------+
    |         |         |
    v         v         v
+----------------------------------+
|   RESULT AGGREGATION             |
|   - Output synthesis             |
|   - Quality verification         |
|   - Checkpoint gates             |
+----------------------------------+
    |
    v
User Review / Next Phase
```

### Routing Flow

1. **User describes desired outcome** in natural language
2. **Opus 4.6 decomposes** the request into a subtask graph with dependencies
3. **Model matching per subtask**:
   - Writing tasks -> ChatGPT 5.2 or Sonar
   - Coding -> Opus 4.6 or Claude Sonnet
   - Research -> Gemini + Sonar Deep Research
   - Image generation -> Nano Banana or Flux
   - Video -> Veo 3.1
   - Speed-sensitive -> Grok
   - Long-context recall -> ChatGPT 5.2
4. **Sub-agents execute** simultaneously and asynchronously
5. **Dependency management**: If analysis agent needs data that research agent has not returned yet, the orchestrator queues the analysis task until prerequisites are met
6. **Result synthesis**: Orchestrator combines outputs into final deliverable

### User Override Capability

Users can override automatic routing:
- Pin specific models to specific subtasks
- Review intermediate plans before execution begins
- Adjust the workflow at any checkpoint
- Set spending caps per model
- Choose which models power sub-agents

---

## 4. Sub-Agent Architecture

### Spawning Mechanism

1. **Decomposition**: Opus 4.6 breaks the objective into a task graph
2. **Agent creation**: Each subtask spawns a dedicated sub-agent
3. **Model assignment**: Each agent gets the optimal model for its task type
4. **Parallel dispatch**: Independent agents execute simultaneously
5. **Dynamic spawning**: When agents encounter obstacles, they create MORE sub-agents to solve them autonomously

### Agent Types by Function

| Agent Type | Capability | Model Affinity |
|-----------|------------|----------------|
| **Research Agent** | Web search, academic, data gathering | Gemini, Sonar Deep Research |
| **Coding Agent** | Code generation, debugging, deployment | Opus 4.6, Claude Sonnet |
| **Writing Agent** | Documents, reports, content | ChatGPT 5.2, Sonar |
| **Design Agent** | Image generation, visual assets | Nano Banana, Flux1 Pro |
| **Video Agent** | Video production | Veo 3.1 |
| **Data Agent** | Analysis, visualization, charts | Code interpreter (E2B) |
| **API Agent** | External service integration | Various |
| **Browser Agent** | Web browsing, form filling | Comet browser engine |

### Research Sub-System

The research engine runs **seven search types in parallel**:
1. Web search
2. Academic search
3. People search
4. Image search
5. Video search
6. Shopping search
7. Social search

All execute simultaneously (not sequentially). The system reads full source pages rather than snippets.

### Inter-Agent Communication

- Agents work simultaneously and asynchronously
- The orchestrator manages dependency queuing between agents
- One agent drafts a document while another gathers the data it needs
- Coordination is automatic with no user intervention during execution
- A document can be drafted by one agent while another gathers the data it needs

---

## 5. Sandbox and Compute Environment

### Infrastructure Stack

```
+--------------------------------------------+
|          Perplexity Cloud Infrastructure    |
|  +--------------------------------------+  |
|  |   E2B Sandbox (per task)             |  |
|  |   +--------------------------------+ |  |
|  |   | Firecracker microVM            | |  |
|  |   | - Real filesystem (ephemeral)  | |  |
|  |   | - Real browser (Chromium)      | |  |
|  |   | - Code interpreter (Python/JS) | |  |
|  |   | - CLI tools                    | |  |
|  |   | - Scoped API credentials       | |  |
|  |   +--------------------------------+ |  |
|  +--------------------------------------+  |
|  +--------------------------------------+  |
|  |   E2B Sandbox (another task)         |  |
|  |   [separate microVM]                 |  |
|  +--------------------------------------+  |
+--------------------------------------------+
```

### E2B + Firecracker Foundation (CONFIRMED)

**Critical finding**: Perplexity uses **E2B** (open-source sandbox infrastructure) powered by **AWS Firecracker microVMs** for code execution. This was confirmed by the E2B engineering blog documenting the integration.

- **Firecracker**: AWS's lightweight microVM technology, originally built for AWS Lambda
  - Hardware-level isolation (not container-level) -- stronger security boundary
  - ~150-170ms cold start time per new sandbox
  - Handles tens of trillions of function invocations monthly at AWS scale
  - Open source (Apache 2.0)
- **E2B**: Open-source wrapper providing AI-specific sandbox capabilities
  - **Stateful** code execution (maintains state across calls within a session)
  - Real filesystem access within sandbox boundaries
  - Process management for long-running tasks
  - Data upload/download between user and sandbox
  - Interactive chart generation (matplotlib data extraction for UI rendering)
- **Scale**: Perplexity runs **millions of E2B sandboxes per month** to support 340M+ monthly searches

### Per-Task Sandbox Capabilities

| Capability | Details |
|-----------|---------|
| **Filesystem** | Real read/write filesystem within sandbox. Ephemeral (discarded on task end) |
| **Browser** | Real browser with full internet access (built on Comet browser tech) |
| **Code Interpreter** | Full code execution (Python, JavaScript, etc.) via E2B |
| **CLI Tools** | Command-line tool access within sandbox |
| **API Integrations** | Hundreds of third-party connectors via scoped OAuth credentials |
| **Data Processing** | Upload data into sandbox, process, download outputs |
| **Visualization** | Interactive charts and data visualization |

### Isolation Properties

- **Ephemeral**: Sandbox is **discarded** when the task finishes
- **Compartmentalized**: Each task runs in its OWN isolated microVM
- **No local access**: A rogue sub-agent CANNOT cross the sandbox boundary to touch user's local machine, network, or corporate infrastructure
- **Scoped credentials**: Each tool/connector gets only the minimum credentials needed (least-privilege)
- **Hardware isolation**: Firecracker provides VM-level (not container-level) isolation

---

## 6. Memory and Persistence

### Persistent Memory System

Perplexity Computer maintains **persistent memory across sessions**:

- Remembers past projects, files, and user preferences
- Retains context for long-running tasks (hours, days, months)
- Personal to each user
- Does NOT reset when closing the browser tab (unlike typical chat sessions)
- Perplexity describes Computer as "personal to you, remembering past work"

### Memory Layers (inferred from capabilities)

| Layer | Function | Persistence |
|-------|----------|------------|
| **Session Memory** | Active task context, sub-agent states, intermediate results | Duration of task |
| **Project Memory** | Per-project files, decisions, progress state | Across sessions |
| **User Memory** | Preferences, past work history, service credentials | Permanent |
| **Search Memory** | Perplexity's core search/retrieval infrastructure (Sonar) | Platform-level |

### Long-Running Task State

- Tasks run for **hours, days, or months** without user supervision
- System maintains state across execution pauses
- Background execution continues even when user is offline
- Contrast with Claude Code / OpenClaw which require the user's machine to remain powered on

### Key Limitation

While Perplexity markets "persistent memory," the sandbox filesystems are ephemeral. The persistence appears to be at the project/conversation metadata level (task history, preferences, connector auth) rather than a persistent development environment. Files created must be explicitly downloaded or pushed to connected services.

---

## 7. Checkpoint and Human-in-the-Loop System

### Checkpoint Gate Architecture

Computer implements a checkpoint system aligned with **NIST and OWASP guidance** for LLM agents:

1. **Plan review checkpoints**: User reviews the decomposed task plan before execution
2. **Intermediate checkpoints**: Surface during long workflows for progress review
3. **Irreversible action gates**: System PAUSES before committing sensitive changes

### Actions That Trigger Pause for Human Review

- Publishing a website
- Pushing code to repositories
- Sending emails or messages
- Making purchases or financial transactions
- Deploying applications
- Any action with external consequences that cannot be undone

### Checkpoint Flow

```
Sub-agent execution (background, parallel)
    |
    v
[Checkpoint detected: irreversible action]
    |
    v
Pause THIS agent --> Notify user
(other agents continue working)
    |
    v
User reviews intermediate plan/action
    |
    +--[Approve]--> Resume execution
    +--[Modify]---> Adjust workflow, then resume
    +--[Cancel]---> Terminate this subtask only
```

### Non-Blocking Checkpoints

Checkpoints do NOT interrupt background execution of unrelated sub-agents. The system surfaces checkpoints for review while continuing parallel work on non-blocked tasks. This was confirmed during the launch live stream.

### User Control Points

- Pin sensitive subtasks to specific models
- Review intermediate plans at any point
- Adjust the workflow before Computer proceeds
- Override model selection for any subtask

---

## 8. Parallel Execution Mechanics

### Three Levels of Parallelism

**Level 1: Multiple Computer Instances**
- Users can run **dozens of Computer instances in parallel**
- Each instance operates independently on different projects
- Fully asynchronous -- check back when results surface
- No disclosed limit on concurrent instances

**Level 2: Within-Instance Sub-Agent Parallelism**
- Multiple sub-agents within a single Computer instance run simultaneously
- Research, coding, writing, and design agents all execute at the same time
- Dependency management ensures proper ordering where needed
- Dynamic agent spawning when obstacles are encountered

**Level 3: Within-Agent Search Parallelism**
- The research engine runs 7 search types simultaneously
- Web, academic, people, image, video, shopping, social -- all parallel
- Full page reading (not just snippets)
- Reads scholarly databases directly

### Dependency Management

- If Agent B needs results from Agent A, Agent B is queued
- Agent C continues independently while Agent B waits
- Results are synthesized as they become available
- No user management of dependencies needed -- orchestrator handles it

### Concurrency Limits

No explicit concurrency limits publicly disclosed. The system is designed for:
- Multiple simultaneous projects per user
- Many sub-agents per project
- Parallel search across 7+ verticals
- Concurrent model invocations across 19 models

---

## 9. Credit System and Cost Per Operation

### Credit Allocation

| Plan | Monthly Credits | Bonus | Monthly Price |
|------|----------------|-------|---------------|
| **Max** | 10,000 credits/month | +20,000 one-time launch bonus (30-day expiry) | $200/month |
| **Pro** | TBD (coming soon) | TBD | $20/month |
| **Enterprise** | TBD (coming soon) | TBD | Custom |

### Pricing Model

- **Usage-based**: Perplexity's first per-token consumer billing
- **Spending caps**: Users set maximum spend limits
- **Model selection**: Users choose which models power sub-agents (affecting cost)
- **Auto-refill**: Automatically purchases credits when balance drops below 500 credits ($5 worth)
- Credit pricing is subject to change by promotion, region, or plan

### Credit Cost Estimation

Based on auto-refill: 500 credits = ~$5, therefore **1 credit approximately $0.01**

| Operation Type | Estimated Credits | Notes |
|---------------|------------------|-------|
| Simple search/query | 1-5 | Uses Sonar or Grok |
| Deep research | 10-50 | Multi-step, Gemini + Sonar |
| Code generation + execution | 20-100 | Opus 4.6, sandbox compute costs |
| Image generation | 5-20 | Nano Banana or Flux |
| Video generation | 50-200+ | Veo 3.1, compute-intensive |
| Full project workflow | 100-1000+ | Multi-model, multi-agent, extended |

**Note**: Exact per-operation costs are NOT publicly disclosed. Community reports suggest complex research tasks can burn 50-100 credits in minutes. Users track usage per thread via overflow menu or at perplexity.ai/account/usage.

---

## 10. Connectors and Integrations

### Confirmed Native Connectors (15+)

| Category | Services |
|----------|----------|
| **Cloud Storage** | Google Drive, OneDrive, SharePoint, Dropbox, Box |
| **Email/Calendar** | Gmail, Google Calendar, Outlook |
| **Communication** | Slack |
| **Productivity** | Notion, Asana |
| **Development** | GitHub, Jira, Confluence, Linear |
| **Finance** | FactSet (existing customers only) |
| **Academic** | Wiley (existing customers only) |

### Integration Architecture

- **OAuth 2.0 authentication** for all SaaS connectors
- Google Drive connector uses direct API integration via Google's OAuth
- **File permission inheritance**: Respects source platform permissions
- **Scoped credentials**: Each connector gets minimum required permissions
- Perplexity markets "hundreds of connectors" -- likely includes Zapier/webhook bridges beyond the ~15-20 native integrations

### Key Limitations vs Local Tools

- No local filesystem connector
- No local database connector
- No local LLM integration
- No MCP protocol support (uses REST webhooks, not stdio/SSE MCP)
- Token storage is server-side on Perplexity infrastructure (not user-controlled)

---

## 11. Security Architecture

### Defense-in-Depth Model

| Layer | Mechanism |
|-------|-----------|
| **Sandbox Isolation** | E2B + Firecracker microVM (hardware-level, not container-level) |
| **Credential Scoping** | Least-privilege per tool/connector |
| **Human Checkpoints** | Pause before ALL irreversible actions |
| **Cloud-Only Execution** | No local machine access whatsoever |
| **Ephemeral Environments** | Sandboxes discarded after task completion |
| **Platform Infrastructure** | Runs on Perplexity's own secure cloud |

### Compliance Alignment

- Aligns with **NIST guidance** for LLM agents
- Aligns with **OWASP guidance** for LLM agents
- Scoped credentials + checkpoint gates + sandbox isolation

### Security Trade-Offs

| Advantage | Limitation |
|-----------|-----------|
| Reduced blast radius (sandbox) | Cannot perform local desktop automation |
| No local machine risk | Cannot access local files or apps |
| Managed infrastructure | User trusts Perplexity with all credentials |
| Ephemeral environments | Files lost unless explicitly exported |

---

## 12. Open Source Components

### Confirmed Open Source Dependencies

| Component | Role | License | Source |
|-----------|------|---------|--------|
| **E2B** | Sandbox infrastructure for code execution | Apache 2.0 | github.com/e2b-dev/E2B |
| **Firecracker** | microVM technology (via E2B/AWS) | Apache 2.0 | github.com/firecracker-microvm |
| **Llama 3.3 70B** | Base for Sonar search model | Meta Community | Meta |
| **DeepSeek R1** | Base for R1 1776 reasoning model | MIT | DeepSeek |
| **R1 1776** | Perplexity's uncensored reasoning | Open-sourced by Perplexity | Perplexity |

### Infrastructure Partners

| Partner | Component |
|---------|-----------|
| **Cerebras** | Inference for Sonar (1200 tokens/sec) |
| **AWS** | Firecracker microVM technology |
| **Anthropic** | Claude Opus 4.6, Claude Sonnet |
| **Google** | Gemini, Nano Banana, Veo 3.1 |
| **OpenAI** | ChatGPT 5.2, GPT-5, o4-mini |
| **xAI** | Grok |
| **Meta** | Llama 3.3 (base for Sonar) |

---

## 13. Development History

### Timeline

| Date | Milestone |
|------|-----------|
| **Jul 2024** | Perplexity begins implementing E2B sandbox |
| **Aug 2024** | Code interpreter in production (1 week build with E2B) |
| **2024-2025** | Sonar models developed, R1 1776 open-sourced |
| **Mid-2025** | Comet browser product built (6 months development) |
| **Dec 2025** | Frontier model breakthroughs inspire Computer concept |
| **Dec 2025 - Feb 2026** | Computer built in ~2 months |
| **Feb 25, 2026** | Computer launches to Max subscribers |
| **Feb 25, 2026** | Perplexity's biggest revenue-generating day in history |

### Development Method

- First month of Computer was built on **Claude Code** (Anthropic's CLI)
- Computer was then used to **complete its own development** (logo animation, code modifications, go-to-market strategy)
- Computer was NOT on the original product roadmap -- emerged from December 2025 breakthroughs in frontier AI capabilities
- CBO Dmitry Shevelenko: "Six months from now, I'm going to have a top-three priority that today I don't know about."

---

## 14. Architecture Comparison

### Perplexity Computer vs OpenClaw vs Claude vs AGI Workforce

| Dimension | Perplexity Computer | OpenClaw | Claude Code | AGI Workforce (Ours) |
|-----------|-------------------|---------|------------|---------------------|
| **Execution** | Cloud sandbox | Local machine | Local terminal | Local desktop (Tauri) |
| **Model Count** | 19 models | 1-3 models | 1 model family | 9+ providers, any model |
| **Orchestration** | Multi-model routing | Single model | Single model | Multi-model (planned router) |
| **Local Access** | None (cloud only) | Full desktop | Terminal + FS | Full desktop + automation |
| **Safety** | Sandbox + checkpoints | User approval | Permission system | ToolGuard + MCP sandbox |
| **Async** | Hours/days/months | Requires machine on | Requires machine on | Planned daemon mode |
| **Parallel** | Dozens simultaneous | One at a time | One at a time | Planned multi-agent |
| **Pricing** | $200/mo + credits | Usage-based API | Usage-based API | Free (BYO API keys) |
| **Setup** | Zero (cloud) | Terminal + keys | Terminal + keys | Desktop installer |
| **Target** | Non-technical + power | Developers | Developers | Everyone (with mobile) |
| **Privacy** | Cloud (Perplexity infra) | Local | Local | Local (100% private) |
| **MCP** | REST webhooks only | Full MCP | Full MCP | Full stdio/SSE/HTTP MCP |
| **Mobile** | None | None | None | QR pair + live dashboard |
| **Memory** | Persistent (cloud) | Session-only | Session-only | Planned embeddings |

---

## 15. Key Takeaways for AGI Workforce

### What We Should Build (Lessons from Perplexity)

1. **Intelligent model router**: Like Opus 4.6 orchestrator -- maps task types to optimal models automatically. Our advantage: user controls ALL model choices, not locked to Perplexity's selection.

2. **Sub-agent spawning with dependency management**: Decompose complex tasks into parallel sub-agents. Show the task tree with model badges per agent (users love seeing which model runs each branch).

3. **Background task execution**: Tasks that persist across sessions, run in background. Our advantage: runs locally without cloud costs.

4. **Checkpoint/approval gates**: Integrate into ToolGuard. Pause before irreversible actions, surface for approval, continue parallel work on non-blocked tasks.

5. **Parallel search across verticals**: Research agent that searches web, academic, social, shopping simultaneously.

6. **Live progress visualization**: Task tree with expanding checklist, strikethroughs on completion, file writes shown in real-time. High-impact trust and transparency UX.

7. **Credit/cost visibility**: Perplexity's biggest product gap is spend visibility. Users report burning $100+ without warning. Build spend-per-task estimation and limits.

### AGI Workforce Advantages Over Computer

| Our Advantage | Why It Matters |
|--------------|---------------|
| **Local desktop control** | Computer CANNOT touch user's machine. We can automate anything. |
| **Native app automation** | Screen capture, input sim, browser control -- impossible in cloud sandbox |
| **Privacy** | All data stays local. No cloud dependency. No trusting Perplexity with credentials. |
| **Full MCP protocol** | stdio + SSE + HTTP transports. Not limited to REST webhooks. |
| **Zero recurring cloud cost** | BYO API keys. No $200/month platform fee. |
| **User-configurable agents** | 140 .agi/employees with custom prompts. Perplexity's skills are server-side only. |
| **Mobile companion** | QR pair + live agent dashboard + approve/deny from phone. No competitor has this. |
| **Model freedom** | Any model from any provider. Not locked to Perplexity's 19 preset choices. |

### Architecture Elements to Adopt

1. **E2B sandbox option**: For users who want safe code execution, offer optional E2B sandbox alongside local execution. Open source, fast (~150ms startup), proven at scale.

2. **Seven-vertical parallel search**: Web, academic, people, image, video, shopping, social -- all simultaneously.

3. **Non-blocking checkpoints**: Pause one agent for approval while others continue. Critical for UX.

4. **Model badge UI**: Show which model powers each sub-agent in the task tree.

5. **Task decomposition visualization**: Show the plan before execution, let users modify it.

---

## Sources

- [Fortune - CEO Aravind Srinivas Explains Computer](https://fortune.com/2026/02/26/perplexity-ceo-aravind-srinivas-computer-openclaw-ai-agent/)
- [Semafor - Computer Wasn't Always Planned (development timeline)](https://www.semafor.com/article/02/27/2026/perplexitys-computer-wasnt-always-planned)
- [E2B Blog - How Perplexity Implemented Data Analysis (sandbox architecture)](https://e2b.dev/blog/how-perplexity-implemented-advanced-data-analysis-for-pro-users-in-1-week)
- [The Neuron - 19 AI Models, One Agentic System](https://www.theneuron.ai/explainer-articles/perplexity-wants-to-replace-your-computer-with-19-ais/)
- [VentureBeat - 19 Models at $200/month](https://venturebeat.com/technology/perplexity-launches-computer-ai-agent-that-coordinates-19-models-priced-at)
- [TechCrunch - Another Bet on Many Models](https://techcrunch.com/2026/02/27/perplexitys-new-computer-is-another-bet-that-users-need-many-ai-models/)
- [Karo Zieminski Substack - Review, Examples, Guide](https://karozieminski.substack.com/p/perplexity-computer-review-examples-guide)
- [Analytics Vidhya - How Computer Changes AI Usage](https://www.analyticsvidhya.com/blog/2026/02/perplexity-computer-is-here-to-change-the-way-we-use-ai/)
- [Natural20 - Multi-Model Agent End-to-End Coverage](https://natural20.com/coverage/perplexity-computer-multi-model-agent-end-to-end)
- [Implicator AI - 19 Models At Once](https://www.implicator.ai/perplexity-launches-computer-an-agent-platform-orchestrating-19-ai-models-at-once/)
- [Thesys.dev - Full Guide to 19-Model Agent](https://www.thesys.dev/blogs/perplexity-computer)
- [PCWorld - Safer Than OpenClaw](https://www.pcworld.com/article/3073456/perplexity-computer-is-agentic-ai-like-openclaw-but-safer.html)
- [Trending Topics EU - Month-Long Workflows](https://www.trendingtopics.eu/perplexity-computer-orchestrates-19-ai-models-to-execute-month-long-workflows/)
- [SolidTiming - Unified AI Platform Analysis](https://solidtiming.co/perplexity-computer-unified-ai-platform/5352/)
- [Storyboard18 - Model Collaboration Explained](https://www.storyboard18.com/digital/explained-what-perplexity-computer-is-and-how-it-uses-multiple-ai-models-in-one-workflow-90906.htm)
- [Perplexity Help Center - App Connectors](https://www.perplexity.ai/help-center/en/collections/15347354-app-connectors)
- [Perplexity Help Center - How Credits Work](https://www.perplexity.ai/help-center/en/articles/13838041-how-credits-work-on-perplexity)
- [GitHub - E2B Open Source Sandbox](https://github.com/e2b-dev/E2B)
- [Perplexity - Meet New Sonar (model details)](https://www.perplexity.ai/hub/blog/meet-new-sonar)
- [Perplexity - Open-Sourcing R1 1776](https://www.perplexity.ai/hub/blog/open-sourcing-r1-1776)
