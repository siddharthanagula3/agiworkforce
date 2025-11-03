# AGI Workforce - Product Requirements Document v4.0

**Status:** Active
**Version:** 4.0
**Last Updated:** 2025-10-31
**Author:** Product Team

---

## Document Change Log

**v4.0 (2025-01-26):**
- **CRITICAL FIXES:** Corrected financial projections to align with pricing model
- **SCOPE CLARIFICATION:** Documented realistic 16-month timeline for all 16 MCPs in v1.0
- **PRICING SIMPLIFICATION:** Removed confusing AGI Tokens, implemented clear task-based limits
- **CONSOLIDATED:** Single source of truth, archived v3.0 and v3.1
- **2025-10-31 UPDATE:** Added implementation alignment snapshot reflecting audit progress and updated cost dashboard readiness status

**v3.1 (previous):**
- Introduced AGI Token metering (REMOVED in v4.0)
- $6M ARR target from 5,000 users (MATHEMATICALLY IMPOSSIBLE - FIXED in v4.0)

**v3.0 (previous):**
- Per-task billing model
- 10,000 user target

---

## Executive Summary

### Vision
AGI Workforce is an **AI-powered desktop automation platform** that enables users to automate complex, multi-step workflows across Windows applications, browsers, and productivity tools using natural language commands.

### The Problem
- Users spend 40% of their workday on repetitive tasks (McKinsey)
- Existing automation tools require technical expertise (scripting, APIs)
- Enterprise RPA solutions cost $50K-$500K annually
- Consumer AI tools lack desktop integration and workflow orchestration

### Our Solution
A **desktop application** that combines:
1. **Natural language interface** - Describe tasks in plain English
2. **Multi-LLM routing** - Intelligent selection of optimal AI model for each task
3. **Native Windows automation** - Direct integration with UI Automation API
4. **Browser automation** - Playwright for web workflows
5. **16 Modular Control Primitives (MCPs)** - Extensible automation capabilities
6. **Cost optimization** - Smart caching and local execution to minimize AI spend

### Market Opportunity
- **TAM:** $12B global RPA market (Gartner 2024)
- **SAM:** $3.2B SMB automation market
- **SOM:** $180M (5% of SAM over 3 years)

### Strategic Imperative
- **Beat Lovable by Month 5:** Ship feature parity by Day 45, then outpace with native desktop depth, automation marketplace, and enterprise-grade guardrails.
- **Reach $100M ARR in 150 days:** Blend PLG volume (120K self-serve seats) with 220 Lovable displacement wins averaging $38K ARR each.

### Business Model
- **Pricing:** Three-tier GTM
  - **Pro ($29/month):** Individual operators with 100 automations/day
  - **Scale ($199/seat/month):** Teams with shared workspaces, SOC 2 guardrails
  - **Enterprise ($4K+/month logo):** Outcome-based pricing for Fortune 2000 automation backlogs
- **North Star:** Beat Lovable’s growth curve and cross **$100M ARR in 5 months**
- **Revenue Trajectory (modelled with 20% MoM logo growth + enterprise landings):**
  - **Month 1 (Design Partner Wave):** $1.2M ARR – 1,500 Pro, 120 Scale seats, 8 enterprise logos
  - **Month 3 (Lovable Parity Release):** $18.5M ARR – 22,000 Pro, 3,400 Scale seats, 60 enterprise logos
  - **Month 5 (Lovable Displacement Sprint):** **$102M ARR** – 120,000 Pro, 24,000 Scale seats, 220 enterprise logos averaging $38K ARR

### Timeline to Lovable Displacement
- **Day 0-45:** Ship Lovable parity (core MCPs, Windows + browser automation) with AI pair-programming pods
- **Day 46-90:** Hyper-personalization + automation marketplace, regional language support, launch Scale tier
- **Day 91-150 (Month 5):** Enterprise control plane, SOC 2 readiness, outbound Lovable displacement program to hit $100M ARR
- **Velocity Enablers:** Claude Max 20×, Codex Pro, dedicated SDR + partner squad, weekly product-led growth experiments

---

## 1. Product Overview

### 1.1 Product Description

AGI Workforce is a **Tauri-based desktop application** for Windows that serves as an intelligent automation companion. Users interact via a **persistent sidebar chat interface** (360-480px width) that remains accessible while working in any application.

**Key Differentiators:**
1. **Native Windows integration** - UI Automation API for reliable desktop control
2. **Cost transparency** - Real-time cost tracking with per-task breakdown
3. **Multi-LLM optimization** - Automatic routing to cheapest capable model
4. **Overlay visualization** - See automation actions in real-time on screen
5. **Extensibility** - 16 MCPs for email, calendar, databases, code editing, etc.

### 1.2 Target Users

**Primary Personas:**

**1. Knowledge Worker (40% of users)**
- **Profile:** Analyst, researcher, project manager
- **Use Cases:** Data extraction, report generation, email triage, calendar management
- **Pain Point:** Spends 15+ hours/week on copy-paste tasks
- **Willingness to Pay:** $29-49/month

**2. Developer (35% of users)**
- **Profile:** Software engineer, DevOps, QA engineer
- **Use Cases:** Test automation, deployment workflows, code scaffolding, log analysis
- **Pain Point:** Context switching between tools kills productivity
- **Willingness to Pay:** $29-99/month

**3. Executive Assistant (15% of users)**
- **Profile:** EA, admin, operations coordinator
- **Use Cases:** Calendar scheduling, travel booking, expense processing, CRM updates
- **Pain Point:** Juggling 5+ tools to complete single workflows
- **Willingness to Pay:** $29/month (employer-paid)

**4. Small Business Owner (10% of users)**
- **Profile:** Solopreneur, freelancer, consultant
- **Use Cases:** Invoice generation, client onboarding, social media posting
- **Pain Point:** Can't afford VA or RPA consultants
- **Willingness to Pay:** $19-29/month

### 1.3 Value Proposition

**For Knowledge Workers:**
> "Automate your repetitive workflows in plain English - no coding, no surprise bills. Get 10 hours back every week."

**For Developers:**
> "AI-powered automation that works with your existing tools. Native Windows control, browser automation, and code generation in one interface."

**For Executives:**
> "Turn your team's tribal knowledge into reliable automation. Track every dollar spent on AI, prevent shadow AI sprawl."

---

## 2. Core Features & Functionality

### 2.1 v1.0 MVP Scope (Day 0-90 Lovable Parity Build)

**Core Platform (Days 0-30):**
- ✅ Desktop application (Tauri 2.0)
- ✅ Persistent sidebar window (360-480px, always-on-top)
- ✅ Chat interface with conversation history
- ✅ Multi-LLM router (OpenAI, Anthropic, Google, Ollama)
- ✅ Cost tracking dashboard (real-time token/cost breakdown)
- ✅ Settings panel (API keys, router rules, permissions)

**16 Modular Control Primitives (MCPs):**

**1. Windows Automation MCP (Days 14-28)**
- UI Automation integration for native Windows apps
- Keyboard/mouse input simulation
- Screen capture (DXGI) with OCR (Tesseract)
- Overlay visualization (click ripples, typing animation, region highlights)

**2. Browser Automation MCP (Days 21-35)**
- Playwright bridge (Chromium, Firefox, WebKit)
- Browser extension for deep DOM access
- Tab management, cookie handling, session persistence
- Screenshot capture and element highlighting

**3. Code Editor MCP (Days 28-42)**
- Monaco Editor integration (VS Code editor component)
- File tree navigation with search
- Multi-tab editing with diff viewer
- Language services (TypeScript, Python, Rust, Go, JavaScript)

**4. Terminal MCP (Days 35-49)**
- Pseudo-terminal (PTY) integration
- Support for PowerShell, CMD, WSL, Git Bash
- Multiple terminal sessions with tabs
- Command history and output search

**5. Filesystem MCP (Days 42-56)**
- File CRUD (create, read, update, delete, rename, move)
- Directory traversal with glob patterns
- File watching for real-time updates
- Permission management and sandboxing

**6. Database MCP (Days 49-63)**
- SQL support (PostgreSQL, MySQL, SQLite)
- NoSQL support (MongoDB, Redis)
- Query builder with syntax highlighting
- Connection pooling and error retry

**7. API MCP (Days 56-70)**
- HTTP client with OAuth 2.0, API key, and Bearer token auth
- Request templating with variable substitution
- Automatic retry with exponential backoff
- Response parsing (JSON, XML, HTML)

**8. Communications MCP (Days 63-77)**
- IMAP client (Gmail, Outlook, custom servers)
- SMTP client for sending emails
- Email parsing (MIME, attachments, inline images)
- Contact management with vCard support

**9. Calendar MCP (Days 70-84)**
- Google Calendar API integration
- Microsoft Outlook Calendar API
- Event CRUD (create, read, update, delete)
- Reminder notifications and time zone handling

**10. Productivity MCP (Days 77-91, parallel)**
- Notion API (pages, databases, blocks)
- Trello API (boards, lists, cards)
- Asana API (projects, tasks, subtasks)
- Unified interface for cross-platform task management

**11. Cloud Storage MCP (Days 77-91, parallel)**
- Google Drive API (upload, download, search, share)
- Dropbox API (files, folders, team folders)
- Microsoft OneDrive API (Microsoft Graph)
- Unified file operations across all providers

**12. Document MCP (Days 77-91, parallel)**
- PDF parsing (text extraction, page manipulation)
- Office document parsing (DOCX, XLSX, PPTX via LibreOffice)
- Markdown rendering and export
- Document format conversion pipeline

**13. Media MCP (Days 77-91, parallel)**
- Image processing (resize, crop, compress, format conversion)
- Video thumbnail generation and metadata extraction
- Audio transcription (Whisper integration)
- OCR for scanned documents

**14. Security MCP (Days 77-91, parallel)**
- System keyring integration (Windows Credential Manager)
- Secret encryption (AES-256-GCM)
- Permission guardrails (app whitelisting, dangerous action confirmations)
- Audit logging for compliance

**15. Workflow MCP (Days 77-91, parallel)**
- State machine orchestration for multi-step workflows
- Conditional branching and error handling
- Scheduled execution (cron-like triggers)
- Workflow templates and sharing

**16. Mobile Companion MCP (Days 63-91, parallel)**
- React Native app (iOS + Android)
- WebRTC P2P connection for low-latency remote control
- QR code pairing with signaling server
- Remote screen preview and mobile-triggered actions

### 2.2 Out of Scope for v1.0 (Future Releases)

**v1.1+ Features:**
- macOS and Linux support
- Team collaboration (shared workflows, permission management)
- Enterprise SSO (SAML, OAuth)
- On-premise deployment
- Kubernetes and Docker MCPs
- CI/CD pipeline integration (GitHub Actions, Jenkins)
- Advanced OCR models (GPT-4V, Claude Vision)
- Voice command interface

---

## 3. Technical Architecture

### 3.1 Technology Stack

**Frontend:**
- **Framework:** React 18 with TypeScript (strict mode)
- **Build Tool:** Vite 5 with SWC for fast compilation
- **UI Library:** Radix UI primitives + Tailwind CSS
- **State Management:** Zustand with persist middleware
- **Editor:** Monaco Editor (VS Code component)
- **Terminal:** xterm.js with PTY backend
- **Routing:** React Router 6

**Backend (Rust):**
- **Framework:** Tauri 2.0 (webview-based)
- **Async Runtime:** Tokio 1.37 (multi-threaded)
- **Database:** SQLite with rusqlite (embedded)
- **HTTP Client:** reqwest with retry middleware
- **Windows API:** windows-rs crate for UI Automation
- **Browser Automation:** Playwright (via Node.js bridge)
- **WebRTC:** webrtc-rs for mobile P2P

**Infrastructure:**
- **Deployment:** Direct download from website (no app store)
- **Updates:** Tauri's auto-updater with digital signatures
- **Crash Reporting:** Sentry (Rust + JavaScript)
- **Analytics:** PostHog (self-hosted)

### 3.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐     │
│  │ Chat UI      │  │ Settings UI  │  │  Cost Dashboard│     │
│  │ (Zustand)    │  │ (Form)       │  │  (Recharts)    │     │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘     │
│         │                  │                   │              │
│         └──────────────────┴───────────────────┘              │
│                            │                                  │
│                  ┌─────────▼──────────┐                      │
│                  │   Tauri IPC Bridge  │                      │
│                  └─────────┬──────────┘                      │
└─────────────────────────────┼───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                    BACKEND (Rust/Tokio)                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              LLM Router & Cost Manager                 │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │  │
│  │  │ OpenAI   │  │ Anthropic│  │  Google  │           │  │
│  │  │ Provider │  │ Provider │  │ Provider │  + Ollama │  │
│  │  └──────────┘  └──────────┘  └──────────┘           │  │
│  └───────────────────────────────────────────────────────┘  │
│                             │                                 │
│  ┌────────────────────┬────┴────┬─────────────────────┐     │
│  │                    │         │                      │     │
│  ▼                    ▼         ▼                      ▼     │
│ ┌────────┐  ┌──────────────┐  ┌─────────┐  ┌────────────┐  │
│ │Windows │  │   Browser    │  │Terminal │  │ Filesystem │  │
│ │  MCP   │  │     MCP      │  │  MCP    │  │    MCP     │  │
│ │(UIA)   │  │(Playwright)  │  │(PTY)    │  │(notify)    │  │
│ └────────┘  └──────────────┘  └─────────┘  └────────────┘  │
│                                                               │
│ ┌────────┐  ┌──────────────┐  ┌─────────┐  ┌────────────┐  │
│ │Database│  │    API       │  │  Comms  │  │  Calendar  │  │
│ │  MCP   │  │    MCP       │  │  MCP    │  │    MCP     │  │
│ │(SQL)   │  │(HTTP+OAuth)  │  │(IMAP)   │  │(Google)    │  │
│ └────────┘  └──────────────┘  └─────────┘  └────────────┘  │
│                                                               │
│ ┌─────────────┐  ┌────────────┐  ┌───────────┐             │
│ │Productivity │  │Cloud Storage│  │ Document  │  + 4 more  │
│ │    MCP      │  │    MCP      │  │   MCP     │    MCPs    │
│ │(Notion)     │  │(GDrive)     │  │(PDF/DOCX) │             │
│ └─────────────┘  └────────────┘  └───────────┘             │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │               SQLite Database                          │  │
│  │  - Conversations & Messages                            │  │
│  │  - Cost tracking (token counts, provider, model)       │  │
│  │  - Settings (API keys encrypted with OS keyring)       │  │
│  │  - Automation history & overlay event replay           │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

### 3.3 Data Flow

**Example: "Click the Submit button in Chrome"**

1. **User Input (Frontend):**
   - User types command in chat interface
   - React sends message via `invoke('chat_send_message', { content, conversationId })`

2. **LLM Routing (Backend):**
   - Rust command handler receives message
   - LLM Router analyzes task type: "Browser action - simple click"
   - Routes to cheapest capable model (e.g., GPT-4o-mini)
   - Sends request: `{ task: "Parse intent", context: "user wants to click Submit in Chrome" }`

3. **Intent Parsing (LLM Response):**
   - LLM returns structured JSON:
     ```json
     {
       "action": "browser_click",
       "target": { "selector": "button[type='submit']", "text": "Submit" },
       "browser": "chrome"
     }
     ```

4. **MCP Execution (Browser MCP):**
   - Browser MCP receives parsed action
   - Finds Chrome window via UI Automation
   - Launches Playwright, connects to Chrome DevTools Protocol
   - Executes: `page.click('button[type="submit"]')`
   - Emits overlay event: `overlay_emit_click(x, y, 'left')`

5. **Overlay Visualization:**
   - Overlay window receives event
   - Renders ripple effect at click coordinates
   - Records event to SQLite for replay

6. **Cost Tracking:**
   - Rust backend calculates cost:
     - Input tokens: 42, Output tokens: 15
     - Model: gpt-4o-mini ($0.15/$0.60 per 1M tokens)
     - Cost: $0.000015
   - Stores in SQLite: `(conversation_id, message_id, provider, model, input_tokens, output_tokens, cost)`
   - Emits WebSocket event to frontend for real-time dashboard update

7. **Response (Frontend):**
   - Chat UI displays: "✅ Clicked Submit button in Chrome"
   - Cost badge shows: "$0.00002" (rounded)
   - Conversation history updates

---

## 4. Pricing & Business Model

### 4.1 Pricing Tiers

#### **Free Tier**
- **Price:** $0/month
- **Limits:**
  - 100 tasks/month (hard cap)
  - 1 LLM provider (OpenAI only)
  - Basic MCPs only (Windows, Browser, Terminal, Filesystem)
  - No mobile companion
- **Use Case:** Individual users trying the product, hobbyists

#### **Pro Tier** (Primary Revenue Driver)
- **Price:** $29/month
- **Limits:**
  - 2,000 tasks/month (soft cap with overage billing)
  - All 4 LLM providers (OpenAI, Anthropic, Google, Ollama)
  - All 16 MCPs enabled
  - Mobile companion app included
  - Priority support (24-hour response time)
- **Overage:** $0.02 per task above 2,000/month
- **Use Case:** Power users, developers, knowledge workers

#### **Team Tier** (Future - v1.2)
- **Price:** $89/month for 3 users ($29.67 per user)
- **Limits:**
  - 6,000 tasks/month shared pool
  - Team dashboard (centralized usage, cost allocation)
  - Shared workflow library
  - Admin controls (permission management)
- **Use Case:** Small teams (3-10 people)

#### **Enterprise Tier** (Future - v1.3)
- **Price:** Custom (starts at $999/month for 25 users)
- **Features:**
  - Unlimited tasks
  - SSO (SAML, OAuth)
  - On-premise deployment option
  - Custom MCPs via SDK
  - SLA with 99.9% uptime
  - Dedicated account manager
- **Use Case:** Large organizations (25+ users)

### 4.2 Revenue Projections (Lovable Displacement Model)

**Assumptions (validated with design partners + Lovable win/loss intel):**
- **Self-Serve Flywheel:** 4× MoM sign-up growth via invite codes and workflow sharing
- **Conversion:** 12% Free → Pro (workflow sharing), 45% Pro → Scale when team invites unlock shared libraries
- **Enterprise Displacement:** 5 new Lovable takeovers per weekday with $38K ARR average contract
- **Net Revenue Retention:** 165% (enterprise expansions + marketplace take-rates)

**Month-by-Month Hypergrowth Forecast:**

| Month | Pro Seats | Scale Seats | Enterprise Logos | MRR (USD) | ARR (USD) | Notes |
|-------|-----------|-------------|------------------|-----------|-----------|-------|
| 1     | 1,500     | 120         | 8                | $100K     | $1.2M     | Design partner sprints, concierge onboarding |
| 2     | 6,800     | 1,050       | 28               | $620K     | $7.4M     | Migration wizard GA, first 10 Lovable takeovers |
| 3     | 22,000    | 3,400       | 60               | $1.54M    | $18.5M    | Lovable parity release, marketplace beta |
| 4     | 65,000    | 12,500      | 140              | $4.85M    | $58.2M    | Outbound displacement squad firing, Scale tier virality |
| 5     | 120,000   | 24,000      | 220              | **$8.5M** | **$102M** | $100M ARR milestone, Lovable win-rate >60% |

**Post-Month-5 Outlook:**
- **Month 6:** 150,000 Pro seats, 32,000 Scale seats, 260 enterprise logos → $130M ARR (assuming 20% expansion)
- **Run-Rate Efficiency:** $102M ARR on $400K invested → 255× capital efficiency, enabling reinvestment in global expansion

### 4.3 Cost Structure

**Customer Acquisition Cost (CAC):**
- **Free Tier:** $0 (product-led growth, word-of-mouth)
- **Pro Tier:** $25 per user (Lovable migration wizard + lifecycle email)
- **Scale/Enterprise:** $400 per account (SDR assist, migration concierge)
- **Target:** CAC < 0.4 × LTV (blended LTV = $1,140 at 18-month retention)

**LLM Cost Per User:**
- **Average Task:** 500 input tokens, 200 output tokens
- **Router Mix (optimized):**
  - 60% tasks → GPT-4o-mini ($0.00011 per task)
  - 25% tasks → Claude 3.5 Haiku ($0.00015 per task)
  - 10% tasks → GPT-4o ($0.0006 per task)
  - 5% tasks → Ollama (local, $0)
- **Blended Cost Per Task:** $0.00015
- **Monthly Cost Per User (2,000 tasks):** $0.30
- **Gross Margin Per User:** $28.70 (99% margin on Pro tier!)

**Infrastructure Cost (per 1,000 users):**
- **Hosting:** $0 (users run locally)
- **Signaling Server (WebRTC):** $50/month (Cloudflare Workers)
- **Database (usage tracking):** $20/month (Supabase)
- **Crash Reporting:** $30/month (Sentry)
- **Total:** $100/month → $0.10 per user

**Development Cost (5-month sprint):**
- **Core Team:** 4 AI-accelerated engineers @ $150K/year prorated = $250K
- **Growth Pod:** 2 GTM operators (product marketing + SDR) for displacement motion = $80K
- **Specialists:** Automation QA + security contractor = $45K
- **Tools & Services:** $25K (LLM credits, analytics, enablement)
- **Total:** $400K to reach $100M ARR run-rate

---

## 5. Go-to-Market Strategy

### 5.1 Launch Strategy (150-Day Hypergrowth)

**Phase 1: Design Partner Sprint (Days 0-30, 50 lighthouse teams)**
- Co-build with teams churning off Lovable; capture parity requirements and blocker gaps
- Goal: Ship parity workflows weekly, collect ROI case studies
- Metrics: 90% task success rate, <5 crashes per week, 10 public testimonials

**Phase 2: Lovable Parity Blitz (Days 31-60, 10K waitlist)**
- Public waitlist with Lovable-to-AGI migration wizard and savings calculator
- Offer free migration concierge + workflow import for top 200 Lovable customers
- Metrics: 10K waitlist signups, 3K weekly active users, 50 enterprise pilots

**Phase 3: Displacement Launch (Days 61-150)**
- Stripe + enterprise invoicing live, automation marketplace opens, SDR strike team targets Lovable logos
- Product Hunt launch, daily Loom demos, aggressive referral incentives ($500 credit per displacement)
- Metrics: 120K Pro seats, 24K Scale seats, 220 paid enterprise logos, net ARR ≥ $100M

### 5.2 Marketing Channels (Capital-Efficient Pre-Ads)

**1. Product-Led Growth (Primary)**
- **Viral Loop:** Free tier users share Lovable-imported workflows with colleagues → organic signups
- **In-App Prompts:** "Your teammate just migrated their Lovable workflow. Claim it in AGI Workforce."
- **Referral Program (Day 120):** $500 migration credit per Lovable displacement

Our unique ability to deliver the full v1.0 scope inside 90 days—and layer enterprise displacement tooling by Day 150—powered by AI-accelerated development (Claude Max 20x, Codex Pro, Gemini Ultra, Perplexity Max), lets us execute a blended PLG + outbound strategy that Lovable cannot match. Shipping fast with deep desktop coverage drives organic adoption while the displacement playbook captures high-ARR logos.

**2. Content Marketing**
- **Blog:** SEO-optimized tutorials (e.g., "Automate Excel Data Entry with AI")
- **YouTube:** Screen recording demos (e.g., "Build a Gmail Auto-Responder in 5 Minutes")
- **GitHub:** Open-source example MCPs to attract developers

**3. Community Building**
- **Discord Server:** Support, feature requests, workflow sharing
- **Reddit:** Active presence in r/productivity, r/automation, r/SideProject
- **Twitter/X:** Daily automation tips, behind-the-scenes development

**4. Strategic Partnerships (Day 150+)**
- **Notion:** "Integrate AGI Workforce to auto-populate databases"
- **Zapier Alternative:** Position as "local-first Zapier with AI"
- **RPA Vendors:** "UiPath for individuals at 1/100th the cost"

### 5.3 Sales Strategy (Enterprise Displacement Day 61+)

**Inbound + Targeted Outbound:**
- Capture Lovable churn intent via migration landing page and SDR outreach within 2 hours
- Qualification: ≥25 active Lovable seats or $20K+ annual automation budget
- Demo: 30-minute migration session showcasing imported Lovable workflows + desktop-only automations
- Pilot: 21-day migration sprint with 15 seats, success metric = 30% faster workflow completion + 40% cost reduction
- Contract: Annual prepay (12 months) with Lovable buyout credit, 20% uplift for automation marketplace bundles

---

## 6. Success Metrics & KPIs

### 6.1 Product Metrics

**Engagement:**
- **Daily Active Users (DAU):** Target 40% of Pro users
- **Weekly Active Users (WAU):** Target 70% of Pro users
- **Tasks Per User Per Week:** Target 50+ (indicates daily usage)

**Retention:**
- **Day 1 Retention:** 75% (migration prompts pull teams back immediately)
- **Week 1 Retention:** 55% (daily automations in imported Lovable workflows)
- **Day 30 Retention:** 45% (users stay once marketplace or team collaboration adopted)
- **Paid Retention:** 97% monthly (Lovable displacement contracts rarely churn)

**Conversion:**
- **Free → Pro:** 12% (self-serve users needing more automation volume)
- **Pro → Scale:** 45% within 14 days (team invite + shared workflow libraries)
- **Time to Conversion:** 7 days median (post-migration aha moment)

### 6.2 Technical Metrics

**Reliability:**
- **Task Success Rate:** >95% (tasks complete without errors)
- **Crash Rate:** <0.1% (less than 1 crash per 1,000 sessions)
- **Uptime (Signaling Server):** 99.9%

**Performance:**
- **App Launch Time:** <3 seconds (cold start on Windows 11)
- **Chat Response Latency:** <2 seconds (LLM routing + API call)
- **Memory Usage:** <150MB (idle), <500MB (during automation)

**Cost Efficiency:**
- **Average Cost Per Task:** <$0.0002 (via smart router caching)
- **Cache Hit Rate:** >40% (40% of tasks served from local cache)

### 6.3 Business Metrics

**Revenue:**
- **Day 30:** $1.2M ARR
- **Day 90:** $18.5M ARR
- **Day 150:** $102M ARR (target milestone)

**Unit Economics:**
- **LTV (Lifetime Value):** $1,140 (18 months blended retention @ $63 ARPU)
- **CAC (Customer Acquisition Cost):** $280 (weighted across PLG + displacement)
- **LTV:CAC Ratio:** >4:1 (well above 3:1 SaaS benchmark)

**Capital Efficiency:**
- **Burn Rate (Day 0-90):** $80K/month (4 engineers, automation QA, design contractor)
- **Burn Rate (Day 91-150):** $140K/month (adds GTM pod, support, enterprise security)
- **Runway:** 6 months on $400K initial capital (enough to reach $100M ARR target)
- **Break-Even:** Month 6 (hypergrowth ARR covers burn; reinvest in displacement squad)

---

## 7. Risks & Mitigation

### 7.1 Product Risks

**Risk: 90-Day Parity Build Slips**
- **Probability:** HIGH (70%)
- **Impact:** CRITICAL (missing Day-90 Lovable parity slips $100M target and loses displacement narrative)
- **Mitigation:**
  - AI pair-programming pods (Claude Max 20×, Codex Pro) with daily velocity dashboards
  - Aggressive parallelization of MCPs with module owners and shared QA automation harness
  - Hard-go/no-go reviews every 10 days with kill-switch backlog for deferrable scope
  - Standby budget for burst contractors (automation QA, browser specialists) if burn-down lags

**Risk: Hypergrowth Engine Delayed**
- **Probability:** MEDIUM-HIGH (60%)
- **Impact:** CRITICAL (every 30-day slip after Day 90 costs ≈$25M ARR in the displacement model)
- **Mitigation:**
  - Dedicated Lovable takeover squad (GTM + engineering) starting Day 45
  - Weekly migration tooling releases and Lovable workflow import auto-tests
  - Executive escalation path for enterprise blockers (security reviews, custom connectors)

**Risk: Low User Adoption (PLG Doesn't Work)**
- **Probability:** MEDIUM (40%)
- **Impact:** HIGH (miss 1,000 user target, run out of runway before product-market fit)
- **Mitigation:**
  - Start building email list NOW (via landing page, Twitter, Product Hunt "Coming Soon")
  - Run beta with 500 users BEFORE building all 16 MCPs (validate demand)
  - Pivot to direct sales if PLG fails (enterprise RPA angle)

### 7.2 Technical Risks

**Risk: UI Automation Reliability on Windows**
- **Probability:** MEDIUM (30%)
- **Impact:** HIGH (core value prop fails if click/type actions are flaky)
- **Mitigation:**
  - Extensive testing on Windows 10/11 (multiple versions, DPI settings)
  - Fallback to image recognition (OpenCV) if UIA element not found
  - Clear error messages: "AGI Workforce couldn't find the 'Submit' button. Screenshot what you see."

**Risk: LLM Cost Explosion**
- **Probability:** LOW (20%)
- **Impact:** MEDIUM (gross margin drops from 99% to 80% if users abuse system)
- **Mitigation:**
  - Hard limits on Free tier (100 tasks/month, no exceptions)
  - Overage billing on Pro tier ($0.02 per task above 2,000)
  - Aggressive caching: Hash (task + context) → store result for 24 hours

**Risk: Security Vulnerabilities (Prompt Injection)**
- **Probability:** MEDIUM (50%)
- **Impact:** CRITICAL (user data leaked, reputation destroyed)
- **Mitigation:**
  - Sandboxed execution: MCPs run in separate processes with limited OS permissions
  - Prompt injection detection: Flag suspicious patterns ("Ignore previous instructions...")
  - User consent for dangerous actions: "AGI Workforce wants to delete 50 files. Allow?"

### 7.3 Market Risks

**Risk: Competitor Launches First (Microsoft, OpenAI, Anthropic)**
- **Probability:** HIGH (60%)
- **Impact:** MEDIUM (market validates idea, but we lose first-mover advantage)
- **Mitigation:**
  - Differentiate on cost transparency and local execution (privacy angle)
  - Build brand as "indie alternative to big tech AI"
  - Partner with competitors: "AGI Workforce works with Claude, ChatGPT, Gemini"

**Risk: Regulatory Changes (AI Liability, GDPR)**
- **Probability:** LOW (20%)
- **Impact:** HIGH (may require legal overhaul, delay launch)
- **Mitigation:**
  - Legal review of terms of service BEFORE launch
  - Disable features in EU if GDPR compliance uncertain
  - Liability disclaimer: "User is responsible for automation actions."

---

## 8. Success Criteria for v1.0

### 8.1 Launch Readiness Checklist

**Product:**
- [ ] All 16 MCPs implemented and tested
- [ ] <2% crash rate in design partner wave (Day 30) and Lovable migration beta (Day 60)
- [ ] Onboarding flow <5 minutes (from download to first successful task)
- [x] Cost dashboard shows accurate real-time tracking (real-time widget + dashboard validated in 2025-10-31 audit)
- [ ] Mobile companion app available on iOS and Android app stores

**Business:**
- [ ] Stripe + enterprise invoicing live with automated Lovable buyout credits
- [ ] Terms of Service, Privacy Policy, and Lovable migration SLA reviewed by counsel
- [ ] Support documentation (100+ FAQ articles + migration playbooks)
- [ ] 24/7 Discord + concierge migration squad staffed

**Marketing:**
- [ ] Product Hunt launch post scheduled
- [ ] 30 Lovable-to-AGI YouTube demo stories published
- [ ] Email list of 40,000+ Lovable refugees and automation leads
- [ ] Press kit (logos, screenshots, founder headshots)

### 8.2 Implementation Alignment (2025-10-31 Audit)

**Completed or ≥85% Implemented MCP Scope:**
- M1 Foundation, M2 Core UI Shell, M3 Chat Interface
- M4 LLM Router & Cost Tracking (live dashboard and cost controls)
- M5 Windows Automation MCP, M6 Browser Automation MCP
- M9 Filesystem, M10 Database, M11 API Integrations
- M15 Cloud Storage MCP (Drive/Dropbox/OneDrive parity)

**In-Progress MCP Scope (backend ready, UI/polish pending):**
- M7 Code Editor (Monaco/diff UI outstanding)
- M8 Terminal (xterm.js UI + tab UX outstanding)
- M12 Communications (email inbox/composer UI needed)
- M13 Calendar (calendar visualization and reminders pending)
- M14 Productivity (unified task workspace outstanding)
- M18 Security & Polish (guardrails, permissions UI, command palette, accessibility)

**Not Yet Implemented / Candidate for v1.1:**
- M16 Document MCP (PDF/Office tooling)
- M17 Mobile Companion MCP (React Native + WebRTC)

**Non-Product Launch Gaps:**
- Business and marketing checklist items (billing, legal review, support content, launch campaign assets) remain open and should be scheduled alongside remaining MCP UI work.

### 8.3 Post-Launch Goals (Day 150 and Beyond)

**Day 120 Checkpoint:**
- 70,000 Pro seats, 12,000 Scale seats
- 120 Lovable displacement wins, NRR ≥ 150%
- Net MRR ≥ $5M, payback period < 30 days

**Day 150 Target (Hypergrowth Milestone):**
- $100M ARR run-rate achieved and sustained for 30 days
- Lovable win-rate ≥ 60% on competitive deals
- Marketplace GMV $1M/month with 25% take rate
- Preparation for global expansion (EU data residency, APAC go-live)

---

## 9. Appendices

### Appendix A: Competitive Landscape

| Competitor         | Pricing         | Strengths                     | Weaknesses                   | Our Advantage                |
|--------------------|-----------------|-------------------------------|------------------------------|------------------------------|
| **UiPath**         | $8,000+/year    | Enterprise RPA, mature        | Expensive, complex setup     | 99% cheaper, no-code         |
| **Zapier**         | $20-600/month   | 5,000+ integrations           | No desktop automation        | Native Windows control       |
| **Microsoft Power Automate** | $15-40/user/month | Integrates with Office 365 | Windows-only, limited AI     | Multi-LLM, cost transparency |
| **ChatGPT Desktop** | $20/month       | Best LLM, simple interface    | No automation, no tracking   | Full workflow automation     |
| **Anthropic Claude** | $20/month     | Strong reasoning              | No automation, no tracking   | Full workflow automation     |
| **Lovable**        | $25/user/month  | Rapid workflow builder, strong PLG growth | Limited native desktop control, expensive enterprise tier | Deeper Windows automation, faster migration tooling, transparent pricing |

### Appendix B: Technology Decisions

**Why Tauri over Electron?**
- **Binary Size:** 3MB vs. 150MB (50x smaller)
- **Memory Usage:** 80MB vs. 300MB (4x less RAM)
- **Security:** Rust backend vs. Node.js (fewer vulnerabilities)
- **Performance:** Native OS integration vs. Chromium overhead

**Why Rust over Python/Node.js for Backend?**
- **Speed:** 10-100x faster for UI Automation loops
- **Memory Safety:** No segfaults or memory leaks
- **Concurrency:** Tokio's async runtime handles 1,000+ tasks/sec
- **Windows Integration:** windows-rs crate is first-class

**Why SQLite over PostgreSQL?**
- **Simplicity:** No server setup, just a file
- **Performance:** Faster for local reads (no network latency)
- **Reliability:** ACID guarantees, battle-tested
- **Portability:** User data is a single .db file

### Appendix C: Team & Hiring Plan

**Current Team (Assumed):**
- 1 Founder/Full-Stack Engineer (Rust + React)
- 1 Full-Time Engineer (Frontend focus)

**Hiring Roadmap:**
- **Month 8:** Contractor for mobile app (8 weeks, $60K)
- **Month 12:** Part-time designer ($30/hour, 10 hours/week)
- **Month 18:** Customer Success lead ($80K/year)
- **Month 24:** 3rd engineer (Backend/DevOps, $140K/year)

**Total Team by Month 24:** 4 full-time + 1 contractor

---

## Document Control

**Review Schedule:** Quarterly (or after major milestone)

**Next Review:** Month 8 (after internal beta)

**Approval:** This PRD v4.0 supersedes all previous versions. Archive v3.0 and v3.1 immediately.

**Questions or Feedback?** Open a GitHub issue or message in #product-dev Discord channel.

---

**End of PRD v4.0**
