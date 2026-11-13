# ChatGPT, Claude, Gemini and Perplexity compared

Status: Current research snapshot
Owner: Product research
Last updated: 2026-11-11
Verified: 2026-11-11
Coverage: official vendor pages read on 2026-11-11 (pricing pages read in a rendering browser), and the AGI Workforce repository at the same date

This file compares the four leading assistants (ChatGPT, Claude, Gemini, Perplexity) and their
coding products. It covers 18 dimensions, with AGI Workforce as a fifth column. It supersedes
`docs/research/competitor-surfaces-2026-10-24.md` for OpenAI, Anthropic, Google and Perplexity.
That file stays the record for the other vendors (Manus, xAI and others). Product decisions
still follow `docs/product/competitive-guidance.md`: before acting on any single claim here,
reopen the cited page. Vendor pages change weekly, and several changed during the week this file
was written.

## How to read this

**Evidence.** A cell with no label is _documented_: an official vendor page said so on
2026-11-11. Every other class is labelled:

| Label | Meaning                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------- |
| (obs) | Observed: read from a store listing or from a page in a rendering browser on 2026-11-11             |
| (ind) | Indirect: press, aggregator, or a search snippet of an official page that blocked automated reading |
| (car) | Carried: from the 2026-10-24 snapshot and not re-verified                                           |
| unk   | Unknown: no page read settles it. It means "not verified", not "absent"                             |

The four pricing pages were read in a rendering browser, and those readings settle conflicts
with other pages. help.openai.com, openai.com and chatgpt.com (except the pricing page) refused
automated reading, so most OpenAI help-center claims are (ind).

**Availability.** GA (generally available), rolling out, beta or preview, research preview,
waitlist, announced, sunsetting, retired. Plan and region limits are given where the vendor
states them.

**AGI column.** Facts come from the repository at 2026-11-11 and three read-only checks of
production. Two labels keep built work apart from released work:

- **Live**: on the production web app (agiworkforce.com). Production runs commit `a8e278c62e`,
  which is older than main, so a Web feature described from the tree may not be in production
  yet. This was not checked feature by feature.
- **Built**: present in code in this tree, but on a surface or path that no user can reach yet.
  Only Web is released. Desktop, Mobile, CLI, VS Code and Chrome are all built but not released.

Partial or degraded features are marked **Partial**. **Missing** means no code was found, or the
capability ledger records the feature as absent.

**AGI plan names.** This file uses the names in code: Free, Basic, Premium, Max, Ultra, Team,
Team Premium, Enterprise (`packages/contracts/types/src/billing-catalog.ts`). Production web
still runs an older build that shows **Pro, Max 5x and Max 20x** for Premium, Max and Ultra, so
the new names are not live yet.

Source IDs such as [O3] are listed in §21.

---

## 0. At a glance

- **The price ladder has converged on $0 / about $20 / $100 / $200.** ChatGPT: Plus $20, Pro
  $100 / $200 / $500. Claude: Pro $20, Max $100, Ultra $200. Gemini: Pro $19.99, Ultra $99.99 /
  $199.99. Perplexity: Pro $17 a month billed annually, Max $167 a month billed annually or $200
  monthly. Below $20, ChatGPT Go costs $8 and Google AI Plus costs $4.99. Only ChatGPT sells a
  $500 tier. AGI's tree matches the ladder: Basic $7, Premium $20, Max $100, Ultra $200.
  [O1][A1][G1][P1][X2]
- **No leader publishes consumer message counts.** Claude, Gemini and ChatGPT's Work and Codex
  meter use in a rolling five-hour window plus a weekly cap, expressed as multiples of a lower
  plan. Perplexity meters its agent in credits. Verified Claude Ultra and ChatGPT Pro have no
  five-hour limit. AGI publishes exact credit numbers per window. [O3][A1][G3][P4][X3]
- **Every leader sells extra usage once a limit is hit.** ChatGPT sells credits, Claude sells
  usage credits at API rates, Google sells AI credits (Pro and Ultra only), and Perplexity sells
  Computer credits. AGI's top-ups are built. [O3][A3][G4][P4][X3]
- **Each leader now has an agent mode beside chat:** ChatGPT Work, Claude Cowork (merged into the
  chat home), Gemini Tasks (beta, Pro and Ultra, not offered in the EEA, UK, Switzerland or
  Nigeria) and Perplexity Computer. Always-on agents are the new front: ChatGPT dots (Pro tiers),
  Perplexity Teammates (Max, research preview) and Claude Duet (waitlist). AGI Work is built.
  AGI has no persistent agent. [O8][A8][G3][P4][X6]
- **Native office editing is where AGI is furthest behind.** Claude Docs, Slides and Design are
  on every plan including Free. Claude Sheets and Whiteboards entered beta and Claude Data went
  GA on 2026-11-10. ChatGPT Space has Pages, Slides, Spreadsheets and Sites. Gemini has Canvas
  plus Gemini in Workspace. AGI generates Office files and artifacts but has no editor.
  [A13][O21][G2][X6]
- **Media generation splits sharply.** Google covers image, video and music on consumer plans.
  ChatGPT has images (Images 2.6, ind), and video after Sora's shutdown is unconfirmed. Claude
  offers no image, video or music generation. Perplexity has images on paid plans and limited
  video. AGI image generation is built; video has no live catalog model. [G1][O17][A15][P3][X7]
- **Coding is a three-player field.** OpenAI ships Codex across CLI, IDE, cloud, desktop and
  Remote. Anthropic ships Claude Code on the most surfaces. Google has consolidated on
  Antigravity: Jules shuts down 2026-12-31 and Gemini Code Assist is sunsetting. Perplexity has
  no coding product. AGI's CLI, VS Code extension and cloud code are built but not released.
  [O11][A10][G6][G7][P8][X11]
- **Computer use reaches Windows at OpenAI and Anthropic.** ChatGPT runs it on macOS and Windows,
  limited by region. Claude runs it on macOS and Windows as a research preview for Pro, Max and
  Ultra only. Perplexity runs local or hybrid Computer on Mac, Windows and Linux hardware.
  Gemini's API Computer Use tool went GA on 2026-10-30. AGI's computer use is experimental,
  macOS-only and unreleased. [O6][A10][P4][G8][X13]
- **Three of four leaders have their own browser.** The ChatGPT desktop app and Claude Desktop
  each have a built-in browser (Claude's is rolling out). Perplexity has Comet on Mac, Windows,
  iOS and Android, with a free version. Google has Chrome with Gemini built in. ChatGPT Atlas
  stopped working on 2026-08-09 (ind). AGI has no browser. [O7][A9][P1][G11]
- **Ads and training defaults diverge.** ChatGPT shows ads on Free and Go. Claude pledged to stay
  ad-free (ind). Google says Gemini chats are not used to show ads. Perplexity's privacy notice
  describes cookie-based targeted advertising, but its cookie banner says it does not sell
  third-party ads on its services. All four train on consumer data unless the user opts out.
  AGI has no ads and does not train models. [O1][A1][G3][P9][X9]
- **Enterprise entry prices differ widely.** ChatGPT Business: $20 a seat billed annually, or a
  $100 Premium seat. Claude Enterprise: $20 a seat plus usage at API rates. Gemini Enterprise:
  from $21 or $30. Perplexity Enterprise Pro: $40, or Max at $325. AGI holds no SOC 2, ISO 27001
  or HIPAA attestation. [O2][A1][G1][P3][X9]
- **Surface reach is AGI's largest gap.** All four leaders ship web, macOS, Windows, iOS and
  Android. AGI has only Web released, and its Desktop is packaged for macOS only. [X1][X4]
- **Multi-vendor model access.** Perplexity Max carries GPT-6 Astra, Gemini 4 Carbon, Claude Opus
  5.5 and Claude Fable 5.2. Google resells Claude in Antigravity and Gemini Enterprise. AGI's
  catalog holds 394 records in 28 family slots, routed by Auto. [P5][G6][X5]
- **The leaders churn their products.** Within this window, OpenAI retired Atlas, Sora, Pulse and
  group chats, and announced the retirement of Advanced and Standard Voice. Google renamed Gems
  to Skills and closed Jules. Anthropic renamed Max 20x to Ultra. Any parity target needs a date
  next to it. [O17][G7][A3]

### Dimension matrix

| #   | Dimension         | ChatGPT                                               | Claude                                              | Gemini                                                    | Perplexity                                     | AGI                                                       |
| --- | ----------------- | ----------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| 1   | Surfaces          | Web, Mac, Win, iOS, Android, CLI, IDE, ext, browser   | Web, Mac, Win, Linux beta, mobile, CLI, IDE, Chrome | Web, Mac, Win, mobile, Chrome, CarPlay (ind), Antigravity | Web, Mac, Win, Linux (Portable), mobile, Comet | Web live; five others built, not released                 |
| 2   | Plans             | Free, Go $8, Plus $20, Pro $100/200/500               | Free, Pro $20, Max $100, Ultra $200                 | Free, Plus $4.99, Pro $19.99, Ultra $99.99/$199.99        | Free, Pro $17 (annual), Max $167 (annual)/$200 | Free, Basic $7, Premium $20, Max $100, Ultra $200         |
| 3   | Limits            | 5-hour + weekly on Work/Codex; Free "unlimited" text  | 5-hour + weekly multiples; Ultra no 5-hour          | Compute-based, 5-hour + weekly                            | Credits for Computer; weekly search caps       | Exact credits: 5-hour, weekly, monthly                    |
| 4   | Models            | GPT-6 Astra, 6.1 Sol, 6.1 Terra, 6 Luna               | Fable 5.2, Opus 5.5, Sonnet 5.5, Haiku 5.5          | 4 Argon, 4 Carbon, 3.8 Flash, Flash-Lite                  | Multi-vendor; "Best" auto                      | 394-record catalog, Auto routing                          |
| 5   | Chat              | Chat/Work toggle, locked chats (car)                  | Chat/Cowork in one box, incognito, search           | Import from other AIs, Takeout                            | Incognito, public sessions, Pages              | Branching, temp chat, share (live web)                    |
| 6   | Creation          | Space, Sites, Images 2.6; no video                    | Docs/Slides/Design free; Sheets, Whiteboards, Data  | Canvas, image, video, music, Genie                        | Files and apps, images, limited video          | Artifacts, Office files; video blocked                    |
| 7   | Search/research   | Web search, deep research                             | Web search on Free; Research on Pro+                | Deep Research on Free; AI Mode                            | Cited answers, Research, Model Council         | Search + Deep Research (Premium+)                         |
| 8   | Memory/projects   | Memories, Computer History (Mac), Projects            | Memory on by default, Projects, import              | Memory, Personal Intelligence, Notebook                   | Memory, Brain (Max), Projects                  | Memory with import, Projects                              |
| 9   | Voice             | GPT-Live; old voices retire 12-11 (ind)               | Voice mode beta, all plans (ind)                    | Gemini Live with camera                                   | Voice on web and Mac (Pro/Max)                 | Live voice built; OpenAI Live slot                        |
| 10  | Agents            | Work, dots, computer use, scheduled tasks             | Cowork, Duet (waitlist), computer use, Dispatch     | Tasks beta, auto browse, scheduled actions                | Computer, Teammates, Automations               | AGI Work, approvals, schedules; computer use experimental |
| 11  | Extensibility     | Plugins (skills + MCP), connectors                    | Plugins, skills, MCP Apps, 6,000+ marketplace       | 40+ apps, Gems to Skills 11-17                            | Plugins, skills, connectors                    | Skills GA, plugins beta; connectors gated to 13           |
| 12  | Coding            | Codex CLI, IDE, cloud, review                         | Claude Code on every surface                        | Antigravity; Jules, Code Assist ending                    | None                                           | CLI, VS Code, cloud code: built                           |
| 13  | Enterprise        | Business $20/$25, Premium seat, Enterprise            | Team $20/$25, Enterprise $20 + usage                | Workspace, Gemini Enterprise $21/$30                      | Enterprise Pro $40, Max $325                   | Console with SSO, SCIM, audit (web)                       |
| 14  | Privacy/safety    | Ads on Free/Go; opt-out training; teen controls (ind) | No ads; opt-out; 18+                                | No ads from chats; 18-month auto-delete                   | Targeted ads per notice; opt-out conflict      | No ads; no AGI training; 13+                              |
| 15  | Commerce          | iOS Plus $19.99; card/device caps (ind)               | iOS about 25% higher; 7-day refunds in 4 countries  | Monthly-only Ultra; refunds where law requires            | Refund windows by region; arbitration          | Stripe web only; 7-day refund; no IAP in v1               |
| 16  | API               | Astra $10/$50, 1.05M context                          | Fable 5.2 $8/$40, Opus 5.5 $4/$20                   | Argon/Carbon $2/$10, doubling 12-01                       | Agent API resells models; Search $5/1K         | Gateway API on Premium+, credit-billed                    |
| 17  | Changes in window | Terra, Images 2.6, Pro limits doubled                 | Fable 5.2, Ultra, Sheets/Data, enterprise controls  | Carbon GA, plugin marketplace, Jules end                  | Teammates, local Mac Computer, voice           | 1,167 commits; nothing new released                       |
| 18  | Main weakness     | Undisclosed limits, ads, retirements                  | No media generation; Fable outside Pro limits       | Region exclusions, name churn                             | Credits split from Ask; doc conflicts          | Five of six surfaces unreleased                           |

---

## 1. Surfaces and platforms

| Surface        | ChatGPT                                                                            | Claude                                                                       | Gemini                                                                   | Perplexity                                                          | AGI                                                                               |
| -------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Web            | chatgpt.com, Chat/Work toggle [O5]                                                 | claude.ai [A2]                                                               | gemini.google.com [G1]                                                   | perplexity.ai [P2]                                                  | Live; PWA, guest chat behind a flag [X1]                                          |
| macOS          | Desktop app with Chat, Work, Codex modes [O5]                                      | Universal app [A2]                                                           | macOS 15+, Apple Silicon [G2]                                            | Personal Computer, macOS 15+; Comet [P4][P1]                        | Built (Electron, dmg arm64/x64), not released [X4]                                |
| Windows        | GA [O5]                                                                            | x64, arm64, Microsoft Store [A2]                                             | Windows 10+, since 2026-09-10 [G2]                                       | Windows 10 1809+ or 11; Comet [P4][P1]                              | Missing: not packaged [X4]                                                        |
| Linux          | Quickstart lists it; maturity not stated; preview on 10-24 (car) [O5]              | Beta (Ubuntu/Debian); Code and Cowork need a paid plan [A2]                  | No Gemini app found; Antigravity runs on Linux [G6]                      | Portable Computer on Ubuntu (NVIDIA RTX) or DGX OS [P4]             | Missing for Desktop; CLI built for Linux [X11]                                    |
| iOS / iPadOS   | iOS 18+, iPad, visionOS; v1.2026.307 (obs) [O14]                                   | iOS 18+; v1.261109.19; 18+ rating (obs) [A15]                                | Yes [G1]                                                                 | iOS 18+; v26.44.0; 18+ rating [P10]                                 | Built (Expo, tablet layouts), not released [X12]                                  |
| Android        | Yes; Play listing unreadable (ind) [O6]                                            | Yes; Play listing unreadable (ind) [A2]                                      | Yes [G1]                                                                 | Yes; default-assistant mode [P6]                                    | Built, not released [X12]                                                         |
| CLI            | Codex CLI, macOS/Linux/Windows; 0.167.1 (obs) [O11][O16]                           | Claude Code; macOS, Linux, WSL, Windows [A10]                                | Antigravity CLI `agy` 1.5.6; Gemini CLI 0.68.0 [G7]                      | None found [P8]                                                     | `agi` built for macOS/Linux/Windows; installer stops until a signed release [X11] |
| VS Code        | Codex extension; also Cursor, Windsurf; 16.7M installs (obs) [O15]                 | Extension 2.1.322; 30.0M installs (obs) [A15]                                | Antigravity extension, VS Code 1.90+ [G6]                                | None found [P8]                                                     | Built, not released; drives the CLI [X11]                                         |
| JetBrains      | Through JetBrains' built-in agent picker [O11]                                     | Plugin (beta) [A10]                                                          | Antigravity extension (preview for enterprise) [G6]                      | None found                                                          | Through ACP from the CLI (built); no plugin [X11]                                 |
| Chrome ext     | "ChatGPT" for Chrome, Edge, Brave, Opera, Vivaldi; 9M users, 2.9/5 (obs) [O7][O15] | Claude in Chrome, paid plans, Chrome only; 22M users, 3.5/5 (obs) [A9][A15]  | Built into Chrome, no extension; regions limited [G11]                   | Extension for Computer (car); Comet is the main browser [P7]        | MV3 side panel built; no store item exists [X11]                                  |
| Own browser    | Built-in browser in desktop app; Atlas retired 2026-08-09 (ind) [O7][O19]          | Built-in browser in Desktop for Cowork, rolling out [A9][A8]                 | Chrome                                                                   | Comet: Mac, Windows, iOS, Android; free version promised (obs) [P1] | Missing                                                                           |
| Office add-ins | Excel and Sheets GA (ind); one listing covers Excel, Word, PowerPoint (ind) [O18]  | Excel, PowerPoint, Word GA; Outlook and Google Workspace beta [A16][A2]      | Gemini inside Gmail, Docs, Sheets, Slides, Drive, Meet, Chat, Vids [G10] | unk                                                                 | Missing [X6]                                                                      |
| Slack / Teams  | ChatGPT in Slack and Teams, rolling out; dots reachable from both [O10][O8]        | Claude Tag on Slack (beta, Team/Enterprise); Claude Code in Slack [A16][A10] | Google Chat in Workspace; Slack unk [G10]                                | Computer in Slack and Teams; Teammates tagged in Slack [P6]         | Slack partial (web/API); Teams missing [X6]                                       |
| API            | Responses, Agents (beta), Realtime, Images, Batch [O13]                            | Claude API, Bedrock, Google Cloud, Foundry, Platform on AWS [A11]            | Gemini API / AI Studio, Agent Platform [G8]                              | Search, Agent, Decisions, Embeddings [P8]                           | Live with Web: OpenAI-compatible, 30 paths; routes not tested one by one [X1]     |
| Other          | iMessage/RCS texting to dots (Pro US beta); Apple Messages plugin [O10][O9]        | Duet app (waitlist); Claude Science desktop (beta) [A13][A2]                 | CarPlay rolling out (ind); Pixel 10 Gemini features (ind) [G12]          | Computer in Email; Android Assistant; Draw to Search [P4][P6]       | No email, watch, car or speaker surfaces [X6]                                     |

---

## 2. Plans and prices

US prices, monthly, unless stated. All four lead pricing pages were read in a rendering browser.

### ChatGPT [O1][O2][O3][O14]

| Plan                   | Monthly            | Annual                  | India                                 | What it adds                                                                                                    |
| ---------------------- | ------------------ | ----------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Free                   | $0                 | n/a                     | n/a                                   | Unlimited text chats with GPT-6 (abuse guardrails); limited uploads, images, voice, deep research; may show ads |
| Go                     | $8                 | not listed              | INR 399 at launch (ind, may be stale) | More messages, tools, uploads, images, longer memory; "may include ads" (obs)                                   |
| Plus                   | $20 (iOS $19.99)   | not listed              | INR 1,999 (ind, may be stale)         | Advanced reasoning, Projects, scheduled tasks, custom GPTs, expanded Codex, Work on all surfaces (obs)          |
| Pro 100 / 200 / 500    | $100 / $200 / $500 | not listed              | INR 19,900 for "Pro" (ind, stale)     | GPT-6 Astra Pro reasoning, dots, unlimited faster images, monthly API credits; Ultrafast on $500 only           |
| Business Standard seat | $25                | $20 per seat per month  | unk                                   | 2–200 seats, SAML SSO, MFA, no training by default, Space, connectors (obs)                                     |
| Business Premium seat  | $125               | $100 per seat per month | unk                                   | More usage, no five-hour limit, dots (obs)                                                                      |
| Enterprise / Edu       | sales              | sales                   | unk                                   | SCIM, EKM, RBAC, Compliance API, audit logs, residency, priority processing                                     |

Also: ChatGPT for Teachers is free for verified US K–12 educators through June 2027, and
nonprofits get up to 75% off Business or Enterprise (obs) [O1]. Plus, Pro and Business can claim
up to $500 a month in API credits, rolled out 2026-10-28 [O13]. Paid accounts are capped per
device and per card, with the numbers undisclosed; the cap started about 2026-11-01 (ind) [O19].

### Claude [A1][A3][A4][A15]

| Plan                | Monthly            | Annual                                      | India (July press, ind)                  | What it adds                                                                                                       |
| ------------------- | ------------------ | ------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Free                | $0                 | n/a                                         | n/a                                      | Chat, web search, code execution, memory, connectors, Artifacts, Docs/Slides/Design, 5 Projects, voice             |
| Pro                 | $20 (iOS $20)      | $17 a month ($200 up front; iOS $214.99)    | about Rs 2,000 annual / Rs 2,399 monthly | Claude Code, Research, Opus, Chrome, Microsoft 365, Science, Data, Sheets/Whiteboards beta; Fable on usage credits |
| Max (was Max 5x)    | $100 (iOS $124.99) | monthly only                                | Rs 11,999 (as Max 5x)                    | 5x Pro per 5 hours and per week; Fable up to 50% of weekly; $100/month API credits                                 |
| Ultra (was Max 20x) | $200 (iOS $249.99) | monthly only                                | Rs 23,999 (as Max 20x); not re-priced    | 10x Pro weekly; no 5-hour limit if verified; $200/month API credits                                                |
| Team Standard seat  | $25                | $20                                         | Rs 2,999 / Rs 2,399                      | 2–150 seats; SSO, domain verification, Claude Tag, enterprise search, Motion                                       |
| Team Premium seat   | $125               | $100                                        | unk                                      | 5x standard seat usage (pricing page); Fable 50% of weekly                                                         |
| Enterprise          | n/a                | $20 per seat per month + usage at API rates | unk                                      | 20-seat minimum self-serve; RBAC, SCIM, audit logs, Compliance API, HIPAA-ready, inference hooks                   |
| Education           | sales              | sales                                       | unk                                      | University-wide, learning mode, API credits; price not published                                                   |

Also: no standing discounts on individual plans [A3]. The GSA partnership gives government
partners 40% off (2026-10-27) [A14]. iOS usage-credit packs run from 20 credits for $20 to
1,000 credits for $700 (obs) [A15].

### Gemini [G1][G4][G10]

| Plan                           | Monthly                                 | Annual                            | India                | What it adds                                                                                            |
| ------------------------------ | --------------------------------------- | --------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| Free                           | $0                                      | n/a                               | n/a                  | Flash-Lite, image generation and editing, Deep Research, Live, Canvas, Gems, Notebook, 15 GB (obs)      |
| Google AI Plus                 | $4.99                                   | not published                     | Rs 399               | Flash, 2x Free usage, video generation, Daily Brief, 200 Flow credits, Gemini in Gmail and Vids, 400 GB |
| Google AI Pro                  | $19.99                                  | $199.99                           | Rs 1,950             | 4 Argon, 4x Free, 1M context, Antigravity, Chrome auto browse, YouTube Premium Lite, 5 TB               |
| Google AI Ultra (5x / 20x)     | $99.99 / $199.99                        | monthly only                      | Rs 6,500 / Rs 19,500 | Argon and Carbon, first access to Tasks, Project Genie, YouTube Premium, 20 TB+                         |
| Workspace Starter / Std / Plus | $7 / $14 / $22 per user from 2027-02-25 | "save 16%" on a 1-year commitment | unk                  | Gemini app in all editions; Gemini in Docs/Sheets/Slides from Standard                                  |
| Gemini Enterprise Business     | from $21 per seat                       | unk                               | unk                  | SaaS at business.gemini.google; 25 GiB per user                                                         |
| Gemini Enterprise Std / Plus   | from $30 per seat                       | unk                               | unk                  | Data residency, CMEK, VPC-SC; Antigravity seat credits $10 / $15                                        |

Also: AI Pro is free for one year for eligible US college students who redeem by 2026-12-31.
Plans can be shared with up to five others. Workspace intro pricing is 20% off from 2026-11-25
[G4][G10]. Ultra's top tier fell from $250 to $200, and a $100 tier was added on 2026-05-19 [G5].

### Perplexity [P1][P2][P3][P10]

| Plan           | Monthly                           | Annual                       | India                                                        | What it adds                                                                      |
| -------------- | --------------------------------- | ---------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Free           | $0                                | n/a                          | n/a                                                          | Cited search, basic models, 3 Pro Searches a day, 1 research query a month, Comet |
| Pro            | not on web; iOS $20               | $17 a month billed annually  | No INR price; USD only; press cites about Rs 17,000/yr (ind) | Model choice, extended Research, image generation, 4,000 bonus credits (obs)      |
| Max            | $200                              | $167 a month ($2,000 a year) | unk                                                          | Frontier models, Model Council, Teammates, Brain, 10,000 monthly credits          |
| Education Pro  | $10 (one article omits the price) | unk                          | unk                                                          | Everything in Pro, verified through SheerID                                       |
| Enterprise Pro | $40 per seat                      | $400 per seat                | unk                                                          | SSO, SCIM, audit logs; no API access                                              |
| Enterprise Max | $325 per seat                     | $3,250 per seat              | unk                                                          | Higher quotas, 15 videos a month, Comet Max Assistant                             |

Also: a limited-time offer adds $40 (Pro) or $450 (Max) of free Computer credits (obs) [P1].
Trials require a card [P3]. Enterprise gets 25% off for education, nonprofit and government
organisations [P3].

### AGI Workforce [X2][X1]

| Plan (tree / production label) | Monthly  | Annual                                             | India (incl. 18% GST) | What it adds (capability gate)                                                     |
| ------------------------------ | -------- | -------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| Free / Free                    | $0       | n/a                                                | n/a                   | Cloud chat, chat tools, projects, memory, skills, sync; Auto only                  |
| Basic / Basic                  | $7       | none                                               | Rs 399                | Connectors, remote control                                                         |
| Premium / "Pro"                | $20      | withdrawn 2026-09-27; existing subscribers keep it | Rs 1,999              | AGI Work, Deep Research, image generation, cloud API, CLI and VS Code cloud, Slack |
| Max / "Max 5x"                 | $100     | none                                               | Rs 9,999              | Frontier models (OpenAI frontier, Fable, Opus, Grok)                               |
| Ultra / "Max 20x"              | $200     | none                                               | Rs 19,999             | Video generation; no 5-hour cap                                                    |
| Team seat (min 2)              | $25      | $240 per seat                                      | Rs 2,499 / Rs 23,988  | Team admin                                                                         |
| Team Premium seat              | $125     | $1,200 per seat                                    | n/a                   | Max-level credits per seat                                                         |
| Enterprise                     | contract | contract                                           | contract              | SSO, SCIM, admin controls                                                          |

AGI has no trial and no student offer. Local Mode and Local + BYOK are free [X2].

**Convergence.** Every vendor has a free tier, a tier near $20, a tier at $100 and a tier at
$200. ChatGPT adds a $500 tier, and Google and ChatGPT add cheap tiers at $4.99 and $8. Two
leaders bill the $100 and $200 tiers monthly only (Claude, Google). Perplexity shows annual
billing on its web pricing page. AGI bills individual plans monthly only.

---

## 3. Usage limits

| Item              | ChatGPT                                                                                                      | Claude                                                                                 | Gemini                                                                            | Perplexity                                                                            | AGI                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Windows           | Work and Codex: 5-hour + possible weekly; Pro has no 5-hour limit; Free text chat "unlimited" (obs) [O3][O1] | 5-hour session + weekly, one pool across chat, Code, Desktop [A3]                      | Compute-based; refresh every 5 hours up to a weekly cap; then Flash-Lite [G3][G1] | Weekly Pro Search caps; monthly Research and Comet caps; Computer on credits [P3][P4] | Rolling 5-hour, weekly, monthly credit windows [X3]                                                                                  |
| Multipliers       | Plus 5-hour estimates, e.g. 6.1 Sol 15–160, Astra 5–45 messages; Pro doubled 10-29 (ind) [O3][O18]           | Max 5x, Ultra 10x weekly; Team Premium 5x standard (obs) [A1]                          | Plus 2x, Pro 4x Free; Ultra 5x or 20x Pro [G3]                                    | Enterprise Pro: 400 Pro Searches a week, 50 research a month; Max: no numbers [P3]    | Free 2/15/20; Basic 10/100/400; Premium 50/500/2,000; Max 250/2,500/10,000; Ultra none/5,000/20,000 credits (5-hour/week/month) [X3] |
| Top model share   | Ultrafast only on Pro $500 [O3]                                                                              | Fable: up to 50% of weekly on Max, Ultra, premium seats; credits only on Pro [A5][A1]  | At the cap, top models drop to smaller ones [G3]                                  | Max-only models [P5]                                                                  | Flagship models up to 30% of the weekly budget [X3]                                                                                  |
| Context window    | Instant 27K Free / 54K Go and Plus / 128K Pro; reasoning up to 400K Pro; Work and Codex 500K (obs) [O1][O4]  | "Up to 1M, varies by model" on all plans (obs) [A1]                                    | Free 32K, Plus 128K, Pro and Ultra 1M [G3]                                        | unk                                                                                   | Model-bound, top models 1.0M–1.05M; no plan cap [X5]                                                                                 |
| Uploads           | unk (Free Library 500 MB in Aug, ind) [O18]                                                                  | 500 MB per file, 20 files per chat, PDFs to 1,000 pages; project files 30 MB [A6]      | 10 files per prompt, 100 MB (video 2 GB); 1,500 pages (obs) [G3][G1]              | 40 MB per file, weekly allowance; Projects 5 GB, 100 MB per file [P6]                 | 25 MB per file; 10 per message (Free), 20 (paid) [X3]                                                                                |
| Top-ups           | Credits: iOS packs 100 for $4 to 1,000 for $40 (obs) [O14]                                                   | Usage credits at API rates; credits bought from 2026-12-07 expire after 12 months [A3] | AI credits for Pro and Ultra (Flow, Antigravity; app "coming soon") [G4]          | 100 credits = $1; auto-refill off by default; Max cap $200, adjustable to $5,000 [P4] | $20–$1,000, 50 credits per USD, 5–30% volume discounts, auto-reload (built) [X3]                                                     |
| Resets and extras | Usage visible in Settings > Usage (ind) [O18]                                                                | Limit resets (Max, Team); wrap-up allowance in Code [A3]                               | none documented                                                                   | Weekly included usage on Pro (rolling out) [P4]                                       | Promotional uplifts and referral resets (built) [X3]                                                                                 |
| How users see it  | Settings > Usage (ind)                                                                                       | Settings > Usage bars; `/status` [A3]                                                  | No meter documented for the app; `/usage` in Antigravity [G6]                     | perplexity.ai/account/usage with per-task cost [P4]                                   | Meters by model and feature; Free sees only Upgrade (owner rule) [X6]                                                                |
| Agent-specific    | dots chat does not count; tasks do [O8]                                                                      | Cloud scheduled tasks 100 runs an hour per account [A10]                               | Tasks: 15 concurrent [G3]                                                         | Automations every 15 minutes at most; skipped runs pause the task [P4]                | Scheduled tasks: Free 0, Basic 2, Premium 5, Max 10, Ultra 25 [X2]                                                                   |

AGI production differs from the tree on concurrency and storage. The tree allows 1/3/5/10
concurrent chats (Basic/Premium/Max/Ultra); production shows 2/4/8/12 (obs). The tree gives Max
50 GiB of storage and Ultra 100 GiB; production shows 62 GB and 124 GB for Max 5x and Max 20x
(obs) [X1][X2].

---

## 4. Models in the consumer product

Dated line-up as of 2026-11-11. Model names change faster than anything else in this file.

| Item              | ChatGPT                                                                                             | Claude                                                                                     | Gemini                                                                            | Perplexity                                                                            | AGI                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Top line-up       | GPT-6 Astra, GPT-6.1 Sol, GPT-6.1 Terra (Work/Codex only, not Chat), GPT-6 Luna, GPT-6 Sol [O4][O1] | Fable 5.2, Opus 5.5, Sonnet 5.5, Haiku 5.5; Mythos 5.2 restricted [A11]                    | Gemini 4 Argon, 4 Carbon (Ultra, rolling out), 3.8 Flash, 3.5 Flash-Lite [G3][G5] | Max: GPT-6 Astra, Gemini 4 Carbon, Opus 5.5, Fable 5.2 [P5]                           | 394 catalog records; 28 family slots (OpenAI, Anthropic, Google, DeepSeek, Qwen, Kimi, Grok, GLM, MiniMax) [X5] |
| Free              | GPT-6 for text (obs); Luna in desktop Work [O1][O4]                                                 | Sonnet and Haiku only [A1]                                                                 | Auto only (Flash-Lite mostly), no manual switch since 10-09 (ind) [G12][G3]       | "Best" plus limited Pro Searches; no manual choice [P5]                               | Auto only, economy profile, time-boxed model promotion [X5]                                                     |
| Mid tier          | Plus: GPT-6 reasoning; Astra Extra High missing on some plans [O4]                                  | Pro: adds Opus; Fable on credits [A1]                                                      | Plus: "Flash" (obs); Pro adds Argon [G1]                                          | Pro: GPT-6.1 Sol, Gemini 3.8 Flash, Sonnet 5.5, Kimi K3, GLM 5.3, Grok 4.7 (obs) [P1] | Premium: balanced OpenAI, Sonnet, Haiku, Gemini Pro and others [X5]                                             |
| Top tier          | Pro: Astra Pro reasoning; Ultrafast on $500 [O1]                                                    | Max and Ultra: Fable in the weekly pool [A5]                                               | Ultra: Carbon [G1]                                                                | Max: frontier models from four vendors [P5]                                           | Max: OpenAI frontier, Fable, Opus, Grok [X5]                                                                    |
| Auto routing      | Auto not described in docs [O4]                                                                     | Consumer picker unk; Claude Code default Opus 5.5 [A10]                                    | Auto for Free; Flash-Lite if Auto is off [G3]                                     | "Best" is automatic; Research picks models itself [P5]                                | `auto`, `auto-economy`, `auto-balanced`, `auto-premium` by task and plan; serving model disclosed [X5]          |
| Reasoning control | Light, Medium, High, Extra High, Max, Ultra (Ultra uses subagents) [O4]                             | Code: low to max effort; adaptive thinking always on for Fable 5.2 and Opus 5.5 [A10][A11] | Thinking Low/Medium/High; manual switching needs a paid plan [G3]                 | Thinking toggle; Computer Effort Mode Light to Ultra [P5][P4]                         | Per-model effort selector in the composer [X5]                                                                  |
| Speed modes       | Fast 2.5x, Ultrafast 8x usage multipliers [O3]                                                      | Fast mode on Fable 5.2 and Opus 5.5 [A10]                                                  | none documented                                                                   | Normal / Fast / Ultrafast in Custom effort [P4]                                       | Fast mode (beta) on Web and Desktop [X13]                                                                       |
| Image / voice     | Images 2.6 (ind); GPT-Live [O17][O13]                                                               | No image model; voice uses Haiku on Free (ind) [A17]                                       | Nano Banana 2 / Pro; Omni video; Lyria music [G3][G8]                             | Image on paid plans; voice on gpt-live-1 [P7]                                         | OpenAI and Google image families; OpenAI Live voice slot [X5]                                                   |
| Local models      | none                                                                                                | none                                                                                       | none in the app                                                                   | Mac: Gemma 4 E4B, Qwen3.6, Perplexity model; PPLX 27B on Windows/Linux [P4]           | CLI local models; mobile on-device models (built); Electron refuses on-device inference [X11][X12]              |

AGI defect: the Auto "continuity" policy is enabled but unreachable, so every turn re-resolves
the model [X7].

---

## 5. Chat and composer

| Feature                    | ChatGPT                                                           | Claude                                                                             | Gemini                                                                | Perplexity                                                | AGI                                                                        |
| -------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Modes in one composer      | Chat / Work toggle; merge test announced (ind) [O5][O18]          | Chat / Cowork in one message box, rolling out [A8]                                 | Chat / Tasks toggle (Pro, Ultra) [G3]                                 | Ask / Computer [P4]                                       | Chat / AGI Work (Live web, Premium+) [X6]                                  |
| File types                 | Documents, slides, sheets, PDFs, images; audio uploads (car) [O5] | PDF, DOCX, CSV, TXT, HTML, ODT, RTF, EPUB, JSON, XLSX, images [A6]                 | Documents, images, video, audio, ZIP, code folders, GitHub repos [G3] | Text, code, PDF, images, audio and video transcribed [P6] | PDF, Office, text, data formats, images incl. HEIC; no audio or video [X6] |
| Temporary / incognito      | Temporary chat, kept up to 30 days (ind) [O19]                    | Incognito; on Team/Enterprise kept 30 days and exported [A7]                       | Temporary chats not used for training [G3]                            | Incognito; Enterprise can enforce it [P6]                 | Temporary chat [X6]                                                        |
| Search past chats          | unk                                                               | Paid plans, on by default [A7]                                                     | unk                                                                   | Search history in memory [P6]                             | Chat and global search [X6]                                                |
| Edit / branch / regenerate | unk                                                               | unk                                                                                | unk                                                                   | unk                                                       | Edit, resend, regenerate, branch navigator [X6]                            |
| Sharing                    | Codex thread snapshot links; Space pages [O5]                     | Artifacts shareable; Cowork sessions not shareable [A8]                            | Public share links [G3]                                               | Public sessions expose their files; Pages [P6]            | Share links with management [X6]                                           |
| Group chats                | Retired: none new since July 9 (ind) [O19]                        | unk                                                                                | unk                                                                   | unk                                                       | Missing                                                                    |
| Personalization            | Base style and tone; writing style from connected apps [O5]       | Instructions for Claude; Cowork global instructions [A11]                          | Customize: tailor responses, add Skills [G2]                          | Project instructions up to 8,000 characters [P6]          | Name, role, tone presets, warmth, output styles, project instructions [X6] |
| Import / export            | unk                                                               | Memory import and export (experimental) [A7]                                       | Import chats as ZIP up to 5 GB (ind); Takeout export [G3]             | Data export unk                                           | Memory import (200,000 characters); JSON export [X6]                       |
| Other                      | Locked chats (car); annotation notes on iOS [O10]                 | Interactive connectors open beside chat (Asana, Canva, Figma in development) [A13] | 40+ apps via Customize [G2]                                           | Pages from reports [P5]                                   | Queued prompt, steering, slash commands, `@` mentions [X6]                 |

AGI defects: the stable chat prompt (`chat.system@6`) does not tell the model about artifacts,
because newer prompts regress refusals on the free default model. After a user denies a tool on a
Claude Sonnet turn, the answer can be lost [X7].

---

## 6. Creation

| Capability         | ChatGPT                                                                    | Claude                                                                 | Gemini                                                       | Perplexity                                         | AGI                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Canvas / artifacts | Intelligent UI calculators (car); interactive tables and charts (obs) [O1] | Artifacts on every plan [A1]                                           | Canvas on all plans: apps, games, quizzes, infographics [G2] | "Artifacts" article in Computer (title only) [P6]  | HTML, React, SVG, Mermaid, charts; versions, publish, export (Live web); sandbox origin not set in production (Partial) [X6][X7] |
| Documents          | Space Pages: co-edited, comments [O21]                                     | Claude Docs on every plan [A13]                                        | Canvas drafting; Gemini in Docs [G2][G10]                    | Reports, Pages [P5]                                | DOCX/PDF generation; no editor [X6]                                                                                              |
| Slides             | Space Slides: build, present, export [O21]                                 | Claude Slides on every plan [A13]                                      | Slide generation on all plans [G3]                           | Presentations [P3]                                 | PPTX generation; no slide editor [X6]                                                                                            |
| Spreadsheets       | Space Spreadsheets; Excel add-in (ind) [O21]                               | Claude Sheets (beta, paid, "simple"); Excel add-in [A13][A16]          | Tasks file Docs and Sheets (Mac); Gemini in Sheets [G2]      | Spreadsheets, dashboards [P3]                      | XLSX with charts; no grid editor [X6]                                                                                            |
| Design / boards    | Sites [O10]                                                                | Claude Design (all plans); Whiteboards (beta) [A13]                    | Antigravity Knowledge Work layout [G6]                       | MotionSites, Taste skills [P7]                     | Missing                                                                                                                          |
| Data dashboards    | Data analysis (obs) [O1]                                                   | Claude Data GA 2026-11-10 (warehouse/CRM connectors) [A13]             | Notebook cloud computer (Ultra, rolling out) [G5]            | Data dashboards via Computer [P4]                  | Charts in artifacts and research reports [X6]                                                                                    |
| Code execution     | Data analysis; API hosted sandboxes [O1][O13]                              | On Free [A1]                                                           | Notebook secure cloud computer [G5]                          | Advanced Deep Research sandbox [P5]                | Managed sandbox, Python panel, up to 24 h (Partial) [X6]                                                                         |
| Images             | Images 2.6: GIFs, reusable reference images, all paid tiers (ind) [O17]    | None (SVG only) [A15]                                                  | Free: Nano Banana 2; Pro redo from Plus [G3]                 | Pro, Max, Enterprise; not Free [P3]                | Edit, outpaint, variations; Premium+ (built) [X6]                                                                                |
| Video              | No confirmed video; Sora app closed, API ended 2026-09-24 (ind) [O18]      | Claude Motion: code-built MP4 explainers (beta, Team/Enterprise) [A13] | From Plus; Omni 1.2 Flash; Project Genie (Ultra) [G1][G8]    | Enterprise Max 15 a month; consumer "limited" [P3] | Partial: UI built, gated to Ultra; no live catalog model since Veo preview deprecation 2026-10-22 [X7]                           |
| Audio / music      | unk                                                                        | None [A15]                                                             | Music on all plans; Flow Music credits [G3][G4]              | unk; HyperFrames MP4 from HTML [P7]                | Text-to-speech playback built; music missing [X6]                                                                                |
| Publishing         | Sites with connected data (rolling out) [O10]                              | Shareable artifacts [A1]                                               | Canvas shareable [G2]                                        | Publishing Computer websites (title) [P6]          | Public or workspace pages with moderation (built) [X6]                                                                           |

---

## 7. Search and research

| Feature             | ChatGPT                                        | Claude                                                       | Gemini                                                        | Perplexity                                                              | AGI                                                                              |
| ------------------- | ---------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Web search          | Chat and Work; on Free [O5][O1]                | With citations, on Free; admins can turn it off [A1][A8]     | Built in; AI Mode in Search carries Argon and Carbon [G5]     | Cited answers; Pro Search applies automatically [P5]                    | Citation chips with excerpts; Perplexity Search plus provider-native search [X6] |
| Deep research       | Limits differ by plan; quotas unpublished [O3] | Research: 5+ tool calls over 1–3 minutes; Pro and above [A1] | Deep Research on all plans; editable plan; 150 countries [G2] | Research: Free 1 a month, Pro extended; Advanced Deep Research [P3][P5] | Premium+: editable plan, pause/resume, steering, report reader [X6]              |
| Multi-model answers | n/a                                            | n/a                                                          | n/a                                                           | Model Council: 3 models plus a synthesizer (Max) [P5]                   | Missing                                                                          |
| Source controls     | unk                                            | unk                                                          | Gmail, Drive, uploads as sources [G2]                         | Source labels; Internal Knowledge Search (car) [P5]                     | Website restrictions in research; no domain filters in chat [X6]                 |
| Shopping            | Article exists; reported pulled (ind) [O19]    | Duet buys through Link or Shop Pay (preview) [A13]           | unk                                                           | Instant Buy, US, PayPal, not sponsored [P6]                             | Missing                                                                          |
| Finance             | Finances, US (car)                             | Personal Finance via Plaid, US beta, Pro+ [A13]              | unk                                                           | Finance via Plaid (ind)                                                 | Missing                                                                          |
| Health              | Health row on pricing page (obs) [O1]          | n/a                                                          | Google Health Premium in Pro [G1]                             | Perplexity Health, US, records via b.well [P6]                          | Missing                                                                          |
| Maps / news cards   | unk                                            | unk                                                          | Maps via Live connections [G2]                                | unk                                                                     | Maps partial; news and market cards missing [X6]                                 |

---

## 8. Memory and projects

| Feature         | ChatGPT                                                      | Claude                                                                  | Gemini                                                                | Perplexity                                                 | AGI                                                                        |
| --------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| Saved memory    | Memories; memory with past chats (obs) [O5][O1]              | On by default for individuals; saved as topics; pause and reset [A7]    | Memories and Saved Info [G3]                                          | Memories and search history; cleared log kept 30 days [P6] | Automatic and explicit, provenance, conflict resolution [X6]               |
| Sensitive data  | unk                                                          | Sensitive topics off by default; never saves ID or account numbers [A7] | unk                                                                   | Memory may train models unless opted out [P6]              | Sensitive-topic exclusions [X6]                                            |
| Activity memory | Computer History (opt-in, macOS): no screenshots [O5]        | Dreaming memory, research preview (API) [A11]                           | Personal Intelligence: Gmail, Photos, Search, YouTube; beta, 18+ [G2] | Brain (Max, research preview) [P6]                         | Missing                                                                    |
| Import          | Codex imports other agents' memories [O10]                   | Import and export (experimental) [A7]                                   | Memory summary paste and chat ZIP (ind) [G3]                          | unk                                                        | Import from another assistant [X6]                                         |
| Projects        | Chats, files, instructions; multi-folder local projects [O5] | Free 5, paid unlimited; shared on Team [A1]                             | No projects in the app found; Notebook instead [G2]                   | No cap; 10,000 files, 5 GB per project; roles [P6]         | Free 1, Basic 5, Premium 25, Max unlimited; roles, Studio outputs [X2][X6] |
| Org memory      | unk                                                          | Orgs created from 2026-10-31 start with memory on [A7]                  | n/a                                                                   | Enterprise memory belongs to the org [P6]                  | Org-managed memory policy [X6]                                             |
| Study           | Study mode (obs) [O1]                                        | Learning mode (Education) [A1]                                          | Quizzes, flashcards [G3]                                              | unk                                                        | Study mode on Web and Mobile [X6]                                          |

---

## 9. Voice and realtime

| Feature              | ChatGPT                                                               | Claude                                              | Gemini                                                | Perplexity                                                      | AGI                                                                         |
| -------------------- | --------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Live voice           | ChatGPT Voice on GPT-Live; desktop voice directs Work and Codex [O21] | Voice mode, all plans, beta (ind) [A17]             | Gemini Live merged into chat, with interruptions [G2] | Voice on desktop web and Mac app, Pro and Max (2026-11-06) [P6] | Orb, captions, tool approvals in voice (built) [X6]                         |
| Video / screen share | Stays on Advanced Voice until GPT-Live supports it (ind) [O17]        | unk                                                 | Camera in Live; screen share unk [G2]                 | unk                                                             | Partial: camera attach; screen share on Desktop host only [X8]              |
| Retirement           | Advanced and Standard Voice retire 2026-12-11 (ind) [O17]             | n/a                                                 | n/a                                                   | n/a                                                             | n/a                                                                         |
| Languages            | Added French, German, Hindi, Japanese, Korean, Mexican Spanish (car)  | Reported 18 languages, non-English beta (ind) [A17] | unk                                                   | Comet voice: 36 languages, 10 voices [P10]                      | Language picker; count not enumerated [X6]                                  |
| Limits               | Desktop voice $0.05 a minute from Codex budget [O3]                   | Counts toward usage (ind)                           | unk                                                   | No caps stated [P6]                                             | Free 10 minutes a month; Premium-row 300; Max unlimited (legacy table) [X5] |
| Translation          | unk                                                                   | unk                                                 | Live Translate (API preview) [G8]                     | unk                                                             | Mobile translate screen (built) [X12]                                       |
| Hands-free surfaces  | Texting dots by iMessage/RCS [O10]                                    | `/voice` dictation in Code [A10]                    | CarPlay (ind); Antigravity voice mode [G12][G6]       | iOS Voice Assistant, Android Assistant [P6]                     | Push-to-talk on mobile; CLI voice; no VS Code voice [X6]                    |

---

## 10. Agents and automation

| Feature           | ChatGPT                                                                       | Claude                                                              | Gemini                                                               | Perplexity                                                           | AGI                                                                                 |
| ----------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Agent mode        | Work: cloud or local, continues across devices [O5]                           | Cowork: cloud isolated environment; Manual, Auto, Skip modes [A8]   | Tasks (beta): Pro, Ultra, 18+, not EEA/UK/CH/Nigeria [G3]            | Computer: cloud sandbox, sub-agents, proactive tasks [P4]            | AGI Work: plan, steering, approvals, deliverables (Live web, Premium+) [X6]         |
| Always-on agent   | dots: own computer and browser; Pro 18+ outside EEA/UK/CH; Enterprise GA [O8] | Duet: own VM, daily brief; US waitlist [A13]                        | Tasks keep working while away [G3]                                   | Teammates: Max, web, research preview; own computer each [P6]        | Missing; no agent after quitting Desktop (declined) [X6]                            |
| Computer use      | macOS and Windows; per-app approval; region limited; not Linux [O6]           | macOS and Windows research preview; Pro, Max, Ultra only [A10]      | "Screen automation" on all plans (table); API tool GA 10-30 [G3][G8] | Personal Computer local or hybrid; Portable on NVIDIA/AMD [P4]       | Experimental, macOS Desktop only, emergency stop (built) [X13]                      |
| Browser agent     | Chrome extension works in background tabs with per-site consent [O7]          | Claude in Chrome side panel as Cowork; scheduled browser tasks [A9] | Chrome auto browse: Pro and Ultra, US and India, experimental [G4]   | Comet Assistant: per-domain control or read-only [P10]               | Browser bridge across Desktop, Chrome, CLI, VS Code (beta, built); not on Web [X13] |
| Scheduling        | Scheduled tasks replaced Pulse [O5][O18]                                      | Cloud scheduled tasks via schedule, API, GitHub triggers [A10]      | Scheduled actions on Plus and above [G3]                             | Automations with Gmail, Slack, Calendar, Drive, Linear triggers [P4] | Cron, webhook, Slack, GitHub, file triggers (Live web) [X6]                         |
| Phone to computer | Remote control of the desktop host from iOS or Android [O6]                   | Dispatch: Pro, Max, Ultra [A10]                                     | Antigravity Remote Control from a browser [G6]                       | Remote Access (car)                                                  | Remote control (experimental, built) [X13]                                          |
| Approvals         | Ask, Approve for me, Full access, Custom (car)                                | Approval expiry 30 minutes for Dispatch sessions [A10]              | Asks before sending, buying, deleting [G3]                           | Allow once, always, never; connected-app actions not undone [P4]     | Exact recipients and amounts shown; batch approval; cross-device [X6]               |
| Agent API         | Agents API, Agents SDK, Decisions API [O13]                                   | Managed Agents (beta), $0.08 per session-hour [A11]                 | Computer Use GA; Interactions API [G8]                               | Agent API with tool approvals [P8]                                   | No public agent SDK [X6]                                                            |

---

## 11. Extensibility

| Feature            | ChatGPT                                                                           | Claude                                                                             | Gemini                                                           | Perplexity                                                                | AGI                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Connectors         | Drive, SharePoint, Gmail, Outlook, Slack, Teams, Salesforce, GitHub and more [O5] | Drive, Gmail, Calendar, GitHub, Microsoft 365, Slack; custom MCP [A4]              | Workspace, Maps, YouTube, Photos, 40+ third-party apps [G2]      | Gmail, Outlook, GitHub, Linear, Slack, Notion, Snowflake; 400+ (car) [P4] | 13 released (Airtable to Todoist); Gmail, Drive, Calendar built but gated; 32 first-party + 401 directory entries [X10] |
| MCP                | Plugins carry MCP servers; MCP Events; remote MCP in the API [O9]                 | Custom MCP connectors; MCP Apps (public preview) [A13]                             | In the app: unk; Antigravity yes [G6]                            | Custom remote connectors (Enterprise); MCP servers for developers [P8]    | Remote MCP with OAuth (beta); CLI stdio MCP; Chrome WebMCP [X13]                                                        |
| Plugins            | One catalog for ChatGPT and Codex [O9]                                            | Bundle skills, connectors, sub-agents; 6,000+ in Marketplace (Duet post) [A8][A13] | Antigravity Plugin Marketplace, 67 plugins [G6]                  | Agent Plugins with GitHub or .zip import [P7]                             | Plugins (beta) with private org marketplace [X6]                                                                        |
| Skills             | Shared by Work and Codex; Claude Code plugin format accepted [O9]                 | Agent Skills standard donated to the Agentic AI Foundation [A14]                   | Gems become Skills on 2026-11-17 [G2]                            | SKILL.md, up to 20 MB; replaced Workflows [P6]                            | Skills GA on Web, Desktop, Mobile, CLI [X6]                                                                             |
| Custom assistants  | Custom GPTs migrating to plugins [O9]                                             | Projects, skills                                                                   | Gems (now Skills) [G2]                                           | Teammates per model [P6]                                                  | Custom agents via API and CLI only; no builder UI (Partial) [X6]                                                        |
| Public marketplace | Shared public catalog [O9]                                                        | Claude Marketplace [A13]                                                           | Antigravity marketplace; Agent Marketplace (Enterprise) [G6][G9] | Discover tab [P6]                                                         | Missing [X6]                                                                                                            |
| Admin control      | Workspace plugin and skill controls [O9]                                          | Restrict a connector's tools; org-wide skills [A1]                                 | No plugin admin controls described [G6]                          | Plugin cannot enable a connector the org disabled [P6]                    | Policy for connectors, skills, plugins [X6]                                                                             |

---

## 12. Coding products

| Item               | OpenAI Codex                                                                    | Claude Code                                                                     | Google Antigravity                                                                        | Perplexity | AGI                                                                          |
| ------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| Surfaces           | CLI, IDE, desktop Codex mode, cloud, mobile Remote [O11]                        | CLI, VS Code/Cursor, JetBrains beta, desktop Code tab, web, mobile, Slack [A10] | App, CLI, IDE extensions, Python SDK [G6]                                                 | None [P8]  | CLI, VS Code, Desktop local sessions, cloud code (all built) [X11]           |
| Latest version     | CLI 0.167.1 (2026-11-10) (obs) [O16]                                            | 2.1.322 (2026-11-10) [A10]                                                      | CLI 1.5.6 (2026-11-11) [G7]                                                               | n/a        | v0.0.1; no published release [X11]                                           |
| Cloud sessions     | Environments, secrets, network presets; GitHub and GitLab [O11]                 | Anthropic-managed VMs; GitHub (car) [A10]                                       | Remote Control; `/swarm` preview with worktrees and verifiers [G6]                        | n/a        | Managed sandboxes up to 24 h, GitHub app, teleport (Partial) [X6]            |
| Code review        | GitHub review GA; GitLab preview [O11]                                          | Managed Code Review (Team/Enterprise, token-billed); Ultrareview [A10]          | Code Assist review (sunsetting, car)                                                      | n/a        | `agi review`, VS Code review, PR feedback; no CI-failure investigation [X11] |
| Plans              | Free/Go light; Plus/Business standard; Pro no 5-hour; API key has no cloud [O3] | Pro and above; computer use not on Team/Enterprise [A10]                        | Free basic weekly; Pro and Ultra; Business via Cloud [G6]                                 | n/a        | Cloud needs Premium+; Local and BYOK free [X2]                               |
| Third-party models | Vertex AI provider in CLI [O10]                                                 | Bedrock, Vertex, Foundry, gateways [A10]                                        | Claude Sonnet and Opus 5.5 offered [G6]                                                   | n/a        | Catalog models via Auto [X5]                                                 |
| Sandboxing         | Native Windows sandbox; permission modes [O11]                                  | Sandboxing, checkpoints, auto mode [A10]                                        | Terminal sandbox, execution modes [G6]                                                    | n/a        | Seatbelt (macOS), bubblewrap (Linux), none on Windows [X11]                  |
| Install            | curl, npm, Homebrew, Windows installer [O11]                                    | Script, Homebrew, WinGet, apt/dnf/apk [A10]                                     | `agy` releases on GitHub [G7]                                                             | n/a        | curl script only, and it stops until a signed release exists [X11]           |
| Marketplace data   | VS Code 2.5/5 from 929 ratings (obs) [O15]                                      | VS Code 3.5/5 from 852 reviews (obs) [A15]                                      | n/a                                                                                       | n/a        | n/a                                                                          |
| Retiring           | GPT-5.5 removed from Codex sign-in 2026-10-14 [O4]                              | Opus 4.8 fast mode removed 2026-11-30 [A10]                                     | Jules ends 2026-12-31; Code Assist sales stopped 2026-10-09; Gemini CLI consumer cut [G7] | n/a        | n/a                                                                          |

---

## 13. Enterprise and team

| Item               | ChatGPT                                                   | Claude                                                                 | Gemini                                                                           | Perplexity                                                                | AGI                                                               |
| ------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Team tier          | Business 2–200 seats; Standard and Premium seats mix [O2] | Team 2–150 seats; Standard and Premium mix [A1]                        | Workspace editions; Gemini Enterprise Business [G10][G9]                         | Enterprise Pro, no seat minimum [P3]                                      | Team (min 2), Team Premium seats [X2]                             |
| SSO / SCIM         | SAML SSO on Business; SCIM on Enterprise [O3]             | SSO on Team; SCIM on Enterprise [A1]                                   | Workforce Identity Federation; SCIM unk [G9]                                     | SSO (Okta), SCIM (WorkOS) [P9]                                            | SSO setup, SCIM v2 routes (Live web) [X6]                         |
| Audit / compliance | Compliance API, audit logs [O3]                           | Compliance API with security posture endpoint (beta) [A11]             | Audit logs, DLP, IRM in Workspace [G10]                                          | Audit logs with 1 Max seat or 50+ Pro seats [P3]                          | Audit viewer and export, legal holds [X6]                         |
| Keys / residency   | EKM; at-rest residency in 10 regions (ind) [O20]          | CMEK; API inference `us` or `global` only [A11]                        | CMEK in US/EU; Brazil region [G9]                                                | unk                                                                       | Residency request UI (Partial); encryption key setup [X6]         |
| Certifications     | SOC 2 Type 2, ISO 27001/17/18/701 alignment (ind) [O20]   | SOC 2 I and II, ISO 27001, ISO 42001, HIPAA BAA [A17]                  | Workspace: SOC, ISO incl. 42001, FedRAMP High; Antigravity not covered [G10][G9] | SOC 2 Type II, HIPAA, GDPR, PCI; FedRAMP 20x Moderate (vendor claim) [P9] | None held: no SOC 2, ISO 27001, HIPAA or pen test [X9]            |
| New controls       | Prisma AIRS, managed config [O9]                          | 2026-11-05: security center, inference hooks GA, multi-org admin [A13] | Per-user quota caps (2026-10-22) [G9]                                            | Computer admin effort defaults; CrowdStrike guide [P4]                    | IP allow-list (100), spend limit, model and feature policy [X6]   |
| Gaps stated        | Terra unavailable with UAE residency [O10]                | Code Review unavailable with ZDR, HIPAA or CMEK [A10]                  | Search grounding bypasses residency and VPC-SC [G9]                              | Residency and EKM not stated                                              | Admin only on Web; open High defects in deletion and erasure [X7] |

---

## 14. Privacy and safety

| Item               | ChatGPT                                                                        | Claude                                                                                  | Gemini                                                             | Perplexity                                                                                     | AGI                                                                        |
| ------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Consumer training  | Trains on content, opt-out available, on Free–Pro (obs) [O1]                   | "Opt-out" on Free, Pro, Max, Ultra (obs) [A1]                                           | With Keep Activity on, may train; Live media opt-in [G3]           | Help center: opt-out toggle; privacy notice describes none (conflict) [P6][P9]                 | AGI trains no model; provider terms apply in Cloud [X9]                    |
| Business default   | No training on Business data [O2]                                              | None by default on Team and Enterprise [A1]                                             | No training on Workspace data without permission [G10]             | No training on Enterprise data [P9]                                                            | Same as consumer [X9]                                                      |
| Retention          | Temporary chats up to 30 days (ind)                                            | Up to 5 years if training on; deleted chats gone from the back end within 30 days [A12] | 18-month auto-delete by default; reviewed chats up to 3 years [G3] | Deleted accounts removed in 30 days; files 30 days [P9][P6]                                    | Published schedule; erasure has open defects [X9][X7]                      |
| Ads                | Free and Go, labelled sponsored; not on health topics (ind) [O18]              | None; 2026-02-04 pledge (ind) [A17]                                                     | Chats not used to show ads [G3]                                    | Targeted ads via cookies per notice; banner says no third-party ads on services (obs) [P9][P1] | None [X9]                                                                  |
| Minimum age        | 13+ store rating; age prediction, parental controls (ind) [O14][O18]           | 18 [A12]                                                                                | AI plans 18+; Chrome Gemini 13+ [G1][G11]                          | 13+ with guardian; store 18+ [P9]                                                              | 13; 16 in EU zones; 18 in India and Brazil on mobile [X9]                  |
| Teen controls      | Quiet hours, distress alerts (ind)                                             | None found                                                                              | Family Link can turn off for 13+ [G11]                             | unk                                                                                            | Device-only minor-safe mode on Mobile (Partial) [X12]                      |
| Reported incidents | Training toggle reportedly re-enabled for Codex users, unconfirmed (ind) [O18] | Chrome "still risky"; Excel add-in loses history after M365 updates [A9][A16]           | Carbon prompt injection "still needs improvement" (vendor) [G5]    | Public sessions expose uploaded files [P6]                                                     | Artifact navigation exfiltration latent until a sandbox origin is set [X7] |

---

## 15. Policies and commerce

| Item               | ChatGPT                                              | Claude                                                               | Gemini                                                         | Perplexity                                                                            | AGI                                                                         |
| ------------------ | ---------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Renewal / cancel   | unk (help pages blocked)                             | Auto-renews; cancel 24 hours before term end [A12]                   | Cancel anytime (obs) [G1]                                      | Auto-renews; cancel before renewal [P9]                                               | Cancel stops the next renewal; access to term end [X9]                      |
| Refunds            | unk                                                  | Generally none; 7 days in Brazil, Mexico, South Korea, Taiwan [A12]  | No partial-period refunds except where law requires (obs) [G1] | EU/UK/Turkey 14 days; KR/BR 7; others 24 h monthly, 72 h annual; one per account [P3] | Unused plan payment within 7 days, once; top-ups within 7 days [X9]         |
| Store vs web price | Plus $19.99 on iOS vs $20 web (obs) [O14]            | iOS Max $124.99, Ultra $249.99 (about +25%) (obs) [A15]              | iOS Plus $4.99, Pro $19.99, Ultra $199.99 (car)                | iOS Pro $20 vs $17 annual-billed web [P10]                                            | No in-app purchase in mobile v1 [X12]                                       |
| Account caps       | Paid accounts per device and card capped (ind) [O19] | Verified-account check for Ultra's no-5-hour rule [A3]               | n/a                                                            | One trial per user [P9]                                                               | n/a                                                                         |
| Disputes / law     | unk                                                  | California law, San Francisco courts; no arbitration found [A12]     | unk                                                            | JAMS arbitration, class waiver, 30-day opt-out [P9]                                   | unk                                                                         |
| Currency / tax     | Business annual; Enterprise invoicing (obs) [O1]     | Prices exclude tax; India pricing reportedly includes GST (ind) [A1] | Workspace prices exclude tax [G10]                             | USD; INR not for recurring plans [P3]                                                 | USD plus Stripe Tax; INR includes 18% GST [X2]                              |
| Regulation         | New York frontier-developer registration (ind)       | Usage Policy update effective 2026-11-12 [A12]                       | n/a                                                            | n/a                                                                                   | Supported-countries page; store territories exclude sanctioned regions [X9] |

---

## 16. Developer API

Per million tokens, standard tier, input / output.

| Item             | OpenAI                                                      | Anthropic                                                        | Google                                                                    | Perplexity                                                                             | AGI                                                  |
| ---------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Flagship         | gpt-6-astra $10 / $50 (long context $20 / $75) [O12]        | Fable 5.2 $8 / $40 [A11]                                         | Gemini 4 Carbon and Argon $2 / $10, rising to $4 / $20 on 2026-12-01 [G8] | Resells at list: e.g. claude-fable-5-2 $8 / $40, gemini-4-carbon $2 / $10 (intro) [P8] | Catalog list prices per model in `models.json` [X5]  |
| Balanced         | gpt-6.1-sol $2 / $10; gpt-6.1-terra $1 / $5 [O12]           | Opus 5.5 $4 / $20; Sonnet 5.5 $2 / $10 [A11]                     | Gemini 3.8 Flash $0.75 / $3.75 (doubles 2026-12-31) [G8]                  | sonar $0.25 / $2.50 [P8]                                                               | Same catalog [X5]                                    |
| Cheapest         | gpt-6-luna $0.10 / $0.50 [O12]                              | Haiku 5.5 $0.10 / $0.50 up to 100K [A11]                         | 3.5 Flash-Lite $0.30 / $2.50 [G8]                                         | nemotron-3.5-super $0.20 / $0.50 [P8]                                                  | Same catalog [X5]                                    |
| Context / output | 1.05M / 128K [O13]                                          | 1M / 128K [A11]                                                  | Carbon 1,048,576 in and out [G9]                                          | Per model                                                                              | Per model                                            |
| Discounts        | Batch and Flex about 50%; Fast 2x; Ultrafast about 6x [O12] | Batch 50%; cache read 0.025–0.1x; fast mode about 2x price [A11] | Batch and Flex 50%; Priority about 1.8x [G8]                              | Flex 0.5x, priority 2x on OpenAI models [P8]                                           | Whether provider discounts reach API users: unk [X6] |
| Search tool      | $10 per 1K calls [O12]                                      | $10 per 1K searches [A11]                                        | 5,000 free a month, then $14 per 1K [G8]                                  | Search API $5 per 1K; Fast $1 [P8]                                                     | Perplexity Search inside chat billing [X6]           |
| Free tier        | "Free" tier, $100 monthly limit in allowed regions [O13]    | None; Evaluation tier [A11]                                      | Free tier on Flash models, not Argon/Carbon [G8]                          | Tier 0 at $0 spend; no free credits [P8]                                               | None; Cloud API on Premium+ [X2]                     |
| SDKs / agents    | Agents SDK, Responses, ChatKit [O13]                        | SDK majors 2026-10-21 under Apache 2.0; Agent SDK [A11]          | Antigravity SDK, Gemini API CLI (beta) [G8]                               | Python and TypeScript SDKs [P8]                                                        | OpenAI-compatible endpoints; no SDK [X6]             |
| Rate tiers       | Free, Build, Launch, Grow; caps $100 to $200,000 [O13]      | Start, Build, Scale, Custom; caps $500 to $200,000 [A11]         | Free, Tier 1–3; caps $250 to $100,000+ [G8]                               | Tiers 0–5 by spend ($0–$5,000) [P8]                                                    | 30 requests a minute per user, scaled by plan [X6]   |
| Data default     | Inputs not trained by default (ind)                         | 30-day retention required for Fable 5.2 [A11]                    | From 2026-10-26, new paid projects store requests by default [G8]         | Fable 5.2 needs non-ZDR access [P8]                                                    | Provider terms govern [X9]                           |

---

## 17. What changed, 2026-10-24 to 2026-11-11

**OpenAI** [O10][O13][O17][O18]

- 10-26: GPT-6.1 Terra in Work and Codex (paid plans) and the API.
- 10-26 to 10-30: "Text your dot" over iMessage/RCS, beta for US Pro users.
- 10-28: Pro and Business can claim up to $500 a month in API credits.
- 10-29: Pro Work and Codex allowance doubled, and the planned Pro 200 cut cancelled (ind).
- 10-30: GPT-6 Rosalind for approved life-science customers.
- About 11-01: per-device and per-card caps on paid accounts (ind).
- About 11-02: subscriber email on a Chat/Work merge test (ind). The Business pricing page now
  confirms a shared ChatGPT and Codex limit from December (obs).
- 11-03: Chrome extension at 9M users, rated 2.9 (obs).
- 11-04: Images 2.6; dots GA for Enterprise, Edu and Healthcare (ind).
- 11-05: GPT-6 Cyber.
- 11-10: Businesses in ChatGPT beta; Advanced and Standard Voice retirement set for 12-11 (ind).
- 11-10 and 11-11: Codex CLI 0.167.1 and 0.170.0-alpha.1.

**Anthropic** [A10][A11][A13][A14][A3]

- 10-26: S-1 filed; roadshow from 11-10.
- 10-27: GSA 40% government discount.
- 10-28: API request limit raised to 128 MB.
- 10-29: Usage and Cost Analytics API (beta).
- About 10-30: Max 20x renamed Ultra, with no five-hour limit for verified accounts (date ind).
- 11-02: message threads beta.
- 11-05: enterprise security center, inference hooks GA, Personal Finance beta.
- 11-06: project cost tags.
- 11-09: Fable 5.2 and Mythos 5.2.
- 11-10: Sheets, Whiteboards, Claude Data GA, interactive connectors; Claude Code 2.1.322.
- Scheduled: 11-12 Usage Policy update; 11-19 Claude Data on by default for Enterprise; 11-30
  Opus 4.8 fast mode and Sonnet 4.5 retire; 12-07 usage credits start to expire.

**Google** [G5][G6][G7][G8][G9][G12]

- 10-26: paid API projects store requests by default.
- 10-27: Gemini API CLI beta.
- 10-29: Antigravity Plugin Marketplace; Jules shutdown announced.
- 10-30: Computer Use tool GA.
- 11-05: Omni 1.2 Flash GA.
- 11-06: Antigravity voice mode.
- 11-09: Antigravity Knowledge Work layout.
- 11-10: Gemini 4 Carbon GA, rolling out to Ultra; `/swarm` preview.
- 11-11: Decisions API; CarPlay (ind).
- Scheduled: 11-17 Gems become Skills; 11-18 Claude 4.6 removed from Antigravity; 11-25 Workspace
  intro price; 11-30 or 12-01 Argon and Carbon API prices double; 12-31 Jules ends.

**Perplexity** [P7][P8][P9]

- 10-23: privacy notice updated.
- 10-28: FedRAMP 20x Class C listing.
- 11-06: Teammates (Max), fully local Computer on Mac, voice mode on web and Mac, Agent Plugins,
  eight new Computer skills.
- November: API adds Gemini 4 Carbon, Fable 5.2 and the `ultra` effort level.

**AGI Workforce** [X1][X7]

- 1,167 commits on main since 10-24.
- Nothing newly released: production stays on `a8e278c62e`, and no app release was published.
- 10-31: 13 connectors enabled.
- 11-03: limited free image and video generation restored.
- 11-10: mobile v1 set to ship free with no in-app purchases.
- 11-11: Chrome Web Store ZIP made buildable; CLI release dispatch failed.

---

## 18. Documented strengths and weaknesses

| Vendor     | Strengths (documented)                                                                                                                         | Weaknesses (documented or observed)                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT    | One account across web, desktop, mobile, CLI, IDE, cloud; plugins shared by Work and Codex; computer use on two OSes; $8 tier                  | Free/Go/Pro chat limits unpublished; ads on Free and Go; frequent retirements; Chrome 2.9/5 and VS Code 2.5/5 (obs); help center blocks reading |
| Claude     | Coding on every surface; Docs/Slides/Design free; enterprise governance (inference hooks, CMEK, HIPAA, ISO 42001); ad-free                     | No image, video or music; Fable outside Pro limits; computer use excludes Team/Enterprise; several self-contradicting help pages                |
| Gemini     | Lowest paid entry ($4.99); 1M context at $19.99; storage and YouTube bundles; image, video and music; Workspace depth                          | Tasks and Personal Intelligence excluded in EEA/UK/CH/Nigeria; Free lost model choice; repeated renames; Antigravity outside SOC/ISO            |
| Perplexity | Cited search; Model Council; local and hybrid Computer on user hardware; multi-vendor models; FedRAMP 20x; free Comet                          | Credits split from Ask; Pro gets no monthly credits; agent actions not undone; most doc conflicts of the four; targeted ads per notice          |
| AGI        | Provider-neutral routing over 394 records; one published credit unit; Local/BYOK/Cloud boundaries; ACP and MCP server in CLI; dated trust page | Five of six surfaces unreleased; Desktop macOS-only; connectors gated; video blocked; no attestations; open High defects; production lags tree  |

---

## 19. Where AGI stands

Each verdict compares AGI with what two or more leaders ship today. "Built" verdicts describe
code. "Released" verdicts describe what a user can reach today: only Web.

| #   | Dimension       | Built in code                                                         | Released to users                                                          | Verdict (built / released) |
| --- | --------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------- |
| 1   | Surfaces        | Web, macOS Desktop, iOS, Android, CLI, VS Code, Chrome                | Web only                                                                   | Behind / Behind            |
| 2   | Plans           | $0 / $7 / $20 / $100 / $200, Team $25 and $125; USD and INR           | Same prices under older names (Pro, Max 5x, Max 20x)                       | Level / Level              |
| 3   | Limits          | Exact credits per window; top-ups with discounts                      | Three windows and 30% flagship share stated on the live pricing page (obs) | Ahead / Ahead              |
| 4   | Models          | Multi-vendor catalog, Auto by task and plan, serving-model disclosure | Web                                                                        | Ahead / Ahead              |
| 5   | Chat            | Branching, temporary chat, share, search, personalization             | Web                                                                        | Level / Level              |
| 6   | Creation        | Artifacts, Office files, images; no editors; video blocked            | Web, with the same gaps                                                    | Behind / Behind            |
| 7   | Search/research | Citations, Deep Research with steering                                | Web, Premium+                                                              | Level / Level              |
| 8   | Memory/projects | Memory with import and provenance, projects with Studio outputs       | Web                                                                        | Level / Level              |
| 9   | Voice           | Live voice, dictation, mobile translate                               | Web voice                                                                  | Level / Level              |
| 10  | Agents          | AGI Work, approvals, triggers; computer use experimental on macOS     | Web Work and schedules; no computer use, browser agent or remote control   | Level / Behind             |
| 11  | Extensibility   | Skills, plugins, MCP, 400+ directory entries                          | 13 connectors                                                              | Level / Behind             |
| 12  | Coding          | CLI, VS Code, ACP for Zed/JetBrains, cloud code                       | Web code page only                                                         | Level / Behind             |
| 13  | Enterprise      | SSO, SCIM, audit, legal hold, policy                                  | Web console; no attestations                                               | Level / Behind             |
| 14  | Privacy/safety  | No ads, no AGI training, explicit trust modes                         | Web                                                                        | Ahead / Ahead              |
| 15  | Commerce        | Stripe web; mobile store purchase built but off                       | Web checkout; no trial, annual or education offer                          | Behind / Behind            |
| 16  | API             | OpenAI-compatible gateway, developer console                          | Web                                                                        | Level / Level              |
| 17  | Change velocity | 1,167 commits in the window                                           | No new release in the window                                               | n/a / Behind               |
| 18  | Distinctiveness | Neutral routing, credit transparency, trust boundaries                | Partly visible on Web                                                      | Ahead / Level              |

**Known inconsistency.** The public site's platform table (`apps/web/lib/surface-status.ts`,
`SURFACE_PLATFORMS`) lists macOS, Windows and Linux for Desktop, CLI, VS Code and Chrome. But
`apps/desktop/electron-builder.yml` packages Desktop for macOS only (dmg and zip, arm64 and x64),
and `release-desktop-cloud.yml` has only a macOS build job. The site promises two desktop
operating systems that no build produces. (Spot-checked in the tree on 2026-11-11.)

**Other AGI self-inconsistencies.** Production shows older plan names and higher concurrency and
storage figures than the tree (§3). A legacy four-tier table (`TIER_POLICIES` in
`model-catalog.ts`) still sets voice minutes and video seconds, and maps Basic to the Pro row.
The capability ledger records cross-app dictation as declined, but the code wires it
(`apps/desktop/electron/main.ts:1855`).

### The 10 most valuable gaps

These are research findings, not decisions or tasks. Each names two or more leaders that already
ship the capability.

| #   | Gap                                                                                            | Leaders that ship it                                                                                                                                     | AGI state                                                |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | Released native apps: desktop and mobile in users' hands                                       | All four ship macOS, Windows, iOS and Android                                                                                                            | Built, not released                                      |
| 2   | Windows Desktop (Linux second)                                                                 | ChatGPT, Claude, Gemini, Perplexity on Windows; Claude beta and Perplexity Portable on Linux                                                             | Not packaged; site claims it                             |
| 3   | Core connectors (Gmail, Drive, Calendar, Microsoft 365) released                               | ChatGPT, Claude, Gemini, Perplexity                                                                                                                      | Built but gated; 13 others live                          |
| 4   | Native document, slide and spreadsheet editing                                                 | Claude (Docs, Slides, Sheets), ChatGPT (Space), Gemini (Canvas, Workspace)                                                                               | Generates files; no editor                               |
| 5   | A live video model                                                                             | Gemini (Omni from Plus), Perplexity (Enterprise Max, limited consumer)                                                                                   | UI built; no live catalog model                          |
| 6   | Always-on or persistent agents                                                                 | ChatGPT dots, Perplexity Teammates, Gemini Tasks, Claude Duet (waitlist)                                                                                 | Missing; declined after Desktop quits                    |
| 7   | Released coding agent (CLI and IDE)                                                            | OpenAI Codex, Claude Code, Google Antigravity                                                                                                            | Built; installer stops; no Marketplace item              |
| 8   | Computer use and browser agent released                                                        | ChatGPT (macOS, Windows), Claude (macOS, Windows), Perplexity (Comet, Personal Computer)                                                                 | Experimental, macOS only, unreleased                     |
| 9   | Workplace presence: Office add-ins and Slack/Teams                                             | ChatGPT (Excel/Sheets, Slack, Teams), Claude (Excel, Word, PowerPoint, Claude Tag), Gemini (Workspace)                                                   | Slack partial; Office and Teams missing                  |
| 10  | Assurance and commercial terms: SOC 2 / ISO 27001, annual billing, student or education offers | Claude, Gemini (Workspace) and Perplexity document SOC 2 (OpenAI states alignment, ind); Claude, Gemini and Perplexity offer annual or education pricing | No attestations; monthly only; no trial or student offer |

Runners-up: a custom-assistant builder and public marketplace (ChatGPT plugins, Gemini Skills,
Claude Marketplace); group or shared chats (ChatGPT retired its own, so this is lower value);
own browser (Comet, ChatGPT, Claude).

---

## 20. Conflicts and gaps in the evidence

### Where a vendor's own pages disagree

**OpenAI**

- The desktop download page offers macOS only, while the quickstart lists macOS, Windows and
  Linux [O5].
- The App Store lists both "ChatGPT Plus $200" and "Pro 200 $200", likely a listing error (obs)
  [O14].
- Plan eligibility for the Office add-in conflicts between sources (ind) [O18].
- Free limits: an August press account says Free has a weekly limit, while the pricing page says
  "unlimited text chats" with guardrails. The pricing page is taken as current (obs) [O1].
- Codex Remote: the mobile page names only iOS; the remote-connections page names iOS and
  Android [O6].
- Business Premium seat: a help snippet and a news site frame the price differently. The rendered
  pricing page settles it at $100 annual or $125 monthly (obs) [O2].

**Anthropic**

- Team Premium usage: "5x standard" (pricing page) vs "6.25x Pro" (help). The pricing page is
  taken (obs) [A1][A4].
- Context window: 200K for Team (help) vs "up to 1M" on all plans (pricing page). The pricing page
  is taken [A1][A4].
- Team RBAC: the pricing page says no role-based access; the help article says role-based
  permissioning is included [A1][A4].
- Fable on Pro: the launch post says up to 50% of weekly; the help article and pricing page say
  usage credits only. The pricing page is taken [A14][A5][A1].
- Minimum Claude Code version for Fable 5.1: 2.1.255 vs 2.1.257 [A5][A10].
- Claude Science platforms: Mac, Windows and Linux (download page) vs macOS and Linux (support
  article) [A2].
- Ultra rename date: "this week" (help) vs about 10-30 (press) [A3].

**Google**

- Plus models: three pages give three lists (Flash; Gemini 3.6 Flash; Flash-Lite/Flash/Pro). The
  rendered page says "Flash model" [G1][G3][G4].
- Tasks access: "Ultra first access in select countries" (subscriptions page) vs Pro and Ultra
  (help) [G1][G3].
- Gemini Enterprise Business seat limit: up to 300 (marketing) vs 1–500 (docs) [G1][G9].
- Workspace intro offer: three months vs the first 20 users for 12 months, on the same page [G10].
- Carbon and Argon API price rise: 2026-11-30 (blog) vs 2026-12-01 (pricing page) [G5][G8].
- Plus availability: 160+ vs 150+ countries [G1].
- Ultra storage: 20 TB+ vs 30 TB on the top tier [G1][G4].
- Argon in Antigravity for Pro: the docs say supported; 10-13 press said Ultra only. The docs are
  taken [G6][G12].

**Perplexity**

- Max annual refund window: 72 hours (refunds article) vs 48 hours (Max article) [P3].
- Files per project on Pro: 50 (plan comparison) vs 10,000 (Projects article) [P3][P6].
- Education Pro price: $10 vs not stated [P3].
- Education Pro searches: "unlimited" vs weekly limits [P3].
- Enterprise Max price: $325 (help) vs "no price listed" (plan comparison) [P3].
- Training opt-out: a toggle in the help center vs none in the privacy notice [P6][P9].
- Advertising: the privacy notice describes cookie-based targeted ads; the cookie banner says no
  third-party ads on its services [P9][P1].
- Enterprise file retention: "automatic file deletion up to 1 day" (enterprise page) vs 7 days
  after attach (help). These may describe a configurable setting and its default; not settled
  [P9].

**AGI Workforce** [X1][X2][X4][X6]

- Production plan names, concurrency and storage differ from the tree.
- The site's platform table differs from Desktop packaging (§19).
- The ledger says cross-app dictation is declined; the code wires it.
- Two tier tables feed different limits.

### What could not be verified

- **OpenAI.** help.openai.com and openai.com blocked automated reading. Refunds, cancellation,
  ads, age, retention and Enterprise compliance details are therefore (ind). The Chat-tab model
  per plan, Auto routing, deep research quotas, upload limits and Android store data are unk.
  Items from releasebot for 11-04 to 11-10 were not checked against OpenAI originals.
- **Anthropic.** The consumer training default comes only from the pricing page's "Opt-out"
  label. The voice article was seen only as a search snippet. trust.anthropic.com rendered
  nothing. The consumer model picker, edit/branch, chat sharing and export are unk. India prices
  predate the Ultra rename. The Play listing was unreadable.
- **Google.** No numeric app limits are published. Live languages and screen share are unk.
  Whether Carbon is visible in the Ultra picker today, and whether the app is an MCP client, are
  unk. The Enterprise per-edition matrix, Plus annual price and trial terms are unk. The iOS
  price list is carried from 10-24.
- **Perplexity.** No web page states the Pro monthly price. Comet plan gating, context windows,
  data export, parental controls, ISO certifications, residency and EKM are unk. Several features
  are carried (Computer browser extension, Remote Access, 400+ connectors).
- **AGI.** Production commit `a8e278c62e` was not diffed against the tree, so per-feature live
  state on Web is unconfirmed. Ledger statuses date from 2026-09-26. Free media quotas are
  unknown (pool entries unreviewed). It is unsettled whether API batch and cache discounts reach
  users. No store listing or Marketplace item exists.
- **Across vendors.** No product UI was operated. Every "observed" row is a store listing or a
  rendered public page. Vendor benchmark claims (Fable 5.2, Carbon, Argon) are excluded as
  unverified.

---

## 21. Sources

URLs actually used, deduplicated. "learn" = https://learn.chatgpt.com/docs; help-center paths
are given as recorded by the readers.

**OpenAI**

- [O1] https://chatgpt.com/pricing (rendered)
- [O2] https://chatgpt.com/pricing/?type=team (rendered)
- [O3] learn/pricing
- [O4] learn/models ; learn/model-selection
- [O5] learn/web ; learn/app ; learn/use-chatgpt ; learn/get-started-with-work ; learn/personalize
- [O6] learn/remote-connections ; learn/mobile ; learn/computer-use
- [O7] learn/chrome-extension
- [O8] learn/dots
- [O9] learn/plugins ; learn/administration ; https://developers.openai.com/plugins/changelog
- [O10] learn/whats-new ; learn/changelog
- [O11] learn/cli ; learn/ide ; learn/cloud ; learn/code-review
- [O12] https://developers.openai.com/api/docs/pricing
- [O13] https://developers.openai.com/api/docs (models, changelog, guides/rate-limits)
- [O14] https://apps.apple.com/us/app/chatgpt/id6448311069
- [O15] https://marketplace.visualstudio.com/items?itemName=openai.chatgpt ; Chrome Web Store
  "ChatGPT" listing
- [O16] https://github.com/openai/codex/releases
- [O17] https://releasebot.io/updates/openai (indirect)
- [O18] Press (indirect):
  - https://engadget.com/2234173/chatgpt-free-features-2026
  - https://www.bleepingcomputer.com/news/artificial-intelligence/openai-doubles-chatgpt-pro-usage-limits-after-backlash-over-planned-50-percent-cut/amp/
  - https://thenextweb.com/news/openai-devday-pro-200-usage-cut-pro-500-plan
  - https://letsdatascience.com/news/openai-to-merge-chatgpt-chat-and-work-tabs-pool-codex-usage-a4ede6bc
  - https://www.axios.com/2026/03/24/openai-discontinue-sora-video-app
  - https://openai.com/blog/chatgpt-for-excel
  - https://marketplace.microsoft.com/en-ca/product/wa200010215
  - https://thenextweb.com/news/chatgpt-ads-expand-31-european-markets
  - https://the-decoder.com/openai-rolls-out-age-prediction-to-apply-teen-safeguards-in-chatgpt/
  - https://aiweekly.co/alerts/codex-users-say-openai-re-enabled-training-toggle-silently
  - https://www.digit.in/news/general/openai-is-retiring-chatgpt-pulse-and-replacing-it-with-scheduled-tasks-here-is-why.html
- [O19] help.openai.com snippets (indirect): articles 20001371, 20001559, 12703475, 5722486;
  https://help-lb.openai.com/en/articles/8914046-temporary-chat-faq
- [O20] https://openai.com/business-data/ (search summary, indirect) ;
  https://openai.com/index/premium-seats-chatgpt-business
- [O21] learn/space ; learn/features/voice

**Anthropic**

- [A1] https://claude.com/pricing (rendered)
- [A2] https://claude.com/download
- [A3] support.claude.com articles:
  - 11647753-how-do-usage-and-length-limits-work
  - 11049741-what-is-the-max-plan
  - 17728952
  - 12429409-extra-usage-for-paid-claude-plans
  - 11145838-using-claude-code-with-your-pro-or-max-plan
- [A4] support.claude.com 9266767-what-is-the-team-plan ; 9797531-what-is-the-enterprise-plan
- [A5] support.claude.com 15424964-claude-fable-models-on-your-plan
- [A6] support.claude.com 8241126-what-kinds-of-documents-can-i-upload-to-claude
- [A7] support.claude.com 11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context
- [A8] support.claude.com 13345190-getting-started-with-cowork
- [A9] support.claude.com 12012173-getting-started-with-claude-in-chrome
- [A10] https://code.claude.com/docs/en/ pages:
  - overview, desktop, feature-availability, model-config, routines
  - ultrareview, code-review, code-review-costs, slack, changelog
- [A11] https://platform.claude.com/docs/en/ pages: about-claude/models/overview,
  about-claude/pricing, api/rate-limits, release-notes/overview, manage-claude/data-residency,
  managed-agents/overview
- [A12] Privacy and terms:
  - https://privacy.claude.com/en/articles/10023548-how-long-do-you-store-my-data
  - https://privacy.claude.com/en/articles/10023580-is-my-data-used-for-model-training
  - https://privacy.claude.com/en/articles/12109829-how-do-i-change-my-model-improvement-privacy-settings
  - https://www.anthropic.com/legal/consumer-terms
  - https://www.anthropic.com/legal/aup
- [A13] claude.com blog and resources:
  - https://claude.com/blog/dashboards-and-motion
  - https://claude.com/resources/articles/sheets-whiteboards-data
  - https://claude.com/resources/articles/interactive-connectors-full-tool
  - https://claude.com/resources/articles/introducing-personal-finance-in-claude
  - https://claude.com/blog/claude-enterprise-security-updates
  - https://claude.com/blog/claude-duet
  - https://claude.com/blog
- [A14] https://www.anthropic.com/news/claude-fable-and-mythos-5-2 ; https://www.anthropic.com/news
- [A15] Store listings:
  - https://apps.apple.com/us/app/claude-by-anthropic/id6473753684
  - https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn
  - https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code
- [A16] https://claude.com/docs/office-agents/excel ; https://claude.com/docs/claude-tag/overview
- [A17] Indirect and certifications:
  - https://support.claude.com/en/articles/11101966-use-voice-mode (snippet)
  - https://www.eweek.com/news/anthropic-claude-voice-mode/
  - https://www.theregister.com/2026/02/04/anthropic_no_advertising_in_claude/
  - https://www.businesstoday.in/technology/news/story/anthropic-introduces-india-pricing-for-claude-ai-plans-pricing-starts-at-542742-2026-07-14
  - https://support.claude.com/en/articles/10015870-what-certifications-has-anthropic-obtained

**Google**

- [G1] https://gemini.google/subscriptions/ (rendered) ; https://gemini.google/in/subscriptions/?hl=en-IN
- [G2] Gemini product pages:
  - https://gemini.google/desktop
  - https://gemini.google/release-notes/
  - https://gemini.google/overview/canvas/
  - https://gemini.google/overview/deep-research/
  - https://gemini.google/overview/gemini-live/
  - https://gemini.google/overview/personal-intelligence/
- [G3] https://support.google.com/gemini/answer/ 16275805, 14903178, 18648722, 16596215, 13594961,
  16868299
- [G4] Google One and students:
  - https://one.google.com/about/ai-premium
  - https://support.google.com/googleone/answer/16286513
  - https://support.google.com/googleone/answer/17103110
  - https://support.google.com/googleone/answer/2736362
  - https://gemini.google/students/
- [G5] blog.google posts:
  - https://blog.google/products-and-platforms/products/google-one/google-ai-subscriptions/
  - https://blog.google/innovation-and-ai/products/gemini-app/gemini-4-availability
  - https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-carbon-now-available/
  - https://blog.google/innovation-and-ai/products/gemini-notebook/notebooklm-gemini-notebook/
  - https://blog.google/products-and-platforms/products/chrome/gemini-in-chrome-android-auto-browse/
- [G6] Antigravity:
  - https://antigravity.google/docs/getting-started
  - https://antigravity.google/docs/enterprise/
  - https://antigravity.google/docs/plans/
  - https://antigravity.google/docs/models/
  - https://antigravity.google/pricing
  - Blog posts: plugin-marketplace-in-antigravity, antigravity-voice-mode,
    antigravity-for-knowledge-work, gemini-4-carbon-in-google-antigravity,
    remote-control-for-antigravity, changes-to-antigravity-plans
- [G7] Code tools:
  - https://github.com/google-antigravity/antigravity-cli/releases
  - https://github.com/google-gemini/gemini-cli/releases
  - https://jules.google/docs/changelog/
  - https://jules.google/docs/usage-limits/
  - https://developers.google.com/gemini-code-assist/docs/deprecations
- [G8] https://aistudio.google.com/docs/pricing ; https://aistudio.google.com/docs/changelog ;
  https://aistudio.google.com/docs/rate-limits
- [G9] docs.cloud.google.com Gemini Enterprise pages: editions, release-notes,
  compliance-security-controls, security-overview; and
  https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/4-carbon
- [G10] https://workspace.google.com/pricing ;
  https://knowledge.workspace.google.com/admin/gemini/generative-ai-in-google-workspace-privacy-hub
- [G11] https://support.google.com/chrome/answer/16283624
- [G12] Press (indirect):
  - https://9to5google.com/2026/10/09/gemini-auto-free-users/
  - https://9to5google.com/2026/10/13/gemini-app-4-argon/
  - https://www.macrumors.com/2026/11/11/google-gemini-apple-carplay/
  - https://www.androidauthority.com/google-pixel-drop-november-2026-all-new-features-3733178/
  - https://www.eweek.com/news/google-gemini-enterprise-pay-as-you-go-pricing/

**Perplexity**

- [P1] https://www.perplexity.ai/pro (rendered) ; https://www.perplexity.ai/comet (rendered)
- [P2] https://www.perplexity.ai/hub/pricing
- [P3] Help center, plans and billing (https://www.perplexity.ai/help-center/en/articles/):
  - 11187416-which-perplexity-subscription-plan-is-right-for-you
  - 11680686-perplexity-max
  - 12590157-what-is-education-pro
  - 10352986-enterprise-pricing-and-billing-frequently-asked-questions
  - 12310544-what-is-enterprise-max
  - 10353002-billing-faq-for-pro-plan-subscribers
  - 10354288-refunds
  - 13182759-paying-in-local-currency
- [P4] Help center, Computer:
  - 13838041-how-credits-work-on-perplexity
  - 13837784-what-is-computer
  - 14659663-what-is-personal-computer
  - 20260915-what-is-portable-computer
  - 20260917-effort-mode-in-perplexity-computer
  - 20260715-computer-in-email
  - 11521526-perplexity-tasks
- [P5] Help center, models and research: 10354919, 10738684, 13600190, 13641704, 2026102603,
  10352906
- [P6] Help center, other articles:
  - Memory and projects: 10968016 (memory), 10352961 (projects), 19700001 (Brain),
    2026102601 (Teammates)
  - Files: 10354807, 10354810
  - Extensibility: 2026100701 (plugins), 13914413 (skills)
  - Other: 2026110501 (voice), 14035438 (Health); collection 18799299 (mobile apps)
- [P7] https://www.perplexity.ai/changelog ;
  https://www.perplexity.ai/changelog/teammates-fully-local-computer-on-mac-and-voice-mode
- [P8] https://docs.perplexity.ai pages: llms.txt, getting-started/pricing, agent-api/models.md,
  admin/rate-limits-usage-tiers.md, resources/changelog.md,
  agent-api/migrate-from-sonar/overview.md
- [P9] Legal, enterprise and compliance:
  - https://www.perplexity.ai/hub/legal/privacy-policy
  - https://www.perplexity.ai/hub/legal/terms-of-service
  - https://www.perplexity.ai/enterprise
  - Help center articles 10352973, 14714627, 12781449, 10354873, 10354963
- [P10] Store listing and Comet help:
  - https://apps.apple.com/us/app/perplexity-ask-anything/id1668000334
  - https://www.perplexity.ai/help-center/comet/en/articles/13860420-voice-mode.md
  - Comet help article 11734688-assistant-panel; Comet help 12867415, 12867356
- [P11] Press (indirect): TechCrunch 2026-08-18 and other India-pricing coverage, via search

**AGI Workforce (repository, read 2026-11-11)**

- [X1] Observed production: https://agiworkforce.com/pricing ; /download ; /api/version ;
  /api/health
- [X2] `packages/contracts/types/src/billing-catalog.ts` ; `billing-plan-catalog.ts`
- [X3] `packages/contracts/types/src/managed-usage-limits.ts` ; `credits.ts` ; `billing-topups.ts`
  ; `usage-limit-promotions.ts`
- [X4] `apps/web/lib/surface-status.ts` ; `apps/desktop/electron-builder.yml` ;
  `.github/workflows/release-*.yml`
- [X5] `packages/contracts/types/src/models.json` ;
  `packages/ai/model-registry/catalog/model-families.json` ; `routing-policies.json` ;
  `packages/contracts/types/src/model-catalog.ts`
- [X6] `audit/ledger/ecosystem-capability-ledger.jsonl` (audited 2026-09-26) and the code paths
  cited in the internal research notes for each feature
- [X7] `audit/registers/known-flaws.md`
- [X8] `docs/product/surface-feature-matrix.json`
- [X9] `apps/web/app/trust/page.tsx` ; `apps/web/app/data-use/page.tsx` ;
  `apps/web/app/privacy/page.tsx` ; `apps/web/app/refund-policy/page.tsx` ;
  `packages/contracts/types/src/account-eligibility.ts`
- [X10] `packages/contracts/types/src/connector-release.ts` ;
  `apps/web/lib/connectors/directory/sources/`
- [X11] `apps/cli/README.md` ; `apps/extension-vscode/package.json` ;
  `apps/extension/manifest.json`
- [X12] `apps/mobile/app.config.js` ; `apps/mobile/src/features/billing/storePurchases.json` ;
  `apps/mobile/lib/v1FeatureFlags.ts`
- [X13] `packages/contracts/types/src/feature-registry.json` ;
  `apps/desktop/electron/runtime/computerUseService.ts`
