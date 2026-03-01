# Perplexity Computer -- Official Documentation Research

**Research Date**: 2026-02-28
**Launch Date**: February 25, 2026
**Product**: Perplexity Computer
**Status**: Live (Max subscribers only)

---

## 1. Product Overview

Perplexity Computer is a cloud-based, multi-model AI orchestration platform that functions as a "general-purpose digital worker." It unifies files, tools, memory, and AI models into a single system capable of planning and executing complex, long-running projects end-to-end.

**Official positioning**: Perplexity Computer is described as "what a personal computer in 2026 should be -- personal to you, remembers your past work, and is secure by default."

While Perplexity (the search engine) answers your questions, Computer does your work -- it writes docs, builds slides, sends emails, browses the web, writes code, connects to your apps, and chains multi-step workflows together.

**CEO Aravind Srinivas** (Fortune interview): "When you build a team, you don't build a homogenous group where everyone has the same skills. You build a team with diverse strengths. We're applying that same logic to AI workflows. The orchestration is the product. The model is a tool."

**On ease of use** (Srinivas): "Even your mom can text on the app and delegate tasks," comparing favorably to OpenClaw which "took our own engineers a long time to set up."

**On the agent experience** (Srinivas): "It finally feels like I have a swarm of agents working for me. I know that's a buzzword that everyone uses, but this is the first moment I've actually felt it."

**On development timeline** (Srinivas): "What has Perplexity been up to last two months? We've silently been working on the next big thing: Perplexity Computer."

---

## 2. Core Capabilities

### 2.1 Multi-Model Orchestration (19 Models)

The system routes tasks across 19 different AI models simultaneously. Claude Opus 4.6 serves as the central reasoning engine and orchestrator, breaking user requests into subtasks and matching each to the optimal model.

**Named Models (6 of 19 confirmed)**:

| Model | Provider | Role |
|-------|----------|------|
| Claude Opus 4.6 | Anthropic | Core reasoning engine, orchestration, coding |
| Google Gemini | Google | Deep research, sub-agent creation |
| ChatGPT 5.2 | OpenAI | Long-context recall, comprehensive web search |
| Grok | xAI | Lightweight/fast tasks |
| Nano Banana | Google | Image generation |
| Veo 3.1 | Google | Video production |

The remaining 13 models are not publicly named. The lineup can change as models evolve, and users can manually assign specific models to subtasks.

**Key quote (Srinivas, Fortune)**: "The model layer is the most competitive it's ever been." Over 50% of enterprise users already use multiple models daily.

### 2.2 Sub-Agent Architecture

Computer decomposes complex tasks into smaller subtasks and creates specialized sub-agents to handle them:
- Sub-agents operate simultaneously and asynchronously
- Parallel execution across multiple Computer instances
- Sub-agents autonomously perform web research, document creation, data processing, and API calls
- The system can "find API keys, research additional information, program applications if needed, and only contacts the user when truly necessary"
- Dashboard displays progress for multiple workflows

### 2.3 Long-Running Workflows

- Tasks can run for **hours, weeks, or even months**
- Background task execution while user is away
- Hundreds of parallel projects can be managed simultaneously
- Users are notified only when decision input is needed

### 2.4 Research Capabilities

Computer runs **seven parallel search types simultaneously** (not sequentially):
1. Web search
2. Academic search
3. People search
4. Image search
5. Video search
6. Shopping search
7. Social search

It reads full source pages (not snippets) and cross-references findings across sources. Research deliverables include timeline charts and source disagreement analysis.

### 2.5 Persistent Memory

- Maintains memory across sessions
- Retains past work, user preferences, and files
- Context persists without re-explaining in new conversations

### 2.6 Monitoring and Triggers

- Can monitor email, calendar, flight status, and files
- Supports condition-based triggers
- Supports scheduled jobs

### 2.7 What It Can Build

Per official examples and reviews:
- Personal finance dashboards with live data
- Branded micro-apps (callout generators, table generators)
- Presentations and slides
- 4,000-row spreadsheets (done overnight, would take a week manually)
- Engineering documentation
- Monthly PDF reports with automatic updates
- Competitive analysis reports
- Marketing assets
- Deployed web applications (directly to GitHub)

---

## 3. Integrations & Connectors

### 3.1 App Connectors (400+ claimed)

**Confirmed integrations**:
- Gmail and Google Calendar (send emails, create invites)
- Outlook
- GitHub
- Linear
- Slack
- Notion
- Snowflake
- Databricks
- Salesforce
- Google Drive
- OneDrive
- SharePoint
- Dropbox
- Box
- Asana
- Jira
- Confluence
- FactSet (existing customers)
- Wiley (existing customers)

### 3.2 Execution Environment Access

Within the sandbox, Computer has access to:
- Real file system
- Command-line utilities
- Web browser with real-time internet access
- API connectors to external services

---

## 4. Pricing & Availability

### 4.1 Subscription Requirement

| Plan | Price | Computer Access | Status |
|------|-------|----------------|--------|
| **Perplexity Max** | $200/month | Yes -- immediate | Live |
| **Perplexity Pro** | $20/month | Coming soon | After load testing |
| **Enterprise** | Custom | Coming soon | After load testing |

### 4.2 Credits System

- **Usage-based pricing** with optional sub-agent model selection and spending caps
- Max users get **10,000 credits per month** included
- **One-time bonus**: 20,000 extra credits at launch (existing users) or at signup (new users), expiring 30 days after granted
- Users can choose different models for different sub-agent tasks
- Users can set spending caps to control token spend
- Per-token consumption model

### 4.3 Official Perplexity Statement on Pricing

From Perplexity's official Threads/X post: "Perplexity Computer uses usage-based pricing with optional sub-agent model selection and spending caps. Choose different models for different sub-agent tasks and control token spend. Max users get 10,000 credits per month included with their subscription. We're also giving a one-time bonus of 20,000 extra credits, granted at launch for existing users and at signup for new users, that expires 30 days after it's granted."

### 4.4 Access Method

- Available on **web desktop only** (no mobile)
- No additional setup or installation required
- Access via Home page > Computer icon
- No terminal, API keys, or permission configuration needed

---

## 5. Safety & Security Architecture

### 5.1 Sandboxed Execution

- Runs in a **safe, isolated development sandbox**
- Misbehavior is fenced off from primary network and data stores
- When the task finishes, the sandbox is discarded
- No local setup, no OAuth drama, no provider bans
- No self-modifiable identity files

### 5.2 Cloud-Only Approach (vs. OpenClaw)

**Critical distinction**: Unlike OpenClaw (which runs locally on user machines with deep file/password access), Perplexity Computer runs **entirely in the cloud** in Perplexity's own infrastructure. This:
- Eliminates risk of AI affecting local PC and files
- Prevents the ecosystem collapse OpenClaw experienced (Google suspended Antigravity users, providers banned flat-rate accounts)
- Trades local control for safety

### 5.3 Safety Design Principles

- Sandboxed execution
- Human checkpoint gates (intervention points for irreversible changes)
- Scoped permissions (least-privilege access)
- Controlled connectors
- Usage-based permissions
- Aligns with NIST AI Risk Management Framework
- Aligns with OWASP Top 10 for LLM Applications

### 5.4 Infrastructure Security

- Cloudflare DDoS protection (network and application layer)
- Web Application Firewall (WAF)
- Rate limiting
- SSL/TLS encryption on all traffic

---

## 6. Competitive Positioning

### 6.1 vs. OpenClaw (OpenAI)

| Aspect | Perplexity Computer | OpenClaw |
|--------|-------------------|----------|
| Execution | Cloud sandbox | Local machine |
| Setup | Zero config | Terminal, API keys, permissions |
| Safety | Isolated sandbox | Full system access |
| Risk | Limited local impact | Compared to "malware" risks |
| Ecosystem | Stable cloud | Provider bans, ecosystem collapse |

Srinivas emphasized Computer eliminates setup complexity and offers safety advantages of cloud isolation.

### 6.2 vs. Claude (Anthropic)

- Computer *uses* Claude Opus 4.6 as its reasoning backbone
- Claude offers direct desktop manipulation; Computer does not
- Overlapping features: web search, file analysis, code generation
- Claude Cowork = single-model specialist requiring machine stay powered
- Computer = cloud-based multi-model generalist supporting week-long async execution

### 6.3 Model-Agnostic Strategy

Perplexity positions itself as a **model-agnostic broker**, contrasting with:
- OpenAI Frontier (favors own models)
- Google Agent2Agent (favors own models)
- Anthropic Cowork (favors own models)

Srinivas received "congratulations messages from Anthropic and Google" on launch and stated willingness to adapt if API access changes.

---

## 7. Limitations & Known Issues

### 7.1 Confirmed Limitations

- **No desktop control** -- cannot manipulate local machine (unlike Claude, OpenClaw)
- **Cloud-only** -- requires internet connectivity, no offline operation
- **Web desktop only** -- not available on mobile
- **Max-only** at launch ($200/month barrier)
- **Generated watermarks** on some outputs (reported as trainable/removable)
- **Requires meaningful human oversight** for certain operations -- existing AI systems deemed "not reliable enough" for fully autonomous functions

### 7.2 Open Questions (Unresolved)

- Sub-agent disagreement handling protocols not specified
- Prompt misinterpretation consequences within sandbox
- Memory management strategies for multi-month task persistence
- Model lineup stability amid API deprecation cycles
- Detailed failure recovery procedures not documented
- Complete list of all 19 models not disclosed

### 7.3 Adoption Challenge

From independent review: "Most people will open Computer, try a few prompts, get mediocre results" and assume it is overhyped. Success depends on knowing "the right prompts, the right project structures, and the right mental models." Users should specify *outcomes* rather than procedural steps.

---

## 8. Internal Usage at Perplexity

Per official and press sources, Perplexity employees use Computer for:
- Code debugging
- Metrics analysis
- Marketing asset generation
- Publishing engineering documentation
- Building large spreadsheets (4,000-row spreadsheet overnight that would have taken a week manually)
- Often accessed via Slack or mobile

---

## 9. Launch Metrics

- Blog post achieved **12 million X (Twitter) views in 20 hours**
- Described by Semafor as a "super agent"
- Characterized as "the next level of vibe coding"
- Perplexity now positioned as "the largest multi-model reseller in consumer AI"

---

## 10. Example Use Cases (Official)

1. **Personal Finance Dashboard**: "Build me a personal finance dashboard... pull live NAVs, shows portfolio performance" -- system researches APIs, designs architecture, writes code, deploys
2. **Real Estate Monitoring**: Track trends and deliver monthly PDF reports with automatic updates over months
3. **Competitive Analysis**: Analyze competitors, scrape data, write creative content, generate marketing ideas simultaneously
4. **Job Application Automation**: Weekly updates, resume tailoring, application tracking
5. **Branded Micro-Apps**: Callout box generators, table generators from brand guidelines
6. **Research Packets**: Cross-source analysis documents with timeline charts

---

## 11. Source Index

### Official Perplexity Sources
- Perplexity Blog: https://www.perplexity.ai/hub/blog/introducing-perplexity-computer (403 -- blocked for direct fetch)
- Help Center: https://www.perplexity.ai/help-center/en/articles/13837784-what-is-computer
- Pricing Thread: https://www.threads.com/@perplexity/post/DVMAlTLFJyJ/
- Pricing Tweet: https://x.com/perplexity_ai/status/2026695793537855526
- App Connectors: https://www.perplexity.ai/help-center/en/collections/15347354-app-connectors
- Max Plan: https://www.perplexity.ai/help-center/en/articles/11680686-perplexity-max
- Credits: https://www.perplexity.ai/help-center/en/articles/13838041-how-credits-work-on-perplexity
- Security: https://www.perplexity.ai/hub/security

### Tier 1 Press Coverage
- Fortune (CEO interview): https://fortune.com/2026/02/26/perplexity-ceo-aravind-srinivas-computer-openclaw-ai-agent/
- TechCrunch: https://techcrunch.com/2026/02/27/perplexitys-new-computer-is-another-bet-that-users-need-many-ai-models/
- VentureBeat: https://venturebeat.com/technology/perplexity-launches-computer-ai-agent-that-coordinates-19-models-priced-at
- Semafor: https://www.semafor.com/article/02/25/2026/perplexity-launches-computer-super-agent
- PCWorld: https://www.pcworld.com/article/3073456/perplexity-computer-is-agentic-ai-like-openclaw-but-safer.html

### Detailed Reviews
- Substack (hands-on): https://karozieminski.substack.com/p/perplexity-computer-review-examples-guide
- The AI Corner (complete guide): https://www.the-ai-corner.com/p/perplexity-computer-complete-guide
- Implicator (19 models): https://www.implicator.ai/perplexity-launches-computer-an-agent-platform-orchestrating-19-ai-models-at-once/
- TrendingTopics EU: https://www.trendingtopics.eu/perplexity-computer-orchestrates-19-ai-models-to-execute-month-long-workflows/

### Additional Coverage
- Business Today: https://www.businesstoday.in/technology/story/aravind-srinivas-unveils-perplexity-computer-an-ai-system-that-runs-projects-end-to-end-518013-2026-02-26
- Business Standard: https://www.business-standard.com/technology/tech-news/aravind-srinivas-perplexity-computer-ai-digital-worker-projects-details-126022600193_1.html
- PYMNTS: https://www.pymnts.com/artificial-intelligence-2/2026/perplexity-enters-autonomous-ai-race-with-launch-of-computer/
- Free Press Journal: https://www.freepressjournal.in/tech/perplexity-computer-unveiled-what-is-it-how-to-use-it
- StartupNews: https://startupnews.fyi/2026/02/26/perplexity-computer-ceo-aravind-srinivas-unveils-the-companys-next-big-thing/
- AI Gyani Review: https://aigyani.com/perplexity-computer-review/
