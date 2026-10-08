# AGI Workforce: product capability status

**Code at:** `21d439536dde221fe072757ac939c3eb6fccbe6d` (branch snapshot pinned for the whole audit)
**Date:** 2026-09-27
**Audience:** the founder. Plain answers to four questions: what the product can do, what it can't, what's half-built and what's left to build, and what can only be settled by using the live product.

Snapshot of the code audit of `21d4395` (2026-09-26). The open work it summarises lives in `audit/blockers/`, `audit/missing/`, `audit/partial/`, `audit/flows/`, `audit/decisions/` and `audit/live-check/`; delete this file together with the last of those.

## 1. How this was produced

- **Method.** A code-only audit of the 3,435-item capability inventory, across eight surfaces: the web app, the desktop app (the public Electron build, not the internal Tauri app), the iOS/Android app, the terminal CLI, the VS Code extension, the Chrome extension, the public HTTP API, and the shared backend ("platform"). For every item and surface, auditors wrote down the behaviour a user would observe, then followed the code from the entry point through the handler and service to storage. A feature counts as **done** only when that whole chain exists and is reachable from a mounted screen, command or route.
- **Who did it.** Opus 5.5 auditors did every section. Fable 5.1 reviewers then did an adversarial second pass on the high-risk sections. They re-ran searches behind "missing" verdicts, tried to refute "done" verdicts, and swept every item for lazy or copied answers. An arbiter settled every disputed cell (0 remain contested; 196 overrides). The tables below are generated from the final merged ledger.
- **What the statuses mean.** _Done_: works end to end in code on that surface. _Partial_: some of it works, and the `remaining` text says exactly what's missing. _Missing_: nothing on that surface does it (every missing verdict needed at least three kinds of search). _N/a_: the capability doesn't apply to that surface, or the surface only links out to a web feature that exists. _Unverified_: code can't settle it, so it's queued for a live check. _Declined_: a recorded product decision says we won't build it. Three caps apply across the audit:
  - **Flag-off.** A feature behind a default-off flag, an invite or waitlist gate, or operator-only config is at most partial.
  - **Pending migration.** A feature that needs a database migration newer than 0273 is at most partial. 0273 is what `scripts/config/production-migrations-applied.json` records for production. See the migration caveat in §2.5.
  - **Needs the local CLI.** VS Code chat and desktop local coding sessions run on the AGI CLI, which isn't published. Those cells are judged on whether the code works, and they carry a `needs-local-cli` note. The surface-level fact is reported once, in §2.8 and §9.
- **Second-reviewed sections:** §3 Authentication and onboarding screens, §4 Signed-in application destinations, §5 Application shell and navigation components, §12 New-chat experience, §13 Composer text interaction, §14 Attachment intake components, §15 Model-selector interface, §16 User-message components, §17 Assistant-message components, §18 Conversation-level controls, §20 Markdown and text rendering, §21 Code blocks and executable code presentation, §23 Project workspace, §26 Artifact container and panel, §27 Document and writing editor, §28 Code Canvas and application preview, §34 Search experiences, §37 Notebook and knowledge-workspace product, §38 Learning and study products, §39 Memory product, §48 Voice conversation interface, §49 Dictation, transcription, and recording, §50 Audio overviews, speech generation, and music, §51 Voice-agent builder and telephony extensions, §55 Connector setup and account management, §56 Concrete integration families, §57 Tool catalog and invocation experience, §58 MCP and interactive extension products, §59 Approvals and human-in-the-loop UI, §60 Agentic work product, §61 Persistent agents and agent rosters, §62 Multi-agent and multi-model interfaces, §63 Routines, schedules, and triggers, §64 Browser-assistant experience, §65 Computer-use experience, §66 Coding-workspace frontend, §67 Coding capabilities and developer workflows, §68 Session continuity and remote-session product, §70 Desktop application, §71 Mobile application, §72 CLI and terminal application, §73 VS Code and IDE extension, §74 Browser extension, §76 Model-capability registry, §78 UI gating and adaptation components, §81 Free / Basic / Pro / Max 5x / Max 15x planning structure, §82 Usage dashboard and limit UI, §83 Billing and subscription screens, §85 Personalization and data settings, §86 Security and connected-access settings, §87 Enterprise administration screens, §88 Support, trust, and policy product, §89 Account and access components, §92 Tool-calling and agent-loop components, §96 Artifact and generated-application components, §97 Media and realtime components, §99 Coding and local-runtime components, §100 Commercial and administrative components, §103 Data and persistence categories, §105 Developer platform and console, §109 Optional native and ambient extensions.
- **Single-pass sections (not second-reviewed):** §2 Public website and acquisition screens, §6 Visual foundations and spacing conventions, §7 Layout systems, §8 Basic interactive elements, §9 Compound interface components, §10 Modal and dialog inventory, §11 Accessibility and localization components, §19 Streaming and response-presentation states, §22 Rich answers and structured result widgets, §24 Library and file-management experience, §25 File previews and readers, §29 Spreadsheet and data-analysis workspace, §30 Presentation workspace, §31 PDF and document-transformation products, §32 Design workspace, §33 Generated Sites and published applications, §35 Research workspace, §36 Sources and grounding interface, §40 Instructions, preferences, and personal style, §41 Temporary and private experiences, §42 Proactive assistance, briefings, and reflection, §43 Image and visual understanding, §44 Image-generation studio, §45 Image editor, §46 Video-generation studio, §47 Video editing and media continuity, §52 Custom-assistant builder, §53 Skill creation and management, §54 Plugin marketplace and customization, §69 Web application, §79 Routing and model-neutral orchestration, §84 General and appearance settings, §90 Conversation and synchronization components, §91 Model and inference components, §93 Search, retrieval, and context components, §94 Memory and personalization components, §95 File and Library components, §98 Integration and extensibility components, §101 Shared package boundaries, §102 Runtime inventory, §104 Named technology options-not claims about competitor internals, §106 Office, collaboration-channel, and email surfaces, §107 Discovery, social, and public-content products, §108 Specialist workspaces, §110 Cross-product experiences to include in the product map. These went through the auditor pass plus lead and arbiter rulings. Treat their done verdicts with a little more caution. The founder chose to stop new second passes and get findings out first.
- **Live evidence.** One Codex browser run (2026-09-25, web only, Free plan, same commit) is attached as runtime evidence. The checkout it ran against had 18 uncommitted privacy-disclosure edits, so results on those screens reflect uncommitted code. Live results never change a code status. They are shown next to it (§8).

### Overall item rollup

An item's rollup is its best status across the surfaces where it applies. "Partial" at item level often means one surface is done and the others aren't. The per-surface tables in §3 are the better guide.

| group                                                        | done | partial | missing | unverified | n/a | declined | unaudited | total |
| ------------------------------------------------------------ | ---: | ------: | ------: | ---------: | --: | -------: | --------: | ----: |
| A. Product surfaces and screen inventory                     |   37 |     108 |      14 |          1 |   0 |        0 |         0 |   160 |
| B. Design system, layouts, and reusable UI                   |   61 |     165 |       5 |          0 |   0 |        0 |         0 |   231 |
| C. Chat, composer, messages, and rendering                   |   55 |     258 |      40 |          0 |   0 |        0 |         0 |   353 |
| D. Files, Projects, Library, and artifacts                   |   12 |     197 |     175 |          0 |   0 |        0 |         0 |   384 |
| E. Search, Research, notebooks, Memory, and learning         |    2 |     177 |      93 |          0 |   0 |        0 |         0 |   272 |
| F. Multimodal understanding, generation, and voice           |    4 |     135 |     145 |          1 |   0 |        0 |         0 |   285 |
| G. Custom assistants, Skills, Plugins, connectors, and tools |   15 |     225 |      53 |          0 |   0 |        0 |         0 |   293 |
| H. Agents, tasks, browser operation, and coding              |   11 |     232 |      49 |          0 |   0 |        0 |         0 |   292 |
| I. Platform-specific product surfaces                        |  108 |      50 |      20 |          0 |   1 |        0 |         0 |   179 |
| J. Model capabilities and feature gating                     |   28 |      62 |       7 |          0 |   0 |        0 |         0 |    97 |
| K. Subscription, usage, billing, and commercial product      |   15 |      73 |       6 |          0 |   0 |        0 |         0 |    94 |
| L. Settings, account management, enterprise, and support     |   16 |     108 |      13 |          1 |   4 |        3 |         0 |   145 |
| M. Backend product components                                |  218 |      75 |      37 |          3 |   2 |        0 |         0 |   335 |
| N. Shared packages, runtimes, and implementation choices     |   89 |      54 |       4 |          0 |   0 |        0 |         0 |   147 |
| O. Additional ecosystem products that are easy to miss       |    9 |      91 |      63 |          0 |   2 |        3 |         0 |   168 |
| **all**                                                      |  680 |    2010 |     724 |          6 |   9 |        6 |         0 |  3435 |

## 3. What works today

The tables show cells by surface for each product group. A cell is one item on one surface. Web and desktop usually match, because the desktop app shows the hosted web app (desktop credit comes from web code or Electron-native code, never from the internal Tauri app).

### A. Product surfaces and screens

The web app's signed-in destinations, settings screens, shell and navigation all work, apart from the crash on `/` for signed-in users (§2.7). The public site renders: homepage, pricing, product pages, CLI and desktop pages, trust and legal. Web sign-in works with passkeys, social and SSO. Several mobile sign-in flows are queued for a device check. Desktop sign-in breaks for GitHub and some SSO providers (§2.16). Mobile has a full app shell but hides its bottom tab bar (§7). The Models catalogue on web has no navigation entry, so Free users reach it only by URL.

_Cells by surface (generated):_

| surface | done | partial | missing | unverified | n/a |
| ------- | ---: | ------: | ------: | ---------: | --: |
| web     |   97 |      38 |      21 |          1 |   3 |
| desktop |   74 |      30 |      13 |          2 |  41 |
| mobile  |   56 |      29 |      19 |          9 |  47 |
| cli     |   31 |      19 |      33 |          1 |  76 |
| vscode  |   29 |      21 |      34 |          0 |  76 |
| chrome  |   27 |      19 |      40 |          0 |  74 |
| api     |    3 |       1 |       0 |          0 | 156 |

### B. Design system and components

Web has a real appearance suite, and the shared component library covers most of what the inventory asks for. Every `role="menu"` uses the keyboard helper. The weak spots are contrast (§2.15) and accessibility details:

- Web screen readers read every streamed answer twice.
- Mobile announces no replies at all.
- i18n is mostly scaffolding: the translated error strings have no callers, and Chrome is English only.
- About 107 web files use physical spacing, which breaks right-to-left layouts.
- VS Code sends on Enter in the middle of IME composition.
- Currency and dates are hard-coded en-US.

_Cells by surface (generated):_

| surface | done | partial | missing | unverified | n/a |
| ------- | ---: | ------: | ------: | ---------: | --: |
| web     |  169 |      42 |      11 |          2 |   7 |
| desktop |  173 |      43 |       9 |          2 |   4 |
| mobile  |  115 |      54 |      35 |          4 |  23 |
| cli     |   76 |      33 |      38 |          0 |  84 |
| vscode  |  100 |      34 |      44 |          2 |  51 |
| chrome  |   85 |      36 |      57 |          4 |  49 |
| api     |    0 |       0 |       0 |          0 | 231 |

### C. Chat, composer, messages and rendering

Chat is the strongest area.

- **Web and desktop model picker.** It's complete on paid plans: search, favourites, Auto, capability, context and price hints, "leaving on" dates, "try again with", "answered by", and a fallback notice.
- **Rendering.** Web renders nearly all Markdown, code blocks with copy, citation chips with hover, charts, Mermaid, comparison cards, approval cards, clarify questionnaires and MCP app panels.
- **Mobile, CLI and VS Code** carry solid chat.
- **Chrome.** The side panel's hand-rolled Markdown renderer mangles code: `__init__` becomes bold, and fenced lists turn into bullets. The second reviewer found this and overturned several Chrome "done" cells.

Known chat defects:

- An unsent draft is lost when you go to Projects and back. Live QA reproduced it, and the second reviewer confirmed it in code.
- Retrying a failed answer shows two inconsistent errors.
- Mobile renders "$5" as "\$5", and a sentence like "between $5 and $10" as broken math.
- "Try again with X" moves the whole conversation to X, not just that turn. The second reviewer caught this.

_Cells by surface (generated):_

| surface | done | partial | missing | unverified | n/a |
| ------- | ---: | ------: | ------: | ---------: | --: |
| web     |  220 |      68 |      60 |          3 |   2 |
| desktop |  223 |      66 |      60 |          3 |   1 |
| mobile  |  154 |      74 |     114 |          4 |   7 |
| cli     |  123 |      68 |     142 |          2 |  18 |
| vscode  |  120 |      56 |     160 |          3 |  14 |
| chrome  |   77 |      61 |     197 |          1 |  17 |
| api     |   31 |       0 |       2 |          0 | 320 |

### D. Files, Projects, Library and artifacts

- **Projects.** Projects work as the knowledge workspace: instructions, uploads, source-grounded chat, and citations that open the file at the page. But uploads are blocked for Free and seat users (§2.6), and on production all uploads may be refused (§5).
- **Artifacts.** The artifact panel works on web: HTML/React preview, source view, zip download, one-step unlisted publish, republish to the same link, and moderation. The office tool writes .docx, .xlsx, .pptx and .pdf files.
- **Library.** Library basics work: type filters, search and download.
- **Not built:** a document editor (Edit is a raw Markdown textarea), a spreadsheet grid, a deck editor, a design workspace and a code IDE.
- **Archiving a project unfiles all its chats.** It happens without confirmation, and unarchiving restores an empty project.

_Cells by surface (generated):_

| surface | done | partial | missing | unverified | n/a |
| ------- | ---: | ------: | ------: | ---------: | --: |
| web     |   76 |     115 |     191 |          1 |   1 |
| desktop |   75 |     117 |     190 |          1 |   1 |
| mobile  |   36 |      74 |     269 |          1 |   4 |
| cli     |   23 |      38 |     211 |          0 | 112 |
| vscode  |   30 |      28 |     245 |          1 |  80 |
| chrome  |    7 |      32 |     270 |          0 |  75 |
| api     |    0 |       0 |       0 |          0 | 384 |

### E. Search, research, notebooks, memory and learning

- **Deep Research on web works end to end:** plan editing, site limits, progress, stop, partial report, a reader with contents and linked citations, and Markdown/PDF/Word export. The citation UI is strong. The retrieval stack is real: hybrid search, reranking, access-scoped results, and temporary and archived chats excluded from the index.
- **Memory** reads work everywhere, but writes fail on production (§2.4).
- **Study mode works in the web chat.** The audit found it broken end to end: a missing CSRF token made "Start studying" return 403, and the study instructions never reached the model. Both are fixed: the token is sent (`3c16cbd0ec`), the active study instruction is added as a developer layer in `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`, and study now runs inside the chat (`44a980b4c1`, `0c9e84472e`).
- **There is no notebook product.** Projects stand in for one.
- **Chrome's plain chat never searches the web.** CLI and VS Code search needs the user's own `SEARCH_API_KEY`.

_Cells by surface (generated):_

| surface | done | partial | missing | unverified | n/a |
| ------- | ---: | ------: | ------: | ---------: | --: |
| web     |   93 |      77 |     102 |          0 |   0 |
| desktop |   93 |      77 |     102 |          0 |   0 |
| mobile  |   61 |      60 |     151 |          0 |   0 |
| cli     |   26 |      41 |     204 |          0 |   1 |
| vscode  |   16 |      43 |     207 |          0 |   6 |
| chrome  |   18 |      43 |     211 |          0 |   0 |
| api     |    0 |      12 |       1 |          0 | 259 |

### F. Images, video and voice

- **Web image generation, editing and variation work,** with a Transparent option. The mask for mask editing has to be uploaded, because there's no brush. Video generation works on web, desktop and mobile for the top plans. The media job pipeline is solid: queue, signed webhook, private storage and provenance.
- **Live voice works on web and mobile.** It can't hand off to a task, write a document or honour approvals.
- **Dictation works on web, mobile and Chrome.** On the CLI, voice needs a special build and your own key.
- **Image input on web, desktop and mobile** goes through the upload scanner gate (§5).
- **Not built:** audio overviews, music, server text-to-speech, telephony and a voice-agent builder.
- **Seat users are refused media** (§2.6), and Stop doesn't stop billing (§2.14).

_Cells by surface (generated):_

| surface | done | partial | missing | unverified | n/a |
| ------- | ---: | ------: | ------: | ---------: | --: |
| web     |   55 |      74 |     152 |          2 |   2 |
| desktop |   55 |      73 |     154 |          2 |   1 |
| mobile  |   44 |      75 |     164 |          2 |   0 |
| cli     |   18 |      44 |      96 |          0 | 127 |
| vscode  |   11 |       3 |      65 |          0 | 206 |
| chrome  |   15 |       1 |     202 |          1 |  66 |
| api     |   15 |       2 |      57 |          0 | 211 |

### G. Assistants, skills, plugins, connectors and tools

- **Connectors are locked as coming soon** for every account, behind `connectorsReleased()` in `packages/contracts/types/src/connector-release.ts` (`0367c4b140`). The connector bullets below describe the code behind that switch.
- **Connectors.** Web has a complete connector directory with OAuth, scope explanations and per-conversation connector switches. It has a complete MCP Apps host, which contradicts an older checklist.
- **Pinned connectors work:** Box, Jira, Asana, HubSpot, Intercom, Figma, Vercel and Slack. Gmail, Google Calendar, Drive, Sheets, Teams, GitLab, BigQuery and Epic/Cerner exist only when the operator configures them (§5).
- **Custom MCP servers:** the CLI adds local and remote servers; web adds remote ones.
- **Tool calling is strong on the server:** approval checkpoints bound to the exact call, a 24-hour expiry, idempotency keys, durable runs and run budgets.
- **Custom assistants exist only in the CLI,** as file-based agents with no edit or delete.
- **Personal skills are on by default on web** since `ffa5965f88`; `AGI_USER_SKILL_AUTHORING=0` is only an off switch. The audit found them off by default with an Upload button that failed.

Connector defects:

- A second account on the same connector overwrites the first.
- An expired connector offers only "Disconnect", which deletes its permissions.
- The OAuth scope allowlist blocks tools that are advertised: Gmail drafts and labels, and Slack search.

_Cells by surface (generated):_

| surface | done | partial | missing | unverified | n/a |
| ------- | ---: | ------: | ------: | ---------: | --: |
| web     |  106 |      95 |      79 |          6 |   7 |
| desktop |  113 |      93 |      77 |          6 |   4 |
| mobile  |   63 |      72 |     143 |          6 |   9 |
| cli     |   78 |      82 |     120 |          3 |  10 |
| vscode  |   45 |      56 |     166 |          0 |  26 |
| chrome  |   46 |      52 |     138 |          6 |  51 |
| api     |    2 |      28 |       5 |          0 | 258 |

### H. Agents, tasks, browser and coding

- **The CLI is the strongest coding agent.** Through it, desktop local sessions and VS Code cover most coding tasks, and sessions hand off between CLI, desktop, VS Code and phone on the same machine. These all need the unpublished CLI (§2.8).
- **GitHub App PR review works** automatically on open, push and mention. It never acts on replies.
- **Desktop computer use works end to end on macOS.** One session-long grant covers every action, which contradicts the "every device step asks" marketing, and there is no emergency stop.
- **AGI Work (agentic tasks) runs on web,** but its step list shows every step green even for failed runs.
- **Web cloud Code is off by default,** and its cloud agent has no file-write tool.
- **Chrome's browser agent can only be reached through the job-form Autofill fallback.** You can't give it a goal.
- **Routines can be created everywhere, but every run fails** (§2.3).

_Cells by surface (generated):_

| surface | done | partial | missing | unverified | n/a |
| ------- | ---: | ------: | ------: | ---------: | --: |
| web     |   35 |      87 |     154 |          0 |  16 |
| desktop |   74 |      90 |     123 |          0 |   5 |
| mobile  |   38 |      82 |     135 |          0 |  37 |
| cli     |   83 |      77 |      98 |          0 |  34 |
| vscode  |   74 |      48 |     108 |          0 |  62 |
| chrome  |   25 |      43 |     103 |          0 | 121 |
| api     |    0 |       2 |       0 |          0 | 290 |

### I. Platform-specific surfaces

- **CLI:** strong. It has a TUI, slash commands, usage, sessions, agents, MCP and an updater.
- **VS Code:** solid. It has inline completions (opt-in), sessions and the artifacts tree.
- **Chrome:** strong as page-context chat, with per-site permissions, approvals and a downloads review.
- **Mobile:** real on-device models, iOS App Shortcuts, and the desktop companion (steer, stop and approve a desktop session).
- **Desktop:** a daily update check (link-only), computer use and dictation. Quick Ask has no preload, so dictation silently fails there.

_Cells by surface (generated):_

| surface | done | partial | missing | unverified | n/a |
| ------- | ---: | ------: | ------: | ---------: | --: |
| web     |   12 |       6 |       2 |          0 | 159 |
| desktop |   15 |      12 |       6 |          0 | 146 |
| mobile  |   18 |      10 |       4 |          0 | 147 |
| cli     |   27 |      11 |       0 |          0 | 141 |
| vscode  |   24 |       6 |       0 |          0 | 149 |
| chrome  |   15 |       5 |       8 |          0 | 151 |
| api     |    0 |       0 |       0 |          0 | 179 |

### J. Models and feature gating

- **Routing.** The model registry is rich, and the server router is solid: registry-driven Auto, failover, the exact model honoured, and enforced residency. Chat enforces plan tiers correctly. Code doesn't (§2.2).
- **Structured output.** It is prompt-only on the public API: `json_schema` is refused.
- **Thin clients.** They don't show limits, and Chrome silently falls back to Auto.
- **Stored but unused.** The project default model is stored but never applied.

_Cells by surface (generated):_

| surface | done | partial | missing | unverified | n/a |
| ------- | ---: | ------: | ------: | ---------: | --: |
| web     |   58 |      28 |       7 |          0 |   4 |
| desktop |   59 |      27 |       7 |          0 |   4 |
| mobile  |   54 |      22 |      15 |          0 |   6 |
| cli     |   43 |      28 |      22 |          0 |   4 |
| vscode  |   39 |      22 |      30 |          0 |   6 |
| chrome  |   39 |      23 |      28 |          0 |   7 |
| api     |   43 |      16 |       9 |          0 |  29 |

### K. Plans, usage and billing

- **Metering is solid.** Reservations with leases and idempotency, settlement at actual cost, a recovery cron, and separate billed and provider cost all work.
- **Usage meters work on every surface,** including `agi usage`, VS Code, Chrome and `GET /api/usage`. Voice, image and video usage is capped server-side but never displayed.
- **Paid checkout is waitlist-gated.** A first purchase needs a `beta_redemptions` row, or it returns 403 (`apps/web/app/api/checkout/route.ts:208-220`). Mobile in-app purchase is off.
- **Other billing gaps:**
  - Invite-code trials never expire.
  - The catalogue version isn't saved on subscriptions, so grandfathered users get today's allowances.
  - A payment dispute revokes the plan, but nothing restores it when the dispute is won.
  - Pricing says Chrome needs Pro, but the server lets Free use it.

_Cells by surface (generated):_

| surface | done | partial | missing | unverified | n/a |
| ------- | ---: | ------: | ------: | ---------: | --: |
| web     |   35 |      52 |       6 |          0 |   1 |
| desktop |   35 |      52 |       6 |          0 |   1 |
| mobile  |   13 |      51 |       6 |          0 |  24 |
| cli     |    9 |      15 |       0 |          0 |  70 |
| vscode  |   14 |      11 |       0 |          0 |  69 |
| chrome  |    6 |      13 |       0 |          0 |  75 |
| api     |   14 |      11 |       2 |          0 |  67 |

### L. Settings, account, enterprise and support

- **Enterprise administration on web is broad:** SSO (including editing), SCIM, custom roles enforced on organization routes, audit logs, legal holds, eDiscovery, retention, data region (read-only), a spend cap and support-access approval. The security-priority items from the earlier re-audit are fixed or classified: custodian legal holds versus erasure, eDiscovery rows versus organization erasure, and the audit-table erasure classification.
- **Support** runs through tickets, which work. The AI support widget is never mounted.
- **Weak spots:**
  - The evidence portal is empty (§7).
  - Customer-managed keys can be managed only through the API.
  - The "Hooks" access switch isn't enforced.
  - The CLI never reads the workspace connector policy.
  - Mobile offers the Owner role, which the server rejects.

_Cells by surface (generated):_

| surface | done | partial | missing | unverified | n/a |
| ------- | ---: | ------: | ------: | ---------: | --: |
| web     |   70 |      39 |      17 |          1 |  18 |
| desktop |   73 |      42 |      18 |          2 |  10 |
| mobile  |   30 |      27 |      31 |          1 |  56 |
| cli     |    9 |      28 |      71 |          0 |  37 |
| vscode  |   11 |      10 |      41 |          0 |  83 |
| chrome  |   12 |      16 |      46 |          0 |  71 |
| api     |    8 |       4 |       0 |          0 | 133 |

### M. Backend components (platform)

The backend is where most "done" lives:

- identity and access
- conversation sync to mobile and CLI
- inference and routing
- the tool loop
- retrieval
- the media pipeline
- artifact publishing and moderation
- the local coding runtime
- metering

Most of what's partial here traces to pending migrations (§2.3-2.5), the approval-gate gaps (§2.1), and tables that exist with no code writing to them. The tables with no writer are: account sessions, device installations, workspaces, chat folders, agent tool executions, agent approval requests, support cases, organization usage ledger and shared conversations.

_Cells by surface (generated):_

| surface  | done | partial | missing | unverified | n/a |
| -------- | ---: | ------: | ------: | ---------: | --: |
| platform |  218 |      75 |      37 |          3 |   2 |

### N. Shared packages and runtimes

- **Guards.** The guards exist but allow a baseline of known exceptions. For example, private vocabulary is copied 99 times, 29 of them in shipped clients.
- **Sharing across clients.** Nothing is shared by all six clients. The CLI hand-writes its wire structs with no parity check.
- **Heavy editors.** Monaco and xterm ship only in the internal Tauri app. The Tiptap composer is off by default.
- **Real-time editing.** There's no real-time co-editing (CRDT) layer.

_Cells by surface (generated):_

| surface  | done | partial | missing | unverified | n/a |
| -------- | ---: | ------: | ------: | ---------: | --: |
| platform |   89 |      54 |       4 |          0 |   0 |

### O. Ecosystem products

- **Developer console.** It has scoped API keys, service principals, usage and cost history, an enforced spend cap on every metered route, API docs and `openapi.json`, support tickets and private plugin upload. Keys made in the product never expire.
- **Office and collaboration.** There's no Office or Workspace add-in and no Teams bot. Slack events reach a routine trigger, but nothing replies, and the run fails (§2.3).
- **Public gallery.** It shows only your own artifacts plus static examples, and its build wizard loses the prompt (`apps/web/app/gallery/GalleryClient.tsx:1247`).

_Cells by surface (generated):_

| surface | done | partial | missing | unverified | n/a |
| ------- | ---: | ------: | ------: | ---------: | --: |
| web     |   12 |      55 |      72 |          0 |  29 |
| desktop |   16 |      54 |      76 |          0 |  22 |
| mobile  |    6 |      27 |      68 |          0 |  67 |
| cli     |    6 |      13 |      25 |          2 | 122 |
| vscode  |    1 |       9 |      24 |          0 | 134 |
| chrome  |    1 |      18 |      55 |          0 |  94 |
| api     |    2 |       3 |       4 |          0 | 159 |

## 9. Per-surface verdicts

**Web.** The flagship, and the only surface with the full feature set: chat, model picker, rich rendering, Deep Research, projects, artifacts and publishing, image and video, live voice, connectors with an MCP Apps host, AGI Work, routines, and the whole enterprise console. Its release risk is not missing features but broken wiring:

- the signed-in `/` crash
- approval-gate bypasses
- scheduled runs and memory writes failing on the production schema
- seat users refused storage and media
- a waitlist in front of every paid checkout
- uploads refused unless the malware scanner is configured

Fix §2 and web is a credible product.

**Desktop (Electron).** Mostly the hosted web app in a native window, so it inherits web's strengths and defects. Its native value is:

- computer use on macOS, which works but with one session-long grant and no emergency stop
- dictation
- local coding sessions and the phone companion

Local sessions spawn an unpublished CLI from PATH, so a customer can't use them. It ships without an app icon, has no published installer, breaks GitHub and some SSO sign-ins, can't review or revoke "Always allow" grants, and silently drops Chrome's page capture and the phone's "Start on Desktop". Not releasable as a native product until the CLI ships and those gaps close.

**Mobile.** A real app. It has cloud chat that syncs with web, live voice, dictation, image and video generation, real on-device models, iOS App Shortcuts, and a solid desktop companion. The gaps:

- in-app purchase is off
- project sync is off
- the tab bar is hidden
- replies aren't announced to screen readers
- Stop doesn't cancel billed media jobs
- the memory switch works only on the device
- the "$5" rendering bug
- several contrast failures

**CLI.** The deepest coding agent in the product, and the engine behind desktop local sessions and VS Code. It covers sessions, agents, MCP, usage, file-based custom assistants, output styles and managed-cloud sync of sessions. But it isn't published: no signed release exists, so the installer refuses. Its approval setting is dead, web search needs your own key, and voice needs a special build. Publishing it unlocks three surfaces at once.

**VS Code.** Good editor integration: inline completions (opt-in), explain and send selection, sessions shared with CLI and desktop, an artifacts tree, schedules and account usage. The chat runs entirely on the unpublished CLI. It also has these defects:

- the `/` menu runs only six built-ins
- unsaved edits are dropped
- attachment removal fails for odd filenames
- its memory "off" switch doesn't stop the runtime
- it has no per-answer copy or feedback

**Chrome.** Strong as a page-context assistant: per-site permissions, approvals, downloads review and service-worker recovery. Weak as a general assistant:

- its plain chat never searches the web
- its Markdown renderer mangles code
- it can't start AGI Work or give its browser agent a goal
- it never renders generated files or images
- contrast fails on links and buttons

**API.** A working OpenAI-style `/api/llm/v1` endpoint, with scoped keys, an enforced spend cap, usage history, `openapi.json` and 429 rate-limit headers. The gaps:

- structured output is prompt-only, and `json_schema` is refused
- media, web fetch and research flags aren't documented
- account memory is silently injected
- product-made keys never expire
- `/v1/models` has no deprecation data

**Platform (backend).** The strongest layer. Identity, sync, routing, the tool loop, retrieval, the media pipeline, publishing and moderation, and metering are real and mostly test-guarded. Erasure tests parse every migration and fail on unclassified tables. Its problems are:

- concentrated in code that ran ahead of production migrations (0280-0290)
- the approval gate's missed paths
- tables that exist with no code writing to them

## Where the second reviewer changed the answer

The Fable second pass overturned or corrected the first audit in these places. The ledger already reflects them.

- **Composer.**
  - Unsent-draft restore on web and desktop was "done" but isn't (confirms the live finding).
  - "Try again with X" switches the whole conversation.
  - Chrome "Quick" and CLI `/fast` swap models rather than using a faster tier.
- **Rendering.** Chrome's renderer mangles code, so several Chrome done cells were downgraded. VS Code ordered lists show bullets. The mobile currency defect is worse than first reported.
- **Memory and privacy.**
  - VS Code's memory switch doesn't stop the CLI runtime, and the CLI loses memory outside managed mode.
  - Both were downgraded.
- **Identity.** Desktop permission setup was downgraded to partial, web passkeys to partial (no rename), and several CLI, VS Code and Chrome sign-in cells were changed from n/a to missing, because the web feature they linked to doesn't exist.
- **Coding and sessions.**
  - Managed-mode CLI sessions _do_ sync to the account history, which corrected the "local threads never appear on web" boilerplate.
  - The web device-unlink relay defect was found.
  - Desktop turn-diff was upgraded to done.
- **Tools.**
  - The deep-research loop's missing gate was found.
  - Malformed tool-call JSON executing as raw input was reproduced.
- **Connectors.**
  - The bulk "flag-off" on preregistered connectors was rejected, because a credential alone is a secret, not a gate.
  - CLI and VS Code connector cells were set to partial, because only Always-allow tools run.
- **Other overturns.**
  - Enterprise: the privacy-portal status is never rendered (downgraded), and "Send feedback" mounts product-wide (upgraded).
  - Mobile "Siri → voice" was overturned by lead ruling after the reviewer had upheld it. The App Intent opens chat, not voice.
  - VS Code "Restart Local Runtime" and the "runtime unavailable" state were upgraded from false missings.
  - Organization project sharing and the composer project picker were upgraded to done.
  - A claim that 27 admin routes use one permission helper was corrected. The conclusion that organization routes enforce custom roles still holds.

---

_Generated tables: `the generated files in audit/missing and audit/partial` (regenerate with `node tool/audit.mjs merge && node tool/audit.mjs status-doc`). Per-cell evidence and remaining text: `audit/ledger/ecosystem-capability-ledger.jsonl`. Live queue: `audit/live-check/codex-live-verification-queue.md`._
