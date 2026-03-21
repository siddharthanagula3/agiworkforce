# Perplexity Computer UI Exploration -- Comprehensive Competitive Analysis

**Date**: 2026-03-19
**Source**: Web research from 20+ sources (live browser blocked by ExtensionsSettings policy on perplexity.ai)
**Product URL**: https://www.perplexity.ai/computer
**Pricing**: $200/month (Max plan), Enterprise pricing custom
**Launched**: February 25, 2026

---

## 1. Home / New Task Page

**URL**: `https://www.perplexity.ai/computer/new`

**Layout**: Clean, minimal dark-themed page centered around a single input area. The design follows Perplexity's Scandinavian subway aesthetic -- clean, considered, invisible.

**Key Elements**:

- Large prompt input field with placeholder text (e.g., "What should we work on next?")
- Templates/suggestions area below the input for common task types
- Prominent "+" button to start new workflows
- Model selector (accessible from the input area -- lets users choose orchestrator model)
- "Live Examples" button in the left sidebar menu for exploring Demo mode
- Credit balance indicator visible in the UI
- File attachment capability ("+ Attach" button in the input area)
- Voice mode input option (shipped March 2026 -- natural conversation within Computer)

**Design Patterns**:

- Dark theme: `#1a1a1a` background, layered surfaces (`#242424`, `#3a3a3a`)
- Accent color: True Turquoise `#1FB8CD` for interactive elements
- Typography: FK Grotesk (brand), FK Grotesk Neue (body copy)
- Off-white text on dark backgrounds
- Minimalist, outcome-focused -- no clutter

**Unique Features**:

- Voice mode for hands-free task description
- Model Council option: run 3 frontier models (GPT-5.4, Claude Opus 4.6, Gemini 3.1 Pro) in parallel and compare outputs
- Credit-based usage system (10,000 credits/month for Max subscribers + 20,000 one-time bonus)
- Tasks run asynchronously in cloud sandbox (2 vCPU, 8GB RAM, Python/Node.js/ffmpeg pre-installed)

---

## 2. Sidebar Navigation

**Layout**: Left sidebar with navigation items, account section, and recent conversations.

**Navigation Items** (confirmed from multiple sources):

| Position | Item                 | Icon                  | Description                          |
| -------- | -------------------- | --------------------- | ------------------------------------ |
| Top      | **Search**           | Magnifying glass      | Traditional Perplexity search mode   |
|          | **Computer**         | Computer/monitor icon | Agent/Computer mode (main product)   |
|          | **New Task**         | "+" icon              | Create a new Computer task           |
|          | **Tasks**            | Checklist/list icon   | View all tasks and their statuses    |
|          | **Files**            | File/folder icon      | Uploaded files and generated outputs |
|          | **Connectors**       | Plug/link icon        | App integrations (400+)              |
|          | **Skills**           | Gear/wrench icon      | Reusable workflow specifications     |
|          | **Use Cases**        | Lightbulb/grid icon   | Workflow examples and templates      |
| Bottom   | **Library**          | Bookmark icon         | Recent threads, bookmarks            |
|          | **Account/Settings** | User avatar           | Account, credits, preferences        |

**Additional Sidebar Features** (March 2026 updates):

- Library pinned to top of menu; hovering reveals bookmarks and expanded recent conversations
- Rename and delete threads directly from sidebar via ellipsis icon
- Customizable shortcuts menu (Finance, Academic, Shopping, etc.) via "Customize menu" option
- Recent conversation history with thread previews
- Chat bubble-style message display for natural back-and-forth

**Design Patterns**:

- Collapsed sidebar with icons; expandable on hover/click
- Dark sidebar matching the overall `#1a1a1a` theme
- Turquoise accent (`#1FB8CD`) for active/selected items
- Consistent icon style throughout

---

## 3. Search Page

**URL**: `https://www.perplexity.ai` (default mode)

**Layout**: Traditional Perplexity search interface -- centered search bar with answer-first results.

**Key Differences from Computer Mode**:

| Feature        | Search Mode                      | Computer Mode                      |
| -------------- | -------------------------------- | ---------------------------------- |
| **Purpose**    | Find and synthesize information  | Do work (build, create, automate)  |
| **Output**     | Formatted answers with citations | Files, apps, reports, automations  |
| **Duration**   | Seconds                          | Minutes to hours (async)           |
| **Background** | No                               | Yes -- close browser, return later |
| **Connectors** | Limited (file search)            | Full 400+ app integrations         |
| **Models**     | Single model per query           | 20 models orchestrated in parallel |
| **Memory**     | Limited                          | Persistent across sessions         |

**Search Modes Available**:

- **Search Mode**: Quick answers using fast AI model (free tier)
- **Research Mode**: Comprehensive analysis of 100s of sources, 3-5 minute reports with citations
- **Model Council**: 3 frontier models in parallel (Max only)

**UI Elements**:

- Model selector in the search input box
- Image generation model selector (Nano Banana, GPT Image-1)
- Result tabs: Links, Images, Videos, Shopping, Places (accessible from top of each thread)
- Source citations with inline references
- Follow-up question suggestions

---

## 4. Tasks Page

**URL**: `https://www.perplexity.ai/computer/tasks`

**Layout**: Task list view showing all active and completed Computer tasks.

**Key Elements**:

- "+" New Task button to open task creation modal
- Task list with status indicators (running, completed, failed, paused)
- Hierarchical task/subtask breakdown visible
- Progress tracking -- clickable tasks showing real-time status
- Step-by-step execution logs (inspection of task execution paths)
- Live status updates for running tasks
- Background task indicators (tasks running while browser is closed)

**Task Creation Modal**:

- Schedule configuration (one-time or recurring)
- Notification settings
- Search mode selector
- Model preference selector
- Source configuration
- File attachment

**Task Statuses**: Running, Completed, Failed, Paused, Queued

**Limitations**:

- No real-time execution replay (unlike Manus AI)
- Limited sandbox visibility during execution
- Credit consumption only visible after task completion via usage dashboard

---

## 5. Files Page

**URL**: `https://www.perplexity.ai/computer/files` (inferred)

**Layout**: Central file storage for uploaded documents and generated outputs.

**Key Elements**:

- File upload area (drag & drop supported, both files and folders)
- "+ Attach" button for manual upload
- Gallery view for images
- Document preview
- File type icons/indicators
- File metadata (size, date, type)

**File Upload Limits** (by plan):

| Plan           | Max File Size | Files/Prompt | Retention |
| -------------- | ------------- | ------------ | --------- |
| Free           | 40 MB         | 10           | 30 days   |
| Plus           | 40 MB         | 10           | 30 days   |
| Pro            | 50 MB         | 10           | 90 days   |
| Enterprise Pro | 1 GB          | -            | 1 year    |

**Supported Formats**:

- Documents: PDF, DOCX, XLSX, CSV, PPTX, TXT, Markdown, JSON
- Images: JPEG, HEIF, PNG, PDF (up to 40MB)

**Spaces Integration** (Pro+):

- Upload up to 50 files per Space (Pro), 500 files (Enterprise Pro)
- Organization-wide file repository for Enterprise
- Sync from Google Drive, SharePoint, OneDrive, Box, Dropbox

---

## 6. Connectors Page

**URL**: `https://www.perplexity.ai/computer/connectors`

**Layout**: Grid/card layout showing available app integrations with search and filtering.

**Key Elements**:

- Search field for finding connectors
- Tabs: **All** | **Connected** | **Available**
- "All categories" dropdown filter
- "+ Custom connector" button (MCP-based custom remote connectors)
- "Enable" button next to each unconnected connector
- Connected status indicator for active integrations
- OAuth authorization flow for connecting

**Connector Count**: 400+ managed OAuth connectors

**Named Connectors** (confirmed from sources):

| Category                | Connectors                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------- |
| **Communication**       | Gmail, Outlook, Slack, Microsoft Teams                                              |
| **Development**         | GitHub, Linear                                                                      |
| **Knowledge & Content** | Notion, Confluence, Google Drive, SharePoint, OneDrive                              |
| **Data & Analytics**    | Snowflake, Databricks, Datadog                                                      |
| **CRM & Sales**         | Salesforce, HubSpot                                                                 |
| **Cloud Storage**       | Google Drive, SharePoint, OneDrive, Box, Dropbox                                    |
| **Finance**             | 40+ live financial tools (SEC filings, FactSet, S&P Global, Coinbase, LSEG, Quartr) |
| **Travel**              | Tripadvisor                                                                         |
| **Project Management**  | Airtable (inferred), Asana                                                          |
| **Customer Support**    | Zendesk                                                                             |
| **Marketing**           | MailChimp                                                                           |
| **Workflow Automation** | Make.com, Integrately, AutomatorPlugin                                              |

**Connector Categories** (inferred from documentation):

- Communication
- Development
- Productivity
- Data & Analytics
- CRM & Sales
- Finance
- Cloud Storage
- Project Management
- Customer Support
- Marketing

**Enterprise-Specific Connectors**:

- Snowflake, Datadog, Salesforce, SharePoint, HubSpot (business-grade)
- Custom connectors via MCP (Model Context Protocol)
- Admin-controlled connector availability per user

**Custom Remote Connectors**:

- Add via "+ Custom connector" button
- Uses MCP protocol (stdio + SSE + streamable HTTP)
- Enterprise admins can install organization-wide

---

## 7. Skills Page

**URL**: `https://www.perplexity.ai/computer/skills` (inferred)

**Layout**: Browsable skill library with tabs for different skill categories.

**Key Elements**:

- Search field for locating skills
- Tabs: **All** | **My Skills** | **Example Skills**
- "+ Create Skill" button
- File upload for importing SKILL.md files
- Skill cards showing name, description, activation context

**Skills System**:

- Skills are markdown-based instruction sets (SKILL.md format)
- Reusable workflow specifications that tell Computer how to handle specific task types
- Auto-activated based on task context (e.g., "create a presentation" activates Slides skill)
- Multiple skills can combine for complex tasks
- Compatible with Claude Code and Codex SKILL.md files (direct import, no rewriting)

**Built-in Perplexity Skills** (confirmed):

- **Slides** -- Activated for presentation creation
- **Research** -- Activated for detailed analysis requests
- **Research Report** -- Formatting research findings
- **Chart** -- Activated for visualization/data charting requests

**Community Super-Skills** (from GitHub ecosystem, 10 categories):

| #   | Skill Name           | Domain                                         |
| --- | -------------------- | ---------------------------------------------- |
| 1   | AI Agent Builder     | Agent architecture, MCP servers, RAG pipelines |
| 2   | Dev & Engineering    | Full-stack development, CI/CD, code review     |
| 3   | Marketing            | Content creation, SEO, campaigns, analytics    |
| 4   | Sales                | Prospecting, outreach, pipeline management     |
| 5   | Finance              | Financial statements, audit prep, forecasting  |
| 6   | Legal                | Contract review, NDA triage, compliance        |
| 7   | Product Management   | PRDs, roadmap prioritization, sprint ops       |
| 8   | Operations & CX      | Ticket triage, KB management, escalation       |
| 9   | Research & Knowledge | Deep research, knowledge graphs, statistics    |
| 10  | Content & Creative   | Video, image generation, web building          |

**Custom Skill Creation**:

- Create for any repeated task
- Computer follows skill instructions automatically without re-explanation
- View, search, delete from "My Skills" tab
- Persistent -- "remembers forever"
- SKILL.md format enables cross-platform portability

---

## 8. Use Cases Page

**URL**: `https://www.perplexity.ai/hub/use-cases` (hub) and in-app via sidebar

**Layout**: Categorized use case gallery showing what Computer can build and automate.

**Use Case Categories** (confirmed):

**Product & Engineering**:

- Pricing/Feature Intelligence Dashboard
- Meeting-to-Ticket Converter (Linear/Jira)
- Quarterly OKR Kickoff Deck
- API Cost Simulator
- App building and deployment

**Research & Analysis**:

- Competitive analysis reports
- Deep research pipelines with visualization
- Data analysis and dashboard creation
- Investment research/due diligence

**Business Operations**:

- Support ticket triage by severity
- Escalation brief preparation
- Monday standup documentation
- CMS powered by Google Docs

**Enterprise Workflow Templates**:

- Legal contract review
- Finance audit support
- Sales call preparation
- Customer support ticket triage

**Creative & Content**:

- Report generation (Excel, PDF)
- Presentation creation
- Content ideation pipelines
- Multi-step creative workflows

**Monitoring & Automation**:

- Continuous autonomous monitoring
- Recurring briefings and reports
- Email/calendar/flight status monitoring
- Condition-based triggers
- Scheduled jobs and proactive actions

---

## 9. Computer Page (Agent Mode)

**URL**: `https://www.perplexity.ai/computer`

**Layout**: The core Computer interface -- a conversational agent view with enhanced capabilities beyond Search.

**Key Elements**:

- Task input area (same as New Task)
- Active task panel showing subtask breakdown
- Model orchestration indicator
- Sub-agent status display
- File/output panel
- Gallery for generated images
- Progress indicators
- Credit usage counter

**How It Works**:

1. User describes a high-level goal in natural language
2. Claude Opus 4.6 (orchestrator) breaks goal into subtasks
3. Routes each subtask to the best specialist model
4. Sub-agents execute in parallel across 20 models
5. Results aggregated and delivered (files, apps, reports)
6. User can close browser -- tasks continue in background

**Model Orchestra** (20 models, 6 confirmed by name):

| Model               | Role                                         |
| ------------------- | -------------------------------------------- |
| **Claude Opus 4.6** | Core reasoning engine, orchestration, coding |
| **Gemini**          | Deep research, sub-agent creation            |
| **GPT-5.2 / 5.4**   | Long-context recall, wide web search         |
| **Grok**            | Fast/lightweight speed-sensitive tasks       |
| **Nano Banana**     | Image generation                             |
| **Veo 3.1**         | Video production                             |
| **GPT-5.3-Codex**   | Specialized coding subagent (March 2026)     |

**Special Features**:

- **Model Council**: Run GPT-5.4, Claude Opus 4.6, and Gemini 3.1 Pro simultaneously, compare where they agree/disagree
- **Voice Mode**: Natural conversation, describe projects, give feedback mid-task without typing
- **Persistent Memory**: Cross-session context retention for ongoing projects
- **Background Execution**: Async task execution in isolated Linux sandbox (Kubernetes pods)
- **Checkpoints**: Review points during execution for user approval

**Sandbox Environment**:

- 2 vCPU, 8GB RAM per task
- Pre-installed: Python, Node.js, ffmpeg, standard Unix tools
- Real filesystem access
- Real browser access
- Isolated Kubernetes pod per session

---

## 10. Settings / Account

**URL**: `https://www.perplexity.ai/account` and related pages

**Key Settings Areas**:

**Account Settings** (`/account`):

- Authentication (Google, Apple, email)
- Subscription management (Free/Pro/Max/Enterprise)
- Profile preferences

**Credits & Usage** (`/account/credits`, `/account/usage`):

- Credit balance display
- Per-thread credit consumption (via overflow menu / three dots)
- Spending limits configuration
- Auto-refill settings
- Usage dashboard with historical tracking

**Preferences**:

- Preferred response language
- Autosuggest toggle (autocompletion of search questions)
- Homepage widgets toggle
- AI model selection (default model preference)
- Image generation model preference
- Theme: Dark mode (forced `#1a1a1a` background) / Light mode
- Sidebar customization ("Customize menu" from "More" menu)

**Enterprise Admin Settings**:

- SSO/SAML authentication
- SCIM provisioning
- Granular admin controls per user
- Connector availability management
- Full audit logging
- SOC 2 Type II certification compliance
- Zero data retention option
- Kill switch for immediate access termination

---

## 11. Task Detail View

**URL**: `https://www.perplexity.ai/computer/tasks/[task-id]` (inferred)

**Layout**: Detailed view of a specific task showing execution progress and outputs.

**Key Elements**:

- Task title and description
- Hierarchical subtask breakdown (live to-do list)
- Clickable subtasks showing real-time status
- Step-by-step execution logs
- Agent assignment display (which model handled which subtask)
- Generated files/outputs panel
- Image gallery for visual outputs
- Credit usage for the task
- Model orchestration indicators

**Limitations** (significant competitive gap):

- **No sandbox visibility** -- cannot watch agent actions in real-time
- **No execution replay** -- unlike Manus AI which shows real-time replay of every agent action
- **No live preview** for coding iterations
- **No streaming output** -- shows nothing while tasks run
- **No execution trace** for debugging
- Credit consumption visible only after completion

---

## 12. Design System & Visual Patterns

### Color Palette

**Core Brand Colors**:
| Token | Hex | Usage |
|-------|-----|-------|
| True Turquoise | `#1FB8CD` | Primary accent, buttons, links |
| Turquoise 100 | `#DEF7F9` | Light accent backgrounds |
| Turquoise 200 | `#92DCE2` | Bright highlights |
| Turquoise 400 | `#2CA0AB` | Mid-tone interactive |
| Turquoise 600 | `#1A6872` | Deep accent |
| Turquoise 700 | `#114F56` | Darker accent |
| Turquoise 800 | `#0B363C` | Darkest accent |
| Primary Black | `#000000` | Text, strokes |
| Paper White | `#FBFAF4` | Off-white background (light mode) |
| Offblack | `#13343B` | Dark backgrounds |
| Terra Cotta | `#A84B2F` | Warm secondary |
| Apricot | `#FFD2A6` | Warm accent |
| Warm Red | `#BF505C` | Alert/warning |
| Olive | `#707C36` | Muted green accent |

**Dark Mode Surface Layers**:

- Background: `#1a1a1a`
- Surface 1: `#242424`
- Surface 2: `#3a3a3a`

### Typography

- **Brand**: FK Grotesk -- Scandinavian subway aesthetic, large family, multilingual
- **Body**: FK Grotesk Neue -- optimized legibility for long text
- **Design philosophy**: "Clean and considered but in an invisible sort of way"

### UI Patterns

- Forced dark theme by default (`#1a1a1a` regardless of system preference)
- Chat bubble message display (March 2026 update)
- Minimalist, outcome-focused layout
- Card-based connector/skill galleries
- Turquoise accent for all interactive elements
- Layered dark surfaces for visual depth
- Icon-first sidebar navigation

---

## 13. March 2026 Feature Updates (Changelog)

| Date   | Feature                        | Details                                                    |
| ------ | ------------------------------ | ---------------------------------------------------------- |
| Mar 6  | **Custom Skills**              | Create reusable capabilities, auto-apply to relevant tasks |
| Mar 6  | **Model Council**              | Run GPT-5.4 + Opus 4.6 + Gemini 3.1 Pro in parallel        |
| Mar 6  | **Voice Mode in Computer**     | Natural conversation for task description/feedback         |
| Mar 6  | **GPT-5.3-Codex Subagent**     | Thousands of lines of production code, GitHub push         |
| Mar 6  | **GPT-5.4 + GPT-5.4 Thinking** | Latest OpenAI models for Pro and Max                       |
| Mar 11 | **Everything is Computer**     | Unified architecture announcement                          |
| Mar 11 | **Personal Computer**          | Dedicated Mac Mini, 24/7 local apps + cloud                |
| Mar 11 | **Computer for Enterprise**    | Business connectors, admin controls, audit logs            |
| Mar 11 | **Developer API**              | Standalone code execution environment (Python, JS, SQL)    |
| Mar    | **Chat Bubbles**               | Simplified message display as chat bubbles                 |
| Mar    | **Sidebar Library**            | Library at top, hover for bookmarks/recent                 |
| Mar    | **Thread Management**          | Rename/delete from sidebar ellipsis                        |
| Mar    | **Menu Customization**         | Customize sidebar shortcuts (Finance, Academic, etc.)      |
| Mar    | **Result Tabs**                | Links, Images, Videos, Shopping, Places at top of threads  |

---

## 14. Competitive Gaps vs AGI Workforce

### Where Perplexity Computer WINS

| Feature                           | Perplexity | AGI Workforce Status                |
| --------------------------------- | ---------- | ----------------------------------- |
| 400+ OAuth connectors             | Shipping   | 26 connectors (adding 10 more)      |
| 20-model orchestration            | Shipping   | 9+ providers, no auto-orchestration |
| Background async tasks            | Shipping   | No background task queue            |
| Persistent memory across sessions | Shipping   | Memory store exists but limited     |
| Skills/SKILL.md system            | Shipping   | No SKILL.md support                 |
| Voice mode in agent               | Shipping   | Voice mode exists but not in agent  |
| Model Council (3-model compare)   | Shipping   | No equivalent                       |
| Enterprise SSO/SCIM/SOC2          | Shipping   | No enterprise features              |
| $200/month pricing established    | Shipping   | No pricing model                    |
| Live financial data (40+ tools)   | Shipping   | No financial data connectors        |
| Personal Computer (Mac Mini)      | Shipping   | Desktop-native (Tauri) is better    |

### Where AGI Workforce WINS

| Feature                        | AGI Workforce | Perplexity Gap           |
| ------------------------------ | ------------- | ------------------------ |
| Desktop-native (Tauri)         | Shipping      | Web-only, no desktop app |
| Local LLM support (Ollama)     | Shipping      | Cloud-only models        |
| BYOK (Bring Your Own Key)      | Shipping      | No BYOK                  |
| Mobile companion (QR pair)     | Shipping      | No mobile app            |
| Real-time execution visibility | Shipping      | No sandbox visibility    |
| MCP without limits             | Shipping      | MCP support but limited  |
| 150+ non-coding skills         | Shipping      | ~50 skill playbooks      |
| Browser extension              | Shipping      | No browser extension     |
| VS Code extension              | Shipping      | No IDE extension         |
| Free tier available            | Yes           | Max-only ($200/mo)       |
| Execution replay/trace         | Partial       | None                     |

### Priority Features to Steal from Perplexity

1. **Connector Ecosystem**: Scale from 26 to 100+ connectors with OAuth flow
2. **SKILL.md Support**: Import Claude Code / Perplexity SKILL.md files directly
3. **Background Task Queue**: Async task execution with close-and-return model
4. **Model Council**: Compare 3 model outputs side-by-side
5. **Auto-Model Routing**: Intelligent orchestration like Opus-based task routing
6. **Voice Mode in Agent**: Speak tasks, give mid-task verbal feedback
7. **Enterprise Package**: SSO/SCIM, admin controls, audit logging, SOC 2

---

## Sources

- [Awesome Agents Review](https://awesomeagents.ai/reviews/review-perplexity-computer/)
- [LowCode Agency Review](https://www.lowcode.agency/blog/perplexity-computer-review)
- [Builder.io Review](https://www.builder.io/blog/perplexity-computer)
- [AI.cc Complete Guide](https://www.ai.cc/blogs/perplexity-computer-complete-guide-ai-digital-worker-2026/)
- [TestingCatalog Skills](https://www.testingcatalog.com/perplexity-rolling-out-skills-support-for-perplexity-computer/)
- [FunBlocks AI Skills Review](https://www.funblocks.net/aitools/reviews/perplexity-computer-skills)
- [Releasebot March 2026 Updates](https://releasebot.io/updates/perplexity-ai)
- [The Register Enterprise](https://www.theregister.com/2026/03/12/perplexity_extends_cloud_computer_to_enterprise/)
- [VentureBeat Enterprise](https://venturebeat.com/technology/perplexity-takes-its-computer-ai-agent-into-the-enterprise-taking-aim-at)
- [Eesel.ai Guide](https://www.eesel.ai/blog/perplexity-computer)
- [BizRescuePro Guide](https://www.bizrescuepro.com/perplexity-computer-is-insane-how-to-10x-your-productivity-with-model-agnostic-automation/)
- [Perplexity Help Center](https://www.perplexity.ai/help-center/en)
- [Perplexity Changelog](https://www.perplexity.ai/changelog/what-we-shipped---march-6-2026)
- [TheSys.dev Guide](https://www.thesys.dev/blogs/perplexity-computer)
- [TheNeuron Explainer](https://www.theneuron.ai/explainer-articles/perplexity-wants-to-replace-your-computer-with-19-ais/)
- [TechNerdiness Guide](https://www.technerdiness.com/perplexity/perplexity-computer-guide/)
- [GitHub Super-Skills](https://github.com/get-zeked/perplexity-super-skills)
- [Perplexity Design System](https://live.standards.site/perplexity/color)
- [PartnerFleet Integrations](https://www.partnerfleet.io/blog/perplexity-integrations-you-should-know-about-in-2026)
- [Gend.co Enterprise](https://www.gend.co/blog/perplexity-computer-for-enterprise)
