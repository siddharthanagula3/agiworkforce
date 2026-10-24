# Competitor applications by surface

Status: Current research snapshot
Owner: Product research
Verified: 2026-10-24
Coverage: public official pages read on 2026-10-24, with prior repository research re-checked

This is the dated, surface-by-surface comparison of the AI applications run by the large
vendors we compete with: what each one ships on web, desktop, mobile, CLI, VS Code and Chrome,
with plans and prices. It supersedes the competitor availability material in
`leader-clients-2026-09-14.md` and `market-current-state-2026-09-05.md`, which stay as
historical snapshots. Product decisions still follow `docs/product/competitive-guidance.md`:
reopen the cited page before acting on any single claim here, because vendors change weekly.

AGI columns come from the AGI feature catalog of 2026-10-23, which is built from the
repository. Feature lists name no model versions; a vendor’s model line-up changes faster than
this file.

## How to read this

- **Availability:** Yes, Preview, Waitlist, No, or Unconfirmed (no official page found; not
  proof the surface is absent).
- **Evidence:** _Vendor page_ means an official page said so on 2026-10-24. _Indirect
  evidence_ means store listings, search snippets of official pages, or press. _Unconfirmed_
  means it could not be checked.
- Some vendor sites refused automated reading (help.openai.com, chatgpt.com, openai.com, some
  x.ai, meta.ai and Google Play pages). Claims from those rest on official docs mirrors, store
  listings or press, and are marked as indirect.

## 1. Who ships what, by surface

| Vendor              | Product               | Web         | Desktop     | Mobile      | CLI         | VS Code     | Chrome      |
| ------------------- | --------------------- | ----------- | ----------- | ----------- | ----------- | ----------- | ----------- |
| AGI Workforce       | AGI apps              | Yes         | Coming soon | Coming soon | Coming soon | Coming soon | Coming soon |
| OpenAI              | ChatGPT               | Yes         | Yes         | Yes         | No          | No          | Yes         |
| OpenAI              | Codex                 | Yes         | Yes         | Yes         | Yes         | Yes         | Yes         |
| Microsoft           | Microsoft Copilot     | Yes         | Yes         | Yes         | No          | No          | Yes         |
| Microsoft           | Microsoft 365 Copilot | Yes         | Yes         | Yes         | No          | No          | Yes         |
| GitHub              | GitHub Copilot        | Yes         | Yes         | Yes         | Yes         | Yes         | Unconfirmed |
| Anthropic           | Claude                | Yes         | Yes         | Yes         | No          | No          | Yes         |
| Anthropic           | Claude Code           | Yes         | Yes         | Yes         | Yes         | Yes         | Yes         |
| Google              | Gemini app            | Yes         | Yes         | Yes         | No          | No          | Yes         |
| Google              | Google Antigravity    | No          | Yes         | Unconfirmed | Yes         | Yes         | Unconfirmed |
| Google              | Gemini CLI            | No          | No          | No          | Yes         | Yes         | No          |
| Google              | Gemini Code Assist    | No          | No          | No          | Yes         | Yes         | No          |
| Google              | Jules                 | Yes         | No          | Unconfirmed | Yes         | Unconfirmed | No          |
| Perplexity          | Perplexity            | Yes         | Yes         | Yes         | Unconfirmed | Unconfirmed | Yes         |
| Perplexity          | Comet                 | No          | Yes         | Yes         | No          | No          | Yes         |
| xAI                 | Grok                  | Yes         | Unconfirmed | Yes         | Yes         | Unconfirmed | Unconfirmed |
| xAI                 | Grok Build            | Unconfirmed | No          | No          | Yes         | No          | No          |
| xAI                 | Grok Bot              | Unconfirmed | Yes         | Yes         | Unconfirmed | Unconfirmed | Unconfirmed |
| Meta                | Meta AI               | Yes         | Unconfirmed | Yes         | No          | Unconfirmed | Unconfirmed |
| Meta                | Muse                  | Yes         | Preview     | Yes         | No          | Unconfirmed | Unconfirmed |
| Meta                | Muse Code             | No          | No          | No          | Yes         | Unconfirmed | No          |
| Manus               | Manus                 | Yes         | Yes         | Yes         | Unconfirmed | Unconfirmed | Yes         |
| Cursor              | Cursor                | Yes         | Yes         | Yes         | Yes         | Yes         | Unconfirmed |
| Amazon Web Services | Kiro                  | Yes         | Yes         | Preview     | Yes         | Yes         | Unconfirmed |
| Amazon Web Services | Amazon Q Developer    | Yes         | No          | Yes         | Yes         | Yes         | Unconfirmed |
| Cognition           | Devin Desktop         | No          | Yes         | Waitlist    | Yes         | Yes         | Unconfirmed |
| Cognition           | Devin                 | Yes         | Yes         | Waitlist    | Yes         | No          | Unconfirmed |

AGI by surface: web is AGI Chat (with AGI Work inside it); desktop is AGI Desktop; mobile is
AGI Mobile; CLI is AGI CLI; VS Code is AGI Code; Chrome is AGI Extension.

## 2. What changed most recently

- **2026-10-23 · Codex:** Codex CLI 0.164.0: ten /presets slots, inline /model and /permissions args, enterprise MCP account-grant auth, image previews ([source](https://github.com/openai/codex/releases))
- **2026-10-23 · GitHub Copilot:** New GitHub app for Microsoft Teams combining notifications with Copilot; legacy app retires Nov 16 ([source](https://github.blog/changelog/2026-10-23-turn-notifications-into-code-with-github-copilot-in-teams/))
- **2026-10-23 · Claude Code:** Claude Code 2.1.310: Monitor tool and plugin monitors on Bedrock, Vertex and Foundry; cloud sessions and Remote Control permissions in Enterprise custom roles ([source](https://code.claude.com/docs/en/changelog))
- **2026-10-23 · Muse:** Muse launched in Japan on iOS, Android and muse.ai ([source](https://about.fb.com/ja/news/2026/10/muse-personal-ai-agent-launches-in-japan/amp/))
- **2026-10-23 · Kiro:** Experimental support for a new small model with 1M-token context across IDE, CLI, Crew and Web; CLI 2.34.0 adds MCP input requests and memory deletion ([source](https://kiro.dev/changelog/))
- **2026-10-22 · Devin:** Open-source plugin that finds and patches repos affected by critical Node and PHP flaws, one PR per repo ([source](https://devin.ai/blog))
- **2026-10-21 · Claude:** Claude Duet research preview: proactive agent app for Pro and Max (US first, waitlist), runs tasks on a cloud VM with its own browser, daily brief, 6,000+ connectors and plugins ([source](https://support.claude.com/en/articles/12138966-release-notes))
- **2026-10-21 · Claude Code:** Claude Code 2.1.307: /claude-api api-version command, new safety_event OpenTelemetry event, '@claude review stop' for Code Review ([source](https://code.claude.com/docs/en/changelog))
- **2026-10-21 · Kiro:** Several models (Claude, GPT families) become generally available; workflows start only when asked (CLI 2.33.1) ([source](https://kiro.dev/changelog/))
- **2026-10-21 · Devin:** Devin Review supports Bitbucket Cloud ([source](https://docs.devin.ai/release-notes/overview))
- **2026-10-20 · ChatGPT:** Locked chats rolling out to Free, Go, Plus, Pro on web, iOS, Android and desktop ([source](https://help.openai.com/en/articles/6825453-chatgpt-release-notes))
- **2026-10-20 · Kiro:** CLI asks to trust a workspace before loading its configuration ([source](https://kiro.dev/changelog/))
- **2026-10-19 · Claude Code:** Claude Code 2.1.304: /auto-mode-setup guided configuration; Pro and Max warned before resuming an inactive conversation that would use a large share of the five-hour limit ([source](https://code.claude.com/docs/en/changelog))
- **2026-10-19 · Perplexity:** Ultrafast model choices in Computer, Decisions API, role-based connector access ([source](https://www.perplexity.ai/changelog))
- **2026-10-19 · Kiro:** IDE 1.4.0 introduces Memory carrying context across chat sessions; later defaulted to Off in 1.4.10 ([source](https://kiro.dev/changelog/))
- **2026-10-19 · Devin:** Devin Oncall generally available to all organizations; Devin Review rules editor ([source](https://docs.devin.ai/release-notes/overview))
- **2026-10-16 · ChatGPT:** ChatGPT Slides for team editing in Space, rolling to eligible Pro users ([source](https://help.openai.com/en/articles/6825453-chatgpt-release-notes))
- **2026-10-16 · Cursor:** Cloud agents can build interactive canvases; beta Environments API; environments support up to 300 repositories ([source](https://cursor.com/changelog))
- **2026-10-16 · Kiro:** Crew 0.9.0 adds crewmate profiles and usage estimates; previews per-crewmate dashboards and remote crews ([source](https://kiro.dev/changelog/))
- **2026-10-15 · ChatGPT:** New Live voices and a mini live voice model, adding French, German, Hindi, Japanese, Korean, Mexican Spanish ([source](https://help.openai.com/en/articles/6825453-chatgpt-release-notes))
- **2026-10-15 · Codex:** Codex CLI 0.163.0: searchable /config, steer a response in progress, /daemon restart, parallel read-only tools ([source](https://learn.chatgpt.com/docs/changelog))
- **2026-10-15 · GitHub Copilot:** Agentic autofix for code scanning alerts generally available ([source](https://github.blog/changelog/label/copilot/))
- **2026-10-14 · ChatGPT:** Previous-generation model retired from ChatGPT, Work and Codex on all plans (API unaffected) ([source](https://learn.chatgpt.com/docs/whats-new))
- **2026-10-14 · GitHub Copilot:** HydraFusion updates and a new Max option ([source](https://github.blog/changelog/label/copilot/))
- **2026-10-13 · Gemini app:** Latest frontier model for Pro and Ultra; Antigravity coding agent can be started from the Gemini macOS app; new Customize section with skills and 40+ connected apps ([source](https://gemini.google/release-notes/))
- **2026-10-13 · Google Antigravity:** Latest frontier model arrives in Antigravity for Google AI Pro and Ultra ([source](https://antigravity.google/blog))
- **2026-10-13 · Meta AI:** New Facebook tools to shape Feed and Reels by describing interests in words ([source](https://about.fb.com/news/))
- **2026-10-13 · Manus:** OPPO partnership to bring Manus agent features to phones ([source](https://manus.im/blog/manus-partners-oppo))
- **2026-10-13 · Cursor:** Origin App Marketplace opens to public submissions from developer tool teams ([source](https://cursor.com/changelog))
- **2026-10-13 · Devin Desktop:** New Gemini model available in Devin Desktop and CLI at 75% off list through Oct 27 ([source](https://devin.ai/blog))

Scheduled ahead:

- **2027-04-30 · Amazon Q Developer:** Scheduled end of support for IDE plugins and paid subscriptions (future) ([source](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/q-developer-ide-end-of-support.html))

The full list per vendor is in section 5.

## 3. Each surface in detail

### Web

**AGI: AGI Chat** (Available now). A private AI assistant in the browser that chats, researches, writes, builds files and apps, remembers what matters and runs tasks on a schedule. Runs on: Any web browser on a computer or phone; Can be installed to a computer or home screen from the browser. 102 catalogued features across: Chat and the message box (18), Models (7), Files and documents (5), Search and research (4), Voice (3), Images (1), Artifacts and published pages (3), Projects (6), Library (1), Memory and personalization (4), Study (1), Skills, plugins and agents (3), Scheduled tasks (2), Safety and approvals (5), Sharing (2), Personal settings (6), Account, security and privacy (6), Usage, credits and billing (8), Teams and workspaces (4), Admin and enterprise controls (13).

**AGI: AGI Work** (Available now). Hand AGI a goal and it plans the steps, does the work with tools and files, and comes back with results you can review.

#### OpenAI: ChatGPT (chatgpt.com)

Availability: Yes. Evidence: Vendor page.
Platforms: Any modern browser.

- Chat mode for quick answers and Work mode for multi-step delegated tasks with reviewable results
- Model picker and reasoning-effort levels (light to extra high, plus Max and Ultra on some models)
- Web search and browsing
- Image generation and editing
- Projects group chats, files and instructions
- File uploads: documents, slides, spreadsheets, PDFs, images, data exports
- Audio uploads for transcripts and summaries (paid plans, added 2026-10-06)
- Create documents, presentations, spreadsheets and PDFs in chat, revise and download
- ChatGPT Space: shared Pages, Slides, spreadsheets, Sites and collaboration with the agent
- Sites: build and share websites/tools, workspace-private option
- Plugins and connected apps (Google Drive, SharePoint, Gmail, Outlook, Slack, Teams, Salesforce, Zoom, GitHub, Google Calendar, Canva, Dropbox, LinkedIn, Adobe Acrobat) invoked with @
- Skills for repeatable workflows
- Memories, Library and personalization (personality style, custom instructions, writing style in Work)
- Scheduled tasks (replaced Pulse daily briefs per secondary reporting), including triggers from Gmail, Slack, GitHub events
- Cloud browser for Work with website sign-in (Plus and Pro; not Enterprise/Edu); cloud browsing on paid plans other than Free and Go
- Cross-device sync of Work tasks between desktop, web and mobile
- Locked chats with PIN or device auth (2026-10-20)
- Intelligent UI: interactive calculators/visuals inside answers (2026-10-07)
- Read-only shared snapshots of threads via link
- Codex on the web (cloud tasks) available from the same account
- Dots: always-on cloud agent created from web, desktop or mobile (not mobile web)
- Admin: workspace connections, plugin controls, Agent Security policy, Compliance API (Enterprise)

Plans and limits: Free and Go get the efficient model only and lighter limits; Plus/Pro/Business/Enterprise get larger model set; cloud browsing and Work cloud features gated to paid plans; Enterprise/Edu need admin enablement for plugins and cloud browser. Exact message caps not stated on fetched pages.

Notes: help.openai.com and chatgpt.com returned HTTP 403 to automated fetch, so consumer feature list leans on OpenAI's learn.chatgpt.com docs and search snippets of release notes.

Sources: <https://learn.chatgpt.com/docs/web>, <https://learn.chatgpt.com/docs/use-chatgpt>, <https://learn.chatgpt.com/docs/personalize>, <https://learn.chatgpt.com/docs/plugins>, <https://learn.chatgpt.com/docs/space>, <https://learn.chatgpt.com/docs/get-started-with-work>, <https://learn.chatgpt.com/docs/dots>, <https://learn.chatgpt.com/docs/browser>, <https://help.openai.com/en/articles/6825453-chatgpt-release-notes>

#### OpenAI: Codex cloud on ChatGPT web

Availability: Yes. Evidence: Vendor page.
Platforms: Browser.

- Cloud environments built from chosen repos, tools and access; publishable and reusable
- Configurable internet access presets, extra allowed domains, network secrets, env vars, OIDC (advanced)
- GitHub repo selection; review changed files and test results; request follow-ups; commit or open a PR
- Parallel tasks, each in its own workspace, keep running while your computer sleeps
- Start tasks from web, mobile, desktop or CLI; ChatGPT in Slack
- Automatic code review on GitHub PRs (Plus and above)
- Codex Security Cloud (research preview): repo scanning and patch preparation
- Dots can delegate work to Codex and check results

Plans and limits: Cloud integrations need Plus or higher; API-key sign-in has no cloud features; cloud tasks draw more allowance than local messages.

Notes: Cloud docs page does not name plans; plan gating is from the pricing page.

Sources: <https://learn.chatgpt.com/docs/cloud>, <https://learn.chatgpt.com/docs/web>, <https://learn.chatgpt.com/docs/pricing>, <https://learn.chatgpt.com/docs/whats-new>

#### Microsoft: Microsoft Copilot (copilot.com)

Availability: Yes. Evidence: Vendor page.
Platforms: Browser; sign in with a Microsoft account.

- Chat with grounded web search answers
- Create: drafting and image generation
- Guided Learning (formerly Study and Learn)
- Notebook (formerly Project)
- Cowork (formerly Tasks) for multi-step work; preview for personal accounts, needs Personal, Family, Premium or Pro
- Researcher (formerly Deep Research)
- Existing chats, history and files carry over to the new experience
- Work and personal conversations kept separate by account
- Copilot Code tab (Frontier preview; supported consumer plan required)

Plans and limits: Free tier is limited by capacity; agentic features limited on Premium and highest on Pro; Cowork for personal accounts is preview.

Notes: copilot.com marketing page does not describe voice, vision or memory for the consumer app. Pricing page mentions visual AI from screen or camera, AI audio (English), image creation with usage by plan.

Sources: <https://copilot.com/>, <https://www.microsoft.com/en-us/copilot/pricing/individuals>, <https://support.microsoft.com/en-us/microsoft-365-copilot/get-started-with-cowork>, <https://learn.microsoft.com/en-us/copilot/code/code-requirements>

#### Microsoft: Microsoft Copilot at copilot.cloud.microsoft / m365.cloud.microsoft

Availability: Yes. Evidence: Vendor page.
Platforms: Browser (Edge supported for browser-use tasks).

- Chat grounded in web and, with Premium license, work data via Microsoft Graph and Work IQ
- Model selector: Auto, Quick response, Think deeper; choice of OpenAI and Anthropic models
- Copilot Search across Microsoft 365 and connected sources
- Cowork: sends email, schedules meetings, creates Word/Excel/PowerPoint/PDF, posts in Teams, manages OneDrive and SharePoint files, deep research, daily briefings, scheduled and event-driven tasks, 50 custom skills, plugins
- Cowork browser use in local Edge with your sign-in (admin-enabled, Edge 152+)
- Notebooks with inline Office editing
- Agents: declarative, prebuilt, Agent Builder, Planner agent, Copilot Studio
- Copilot Code tab to build apps and dashboards (Frontier), publish to Copilot Managed Runtime
- Regenerate response for alternative answers
- Copilot Analytics and usage reports for admins
- Admin: Copilot controls, web-search policy, image generation toggle, agent controls, AI Administrator role, Purview and SharePoint Advanced Management
- Enterprise Data Protection and EU Data Boundary

Plans and limits: Chat Basic is web-only grounded; full work-data grounding and priority access need the Copilot add-on; Cowork, Code, Autopilot are usage-billed; Code and Home are Frontier-gated.

Notes: Cowork for work or school accounts is generally available; the App skill and Code are Frontier preview.

Sources: <https://learn.microsoft.com/en-us/microsoft-365/copilot/copilot-overview>, <https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/>, <https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/cowork-local-browser>, <https://learn.microsoft.com/en-us/copilot/code>, <https://www.microsoft.com/en-us/microsoft-365-copilot/pricing>

#### GitHub: Copilot on GitHub.com (chat, cloud agent, code review, Spaces)

Availability: Yes. Evidence: Vendor page.
Platforms: Browser at github.com.

- Chat about repos: explain code, suggest fixes, generate tests, compare approaches, semantic code search
- Preconfigured tools to create branches, update files, manage issues
- Cloud agent: assign an issue or task, it works in an ephemeral environment and opens a PR (one branch and one PR per task; 59-minute session max)
- Choose among Copilot, Claude and OpenAI Codex agents (Pro+ and Max)
- Code review on PRs, on request or automatic; PR summaries
- Automations on schedule or repo events from the Agents tab
- GitHub Agentic Workflows in Actions defined in Markdown
- Copilot Spaces for shared context
- Custom instructions, custom agents, skills, MCP servers, hooks
- Model picker; synced session history across surfaces
- Public code match references
- Copilot Autofix for code scanning alerts (agentic autofix GA Oct 15)
- Copilot in Slack and Teams (new GitHub Teams app Oct 23)
- Org admin: content exclusion, MCP allow lists, usage metrics API, model policy API, per-repo cloud agent disable

Plans and limits: Cloud agent and code review need Pro or above; third-party agents need Pro+ or Max; usage consumes AI credits (1 credit = $0.01); completions free of credit use.

Notes: Repository must be GitHub-hosted for cloud agent.

Sources: <https://docs.github.com/en/copilot/concepts/copilot-surfaces/copilot-on-github>, <https://github.com/features/copilot/plans>, <https://github.com/features/copilot>, <https://github.blog/changelog/label/copilot/>

#### Anthropic: Claude (claude.ai)

Availability: Yes. Evidence: Vendor page.
Platforms: Desktop and mobile browsers.

- Chat with quick answers or longer tasks that keep running after you close the laptop
- Cowork merged into every conversation (Sept 16): no mode choice, chats, tasks, projects, connectors and skills carry over; rolling out gradually to Pro and Max
- Voice mode
- Web search
- Research (multi-source report; 5+ tool calls over 1 to 3 minutes; paid plans)
- Memory of past conversations (on by default Free/Pro/Max; Team/Enterprise owner enables, members opt in)
- Chat search and reference (paid plans)
- Incognito chats on all plans
- Projects with shared context and files (up to 5 on Free; unlimited paid; shared on Team/Enterprise)
- Artifacts: shareable designs, slides, documents, interactive charts and diagrams; on every plan including Free
- Claude Design (on-canvas editing, design-system import), Claude Slides, Claude Docs
- Editable documents, spreadsheets with working formulas, and slide decks
- Connectors including interactive MCP apps and custom MCP connectors
- Skills you can teach, record and share; plugins from a marketplace
- Scheduled recurring tasks
- Parallel tasks and starting tasks from phone
- File and image upload, PDF and screenshot analysis
- Claude Code on the web at claude.ai/code (see Claude Code entry)
- Admin controls on Team/Enterprise: access by team, spend limits, activity logging, connector controls, SSO
- Enterprise: SCIM, audit logs, Compliance API, IP allowlisting, HIPAA-ready

Plans and limits: Usage is metered per rolling five-hour window plus weekly limits on paid plans. Free excludes Research, Claude Code and Claude in Chrome. Cowork shown as 'Not listed' for Pro/Max on the pricing table, but the help center says Cowork is on all paid plans and the Sept 16 release note rolls it into every conversation for Pro and Max.

Notes: Claude Duet (research preview, waitlist) is a separate proactive-agent app available on claude.ai plus a standalone iOS/Android app, included in Pro and Max, US Pro and Max first (release note Oct 21). Claude Science (public beta) is a separate desktop app for scientific analysis on Pro/Max/Team/Enterprise.

Sources: <https://claude.com/pricing>, <https://claude.com/product/overview>, <https://support.claude.com/en/articles/12138966-release-notes>, <https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context>, <https://support.claude.com/en/articles/11095361-using-research-on-claude>, <https://support.claude.com/en/articles/13345190-getting-started-with-cowork>, <https://claude.com/blog/claude-duet>

#### Anthropic: Claude Code on the web (claude.ai/code, cloud sessions)

Availability: Yes. Evidence: Vendor page.
Platforms: Desktop browsers; sessions also reachable from the desktop app and Claude mobile app.

- Cloud sessions on Anthropic-managed VMs that keep running after you close the laptop
- Self-hosted environments for Team and Enterprise
- Connect GitHub via Claude GitHub App or /web-setup; GitLab/Bitbucket only as an uploaded bundle without push-back
- Diff view with inline comments, PR creation
- Auto-fix pull requests (responds to CI failures and review comments)
- Projects: one conversation coordinating many parallel cloud sessions
- Cloud scheduled tasks triggered by schedule, API call or GitHub event
- Teleport a cloud session into the terminal (claude --teleport); start cloud sessions from terminal (claude --cloud)
- Session sharing: Private/Public on Pro and Max, Private/Team on Team and Enterprise
- Permission modes in cloud: Accept edits, Plan, Auto
- Ultrareview: deep multi-agent code review in a cloud sandbox
- Configurable network access levels and setup scripts per environment

Plans and limits: Pro, Max, Team and Enterprise (premium or Chat + Claude Code seat). No separate charge for the cloud VM; counts toward plan usage. Not available with ZDR, HIPAA configuration or CMEK, or with third-party providers.

Notes: Repo cloning and PRs require GitHub (GitHub Enterprise Server supported on Team/Enterprise).

Sources: <https://code.claude.com/docs/en/claude-code-on-the-web>, <https://code.claude.com/docs/en/overview>, <https://code.claude.com/docs/en/feature-availability>

#### Google: Gemini (gemini.google.com)

Availability: Yes. Evidence: Vendor page.
Platforms: Desktop and mobile browsers.

- Chat with automatic or manual model selection
- Deep Research: reviewable plan, browses up to hundreds of sites and optionally Gmail, Drive and Chat, multi-page report that can become an Audio Overview or Canvas content
- Canvas for writing and coding; prototypes of apps, games, dashboards; shareable
- Gemini Live voice chat with camera input, visual cards, Google app connections; integrated into chat
- Image generation and editing, video generation and Omni video (paid plans), music generation
- Gems (custom assistants) being replaced by Skills; Gems migrate automatically (Sept 30)
- Skills: reusable instruction sets Gemini builds from chats and runs when a prompt matches (18+)
- Customize section: personal tuning, skills, and 40+ connected apps such as Instacart, OpenTable, Adobe (Oct 13)
- Apps/connections to Gmail, Drive, Docs, Calendar, Maps, YouTube, Photos
- Personal Intelligence (beta, off by default; Gmail, Photos, YouTube, Search; US Pro and Ultra)
- Memory with import from other AI apps and chat-history ZIP upload; 'past chats' renamed 'memories'
- Daily Brief morning summary (Plus and up, US at launch)
- Scheduled actions and Tasks in Gemini (plan-gated; Tasks Ultra only in select countries)
- NotebookLM integration, study notebooks and student hub
- File upload of documents, spreadsheets, photos, video
- Long context (up to 1M tokens on Pro and Ultra)
- Spark: 24/7 personal agent on cloud VMs (beta, US Ultra 18+, English)
- Google Antigravity can be started from the macOS app chat (see desktop)
- SynthID watermarks, activity controls, public link management, data export

Plans and limits: Compute-based limits that refresh every 5 hours until a weekly cap; Plus 2x, Pro 4x, Ultra 5x or 20x Pro. Deep Research and video use the most. Context 32k (no plan), 128k (Plus), 1M (Pro/Ultra). Users without a plan can lose heavy features like Deep Research under high demand.

Notes: Google's overview page still says Gems 'coming soon', which conflicts with the Sept 30 release note that Skills replace Gems; the release note is treated as current. The official overview page does not mention agent mode by that name; Spark and Chrome auto browse are the agentic features.

Sources: <https://gemini.google/overview/>, <https://gemini.google/release-notes/>, <https://support.google.com/gemini/answer/16275805>, <https://gemini.google/overview/deep-research/>, <https://gemini.google/overview/canvas/>, <https://gemini.google/overview/gemini-live/>, <https://gemini.google/overview/agent/>, <https://gemini.google/subscriptions/>

#### Google: Jules (jules.google.com)

Availability: Yes. Evidence: Vendor page.
Platforms: Browser; GitHub integration.

- Pick a GitHub repo and branch, write a prompt, review and approve a plan
- Runs in a cloud VM and works autonomously while you do other things
- Diff review then pull request creation
- Assign tasks by adding a 'jules' label to a GitHub issue
- Reads AGENTS.md from the repo root
- Optional environment setup scripts
- Browser notifications when a task finishes or needs input

Plans and limits: 15 / 100 / 300 tasks per day on base / Pro / Ultra; 18+ only; limits not shared across family plan members.

Notes: Labeled beta and experimental on Google's pages. A press report (AI Weekly) of a goal-driven 'Jules V2' from I/O 2026 could not be confirmed on a Google page and is not counted as fact.

Sources: <https://jules.google/>, <https://jules.google/docs>, <https://jules.google/docs/usage-limits/>, <https://gemini.google/overview/agent/>

#### Perplexity: Perplexity (perplexity.ai)

Availability: Yes. Evidence: Vendor page.
Platforms: Any modern browser; also Computer reachable from Slack, Microsoft 365 and email.

- Cited answer search with follow-up questions
- Pro Search, Research (deep research) and Reasoning modes
- Learn mode for students, available to all users
- Model picker per query and Model Council (run 2 to 8 models and compare)
- Computer: general agent that runs subagents for multi-step work in the background
- Computer Effort Mode slider (Light, Standard, High, Ultra) plus custom model choice
- Side Chat: read-only side questions while a Computer task keeps running
- Automations and Scheduled Tasks: recurring or event-triggered work, pauses before consequential actions
- Brain: self-improving memory across sessions, connectors and files, reviewable and removable
- Memory and personalization used in voice conversations
- Projects with shared files (workspaces for individuals and teams)
- Perplexity Pages
- File and image uploads; image generation
- Create documents, slides, spreadsheets and apps
- Publish Computer-built websites to a pplx.app address or a custom domain via Vercel, with visibility controls
- Video generation in Computer (Pro and Max, personal accounts)
- 400+ connectors (Gmail, Slack, Notion, Calendar and more) with an Always-ask approval setting and role-based connector access
- Plugins bundle connectors and skills; custom plugin upload or GitHub import
- Skills and a public Skills Marketplace (browse without signing in; org sharing for Enterprise)
- Computer in Email: email computer@perplexity.com to start or join a thread
- Custom API credential vault for Computer
- Premium data sources (PitchBook, Statista, S&P Capital IQ), Wiley journals, private-company research
- Perplexity Health (medical records, wearables) and Finance, Patents, Academic menus
- Internal Knowledge Search across files and web for Pro and Enterprise
- Computer Analytics for usage, credits and top users
- Voice mode on web and Computer

Plans and limits: Free is limited; Pro about 10x web answers, uploads and asset generation; Max highest limits. Computer, video and top models are Pro and Max. Effort Mode on personal accounts on web first.

Notes: Help center now documents Projects, not Spaces, as the workspace concept; the name Spaces was not found in current official pages. Pricing-page comparison table is partly ambiguous in text.

Sources: <https://www.perplexity.ai/hub/pricing>, <https://perplexity.ai/products/computer>, <https://www.perplexity.ai/help-center/en/collections/18534886-computer>, <https://www.perplexity.ai/help-center/en/collections/18799290-features>, <https://perplexity.ai/changelog>, <https://perplexity.ai/changelog>, <https://perplexity.ai/changelog/brain-faster-computer-models-website-publishing>, <https://perplexity.ai/changelog>

#### xAI: grok.com (and the Grok tab on X)

Availability: Yes. Evidence: Indirect evidence.
Platforms: Browser.

- Chat with Fast mode toggle and slash commands
- Imagine: image and video generation
- Real-time information from X and the web
- Deep research on the web
- Voice mode
- Document, photo and link analysis
- Import of conversations and context from other AI tools (per App Store listing)

Plans and limits: Plans page text could not be fetched (page did not render). Free tier exists; paid tiers per X Subscription.

Notes: Only the signed-out home page and plans title were readable. Feature list is aligned with the iOS listing, so treat web parity as inferred.

Sources: <https://grok.com>, <https://x.ai/news/x-subscription>, <https://apps.apple.com/us/app/grok/id6670324846>

#### xAI: none found

Availability: Unconfirmed. Evidence: Unconfirmed.

Notes: No web version of Grok Build found.

#### xAI: not mentioned in docs

Availability: Unconfirmed. Evidence: Unconfirmed.

Notes: Docs do not mention a web version. Bots can be started by tagging @bot on X (region dependent).

Sources: <https://docs.x.ai/grok-bot/overview>

#### Meta: meta.ai

Availability: Yes. Evidence: Vendor page.
Platforms: Browser (not available everywhere).

- Chat with Instant, Thinking and Shopping modes
- Multi-step planning that follows through, with scheduled updates (for example a weekly plan)
- Daily briefings from calendar and updates
- Research reports and slide creation from web sources
- Real-time steering of reports and plans while they run
- One library for everything it creates
- Image creation and editing
- Incognito chat

Plans and limits: Free; Meta One Core and Premium raise image and video limits.

Notes: July 2026 agentic features started in select markets in the app and meta.ai, with WhatsApp and more countries promised. meta.ai itself returned 403 to the fetcher, so web feature detail comes from the newsroom and help center.

Sources: <https://about.fb.com/news/2026/07/meta-ai-muse-spark-doesnt-just-think-it-acts/>, <https://www.meta.com/help/artificial-intelligence/943942350800511/>, <https://ai.meta.com/meta-ai/assistant/>

#### Meta: muse.ai

Availability: Yes. Evidence: Vendor page.
Platforms: Browser; US launch, Japan from 2026-10-23.

- Sends emails, books travel, fills forms and negotiates on your behalf
- Turns long-term goals into plans and keeps working after the app is closed
- Operates a browser inside a dedicated cloud VM (Muse Secure VM) with a separate Sentinel agent approving anything that reaches the internet
- Asks approval before sensitive actions such as sending email or buying
- Chat with side chats, tasks, reminders and scheduled tasks
- Files and artifacts: PDFs, spreadsheets, documents, images, podcasts, saved in a Library tab
- Skills
- Connectors (Gmail, Calendar, Instagram, Stripe, Shopify, and later Walmart, Best Buy, Notion, GitHub, Box and more); choose read-only or send for email
- Checkout through Link by Stripe with one-time cards
- Memory you can edit or tell it to forget; customizable personality
- Muse gets its own email address
- Opt out of training use; audit trail

Plans and limits: Token-based weekly allowance by plan.

Notes: Launched 2026-09-08. A Confidential VM encrypted with a user-held key is announced for later. Meta research blog says sanitized trajectories can train models unless you opt out.

Sources: <https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/>, <https://www.meta.com/help/artificial-intelligence/1331373868832401/>, <https://www.meta.com/help/artificial-intelligence/1303670544995562/>, <https://about.fb.com/news/2026/09/the-biggest-news-from-connect-2026/>, <https://about.fb.com/ja/news/2026/10/muse-personal-ai-agent-launches-in-japan/amp/>

#### Manus: manus.im

Availability: Yes. Evidence: Vendor page.
Platforms: Browser.

- Agent that runs tasks in its own cloud computer and delivers finished work
- Free chat with an upgrade to Agent Mode
- Plan Mode: editable Markdown plan before building
- Wide Research with parallel sub-agents; deep research reports
- Slides (including PowerPoint), docs, spreadsheets, PDFs
- Website builder with hosting modes, custom domains, auto-publish, SEO and GitHub sync
- Game Dev and Video Editor (Manus 2.0)
- Projects that learn from tasks (approval-gated updates) and Project Skills
- Branch: parallel directions from one context
- Automations from events in connected apps and Scheduled Tasks
- Connectors (Gmail, Calendar, Slack, Notion, Google Drive, Shopify, HubSpot, Airtable, Zoom, Canva, Supabase, Meta Ads, Instagram and more); Google Workspace precise edits
- Manus Flex: bring your own API key from OpenRouter, Fireworks or Modal for inference
- Cloud Computer: persistent Ubuntu machine over SSH or web terminal
- Manus in Slack and Telegram
- Meeting Minutes
- App sharing and testing toward Google Play and App Store
- Team plan admin controls

Plans and limits: Free: 300 daily credits, 1 concurrent task. Pro: 20 concurrent tasks. Credits consumed by task complexity.

Notes: Credit cost per task is not published.

Sources: <https://help.manus.im/en/articles/11711111-what-is-the-current-membership-pricing-for-manus>, <https://manus.im/blog/introducing-manus-2-0>, <https://manus.im/blog/manus-plan-mode>, <https://manus.im/blog/introducing-manus-flex>, <https://manus.im/blog/manus-cloud-computer>, <https://manus.im/blog/manus-agents-telegram>, <https://manus.im/blog/manus-projects-self-updating>

#### Cursor: Cursor Web / Cloud Agents (cursor.com/agents)

Availability: Yes. Evidence: Vendor page.
Platforms: Any browser; Android users get it as a PWA.

- launch and manage cloud agents that run in isolated cloud VMs
- run many agents in parallel; they keep running when your computer is off
- agents can build, test and use a desktop and browser in the VM
- returns artifacts: screenshots, videos, logs; user can take over the remote desktop
- MCP servers (HTTP and stdio, OAuth) and command hooks in cloud runs
- multi-repo environments, up to 300 repos; builds prepare environments in background
- environment setup by agent, snapshot or Dockerfile; secrets injected at start
- outbound domain restrictions, private networking, self-hosted machines for tool execution
- interactive canvases built by cloud agents (Oct 2026)
- automations: run cloud agents on a schedule or from GitHub, GitLab, Bitbucket, Slack, Linear, Sentry, PagerDuty events or a webhook
- share run URLs with teammates (read-only unless admin enables follow-ups)
- Origin: Cursor's own git host (early beta) with PRs and GitHub mirroring
- Bugbot AI pull-request review
- public API for cloud agents
- start from Slack, GitHub/Bitbucket comment, Linear, API, desktop or CLI

Plans and limits: Cloud Agents need Premium or higher, Teams, Enterprise or a legacy paid plan; Free and Plus excluded. Spend limit must be set on first use. Source control must be connected by an admin.

Notes: Browser-hosted agent dashboard, not a chat product. Origin needs Premium+ too.

Sources: <https://cursor.com/docs/cloud-agent>, <https://cursor.com/docs/automations>, <https://cursor.com/docs/origin>, <https://cursor.com/changelog>

#### Amazon Web Services: Kiro Web (app.kiro.dev)

Availability: Yes. Evidence: Vendor page.
Platforms: Browser; US East (N. Virginia) only.

- browser-based agent that plans, writes code and opens PRs or MRs
- Default, Spec and Autonomous modes
- autonomous mode: plans, sub-agents implement and verify, opens PRs; follow-up via PR comments (/kiro fix, /kiro all)
- isolated cloud sandbox with access controls; keeps running when laptop closed
- GitHub and GitLab repos, multi-repo tasks, issue-based tasks
- scheduled recurring tasks on cron that open PRs (cloud automations only in Web)
- cloud configuration sync of personal .kiro settings, steering, MCP, Powers, workflows
- file explorer for the session workspace
- human review before default branch; Kiro never merges on its own

Plans and limits: Pro, Pro+, Pro Max or Power only. Autonomous mode picks the model automatically. IAM Identity Center, Okta and Entra users need admin to enable Cloud Sessions.

Notes: Hooks are not supported on Web.

Sources: <https://kiro.dev/docs/web/>, <https://kiro.dev/docs/web/autonomous-mode/>, <https://kiro.dev/docs/hooks/>, <https://kiro.dev/>

#### Amazon Web Services: Amazon Q Developer in AWS Management Console, AWS docs and marketing sites; chat apps (Slack, Microsoft Teams)

Availability: Yes. Evidence: Vendor page.
Platforms: Browser inside AWS console and AWS websites; Slack and Teams.

- ask about AWS architecture, resources, bills, best practices and docs
- inspect and troubleshoot AWS resources in chat
- cost and telemetry/operations questions
- Slack and Teams chat apps via @Amazon Q (limited to Free tier access)
- GitHub.com and GitLab Duo integrations for features and code review

Plans and limits: Chat apps limited to the Free tier. AWS says console and chat-app experiences are not affected by the IDE sunset.

Notes: GitHub app: per search-result snippet of AWS docs, new installs stop Nov 18, 2026 and support ends Jan 30, 2027; I did not read that page directly.

Sources: <https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/what-is.html>, <https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/q-in-chat-applications.html>, <https://aws.amazon.com/blogs/devops/amazon-q-developer-end-of-support-announcement/>, <https://aws.amazon.com/q/developer/>

#### Cognition: none for the editor; cloud sessions are the Devin web app (see Devin entry)

Availability: No. Evidence: Indirect evidence.
Platforms: n/a.

- sessions can move between local Devin Desktop and Devin Cloud with same context

Plans and limits: Devin Cloud access listed from Pro.

Notes: The old windsurf.com site and docs now redirect to devin.ai and docs.devin.ai. No separate Windsurf web agent.

Sources: <https://devin.ai/desktop>, <https://devin.ai/pricing>

#### Cognition: Devin web app (app.devin.ai)

Availability: Yes. Evidence: Vendor page.
Platforms: Browser.

- delegate tasks to Devin running in its own VM (Windows, Mac, Linux environments)
- Ask mode (explore code, plan) and Agent mode (write code, run commands, browse, open PRs)
- agent choices: Lite, Normal, Ultra, Fusion, Cognition's own coding model preview, Data Analyst
- embedded IDE, shell, browser and takeover
- playbooks, knowledge/skills, secrets, @ mentions of repos, files and prior sessions
- parallel sessions and sub-sessions
- Devin Review for PRs: smart diffs, bug and security findings, auto-review, auto-fix; SARIF export
- DeepWiki codebase maps; Ask Devin codebase Q&A
- Devin Oncall (GA Oct 2026), Auto-triage, Security Swarm
- scheduled and trigger-based automations
- personal memory across sessions
- iOS and macOS app builds in a cloud Mac with simulator and TestFlight sharing (Sept 2026 press release)
- voice calls with Devin
- notification inbox, Terminal tab, Computer tab
- SSO, RBAC, SCIM, audit logs, zero data retention with model providers, VPC option (Enterprise)
- API access

Plans and limits: Devin Cloud listed from Pro; session counts: up to 10 concurrent (lower tiers) and unlimited (higher), page does not map clearly. Resume window shortened to 14 days (Oct 2026). Quotas refresh daily and weekly; extra usage at API pricing.

Notes: Per-plan checkmarks for Tab, DeepWiki, Ask Devin, API were not extractable from the pricing page text.

Sources: <https://docs.devin.ai/>, <https://docs.devin.ai/get-started/first-run>, <https://docs.devin.ai/work-with-devin/devin-review>, <https://docs.devin.ai/release-notes/overview>, <https://devin.ai/>, <https://devin.ai/pricing>

### Desktop

**AGI: AGI Desktop** (Coming soon). A Mac app with everything in AGI Chat, plus shortcuts that work from any app, screenshots into chat, coding agents on your own folders and control from your phone. Runs on: Mac (Apple silicon and Intel); Windows and Linux: not yet planned with a date. 37 catalogued features across: The app (12), Shortcuts that work from any app (7), Notifications (1), Coding agents on your Mac (10), Local models (1), Computer and browser control (3), Control from your phone (2), Privacy (1).

#### OpenAI: ChatGPT desktop app (Chat, Work and Codex modes in one app)

Availability: Yes. Evidence: Vendor page.
Platforms: macOS (Apple Silicon), Windows, Linux (preview per release notes).

- Single app with Chat, Work and Codex modes (Codex app merged into ChatGPT desktop July 2026)
- Quick chat / companion window with global shortcut
- Pets: floating quick-chat control with voice and text (macOS, Windows)
- Built-in browser with separate profile, annotation mode, split view, downloads, developer mode (DevTools protocol access with approval)
- Computer Use: @Computer or @AppName to operate apps by screen (macOS, Windows); per-app approvals; locked-screen use on macOS
- Appshots: share the frontmost window with ChatGPT (macOS; Windows via both Alt keys)
- Voice in the desktop app to direct agents (billed at $0.05/min from Codex usage budget)
- Computer History (opt-in, macOS): activity timeline turned into memories, with pause, exclude and delete
- Local files, apps, plugins; multi-folder local projects; parallel projects
- Scheduled tasks standalone or inside a chat
- Remote connections: control this Mac/PC from phone; SSH hosts from ~/.ssh/config
- Apple Messages plugin on macOS (read and send iMessage, SMS, RCS)
- Permission modes: Ask for approval, Approve for me (auto-review), Full access, Custom
- Browser extension pairing for Chrome, Edge, Brave, Opera, Vivaldi
- Locked chats, Library, Activity view for delegated tasks
- Import from Claude Code, Claude Cowork and Cursor (Aug 2026)
- Ultrafast speed mode (Pro $500 and eligible Enterprise/Edu)

Plans and limits: Free and Go: efficient model only. Computer Use and Work require supported regions. Computer History on macOS for Pro/Business/Enterprise per Aug release note. Voice available on supported plans.

Notes: Atlas browser retired Aug 9 2026; its browsing moved to this app's built-in browser plus a Chrome extension. Linux preview is from release-note summary; the Linux docs page returned 404.

Sources: <https://learn.chatgpt.com/docs/app>, <https://learn.chatgpt.com/docs/whats-new>, <https://learn.chatgpt.com/docs/browser>, <https://learn.chatgpt.com/docs/computer-use>, <https://learn.chatgpt.com/docs/personalize>, <https://learn.chatgpt.com/docs/remote-connections>, <https://learn.chatgpt.com/docs/pricing>

#### OpenAI: Codex mode in the ChatGPT desktop app

Availability: Yes. Evidence: Vendor page.
Platforms: macOS (Apple Silicon), Windows (with sandbox and WSL guidance), Linux.

- Start Codex from New chat in the shared desktop app
- Parallel threads across local projects and worktrees
- Steer a running task with follow-up messages (faster steering added 2026-10-08)
- Diffs, review views, pull requests
- Built-in browser, Computer Use, annotations for local web app previews
- Subagents with Active/Done panel
- Automations and scheduled tasks
- Remote SSH hosts from ~/.ssh/config
- Share read-only snapshots of local threads (macOS)
- Permission modes: Ask for approval, Approve for me, Full access, Custom
- Voice to direct agents; Appshots
- Hooks, skills, plugins, MCP
- Import from Claude Code, Cowork and Cursor

Plans and limits: Local message limits per five hours on Plus and standard Business (see plans); Pro no five-hour cap; voice $0.05/min from Codex budget.

Notes: Standalone Codex app was folded into the ChatGPT desktop app in July 2026.

Sources: <https://learn.chatgpt.com/docs/app>, <https://learn.chatgpt.com/docs/whats-new>, <https://learn.chatgpt.com/docs/permission-modes>, <https://learn.chatgpt.com/docs/remote-connections>

#### Microsoft: Microsoft Copilot desktop app

Availability: Yes. Evidence: Indirect evidence.
Platforms: Windows (x64 and Arm), macOS (Sonoma 14 or later; Intel and Apple silicon).

- Chat and Cowork combined on a Home start page (rolling to Frontier program)
- Copilot Code with live preview canvas, local or cloud (Frontier)
- Office in Copilot: edit Word, Excel, PowerPoint files inside the app
- Cowork tasks that create documents and act across Microsoft 365
- Notebooks with Office editing (October update, secondary source)
- Voice, keyboard or pen input

Plans and limits: Code in preview for Microsoft 365 Premium and Pro 'later this year'; Frontier program access first.

Notes: Microsoft now ships one Copilot app for personal and work accounts; the fetched pages blend consumer and business features, so the consumer-only split is partly inferred.

Sources: <https://www.microsoft.com/en-us/microsoft-365-copilot/download-copilot-app>, <https://blogs.microsoft.com/blog/2026/09/25/introducing-the-new-copilot-with-home-code-and-autopilot/>, <https://learn.microsoft.com/en-us/copilot/code/code-requirements>, <https://copilot.com/>

#### Microsoft: Microsoft Copilot desktop app plus Copilot inside Word, Excel, PowerPoint, Outlook, Teams, OneNote

Availability: Yes. Evidence: Vendor page.
Platforms: Windows (x64, Arm), macOS Sonoma 14+.

- Copilot in Word (draft, rewrite, summarize), Excel (analyze, formulas, visuals), PowerPoint (create from prompts, custom skills), Outlook (drafts, triage), OneNote, Teams (meeting summaries, up to 30 days), Forms
- Cowork and Copilot Code in the desktop app
- Home start page combining Chat and Cowork (Frontier)
- Office in Copilot: live-collaborative editing of files inside the app
- Vision on desktop screen content
- Autopilot: cloud-hosted persistent agent you @mention in Teams and Outlook (private preview)
- Configure org policy link for blocked Copilot app

Plans and limits: Add-on license gives priority access; Basic license has standard access subject to capacity.

Notes: Browser use in Cowork is not supported in the desktop app; it runs in Cowork on the web.

Sources: <https://www.microsoft.com/en-us/microsoft-365-copilot/download-copilot-app>, <https://learn.microsoft.com/en-us/microsoft-365/copilot/copilot-overview>, <https://blogs.microsoft.com/blog/2026/09/25/introducing-the-new-copilot-with-home-code-and-autopilot/>, <https://learn.microsoft.com/en-us/copilot/code/code-requirements>

#### GitHub: GitHub Copilot app

Availability: Yes. Evidence: Vendor page.
Platforms: macOS, Linux, Windows.

- Parallel agent sessions, each in its own git worktree and branch
- Cloud sandbox or local sandbox per session
- Interactive, Plan and Autopilot session modes with model and reasoning-effort choice, including bring your own key
- Browse issues, start sessions from them, create/review/close PRs, view CI results
- Global instructions, MCP servers, agent skills
- Automations on schedule or on demand
- Chats without a branch or workspace
- /chronicle insights from past sessions
- Canvases: shared agent-driven interfaces
- Computer use on macOS and Windows to operate desktop apps
- Dynamic workflows (public preview): coded multi-step programs mixing commands and agents with checkpoints
- Respects content exclusion for Business and Enterprise

Plans and limits: All Copilot plans; Business/Enterprise admins must keep the app policy enabled (on by default).

Notes: Docs page does not state preview or GA status for the app.

Sources: <https://docs.github.com/en/copilot/concepts/copilot-surfaces/github-copilot-app>, <https://github.blog/changelog/2026-10-01-dynamic-workflows-in-copilot-cli-and-the-copilot-app/>, <https://github.blog/changelog/label/copilot/>

#### Anthropic: Claude desktop app (Chat, Cowork, Code tabs)

Availability: Yes. Evidence: Vendor page.
Platforms: macOS, Windows (x64 and arm64, also Microsoft Store), Linux beta (Ubuntu/Debian x64 and arm64). Enterprise MSIX (Windows) and PKG (Mac) installers.

- All of chat on every plan including Free; Code and Cowork on paid plans
- Cowork: agentic multi-step tasks without a terminal, parallel sub-agents, cloud or local execution
- Local file and folder access (connected folders only); Cowork runs code in an isolated VM on the computer
- Outputs: spreadsheets with formulas, slide decks, formatted documents
- Desktop extensions (installable packages connecting Claude to local apps and data; curated directory; code signing)
- Browser control through Claude in Chrome or a built-in browser
- Computer use (research preview; Pro and Max; macOS 14+; off by default; not on Linux)
- Dictation and Quick Entry global hotkey (not on native Linux/Wayland by default)
- Dispatch: message a task from the phone and it can spawn a desktop session (Pro and Max)
- Scheduled tasks (desktop-local and cloud)
- Skills, plugins, custom connectors and local MCP servers (local-MCP plugins are desktop-only)
- Permission modes in Cowork: Manual, Auto, Skip
- Claude Code Code tab: parallel sessions, git worktrees, diff review, PR auto-fix, preview pane, SSH/WSL/cloud environments (see Claude Code entry)
- Enterprise: Claude Desktop on 3P runs the Code tab on Bedrock, Google Cloud Agent Platform, Foundry or a gateway

Plans and limits: Chat on all plans; Code and Cowork on paid plans; computer use and Dispatch Pro and Max only (not Team/Enterprise).

Notes: Minimum OS differs by page: download page lists macOS and Windows without versions; the help center says macOS 13+ and Windows 10+. Cowork on Linux needs KVM, QEMU, about 25 GB disk and 8 GB RAM.

Sources: <https://claude.com/download>, <https://support.claude.com/en/articles/10065433-installing-claude-desktop>, <https://support.claude.com/en/articles/13345190-getting-started-with-cowork>, <https://code.claude.com/docs/en/desktop>

#### Anthropic: Claude desktop app, Code tab

Availability: Yes. Evidence: Vendor page.
Platforms: macOS, Windows x64 and arm64, Ubuntu/Debian beta.

- Parallel sessions with optional git worktree isolation
- Draggable pane layout: chat, diff, browser, terminal, file editor
- Visual diff review with line comments
- PR monitoring: Auto-fix and Merge when ready (needs gh CLI)
- Browser pane to preview the running app and let Claude verify changes
- Side chats with /btw
- Cross-session work: Claude can list, read and message other desktop sessions
- Computer use (research preview; Pro and Max; macOS 14+)
- Local, Cloud, SSH and WSL environments
- Dispatch: tasks messaged from phone open as desktop sessions (Pro and Max)
- Desktop scheduled tasks running on your machine
- Permission modes: Manual, Accept edits, Plan, Auto, Bypass
- Includes Claude Code, no separate CLI install needed

Plans and limits: Paid subscription required. Computer use and Dispatch are Pro and Max only.

Notes: Git required for session isolation.

Sources: <https://code.claude.com/docs/en/desktop>, <https://code.claude.com/docs/en/overview>

#### Google: Gemini desktop app

Availability: Yes. Evidence: Vendor page.
Platforms: macOS (Apple Silicon, macOS 15+) and Windows 10/11 (x64 and ARM64). Download at gemini.google/desktop.

- Alt+Space (Windows) or Option+Space (Mac) summons Gemini over any window; Option+Shift+Space for full chat on Mac
- Dictation into any app with formatting
- Multi-step background tasks with per-action approval; can organize local files into Docs and Sheets
- Pulls from Gmail, Drive, Docs and Calendar
- Image generation and Omni video
- Screen context sharing on Mac (both Command keys)
- Open Google Antigravity from the app on Mac; start a coding agent from chat, approve its plan, get notified (Oct 13)
- Spark agent in the Mac app for Ultra (Jun 30) with local file access
- Chat history and memory sync across desktop, web and mobile
- Workspace admins: on by default where Gemini is enabled, follows the Generative AI settings in the Admin console

Plans and limits: Base app free for personal accounts and Workspace; some features need a Google AI subscription and age 18+.

Notes: Windows launched Sept 10-11 2026. Mac app launch (about April 15-16 2026) is from secondary news only. Some Mac features (screen context, local-folder tasks, Antigravity launch) are not yet on Windows per Google's desktop page.

Sources: <https://gemini.google/desktop>, <https://workspaceupdates.googleblog.com/2026/09/the-gemini-desktop-app-is-now-available-for-Windows.html>, <https://gemini.google/release-notes/>, <https://androidauthority.com/gemini-windows-app-3710027>

#### Google: Antigravity 2.0 App (v2.5+ per docs)

Availability: Yes. Evidence: Vendor page.
Platforms: macOS 12+ (Apple Silicon and Intel), Windows 10/11 (x64, ARM64), Linux (glibc 2.28+), preinstalled on Googlebooks.

- Command center for managing multiple local agents in parallel
- Projects: repository boundaries, permissions, multiple folders and workspaces; local mode or isolated Git worktree
- Subagents spawned by the main agent
- Scheduled tasks (crons or one-off timers, /schedule)
- Voice input with live transcription
- /goal runs a task to completion; /grill-me interviews you for requirements first
- /browser enables browser tools; browser-in-the-loop agents for frontend work
- Artifact review of plans and diffs
- JSON hooks, agent skills, rules, custom agents
- Remote Control (Aug 21)
- Latest frontier model supported in App, CLI and IDE extensions but not in the standalone Antigravity IDE

Plans and limits: Free tier with basic weekly limits; Pro and Ultra raise limits and add an AI credit pool.

Notes: A standalone Antigravity IDE also exists but does not support the newest frontier model.

Sources: <https://antigravity.google/>, <https://antigravity.google/docs/getting-started>, <https://antigravity.google/blog/introducing-google-antigravity-2>, <https://antigravity.google/blog>

#### Perplexity: Perplexity desktop app (Personal Computer)

Availability: Yes. Evidence: Vendor page.
Platforms: Windows 10 version 1809 or later; macOS 15 or later. Windows via Microsoft Store or perplexity.ai/platforms; Mac via DMG. No Linux app found.

- Everything in Computer on the desktop, with sessions that keep running in the background
- Local files and folders: find, sort, move, rename, read, create and edit documents, spreadsheets, code and reports in folders you allow
- Floating task bar to open Perplexity over any app
- Ask threads and Computer tasks share one sidebar
- Remote Access: start, continue or monitor desktop work from another desktop, mobile or web
- Mac: works with Comet and supported installed apps (installed-app control not yet on Windows)
- Mac Hybrid compute: cloud plus a local model, sensitive steps and private files stay on the Mac (Apple silicon, 24 GB or more memory)
- Portable Computer: model and agent run locally on NVIDIA RTX or DGX Spark hardware (24 GB VRAM) and AMD Ryzen AI Max, with no credits for local inference
- Desktop tabs and windows for comparing Computer tasks (Mac)
- Account switcher without signing out (Mac)
- Browser extension lets Computer drive a desktop browser (Chrome, Edge, Brave); Comet is the default if installed
- Admin must allow desktop tools for managed accounts

Plans and limits: Hybrid compute and Portable Computer: Pro, Max, Enterprise. Other desktop features: plan not stated on help pages. Local-file permission on Windows needs app 26.8.1 or later.

Notes: Personal Computer for Windows shipped 2026-08-04. Old app must be replaced manually by the new app.

Sources: <https://www.perplexity.ai/help-center/en/articles/19800001-about-the-app.md>, <https://www.perplexity.ai/help-center/en/articles/19800002-get-started.md>, <https://www.perplexity.ai/help-center/en/articles/19800009-use-remote-access.md>, <https://perplexity.ai/changelog/shared-workspaces-personal-computer-for-windows-and-model-council>, <https://perplexity.ai/changelog>, <https://perplexity.ai/changelog>

#### Perplexity: Comet

Availability: Yes. Evidence: Vendor page.
Platforms: macOS and Windows (Chromium-based; Linux only mentioned for default-browser setup).

- Perplexity as the default search engine
- Comet Assistant sidebar (Alt+A) that reads the page, compares tabs and answers questions
- Ask and Summarize buttons for pages, videos and PDFs
- Agentic actions: fill forms, navigate, draft email, shop, with approval prompts
- Natural-language browser commands to manage tabs
- Personal Search over browsing history using Comet Intelligence
- Gmail connector for email and calendar questions
- Voice mode for hands-free browsing
- Comet memory and inline assistant
- Query shortcuts for repeated prompts
- Split view, profiles, built-in AdBlock, page translation, bookmark and settings import
- Sync of browsing data across Comet browsers
- Supports most Chrome Web Store extensions
- Enterprise: install guides, policies and controls, telemetry, assistant permission management

Plans and limits: Not stated on help pages. Quick-start guide is dated and says macOS M1/M2 only; do not rely on that.

Notes: Comet launched July 9 2025 for Windows and macOS. Privacy: press reports say browsing history may feed ad profiles; not confirmed on a fetched official page.

Sources: <https://www.perplexity.ai/help-center/en/articles/11172798-getting-started-with-comet.md>, <https://www.perplexity.ai/help-center/en/collections/18799298-comet>, <https://www.perplexity.ai/help-center/comet/en/collections/18800267-ai-assistant-use-cases>, <https://www.perplexity.ai/help-center/comet/en/collections/18800266-browser-features>, <https://www.perplexity.ai/comet>

#### xAI: no standalone Grok chat desktop app confirmed

Availability: Unconfirmed. Evidence: Unconfirmed.

Notes: xAI docs describe a Grok Bot desktop app for macOS, Windows and Linux (see Grok Bot entry). No official desktop app for the Grok chat assistant was found; third-party wrappers exist.

Sources: <https://docs.x.ai/grok-bot/overview>

#### xAI: Grok Bot desktop app

Availability: Yes. Evidence: Vendor page.
Platforms: macOS, Windows, Linux.

- Named Bots with a job and context that builds over time
- Each Bot works on a cloud computer with browser, filesystem and terminal; keeps working when the laptop is closed
- Multiple Bots in parallel that message each other, share group chats and hand off tasks
- Teach a workflow once, save as a skill, run on a schedule (routines)
- Connectors where available, computer use as fallback
- Approvals: drafts left for review before sending
- Type, dictate or voice chat with a Bot
- All Bots share one computer, files, browser sessions and logins
- Enterprise: admin controls, identity management, private network options, managed-device deployment, logging

Plans and limits: Weekly usage reset; plan access as above.

Notes: Launched 2026-08 as early beta per press; enterprise rollout reported 2026-09-03 by a secondary source.

Sources: <https://docs.x.ai/grok-bot/overview>, <https://docs.x.ai/developers/release-notes>

#### Meta: no Meta AI desktop app found

Availability: Unconfirmed. Evidence: Unconfirmed.

Notes: Desktop agent work is in the separate Muse for Mac beta (see Muse entry).

Sources: <https://ai.meta.com/meta-ai/assistant/>

#### Meta: Muse for Mac (beta)

Availability: Preview. Evidence: Vendor page.
Platforms: macOS 15 or later on Apple silicon per press; direct download from ai.meta.com/muse/download, not the Mac App Store.

- Works with files and native Mac apps (Messages, Calendar, Notes, Mail) per press
- Per-app access of Off, Read only, or Read and interact per Help Center summary in press
- Keeps working in the background when the window is closed
- Asks approval before sensitive actions; deleted files go to Trash

Plans and limits: Download page title says free; paid plans as above.

Notes: Official evidence: download page title 'Free AI Agent for Mac & Mobile' and a Help Center article 'How Muse works with files and apps in your Mac'. Feature detail comes from press. Windows not mentioned. A separate report described a runtime filesystem exposure; relation to user data unclear.

Sources: <https://ai.meta.com/muse/download/>, <https://www.meta.com/help/artificial-intelligence/1303670544995562/>, <https://betanews.com/article/meta-launches-a-muse-app-for-macos/>

#### Manus: Manus Desktop (Manus Studio) with My Computer

Availability: Yes. Evidence: Vendor page.
Platforms: macOS and Windows.

- My Computer: run terminal commands, read and edit local files, launch and control local apps after per-command approval (Allow Once or Always Allow)
- Authorize each local folder
- Use local dev tools (Python, Node.js, Swift, Xcode) and local GPU
- Assign tasks remotely to an always-on desktop from other devices
- Manus Studio: shared workspace for documents, spreadsheets, PDFs, slides, websites, code, games and video
- Remote Control and Computer Use in a visible workspace limited to files, browser and apps you approve
- Works with Projects, Agents and Scheduled Tasks for recurring local routines

Plans and limits: Plan gating for My Computer not stated.

Notes: My Computer launched 2026-03-16. Cue is a separate early-access app for personal agents with their own email, phone number and wallet.

Sources: <https://manus.im/blog/manus-my-computer-desktop>, <https://manus.im/blog/introducing-manus-2-0>

#### Cursor: Cursor desktop app (AI editor, based on the VS Code codebase)

Availability: Yes. Evidence: Vendor page.
Platforms: macOS (Apple Silicon, Intel, Universal), Windows (x64, ARM64), Linux (deb, rpm, AppImage; x64, ARM64).

- agent that edits files, runs shell commands, searches the codebase and web
- Tab: multi-line autocomplete, jump-to-next-edit and cross-file edit prediction
- Cmd+K targeted edits plus full agent mode
- Plan mode, custom modes, /goal long-running objectives, side chats, queue and steer messages while the agent works
- Agents Window with conversation search
- built-in browser the agent drives (screenshots, console, network, clicking)
- image generation and image input
- checkpoints to restore earlier file states (stored locally, separate from git)
- Projects (beta): coordinator agent delegates large work to other agents
- choose Local or Cloud for each agent
- rules, skills, plugins and MCP servers, plugin marketplace
- one-click import of VS Code extensions, themes and keybindings
- enterprise browser origin allowlists, MCP allow/deny lists
- privacy mode
- remote control from iOS app for local agents (on by default except Enterprise)

Plans and limits: Free has limited agent and Tab requests; Plus has Cursor models only (no Auto, no third-party). Paid plans share one weekly-refreshing usage pool across Agent, CLI, Cloud Agents and Grok apps; extra usage billed per token.

Notes: Not an extension: a standalone VS Code-based app. Public docs say 'Cursor is based upon the VS Code codebase'.

Sources: <https://cursor.com/download>, <https://cursor.com/docs/agent/overview>, <https://cursor.com/docs/agent/tools/browser>, <https://cursor.com/docs/tab/overview>, <https://cursor.com/docs/configuration/migrations/vscode>, <https://cursor.com/docs/account/pricing>

#### Amazon Web Services: Kiro IDE (Code OSS based) and Kiro Crew desktop app

Availability: Yes. Evidence: Vendor page.
Platforms: IDE: macOS (Apple Silicon, Intel), Windows x64, Linux x64. Crew: macOS, Windows, Linux.

- spec-driven development: requirements.md (or bugfix.md), design.md, tasks.md with approval gates
- Requirements-First, Design-First, Bugfix and Quick Spec variants
- parallel task execution from a dependency graph
- Analyze Requirements for gaps and contradictions; property-based tests (IDE only)
- agent hooks on file save, tool use, stop (shell command or agent prompt)
- steering files (workspace and global), AGENTS.md, skills, custom agents, sub-agents
- Powers: installable bundles of MCP tools, skills and keywords
- Autopilot vs supervised, checkpoints, # context providers, multiple sessions, export as Markdown
- Memory carried across chat sessions (IDE 1.4.0; defaults off from 1.4.10)
- model picker with Auto; Claude, GPT and open-weight models
- Open VSX extensions, VS Code settings, themes and keybindings import
- Kiro Crew: free open-source personal agent with autonomous tasks, scheduling, memory, subagents, and channels in Slack, Discord, Telegram, Teams, Webex, WeCom and WeChat

Plans and limits: Credit-based by plan; Free has 50 credits. Older IDE/CLI versions lose access to Kiro services on dates in Nov 2026 and Jan 2027.

Notes: Crew is a separate product: runs locally or remote host, local web dashboard on port 5476; pricing and licence not stated on its docs page.

Sources: <https://kiro.dev/downloads/>, <https://kiro.dev/docs/specs/>, <https://kiro.dev/docs/ide/chat/>, <https://kiro.dev/docs/hooks/>, <https://kiro.dev/docs/steering/>, <https://kiro.dev/docs/powers/>, <https://kiro.dev/docs/crew/>, <https://kiro.dev/changelog/>

#### Cognition: Devin Desktop (the new name for Windsurf)

Availability: Yes. Evidence: Vendor page.
Platforms: macOS, Windows 10+, Linux (tarball, deb, rpm).

- Agent Command Center: manage many agents in Spaces, Kanban or list view
- Devin Local: default local agent, shares harness with Devin CLI
- ACP to run third-party agents alongside frontier models
- Fusion: lead model plus cheaper sidekick model
- Fast Context code retrieval
- Tab / Supercomplete next-edit prediction
- Devin Review of diffs in editor
- run sessions locally or in Devin Cloud
- MCP, memories, rules, workflows
- one-click app deploys
- SSH, dev containers, remote projects
- import VS Code or Cursor settings
- integrations: Slack, Teams, Linear, Notion, Jira, Sentry, Stripe
- prerelease channel 'Devin Desktop Next'

Plans and limits: Free tier has unlimited Tab and inline edits but light agent quota; quotas refresh daily and weekly; Pro adds Devin Cloud.

Notes: Rebrand: 'only the name and branding are changing'; plan, pricing, extensions and settings carry over (devin.ai/desktop). Login with a Devin account or API key required. A secondary source dates the rename June 2, 2026 and Cascade retirement July 1, 2026; not confirmed on a primary page.

Sources: <https://devin.ai/desktop>, <https://docs.devin.ai/desktop/getting-started>, <https://devin.ai/pricing>

#### Cognition: Devin Desktop (formerly Windsurf)

Availability: Yes. Evidence: Vendor page.
Platforms: macOS, Windows, Linux.

- see Windsurf / Devin Desktop entry; open any Devin Cloud session in Desktop via /open desktop
- `devin ssh` into a Devin VM and edit with Devin Desktop

Plans and limits: Each Teams full seat includes Devin Desktop.

Notes: Detailed in the Devin Desktop entry.

Sources: <https://devin.ai/desktop>, <https://devin.ai/blog/devin-cloud-in-your-terminal>, <https://devin.ai/pricing>

### Mobile

**AGI: AGI Mobile** (Coming soon). AGI on iPhone and Android: a private on-device assistant that works offline with no account, plus the full AGI account with research, agents and schedules when signed in. Runs on: iPhone and iPad; Android phones and tablets. 55 catalogued features across: Getting started (6), Chat (10), Models (4), Camera, files and voice (8), Artifacts, projects and images (2), Coding from the phone (2), Memory and personalization (3), Settings (13), Phone integration (6), Your AGI account on the phone (1).

#### OpenAI: ChatGPT for iOS and Android

Availability: Yes. Evidence: Vendor page.
Platforms: iOS 18+ / iPadOS 18+ / visionOS 2+; Android (store page could not be fetched).

- Chat with synced history across devices
- Live voice conversations with many voices (new voices and a mini live model added Oct 2026)
- Image generation and editing
- Photo upload to read handwriting or identify landmarks
- Create and customize your dot, connect plugins, and talk to it from the app
- Follow and continue Work tasks started on desktop (cross-device sync)
- Remote tab: start, steer and approve Codex tasks running on your Mac/PC or in cloud
- iOS widget for your dot and Apple Shortcuts actions (Action button)
- Scheduled tasks and Finances (US) on iOS and Android
- Locked chats (iOS, Android)
- Plugins available to the account
- In-app purchase of Go, Plus, Pro tiers and credits
- Website sign-in in Work on mobile for Plus and Pro
- Account switching not yet in native mobile apps (as of Sept doc)

Plans and limits: Same plan gating as web; dots limited to Pro tiers and Business Premium/Enterprise rollouts; Remote depends on rollout and workspace settings.

Notes: App Store: 4.8 stars, about 12M ratings, version 1.2026.286. Google Play listing could not be fetched, so Android specifics are from release notes and docs, not the listing.

Sources: <https://apps.apple.com/us/app/chatgpt/id6448311069>, <https://learn.chatgpt.com/docs/mobile>, <https://learn.chatgpt.com/docs/remote-connections>, <https://learn.chatgpt.com/docs/whats-new>, <https://learn.chatgpt.com/docs/dots>, <https://help.openai.com/en/articles/6825453-chatgpt-release-notes>

#### OpenAI: Codex in the ChatGPT mobile app (Remote)

Availability: Yes. Evidence: Vendor page.
Platforms: iOS documented; Android not mentioned on the Codex mobile page.

- Start tasks in Cloud or on a connected Mac/Windows PC with a chosen project
- Follow progress and send new instructions mid-task
- See tasks across cloud and connected computers, resume conversations, see when input is needed
- Approve or deny commands before Codex continues on your computer
- Review responses, changed files, diffs and test results

Plans and limits: Depends on rollout and workspace settings; host computer must stay awake and online; workspace admins may need to enable Remote Control.

Notes: Android support for Codex Remote is unconfirmed on the Codex page, though the remote-connections doc says phones run iOS or Android.

Sources: <https://learn.chatgpt.com/docs/mobile>, <https://learn.chatgpt.com/docs/remote-connections>

#### Microsoft: Microsoft Copilot app for iOS and Android

Availability: Yes. Evidence: Indirect evidence.
Platforms: iOS, Android (availability varies by country).

- Chat with voice input
- Cowork tasks with file attach and approval of actions from the phone (work/school documented; personal preview)
- Vision: analyze content from the phone camera
- CarPlay support (iOS, Sept 2026)
- Record: capture in-person conversations with transcripts and summaries (secondary report)
- Tasks sync with browser and desktop app

Plans and limits: Voice, vision and image usage scale by plan; Code is not on mobile at this release.

Notes: App store listings for the consumer Copilot app could not be fetched (404), so consumer-specific mobile features such as memory and Groups are not confirmed from an official page this session.

Sources: <https://copilot.com/>, <https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/cowork-mobile>, <https://learn.microsoft.com/en-us/copilot/microsoft-365/release-notes>, <https://learn.microsoft.com/en-us/copilot/code/code-requirements>

#### Microsoft: Microsoft Copilot mobile app (iOS, Android)

Availability: Yes. Evidence: Vendor page.
Platforms: iPhone, iPad, Android phones and tablets.

- Cowork: start tasks, attach files, voice input, approve actions
- Vision with phone camera
- Find meetings by topic and keyword
- Outlook triage actions in Copilot
- Copilot editing in Word, PowerPoint, Excel on Android
- Record in-person conversations with transcript and summary (secondary report)
- CarPlay support on iOS
- Tasks sync with browser and desktop

Plans and limits: Needs a licensed work or school account; Cowork browser use not on mobile; Copilot Code has no mobile app at this release.

Notes: Availability varies by country or region and admin settings.

Sources: <https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/cowork-mobile>, <https://learn.microsoft.com/en-us/copilot/microsoft-365/release-notes>, <https://www.microsoft.com/en-us/microsoft-365-copilot/download-copilot-app>

#### GitHub: GitHub Mobile (Copilot Chat and cloud agent)

Availability: Yes. Evidence: Vendor page.
Platforms: iOS 17+, Android.

- Copilot Chat: ask software questions, about a repo, a file or pasted lines
- Copilot Extensions invoked with @
- Start cloud agent sessions: choose repo, base branch, custom agent, model, reasoning level
- Assign issues to Copilot
- Track and filter agent-generated PRs under Agent Tasks
- Copilot can resolve merge conflicts and address review feedback on a PR
- Coding tasks show model used and AI credits used
- In-app purchase of Copilot Pro, Pro+ and Max on iOS
- Notifications, review and merge PRs, issues, code browsing

Plans and limits: If you buy Pro, Pro+ or Max through a mobile in-app purchase you cannot enable extra AI credits on mobile; must cancel and resubscribe on GitHub.com.

Notes: App Store: 4.8 stars from 39K ratings, version 1.282.0.

Sources: <https://docs.github.com/en/copilot/how-tos/copilot-on-github/chat-with-copilot/chat-in-mobile>, <https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-mobile>, <https://apps.apple.com/us/app/github/id1477376905>

#### Anthropic: Claude app (iOS and Android)

Availability: Yes. Evidence: Vendor page.
Platforms: iPhone (iOS 18.0+), iPad (iPadOS 18.0+, same app), Android (Google Play).

- Chat, Cowork and Projects on mobile (Sept 16 rollout names web, desktop and mobile)
- Voice conversation and voice dictation in multiple languages
- Photo, PDF and screenshot analysis, chart reading
- Web search with citations; connects to Google Drive, Gmail and Calendar
- Chat search and memory
- Start and monitor tasks from the phone; long tasks run in the cloud
- Code tab: cloud Claude Code sessions, Remote Control of a local session, Dispatch to desktop
- Push notifications when long-running tasks finish (Remote Control)
- Claude Duet is a separate iOS/Android app (research preview, waitlist)

Plans and limits: Free chat; Code tab, Dispatch need paid plans (Dispatch Pro and Max only). Claude in Chrome is not available on mobile.

Notes: App Store lists the app as free with in-app purchases (Claude Pro $20/month). Android listing page could not be parsed by the fetcher; Android availability confirmed through Claude Code docs.

Sources: <https://apps.apple.com/us/app/claude-by-anthropic/id6473753684>, <https://code.claude.com/docs/en/mobile>, <https://claude.com/product/overview>, <https://support.claude.com/en/articles/12138966-release-notes>, <https://claude.com/blog/claude-duet>

#### Anthropic: Code tab in the Claude app (iOS and Android)

Availability: Yes. Evidence: Vendor page.
Platforms: iOS, iPadOS, Android.

- Start and monitor cloud sessions from a repository and branch
- Projects: see which threads finished or need you
- Remote Control: drive a Claude Code session running on your own computer, with attachments and photos reaching the local session
- Dispatch: message a task to the desktop app (Pro and Max)
- Push notifications for finished tasks or decisions
- Ask Claude to watch a PR and fix CI failures

Plans and limits: Needs claude.ai account; no Console API key or third-party provider. Dispatch Pro and Max only. No Bypass permissions mode from the app.

Notes: Anthropic states Claude Code has no separate mobile app; it is a thin client in the Claude app. /mobile in a session shows a QR code.

Sources: <https://code.claude.com/docs/en/mobile>, <https://code.claude.com/docs/en/platforms>

#### Google: Google Gemini app (Android and iOS)

Availability: Yes. Evidence: Vendor page.
Platforms: iPhone and iPad (iOS/iPadOS 18.2+), Android.

- Gemini Live voice with camera and screen share, integrated into chat on Android and iOS
- Gemini Spark 24/7 agent and Daily Brief
- Gmail, Calendar, Photos, YouTube and Search connections
- Upload documents, spreadsheets, photos and videos
- Image generation and editing, video creation (paid plans), custom soundtracks
- NotebookLM integration, study quizzes, study notebooks (mobile since Aug 19), prototype building
- Interactive visuals and timelines in answers
- Canvas projects viewable on mobile; text-style editing is desktop-only
- Google AI plan purchase in app (Plus $4.99, Pro $19.99, Ultra $199.99 on the iOS listing)

Plans and limits: Same plan limits as web.

Notes: iOS app cannot set alarms or send SMS. Android Play Store listing could not be parsed; Android availability is confirmed through the release notes (Gemini Live rollout) and Chrome coverage.

Sources: <https://apps.apple.com/us/app/google-gemini/id6477489729>, <https://gemini.google/release-notes/>, <https://gemini.google/overview/gemini-live/>

#### Google: Remote Control (mobile status unclear)

Availability: Unconfirmed. Evidence: Unconfirmed.
Platforms: unknown.

- Remote Control launch post 'Antigravity anywhere with Remote Control' (Aug 21)

Plans and limits: unknown

Notes: The blog index does not say whether Remote Control reaches a phone, and no standalone mobile app was found. The Gemini app can launch Antigravity on Mac only.

Sources: <https://antigravity.google/blog>

#### Google: unknown

Availability: Unconfirmed. Evidence: Unconfirmed.
Platforms: unknown.

Plans and limits: unknown

Notes: No mobile app or mobile-specific page was found; web app responsiveness not verified.

Sources: <https://jules.google/docs>

#### Perplexity: Perplexity: AI Agent & Search (iOS and Android)

Availability: Yes. Evidence: Vendor page.
Platforms: iOS 18 or later, iPadOS 18 or later; Android (Google Play listing could not be fetched).

- Guided AI search and deep research with cited sources
- Follow-up questions in a thread
- Assistant that drafts emails, schedules and makes reservations
- Perplexity Labs for building reports and projects
- Voice input and spoken answers; voice assistant on iOS
- Android: set as the default digital assistant; Draw to Search to circle part of the screen and ask
- Discover feed and Your Library
- Computer task can be started or directed from iPhone, including Hybrid compute tasks on a Mac
- Effort Mode on iOS 26.38.0+ and Android 2.100.0+
- Computer credit packs and Pro/Max purchasable in-app
- Comet browser available separately on Android and iOS

Plans and limits: Effort Mode needs Pro, Max, Enterprise Pro or Enterprise Max. Free is limited.

Notes: iOS version 26.42.0 was current on the listing at fetch time. Opus-class model fast mode mobile support was listed as coming soon in July.

Sources: <https://apps.apple.com/us/app/perplexity-ask-anything/id1668000334>, <https://www.perplexity.ai/help-center/en/collections/18799299-mobile-apps>, <https://www.perplexity.ai/help-center/en/articles/11080309-android-app-draw-to-search.md>, <https://perplexity.ai/changelog>

#### Perplexity: Comet for Android and iOS

Availability: Yes. Evidence: Vendor page.
Platforms: Android 12 or later (Google Play); iOS (App Store, launched 2026-03-18 per press).

- Task automation on the web such as adding items to a cart, with visible indication when the AI is in control
- Voice search and voice tab management
- Price comparison and promo code finder at checkout
- Page and YouTube summaries with timestamp links
- Sync with desktop Comet
- iOS: voice mode for current page or several tabs, AI answers blended with search, ad blocking (press report)

Plans and limits: Not stated. Android automated tasks run only while the app is open.

Notes: Conflict: the 'Comet Mobile App' help article still says no public mobile app, while the Comet product page and the Android help article say Android and iOS exist. The Android article and product page are newer. iOS details come from press coverage, not an official page.

Sources: <https://www.perplexity.ai/comet>, <https://www.perplexity.ai/help-center/comet/en/articles/12875447-comet-for-android-quick-start-and-key-features.md>, <https://www.perplexity.ai/help-center/comet/en/articles/11734737-comet-mobile-app.md>, <https://en.wikipedia.org/wiki/Comet_(browser)>, <https://engadget.com/apps/perplexitys-comet-ai-browser-is-now-available-for-iphones-183947569.html>

#### xAI: Grok - AI Chat & Video (iOS/iPadOS); Android app also exists

Availability: Yes. Evidence: Vendor page.
Platforms: iOS 17 or later, iPadOS 17, visionOS 1.0; Android (Play listing could not be fetched).

- Chat, deep research, math, science and coding help
- Grok Imagine: image and video generation including short videos with sound, photo animation, voice-driven image creation, image editing
- Voice mode with real-time spoken conversations and selectable styles
- Live camera in voice mode and companion characters (per store coverage)
- Real-time access to X and web, advanced X search
- Analyze documents, photos and links
- Import context from other AI tools
- In-app purchases for SuperGrok tiers and extra usage credits

Plans and limits: Paid tiers raise limits; exact limits not published on fetched pages.

Notes: iOS version 1.4.58 current at fetch time. Listing author line mentions SpaceXAI. Android status is inferred from the unified X Subscription wording ('Grok apps') and press coverage of Imagine on iOS and Android.

Sources: <https://apps.apple.com/us/app/grok/id6670324846>, <https://x.ai/news/x-subscription>

#### xAI: Grok Bot mobile app

Availability: Yes. Evidence: Vendor page.
Platforms: iPhone, iPad, Android.

- Message, dictate or voice chat with Bots
- Same Bots and shared cloud computer as desktop

Plans and limits: Same as desktop.

Notes: Docs state the mobile app runs on iPhone, iPad and Android; store listing not fetched.

Sources: <https://docs.x.ai/grok-bot/overview>

#### Meta: Meta AI (iOS and Android) and the in-app experiences in WhatsApp, Instagram, Messenger

Availability: Yes. Evidence: Vendor page.
Platforms: iPhone and iPad (iOS/iPadOS 18.4 or later); Android; WhatsApp, Instagram, Messenger.

- Daily briefings, reminders, scheduled tasks, email and calendar connection
- Shopping lists and workout plans
- Image creation and editing with sketch edits and style presets
- Product discovery from photos and local recommendations
- In-depth research reports; presentations, quizzes, games, lookbooks
- Links to Instagram professional accounts, Meta Ads Manager and Google Workspace
- Analysis of photos, videos, PDFs and spreadsheets
- Thinking mode and Shopping mode
- Incognito Chat
- Voice chat in 13 languages and live AI that answers about what the camera sees
- Companion app for Meta AI glasses
- WhatsApp: chat in groups, create images, summarize unread messages, identify things from photos; private processing and incognito chats
- Instagram and Messenger: chat with Meta AI and custom AIs

Plans and limits: Free; some features limited to certain countries and languages and roll out gradually.

Notes: iOS version 296.0.0 current at fetch time. Meta AI also powers a support assistant on Facebook and Instagram. In-app purchases exist but are not itemized on the listing.

Sources: <https://apps.apple.com/us/app/meta-ai/id1558240027>, <https://www.whatsapp.com/meta-ai>, <https://www.meta.com/help/artificial-intelligence/943942350800511/>

#### Meta: Muse app

Availability: Yes. Evidence: Vendor page.
Platforms: iOS and Android (US from 2026-09-08; Japan from 2026-10-23); also messageable in WhatsApp.

- Same agent, library, reminders and connectors as web
- Subscribe in app or at muse.ai
- Advanced voice mode and Muse Realtime Avatar announced at Connect; Japan availability to be communicated separately
- Coming soon to AI glasses; Muse Charm pocket device announced

Plans and limits: Same token plans.

Notes: Muse Wonder models will soon power Muse, rolling out first to subscribers.

Sources: <https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/>, <https://about.fb.com/news/2026/10/introducing-muse-wonder-models/>, <https://about.fb.com/ja/news/2026/10/muse-personal-ai-agent-launches-in-japan/amp/>

#### Manus: Manus - AI Agent & Automation (iOS and Android)

Availability: Yes. Evidence: Vendor page.
Platforms: iPhone iOS 17+, iPad, Mac with Apple silicon, Vision; Android listing not fetched.

- Spreadsheet and data analysis, financial models and dashboards from Excel or CSV
- Slide decks from one prompt
- Design view, image and video generation
- Deep web research with parallel sub-agents
- Free chat with upgrade to Agent Mode
- Edit, stop or redirect tasks from a to-do breakdown
- Plan Mode on mobile
- Remote control of a computer or cloud computer from the phone
- Studio collaboration; buy a phone number or cloud computer
- OPPO partnership: Manus capabilities inside OPPO AI Mind Pilot Agent Mode on upcoming OPPO Find X10 with ColorOS 17

Plans and limits: As web.

Notes: iOS version 26.19.2 at fetch time. Legacy Basic $19 and Plus $39 still appear as in-app items.

Sources: <https://apps.apple.com/py/app/manus-ai/id6740909540?l=en-GB>, <https://manus.im/blog/manus-partners-oppo>, <https://manus.im/blog/manus-plan-mode>

#### Cursor: Cursor for iOS (native); Cursor Web PWA on Android

Availability: Yes. Evidence: Vendor page.
Platforms: iOS native app; Android only via cursor.com/agents PWA.

- view and manage agents wherever they run
- launch parallel always-on cloud agents
- remote control: see and respond to agents running on your computer
- Live Activities for agent status and attention alerts
- voice input
- markup tool to annotate images and pin comments
- review and merge PRs with diffs and source-control tools
- videos, screenshots and logs from agent runs

Plans and limits: Cloud agents from mobile need Premium or higher. The mobile page lists no plan requirement itself.

Notes: Android has no native app per the mobile page (iOS only); PWA path documented on the cloud agent page.

Sources: <https://cursor.com/mobile>, <https://cursor.com/docs/cloud-agent>, <https://cursor.com/changelog>

#### Amazon Web Services: Kiro Mobile (Preview)

Availability: Preview. Evidence: Vendor page.
Platforms: iOS via TestFlight early access; no Android mentioned.

- monitor and direct cloud sessions started in Web, IDE or CLI
- review PRs and chat with the agent
- sessions and preferences sync with Kiro Web
- workspace steering and AGENTS.md supported; hooks and Powers not supported

Plans and limits: Paid accounts only; early access request required.

Notes: Detailed mobile docs not yet published.

Sources: <https://kiro.dev/docs/mobile/>, <https://kiro.dev/docs/>, <https://kiro.dev/downloads/>

#### Amazon Web Services: Amazon Q panel in AWS Console Mobile Application

Availability: Yes. Evidence: Vendor page.
Platforms: iOS and Android (AWS Console app).

- chat with Amazon Q about AWS resources inside the AWS Console mobile app

Plans and limits: Not stated.

Notes: Not a standalone Q app.

Sources: <https://aws.amazon.com/q/developer/>, <https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/what-is.html>

#### Cognition: Devin Mobile (see Devin entry)

Availability: Waitlist. Evidence: Vendor page.
Platforms: Appears to be iPhone.

Plans and limits: n/a

Notes: No Windsurf-specific mobile app. Devin Mobile is on waitlist.

Sources: <https://devin.ai/mobile>

#### Cognition: Devin Mobile

Availability: Waitlist. Evidence: Vendor page.
Platforms: Appears to be iPhone; no Android mentioned; not confirmed on a store listing.

- start Devin sessions from phone; Devin runs in the cloud
- notifications when a session needs input
- review and merge pull requests
- Devin Voice live conversations

Plans and limits: Not stated.

Notes: Waitlist for early access; not generally available. Docs mention Desktop tab works on touch devices (Sept 9 release note).

Sources: <https://devin.ai/mobile>, <https://docs.devin.ai/release-notes/overview>

### CLI

**AGI: AGI CLI** (Coming soon). A coding assistant for developers that works in the terminal: it reads, edits and runs code with approvals, using AGI's cloud, local models or your own AI provider account. Runs on: Mac; Linux; Windows (without the extra safety layer); Also built into AGI Desktop. 49 catalogued features across: Getting started (5), Models (5), Permissions and safety (5), Where your data goes (2), Sessions (5), Memory and personalization (3), Agents and teams of agents (4), Skills, add-ons and automation (7), Built-in tools (6), Code review (2), Your AGI account and other apps (5).

#### OpenAI: None under the ChatGPT name

Availability: No. Evidence: Indirect evidence.
Platforms: n/a.

- Terminal use is through Codex CLI (separate entry)

Plans and limits: n/a

Notes: OpenAI's terminal agent is Codex CLI, which signs in with a ChatGPT account.

Sources: <https://learn.chatgpt.com/docs/cli>

#### OpenAI: Codex CLI

Availability: Yes. Evidence: Vendor page.
Platforms: macOS, Linux, Windows (native and WSL).

- Install by curl script, npm, Homebrew or Windows installer
- Sign in with ChatGPT or an API key
- Interactive session: explore, plan, edit, run tools, steer an active turn
- Slash commands: /init, /status, /permissions, /model, /review, /plugins, /presets (ten saved prompts), /config search, /keymap
- Resume, fork, archive and search saved sessions
- codex exec for scripts and CI; codex review for non-interactive review
- Image input via --image or paste; live web search via --search
- Cloud handoff via codex cloud
- MCP servers via codex mcp; plugins; skills; hooks
- Subagents; worktrees
- Approval policy and sandbox mode as separate settings
- Enterprise MCP auth with account grants; credential masking in remote shells
- Amazon Bedrock setup wizard on by default
- Image previews in fullscreen transcript on Kitty/Sixel terminals
- Open source on GitHub

Plans and limits: Included with ChatGPT plans (Free and Go lighter); also usable with an API key at API rates.

Notes: Latest release 0.164.0 published 2026-10-23; releases roughly weekly.

Sources: <https://learn.chatgpt.com/docs/cli>, <https://github.com/openai/codex/releases>, <https://learn.chatgpt.com/docs/changelog>, <https://learn.chatgpt.com/docs/pricing>

#### Microsoft: None found

Availability: No. Evidence: Indirect evidence.
Platforms: n/a.

- Terminal coding is under GitHub Copilot CLI (separate entry)

Plans and limits: n/a

Notes: No Microsoft Copilot consumer CLI appears in official pages fetched.

Sources: <https://copilot.com/>

#### Microsoft: None found

Availability: No. Evidence: Indirect evidence.
Platforms: n/a.

- Developer terminal agent is GitHub Copilot CLI (separate entry)

Plans and limits: n/a

Notes: Copilot Code is a tab in the app, not a CLI.

Sources: <https://learn.microsoft.com/en-us/copilot/code>

#### GitHub: GitHub Copilot CLI

Availability: Yes. Evidence: Vendor page.
Platforms: macOS, Linux, Windows (PowerShell or WSL).

- Install by npm (Node 22+), WinGet, Homebrew cask, install script or direct download
- Login with /login or fine-grained token with Copilot Requests permission
- Interactive mode with Plan mode toggle (Shift+Tab) and programmatic mode (-p)
- Edit code, run Git, manage PRs, issues and Actions from the terminal
- Computer use for desktop apps on macOS and Windows
- Local sandboxing (GA Oct 7) and cloud sandboxes (copilot --cloud, public preview)
- Queue follow-up messages and give inline feedback on rejected tools
- Auto-compaction, /compact, /context
- Custom instructions, MCP, custom agents, hooks, skills, Copilot Memory
- Switch models; bring your own provider (OpenAI-compatible, Azure OpenAI, Anthropic, Ollama); discover local models
- Agent Client Protocol support
- Dynamic workflows and /fleet subagents
- Tool allow/deny, trusted directories, content exclusion

Plans and limits: Included on Free and above; usage consumes AI credits; org admins can disable the CLI.

Notes: Latest stable v1.0.103 on 2026-10-22; pre-releases daily.

Sources: <https://docs.github.com/en/copilot/concepts/copilot-surfaces/copilot-cli>, <https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli>, <https://github.com/github/copilot-cli/releases>, <https://github.blog/changelog/2026-10-07-local-sandboxing-for-github-copilot-now-generally-available/>

#### Anthropic: Claude Code CLI

Availability: Yes. Evidence: Vendor page.
Platforms: macOS, Linux, WSL, native Windows (PowerShell or CMD); install via script, Homebrew, WinGet, apt/dnf/apk. Latest changelog entry checked: 2.1.310 on Oct 23 2026.

- Agentic editing across files, running commands, git commits and PRs
- Plan mode, Auto mode (classifier-reviewed actions), Accept edits, Manual and Bypass permission modes
- CLAUDE.md memory, AGENTS.md fallback, and auto memory across sessions
- Skills, plugins, hooks, slash commands and output styles
- MCP servers and claude.ai connectors
- Subagents, background agents with agent view, agent teams (off by default), dynamic workflows
- Non-interactive mode (claude -p) with JSON output for scripts and CI; Agent SDK
- GitHub Actions, GitLab CI/CD and automatic Code Review on PRs (Team/Enterprise)
- Cloud scheduled tasks (/schedule), session-local /loop, desktop scheduled tasks
- Remote Control, Channels (Telegram, Discord, iMessage, webhooks), claude --cloud and --teleport
- Chrome integration with --chrome (needs claude.ai login)
- Computer use on macOS (Pro and Max), voice dictation (/voice, needs claude.ai)
- Sandboxing, checkpoints and rewind, fast mode
- Third-party providers: Bedrock, Google Cloud Agent Platform, Foundry, LLM gateways
- OpenTelemetry monitoring and managed settings for orgs

Plans and limits: Pro, Max, Team, Enterprise, or Console API key / third-party provider (pay as you go). Some features require a claude.ai subscription (cloud sessions, Chrome, Remote Control, voice).

Notes: Docs describe the CLI as the most complete surface; scripting and the Agent SDK are CLI-only.

Sources: <https://code.claude.com/docs/en/overview>, <https://code.claude.com/docs/en/platforms>, <https://code.claude.com/docs/en/feature-availability>, <https://code.claude.com/docs/en/changelog>

#### Google: Antigravity CLI (agy), replaces Gemini CLI for consumer plans

Availability: Yes. Evidence: Vendor page.
Platforms: macOS, Linux, Windows (install script, PowerShell, CMD); docs list v1.2+.

- Terminal UI built in Go on the same agent harness as Antigravity 2.0
- Autonomous coding with shell command execution and permission prompts
- Background subagents and multiple agents at once
- Slash commands: /goal, /grill-me, /schedule, /browser, /plugin, /logout
- Skills, hooks, subagents and plugins (formerly extensions) carry over from Gemini CLI
- Artifact review (Ctrl+R)
- Settings and permissions sync with the 2.0 app; sessions can be exported to it
- Auth: personal Google account, business Gemini Enterprise (preview), Gemini API key, agent platform (preview)
- MCP connections and SDK-level tool policies (allow, deny, ask_user)

Plans and limits: Free tier with weekly limits; Pro and Ultra raise limits. No 1:1 feature parity with Gemini CLI at launch per Google.

Notes: Announced May 19 2026; Gemini CLI and Code Assist extensions stopped serving Google AI Pro, Ultra and free individual users on June 18 2026. The Antigravity CLI is described by press as closed-source, and the repo page states no license; the Gemini CLI remains Apache 2.0.

Sources: <https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/>, <https://github.com/google-antigravity/antigravity-cli>, <https://antigravity.google/docs/getting-started>, <https://thenewstack.io/google-antigravity-cli/>

#### Google: Gemini CLI

Availability: Yes. Evidence: Vendor page.
Platforms: Node-based; npx, npm, Homebrew, MacPorts, Anaconda. Apache 2.0 licensed. Latest stable release on GitHub: v0.65.0 (Oct 20 2026); nightly builds daily.

- Query and edit large codebases
- Generate apps from PDFs, images or sketches
- Natural-language debugging and task automation such as PR queries and rebases
- Non-interactive mode with text, JSON or streaming JSON output
- MCP servers configured in settings; extensions for custom commands
- Media generation tools via MCP
- Auth: Google account OAuth, Gemini API key, Vertex AI / Agent Platform
- Weekly preview and stable release channels plus nightly

Plans and limits: Page does not list free-tier limits. The repo says Gemini CLI is not optimized for the latest models and recommends Antigravity.

Notes: Replaced by Antigravity CLI for unpaid and Google AI plan users as of June 18 2026.

Sources: <https://github.com/google-gemini/gemini-cli>, <https://github.com/google-gemini/gemini-cli/releases>, <https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/>

#### Google: Gemini CLI (shared)

Availability: Yes. Evidence: Vendor page.
Platforms: see Gemini CLI entry.

- Standard and Enterprise licenses keep Gemini CLI access

Plans and limits: Licensed seats only for CLI access.

Notes: A Google developer FAQ reportedly says IDE extension and CLI access is unchanged for Standard and Enterprise; its date is unclear.

Sources: <https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/>

#### Google: Jules Tools

Availability: Yes. Evidence: Vendor page.
Platforms: npm or pnpm global install (@google/jules); Google login in the browser.

- jules remote new starts a session, with --parallel to run several at once
- jules remote list shows repos and sessions; jules remote pull retrieves results
- Interactive terminal dashboard with side-by-side diff viewer
- Shell completion and light/dark theme

Plans and limits: Same Jules task limits.

Notes: Reference page checked Oct 24; original launch coverage dates to Oct 2025.

Sources: <https://jules.google/docs/cli/reference/>

#### Perplexity: none found

Availability: Unconfirmed. Evidence: Unconfirmed.

- A CLI command (Stripe Projects) provisions a Perplexity API project, mints a key and writes PERPLEXITY_API_KEY to .env
- Python Search SDK (pplx-srch-sdk) for parallel searches in code
- Perplexity API MCP Server installable as an Agent Plugin

Notes: These are developer API tools, not a consumer or coding-agent CLI. No official Perplexity terminal agent found.

Sources: <https://perplexity.ai/changelog>, <https://perplexity.ai/changelog>

#### xAI: Grok Build (see separate entry)

Availability: Yes. Evidence: Vendor page.

- Terminal coding agent; details in the Grok Build entry

Notes: Counted under the Grok Build entry.

Sources: <https://docs.x.ai/build/overview>

#### xAI: Grok Build (grok)

Availability: Yes. Evidence: Vendor page.
Platforms: macOS, Linux (curl install script), Windows (PowerShell install script).

- Fullscreen terminal UI, headless mode (grok -p) and Agent Client Protocol mode (grok agent stdio)
- Session modes: Plan, Auto (classifier approves safe tools), Always-approve
- Slash commands for sessions, resume, fork, rewind, share, export, compact and context
- Goal mode: works across rounds until reviewer subagents agree objective is met
- Deep research, loop (recurring prompt), background tasks and side questions
- Media commands: generate images and video from the terminal
- Skills, plugins, hooks, MCP servers and an in-terminal marketplace; xAI-run official plugin marketplace
- Reads Claude Code marketplaces, plugins, skills, MCP config, agents, hooks and AGENTS.md
- Custom models via config file, model and effort switching
- Memory commands and local session history in ~/.grok
- Sandbox profiles; non-interactive deny-by-default mode for CI
- Enterprise: root-owned requirements.toml policy, forced IdP login, zero data retention, telemetry off, disable always-approve
- Streaming JSON output for scripts and bots

Plans and limits: Beta access tied to a subscription per third-party guide; official docs say browser login or API key.

Notes: Docs state the product page as 'coding agent with three interfaces' (TUI, headless, ACP). No release newer than the May beta appears in release notes for July to October.

Sources: <https://docs.x.ai/build/overview>, <https://docs.x.ai/build/modes-and-commands>, <https://docs.x.ai/build/features/skills-plugins-marketplaces>, <https://docs.x.ai/build/enterprise>, <https://docs.x.ai/build/cli/headless-scripting>

#### xAI: none

Availability: Unconfirmed. Evidence: Unconfirmed.

Notes: Grok Build is the separate CLI.

#### Meta: Muse Code (muse)

Availability: Yes. Evidence: Vendor page.
Platforms: macOS and Linux install command; Windows tab shown in installer widget.

- Multi-agent coding in the terminal; run muse in a project directory
- Parallel subagents in isolated git worktrees with status, wait and steer
- Workflows: coordinated teams of subagents, triggered by asking for a workflow or Ultra effort
- Skills (built-in and user-invoked) and /plan that drafts a plan and waits for approval
- Rewind with double Esc
- Inter-session messaging over a local socket
- TypeScript SDK (developer preview) to drive sessions, tools and permissions from code
- Works with Meta Model API; open-weight and hosted models also available through the Model API

Plans and limits: Wonder Full available to Muse Code subscribers.

Notes: Developer homepage says Muse Code is out of beta; the older launch post still says early beta. MCP support is not mentioned in the pages read.

Sources: <https://dev.meta.ai/>, <https://dev.meta.ai/resources/blog/build-with-muse-code>, <https://dev.meta.ai/resources/blog/muse-code-new-plans-and-features/>, <https://about.fb.com/news/2026/10/introducing-muse-wonder-models/>

#### Manus: no Manus CLI found

Availability: Unconfirmed. Evidence: Unconfirmed.

- Manus uses the open-source Google Workspace CLI inside its Google Drive connector (nothing for users to install)
- My Computer runs terminal commands on your machine

Notes: Search found no official Manus CLI package. The 'CLI' in a blog URL slug refers to Google's tool.

Sources: <https://manus.im/blog/manus-google-drive-connector-update-cli>, <https://manus.im/blog/manus-my-computer-desktop>

#### Cursor: Cursor CLI (`agent`)

Availability: Yes. Evidence: Vendor page.
Platforms: macOS, Linux, WSL, Windows (PowerShell).

- interactive terminal agent with approvals
- Agent, Plan and Ask modes
- headless print mode (`agent -p`) for scripts and CI with model and output format options
- hand a task to a Cloud Agent by prefixing a message with &
- list and resume past sessions
- sandbox and network toggles
- masked sudo password prompt not sent to the model
- steering and interrupt while the agent runs

Plans and limits: Shares the paid weekly usage pool with Agent and Cloud Agents.

Notes: CLI doc page did not describe MCP or rules; marked not covered there.

Sources: <https://cursor.com/docs/cli/overview>, <https://cursor.com/docs/account/pricing>

#### Amazon Web Services: Kiro CLI (successor of Amazon Q Developer CLI)

Availability: Yes. Evidence: Vendor page.
Platforms: macOS, Linux, Windows; bash, zsh, fish.

- interactive chat with terminal UI
- headless mode with API key for CI/CD
- voice mode with local Whisper speech-to-text
- ACP support for editors such as JetBrains
- custom agents, sub-agents in parallel, skills, MCP, hooks, steering, Powers (v3)
- capability-based permissions and trust prompt for workspaces
- memories with /memories delete
- specs analysis and parallel task execution; workflows start only on request
- code intelligence and autocomplete
- model picker including experimental models

Plans and limits: Credits per plan; headless needs API key auth.

Notes: Spec-driven authoring is IDE-focused per the migration page.

Sources: <https://kiro.dev/docs/cli/>, <https://kiro.dev/changelog/>, <https://kiro.dev/downloads/>, <https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/upgrade-to-kiro.html>

#### Amazon Web Services: Amazon Q Developer CLI (rebranded Kiro CLI)

Availability: Yes. Evidence: Vendor page.
Platforms: Terminal; also over SSH.

- autocompletions and AI chat in the terminal
- natural language to bash
- agentic file edits and shell commands

Plans and limits: Existing CLI can still be used; AWS says new features and fixes only come to Kiro CLI.

Notes: Q CLI docs page states 'The Q CLI has become the Kiro CLI.'

Sources: <https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/command-line.html>, <https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/upgrade-to-kiro.html>, <https://aws.amazon.com/q/developer/>

#### Cognition: Devin CLI (shares Devin Local harness with Desktop)

Availability: Yes. Evidence: Vendor page.
Platforms: macOS, Linux, WSL, Windows.

- see Devin entry for features

Plans and limits: Can be bundled into Devin Desktop for legacy Windsurf Enterprise and Devin Enterprise plans when admin enables it.

Notes: Listed here because Desktop and CLI share one harness.

Sources: <https://docs.devin.ai/cli>, <https://docs.devin.ai/desktop/getting-started>

#### Cognition: Devin CLI (Devin for Terminal)

Availability: Yes. Evidence: Vendor page.
Platforms: macOS (also Homebrew), Linux, WSL, Windows (PowerShell, x86_64 and ARM64).

- local coding agent working on local files
- run `devin` in a project; preload prompt with `devin -- <prompt>`
- `devin --cloud` or /cloud to create, steer, resume and watch Devin Cloud sessions
- /handoff sends a task to a cloud VM and back to a local checkout
- `devin ssh` into a cloud VM with port forwarding and scp
- /open web or desktop to continue a session
- MCP servers and skills
- model choice

Plans and limits: Knowledge, Playbooks and Secrets from a Devin account not yet supported in the CLI. Free Cognition's own coding model cloud sessions in CLI ran until Oct 8, 2026.

Notes: Cloud-in-terminal announced Sept 21, 2026.

Sources: <https://docs.devin.ai/cli>, <https://devin.ai/blog/devin-cloud-in-your-terminal>, <https://docs.devin.ai/>

### VS Code

**AGI: AGI Code** (Coming soon). AGI's coding assistant inside VS Code, working on the open project with changes you review before they're kept. Runs on: VS Code on Mac, Windows and Linux; Works in remote project windows; Runs on AGI CLI, which is also coming soon. 31 catalogued features across: Chat in the editor (6), Modes, models and approvals (5), Editor actions (7), Account and cloud (9), Settings (4).

#### OpenAI: None for ChatGPT chat; Codex extension is separate

Availability: No. Evidence: Indirect evidence.
Platforms: n/a.

- The Codex extension (separate entry) can connect to the ChatGPT macOS app so ChatGPT can answer questions or make simple edits in VS Code

Plans and limits: n/a

Notes: See the Codex entry for the IDE extension.

Sources: <https://marketplace.visualstudio.com/items?itemName=openai.chatgpt>

#### OpenAI: Codex extension (marketplace id openai.chatgpt)

Availability: Yes. Evidence: Vendor page.
Platforms: VS Code, VS Code Insiders, Cursor, Windsurf; Xcode and JetBrains via built-in agent integrations.

- Sidebar chat with open files, selections and recent chats as context
- In-place summary plus focused diff beside your code; keep the edits you want
- Run locally or hand longer tasks to Codex cloud and track from the IDE
- Sign in with ChatGPT account
- Connects the ChatGPT macOS app to VS Code for questions and simple edits
- Same MCP and config as the CLI
- Approval modes picker (Chat, Agent, Agent full access per earlier research; re-verify)
- Plugins not supported in the IDE extension

Plans and limits: Marketplace says it requires a ChatGPT Plus, Pro, Business, Edu or Enterprise plan; the pricing page also lists IDE use under Free/Go lightweight Codex and API key.

Notes: Marketplace shows 15,901,660 installs, 730 ratings (about 3 stars). Conflict between marketplace plan list and pricing page is unresolved.

Sources: <https://marketplace.visualstudio.com/items?itemName=openai.chatgpt>, <https://learn.chatgpt.com/docs/ide>, <https://learn.chatgpt.com/docs/plugins>, <https://learn.chatgpt.com/docs/pricing>

#### Microsoft: None for consumer Copilot; coding extension is GitHub Copilot

Availability: No. Evidence: Indirect evidence.
Platforms: n/a.

- Microsoft Copilot Code builds apps in the Copilot app, not in VS Code

Plans and limits: n/a

Notes: See the GitHub Copilot entry.

Sources: <https://learn.microsoft.com/en-us/copilot/code>

#### Microsoft: None for Microsoft 365 Copilot; Copilot Code is in the app

Availability: No. Evidence: Indirect evidence.
Platforms: n/a.

- Copilot Code can connect GitHub to clone repos, open branches, commits and draft PRs from the Copilot app

Plans and limits: n/a

Notes: See GitHub Copilot entry for the VS Code extension.

Sources: <https://learn.microsoft.com/en-us/copilot/code>

#### GitHub: GitHub Copilot and GitHub Copilot Chat extensions for VS Code

Availability: Yes. Evidence: Vendor page.
Platforms: VS Code; also JetBrains, Visual Studio, Xcode, Neovim, Eclipse, Raycast.

- Inline ghost-text and next-edit suggestions with Tab
- Inline chat (Ctrl/Cmd+I)
- Agent mode: plan, edit multiple files, run terminal commands, self-correct on failing tests
- Plan agent that asks clarifying questions before handoff
- Agents window with parallel sessions across local, background (Copilot CLI) and cloud harnesses; also Claude and Codex providers
- Cloud agent creates branches and PRs from the IDE
- Automations (preview), agent merge for review feedback and failed checks (preview)
- HydraFusion auto model and workflow selection (research preview)
- Dev Container, SSH, tunnel and WSL sessions
- Integrated browser tools for agents
- Local, remote and Dev Container environments
- Custom instructions, skills, custom agents, hooks, MCP servers; bring your own key
- Continue Codex conversations from the ChatGPT app in VS Code
- Local sandboxing (GA)

Plans and limits: Free plan: 2,000 completions per month and limited chat; paid plans unlimited completions with credit-based chat and agent usage.

Notes: Copilot Chat marketplace listing: 78,958,562 installs, version 0.48.1. September releases covered VS Code v1.136 to v1.140.

Sources: <https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat>, <https://docs.github.com/en/copilot/concepts/copilot-surfaces/copilot-in-ides>, <https://github.blog/changelog/2026-10-01-github-copilot-in-vs-code-september-2026-releases/>

#### Anthropic: Claude Code for VS Code (also Cursor); JetBrains plugin (beta)

Availability: Yes. Evidence: Vendor page.
Platforms: VS Code (docs state 1.94.0+, Marketplace page states 1.98.0+; mismatch unresolved), Cursor, JetBrains IDEs (IntelliJ, PyCharm, Android Studio, WebStorm, PhpStorm, GoLand). Marketplace shows 28.5M+ installs.

- Native chat panel with inline diffs and plan review as a Markdown doc with inline comments
- @-mention files with line ranges; terminal output in prompts
- Checkpoints and rewind
- Conversation history, multiple tabs, resume past and cloud sessions
- Permission modes: Auto, Manual, Plan, Edit automatically
- Model picker, effort levels and extended thinking toggle
- MCP server management, plugins and marketplaces, skills, hooks, memory editor
- @browser to automate Chrome from the editor
- Agent map and background task view for subagents
- Remote Control toggle for all sessions
- Terminal mode toggle and CLI available in the integrated terminal
- Third-party providers (Bedrock, Google Cloud Agent Platform)
- JetBrains plugin: diff viewer, selection context, diagnostic sharing; runs the CLI in the IDE terminal and needs the CLI installed

Plans and limits: Pro, Max, Team, Enterprise or Console account; no API key required.

Notes: Some CLI features are subset-only in the extension (full command list, ! bash shortcut, tab completion).

Sources: <https://code.claude.com/docs/en/vs-code>, <https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code>, <https://code.claude.com/docs/en/jetbrains>

#### Google: Antigravity IDE extensions

Availability: Yes. Evidence: Vendor page.
Platforms: VS Code 1.90+ (macOS, Linux, Windows), Visual Studio 2026, JetBrains IDEs 2026.2.1+, Zed 0.140+, Xcode 27 beta 6+.

- Agent conversations in a side panel inside the editor
- Interactive plans and granular inline diffs
- Assign multi-step tasks from the editor
- MCP connections (GitHub, Postgres, Slack, Jira per Marketplace listing via press) and subagents for research, browser testing and parallel work
- Unified sign-in with CLI and 2.0 app, shared entitlements and rate limits
- Debugger, compiler diagnostics and localized-edit focus

Plans and limits: Any Antigravity plan including the free tier for individuals; Enterprise teams via Gemini Enterprise or Google Cloud credentials.

Notes: Announced Aug 20 2026. Feature details beyond the blog come partly from press summaries of the Marketplace listing.

Sources: <https://antigravity.google/blog/antigravity-ide-extensions>, <https://antigravity.google/docs/getting-started>, <https://alternativeto.net/news/2026/8/google-antigravity-releases-new-ide-extensions-for-top-code-editors/>

#### Google: Gemini CLI VS Code companion

Availability: Yes. Evidence: Indirect evidence.
Platforms: VS Code.

- IDE companion for the CLI (details not expanded on the repo page)

Plans and limits: Same as CLI.

Notes: Only a one-line mention on the repo page; no separate listing was read.

Sources: <https://github.com/google-gemini/gemini-cli>

#### Google: Gemini Code Assist extension

Availability: Yes. Evidence: Vendor page.
Platforms: VS Code (5.5M+ installs on the Marketplace), IntelliJ-based IDEs, Android Studio, Firebase and Cloud Shell editors.

- Code completion and generation from comments
- Chat with citations to docs and samples
- Debugging help and unit test generation
- Agent mode (replaced the @ tool operator in Oct 2025)
- Automated code review on GitHub for Cloud customers
- gcloud CLI, Kubernetes resource model and Terraform support

Plans and limits: Standard or Enterprise license through Google Cloud; consumer accounts cut off June 18 2026.

Notes: Marketplace page shows no deprecation notice even though sales ended Oct 9; the Marketplace page was fetched without a visible last-updated date.

Sources: <https://marketplace.visualstudio.com/items?itemName=Google.geminicodeassist>, <https://developers.google.com/gemini-code-assist/docs/deprecations>, <https://developers.google.com/gemini-code-assist/docs/overview>, <https://techinformed.com/google-ends-gemini-code-assist-sales-sets-renewal-deadlines/>

#### Google: unknown

Availability: Unconfirmed. Evidence: Unconfirmed.
Platforms: unknown.

Plans and limits: unknown

Notes: No Jules VS Code extension was confirmed; Antigravity extensions are the IDE route.

Sources: <https://jules.google/docs>

#### Perplexity: none found

Availability: Unconfirmed. Evidence: Unconfirmed.

Notes: Search returned only community VS Code extensions and MCP wrappers; no official Perplexity VS Code extension confirmed. Agent Plugin / MCP server exists for clients that support it.

Sources: <https://perplexity.ai/changelog>

#### xAI: no first-party extension

Availability: Unconfirmed. Evidence: Unconfirmed.

Notes: See Grok Build entry: only a community extension over ACP was found.

Sources: <https://docs.x.ai/build/cli/headless-scripting>

#### xAI: no first-party VS Code extension; ACP lets editors host it

Availability: No. Evidence: Indirect evidence.

- grok agent stdio exposes the agent over ACP for any compatible editor
- A free community VS Code sidebar extension (not from xAI) runs the CLI over ACP

Notes: Community extension claim comes from the extension author's guide; treat as unverified. xAI docs list ACP for editor integration but no named VS Code extension.

Sources: <https://docs.x.ai/build/cli/headless-scripting>, <https://www.productcompass.pm/p/grok-build-vscode>

#### xAI: none

Availability: Unconfirmed. Evidence: Unconfirmed.

Notes: None found.

#### Meta: none found

Availability: Unconfirmed. Evidence: Unconfirmed.

Notes: No official VS Code extension found for Meta AI or Muse Code.

Sources: <https://dev.meta.ai/resources/blog/muse-code-new-plans-and-features/>

#### Meta: none found

Availability: Unconfirmed. Evidence: Unconfirmed.

Notes: None found.

#### Meta: none found

Availability: Unconfirmed. Evidence: Unconfirmed.

Notes: Neither official Muse Code page mentions an IDE or VS Code integration.

Sources: <https://dev.meta.ai/resources/blog/muse-code-new-plans-and-features/>

#### Manus: none found

Availability: Unconfirmed. Evidence: Unconfirmed.

- GitHub integration exports website-builder code to a private repo with two-way sync

Notes: No official VS Code extension found.

Sources: <https://manus.im/docs/de/website-builder/github-integration.md>

#### Cursor: Cursor itself (VS Code-based editor); JetBrains integration via ACP

Availability: Yes. Evidence: Vendor page.
Platforms: Desktop fork of VS Code; JetBrains IDEs 2025.1+ with AI Assistant plugin.

- Cursor is a VS Code-based editor, not an extension for VS Code
- no official Cursor extension for stock VS Code found
- JetBrains: Cursor agent runs inside IntelliJ, PyCharm, WebStorm via Agent Client Protocol
- JetBrains: model picker, file editing, terminal commands in the IDE terminal

Plans and limits: JetBrains integration requires a paid Cursor plan; usage follows the subscription.

Notes: Here 'vscode' is the VS Code-fork case; the editor is the same product as the desktop entry. No stock-VS-Code extension is documented, absence not explicitly stated.

Sources: <https://cursor.com/docs/configuration/migrations/vscode>, <https://cursor.com/docs/integrations/jetbrains>

#### Amazon Web Services: Kiro IDE is a Code OSS (VS Code open source) fork; JetBrains via ACP

Availability: Yes. Evidence: Vendor page.
Platforms: Standalone IDE; JetBrains via Kiro CLI over ACP.

- Open VSX extension marketplace, VS Code profile import on first launch
- no extension for stock VS Code documented
- JetBrains: install Kiro CLI, sign in, add Kiro as a custom agent in AI Assistant
- Visual Studio and Eclipse: no native Kiro plugins

Plans and limits: Same credit plans.

Notes: Same product as desktop entry for the fork case.

Sources: <https://kiro.dev/>, <https://kiro.dev/docs/upgrade-guides/migrating-from-q-developer/>

#### Amazon Web Services: Amazon Q extension for VS Code (also JetBrains, Visual Studio, Eclipse preview)

Availability: Yes. Evidence: Vendor page.
Platforms: VS Code, JetBrains IDEs, Visual Studio (AWS Toolkit), Eclipse (preview).

- inline code suggestions
- chat and agentic coding
- vulnerability scanning
- unit test generation
- Java upgrade and .NET porting transformation
- customization against private repos (Pro)

Plans and limits: Free tier via AWS Builder ID; Pro via IAM Identity Center. Support for IDE plugins ends April 30, 2027; listings stay live with a deprecation notice and critical fixes continue.

Notes: Kiro is the official successor; extension upgrades rebrand to Kiro.

Sources: <https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/q-developer-ide-end-of-support.html>, <https://aws.amazon.com/blogs/devops/amazon-q-developer-end-of-support-announcement/>, <https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/what-is.html>

#### Cognition: Devin Desktop is a VS Code-style IDE; Windsurf Plugin exists for JetBrains only

Availability: Yes. Evidence: Indirect evidence.
Platforms: Devin Desktop (VS Code-style IDE); JetBrains plugin 2025.1.3+.

- Windsurf JetBrains plugin: autocomplete, chat, command
- JetBrains plugin is in maintenance mode; Cascade deprecated; docs recommend Devin over ACP instead
- Windsurf (Remote Development) plugin no longer maintained

Plans and limits: Individual use free; see plans.

Notes: Docs index lists JetBrains only. A search snippet and secondary source said older VS Code, Vim and other plugins exist in maintenance; the current docs page did not list them, so a VS Code extension is unconfirmed.

Sources: <https://docs.devin.ai/windsurf/plugins/getting-started>, <https://devin.ai/desktop>

#### Cognition: none for Devin; Devin Desktop is the IDE; Windsurf plugin only for JetBrains

Availability: No. Evidence: Indirect evidence.
Platforms: n/a.

- Devin over ACP recommended inside JetBrains per Windsurf plugin docs

Plans and limits: n/a

Notes: Devin docs index lists no VS Code extension. Absence not explicitly stated.

Sources: <https://docs.devin.ai/>, <https://docs.devin.ai/windsurf/plugins/getting-started>

### Chrome

**AGI: AGI Extension** (Coming soon). AGI in a Chrome side panel: ask about the page you're on, and let AGI read and act on sites you approve, with you in control. Runs on: Chrome on Mac, Windows and Linux. 31 catalogued features across: Side panel chat (7), Reading the page (6), Acting in the browser (9), Your AGI account in the panel (2), Settings and privacy (7).

#### OpenAI: ChatGPT browser extension (Chrome Web Store); ChatGPT Atlas retired

Availability: Yes. Evidence: Vendor page.
Platforms: Chrome, Edge, Brave, Vivaldi (side chat); Opera supported for tab mentions and control only.

- Side chat in the browser sidebar (not in Opera)
- Lets ChatGPT desktop and web control your browser in the background without taking over the session
- Research across live and authenticated websites
- Create and edit docs, spreadsheets, slides from browser content
- Enter data into record systems (timesheets, inventory, CMS)
- Summarize and answer questions about open tabs; @ mention tabs
- Highlight text or right-click 'Ask ChatGPT'
- YouTube transcript Q&A when captions exist
- File expenses, bulk-download files and images, test websites, organize tabs
- Per-site permissions: allow once, allow for this site, allow for all sites (flagged elevated risk), decline; allowlist/blocklist
- Browser history use asks each time, no always-allow
- Follows Memories setting

Plans and limits: Plan tiers not named on the docs page; availability depends on rollout and workspace settings. Requires the ChatGPT desktop app for setup (Settings > Computer Use).

Notes: Chrome Web Store listing: version 1.26.1020.11845, updated 2026-10-22, 7,000,000 users, rating 1.9 of 5 from about 1K ratings. Atlas stopped working Aug 9 2026 per OpenAI help center (secondary reporting for dates).

Sources: <https://chromewebstore.google.com/detail/chatgpt/hehggadaopoacecdllhhajmbjkdcmajg>, <https://learn.chatgpt.com/docs/chrome-extension>, <https://learn.chatgpt.com/docs/browser>, <https://help.openai.com/articles/20001371>

#### OpenAI: ChatGPT browser extension used from Codex chats; built-in browser

Availability: Yes. Evidence: Vendor page.
Platforms: Chrome, Edge, Brave, Opera, Vivaldi.

- @Browser or a browser mention in a Codex chat lets Codex use your signed-in browser
- Built-in browser previews local web apps with annotation comments
- Developer mode gives DevTools protocol access with approval
- Confirmation before submitting data, purchases, permission changes or deletions

Plans and limits: Not specified on the docs pages.

Notes: Same extension as the ChatGPT entry; there is no separate Codex Chrome extension found.

Sources: <https://learn.chatgpt.com/docs/chrome-extension>, <https://learn.chatgpt.com/docs/browser>

#### Microsoft: Copilot in Microsoft Edge (Copilot Mode retired May 2026)

Availability: Yes. Evidence: Vendor page.
Platforms: Edge on Windows and Mac, Edge mobile app.

- Multi-tab context to compare across open tabs
- Browsing history and long-term memory
- Vision and Voice for hands-free help
- Redesigned new tab page combining chat, search and browsing (rolls out in October)
- Browse with Copilot (formerly Copilot Actions): agentic browsing, Microsoft 365 Premium in the US only, usage limits
- Journeys: groups history into topic cards with next steps (desktop free in some English markets; mobile US only)
- Study and Learn mode, quizzes and flashcards
- Writing assistant (US only)
- Podcasts from open tabs (English markets, Microsoft account)
- Opt-in and controllable in Edge Settings

Plans and limits: Browse with Copilot needs Microsoft 365 Premium and is US only.

Notes: No official Microsoft Copilot extension for Chrome confirmed. A Chrome extension for Microsoft 365 Copilot Chat appeared on the roadmap and was later marked inaccurate.

Sources: <https://blogs.windows.com/msedgedev/2026/05/13/new-updates-to-edge-across-desktop-and-mobile/>, <https://mc.merill.net/message/RM530577>

#### Microsoft: Copilot Chat in Microsoft Edge; Cowork browser use in Edge

Availability: Yes. Evidence: Vendor page.
Platforms: Microsoft Edge (Chrome extension not confirmed).

- Copilot icon in Edge summarizes web pages and some document types
- Cowork opens a hidden Edge tab using your existing sign-ins to complete web tasks
- Approval cards for sensitive actions; user takes over for CAPTCHA, passwords and MFA
- Respects Conditional Access, web filtering and Purview DLP
- Admin opt-in per tenant or security group; Edge policy to control instances

Plans and limits: Cowork Browsing disabled by default until tenant admin enables; requires Edge 152 or later.

Notes: A Chrome extension for Microsoft 365 Copilot Chat and Search was on the roadmap (GA April 2026) and later flagged as no longer accurate; no current Chrome Web Store listing confirmed.

Sources: <https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/cowork-local-browser>, <https://learn.microsoft.com/en-us/microsoft-365/copilot/copilot-overview>, <https://mc.merill.net/message/RM530577>

#### GitHub: No official Copilot browser extension or browser found

Availability: Unconfirmed. Evidence: Unconfirmed.
Platforms: n/a.

- Copilot on github.com is the browser surface; VS Code agents have an integrated browser, but that is inside the editor

Plans and limits: n/a

Notes: Docs list of Copilot surfaces has no browser extension. A search found no 2026 changelog for one; only a low-quality 2024 page claimed a Chrome listing, so it is not relied on.

Sources: <https://docs.github.com/en/copilot>

#### Anthropic: Claude in Chrome (extension, side panel)

Availability: Yes. Evidence: Vendor page.
Platforms: Google Chrome only on desktop (Chrome Web Store). Not supported on other Chromium browsers or mobile for the extension itself.

- Claude reads pages, clicks, types, navigates and fills forms in a side panel
- Side panel runs as a Cowork session on Max and Team (Pro as rollout reaches it); sessions saved and synced across surfaces; skills and connectors work
- Classic side panel still available
- Scheduled recurring browser tasks (daily, weekly, monthly, annually)
- Saved shortcuts invoked with '/'; shortcuts can be scheduled
- Multi-tab workflows via tab groups; background workflows
- Console logs, network requests and DOM state for debugging (used with Claude Code)
- Screenshot and image upload
- 1Password sign-in requests approved by biometrics (beta, macOS)
- Per-site permission prompts; optional auto-approve mode with a separate safety check
- Team/Enterprise admins can enable/disable the extension and set site allowlists and blocklists
- Driven by Claude Desktop for Cowork browser tasks and by Claude Code via --chrome

Plans and limits: Paid plans only (Pro, Max, Team, Enterprise). Not on Free. Enterprise admins must enable it; off by default under HIPAA.

Notes: Anthropic calls it 'still risky' despite safety classifiers. Chrome Web Store listing (checked Oct 24): version 1.0.102, updated Oct 21 2026, about 19 million users, 3.6/5 from 1.9K ratings. Anthropic does not ship its own browser.

Sources: <https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn>, <https://support.claude.com/en/articles/12012173-getting-started-with-claude-in-chrome>, <https://claude.com/pricing>

#### Anthropic: Claude in Chrome integration with Claude Code

Availability: Yes. Evidence: Vendor page.
Platforms: Chrome, Edge; detection also set up for Brave, Arc, Vivaldi, Opera. Not supported in WSL.

- Live debugging: read console errors and DOM state, then fix the code
- Test local web apps, form validation and user flows
- Uses your logged-in browser sessions (Gmail, Docs, Notion)
- Data extraction and multi-site workflows
- File uploads up to 10 MB total, with credential-file protections
- Record browser interactions as GIFs and save screenshots
- Site-level permissions inherited from the extension
- Pauses for login pages and CAPTCHAs

Plans and limits: Direct Anthropic plan (Pro, Max, Team, Enterprise) and /login; not with API key, long-lived token or third-party providers.

Notes: Requires extension version 1.0.36 or later.

Sources: <https://code.claude.com/docs/en/chrome>

#### Google: Gemini in Chrome (built into Chrome, no extension)

Availability: Yes. Evidence: Vendor page.
Platforms: Chrome on Windows, Mac and Chromebook Plus; Chrome for iOS ('Page tools'); Chrome for Android rolled out to all US users Aug 18 per press coverage.

- Ask Gemini button opens a side panel that uses the current tab and up to 10 open tabs; @ to add a tab
- Summarize, explain and compare across pages
- Questions about audio and video already played
- Live voice chat while browsing (not for under 18)
- Auto browse: multi-step tasks such as filling a cart or booking (preview; US Pro and Ultra; not for under 18)
- Workspace content access for shared Workspace pages
- image generation image editing on Android
- Controls for icon placement, location, microphone, default tab sharing and auto browse
- Needs sign-in to Chrome, not in Incognito; work or school accounts need admin approval

Plans and limits: Chat features free in supported regions; auto browse limited to Google AI Pro and Ultra in the US. Google documents auto browse as experimental.

Notes: Chrome's own page conflicts on Android (feature text vs FAQ saying not yet on Android); the Android rollout and phone auto browse come from press (9to5Google, Android Authority) not a Google page. Auto browse launched Jan 28 2026 per Gemini release notes.

Sources: <https://support.google.com/chrome/answer/16283624>, <https://www.google.com/chrome/ai-innovations/>, <https://gemini.google/release-notes/>, <https://9to5google.com/2026/08/18/gemini-chrome-android-us/>

#### Google: Browser tools via /browser (mechanism not confirmed)

Availability: Unconfirmed. Evidence: Unconfirmed.
Platforms: unknown.

- Browser-in-the-loop agents for frontend work; /browser slash command turns browser tools on

Plans and limits: unknown

Notes: No Chrome extension listing was found for Antigravity; how the browser tools attach to Chrome is not documented in the pages read.

Sources: <https://antigravity.google/>, <https://antigravity.google/blog/introducing-google-antigravity-2>

#### Perplexity: Browser extension for Computer, plus Comet browser (see Comet entry)

Availability: Yes. Evidence: Vendor page.
Platforms: Chromium browsers (Chrome, Edge, Brave); requires Perplexity for Mac 26.38.0 or later per changelog.

- Lets Computer use your desktop browser
- Comet is the default browser if installed; change under Settings > Connectors
- Separate Comet AI browser with its own assistant

Plans and limits: Plan not stated.

Notes: Changelog names Mac as the host app; Windows support for the extension not stated. Older third-party and legacy Perplexity companion extensions exist in the Chrome Web Store; a current official standalone sidebar extension was not confirmed.

Sources: <https://perplexity.ai/changelog>, <https://perplexity.ai/comet>

#### Perplexity: Comet is itself the AI browser (Chromium); it also runs Chrome extensions

Availability: Yes. Evidence: Vendor page.
Platforms: macOS, Windows, Android, iOS (extensions not supported on iOS per press).

- Comet is Perplexity's own Chrome-class browser with a built-in assistant
- Installs Chrome Web Store extensions with Add to Comet
- Enterprise deployment guides for Windows and macOS

Notes: Recorded here as the vendor's AI browser per the brief. Press reports in 2026 mention a Samsung Internet integration and MDM deployment; only the MDM-style enterprise install is confirmed on an official help page.

Sources: <https://www.perplexity.ai/help-center/comet/en/articles/11734716-extensions.md>, <https://www.perplexity.ai/help-center/en/collections/18799298-comet>

#### xAI: none official found

Availability: Unconfirmed. Evidence: Unconfirmed.

Notes: Only third-party Grok extensions found. No vendor AI browser found.

#### xAI: none

Availability: Unconfirmed. Evidence: Unconfirmed.

Notes: Uses computer use on a cloud computer rather than a browser extension; no extension found.

Sources: <https://docs.x.ai/grok-bot/overview>

#### Meta: none found

Availability: Unconfirmed. Evidence: Unconfirmed.

Notes: No Meta AI browser or Chrome extension found.

#### Meta: none found

Availability: Unconfirmed. Evidence: Unconfirmed.

Notes: Muse operates a browser in its own cloud VM. No Chrome extension or Meta AI browser found; search results were unrelated products with the Muse name.

Sources: <https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/>

#### Manus: Manus Browser Operator (Chrome extension)

Availability: Yes. Evidence: Vendor page.
Platforms: Chrome and Edge recommended; other browsers coming; listing shows version 0.0.63 updated 2026-10-06, about 500,000 users.

- Lets the agent work in your logged-in sites (Gmail, Calendar, Notion) without sharing passwords
- Authorize each session; agent works in a dedicated tab group and stops when the tab closes
- Action audit trail; watch or take over at any time
- Preferred Browser lets you add a custom browser to the automation process (May 2026)
- Enable through the My Browser connector

Plans and limits: Announced as available to all users.

Notes: Complex drag-and-drop and multi-step forms may not work perfectly. Developer on the store is the company's legal entity.

Sources: <https://chromewebstore.google.com/detail/manus-browser-operator/cecngibhkljoiafhjfmcgbmikfogdiko>, <https://manus.im/blog/manus-browser-operator>, <https://manus.im/blog/manus-preferred-browser>

#### Cursor: none found

Availability: Unconfirmed. Evidence: Unconfirmed.
Platforms: n/a.

- built-in browser pane inside the desktop app (not a Chrome extension)
- a Browser Use plugin in Cursor Marketplace can drive a real Chrome (third-party plugin for the editor)

Plans and limits: n/a

Notes: No official Chrome extension or AI browser from Cursor found; Chrome Web Store results were third-party tools disclaiming affiliation. Absence not confirmed by an official statement.

Sources: <https://cursor.com/docs/agent/tools/browser>, <https://cursor.com/marketplace>

#### Amazon Web Services: none found

Availability: Unconfirmed. Evidence: Unconfirmed.
Platforms: n/a.

Plans and limits: n/a

Notes: No Kiro Chrome extension or browser found on the homepage, docs index or downloads page. Not confirmed absent.

Sources: <https://kiro.dev/>, <https://kiro.dev/downloads/>

#### Amazon Web Services: none found

Availability: Unconfirmed. Evidence: Unconfirmed.
Platforms: n/a.

Plans and limits: n/a

Notes: No Chrome extension or browser mentioned on official Q Developer pages.

Sources: <https://aws.amazon.com/q/developer/>

#### Cognition: none found

Availability: Unconfirmed. Evidence: Unconfirmed.
Platforms: n/a.

Plans and limits: n/a

Notes: A search snippet suggested a Chrome plugin in old docs; the current plugin docs page lists JetBrains only. Unconfirmed.

Sources: <https://docs.devin.ai/windsurf/plugins/getting-started>

#### Cognition: none found

Availability: Unconfirmed. Evidence: Unconfirmed.
Platforms: n/a.

- Devin uses its own in-VM browser and Interactive Browser to test work; this is not a Chrome extension

Plans and limits: n/a

Notes: No Devin Chrome extension or AI browser found in docs index or main site.

Sources: <https://docs.devin.ai/>, <https://devin.ai/>

## 4. Plans and prices

Prices are US list prices per month unless stated, read on 2026-10-24.

**AGI Workforce:** Free $0; Basic $7; Pro $20; Max 5x $100; Max 20x $200; Team $25; Team Premium $125; Enterprise Custom; No AGI plan needed $0.

**OpenAI ChatGPT**

| Plan                        | Price                                                          | What it adds                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free                        | $0                                                             | Limited usage; efficient model only in desktop app when rolled out; image generation not available on Free for Codex usage limits; Finances expanded to Free and Go (US) on 2026-10-02 |
| Go                          | $8/month                                                       | Low-cost tier above Free. Help-center wording about 'unlimited' chat on Go was seen only in search snippets; help.openai.com refused automated fetch                                   |
| Plus                        | $20/month ($19.99 in iOS App Store)                            | Codex on web, CLI, IDE, iOS; cloud integrations; can buy credits                                                                                                                       |
| Pro 100 / Pro 200 / Pro 500 | $100 / $200 / $500 per month                                   | Everything in Plus; Ultrafast speed mode only on the $500 tier; Pro has no five-hour Codex limit currently; dots available to Pro tiers (over 18, outside EEA/UK/Switzerland)          |
| Business                    | $20/user/month billed annually; $25 billed monthly (2+ users)  | ChatGPT and Codex on desktop and mobile, SSO, MFA, admin controls, no training on business data by default; plugins on by default; 'Business Premium' tier referenced for dots         |
| Enterprise and Edu          | Contact sales                                                  | SCIM, EKM, RBAC, domain verification, Compliance API, data residency and retention controls; plugins and cloud browser off by default until admin enables                              |
| Credits (add-on)            | 100 credits $4; 500 credits $20; 1000 credits $40 (iOS in-app) | Plus and Pro can buy credits when limits are hit; workspace credits for Business/Edu/Enterprise                                                                                        |

**OpenAI Codex**

| Plan               | Price                              | What it adds                                                                                                                                                                                                                                     |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Free               | $0                                 | Codex for quick coding tasks; efficient model in desktop app, subject to rollout                                                                                                                                                                 |
| Go                 | $8/month                           | Codex for lightweight coding tasks                                                                                                                                                                                                               |
| Plus               | $20/month                          | Codex on web, CLI, IDE, iOS; cloud integrations (automatic code review, Slack). Local messages per five hours range from about 5-45 on the most capable model to 350-3,000 on the efficient model; weekly limits may apply; cloud tasks use more |
| Pro                | $100 / $200 / $500 per month       | No five-hour limit currently; Ultrafast (8x included usage) on $500 tier                                                                                                                                                                         |
| Business           | $20/user/month annual; $25 monthly | Larger cloud VMs, credits, admin controls; same per-seat limits as Plus on standard                                                                                                                                                              |
| Enterprise and Edu | Contact sales                      | Flexible pricing with credits and no fixed rate limits, or Plus-like per-seat limits without it; priority processing                                                                                                                             |
| API key            | Pay per API pricing                | Codex in CLI, SDK, IDE; no cloud features (GitHub review, Slack)                                                                                                                                                                                 |

**Microsoft Microsoft Copilot**

| Plan                   | Price                        | What it adds                                                                                                                         |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Free                   | $0                           | Limited free version subject to capacity and limits; specific limits not published on the pages fetched                              |
| Microsoft 365 Personal | $9.99/month or $99.99/year   | 1 person, 1 TB; Copilot with higher usage than free; AI credits and feature limits                                                   |
| Microsoft 365 Family   | $12.99/month or $129.99/year | Up to 6 people but AI only for the owner; 2 TB shared                                                                                |
| Microsoft 365 Premium  | $19.99/month or $199.99/year | Extensive Copilot usage, Premium-exclusive features, limited agentic AI; replaced the standalone Copilot Pro per secondary reporting |
| Microsoft 365 Pro      | $99.99/month (monthly only)  | Highest usage and agentic AI limits, 5 TB                                                                                            |

**Microsoft Microsoft 365 Copilot**

| Plan                                         | Price                                                                   | What it adds                                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Copilot Chat (Basic)                         | Included with eligible Microsoft 365 plans                              | Web-grounded chat with enterprise data protection; org files only if you supply them; pay-as-you-go work-data agents |
| Microsoft 365 Business Standard with Copilot | $23.50/user/month yearly; $28.20 monthly                                | Copilot in Office apps and Teams, chat grounded in work data, agents, Cowork and Autopilot access                    |
| Microsoft 365 Business Premium with Copilot  | $32.00/user/month yearly; $38.40 monthly                                | Adds advanced security and identity management                                                                       |
| Microsoft 365 Copilot Business (add-on)      | $18.00/user/month promo first year (list $21.00) yearly; $25.20 monthly | Promotion July 1 to December 31 2026 for existing eligible Business customers                                        |
| Enterprise                                   | $30.00/user/month yearly (as listed on Microsoft Copilot page)          | Includes Copilot, productivity apps, Copilot Studio per that page; confirm against licensing docs                    |
| Usage-based billing                          | Metered credits on top of the license                                   | Cowork, Code, Autopilot, Work IQ APIs and frontier models billed by consumption                                      |

**GitHub GitHub Copilot**

| Plan       | Price          | What it adds                                                                                           |
| ---------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| Free       | $0             | Limited chat and agent usage; 2,000 completions per month; CLI included; no cloud agent or code review |
| Pro        | $10/month      | $15 total AI credits ($10 base plus $5 flex); cloud agent, code review, buy more credits               |
| Pro+       | $39/month      | $70 total AI credits; delegate to third-party agents (Claude, OpenAI Codex, preview)                   |
| Max        | $100/month     | $200 total AI credits ($100 base plus $100 flex)                                                       |
| Business   | $19/user/month | Unlimited completions, cloud agent and code review, budget controls, 1,900 credits per user            |
| Enterprise | $39/user/month | Everything in Business, priority model access, 2,000 more credits per user, agent governance           |

**Anthropic Claude**

| Plan       | Price                                                                                                   | What it adds                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free       | $0                                                                                                      | Rolling five-hour usage window, no fixed message count. Chat on web, desktop and mobile, web search, memory, connectors, Artifacts, Claude Design/Slides/Docs, up to 5 projects. No Claude Code, Research or Claude in Chrome.                                                                                                                            |
| Pro        | $17/month billed annually ($200 up front) or $20/month billed monthly                                   | At least 5x Free usage per five-hour window plus weekly limits; usage credits available. Adds Claude Code, Claude in Chrome, Research, unlimited projects, task handoff and scheduling, Claude Science, Claude for Microsoft 365, Dashboards (beta), more models.                                                                                         |
| Max        | From $100/month (monthly billing only)                                                                  | 5x or 20x Pro usage per five-hour window, higher output limits, priority access at peak times, early access to advanced features. Page lists $100/month (5x) or $200/month (20x) of monthly API credits; Max users claim API credits in Settings > Billing (release note, Oct 7).                                                                         |
| Team       | Standard seat $20/seat/month annual or $25 monthly; Premium seat $100/seat/month annual or $125 monthly | 2 to 150 seats. Standard seats get more than Pro, Premium seats 5x Standard. Claude Code, Cowork, Chrome, Research, memory, connectors, shared projects, Design/Slides/Docs, Microsoft 365, SSO, central billing, connector admin controls; up to $500/month pooled API credits. Role-based access, SCIM, audit logs and Compliance API are not included. |
| Enterprise | $20/seat/month billed annually, 20-seat minimum, plus usage at API rates                                | All Team features plus role-based access, SCIM, audit logs, Compliance API, custom data retention, IP allowlisting, HIPAA-ready offering, Claude Security (beta). Annual billing only; admins set user and org spend limits.                                                                                                                              |

**Anthropic Claude Code**

| Plan                        | Price                                                 | What it adds                                                                                                                                                                                                                                                             |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Free                        | $0                                                    | Claude Code not included.                                                                                                                                                                                                                                                |
| Pro                         | $17/month annual or $20 monthly                       | Claude Code included; cloud sessions, cloud scheduled tasks, Remote Control, Channels, computer use, Dispatch, Slack, Artifacts. Usage shared with the rest of Claude on five-hour and weekly limits.                                                                    |
| Max                         | From $100/month (5x or 20x Pro usage)                 | Same features as Pro with larger usage.                                                                                                                                                                                                                                  |
| Team                        | Standard $20-25/seat; Premium $100-125/seat per month | Adds Code Review, analytics dashboard, server-managed settings, SSO. Remote Control and Channels are admin-enabled; computer use and Dispatch not available.                                                                                                             |
| Enterprise                  | $20/seat/month annual plus usage at API rates         | Cloud sessions need a premium seat or Chat + Claude Code seat. Adds SCIM, Compliance API, Analytics API, Zero Data Retention (separate enablement). Third-party providers (Bedrock, Google Cloud Agent Platform, Foundry) also supported for the CLI and IDE extensions. |
| Anthropic Console / API key | Pay as you go                                         | CLI and IDE extensions work; cloud sessions, desktop app, Remote Control, Chrome, Slack and voice dictation need a claude.ai subscription.                                                                                                                               |

**Google Gemini app**

| Plan                            | Price                                                               | What it adds                                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free                            | $0                                                                  | Google account. Flash-Lite model, image generation and editing, Deep Research, Gemini Live, Canvas, Gems, limited Google Flow access, 15 GB storage. Context window 32k tokens with no AI plan.                                                                 |
| Google AI Plus                  | $4.99/month (US)                                                    | 2x Free usage, 128k context, video generation, Daily Brief, 200 Google Flow credits, 400 GB storage, Gemini in Google apps. Available in more countries than Pro and Ultra.                                                                                     |
| Google AI Pro                   | $19.99/month (US)                                                   | 4x Free usage, 1M-token context, latest frontier model access, 1,000 Flow credits, Jules and Antigravity entry limits, Chrome auto browse (US), 5 TB storage, Gemini in Gmail and Docs, YouTube Premium Lite.                                                   |
| Google AI Ultra                 | $99.99/month (5x Pro limits) or $199.99/month (20x Pro limits) (US) | Highest access, 10,000 or 25,000 Flow credits, highest Jules and Antigravity limits, Project Genie, Spark agent (US, English, beta), Tasks in Gemini, Google Home Premium Advanced, YouTube Premium, 20 TB+ storage. Ultra is only usable in certain countries. |
| Gemini Enterprise Business      | From $21/seat/month                                                 | Gemini app for business, Notebook, connectors, no-code agent builder, up to 300 seats, 25 GiB pooled storage per seat.                                                                                                                                          |
| Gemini Enterprise Standard/Plus | From $30/seat/month                                                 | Adds ADK and third-party agents, VPC-SC, customer-managed keys, compliance features, unlimited seats. Antigravity is available through eligible Gemini Enterprise subscriptions.                                                                                |
| Student offer                   | Free for one year                                                   | Eligible college students: Google AI Pro free in the US or AI Plus free in 140+ countries; redeemable until Dec 31 2026.                                                                                                                                        |

**Google Google Antigravity**

| Plan                                          | Price                                                                   | What it adds                                                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Individuals (free)                            | $0                                                                      | Generally available. Access to a variety of agent models, unlimited Tab completions and Command requests, basic weekly rate limits. |
| Google AI Pro                                 | $19.99/month (via Google AI plan)                                       | More rate limits and a flexible AI credit pool. Latest frontier model available to Pro and Ultra.                                   |
| Google AI Ultra                               | $99.99 or $199.99/month (via Google AI plan)                            | Even more rate limits, credit pool, higher access to newest models.                                                                 |
| Business via Google Cloud / Gemini Enterprise | Standard/Plus seats from $30/seat/month; pay-as-you-go with $0 seat fee | Admin controls, spend caps, API consumption pricing. Enterprise JetBrains and Zed support in Preview.                               |

**Google Gemini CLI**

| Plan                                                                                    | Price                                   | What it adds                                                         |
| --------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| Consumer (Google AI Pro, Ultra, free Code Assist for individuals)                       | n/a                                     | No longer served since June 18 2026; users moved to Antigravity CLI. |
| Gemini Code Assist Standard/Enterprise license, or paid Gemini API / Agent Platform key | Per Google Cloud licensing or API usage | These customers keep Gemini CLI access unchanged.                    |

**Google Gemini Code Assist**

| Plan                                       | Price                    | What it adds                                                                                                                                                                                                                                  |
| ------------------------------------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standard and Enterprise (Google Cloud)     | Per Google Cloud license | New subscriptions can no longer be bought since Oct 9 2026; additional licenses and annual renewals end Jan 31 2027; monthly renewals end Dec 31 2027. Existing subscriptions supported until term ends. Google points buyers to Antigravity. |
| Consumer / individuals / AI Pro / AI Ultra | n/a                      | IDE extensions and Gemini CLI stopped serving these accounts June 18 2026; consumer GitHub app shut down July 17 2026.                                                                                                                        |

**Google Jules**

| Plan           | Price                         | What it adds                                                                                                    |
| -------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Jules (base)   | Free with Google account      | 15 tasks per rolling 24 hours, 3 concurrent tasks (per usage-limits page, model names on that page look dated). |
| Jules in Pro   | Included with Google AI Pro   | 100 tasks per day, 15 concurrent. Currently limited to individual @gmail.com accounts per docs.                 |
| Jules in Ultra | Included with Google AI Ultra | 300 tasks per day, 60 concurrent.                                                                               |

**Perplexity Perplexity**

| Plan                                        | Price                                                    | What it adds                                                                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Free                                        | $0                                                       | Search with citations, basic models, limited web answers, file uploads and asset generation. Card says limited daily usage, FAQ says limited weekly usage.   |
| Pro                                         | $17/month billed annually (App Store lists $20 in-app)   | 4,000 bonus credits, expanded Computer access, deep research, model choice, Model Council, 400+ app connectors, premium data sources, about 10x Free limits. |
| Max                                         | $167/month billed annually (App Store lists $200 in-app) | Everything in Pro plus 35,000 bonus credits and 10,000 monthly Computer credits, highest limits, priority access to new features, more video generation.     |
| Enterprise (Enterprise Pro, Enterprise Max) | not published on the pricing page                        | Pricing page has an Enterprise tab with no price. Changelog references role-based access controls, API credential vault, org Skills governance.              |
| Computer credit packs (in-app)              | $5 for 500, $10 for 1,000, $25 for 2,500, $50 for 5,000  | iOS in-app purchases.                                                                                                                                        |

**Perplexity Comet**

| Plan                 | Price                                       | What it adds                                                                                                                           |
| -------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Comet download       | Free (became free to download October 2025) | Paid Perplexity Pro and Max unlock more models and usage per press coverage; the official help pages fetched do not state plan gating. |
| Comet for Enterprise | not published                               | MDM-style install on Windows and macOS, policies and controls, telemetry, assistant permission management.                             |

**xAI Grok**

| Plan                                | Price                                                                                                        | What it adds                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The X Subscription: Free            | $0                                                                                                           | Daily Grok access, starter Cursor allowance, standard X.                                                                                                                                                                                                                        |
| The X Subscription: Plus            | $8/month                                                                                                     | More Grok and Cursor usage plus X checkmark, creator tools, fewer ads. Base usage level.                                                                                                                                                                                        |
| The X Subscription: Premium         | $30/month                                                                                                    | Bundles SuperGrok, Cursor Pro and X Premium+ benefits (previously $90 combined). 4x Plus usage. Third-party models in Cursor billed at API list via top-ups.                                                                                                                    |
| The X Subscription: Super           | $100/month                                                                                                   | Same features as Premium, 15x Plus usage.                                                                                                                                                                                                                                       |
| The X Subscription: Ultra           | $200/month                                                                                                   | Same features as Premium, 50x Plus usage. Team seats at same per-seat prices with SSO, admin controls, usage analytics.                                                                                                                                                         |
| Legacy SuperGrok tiers (iOS in-app) | SuperGrok Lite $10, SuperGrok $30, SuperGrok Plus $100, SuperGrok Heavy $300, extra usage credits $5 to $100 | Existing SuperGrok, Cursor and X Premium subscribers keep their plans unless they switch (per press coverage of the launch). How these map to the new tiers is not stated by xAI in fetched pages. Paid tiers share one Grok usage pool across Grok apps, Grok on X and Cursor. |

**xAI Grok Build**

| Plan                        | Price                                                                                              | What it adds                                                                                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access through subscription | Included in the X Subscription / SuperGrok-class plans; exact tier gate not stated in fetched docs | Docs say the newest fast coding model is available only in Cursor and Grok Build, billed through your plan. Press said public beta opened to SuperGrok in May; not confirmed on an official page. |
| API key                     | pay-as-you-go via xAI API                                                                          | Set XAI_API_KEY in non-browser environments; custom models can be defined in config.                                                                                                              |

**xAI Grok Bot**

| Plan   | Price                                                                                                                                            | What it adds         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Access | Included with paid individual Cursor plans and Cursor Teams; or link an individual SuperGrok subscription; or a seat on self-serve Grok Business | Usage resets weekly. |

**Meta Meta AI**

| Plan                                                            | Price                                     | What it adds                                                                                                                             |
| --------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Free                                                            | $0                                        | Everyday Meta AI stays free; availability varies by region and account.                                                                  |
| Meta One Core                                                   | $7.99/month                               | Bundles the app subscriptions and gives more Meta AI image and video generation, Restyle and voice effects. No numeric limits published. |
| Meta One Premium                                                | $19.99/month                              | Everything in Core and the most room to create with Meta AI.                                                                             |
| Single-app plans (Instagram Plus, Facebook Plus, WhatsApp Plus) | $3.99, $3.99, $2.99 per month             | Per the newsroom table; post text elsewhere says from $2.99.                                                                             |
| Creator and business bundles (Essential, Advanced, Expert, Max) | from $14.99, $49.99, $149, $499 per month | Add Meta Business Agent capacity on WhatsApp, verified badge and analytics. Human support case limits scale by plan.                     |

**Meta Muse**

| Plan    | Price      | What it adds                                                                                               |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| Free    | $0         | Free with a usage limit; allowance not published.                                                          |
| Power   | $20/month  | 500M Muse tokens per week.                                                                                 |
| Maximum | $100/month | 3B Muse tokens per week. Muse and subscriptions are in limited testing and not available in all locations. |

**Meta Muse Code**

| Plan                                | Price                                                                                  | What it adds                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pay-as-you-go (Meta Model API)      | $0.15 cached input, $1.25 input, $4.25 output per 1M tokens (Spark 1.2 standard model) | Official figures from the Muse Code launch post.                                                                                                     |
| Contributor tier                    | rate limited by tokens over a rolling 5-hour window                                    | Select countries; requests may be used to improve Meta products.                                                                                     |
| Monthly subscriptions (three tiers) | reported $5, $15 and $50 per month                                                     | Meta's 2026-08-31 post confirms three monthly options but shows prices only in an image. Prices come from secondary coverage (Subscription Insider). |

**Manus Manus**

| Plan         | Price                                                                                          | What it adds                                                                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free         | $0                                                                                             | 300 daily credits for simple questions, 1 concurrent task, 2 scheduled automations.                                                                                         |
| Pro (tier 1) | from $20/month                                                                                 | From 4,000 monthly credits, 20 concurrent tasks, 20 scheduled automations, advanced research, website deployment, slides, Wide Research, beta early access. 17% off annual. |
| Pro (tier 2) | from $40/month with 7-day trial                                                                | From 8,000 monthly credits, same features and limits. Former Basic and Plus plans were renamed Pro.                                                                         |
| Team         | from $20 per seat/month                                                                        | Pooled credits (4,000 per seat base per Team page), SSO, training opt-out, usage analytics, access control, shared templates. Enterprise referenced in FAQ.                 |
| Add-ons      | credit packs (iOS: 2,000 credits for $20); Cloud Computer and Cue phone number sold separately | Add-on credits never expire. Phone usage counts toward the Cue weekly allowance.                                                                                            |

**Cursor Cursor**

| Plan       | Price                         | What it adds                                                                                                                               |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Free       | $0                            | Limited usage; no third-party models. Cursor pricing page (cursor.com/pricing) now shows plans combined with Grok and X.                   |
| Plus       | $8/mo ($80/yr)                | Cursor's own models at fixed settings; no Auto, no Cloud Agents, no third-party models.                                                    |
| Premium    | $30/mo ($300/yr)              | 4x Plus usage. Adds Cloud Agents, Automations, Bugbot, Origin hosting, third-party models at API list price from prepaid credit, Grok Bot. |
| Super      | $100/mo ($1,000/yr)           | 15x Plus usage; priority model access at peak times.                                                                                       |
| Ultra      | $200/mo ($2,000/yr)           | 50x Plus usage; earliest access to new products and models.                                                                                |
| Teams      | $30, $100 or $200 per seat/mo | Seat matches an individual tier; pooled usage; centralized billing, usage analytics, SSO, shared marketplace of rules/skills/plugins.      |
| Enterprise | Custom                        | Invoice/PO billing, SCIM, audit logs, service accounts, spend controls, repo/model/MCP access controls.                                    |

**Amazon Web Services Kiro**

| Plan       | Price         | What it adds                                                                                                                                                                                                                                                          |
| ---------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free       | $0            | 50 credits/mo; open-weight models and one premium model family, rate limited; teams of 2 to 500 listed                                                                                                                                                                |
| Pro        | $20/user/mo   | 1,000 credits; premium models; add-on credits $0.04 each                                                                                                                                                                                                              |
| Pro+       | $40/user/mo   | 2,000 credits                                                                                                                                                                                                                                                         |
| Pro Max    | $100/user/mo  | 5,000 credits                                                                                                                                                                                                                                                         |
| Power      | $200/user/mo  | 10,000 credits                                                                                                                                                                                                                                                        |
| Enterprise | Contact sales | Central billing, SSO, usage analytics, security controls; overages off by default, $0.04/credit when enabled. GovCloud about 20% higher and no free tier. $20 sign-up bonus on first paid upgrade via social login or AWS Builder ID. No daily or weekly rate limits. |

**Amazon Web Services Amazon Q Developer**

| Plan | Price       | What it adds                                                                                                                                                                                                                          |
| ---- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free | $0          | 50 agentic chat interactions/mo; 1,000 lines of code transformation/mo; IDE free tier Builder ID only. New Free Tier sign-ups blocked since May 15, 2026 per AWS announcement.                                                        |
| Pro  | $19/user/mo | Higher agentic limits; 4,000 LOC transformation per user pooled; $0.003 per extra line; admin dashboard, IP indemnity. New subscriptions blocked since May 15, 2026; existing subscriptions can add seats; support ends Apr 30, 2027. |

**Cognition Devin Desktop**

| Plan       | Price                                      | What it adds                                                                                                                      |
| ---------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Free       | $0                                         | Light quota, limited models, unlimited inline edits and Tab; up to 10 concurrent sessions; 1 member                               |
| Pro        | $20/mo                                     | Higher quotas, frontier and open-source models, free Cognition's own coding model, Devin Cloud access, extra usage at API pricing |
| Max        | $200/mo                                    | Pro with significantly higher quotas; unlimited concurrent sessions                                                               |
| Teams      | $80/mo team fee + $40/mo per full dev seat | Up to 200 users; sharing, central billing, admin analytics, priority support                                                      |
| Enterprise | Custom                                     | SAML/OIDC SSO, central admin, VPC deployment option, teamspace isolation                                                          |

**Cognition Devin**

| Plan       | Price                             | What it adds                                                                                                                                 |
| ---------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Free       | $0                                | Light agent quota; limited models; same plan table as Devin Desktop                                                                          |
| Pro        | $20/mo                            | Includes cloud agents (Devin Cloud); extra usage at API pricing                                                                              |
| Max        | $200/mo                           | Significantly higher quotas                                                                                                                  |
| Teams      | $80/mo + $40/mo per full dev seat | Up to 200 users; Slack, Teams, Linear, Jira, GitHub, GitLab, Bitbucket integrations                                                          |
| Enterprise | Custom                            | SSO, SCIM, audit logs, VPC deployment, dedicated support. Devin Review and agents consume ACUs on Enterprise (page does not give ACU prices) |

## 5. Continuity across surfaces and recent changes, per product

### OpenAI: ChatGPT

Across surfaces:

- Chat history syncs across web, desktop and mobile
- Work tasks start on desktop and continue on web or mobile when sync is on; if the computer is offline an eligible task continues in a cloud container without local file access
- Mobile app can remote-control a desktop host (Mac or Windows) by QR pairing
- Dots live in the cloud, reachable from mobile, desktop, calls, Slack and Microsoft Teams
- Plugins and skills shared between ChatGPT and Codex through one directory
- Memories and personalization carry across chats; Computer History is macOS only
- One account signs in to the Chrome extension, desktop app and Codex surfaces

Recent changes:

- 2026-10-20: Locked chats rolling out to Free, Go, Plus, Pro on web, iOS, Android and desktop ([source](https://help.openai.com/en/articles/6825453-chatgpt-release-notes))
- 2026-10-16: ChatGPT Slides for team editing in Space, rolling to eligible Pro users ([source](https://help.openai.com/en/articles/6825453-chatgpt-release-notes))
- 2026-10-15: New Live voices and a mini live voice model, adding French, German, Hindi, Japanese, Korean, Mexican Spanish ([source](https://help.openai.com/en/articles/6825453-chatgpt-release-notes))
- 2026-10-14: Previous-generation model retired from ChatGPT, Work and Codex on all plans (API unaffected) ([source](https://learn.chatgpt.com/docs/whats-new))
- 2026-10-12: iOS 'Your dot' widget and Shortcuts actions ([source](https://learn.chatgpt.com/docs/whats-new))
- 2026-10-07: New model generation with Intelligent UI (interactive visuals and tools in answers); Free and Go get the efficient tier ([source](https://help.openai.com/en/articles/6825453-chatgpt-release-notes))
- 2026-10-06: Audio uploads for transcripts and summaries on paid plans ([source](https://help.openai.com/en/articles/6825453-chatgpt-release-notes))
- 2026-10-05: DevDay week: dots, ChatGPT Space, Sites, Plugin Extensions, MCP Events, Sign in with ChatGPT trial, ChatGPT in Slack and Teams ([source](https://learn.chatgpt.com/docs/whats-new))
- 2026-08-09: ChatGPT Atlas browser stopped working; replaced by desktop built-in browser and Chrome extension ([source](https://help.openai.com/articles/20001371))
- 2026-07-09: Codex desktop app merged into one ChatGPT desktop app with Chat, Work and Codex ([source](https://learn.chatgpt.com/docs/whats-new))

### OpenAI: Codex

Across surfaces:

- One ChatGPT login covers desktop, web, mobile, CLI, IDE and cloud
- CLI and IDE extension share config.toml and MCP servers
- Tasks can be started on one surface and followed on another (mobile Remote, cloud handoff, IDE to cloud)
- Skills, plugins, AGENTS.md and subagents are shared between ChatGPT Work and Codex
- VS Code (via GitHub Copilot) can continue Codex conversations from the ChatGPT app, per GitHub's September VS Code release
- Usage draws from one plan allowance across surfaces; credits can be bought to extend

Recent changes:

- 2026-10-23: Codex CLI 0.164.0: ten /presets slots, inline /model and /permissions args, enterprise MCP account-grant auth, image previews ([source](https://github.com/openai/codex/releases))
- 2026-10-15: Codex CLI 0.163.0: searchable /config, steer a response in progress, /daemon restart, parallel read-only tools ([source](https://learn.chatgpt.com/docs/changelog))
- 2026-10-08: Faster steering of running Codex tasks in the desktop app ([source](https://help.openai.com/en/articles/6825453-chatgpt-release-notes))
- 2026-10-05: Ultrafast mode in Codex and Work for Pro $500 and eligible Enterprise/Edu; cloud environments; Codex Security Cloud research preview ([source](https://learn.chatgpt.com/docs/whats-new))
- 2026-08-10: Import from Claude Code, Claude Cowork and Cursor; Linux desktop app preview ([source](https://learn.chatgpt.com/docs/whats-new))
- 2026-07-09: Codex desktop app merged into the ChatGPT desktop app ([source](https://learn.chatgpt.com/docs/whats-new))

### Microsoft: Microsoft Copilot

Across surfaces:

- Chats, history and files carry over into the new Copilot experience
- Cowork tasks sync across mobile, web and the desktop app
- Work and personal conversations stay separate by account
- Edge Copilot shares memory and browsing history context when opted in
- Microsoft 365 subscription includes Copilot in Word, Excel, PowerPoint, Outlook and OneDrive

Recent changes:

- 2026-10-01: Copilot Code requirements page updated: Windows, Mac and web; personal Microsoft account supported ([source](https://learn.microsoft.com/en-us/copilot/code/code-requirements))
- 2026-09-25: New Copilot with Home (Chat plus Cowork), Code and Autopilot announced; Office files editable in the app ([source](https://blogs.microsoft.com/blog/2026/09/25/introducing-the-new-copilot-with-home-code-and-autopilot/))
- 2026-09-23: Cowork, Vision and CarPlay support listed for the Copilot app ([source](https://learn.microsoft.com/en-us/copilot/microsoft-365/release-notes))
- 2026-05-13: Edge Copilot Mode discontinued; features built into Edge; Actions renamed Browse with Copilot ([source](https://blogs.windows.com/msedgedev/2026/05/13/new-updates-to-edge-across-desktop-and-mobile/))

### Microsoft: Microsoft 365 Copilot

Across surfaces:

- Cowork tasks start on phone and continue in browser or desktop app
- One Microsoft Copilot app for web, desktop and mobile; Microsoft 365 Copilot app was renamed Microsoft Copilot
- Same Work IQ grounding and Enterprise Data Protection across surfaces
- Copilot panel redesigned to match the main app inside Teams and Outlook
- Admin controls in the Microsoft 365 admin center apply across web, desktop, mobile and Edge

Recent changes:

- 2026-10-06: Release notes: seamless search and chat, regenerate response, custom skills in PowerPoint, Cowork analytics ([source](https://learn.microsoft.com/en-us/copilot/microsoft-365/release-notes))
- 2026-09-25: New Copilot with Home, Code and Autopilot; Office editing inside the app; Ignite set for Nov 17-20 ([source](https://blogs.microsoft.com/blog/2026/09/25/introducing-the-new-copilot-with-home-code-and-autopilot/))
- 2026-09-23: Cowork browser use in local Edge documented (Edge 152, week of Aug 24 release) ([source](https://learn.microsoft.com/en-us/microsoft-365/copilot/cowork/cowork-local-browser))
- 2026-09-23: Release notes: Cowork on all platforms, Vision on desktop and mobile camera, CarPlay, Planner agent ([source](https://learn.microsoft.com/en-us/copilot/microsoft-365/release-notes))
- 2026-07-01: Copilot Business add-on promo price started, ends Dec 31 2026 ([source](https://www.microsoft.com/en-us/microsoft-365-copilot/pricing))

### GitHub: GitHub Copilot

Across surfaces:

- Agent session history syncs across CLI, VS Code, JetBrains, the Copilot app and github.com
- CLI, desktop app and SDK share dynamic workflows and local sandboxing
- Cloud agent can be started from github.com, mobile, IDE, CLI, Slack and Teams
- One credit-based allowance (1 credit = $0.01) covers chat, agent, review, cloud agent, CLI and the app
- Custom instructions, skills, agents and MCP servers carry across surfaces
- Enterprise managed settings and model policy API apply across surfaces

Recent changes:

- 2026-10-23: New GitHub app for Microsoft Teams combining notifications with Copilot; legacy app retires Nov 16 ([source](https://github.blog/changelog/2026-10-23-turn-notifications-into-code-with-github-copilot-in-teams/))
- 2026-10-15: Agentic autofix for code scanning alerts generally available ([source](https://github.blog/changelog/label/copilot/))
- 2026-10-14: HydraFusion updates and a new Max option ([source](https://github.blog/changelog/label/copilot/))
- 2026-10-07: Local sandboxing for Copilot generally available in CLI, app and VS Code Agent Host ([source](https://github.blog/changelog/2026-10-07-local-sandboxing-for-github-copilot-now-generally-available/))
- 2026-10-01: Computer use for desktop apps; dynamic workflows in CLI and the Copilot app ([source](https://github.blog/changelog/label/copilot/))
- 2026-10-01: VS Code September releases: Agents window automations, agent merge, PR creation from Copilot, Claude or Codex sessions ([source](https://github.blog/changelog/2026-10-01-github-copilot-in-vs-code-september-2026-releases/))

### Anthropic: Claude

Across surfaces:

- Chats, Cowork tasks, projects, connectors and skills carry over between web, desktop and mobile
- Memory is shared with Cowork only when Cowork runs in the cloud; local Cowork sessions do not use it
- Chrome side-panel sessions are saved and sync across surfaces
- Start a task on the phone and it runs in the cloud or is dispatched to the desktop app
- Claude Tag (public beta, Team and Enterprise only) puts @Claude into Slack channels with admin-governed access, billed from a usage balance
- Microsoft 365 (Excel, PowerPoint, Word, Outlook beta) and Google Workspace (beta) extensions and a Slack extension are listed on the download page

Recent changes:

- 2026-10-21: Claude Duet research preview: proactive agent app for Pro and Max (US first, waitlist), runs tasks on a cloud VM with its own browser, daily brief, 6,000+ connectors and plugins ([source](https://support.claude.com/en/articles/12138966-release-notes))
- 2026-10-07: Monthly API credits for Max and Team plans, claimed in billing settings by linking a Claude Console organization ([source](https://support.claude.com/en/articles/12138966-release-notes))
- 2026-09-25: Plugin developer portal for submitting plugins to the Claude directory ([source](https://support.claude.com/en/articles/12138966-release-notes))
- 2026-09-16: Cowork merged into every conversation on web, desktop and mobile (gradual rollout to Pro and Max); designs, decks and documents available in any conversation ([source](https://support.claude.com/en/articles/12138966-release-notes))
- 2026-09-15: Salesforce in Claude (beta) plugin for approved organizations ([source](https://support.claude.com/en/articles/12138966-release-notes))
- 2026-09-10: Smart reports (beta) for Enterprise usage, cost and friction analysis ([source](https://support.claude.com/en/articles/12138966-release-notes))

### Anthropic: Claude Code

Across surfaces:

- Same Claude Code engine on every surface, so CLAUDE.md, settings and MCP servers work across terminal, VS Code, JetBrains and desktop
- Extension and CLI share conversation history (claude --resume)
- claude --teleport pulls a cloud session into the terminal; /desktop continues a terminal session in the desktop app
- Remote Control lets phone or browser steer a local session
- Slack @Claude (Pro and Max) and Claude Tag (Team and Enterprise, public beta) send tasks from team chat
- Cloud sessions share usage limits with all other Claude usage

Recent changes:

- 2026-10-23: Claude Code 2.1.310: Monitor tool and plugin monitors on Bedrock, Vertex and Foundry; cloud sessions and Remote Control permissions in Enterprise custom roles ([source](https://code.claude.com/docs/en/changelog))
- 2026-10-21: Claude Code 2.1.307: /claude-api api-version command, new safety_event OpenTelemetry event, '@claude review stop' for Code Review ([source](https://code.claude.com/docs/en/changelog))
- 2026-10-19: Claude Code 2.1.304: /auto-mode-setup guided configuration; Pro and Max warned before resuming an inactive conversation that would use a large share of the five-hour limit ([source](https://code.claude.com/docs/en/changelog))
- 2026-09-16: Designs, decks and documents (Claude Design, Slides, Docs) available inside Claude Code conversations and the Artifacts tab ([source](https://support.claude.com/en/articles/12138966-release-notes))

### Google: Gemini app

Across surfaces:

- Chat history and memory sync across desktop, web and mobile on the same Google account
- Spark agent is reachable from the Gemini app, with a Mac app version; also by email per press coverage
- Google AI plans bundle storage, YouTube Premium tiers, Flow credits, Jules, Antigravity and Chrome auto browse with the Gemini app
- Gemini Live can be used in chat and with camera
- Skills are replacing Gems and carry across Gemini chat

Recent changes:

- 2026-10-13: Latest frontier model for Pro and Ultra; Antigravity coding agent can be started from the Gemini macOS app; new Customize section with skills and 40+ connected apps ([source](https://gemini.google/release-notes/))
- 2026-09-30: Skills in Gemini chat; Skills will replace Gems and existing Gems migrate automatically ([source](https://gemini.google/release-notes/))
- 2026-09-10: Gemini desktop app for Windows launched (Alt+Space) ([source](https://workspaceupdates.googleblog.com/2026/09/the-gemini-desktop-app-is-now-available-for-Windows.html))
- 2026-08-19: Student hub and study notebooks on mobile; free Pro or Plus for eligible students until Dec 31 ([source](https://gemini.google/release-notes/))
- 2026-05-19: Spark 24/7 agent introduced (Ultra, US beta); Ultra gets a $99.99 tier; Daily Brief; Omni video; Gemini Live merged into chat ([source](https://gemini.google/release-notes/))

### Google: Google Antigravity

Across surfaces:

- One Google sign-in gives the extensions, CLI and 2.0 app the same entitlements and rate limits
- Skills, rules, subagents and hooks are shared across the surfaces
- Settings sync between CLI and the 2.0 app
- Gemini macOS app can start an Antigravity coding agent from chat
- Antigravity SDK (Python, pip install google-antigravity) lets teams build custom agents on the same harness

Recent changes:

- 2026-10-13: Latest frontier model arrives in Antigravity for Google AI Pro and Ultra ([source](https://antigravity.google/blog))
- 2026-09-28: Custom agents in Google plugins ([source](https://antigravity.google/blog))
- 2026-08-21: Remote Control for Antigravity announced ([source](https://antigravity.google/blog))
- 2026-08-20: IDE extensions for VS Code, Visual Studio, JetBrains, Zed (and Xcode) and Antigravity coming to Gemini Enterprise ([source](https://antigravity.google/blog))
- 2026-06-18: Gemini CLI and Code Assist IDE extensions stop serving Google AI Pro, Ultra and free individual users; Antigravity is the replacement ([source](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/))
- 2026-05-19: Antigravity 2.0 desktop app and Antigravity CLI launched ([source](https://antigravity.google/blog))

### Google: Gemini CLI

Across surfaces:

- Extensions are renamed Antigravity plugins; skills, hooks and subagents carry over to Antigravity CLI

Recent changes:

- 2026-06-18: Stopped serving Google AI Pro, Ultra and free individual accounts ([source](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/))
- 2026-05-19: Transition to Antigravity CLI announced at I/O ([source](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/))

### Google: Gemini Code Assist

Across surfaces:

- Gemini Enterprise subscriptions now include Antigravity as the replacement developer tool

Recent changes:

- 2026-10-09: Google stopped selling new Gemini Code Assist Standard and Enterprise subscriptions and pointed buyers to Antigravity ([source](https://developers.google.com/gemini-code-assist/docs/deprecations))
- 2026-06-18: Consumer, AI Pro and AI Ultra access to IDE extensions ended ([source](https://developers.google.com/gemini-code-assist/docs/deprecations))

### Google: Jules

Across surfaces:

- Jules tasks started from the CLI appear in the web app (sessions are remote)
- Included in Google AI Pro and Ultra bundles alongside Antigravity

Recent changes:

- 2026-10-24: No dated Jules announcement found for Aug to Oct 2026 on Google pages; usage-limits page still lists older model names ([source](https://jules.google/docs/usage-limits/))

### Perplexity: Perplexity

Across surfaces:

- Ask threads and Computer tasks share one sidebar on desktop; work moves between web and desktop
- Remote Access starts, continues or monitors desktop work from another desktop, mobile or web
- Connectors, Skills, Memory and Brain are shared across Computer surfaces
- Computer reachable from email, Slack and Microsoft 365
- Credits drive Computer usage across all surfaces; credit packs sold in-app

Recent changes:

- 2026-10-19: Ultrafast model choices in Computer, Decisions API, role-based connector access ([source](https://www.perplexity.ai/changelog))
- 2026-10-05: Automations, inline visualizations, video generation in Computer, browser extension so Computer can use a desktop browser, Portable Computer on AMD, Effort Mode on mobile ([source](https://perplexity.ai/changelog))
- 2026-09-21: Effort Mode, Skills Marketplace, Side Chat, Hybrid compute on Mac, Portable Computer on NVIDIA ([source](https://perplexity.ai/changelog))
- 2026-08-24: Computer in Email, Always-ask connector approvals, Python Search SDK, API MCP server ([source](https://perplexity.ai/changelog))
- 2026-08-04: Personal Computer for Windows, shared Projects with files, Model Council ([source](https://perplexity.ai/changelog/shared-workspaces-personal-computer-for-windows-and-model-council))
- 2026-07-13: Brain memory, website publishing, Mac account switcher ([source](https://perplexity.ai/changelog/brain-faster-computer-models-website-publishing))

### Perplexity: Comet

Across surfaces:

- Browsing data syncs across Comet browsers on desktop and mobile
- Perplexity desktop app on Mac hands browser tasks to Comet by default
- Comet is the default browser for Computer's browser extension when installed

Recent changes:

- 2026-10-05: Computer browser extension names Comet as the default browser it drives ([source](https://perplexity.ai/changelog))
- 2026-03-18: Comet launched on iPhone (press coverage) ([source](https://engadget.com/apps/perplexitys-comet-ai-browser-is-now-available-for-iphones-183947569.html))
- 2025-11-20: Comet launched on Android (Wikipedia) ([source](<https://en.wikipedia.org/wiki/Comet_(browser)>))

### xAI: Grok

Across surfaces:

- One shared Grok model usage pool across Grok apps, the Grok tab on X and Cursor on paid X Subscription tiers; unused allowance carries over
- Grok Build and Grok Bot are included in subscription access (details in their entries)
- Grok Voice and Imagine are also sold as developer APIs

Recent changes:

- 2026-10-12: The X Subscription launched: Grok, Cursor and X Premium bundled into Free/Plus/Premium/Super/Ultra ([source](https://x.ai/news/x-subscription))
- 2026-10: Next-generation Grok Voice released and previous voice version deprecated on the API ([source](https://docs.x.ai/developers/release-notes))
- 2026-08: Grok Bot launched (persistent cloud teammates) ([source](https://docs.x.ai/developers/release-notes))

### xAI: Grok Build

Across surfaces:

- Same agent runs interactively, headless in CI and inside editors over ACP
- Compatible with Claude Code config and AGENTS.md so projects move without rewrites
- Grok Bot is linked from the Grok Build docs as the next step

Recent changes:

- 2026-09: Newest fast Grok coding model made available only in Cursor and Grok Build ([source](https://docs.x.ai/developers/release-notes))
- 2026-06-11: Official xAI plugin marketplace for Grok Build (per xAI blog listing in search results) ([source](https://x.ai/blog))
- 2026-05: Grok Build beta announced ([source](https://docs.x.ai/developers/release-notes))

### xAI: Grok Bot

Across surfaces:

- Bots are reachable by tagging @bot on X
- Bots share one cloud computer across desktop and mobile
- Included with Cursor plans, tying Grok Bot to the X Subscription bundle

Recent changes:

- 2026-08: Grok Bot available: persistent cloud teammates with messaging, approvals, connectors and routines ([source](https://docs.x.ai/developers/release-notes))

### Meta: Meta AI

Across surfaces:

- Meta AI app is the companion app for Meta AI glasses
- Meta AI appears in WhatsApp, Instagram, Messenger and Facebook; Muse Spark intelligence was announced for these surfaces in 2026
- Meta One subscription spans Instagram, Facebook, WhatsApp and Meta AI
- Muse, the personal agent, is a separate product that can also be messaged in WhatsApp

Recent changes:

- 2026-10-13: New Facebook tools to shape Feed and Reels by describing interests in words ([source](https://about.fb.com/news/))
- 2026-09: Meta One subscription launched across Facebook, Instagram, WhatsApp and Meta AI ([source](https://about.fb.com/news/2026/09/introducing-meta-one-subscription-service-more-features-ai/))
- 2026-07: Meta AI app and meta.ai gain planning, briefings, calendar and email connections and slide creation in select markets ([source](https://about.fb.com/news/2026/07/meta-ai-muse-spark-doesnt-just-think-it-acts/))

### Meta: Muse

Across surfaces:

- Same Muse account (Meta Account) across web, mobile and Mac
- Muse can be messaged in WhatsApp
- Coming to AI glasses in the coming months
- Part of Meta Enterprise Platform offering with Muse API, Meta Business Agent and Muse Code

Recent changes:

- 2026-10-23: Muse launched in Japan on iOS, Android and muse.ai ([source](https://about.fb.com/ja/news/2026/10/muse-personal-ai-agent-launches-in-japan/amp/))
- 2026-10-12: Muse Wonder models announced; will power Muse, subscribers first ([source](https://about.fb.com/news/2026/10/introducing-muse-wonder-models/))
- 2026-09-17: Muse for Mac beta released (press-reported date) ([source](https://betanews.com/article/meta-launches-a-muse-app-for-macos/))
- 2026-09-08: Muse launched in the US on iOS, Android and muse.ai ([source](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/))

### Meta: Muse Code

Across surfaces:

- Meta Model API offers an OpenAI SDK-compatible endpoint and model access for other coding agents
- Muse Code is listed in Meta Enterprise Platform alongside Muse and Muse API

Recent changes:

- 2026-10-12: Top Muse model available in Muse Code; the largest variant for Muse Code subscribers ([source](https://about.fb.com/news/2026/10/introducing-muse-wonder-models/))
- 2026-09-28: Meta Enterprise Platform launched; includes Muse agent, Business Agent, Muse API and Muse Code ([source](https://about.fb.com/news/2026/09/launching-meta-enterprise-platform/))
- 2026-08-31: Muse Code adds three monthly subscription options, workflows, rewind and an SDK preview ([source](https://dev.meta.ai/resources/blog/muse-code-new-plans-and-features/))

### Manus: Manus

Across surfaces:

- Web, desktop and mobile share projects, connectors, scheduled tasks and the cloud computer; phone can remote-control desktop or cloud computer
- Browser Operator extension bridges the agent to your logged-in browser
- Manus reachable from Slack and Telegram
- Ownership: Manus says Meta acquired it on 2025-12-29 and that it formally resumed independent operations on 2026-09-01 with its founding team leading. Some Manus compare pages still say 'now part of Meta'. A press report says China ordered the deal reversed on 2026-04-27 (not verified on an official page).

Recent changes:

- 2026-10-13: OPPO partnership to bring Manus agent features to phones ([source](https://manus.im/blog/manus-partners-oppo))
- 2026-10-01: Video Editor and Game Dev launched ([source](https://manus.im/blog/introducing-video-editor))
- 2026-09-29: Manus Flex lets users bring their own inference API key ([source](https://manus.im/blog/introducing-manus-flex))
- 2026-09-28: Manus 2.0: Manus Studio desktop, automations, Cloud Computer, Cue, remote control ([source](https://manus.im/blog/introducing-manus-2-0))
- 2026-09-01: Manus announced it resumed independent operations after the Meta period ([source](https://manus.im/blog/manus-resumes-independent-operations))
- 2026-08-11: Note to users: return to independent company; deletion of certain users' data created since 2025-12-29 for regulatory reasons, with back-up and restore windows ([source](https://manus.im/blog/a-note-to-our-users))

### Cursor: Cursor

Across surfaces:

- one weekly usage pool across desktop Agent, CLI, Cloud Agents and Grok apps
- agents can be started on desktop, CLI (&), web, iOS, Slack, GitHub/Bitbucket, Linear or API and tracked from web and mobile
- Slack: @Cursor launches cloud agents, infers repo, model and branch, posts PR link when done; needs usage-based pricing and linked accounts (Privacy Mode Legacy unsupported)
- GitHub, GitLab, Bitbucket, Azure DevOps: Bugbot reviews PRs, autofix by cloud agent; effort levels Low to High and Smart; usage-based billing
- Linear: @cursor starts cloud agents; Jira, Sentry, PagerDuty and webhooks as automation triggers
- iOS app remote-controls local desktop agents (Oct 2026)
- rules, skills, plugins and MCP configured once and shared across surfaces; Teams marketplace
- Grok Bot (AI teammates in cloud computers) shared with xAI; plan inclusion has moved between tiers, current pricing page lists it from Premium
- Cursor models co-trained with SpaceXAI; Cursor is sold inside The X Subscription

Recent changes:

- 2026-10-16: Cloud agents can build interactive canvases; beta Environments API; environments support up to 300 repositories ([source](https://cursor.com/changelog))
- 2026-10-13: Origin App Marketplace opens to public submissions from developer tool teams ([source](https://cursor.com/changelog))
- 2026-10-06: iOS app can show and respond to agents running on your computer (remote control) ([source](https://cursor.com/changelog))
- 2026-10 (date of reshape not stated): Plan lineup replaced with Free, Plus $8, Premium $30, Super $100, Ultra $200, Teams per-seat; pricing bundled with Grok and X. Acquisition by SpaceX reported by press; current closing status conflicts across secondary sources and was not confirmed from a primary source ([source](https://cursor.com/docs/account/pricing))
- 2026-09-23: Rollouts bot and Security Review bot launched ([source](https://cursor.com/changelog))
- 2026-09-10: Cursor Projects beta: coordinator agent delegates large work ([source](https://cursor.com/changelog))
- 2026-09-02: Self-hosted machines keep tool execution inside your network; team pools scale on demand ([source](https://cursor.com/changelog/page/2))
- 2026-08-17: Origin code hosting enters early beta for paid plans ([source](https://cursor.com/changelog/page/2))

### Amazon Web Services: Kiro

Across surfaces:

- Steering files, MCP, Powers, skills, models and cloud configuration shared across IDE, CLI and Web (details vary by surface; global steering is IDE only)
- Cloud sessions started in Web, IDE or CLI can be monitored from iOS preview
- Credits pool across surfaces; no daily or weekly rate limits; prepaid overages
- Sign-in with GitHub, Google, AWS Builder ID or IAM Identity Center; no AWS account needed
- Supports open standards: ACP, AGENTS.md, Skills, MCP
- Enterprise: SSO, usage dashboards, governance; Kiro console is the rebranded Amazon Q Developer console

Recent changes:

- 2026-10-23: Experimental support for a new small model with 1M-token context across IDE, CLI, Crew and Web; CLI 2.34.0 adds MCP input requests and memory deletion ([source](https://kiro.dev/changelog/))
- 2026-10-21: Several models (Claude, GPT families) become generally available; workflows start only when asked (CLI 2.33.1) ([source](https://kiro.dev/changelog/))
- 2026-10-20: CLI asks to trust a workspace before loading its configuration ([source](https://kiro.dev/changelog/))
- 2026-10-19: IDE 1.4.0 introduces Memory carrying context across chat sessions; later defaulted to Off in 1.4.10 ([source](https://kiro.dev/changelog/))
- 2026-10-16: Crew 0.9.0 adds crewmate profiles and usage estimates; previews per-crewmate dashboards and remote crews ([source](https://kiro.dev/changelog/))

### Amazon Web Services: Amazon Q Developer

Across surfaces:

- Relation to Kiro (official): AWS says Kiro is the successor; Q IDE plugins and paid subscriptions reach end of support April 30, 2027
- New Q Developer Free Tier accounts and new subscriptions blocked from May 15, 2026; existing subscriptions can still add seats
- Latest models available only on Kiro; Q Developer Pro dropped one model on May 29, 2026
- Kiro console is a rebrand of the Q Developer console; Q subscriptions are cancelled from the Q console enabled in Kiro settings
- AWS Console, docs sites, Console mobile app and Slack/Teams chat apps are not affected by the sunset

Recent changes:

- 2027-04-30: Scheduled end of support for IDE plugins and paid subscriptions (future) ([source](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/q-developer-ide-end-of-support.html))
- 2026-08-04: Kiro migration guide from Q Developer last updated ([source](https://kiro.dev/docs/upgrade-guides/migrating-from-q-developer/))
- 2026-05-29: One premium model removed from Q Developer Pro; newest models Kiro-only ([source](https://aws.amazon.com/blogs/devops/amazon-q-developer-end-of-support-announcement/))
- 2026-05-15: New Q Developer Free Tier accounts and subscriptions no longer available ([source](https://aws.amazon.com/blogs/devops/amazon-q-developer-end-of-support-announcement/))

### Cognition: Devin Desktop

Across surfaces:

- Sessions can move between local Devin Desktop and Devin Cloud with context preserved
- Plans, pricing and settings from Windsurf carried over to Devin plans (same Free, Pro, Max, Teams, Enterprise)
- Windsurf JetBrains plugin in maintenance; Devin over ACP recommended
- Sign in with a Devin account or API key; Sign in with ChatGPT for eligible ChatGPT plans (Sept 2026 Devin blog)

Recent changes:

- 2026-10-13: New Gemini model available in Devin Desktop and CLI at 75% off list through Oct 27 ([source](https://devin.ai/blog))
- 2026-10-07: New small Claude model joins Devin Fusion sidekick lineup ([source](https://devin.ai/blog))
- 2026-09-29: Sign in with ChatGPT lets eligible Plus or Pro plans power OpenAI models across Devin products ([source](https://devin.ai/blog))
- 2026-09-21: Cognition's own coding model research preview in agent selector; Devin Cloud sessions from terminal ([source](https://docs.devin.ai/release-notes/overview))
- 2026-06 (per secondary source): Windsurf editor renamed Devin Desktop; windsurf.com redirects to devin.ai ([source](https://devin.ai/desktop))

### Cognition: Devin

Across surfaces:

- Slack: @Devin in any channel starts sessions; two-way thread sync, mode keywords (!fast, !ultra, !fusion), /ask-devin, code channels, automations; Slack email must match Devin account
- Microsoft Teams works like Slack
- Linear and Jira ticket pickup; Devin is a native agent inside Jira (Sept 30, 2026); Pylon support starts investigations
- GitHub, GitLab, Azure DevOps, Bitbucket for PRs and Devin Review; GitHub comment /devin review
- Sessions move between web, Desktop and CLI (/open, /handoff, --resume)
- Memory across sessions (Oct 2026); Knowledge being migrated into skills
- Sign in with ChatGPT for eligible plans across Devin products

Recent changes:

- 2026-10-22: Open-source plugin that finds and patches repos affected by critical Node and PHP flaws, one PR per repo ([source](https://devin.ai/blog))
- 2026-10-21: Devin Review supports Bitbucket Cloud ([source](https://docs.devin.ai/release-notes/overview))
- 2026-10-19: Devin Oncall generally available to all organizations; Devin Review rules editor ([source](https://docs.devin.ai/release-notes/overview))
- 2026-10-09: Personal memory across sessions; session resume window shortened to 14 days ([source](https://docs.devin.ai/release-notes/overview))
- 2026-09-30: Devin is a native agent inside Jira ([source](https://docs.devin.ai/release-notes/overview))
- 2026-09-28: Devin up to 40% more cost-efficient across Fusion, Normal, Ultra and Review modes ([source](https://devin.ai/blog))
- 2026-09-21: Devin Cloud sessions from the terminal; Cognition's own coding model research preview ([source](https://devin.ai/blog/devin-cloud-in-your-terminal))

## 6. What could not be verified

- OpenAI and Microsoft: help.openai.com, chatgpt.com, openai.com and npmjs.com returned HTTP 403 to automated fetch, so ChatGPT release notes, Go/Plus help articles, Atlas retirement article and the Sora, Pulse, voice and apps help pages were not read directly. Release-note entries come from search-index snippets of the help center page and from OpenAI's own learn.chatgpt.com docs.
- OpenAI and Microsoft: Sora inside ChatGPT: secondary sources say the standalone Sora app and API were shut down in 2026; whether any video generation remains inside ChatGPT is unverified and not listed as a feature.
- OpenAI and Microsoft: Pulse: only a secondary report (June 2026) says it was discontinued and replaced by scheduled tasks; no official page read.
- OpenAI and Microsoft: ChatGPT Android: Google Play listing could not be fetched; Android features are inferred from OpenAI docs and release notes. Codex Remote on Android is not confirmed.
- OpenAI and Microsoft: ChatGPT Voice plan availability and limits beyond the desktop voice price were not confirmed from an official page.
- OpenAI and Microsoft: Consumer Microsoft Copilot: copilot.com and Microsoft pages blend consumer and work features. Official confirmation of consumer memory, Groups, Mico, Health, Learn Live and voice/vision limits was not obtained this session (only 2025 secondary coverage); Free-tier limits are not published on pages fetched. iOS and Android store listings returned 404.
- OpenAI and Microsoft: Microsoft Copilot Windows app specifics (taskbar, Copilot key, Copilot+ PC features) not researched beyond download page.
- OpenAI and Microsoft: Microsoft 365 Copilot enterprise price of $30 is from a combined marketing page; not cross-checked against licensing docs.
- OpenAI and Microsoft: GitHub Copilot: no official browser extension found; marked unknown rather than no. GitHub Copilot app GA or preview status not stated in docs.
- OpenAI and Microsoft: Codex IDE approval-mode picker labels are carried from the September repo research and were not re-verified this session.
- OpenAI and Microsoft: ChatGPT Chrome extension Web Store rating of 1.9 is a store snapshot, not an editorial claim.
- Anthropic and Google: Android store listings for Claude and Gemini could not be parsed by the fetcher; Android availability rests on Claude Code docs, Gemini release notes and press.
- Anthropic and Google: Gemini macOS app launch date (April 2026) and Spark details (VMs, email address) come from press and blogs, not a Google page; the release notes confirm Spark in beta for US Ultra.
- Anthropic and Google: Gemini in Chrome on Android and phone auto browse rest on press (9to5Google, Android Authority); Google's own Chrome page contradicts itself.
- Anthropic and Google: Antigravity: whether Remote Control reaches a phone, how /browser attaches to Chrome, and the CLI license are unconfirmed.
- Anthropic and Google: Jules: no mobile or VS Code surface found; model names on the usage-limits page look stale; the press-reported 'Jules V2' has no Google source.
- Anthropic and Google: Claude pricing table marks Cowork 'not listed' for Pro and Max while the help center and release notes say it is on paid plans; treated as documented but inconsistent.
- Anthropic and Google: VS Code minimum version differs between Anthropic docs (1.94.0) and the Marketplace page (1.98.0).
- Anthropic and Google: Gemini Code Assist Marketplace page shows no deprecation banner, and a Google developer FAQ reportedly says Standard and Enterprise access is unchanged, which may predate the Oct 9 sales end.
- Anthropic and Google: Exact free-tier usage numbers for Claude, Gemini and Antigravity are not published; only multipliers are given.
- Anthropic and Google: Claude Enterprise price shown on the pricing page ($20/seat plus usage) was not cross-checked on the Enterprise help page.
- Anthropic and Google: Did not check Claude Science or Claude Duet beyond one page each; Duet US waitlist availability may differ by country.
- Perplexity, xAI, Meta and Manus: Google Play listings for Perplexity, Grok, Meta AI and Manus returned no readable content, so Android store descriptions, update dates and download counts are unverified. Android availability rests on help centers, the Comet product page and press.
- Perplexity, xAI, Meta and Manus: x.ai pages (news index, grok product page), help.x.com and grok.com/plans were blocked or did not render; Grok web and plan-limit details rely on the iOS listing, the X Subscription page and docs.x.ai. Mapping from legacy SuperGrok tiers to the new X Subscription tiers is not stated in fetched official pages.
- Perplexity, xAI, Meta and Manus: No official source found for a Grok chat desktop app or any official Grok Chrome extension; the only desktop app xAI documents is Grok Bot's.
- Perplexity, xAI, Meta and Manus: Meta pages meta.ai, the Muse product page and Muse download page rendered only titles; Muse for Mac feature detail and Muse Code monthly prices ($5, $15, $50) come from press or secondary coverage. Muse for Mac minimum macOS and architecture are press-reported only.
- Perplexity, xAI, Meta and Manus: Relationship between the Meta AI app and Muse is not explained on any fetched official page; they are treated as separate products with separate plans.
- Perplexity, xAI, Meta and Manus: Meta AI desktop and Chrome surfaces and a Muse Chrome extension were not found; Meta did not publish numeric Meta AI limits for Meta One Core or Premium.
- Perplexity, xAI, Meta and Manus: Perplexity: no official desktop plan gating for local-file features, Remote Access or the browser extension; Comet plan gating and Comet iOS details are from press; the stale Comet Mobile App help article conflicts with the product page. Perplexity's pricing page annual-versus-monthly figures differ from App Store in-app prices ($17 and $167 annual versus $20 and $200).
- Perplexity, xAI, Meta and Manus: Spaces was not found by name in current Perplexity help pages (Projects is documented). Perplexity Labs appears on the iOS listing but no dedicated Labs page was read.
- Perplexity, xAI, Meta and Manus: Manus: current ownership per official posts is independent since 2026-09-01; the cause and terms of the separation are not stated in the fetched Manus posts. Reports of a regulatory reversal and buy-back talks come from press only. Manus pricing page itself did not render; plan figures come from the help center article, which is undated.
- Perplexity, xAI, Meta and Manus: No official CLI or VS Code extension was found for Perplexity, Meta AI, Muse, Manus; Grok Build has a CLI but only a community VS Code client.
- Perplexity, xAI, Meta and Manus: Model names were intentionally left out of feature lists; several changelog items are model launches that are not summarized here.
- AI coding tools: Cursor acquisition status: secondary sources conflict on whether the SpaceX/xAI purchase of Anysphere has closed; cursor.com docs only say Cursor is sold in The X Subscription and models are jointly trained with SpaceXAI. No primary press release was read.
- AI coding tools: Cursor Grok Bot plan gating changed between sources (press: Pro+ and Teams in Aug; pricing docs: Premium and up). Used the pricing doc.
- AI coding tools: cursor.com/pricing fetch returned only the X-style combined plan summary; per-plan Cursor usage figures beyond multipliers (4x, 15x, 50x Plus) and Bugbot/Cloud Agent prices were not found.
- AI coding tools: No official Chrome extension or AI browser found for Cursor, Kiro, Amazon Q Developer, Windsurf/Devin Desktop or Devin; recorded as unknown, not confirmed absent.
- AI coding tools: Kiro Free tier model list: pricing page names open-weight and one premium model family only; precise models not recorded per the no-versions rule.
- AI coding tools: Kiro Mobile and Devin Mobile: availability based on vendor pages (early access / waitlist); App Store or TestFlight listings not independently read. Cursor iOS listing URL is from the mobile page.
- AI coding tools: Amazon Q Developer GitHub app deprecation dates (new installs Nov 18, 2026; support ends Jan 30, 2027) came from a search snippet of AWS docs, page not fetched directly.
- AI coding tools: Windsurf rename date (June 2, 2026), Cascade retirement (July 1, 2026) and Cognition's July 2025 acquisition come from secondary sources; devin.ai/desktop confirms the rename and Cognition branding but not the date.
- AI coding tools: Windsurf VS Code, Vim and other plugin status: current docs list JetBrains only; VS Code extension status unconfirmed.
- AI coding tools: Devin per-plan feature matrix (Tab, DeepWiki, Ask Devin, API, concurrency) and ACU pricing not extractable from the pricing page; docs.devin.ai billing page returned 404.
- AI coding tools: Kiro enterprise docs moved to /docs/enterprise/concepts/ and were not read; enterprise controls recorded only from homepage and pricing page.
- AI coding tools: Amazon Q Developer new-signup cutoff dates were read from an AWS DevOps blog fetch; the older aws.amazon.com/blogs/news URL returned 404.
