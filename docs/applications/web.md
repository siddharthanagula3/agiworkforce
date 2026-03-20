# Web Product & Technical Specification

## 1. Mission

The web app should be the public and hosted AGI Workforce control plane. It should convert prospects, authenticate users, manage billing and downloads, expose hosted product surfaces, and provide the secure API layer that other AGI Workforce surfaces can rely on.

## 2. Users and jobs-to-be-done

### Primary users

- prospects evaluating the product
- existing users managing their account, subscription, and hosted features
- users accessing dashboard, marketplace, support, or share flows
- other AGI Workforce surfaces consuming hosted APIs

### Jobs-to-be-done

- understand what AGI Workforce is
- sign up, log in, download, and activate
- manage plans, billing, and usage
- access hosted dashboards and collaboration surfaces
- use browser-safe chat and hosted tools
- interact with shared links, docs, and marketplace content

## 3. Scope and feature ownership

### Web owns

- marketing and product education
- auth and account lifecycle
- billing and subscription management
- dashboard and hosted product surfaces
- hosted APIs
- share links, docs, and public resources

### Web does not own

- privileged local execution
- local filesystem, terminal, or computer-use authority
- primary desktop-runtime responsibilities

## 4. Feature set

### Public product surface

- landing page
- pricing
- download
- docs and API docs
- FAQ, help, resources, blog, changelog
- use cases, security, legal, privacy, terms, cookies

### Account and lifecycle surface

- signup/login
- auth callbacks and password flows
- device auth and verification
- billing, portal, checkout, webhook sync
- usage and plan visibility

### Hosted dashboard surface

- dashboard home
- chat
- workforce
- projects
- connectors
- marketplace
- settings
- support
- media and other hosted feature pages

### Hosted API surface

- completion and model endpoints
- health and diagnostics
- usage, schedules, memory, projects, teams, share, marketplace, workforce, billing, downloads

## 5. Competitive benchmark lens

The web surface must be informed by the rapidly evolving competitive landscape across all major web AI platforms. Each competitor has carved out distinct strengths that define the parity bar AGI Workforce must clear.

### Claude.ai

Claude.ai has moved aggressively toward a full-featured hosted platform. Skills and Projects are now free for all users, with an Artifacts system that supports persistent storage up to 20 MB. A plugin marketplace hosts over 500K agent skills, making Claude.ai the deepest skill ecosystem on the web. Self-serve Enterprise onboarding eliminates sales friction. Cowork scheduling supports both recurring and on-demand agent tasks. Interactive inline visualizations render charts, diagrams, and data explorations directly in chat. Memory now builds automatically from chat history for all users, not just paid tiers. On the infrastructure side, Claude.ai offers an LLM gateway connecting to Bedrock, Vertex AI, and Microsoft Foundry, and an Enterprise Analytics API for usage and adoption reporting.

AGI Workforce must match the breadth of hosted skill access, persistent artifact storage, and self-serve Enterprise flows. Our advantage lies in being provider-agnostic across 8+ LLM providers rather than locked to a single model family, and in serving as both a public marketing site and a hosted control plane with 86 route handlers and 13+ dashboard modules.

- Reference: `https://support.claude.com/en/articles/12138966-release-notes`

### ChatGPT Web

ChatGPT is the most-expensed app by transaction volume in 2026, and its web experience reflects that scale. Projects function as living knowledge bases that pull sources from connected apps, chats, and links, with Shared Projects supporting up to 100 participants. ChatGPT Tasks enables scheduled execution with up to 10 active tasks per user. Deep Research now integrates MCP and app connections for richer grounding. Shopping with Instant Checkout via Stripe turns chat into a commerce surface. Workspace Analytics gives Enterprise admins visibility into adoption and usage. The model picker has been redesigned around three modes (Instant, Thinking, and Pro), and the context window extends to 256K tokens. Free and Go tiers now show ads, establishing ad-supported AI as a viable monetization model.

AGI Workforce must close the gap on projects-as-workspaces (with sources from connected apps and shared collaboration), scheduled task management from the web dashboard, and workspace analytics for enterprise admins. Our multi-LLM routing and full billing integration with Stripe give us a foundation to build on, and our 150+ non-coding skills differentiate us from ChatGPT’s code-centric defaults.

- Reference: `https://help.openai.com/en/articles/6825453-chatgpt-release-notes`

### Perplexity Web

Perplexity has emerged as the research-first AI platform. Perplexity Computer orchestrates across 19 models simultaneously, and Model Council runs 3 models in parallel to cross-validate answers. Deep Research quality is widely considered state-of-the-art, with the DRACO benchmark providing standardized research evaluation. Custom Skills allow users to define reusable workflows. Voice Mode brings conversational interaction to the web. Over 100 enterprise integrations connect to platforms like Snowflake, Salesforce, and HubSpot. Finance-specific features include analyst ratings, SEC filing analysis, and market heatmaps. The Max tier at $200/mo includes compute credits for heavy workloads.

AGI Workforce should study Perplexity’s multi-model orchestration pattern closely. Our LLM provider abstraction already routes across 8+ providers; extending this toward model-council and parallel-inference patterns would match Perplexity’s research depth while leveraging our broader skill set beyond pure research.

- Reference: `https://www.perplexity.ai/changelog`

### Gemini Web

Gemini leverages deep Google ecosystem integration as its primary moat. Personal Intelligence connects Gmail, Photos, YouTube, and Search, and is now free for all US users. Workspace integration enables first-draft generation in Docs, spreadsheet generation in Sheets, and Slides support is in progress. Deep Research supports file uploads for grounded analysis. Canvas transforms reports into interactive apps, games, quizzes, and infographics. Shared Gems enable collaborative custom agents. Pricing is aggressive: AI Pro at $19.99/mo and AI Ultra at $249.99/mo for power users, with a massive existing user base of 750M+ MAU across Google surfaces.

AGI Workforce competes by being platform-agnostic where Gemini is Google-locked. Our hosted connector model should aim to replicate the breadth of Google ecosystem integration through open connectors rather than proprietary lock-in, while our desktop autonomy and mobile companion features remain out of Gemini’s reach.

- Reference: `https://gemini.google/release-notes/`

### Other competitive signals

- **Codex Cloud**: Background agent execution in sandboxed VMs with GitHub `@codex` tag integration for issue-to-PR workflows.
- **Cursor Cloud Agents**: Cloud VM execution with artifact generation, blurring the line between IDE and hosted agent platform.
- **Manus**: Web-native agent platform reaching 22M+ monthly visits, demonstrating demand for browser-based autonomous agents.

AGI Workforce’s web surface must evolve from a control-plane utility into a competitive hosted AI workspace. Our structural advantages remain: multi-LLM routing across 8+ providers, full billing integration, 86 route handlers covering the complete account lifecycle, and a cross-surface architecture where web, desktop, and mobile reinforce each other rather than competing.

## 6. End-to-end flows

### Flow A: prospect to activated user

1. Prospect lands on the marketing site.
2. They evaluate product pages, use cases, docs, and pricing.
3. They sign up or log in.
4. They enter the dashboard and/or download desktop.
5. Activation continues through account and billing flows.

### Flow B: authenticated user in hosted dashboard

1. User enters the dashboard shell.
2. Dashboard loads account-aware feature modules.
3. User accesses chat, workforce, projects, connectors, or support.
4. Frontend consumes hosted APIs with authenticated requests.
5. Results render in feature-specific pages and shared components.

### Flow C: API request from a product surface

1. Client sends an authenticated request to a route handler.
2. Route validates auth, rate limits, and request schema.
3. Route performs backend work using Supabase, Stripe, or internal services.
4. Response returns as a stable JSON contract.
5. Logs and error handling capture failures safely.

### Flow D: hosted file/result generation

1. User asks for a generated document, analysis, or other hosted output.
2. Hosted model/tool layer performs generation.
3. Result is returned as a downloadable artifact or a dashboard/viewable result.
4. User can save, share, or continue iterating in chat.

## 7. UI, look, and layout

### Visual model

The web app should present two coherent but distinct modes:

- public marketing mode
- authenticated dashboard mode

### Public-site layout

- marketing header
- strong hero and product explanation
- feature/benefit sections
- CTAs for signup and download
- footer with legal/support/resource links

### Dashboard layout

- authenticated app shell
- navigation optimized for dashboard tasks
- content area per feature module
- strong loading/error/empty handling

### Look and feel rules

- public pages should feel polished and high-trust
- dashboard surfaces should feel product-grade, not marketing-lite
- accessibility features like skip links and theme support should be first-class
- responsive behavior must be deliberate across desktop and mobile browsers

## 8. UI components

### Public-site components

- `Header`
- `ApplicationPreview`
- `CtaSection`
- `MarketingFooter`
- marketing cards and layout primitives

### Product/dashboard components

- dashboard layout components
- auth components
- billing/Stripe components
- chat and unified chat components
- workforce, marketplace, settings, support, and media components
- share and artifact components

### Component rules

- public and dashboard components should share design primitives, not page assumptions
- chat and artifact components should render safely and consistently
- empty/loading/error states should be designed as first-class components

## 9. Frontend architecture

### Runtime

- Next.js App Router
- React + TypeScript
- route-based layouts
- shared providers and feature modules

### Frontend responsibilities

- render public pages and dashboard pages
- coordinate auth-aware navigation
- consume route handlers and hosted APIs
- manage feature-specific client state where needed

### Key structure visible in the codebase

- `apps/web/app/*`
- `apps/web/features/*`
- `apps/web/components/*`
- `apps/web/lib/*`
- `apps/web/services/*`

## 10. Backend/runtime architecture

### Runtime

- Next.js route handlers running server-side
- server-only modules for sensitive operations

### Backend responsibilities

- auth verification
- rate limiting
- Stripe billing and webhook handling
- Supabase data access
- hosted model/tool orchestration
- diagnostics and health endpoints

### Key backend patterns visible in the codebase

- request validation
- structured error handling
- CORS handling
- logging
- service modules for domain logic

## 11. LM architecture

### Hosted LM role

Web should be the primary hosted LM surface for browser-safe AGI Workforce experiences.

### Model behavior

- use provider abstractions behind shared interfaces
- support model choice appropriate to the task
- use fast, cheap models for lightweight completions
- allow richer hosted chat flows where browser-safe tool use is possible

### Context behavior

- user auth and product context determine data scope
- prompt completion, chat, or feature-specific LM tasks should assemble only necessary context
- hosted context handling should support compaction and long-lived chat continuity

### File and analysis behavior

- where hosted file generation exists, return downloadable outputs, not just text
- surface risk and privacy implications clearly when internet-enabled or external processing is involved

## 12. API architecture

### API rules

- every route should have clear auth and authorization semantics
- rate limiting should exist for public-sensitive endpoints
- request payloads should be schema-validated
- health endpoints must avoid leaking sensitive environment detail

### Major API domains visible in the codebase

- auth and session endpoints
- billing and checkout
- completion and model endpoints
- usage, memory, schedules, and projects
- marketplace, teams, workforce, share, and downloads

## 13. Tool architecture

### Web-safe tool philosophy

Web should only expose tools that make sense in a hosted or browser-safe environment.

### Tool categories

- hosted chat tools
- cloud connector tools
- share/export tools
- marketplace and directory tools
- analytics and dashboard actions

### Tool rules

- local privileged actions must hand off to desktop or another local surface
- cloud tools should be authenticated, observable, and permission-aware
- web tools should not blur the line between browser-safe work and trusted local work

## 14. Data, state, and sync

### Hosted state

- accounts
- subscriptions
- projects
- conversations where applicable
- marketplace and connector state
- share artifacts and public resources

### Client state

- route-local UI state
- feature-local interactive state
- auth-aware cached data

### Sync rules

- server should remain source of truth for hosted account data
- public pages should minimize unnecessary client-side complexity

## 15. Security and privacy

- CSP and per-request nonce handling
- server-only boundaries for sensitive logic
- rate limiting and request validation
- Stripe and Supabase credentials never exposed to the client
- public health and diagnostics endpoints should avoid information disclosure

## 16. Performance and reliability

- public pages should load quickly and index well
- dashboard shells should be resilient under partial API failure
- route handlers should fail safely and observably
- feature modules should not regress overall bundle health carelessly

## 17. Observability, testing, and release gates

### Testing expectations

- route handler tests
- auth/billing flow tests
- feature-page tests
- accessibility and end-to-end tests for key pages
- health endpoint validation

### Release gates

- auth flows work
- billing flows are correct
- downloads and public pages are intact
- dashboard loads under authenticated state
- critical APIs are rate limited and validated

## 18. Definition of done

The web app is in the right state when:

- it clearly explains and converts the product
- it cleanly owns account and billing workflows
- hosted dashboards and APIs are dependable
- it complements desktop rather than fighting for local-runtime ownership

## 19. Canonical implementation anchors

- `apps/web/app/page.tsx`
- `apps/web/app/layout.tsx`
- `apps/web/app/dashboard/layout.tsx`
- `apps/web/app/dashboard/page.tsx`
- `apps/web/app/api/health/route.ts`
- `apps/web/app/api/completion/route.ts`
- `apps/web/lib/llm-providers/factory.ts`

## 20. Screen inventory

### Public-site inventory

- home
- pricing
- download
- docs and API docs
- changelog
- blog
- resources
- FAQ/help/support
- security/legal/privacy/terms/cookies
- use-case pages

### Auth and account inventory

- login
- signup
- forgot password
- auth callback
- verify/device auth

### Dashboard inventory

- dashboard home
- dashboard chat
- workforce
- projects
- connectors
- marketplace
- billing
- usage
- settings
- support
- media

## 21. Component and module inventory

### Component families

- marketing components
- layout components
- dashboard components
- auth components
- billing/stripe components
- share/artifact components
- unified chat components
- workforce/project/settings/support components

### Feature module families

- chat
- billing
- connectors
- marketplace
- media
- projects
- settings
- support
- teams
- vibe
- workforce

## 22. API and tool inventory

### Route inventory categories

- auth/session
- billing/checkout/portal/webhooks
- completion and models
- memory, usage, schedules, projects, teams
- marketplace, workforce, share, downloads
- health and diagnostics

### Hosted tool inventory

- hosted LM completion
- file/result generation where applicable
- dashboard actions
- share/export flows
- hosted connectors and apps

## 23. Phased roadmap

### Phase 1: hosted workspace maturity

- elevate projects to first-class workspaces following the ChatGPT pattern: each project aggregates sources from connected apps, chat history, uploaded files, and custom instructions into a unified context
- implement hosted file and artifact generation with iteration loops, so users can produce, refine, and download outputs without leaving the browser
- build a stronger connector and app directory with search, categories, and one-click activation, matching the breadth of Claude.ai's plugin marketplace and Perplexity's 100+ enterprise integrations

### Phase 2: hosted agent platform

- ship scheduled tasks from the web dashboard, mirroring ChatGPT Tasks (recurring and one-shot, with notification on completion, managed centrally from the web surface)
- enable background agent execution in sandboxed environments following the Codex Cloud model, where web dispatches long-running tasks and returns results or PRs asynchronously
- establish the web surface as the authoritative cross-surface task manager, aggregating task status from desktop, mobile, and hosted execution into a single view

### Phase 3: enterprise platform grade

- add admin and team controls: role-based access, workspace-level policies, invite management, and audit logging
- build workspace analytics for enterprise admins covering adoption metrics, usage patterns, task completion insights, and industry benchmarks, matching ChatGPT's Workspace Analytics
- implement managed policy enforcement with configurable guardrails per workspace
- achieve EU AI Act compliance ahead of the August 2026 general application deadline, including conformity assessments, technical documentation, and transparency obligations
- introduce usage-based billing governance with project-level cost attribution and spending alerts

### Phase 4: commerce and marketplace

- launch a skill marketplace where third-party developers can publish, monetize, and distribute agent skills, targeting the scale of Claude.ai's 500K+ skill ecosystem
- build an enterprise app directory with curated integrations, compliance badges, and admin-controlled allow-lists
- ship a usage analytics dashboard for marketplace publishers with install counts, usage telemetry, and revenue reporting
- explore ad-supported free tier as a complementary monetization channel following ChatGPT's lead

## 24. Gap analysis

### Gaps vs Claude.ai

- **Plugin marketplace**: Claude.ai hosts 500K+ agent skills in a searchable marketplace; AGI Workforce has no equivalent hosted skill directory yet
- **Persistent artifact storage**: Claude.ai stores artifacts up to 20 MB with version history; our artifact flows are session-scoped without persistence
- **Self-serve Enterprise**: Claude.ai allows Enterprise onboarding without sales contact; our Enterprise flow requires manual provisioning
- **Interactive visualizations**: Claude.ai renders charts, diagrams, and data explorations inline in chat; our web chat is text-and-code only
- **LLM gateway connectivity**: Claude.ai connects to Bedrock, Vertex AI, and Microsoft Foundry as deployment targets; we route across providers but do not yet offer bring-your-own-cloud gateway endpoints

### Gaps vs ChatGPT

- **Projects as living knowledge bases**: ChatGPT Projects pull sources from connected apps, chats, and links into unified context; our projects are flat containers without source aggregation
- **Shared Projects collaboration**: ChatGPT supports up to 100 participants per shared project; we have no multi-user project collaboration
- **Tasks scheduling**: ChatGPT Tasks supports up to 10 active scheduled tasks managed from the web; we have no hosted task scheduling surface
- **Shopping and checkout**: ChatGPT integrates Stripe-powered Instant Checkout for product purchases from chat; this is outside our current scope but signals where conversational commerce is heading
- **Workspace Analytics**: ChatGPT offers Enterprise admins adoption and usage analytics; our admin surface lacks analytics
- **Ads monetization**: ChatGPT runs ads on Free and Go tiers; we have no ad-supported tier, which limits free-tier sustainability
- **Scale benchmark**: ChatGPT is the most-expensed app by transaction volume in 2026, setting the enterprise adoption bar

### Gaps vs Perplexity

- **Multi-model orchestration**: Perplexity Computer orchestrates across 19 models; our LLM router handles provider selection but not parallel multi-model inference
- **Model Council**: Perplexity runs 3 models simultaneously for cross-validation; we have no equivalent consensus mechanism
- **Deep Research quality**: Perplexity's Deep Research with DRACO benchmark evaluation is considered state-of-the-art; our research capabilities are nascent
- **Enterprise data connectors**: Perplexity integrates with Snowflake, Salesforce, HubSpot, and 100+ enterprise platforms; our connector count is lower and lacks deep data-platform integrations
- **Finance vertical depth**: Perplexity offers analyst ratings, SEC filing analysis, and market heatmaps; we have no vertical-specific features on the web surface

### Gaps vs Gemini

- **Personal Intelligence**: Gemini integrates deeply with Gmail, Photos, YouTube, and Search, free for all US users; we cannot match this ecosystem depth without equivalent partnerships
- **Workspace integration**: Gemini generates first drafts in Docs, spreadsheets in Sheets, and Slides support is forthcoming; our web surface does not integrate with productivity suites
- **Aggressive pricing**: Gemini's entry at $7.99/mo (via Google One AI Premium bundling) and 750M+ MAU scale create price pressure we must account for in tier design
- **Canvas**: Gemini Canvas transforms reports into interactive apps, games, quizzes, and infographics; our artifact system does not yet support interactive output formats

## 25. Feature acceptance criteria

| Feature | Acceptance criteria |
| --- | --- |
| Public marketing site | Core marketing pages load quickly, explain the product clearly, and route users reliably into signup, docs, or download flows. |
| Auth lifecycle | Signup, login, reset, verify, callback, and device-auth flows are complete, recoverable, and secure. |
| Dashboard shell | Authenticated users land in a stable dashboard layout with clear navigation and resilient loading/error states. |
| Hosted chat and feature modules | Hosted chat, workforce, projects, connectors, marketplace, support, and settings modules can load and act on account-scoped data correctly. |
| Billing and subscription | Checkout, billing portal, usage, and webhook-driven state changes are accurate and observable. |
| Docs/download/resources | Documentation, downloads, changelog, blog, and support surfaces remain navigable and consistent with product positioning. |
| Hosted LM endpoints | Completion and model-facing endpoints validate auth and schema, route to the right provider abstraction, and fail safely. |
| Share and artifact flows | Shared links, share pages, and hosted artifact/result flows are secure and user-understandable. |
| Health, diagnostics, and rate limiting | Operational endpoints return safe information, enforce limits, and distinguish healthy from degraded/unhealthy states correctly. |
| Hosted agent execution | Web can dispatch background agent tasks in sandboxed environments, track execution status in real time, and return results (files, PRs, reports) to the user's dashboard upon completion. |
| Scheduled tasks | Users can create recurring and one-shot tasks with configurable schedules from the web dashboard, receive notifications on completion, and manage up to 10 active tasks per account. |
| Project workspaces | Projects support adding sources from connected apps, chat history, uploaded files, and custom instructions; shared collaboration with role-based access; and project-scoped memory that persists across sessions. |
| Workspace analytics | Enterprise admins can view adoption metrics (DAU/WAU/MAU), usage patterns by team and model, task completion and latency insights, cost attribution by project, and industry benchmarks for comparable deployments. |
| EU AI Act compliance | Platform meets conformity assessment requirements for the August 2026 general application deadline, including technical documentation, risk management systems, transparency obligations, and CE marking readiness for high-risk use cases. |

## 26. Screen-by-screen implementation checklist

### Public pages

- home page communicates core value quickly
- pricing/download/docs routes are linked from key CTAs
- legal/help/resource pages are accessible from global navigation/footer

### Auth pages

- login and signup have reliable happy paths
- password reset and update-password flows are not dead ends
- callback/error routes explain failures cleanly

### Dashboard shell

- dashboard layout loads auth-aware navigation correctly
- loading and error boundaries exist for major dashboard routes
- page-level metadata and robots rules are correct

### Hosted product pages

- chat page supports empty state and session routing
- workforce/projects/connectors pages map cleanly to feature modules
- billing/usage/settings/support pages behave as account-management surfaces, not marketing surfaces

### Docs, downloads, and share pages

- docs and API docs remain browsable and indexable where appropriate
- download flow is explicit by platform
- shared pages handle loading/error/invalid-token states clearly

### Route handlers

- validate request bodies and auth
- apply rate limiting to public-sensitive endpoints
- keep server-only logic out of client bundles
- return stable JSON contracts and safe error responses

## 27. Enterprise compliance and governance

### EU AI Act (general application August 2026)

The EU AI Act enters general application on 2 August 2026 for the broadest category of AI systems. AGI Workforce must prepare for conformity assessments, technical documentation obligations, CE marking for any high-risk use cases, risk management system implementation, and transparency obligations requiring disclosure of AI-generated content and model capabilities. Systems classified as limited-risk (which includes most chatbot and agent interfaces) must meet transparency requirements at minimum. High-risk classifications, which may apply if customers deploy AGI Workforce in healthcare, legal, finance, or employment contexts covered by the 150+ non-coding skill set, trigger the full conformity assessment pipeline.

- Reference: `https://artificialintelligenceact.eu/implementation-timeline/`

### OWASP Top 10 for Agentic Applications (2026)

The OWASP Top 10 for Agentic Applications (ASI01 through ASI10) defines the security baseline for any platform executing autonomous agent tasks. AGI Workforce's web surface must address each category:

- **ASI01 Agent Goal Hijack**: prompt injection and goal manipulation defenses for hosted agent execution
- **ASI02 Tool Misuse**: validation and sandboxing for all hosted tool invocations, ensuring tools cannot be weaponized through crafted inputs
- **ASI03 Identity and Privilege Abuse**: strict credential scoping so agents cannot escalate privileges beyond the user's granted permissions
- **ASI04 Supply Chain Vulnerabilities**: vetting of third-party skills and connectors in the marketplace, with integrity checks and provenance tracking
- **ASI05 Unexpected Code Execution**: sandboxing all code generation and execution in hosted environments, with no breakout paths
- **ASI06 Memory Poisoning**: protecting project-scoped and user-scoped memory from adversarial injection through malicious documents or chat inputs
- **ASI07 Insecure Inter-Agent Communication**: authenticating and encrypting all agent-to-agent messages in multi-agent workflows
- **ASI08 Cascading Failures**: circuit breakers and graceful degradation when one agent in a chain fails, preventing cascade through dependent tasks
- **ASI09 Trust Exploitation**: preventing agents from impersonating users or other agents to gain unauthorized access
- **ASI10 Rogue Agents**: monitoring and kill-switch mechanisms for agents that deviate from their assigned goals or exhibit anomalous behavior

### SOC 2 Type II

Over 80% of B2B deals exceeding $50K ARR now require SOC 2 Type II certification. AI-specific audit questions are emerging around model access controls, prompt logging, data residency, and output traceability. AGI Workforce must prepare for SOC 2 with AI-aware controls covering: audit trails for all agent actions, data encryption at rest and in transit, access control matrices for multi-tenant workspaces, incident response procedures for agent misbehavior, and vendor risk assessments for upstream LLM providers.

### US state AI regulations

- **Colorado AI Act (2026)**: requires deployers of high-risk AI systems to provide impact assessments and consumer disclosures. AGI Workforce customers using the platform for employment, lending, insurance, or housing decisions must be supported with compliance tooling.
- **California AI Transparency Act (SB 942)**: penalties of $5,000 per violation per day for AI systems that fail to disclose AI-generated content. The web surface must implement clear AI disclosure labels on all generated outputs, and the API must include metadata fields indicating AI generation.

### Data sovereignty

EU vs US CLOUD Act considerations require regional deployment options for enterprise customers. AGI Workforce should support data residency configuration at the workspace level, with Supabase project isolation per region and LLM provider selection constrained to region-compliant endpoints. This is a prerequisite for enterprise deals in regulated industries across the EU, APAC, and Middle East.

## 28. AI billing and pricing patterns

### Industry shift to usage-based billing

The SaaS pricing landscape has fundamentally shifted with AI. 78% of IT leaders report experiencing unexpected AI charges, driving demand for transparent, predictable billing models. The subscription billing management market is projected to grow from $8.47B (2025) to $37.36B (2035) at 16% CAGR, largely driven by AI billing complexity.

### Dominant pricing models

- **Hybrid pricing** (31% of AI vendors): combines a base subscription with usage-based overages, balancing predictability with fairness
- **Usage/token-based**: charges per input/output token, API call, or compute minute; preferred by developer-focused platforms
- **Outcome-based**: the frontier model emerging in 2025-2026 where pricing ties to measurable results (successful task completions, code merged, research reports delivered); high alignment but hard to implement

### Competitive tier structures

- **ChatGPT**: Free (ads) -> Go $8/mo -> Plus $20/mo -> Pro $200/mo. Most-expensed app by transaction volume in 2026, validating the tiered approach. Ad-supported free tier is a significant signal.
- **Claude**: Free -> Pro $20/mo -> Max $100-200/mo -> Team $25-30/seat. Max tier with higher rate limits and extended thinking targets power users.
- **Perplexity**: Free -> Pro $20/mo -> Max $200/mo (with compute credits). Compute credits model is noteworthy for agent-heavy workloads.
- **Gemini**: Free (bundled with Google One) -> AI Pro $19.99/mo -> AI Ultra $249.99/mo. Aggressive entry pricing leverages existing Google subscriptions.

### AI FinOps requirements

AGI Workforce's billing system must evolve toward AI FinOps capabilities: token-based billing governance with real-time monitoring, project-level cost attribution so teams can see exactly which projects and agents consume budget, spending alerts and hard caps per workspace, and model-tier controls that let admins restrict which models are available to which teams. This is critical for enterprise deals where procurement needs predictable costs.

### Implications for AGI Workforce pricing strategy

- Ad-supported free tier should be evaluated as ChatGPT has validated the model at scale
- Usage-based components should supplement seat-based pricing for agent execution and compute-heavy tasks
- Enterprise billing must support cost attribution, spending governance, and multi-department chargeback
- The $200/mo power-user tier (proven by both ChatGPT Pro and Perplexity Max) represents a viable ceiling for individual plans

- Reference: `https://www.getmonetizely.com/blogs/the-2026-guide-to-saas-ai-and-agentic-pricing-models`

## 29. Framework and infrastructure updates

### Next.js 16 (October 2025)

Next.js 16 is the current runtime for the web surface. Key features in use or available:

- **Cache Components**: the `"use cache"` directive enables granular server-side caching at the component level, replacing the older page-level caching model
- **Turbopack default**: Turbopack replaces webpack as the default bundler, delivering 2-5x faster builds in development and production
- **proxy.ts**: replaces `middleware.ts` for request proxying and rewriting, with clearer separation of concerns
- **Enhanced routing**: layout deduplication and incremental prefetch reduce navigation overhead in the dashboard shell
- **Next.js DevTools MCP**: a Model Context Protocol server that exposes build diagnostics and route information to AI agents during development

- Reference: `https://nextjs.org/blog/next-16`

### Next.js 16.1 (December 2025)

- **Turbopack filesystem caching stable**: persistent caching across builds, significantly reducing CI times for the monorepo

### Vite 8 (March 2026)

Vite 8 powers the desktop frontend build and is relevant as a benchmark for build tooling:

- **Rolldown**: replaces the esbuild + Rollup pipeline with a unified Rust-based bundler, achieving 10-30x faster builds
- **Lightningcss**: becomes the standard CSS processing pipeline, replacing PostCSS for most use cases
- **Integrated DevTools**: built-in development tools for bundle analysis and dependency inspection
- **server.forwardConsole**: forwards server console output to AI agents, enabling AI-assisted debugging workflows

### React Compiler v1.0 (stable)

The React Compiler reached v1.0 stability and provides automatic memoization, eliminating the need for manual `useMemo`, `useCallback`, and `React.memo` calls. Early benchmarks show up to 12% faster page loads on component-heavy dashboard surfaces. AGI Workforce should evaluate adoption for the web dashboard where re-render performance is critical.

### Tailwind CSS 4.2 (February 2026)

- **Webpack plugin**: direct webpack integration without PostCSS, relevant for any remaining webpack-based build paths
- **4 new color palettes**: expanded design token options for the marketing and dashboard themes
- **font-features utility**: OpenType feature control for typography refinement
- **Complete logical properties**: full RTL/LTR support through logical property utilities, important for internationalization

### Unified radix-ui package (February 2026)

The `radix-ui` package consolidates 20+ individual `@radix-ui/react-*` packages into a single import. This reduces dependency management overhead and simplifies the component library foundation that AGI Workforce's UI components build on.

### shadcn/ui CLI v4 (March 2026)

- **Skills for AI agents**: shadcn/ui components now ship with MCP-compatible skill definitions that AI agents can use to generate and modify UI
- **Preset system**: pre-configured component bundles for common patterns (dashboard, marketing, auth)
- **Multi-framework support**: components work across React, Vue, and Svelte, though AGI Workforce uses React exclusively

### Zustand v5.0.10

- **Experimental SSR-safe middleware**: addresses hydration mismatches in Next.js App Router when stores are shared between server and client components. AGI Workforce's web stores (chat-store, workforce-store, team-store) should adopt this middleware to prevent hydration errors in the dashboard
