# AGI Workforce: Competitive Intelligence Report

**Date:** March 17, 2026
**Scope:** 10 major AI desktop/agent competitors + Claude Desktop (bonus)

---

## Executive Summary

The AI desktop agent landscape has exploded since mid-2025. Every major player now offers some form of autonomous agent, but they all remain narrowly focused on coding, search, or chat. AGI Workforce occupies a unique position as the only native desktop app combining multi-model support (9+ providers), full system automation, 140+ non-coding skills, and a mobile companion — a trifecta no competitor matches.

**Key market shifts since late 2025:**

- OpenAI launched GPT-5.4 computer use (March 2026) — first model to beat humans on desktop tasks
- Meta acquired Manus AI for $2B+ (December 2025) — validates agentic AI market
- Cursor reached $200/mo Ultra tier with background cloud agents
- Claude launched Cowork (January 2026) — autonomous desktop file/task agent
- Google released Gemini 3.1 Pro and Project Mariner browser agent
- Windsurf shipped SWE-1.5 model processing at 950 tokens/sec

---

## 1. Cursor

**What it is:** VS Code fork, AI-native code editor with agent mode
**Company:** Anysphere (San Francisco)
**Target audience:** Professional developers, engineering teams

### Pricing

| Tier       | Price       | Key Limits                                                                |
| ---------- | ----------- | ------------------------------------------------------------------------- |
| Hobby      | Free        | Limited agent requests, limited tab completions                           |
| Pro        | $20/mo      | Extended agent limits, frontier models, MCPs, skills, hooks, cloud agents |
| Pro+       | $60/mo      | 3x usage on all OpenAI/Claude/Gemini models                               |
| Ultra      | $200/mo     | 20x usage, priority access to new features                                |
| Teams      | $40/user/mo | Shared chats, RBAC, SSO, analytics                                        |
| Enterprise | Custom      | Pooled usage, SCIM, audit logs                                            |
| Bugbot     | $40/user/mo | PR reviews (200/mo on Pro, unlimited on Teams)                            |

### Key Features

- **Agent mode**: Autonomous multi-file editing, testing, validation
- **Background/cloud agents**: Work asynchronously, produce PRs without IDE open
- **Tab completion**: Custom model for next-action prediction
- **Multi-model**: GPT-5.2, Opus 4.6, Gemini 3 Pro, xAI models
- **MCP support**: Extensible tool integration (but capped at ~40 tools)
- **Subagents**: Delegated autonomous workflows
- **CLI agent**: Terminal-based agent with cloud handoff
- **Bugbot**: Automated PR review product
- **Composer 1.5**: Large-scale code generation

### Strengths

- Best-in-class coding agent UX (VS Code familiarity)
- Multi-model choice within editor
- Background agents complete work while you sleep
- MCP ecosystem growing fast
- CLI + cloud handoff for terminal users

### Weaknesses

- Code-only (zero non-coding skills)
- No desktop automation / computer use
- No mobile companion
- MCP tool cap (~40 tools reported)
- No voice mode
- $200/mo Ultra tier for power users
- No model council / multi-model consensus

### vs AGI Workforce

| AGI Workforce Has                     | Cursor Has                           |
| ------------------------------------- | ------------------------------------ |
| 140+ non-coding skills                | Best coding agent UX                 |
| Full desktop automation               | Background cloud agents              |
| Mobile companion + QR pairing         | VS Code ecosystem/extensions         |
| Model Council (multi-model consensus) | Bugbot PR review                     |
| Unlimited MCP tools                   | CLI agent mode                       |
| Voice mode push-to-talk               | Composer 1.5 large codegen           |
| DynamicCanvas widgets                 | Cursor Tab (custom completion model) |
| BYOK + local LLMs (Ollama)            | Team marketplace for plugins         |

---

## 2. Windsurf (formerly Codeium)

**What it is:** AI-native IDE with Cascade agent engine
**Company:** Codeium/Windsurf (Mountain View)
**Target audience:** Individual developers, enterprise teams

### Pricing

| Tier              | Price       | Credits/Month                                      |
| ----------------- | ----------- | -------------------------------------------------- |
| Free              | $0          | 25 prompt credits                                  |
| Pro               | $15/mo      | 500 credits, SWE-1.5 model, Fast Context           |
| Teams             | $30/user/mo | 500 credits/user, admin dashboard (+$10/user), SSO |
| Enterprise (<200) | Custom      | 1,000 credits/user, hybrid deployment              |
| Enterprise (200+) | Custom      | Custom credits, full customization                 |

### Key Features

- **Cascade agent**: Up to 20 tool calls per prompt, background planning agents
- **SWE-1.5 model**: Proprietary coding model, 950 tokens/sec (13x faster than Claude Sonnet)
- **SWE-1 family**: SWE-1, SWE-1-lite, SWE-1-mini for different use cases
- **Real-time awareness**: Detects user actions without explicit prompts
- **Named checkpoints**: Project state snapshots for navigation/reversion
- **Voice input**: Speech-to-text in editor
- **Multi-Cascade**: Run multiple agent instances simultaneously
- **MCP server extensions**: Tool extensibility
- **JetBrains plugin**: IDE flexibility
- **Conversation sharing**: Teams/Enterprise collaboration

### Strengths

- Cheapest paid tier ($15/mo vs $20 for Cursor)
- Proprietary SWE-1.5 model — fast and cost-efficient
- Credit-based pricing (predictable costs)
- Real-time awareness of user actions
- Checkpoint system for safe experimentation

### Weaknesses

- Code-only (zero non-coding capabilities)
- No desktop automation / computer use
- No mobile companion
- Credit exhaustion possible on heavy use
- No model council
- Racing conditions with concurrent file edits
- Less model variety than Cursor

### vs AGI Workforce

| AGI Workforce Has       | Windsurf Has                           |
| ----------------------- | -------------------------------------- |
| 140+ non-coding skills  | SWE-1.5 proprietary model (fastest)    |
| Full desktop automation | Real-time user action awareness        |
| Mobile companion        | Named checkpoints/reversion            |
| Model Council           | Credit-based pricing (cheapest at $15) |
| Unlimited MCP tools     | JetBrains plugin support               |
| Voice mode (full)       | Multi-Cascade parallel agents          |
| DynamicCanvas           | Background planning agents             |
| BYOK + local LLMs       | Conversation sharing                   |

---

## 3. Devin (Cognition Labs)

**What it is:** Fully autonomous AI software engineer
**Company:** Cognition Labs (San Francisco)
**Target audience:** Engineering teams, enterprises needing parallel dev capacity

### Pricing

| Tier       | Price                                    | Key Details                                                      |
| ---------- | ---------------------------------------- | ---------------------------------------------------------------- |
| Core       | $2.25/ACU (pay-as-you-go, starts at $20) | 10 concurrent sessions, unlimited users                          |
| Team       | $500/mo                                  | 250 ACUs included ($2.00/ACU), unlimited sessions, Advanced mode |
| Enterprise | Custom                                   | Unlimited ACUs, VPC deployment, SSO/OIDC, admin controls         |

ACU = normalized compute unit (VM time + model inference + networking)

### Key Features

- **Fully autonomous**: Creates PRs, responds to comments, conducts code reviews
- **Devin IDE**: Built-in development environment
- **Devin Wiki**: Auto-generated codebase documentation
- **Ask Devin**: Natural language codebase querying
- **Devin API**: Programmatic task submission
- **20+ integrations**: GitHub, Linear, Slack, Teams, Jira, Datadog, Stripe, AWS, Snowflake
- **Self-improving**: Learns codebase patterns, creates its own tools and scripts
- **Parallel execution**: Multiple sessions simultaneously

### Strengths

- Most autonomous coding agent (works independently on tickets)
- Integrates directly into existing workflows (Slack, Jira, Linear)
- 8-12x efficiency gains on migration tasks (Nubank case study)
- Creates its own tools to optimize repetitive work
- Enterprise-grade (VPC, SSO, admin controls)

### Weaknesses

- Code-only (no non-coding capabilities)
- No desktop automation
- No mobile companion
- Expensive for heavy use ($500/mo Team)
- ACU-based pricing hard to predict
- No local LLM support
- Single model (no multi-model choice)
- No voice mode, no canvas

### vs AGI Workforce

| AGI Workforce Has           | Devin Has                                   |
| --------------------------- | ------------------------------------------- |
| 140+ non-coding skills      | Most autonomous coding agent                |
| Full desktop automation     | Devin Wiki (auto-docs)                      |
| Mobile companion            | Direct Jira/Linear/Slack ticket integration |
| Model Council + multi-model | Self-improving tool creation                |
| BYOK + local LLMs           | Parallel session execution                  |
| Voice mode                  | Enterprise VPC deployment                   |
| DynamicCanvas               | 8-12x efficiency on migrations              |
| $0 BYOK cost possible       | Ask Devin (NL codebase queries)             |

---

## 4. Perplexity (Comet Browser)

**What it is:** AI-native browser with built-in assistant agent
**Company:** Perplexity AI (San Francisco)
**Target audience:** Knowledge workers, researchers, general consumers

### Pricing

| Tier       | Price  | Key Features                                      |
| ---------- | ------ | ------------------------------------------------- |
| Free       | $0     | Basic search, limited queries                     |
| Pro        | $20/mo | Advanced models, unlimited searches, file uploads |
| Enterprise | Custom | Team features, SSO, admin controls                |

Comet browser is free to download; Pro subscription unlocks full assistant capabilities.

### Key Features

- **Comet Browser**: AI-native Chromium browser replacing Chrome
- **Comet Assistant**: Autonomous browsing agent (conducts entire browsing sessions)
- **Expanded reasoning**: Visible action chain showing what assistant does
- **Email triage**: Manages inbox, uncovers unread messages
- **Price comparison**: Cross-site shopping automation
- **Research synthesis**: Multi-source research compilation
- **Mobile apps**: iOS and Android with same assistant
- **AI search**: Citation-backed answers (Perplexity's core product)

### Strengths

- Combines browser + AI assistant seamlessly
- Research/search is best-in-class (citations, sources)
- Free browser download lowers barrier
- Mobile parity (iOS/Android)
- User-friendly for non-technical users

### Weaknesses

- Browser-only (no desktop automation beyond web)
- No coding capabilities
- No file system access
- No local LLM support
- No multi-model choice (uses Perplexity's models)
- No MCP tools
- No voice mode for desktop tasks
- No canvas or visual workspace

### vs AGI Workforce

| AGI Workforce Has                        | Perplexity/Comet Has                   |
| ---------------------------------------- | -------------------------------------- |
| Full desktop automation (beyond browser) | Best-in-class AI search with citations |
| 140+ non-coding skills                   | AI-native browser (replaces Chrome)    |
| Multi-model (9+ providers)               | Seamless browsing + AI integration     |
| BYOK + local LLMs                        | Price comparison automation            |
| Model Council                            | Mobile browser apps (iOS/Android)      |
| MCP tools (unlimited)                    | Email triage built in                  |
| Voice mode                               | Consumer-friendly UX                   |
| DynamicCanvas                            | Research compilation                   |
| Coding agent                             | Free browser download                  |

---

## 5. ChatGPT Desktop (OpenAI)

**What it is:** Desktop app for ChatGPT with voice, agent, and computer use capabilities
**Company:** OpenAI (San Francisco)
**Target audience:** General consumers, professionals, developers, enterprises

### Pricing

| Tier       | Price          | Key Features                                                                     |
| ---------- | -------------- | -------------------------------------------------------------------------------- |
| Free       | $0             | GPT-5 (Auto/Instant), limited usage                                              |
| Go         | $8/mo          | 10x more messages, ads shown                                                     |
| Plus       | $20/mo         | GPT-5 + Thinking, DALL-E 3, Deep Research, Codex access                          |
| Pro        | $200/mo        | GPT-5.2, unlimited usage, Advanced Voice, Codex priority, computer use via Codex |
| Business   | $25-30/user/mo | Team workspace, admin controls                                                   |
| Enterprise | Custom         | Extended context, SSO, compliance                                                |

### Key Features

- **GPT-5.4 Computer Use**: First AI to beat humans on desktop tasks (75% OSWorld vs 72.4% human)
- **ChatGPT Agent**: Multi-step task execution (research, bookings, slideshows)
- **Codex app**: Cloud-based agentic coding (parallel agents, worktrees, sandbox environments)
- **Advanced Voice Mode**: Real-time conversation on desktop
- **Operator**: Web browsing agent for task automation
- **Deep Research**: Multi-source research reports
- **Canvas**: Collaborative document/code editing
- **Skills**: Automation feature for recurring tasks
- **Work with Apps**: Integration with desktop applications
- **DALL-E 3 / Sora**: Image and video generation

### Strengths

- Largest user base (hundreds of millions)
- Most advanced computer use (GPT-5.4 beats humans)
- Full product ecosystem (Chat + Codex + Operator + Voice + Canvas)
- Enterprise-grade security and compliance
- Massive R&D budget and model development
- Voice mode is production-quality
- Canvas for collaborative editing

### Weaknesses

- Single model provider (OpenAI only, no BYOK)
- Computer use only available via Codex/API (not in chat UI yet)
- Pro tier very expensive ($200/mo) for full features
- No local LLM support
- No MCP tools
- No mobile agent dashboard (basic mobile app only)
- No model council / multi-model consensus
- Privacy concerns (data used for training on free tier)

### vs AGI Workforce

| AGI Workforce Has               | ChatGPT Desktop Has                      |
| ------------------------------- | ---------------------------------------- |
| Multi-model (9+ providers)      | GPT-5.4 computer use (beats humans)      |
| BYOK + local LLMs               | Codex cloud coding (parallel agents)     |
| Mobile companion + QR pairing   | Largest user base globally               |
| Model Council                   | Advanced Voice Mode (production quality) |
| Unlimited MCP tools             | Canvas collaborative editing             |
| 140+ non-coding skills          | Deep Research                            |
| DynamicCanvas (10 widget types) | Operator web agent                       |
| $0 BYOK cost option             | DALL-E 3 + Sora (image/video gen)        |
| No vendor lock-in               | Skills automation                        |

---

## 6. Manus AI (now Meta)

**What it is:** General-purpose autonomous AI agent for complex multi-step tasks
**Company:** Manus (Singapore) — acquired by Meta for $2B+ in Dec 2025
**Target audience:** Knowledge workers, businesses, researchers

### Pricing

| Tier         | Price  | Key Features                          |
| ------------ | ------ | ------------------------------------- |
| Professional | $79/mo | Full agent access, 29 tools           |
| Team         | Custom | Team collaboration, shared workspaces |
| Enterprise   | Custom | SSO, API access, custom deployment    |

### Key Features

- **29 built-in tools**: Web browsing, coding, data analysis, media creation
- **Browser Operator**: Chrome/Edge extension — turns your browser into an autonomous agent
- **Multi-agent architecture**: Executor, Planner, Knowledge agents (Claude-powered)
- **Sandboxed code execution**: Python, terminal, browser in isolated environment
- **Web deployment**: Publishes results to accessible subdomains
- **Research compilation**: Multi-source research with visualization
- **Slides/websites/apps**: Content creation and deployment
- **REST API**: Programmatic task submission
- **Local browser + cloud browser**: Uses your authenticated sessions or fresh sandbox
- **Mobile apps**: iOS and Android (monitor/initiate tasks)
- **Slack/Email integration**: Workflow connectivity

### Strengths

- Most general-purpose AI agent (coding + research + design + data)
- Browser Operator uses your existing logins (no re-auth)
- GAIA benchmark leader (outperformed OpenAI Deep Research)
- Web deployment of results (unique)
- Meta acquisition = massive distribution via WhatsApp/Instagram/Facebook
- Mobile monitoring capability

### Weaknesses

- Now owned by Meta (privacy/data concerns)
- No desktop automation beyond browser
- No local LLM support
- Single model backend (Claude 3.7)
- Slow processing speed
- Code reliability issues and context limits
- No model council
- No voice mode
- Variable output quality

### vs AGI Workforce

| AGI Workforce Has              | Manus Has                              |
| ------------------------------ | -------------------------------------- |
| Full desktop automation        | Browser Operator (uses your logins)    |
| Multi-model (9+ providers)     | 29 built-in tools                      |
| BYOK + local LLMs              | Web deployment of results              |
| Model Council                  | GAIA benchmark leader                  |
| Voice mode                     | Meta distribution (WhatsApp/Instagram) |
| DynamicCanvas                  | Multi-agent architecture               |
| Unlimited MCP tools            | REST API for automation                |
| Privacy (local-first, no Meta) | Sandboxed code execution               |
| No corporate ownership         | Slides/website/app creation            |

---

## 7. Lindy AI

**What it is:** AI assistant platform for email, calendar, and meeting automation
**Company:** Lindy AI (San Francisco)
**Target audience:** Professionals, sales teams, recruiters, executives

### Pricing

| Tier       | Price     | Key Features                                                 |
| ---------- | --------- | ------------------------------------------------------------ |
| Plus       | $49.99/mo | Core assistant, iMessage 24/7, email/meeting/scheduling      |
| Pro        | $59.99/mo | Everything in Plus + advanced features (17% annual discount) |
| Enterprise | Custom    | SSO/SCIM, HIPAA-BAA, dedicated support, team access          |

### Key Features

- **Email triage and drafting**: Learns your writing voice
- **Meeting scheduling/prep/follow-up**: Automated meeting lifecycle
- **Meeting recording and notes**: AI transcription and summarization
- **iMessage assistant**: 24/7 access via text message
- **400+ integrations**: Gmail, Slack, Calendar, CRM, Zapier
- **App Builder**: Custom automation creation
- **Ask/Act/Anticipate**: Proactive intelligence and task execution
- **Calendar optimization**: Smart scheduling

### Strengths

- Best-in-class email/calendar automation
- iMessage access (unique — AI via text)
- 400+ integrations
- HIPAA-compliant (healthcare use)
- Learns personal communication style
- "2 hours back every day" value proposition

### Weaknesses

- Narrow focus (email/calendar/meetings only)
- No coding capabilities
- No desktop automation
- No multi-model choice
- No MCP tools
- No voice mode (for desktop)
- No canvas or visual workspace
- No mobile agent dashboard (iMessage only)
- Expensive for what it does ($50-60/mo)

### vs AGI Workforce

| AGI Workforce Has                             | Lindy Has                          |
| --------------------------------------------- | ---------------------------------- |
| Full desktop automation                       | Best email/calendar automation     |
| 140+ non-coding skills (including scheduling) | iMessage 24/7 access               |
| Multi-model (9+ providers)                    | 400+ integrations via Zapier       |
| Mobile companion + QR pairing                 | Learns your communication style    |
| Model Council                                 | HIPAA compliance                   |
| Unlimited MCP tools                           | Meeting recording + notes          |
| Voice mode                                    | App Builder for custom automations |
| DynamicCanvas                                 | Proactive anticipation alerts      |
| Coding capabilities                           | Calendar optimization              |

---

## 8. GitHub Copilot

**What it is:** AI pair programmer integrated into IDEs and GitHub
**Company:** GitHub/Microsoft (San Francisco/Redmond)
**Target audience:** Individual developers, open-source contributors, enterprise teams

### Pricing

| Tier       | Price       | Key Features                                         |
| ---------- | ----------- | ---------------------------------------------------- |
| Free       | $0          | 2,000 completions/mo, 50 chat requests, CLI          |
| Pro        | $10/mo      | All models, coding agent, code review, 500+ requests |
| Pro+       | Higher      | GitHub Spark, additional model options               |
| Business   | $21/user/mo | Coding agent, 300 premium requests, user management  |
| Enterprise | $39/user/mo | Full model access, Spark, governance                 |

### Key Features

- **Agent mode**: Multi-file autonomous editing, testing, validation
- **Copilot Coding Agent**: Background agent that creates PRs from issues
- **Code review**: AI-powered PR review across platforms
- **Copilot Spaces**: Organized context (code, docs, notes) for smarter answers
- **Multi-model**: Anthropic, Google, OpenAI models (Opus 4.6 for Enterprise)
- **MCP Registry**: External tool integration
- **GitHub Spark**: AI app generation
- **Platform reach**: VS Code, Visual Studio, JetBrains, Neovim, GitHub.com, Mobile, CLI
- **Custom agents + third-party extensions**

### Strengths

- Cheapest pro tier ($10/mo)
- Deepest GitHub integration (issues, PRs, code review)
- Broadest IDE support (6+ platforms)
- Free tier is generous (2,000 completions)
- Enterprise-grade governance
- MCP Registry for tool extensibility
- Multi-model access

### Weaknesses

- Code-only (zero non-coding skills)
- No desktop automation / computer use
- No mobile companion for agent oversight
- No voice mode
- No canvas or visual workspace
- No local LLM support (cloud models only)
- No model council
- Background agent limited to GitHub issues workflow

### vs AGI Workforce

| AGI Workforce Has       | GitHub Copilot Has                    |
| ----------------------- | ------------------------------------- |
| 140+ non-coding skills  | Cheapest pro tier ($10/mo)            |
| Full desktop automation | Deepest GitHub/PR integration         |
| Mobile companion        | Broadest IDE support (6+ platforms)   |
| Model Council           | Copilot Spaces (context organization) |
| Voice mode              | AI code review on all PRs             |
| DynamicCanvas           | GitHub Spark (app generation)         |
| BYOK + local LLMs       | MCP Registry                          |
| Unlimited MCP tools     | Free tier (2,000 completions)         |
| Non-vendor-locked       | Coding Agent from issues              |

---

## 9. Replit Agent

**What it is:** Cloud IDE with autonomous AI agent for full-stack app building
**Company:** Replit (San Francisco), valued at $3B
**Target audience:** Non-technical builders, indie hackers, small teams, students

### Pricing

| Tier       | Price     | Key Features                                                |
| ---------- | --------- | ----------------------------------------------------------- |
| Starter    | Free      | Limited Agent credits, 1 published app, 1 vCPU/2GB          |
| Core       | $20-25/mo | $25 usage credits, unlimited apps, 4 vCPU/8GB, Agent access |
| Pro        | $100/mo   | Up to 15 builders, credit rollover, 8 vCPU/16GB, priority   |
| Enterprise | Custom    | SSO/SAML, 64 vCPU/128GB, dedicated support                  |

### Key Features

- **Agent 3**: Autonomous multi-step builds, feature implementation
- **Full-stack in browser**: Backend, database, hosting, deployment — all integrated
- **Figma import**: Paste Figma URL, Agent converts to functional code
- **Autonomous testing**: Agent tests its own work
- **One-click deployment**: Built-in hosting and domain management
- **"Vibe coding"**: Natural language to working app
- **Multiplayer**: Real-time collaboration

### Strengths

- Zero local setup (everything in browser)
- Built-in deployment (no separate hosting needed)
- Best for non-technical users (natural language to app)
- Figma-to-code pipeline
- Pro tier includes 15 builders for $100/mo ($6.67/person)
- Full-stack (DB, backend, frontend, hosting)

### Weaknesses

- Browser-only (no native desktop app)
- No desktop automation
- No mobile companion for agent oversight
- No non-coding skills
- No multi-model choice (Replit's models)
- No MCP tools
- No voice mode
- No model council
- Credit-based (can get expensive for heavy use)
- Code quality concerns for production use
- Survival concerns (Reddit: "Replit might not survive 2026")

### vs AGI Workforce

| AGI Workforce Has          | Replit Has                            |
| -------------------------- | ------------------------------------- |
| Native desktop app         | Zero-setup browser IDE                |
| Full desktop automation    | Built-in deployment + hosting         |
| 140+ non-coding skills     | Figma-to-code import                  |
| Multi-model (9+ providers) | Full-stack (DB + backend + frontend)  |
| Mobile companion           | "Vibe coding" for non-technical users |
| Model Council              | 15 builders for $100/mo               |
| Voice mode                 | Multiplayer collaboration             |
| DynamicCanvas              | One-click deployment                  |
| BYOK + local LLMs          | Autonomous testing                    |
| Unlimited MCP tools        | Starter plan is free                  |

---

## 10. Google AI Studio / Gemini

**What it is:** AI platform + consumer assistant with desktop/browser integration
**Company:** Google/DeepMind (Mountain View)
**Target audience:** Developers (AI Studio), consumers (Gemini app), enterprise (Workspace)

### Pricing (Gemini App)

| Tier     | Price      | Key Features                                                                           |
| -------- | ---------- | -------------------------------------------------------------------------------------- |
| Free     | $0         | Gemini 3 Flash, limited Gemini 3 Pro, 32K context, 5 Deep Research/mo                  |
| AI Plus  | ~$19.99/mo | 128K context, 12 Deep Research/day, 1,000 images/day                                   |
| AI Pro   | $19.99/mo  | 1M token context, 100 Gemini 3 Pro/day, Workspace integration, 2TB storage             |
| AI Ultra | $249.99/mo | 500 Pro/day, 200 Agent requests/day, Project Mariner (10 tasks), 30TB, YouTube Premium |

### Key Features

- **Gemini 3.1 Pro**: World's best multimodal model
- **Project Mariner**: Browser automation agent (Chrome, 10 simultaneous tasks on Ultra)
- **Computer Use model**: Gemini 2.5 Computer Use for desktop tasks via API
- **Deep Research**: Up to 120 reports/day on Ultra
- **Jules agent**: Coding assistant
- **AI Mode**: Deep search on google.com with extended reasoning
- **Workspace integration**: Gemini in Docs, Sheets, Slides, Meet, Chat
- **NotebookLM**: Audio overviews and research notebooks
- **Veo 3.1**: Video generation with native audio
- **Nano Banana**: Image generation and editing
- **Live API**: Voice agents
- **1M+ token context**: Process 1,500 pages of text

### Strengths

- Most advanced models (Gemini 3.1 Pro)
- Deepest productivity integration (Google Workspace)
- Massive context window (1M+ tokens)
- Project Mariner browser agent
- Best multimodal capabilities (text, image, video, audio)
- Free tier is generous
- Google Search integration built-in
- NotebookLM for research

### Weaknesses

- No dedicated desktop app (Gemini in Chrome, not standalone)
- Ultra tier extremely expensive ($249.99/mo)
- Google ecosystem lock-in
- No BYOK (Google models only)
- No MCP tools
- No mobile agent dashboard
- Project Mariner limited to Ultra ($250/mo)
- No model council
- Privacy concerns (Google data practices)
- Computer use only via API (not consumer-ready)

### vs AGI Workforce

| AGI Workforce Has          | Google/Gemini Has                 |
| -------------------------- | --------------------------------- |
| Native desktop app         | Google Workspace deep integration |
| Multi-model (9+ providers) | Gemini 3.1 Pro (top multimodal)   |
| BYOK + local LLMs          | 1M+ token context window          |
| Mobile companion           | Project Mariner (browser agent)   |
| Model Council              | Deep Research (120/day on Ultra)  |
| Unlimited MCP tools        | NotebookLM                        |
| 140+ non-coding skills     | Veo 3.1 video generation          |
| DynamicCanvas              | Built-in Google Search            |
| No vendor lock-in          | Workspace (Docs/Sheets/Slides)    |
| Voice push-to-talk         | Live API voice agents             |
| Affordable pricing         | Free tier with Gemini 3 Flash     |

---

## BONUS: Claude Desktop + Cowork (Anthropic)

**What it is:** Desktop AI app with Cowork autonomous agent and MCP support
**Company:** Anthropic (San Francisco)
**Target audience:** Knowledge workers, developers, professionals

### Pricing

| Tier       | Price        | Cowork Access                     |
| ---------- | ------------ | --------------------------------- |
| Free       | $0           | No                                |
| Pro        | $20/mo       | Yes (3-5 tasks/day before limits) |
| Max 5x     | $100/mo      | Yes (~225 messages/5hr)           |
| Max 20x    | $200/mo      | Yes (~900 messages/5hr)           |
| Team       | $125/user/mo | Premium seats required            |
| Enterprise | Custom       | Custom limits + governance        |

### Key Features

- **Cowork agent**: Autonomous file operations, research, document creation
- **Sandboxed VM**: Isolated execution environment (Apple Virtualization / Hyper-V)
- **MCP plugins**: 13+ (Google Drive, Gmail, Slack, Jira, DocuSign, etc.)
- **File operations**: Excel, PowerPoint, Word, PDF processing
- **Scheduled tasks**: Recurring automation (hourly/daily/weekly)
- **Claude Opus 4.6**: 1M token context
- **Claude Code**: Terminal-based coding agent (separate product)
- **Computer use**: Within sandboxed VM (not host OS)

### Strengths

- Best autonomous file management agent
- MCP ecosystem leader
- Sandboxed VM security model
- Scheduled recurring tasks
- Document creation (Excel/PPT/Word/PDF)
- Claude Opus 4.6 quality

### Weaknesses

- Single model (Claude only, no multi-model)
- No BYOK or local LLM support
- No mobile companion (desktop only, no mobile monitoring)
- No persistent memory across sessions
- No offline capability
- Session terminates on sleep/close
- Single-user only (no collaboration)
- No Microsoft 365 integration
- macOS/Windows only (no Linux for Cowork)
- Security concerns (prompt injection demonstrated, photo deletion incident)
- Cannot be used within Claude Projects

### vs AGI Workforce

| AGI Workforce Has                | Claude Desktop Has                 |
| -------------------------------- | ---------------------------------- |
| Multi-model (9+ providers)       | Claude Opus 4.6 (best reasoning)   |
| BYOK + local LLMs                | Cowork autonomous agent            |
| Mobile companion + QR pairing    | Sandboxed VM security              |
| Model Council                    | MCP plugin ecosystem               |
| 140+ non-coding skills           | Scheduled recurring tasks          |
| DynamicCanvas                    | Document creation (Excel/PPT/Word) |
| Always-on (no sleep termination) | Claude Code (terminal coding)      |
| Unlimited MCP tools              | 1M token context                   |
| Voice push-to-talk               | File operations + PDF processing   |
| Collaboration features           | (Single-user only)                 |

---

## Competitive Matrix

### Feature Comparison

| Feature                        | AGI Workforce | Cursor  | Windsurf | Devin | Perplexity | ChatGPT | Manus | Lindy | Copilot | Replit | Google | Claude |
| ------------------------------ | :-----------: | :-----: | :------: | :---: | :--------: | :-----: | :---: | :---: | :-----: | :----: | :----: | :----: |
| **Native Desktop App**         |       Y       |    Y    |    Y     |   N   |     Y      |    Y    |   Y   |   N   |    N    |   N    |   N    |   Y    |
| **Multi-Model (5+)**           |       Y       |    Y    |    N     |   N   |     N      |    N    |   N   |   N   |    Y    |   N    |   N    |   N    |
| **BYOK (Bring Your Own Keys)** |       Y       |    N    |    N     |   N   |     N      |    N    |   N   |   N   |    N    |   N    |   N    |   N    |
| **Local LLM (Ollama)**         |       Y       |    N    |    N     |   N   |     N      |    N    |   N   |   N   |    N    |   N    |   N    |   N    |
| **Desktop Automation**         |       Y       |    N    |    N     |   N   |     N      |   Y\*   |   N   |   N   |    N    |   N    |  Y\*   |  Y\*   |
| **Computer Use**               |       Y       |    N    |    N     |   N   |     N      |   Y\*   |   Y   |   N   |    N    |   N    |  Y\*   |  Y\*   |
| **Mobile Companion**           |       Y       |    N    |    N     |   N   |     Y      |    N    |   Y   |   N   |    N    |   N    |   N    |   N    |
| **QR Pairing Desktop-Mobile**  |       Y       |    N    |    N     |   N   |     N      |    N    |   N   |   N   |    N    |   N    |   N    |   N    |
| **Non-Coding Skills (50+)**    |       Y       |    N    |    N     |   N   |     N      |    N    |   Y   |   Y   |    N    |   N    |   N    |   Y    |
| **Model Council**              |       Y       |    N    |    N     |   N   |     N      |    N    |   N   |   N   |    N    |   N    |   N    |   N    |
| **MCP Tools (Unlimited)**      |       Y       | Limited |    Y     |   N   |     N      |    N    |   N   |   N   |    Y    |   N    |   N    |   Y    |
| **Voice Mode**                 |       Y       |    N    |    Y     |   N   |     N      |    Y    |   N   |   N   |    N    |   N    |   Y    |   N    |
| **Canvas/Workspace**           |       Y       |    N    |    N     |   N   |     N      |    Y    |   N   |   N   |    N    |   N    |   N    |   N    |
| **Coding Agent**               |       Y       |    Y    |    Y     |   Y   |     N      |    Y    |   Y   |   N   |    Y    |   Y    |   Y    |   Y    |
| **Background Agents**          |       N       |    Y    |    Y     |   Y   |     N      |    Y    |   Y   |   N   |    Y    |   Y    |   N    |   N    |
| **Built-in Deployment**        |       N       |    N    |    N     |   N   |     N      |    N    |   Y   |   N   |    N    |   Y    |   N    |   N    |
| **Enterprise SSO/SCIM**        |       N       |    Y    |    Y     |   Y   |     N      |    Y    |   Y   |   Y   |    Y    |   Y    |   Y    |   Y    |
| **PR/Issue Integration**       |       N       |    Y    |    N     |   Y   |     N      |    N    |   N   |   N   |    Y    |   N    |   N    |   N    |

_Y\* = Limited/restricted access (high tier only or API-only)_

### Pricing Comparison (Individual)

| Product           | Free           | Entry Paid    | Mid Tier      | Top Tier      |
| ----------------- | -------------- | ------------- | ------------- | ------------- |
| **AGI Workforce** | Y (BYOK)       | BYOK ($0+API) | —             | —             |
| **Cursor**        | Y (limited)    | $20/mo        | $60/mo        | $200/mo       |
| **Windsurf**      | Y (25 credits) | $15/mo        | $30/user      | Custom        |
| **Devin**         | Pay-as-you-go  | $2.25/ACU     | $500/mo       | Custom        |
| **Perplexity**    | Y              | $20/mo        | —             | Custom        |
| **ChatGPT**       | Y              | $8/mo (Go)    | $20/mo (Plus) | $200/mo (Pro) |
| **Manus**         | N              | $79/mo        | Custom        | Custom        |
| **Lindy**         | N              | $49.99/mo     | $59.99/mo     | Custom        |
| **Copilot**       | Y (2000/mo)    | $10/mo        | $21/user      | $39/user      |
| **Replit**        | Y (limited)    | $20-25/mo     | $100/mo       | Custom        |
| **Google**        | Y              | $19.99/mo     | $19.99/mo     | $249.99/mo    |
| **Claude**        | Y              | $20/mo        | $100/mo       | $200/mo       |

---

## Strategic Analysis

### AGI Workforce's Defensible Moats

1. **Multi-Model + BYOK + Local LLM Trifecta**: No competitor offers all three. Users own their API relationships, can run fully offline with Ollama, and switch between 9+ providers. This is the strongest anti-lock-in story in the market.

2. **Mobile Companion with QR Pairing**: Zero competitors offer a dedicated mobile app that QR-pairs to desktop, shows live agent dashboards, and allows approve/deny per tool call. Claude's "Remote Control" is Max-tier only ($100-200/mo).

3. **140+ Non-Coding Skills**: Every coding competitor (Cursor, Windsurf, Copilot, Devin, Replit) has zero non-coding capabilities. Only Manus and Claude Cowork handle general tasks, but neither has 140 structured skill categories spanning healthcare, legal, finance, education, creative, and trades.

4. **Model Council (Multi-Model Consensus)**: Unique feature. No competitor runs multiple models in parallel for consensus answers. This is a genuine innovation.

5. **Unlimited MCP Tools in Native App**: Cursor caps at ~40 tools. Copilot has MCP Registry but limited. AGI Workforce has no tool cap inside a native Tauri app.

6. **DynamicCanvas with 10 Widget Types**: Only ChatGPT has Canvas, and it is limited to text/code editing. AGI Workforce's DynamicCanvas with 10 widget types is a richer visual workspace.

### Gaps to Close (What Competitors Have That AGI Workforce Lacks)

| Gap                                             | Who Has It                                      | Priority | Effort                |
| ----------------------------------------------- | ----------------------------------------------- | -------- | --------------------- |
| **Background/cloud agents**                     | Cursor, Devin, ChatGPT Codex                    | HIGH     | L                     |
| **Enterprise SSO/SCIM**                         | All enterprise competitors                      | HIGH     | M                     |
| **Built-in deployment**                         | Replit, Manus                                   | MEDIUM   | L                     |
| **PR/issue integration** (GitHub, Linear, Jira) | Cursor, Devin, Copilot                          | HIGH     | M                     |
| **AI-powered code review**                      | Cursor Bugbot, Copilot                          | MEDIUM   | M                     |
| **Deep Research** (multi-source, cited)         | ChatGPT, Google, Perplexity                     | HIGH     | M                     |
| **Scheduled/recurring tasks**                   | Claude Cowork, Lindy                            | MEDIUM   | S                     |
| **Figma-to-code import**                        | Replit                                          | LOW      | M                     |
| **1M+ token context**                           | Claude, Google                                  | MEDIUM   | N/A (model-dependent) |
| **Image/video generation**                      | ChatGPT (DALL-E/Sora), Google (Nano Banana/Veo) | LOW      | S (route to APIs)     |

### Competitive Threats by Severity

**CRITICAL (could erode core value prop):**

- OpenAI GPT-5.4 computer use: First model to beat humans on desktop tasks. When this reaches ChatGPT chat UI (not just Codex), it competes directly with AGI Workforce's desktop automation story. Timeline: likely 2026 H2.
- Claude Cowork expansion: If Anthropic adds multi-model, BYOK, or mobile companion, it directly threatens AGI Workforce's positioning.

**HIGH (strong competitors gaining ground):**

- Cursor background agents + MCP ecosystem: Fastest-growing coding tool. If they expand beyond coding, they become a serious threat.
- Manus + Meta distribution: $2B acquisition + WhatsApp/Instagram/Facebook distribution means Manus could reach billions. General-purpose agent closest to AGI Workforce's vision.

**MEDIUM (watch closely):**

- Google Project Mariner + Gemini 3.1: Google has the models, the distribution, and the Workspace integration. If they ship a standalone desktop app, they compete on every dimension.
- GitHub Copilot agent mode: At $10/mo, it is the cheapest agent. If Microsoft adds non-coding skills, it becomes formidable.

**LOW (niche competitors):**

- Lindy (email/calendar only), Perplexity (search only), Replit (browser IDE only) — unlikely to expand into AGI Workforce's full territory.

### Recommended Strategic Priorities

1. **Ship background agents** (Cursor/Devin parity) — users expect async task completion
2. **Deep Research capability** — ChatGPT, Google, and Perplexity all have it; AGI Workforce should too
3. **PR/issue integration** (GitHub, Linear, Jira) — table stakes for developer adoption
4. **Enterprise features** (SSO/SCIM, audit logs) — required for B2B revenue
5. **Promote BYOK + privacy story** — strongest differentiator vs. every competitor
6. **Mobile companion launch** — zero competition in this space; first-mover advantage

---

## Summary: AGI Workforce's Unique Position

```
                    CODING FOCUSED                    GENERAL PURPOSE
                    +--------------------------------------------------+
                    |                                                  |
    CLOUD-ONLY      |  Devin        Replit       Manus (Meta)          |
                    |  Copilot      Windsurf     Lindy                 |
                    |  Cursor                    Perplexity            |
                    |                                                  |
                    +--------------------------------------------------+
                    |                                                  |
    NATIVE DESKTOP  |  Claude Code               ChatGPT Desktop      |
                    |                            Claude Cowork         |
                    |                            Google Gemini         |
                    |                                                  |
                    |              *** AGI Workforce ***               |
                    |              (Multi-model + BYOK + Local +       |
                    |               Desktop Automation + Mobile +      |
                    |               140 Skills + Model Council +       |
                    |               Unlimited MCP + Voice + Canvas)    |
                    |                                                  |
                    +--------------------------------------------------+
```

AGI Workforce sits in the bottom-right quadrant — native desktop AND general purpose — where no other product exists. This is the position to defend and expand.
