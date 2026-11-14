# AI coding assistants in the IDE

Status: Current research snapshot
Owner: Product research
Verified: 2026-10-25
Coverage: official vendor documentation, pricing pages and marketplace listings read on 2026-10-25, extending `competitor-surfaces-2026-10-24.md`

This is a dated, sourced comparison of the AI coding assistants that live in or next to the editor:
Claude Code (VS Code and JetBrains), the OpenAI Codex IDE extension, GitHub Copilot in VS Code,
Cursor, Devin Desktop (the renamed Windsurf editor, under Cognition), Gemini Code Assist, Google
Antigravity, Amazon Kiro and Cline. It builds on the VS Code, CLI, plans and continuity sections of
`competitor-surfaces-2026-10-24.md` and does not repeat the cross-vendor surface inventory there.
`leader-code-surface-2026-09-05.md` is a historical observation of the claude.ai web Code page and
carries nothing about IDE extensions, so no claim here depends on it. Product decisions still follow
`docs/product/competitive-guidance.md`: reopen the cited page before acting on any single claim,
because these vendors change weekly.

Feature lists name no model versions. Where a source names a model, it is described by tier only.

## How to read this

Evidence labels, applied to every claim:

- **Documented:** an official vendor page said so when read on 2026-10-25. The URL is in the product's
  source list in section 2. Written as (D).
- **Observed:** seen first hand in the running product. Nothing in this file is Observed: no product
  was driven in this pass.
- **Indirect:** a search-engine summary of an official page, a marketplace listing, press, or a claim
  carried forward from `competitor-surfaces-2026-10-24.md` without being re-read today. Written as (I).
- **Unknown:** the pages read did not say. This is not proof the capability is absent.

Matrix cells use Yes, Preview (Preview, Beta or Experimental on the vendor's own page), No (the vendor's
page says the product does not offer it, or inference from documented design, marked (I)) and Unknown.
A cell marked (I) rests on Indirect evidence. Counts of "how many products have X" count only Yes and
Preview cells, so they are floors: every Unknown could be a Yes.

Surface compared, per product:

- Claude Code: the VS Code extension, plus the JetBrains plugin where noted.
- Codex: the VS Code extension (also hosted in Cursor and Windsurf-family editors).
- Copilot: the Copilot and Copilot Chat extensions in VS Code.
- Cursor: the Cursor editor (a VS Code fork, not an extension).
- Devin Desktop: the editor formerly named Windsurf.
- Gemini Code Assist: the VS Code and JetBrains extension.
- Antigravity: the IDE extensions (VS Code, Visual Studio, JetBrains, Zed, Xcode), with the app and CLI where noted.
- Kiro: the Kiro IDE (a Code OSS fork).
- Cline: the VS Code extension and JetBrains plugin.

## 1. Capability matrix

| Capability                                        | Claude Code | Codex   | Copilot | Cursor  | Devin Desktop | Gemini Code Assist | Antigravity | Kiro    | Cline   |
| ------------------------------------------------- | ----------- | ------- | ------- | ------- | ------------- | ------------------ | ----------- | ------- | ------- |
| Chat panel in the editor                          | Yes         | Yes     | Yes     | Yes     | Yes           | Yes                | Yes         | Yes     | Yes     |
| Agent mode (multi-step edits and commands)        | Yes         | Yes     | Yes     | Yes     | Yes           | Yes                | Yes         | Yes     | Yes     |
| Inline completions (ghost text)                   | Unknown     | Unknown | Yes     | Yes     | Yes (I)       | Yes                | Yes         | Unknown | Unknown |
| Next-edit prediction                              | Unknown     | Unknown | Yes     | Yes     | Yes (I)       | Unknown            | Unknown     | Unknown | Unknown |
| Inline edit on a selection (Cmd+K style)          | Unknown     | Unknown | Yes     | Yes (I) | Yes (I)       | Unknown            | Yes (I)     | Unknown | Unknown |
| Multi-file diffs with keep, undo or reject        | Yes         | Yes     | Yes     | Yes     | Yes (I)       | Unknown            | Yes         | Yes     | Yes     |
| Checkpoints or rewind                             | Yes         | Unknown | Yes     | Yes     | Yes (I)       | Unknown            | Unknown     | Yes     | Yes     |
| Plan mode                                         | Yes         | Yes     | Yes     | Yes     | Yes (I)       | Unknown            | Yes         | Yes     | Yes     |
| Terminal commands with approvals                  | Yes         | Yes     | Yes     | Yes     | Yes (I)       | Yes (I)            | Yes         | Yes     | Yes     |
| Sandboxed command execution                       | Yes         | Yes     | Preview | Yes     | Yes (I)       | Unknown            | Yes (I)     | Unknown | Unknown |
| Approvals judged by a model (auto mode)           | Yes         | Yes     | Preview | Yes     | Unknown       | Unknown            | Unknown     | Unknown | Unknown |
| Background or cloud agents                        | Yes         | Yes     | Yes     | Yes     | Yes (I)       | Unknown            | Unknown     | Yes     | Unknown |
| Parallel agents or worktrees                      | Yes         | Yes     | Yes     | Yes     | Yes (I)       | Unknown            | Yes         | Yes     | Yes     |
| MCP servers                                       | Yes         | Yes     | Yes     | Yes     | Yes           | Yes                | Yes         | Yes     | Yes     |
| Instruction files (rules)                         | Yes         | Yes     | Yes     | Yes     | Yes           | Unknown            | Yes         | Yes     | Yes     |
| AGENTS.md read natively                           | Yes         | Yes     | Yes     | Yes     | Unknown       | Unknown            | Unknown     | Yes (I) | Yes (I) |
| Agent-written memory across chats                 | Yes         | Yes     | Yes     | Unknown | Yes           | Unknown            | Unknown     | Yes     | Unknown |
| Mention files and folders                         | Yes         | Yes     | Yes     | Yes     | Yes (I)       | Yes                | Yes (I)     | Yes     | Yes     |
| Terminal output as context                        | Yes         | Unknown | Yes     | Unknown | Unknown       | Unknown            | Unknown     | Yes     | Unknown |
| Web page or URL as context                        | Unknown     | Yes     | Yes     | Yes     | Unknown       | Unknown            | Unknown     | Yes     | Yes     |
| Image input                                       | Yes         | Unknown | Yes     | Yes     | Unknown       | Unknown            | Unknown     | Unknown | Unknown |
| Browser or preview tools for the agent            | Yes         | Unknown | Yes     | Yes     | Unknown       | Unknown            | Yes (I)     | Unknown | Yes     |
| Code review (local diff or pull request)          | Yes         | Yes     | Yes     | Yes     | Yes (I)       | Yes (I)            | Unknown     | Unknown | Unknown |
| Models from more than one vendor                  | No (I)      | Unknown | Yes     | Yes     | Yes           | Unknown            | Yes         | Yes     | Yes     |
| Own API key or own cloud provider account         | Yes         | Yes     | Yes     | Yes     | Unknown       | Unknown            | Unknown     | Unknown | Yes     |
| Org admin controls (SSO, policy, spend)           | Yes         | Yes     | Yes     | Yes     | Yes (I)       | Yes                | Yes         | Yes     | Yes     |
| Documented no-training or zero-retention control  | Yes (I)     | Yes (I) | Unknown | Yes     | Unknown       | Unknown            | Yes         | Unknown | Unknown |
| Included in the vendor's consumer AI subscription | Yes         | Yes     | No      | Yes     | No            | No                 | Yes         | No      | No      |
| Pairs with a vendor Chrome extension              | Yes         | Yes (I) | Unknown | Unknown | Unknown       | Unknown            | Unknown     | Unknown | Unknown |
| Same engine as the vendor's CLI                   | Yes         | Yes     | Yes     | Unknown | Yes           | Unknown            | Unknown     | Unknown | Yes     |

Reading the matrix:

- **Table stakes (5 or more products):** chat panel, agent mode, terminal commands with approvals, MCP,
  file mentions, org admin controls (9 of 9); multi-file diff review, plan mode, parallel agents or
  worktrees (8); instruction files (8); checkpoints, sandboxed execution, background or cloud agents,
  AGENTS.md, code review, multi-vendor models (6); inline completions, agent-written memory, web page
  as context, browser tools, own API key (5).
- **Differentiators (3 or fewer):** next-edit prediction (Copilot, Cursor, Devin Desktop); terminal
  output as context (Claude Code, Copilot, Kiro); image input (Claude Code, Copilot, Cursor);
  spec-driven requirements, design and task files with approval gates (Kiro only); third-party agent
  harnesses hosted inside the product (Copilot only); model-judged approvals are four products
  (Claude Code, Codex, Cursor, and Copilot in Preview).
- **Sharing the consumer subscription** is true of four: Claude Code, Codex, Antigravity (through
  Google AI plans) and Cursor (sold inside The X Subscription).
- **Gemini Code Assist** is a shrinking line: consumer accounts ended on 2026-06-18 and new
  business subscriptions ended on 2026-10-09 (section 2.6). Google's IDE path is Antigravity.

## 2. Per-product detail

### 2.1 Claude Code (VS Code and JetBrains)

Sources read 2026-10-25: <https://code.claude.com/docs/en/vs-code>, <https://code.claude.com/docs/en/jetbrains>,
<https://code.claude.com/docs/en/overview>, <https://code.claude.com/docs/en/authentication>,
<https://code.claude.com/docs/en/memory>, <https://code.claude.com/docs/en/worktrees>,
<https://code.claude.com/docs/en/code-review>, <https://claude.com/pricing>,
<https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code>.

- Native chat panel with inline diffs. The extension "provides a native graphical interface" and is
  "the recommended way to use Claude Code in VS Code" (D, vs-code).
- Permission modes in the prompt box: Auto (a classifier reviews most actions), Manual, Plan, Edit
  automatically (D, vs-code). Plan mode opens the plan as a Markdown document with inline comments;
  `/plan` switches modes (D).
- Checkpoints: hover a message, then fork the conversation, rewind code, or both (D, vs-code).
- Mentions: `@` files and folders with fuzzy match, line ranges from the selection, the open file by
  default, terminal output in prompts, pasted and dragged images (D, vs-code).
- Session surfaces: multiple conversations in tabs or windows with status dots; an agent map for
  subagents and background tasks; session groups and filters; focus view; side questions with `/btw`;
  bookmarks; a prompt cache clock (D, vs-code).
- Memory and rules: CLAUDE.md files, auto memory with a browse-and-edit dialog in the extension, a
  `.claude/rules/` directory, and AGENTS.md "in place of" CLAUDE.md (D, memory, vs-code).
- MCP servers managed with `/mcp` in the panel; plugins and marketplaces; skills; hooks; output styles;
  sandbox toggle (D, vs-code).
- Browser: `@browser` drives Chrome through the Claude in Chrome extension; it shares the browser's
  login state and needs a claude.ai sign-in (D, vs-code).
- Git: commits and pull requests from chat. Worktrees are a CLI flag (`--worktree`) and a desktop
  feature; the VS Code page links to them rather than describing a panel control (D, worktrees).
- Code review: `/code-review` runs on any plan in a session; a managed GitHub Code Review service is for
  Team and Enterprise plans, runs on Anthropic infrastructure, and is not available with Zero Data
  Retention, HIPAA configuration or customer-managed keys (D, code-review).
- Models and providers: model picker, effort levels, extended thinking; Bedrock, Google Cloud's agent
  platform and Microsoft Foundry are supported by disabling the login prompt (D, vs-code). On a
  third-party provider the extension drops plan usage bars, voice dictation and the Web tab (D).
- Extension versus CLI: commands and skills are a subset in the extension; the `!` bash shortcut and
  shell tab completion are CLI-only; checkpoints and MCP config exist in both (D, vs-code table).
- Inline completions and Cmd+K style inline edit: none documented on the pages read (U).
- JetBrains: plugin labelled Beta. It runs `claude` in the IDE terminal and does not bundle the CLI;
  features are the IDE diff viewer, selection context, `@file#L1-99` references, and diagnostics through
  a local MCP server named `ide` (D, jetbrains). Supported IDEs: IntelliJ IDEA, PyCharm, Android Studio,
  WebStorm, PhpStorm, GoLand (D).
- Marketplace: 28,636,976 installs, about 3.5 stars from 835 ratings; page says VS Code 1.98.0 or higher,
  while the docs say 1.94.0 or later. The mismatch seen on 2026-10-24 is unresolved (D, marketplace and
  vs-code). On 2026-10-24 the file recorded 28.5M+ installs.
- Enterprise: Team and Enterprise plans, `forceLoginMethod` and `forceLoginOrgUUID` managed settings,
  `allowedProviders`, server-managed settings; Zero Data Retention is a separate enablement (D,
  authentication; (I) for ZDR, carried from the 2026-10-24 file).

### 2.2 OpenAI Codex IDE extension

Sources read 2026-10-25: <https://learn.chatgpt.com/docs/ide>, <https://learn.chatgpt.com/docs/developer-commands.md?surface=ide>,
<https://learn.chatgpt.com/docs/developer-settings.md?surface=ide>, <https://learn.chatgpt.com/docs/agent-approvals-security.md>,
<https://learn.chatgpt.com/docs/auth.md>, <https://learn.chatgpt.com/docs/cloud.md>,
<https://learn.chatgpt.com/docs/code-review.md>, <https://learn.chatgpt.com/docs/environments/git-worktrees.md>,
<https://learn.chatgpt.com/docs/pricing>, <https://marketplace.visualstudio.com/items?itemName=openai.chatgpt>,
<https://developers.openai.com/codex/app-server> (via search summary, (I)).

- Hosts: VS Code, VS Code Insiders, Cursor and Windsurf use the extension (marketplace id
  `openai.chatgpt`); Xcode and JetBrains "provide their own integrations", where you pick Codex as the agent
  in the IDE's chat (D, ide).
- Sidebar chat that starts from open files, selections and recent chats; a summary plus a focused diff
  where you keep the edits you want and ask follow-ups; "Undo" and "Review" buttons shown in the docs'
  screenshot (D, ide).
- Slash commands in the composer: `/plan`, `/review`, `/cloud`, `/local`, `/worktree`, `/fork`, `/side`,
  `/goal`, `/compact`, `/model`, `/reasoning`, `/fast`, `/mcp`, `/memories`, `/init` (generates an
  AGENTS.md scaffold), `/status` (chat id, context usage, rate limits), `/approve`, `/ide-context`,
  `/personality`, `/project`, `/feedback` (D, developer-commands).
- Approvals and sandbox are shared with the CLI: approval policies `on-request`, `never`, granular;
  sandbox modes read-only, workspace-write, full access; network off by default; web search defaults to
  cached; an optional auto-review reviewer agent for requests that need approval (D, agent-approvals-security).
  The IDE's approval-mode labels are not mapped on that page (U).
- Cloud: the composer offers "Work locally" and "Cloud"; cloud tasks keep running while the computer
  sleeps; changes come back as a diff or pull request (D, ide, cloud). Starting cloud work from the IDE is
  not described on the cloud page itself (U); `/cloud` is in the command list (D).
- Code review: `/review` in the IDE reviews uncommitted changes or a diff against a base branch, only
  inside a Git repository; `chatgpt.reviewDelivery` chooses inline or a separate chat. GitHub automatic
  review needs the ChatGPT Codex connector (D, code-review).
- Worktrees: `/worktree` runs a chat in a new worktree (D, commands). The worktree page covers the desktop
  app (handoff between local and worktree, 15 recent worktrees kept by default) and says nothing of the IDE (D).
- Checkpoints: the docs advise creating Git checkpoints yourself; no product checkpoint feature is
  described (U).
- Image input, terminal output and browser tools in the IDE: not on the pages read (U). The CLI takes
  images and live web search per the 2026-10-24 file (I).
- Engine: the extension bundles a Codex executable (`chatgpt.cliExecutable` is "development only" and
  overriding "the bundled executable can prevent parts of the extension from working") (D, settings). OpenAI
  describes the app-server as the interface that powers rich clients such as the VS Code extension (I,
  search summary of developers.openai.com/codex/app-server).
- Sign-in and credentials: ChatGPT sign-in or API key; "The CLI and extension share the same cached login
  details" in `~/.codex/auth.json` or the OS credential store; Codex cloud requires ChatGPT sign-in (D, auth).
  Admins can force a login method and pin a workspace (D).
- Marketplace: 15,929,400 installs, 736 ratings, about 3 stars; "Codex works with Plus, Pro, Business, Edu,
  and Enterprise ChatGPT plans" (D). On 2026-10-24 the file recorded 15,901,660 installs.
- Windows: `chatgpt.runCodexInWindowsSubsystemForLinux` keeps the agent in WSL2 (D, settings).

### 2.3 GitHub Copilot in VS Code

Sources read 2026-10-25: <https://code.visualstudio.com/docs/copilot/overview>,
<https://code.visualstudio.com/docs/copilot/agents/overview>,
<https://code.visualstudio.com/docs/copilot/agents/local-agents>,
<https://code.visualstudio.com/docs/copilot/agents/cloud-agents>,
<https://code.visualstudio.com/docs/copilot/agents/third-party-agents>,
<https://code.visualstudio.com/docs/agents/run/approvals>,
<https://code.visualstudio.com/docs/copilot/chat/chat-checkpoints>,
<https://code.visualstudio.com/docs/copilot/chat/copilot-chat-context>,
<https://code.visualstudio.com/docs/copilot/ai-powered-suggestions>,
<https://code.visualstudio.com/docs/copilot/customization/custom-instructions>,
<https://code.visualstudio.com/docs/copilot/customization/language-models>,
<https://code.visualstudio.com/docs/copilot/reference/copilot-vscode-features>,
<https://docs.github.com/en/copilot/get-started/plans>,
<https://docs.github.com/en/copilot/concepts/copilot-surfaces/copilot-in-ides>,
<https://github.blog/changelog/2026-10-01-github-copilot-in-vs-code-september-2026-releases/>,
<https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat>. The VS Code pages are dated
10/21/2026 on their face.

- Inline suggestions as ghost text, accepted with Tab, partial accept by word or line; next edit
  suggestions predict where and what the next edit is, with a gutter arrow, a collapsed mode, and
  diagnostics-based fixes such as missing imports (D, ai-powered-suggestions).
- Inline chat for targeted edits on a selection, also in the terminal; Quick Chat (D, features sheet).
- Chat modes Ask, Agent and Plan (Plan "where available"); an Agents window for "multi-project
  orchestration" with several sessions (D, overview, agents/overview).
- Harnesses: the Copilot harness, a Local harness, and Claude and Codex harnesses; cloud agents (Copilot,
  and Claude and Codex in Preview) need a GitHub repository and return a pull request; cloud sessions
  "can't use VS Code built-in tools or local development context" (D, cloud-agents, third-party-agents).
- Handoff: a Local session can be sent to Cloud from the session target control, carrying history and
  context; `/delegate` continues a task with a cloud agent; sessions from Copilot CLI and the Copilot app
  can be continued, and "Resume in Terminal" continues one in the CLI (D, agents/overview, cloud-agents).
- Edit review: after the agent saves, edits are pending and can be kept or undone one by one or all
  together; checkpoints are on by default, taken before each request, restore removes later requests,
  with Redo; they do not reverse terminal commands or network calls and "don't replace Git" (D,
  chat-checkpoints).
- Approvals: Manual (default), Assisted (Experimental, an LLM judge), Allow all, Autopilot and Advanced
  Autopilot (Preview); terminal auto-approve rules by command or regex, described as "a best-effort
  convenience, not a security boundary"; per-URL request and response approval; sandboxing for terminal
  commands is Preview on macOS, Linux and WSL2 and Experimental on Windows; worktree sessions always use
  Allow all (D, approvals).
- Context: `#` mentions for files, folders, symbols, tools, terminal output and source control changes;
  attach a GitHub issue or pull request; `#fetch` for web content; images by attach or drag; browser "Add
  to Chat" for an element, screenshot or console logs. `@` chat participants are deprecated and not
  supported in the Copilot harness (D, chat-context).
- Instructions: a copilot-instructions.md file in the repository's .github folder, `AGENTS.md`, `CLAUDE.md` (needs `chat.useClaudeMdFile`
  for the Local harness), `*.instructions.md` with `applyTo`, and `.claude/rules` (D, custom-instructions).
  Memory, subagents, hooks, agent skills, custom agents, plugins and prompt files exist (D, features sheet).
- MCP servers; browser tools that let the agent open the app and test a flow (D, features sheet). Whether
  the integrated browser is still Preview was not stated on the pages read (U).
- Models: picker with Auto and an "Optimize for" tier; BYOK from built-in providers, extensions or custom
  endpoints, working "without a GitHub account or Copilot plan" for chat; inline suggestions, semantic
  search and embeddings still need a GitHub account; admins can disable BYOK (D, language-models).
- Code review: review of a selection, and of uncommitted changes from Source Control. A GitHub help page
  still describes this as a premium-request feature, while the plans page now counts AI credits, so the
  billing wording is inconsistent between pages (I, search summary of docs.github.com code review pages).
- Other IDEs: JetBrains plugin has next edit suggestions, code review and agentic features; Copilot is
  also available as an agent inside JetBrains AI Assistant through ACP (D, copilot-in-ides).
- September 2026 release (VS Code 1.136 to 1.140): Automations (Preview), agent merge (Preview), pull
  requests from Copilot, Claude or Codex sessions, Dev Container sessions on SSH, tunnel and WSL hosts,
  and continuing a Codex conversation from the ChatGPT app (D, GitHub changelog 2026-10-01).
- Marketplace: 78,965,207 installs on Copilot Chat (D). On 2026-10-24 the file recorded 78,958,562.

### 2.4 Cursor

Sources read 2026-10-25: <https://cursor.com/docs/agent/overview>, <https://cursor.com/docs/agent/modes>,
<https://cursor.com/docs/agent/security/run-modes>, <https://cursor.com/docs/agent/agents-window>,
<https://cursor.com/docs/cloud-agent>, <https://cursor.com/docs/configuration/worktrees>,
<https://cursor.com/docs/context/rules>, <https://cursor.com/docs/tab/overview>,
<https://cursor.com/docs/bugbot>, <https://cursor.com/docs/account/pricing>,
<https://cursor.com/help/security-and-privacy/privacy>, <https://cursor.com/help/models-and-usage/api-keys>.

- A standalone editor: "Cursor is based upon the VS Code codebase" (I, carried; not an extension for
  stock VS Code, no official one found). The Claude Code and Codex extensions both list Cursor as a host (D, section 2.1, 2.2).
- Tab: multi-line edits, added imports, jump to the next edit location, and cross-file edit prediction
  with a portal window (D, tab/overview). Cmd+K targeted edits are listed in the 2026-10-24 file (I); the
  Tab page read today does not mention them.
- Agent tools: file search, web search, file reads including images, edits, shell, browser (screenshots,
  testing, element interaction), image generation, and clarifying questions. "There is no limit on the
  number of tool calls" (D, agent/overview).
- Plan mode (Shift+Tab to switch, suggested for complex tasks); custom modes; `/goal` for long-lived
  objectives and `/loop`, both "rolling out"; side chats with `/side`; queued and steered messages (D).
- Checkpoints: created automatically, restore files only, "stored locally and separate from Git" (D).
- Run modes for local agents: Auto-review (allowlist, then sandbox, then a classifier model, "not a
  security boundary"), Allowlist, Run Everything. The sandbox uses Seatbelt on macOS and Landlock plus
  seccomp on Linux; team admins can restrict modes (D, run-modes). Cloud agents never ask for approval (D).
- Parallel work: worktrees per agent in the Agents Window, `/worktree` and `/best-of-n` across models in
  the IDE, a default cap of 25 worktrees (D, worktrees). Cloud agents run in isolated VMs, are launched
  from the desktop, cursor.com/agents, iOS, Slack, Linear, GitHub or an API, and can run "as many agents as
  you want in parallel"; they need Premium or higher, Teams or Enterprise (D, cloud-agent). Agents can
  move between cloud and local (D, agents-window).
- Rules: `.cursor/rules` as `.mdc`, user rules, team rules, and `AGENTS.md` including nested files;
  precedence Team, Project, User. The legacy `.cursorrules` file was not covered (D, rules; U for legacy).
- Code review: Bugbot reviews pull requests on GitHub, GitLab, Bitbucket and Azure DevOps, with Autofix
  through a cloud agent; usage-billed; MCP in Bugbot only on Teams and Enterprise (D, bugbot).
- Privacy: Privacy Mode means no training by Cursor or its model providers; on by default for Teams and
  Enterprise, admin-enforceable; prompts are still sent to providers (D, privacy). Zero retention does not
  apply with your own API key (D, api-keys).
- BYOK: OpenAI, Anthropic, Google, Azure OpenAI and AWS Bedrock; "only work with chat models", Tab keeps
  using Cursor's models; requests still pass through Cursor's backend (D, api-keys).
- Other: remote control of local agents from the iOS app and an `Origin` git host were listed on 2026-10-24
  (I). JetBrains IDEs host the Cursor agent over ACP with a paid plan (I).
- Ownership: sources conflict on whether the SpaceX and xAI purchase of Anysphere has closed; cursor.com
  says only that Cursor is sold in The X Subscription (I, per the 2026-10-24 file; (U) for the facts).

### 2.5 Devin Desktop (formerly Windsurf, under Cognition)

Sources read 2026-10-25: <https://docs.devin.ai/desktop/getting-started>, <https://devin.ai/pricing>;
search summaries of <https://docs.devin.ai/desktop/changelog>, <https://docs.devin.ai/desktop/tab/overview>,
<https://docs.devin.ai/desktop/terminal> and the plugin pages under <https://docs.devin.ai/windsurf/plugins/>
(Indirect). The docs.windsurf.com host redirects to docs.devin.ai (D, HTTP 307 seen on 2026-10-25).

- "Devin Desktop is the new name for Windsurf" (I, devin.ai/desktop via the 2026-10-24 file); the rename date
  and Cascade retirement date rest on secondary sources (U).
- A next-generation IDE with Devin Local, "our next-generation agent harness, shared with Devin CLI"; an
  Agent Command Center to browse sessions; SSH, dev containers, clone and open-project flows (D,
  getting-started).
- Terminal, MCP, memories and rules, workflows, one-click app deploys, and usage pages are linked from
  the getting-started page (D). Devin Local uses allow, ask and deny rules rather than Cascade's
  auto-execution levels; plan mode runs inside the OS sandbox; reverting works mid-turn (I, changelog
  summaries).
- Tab with Supercomplete suggests deletions and additions near the cursor, with an aggression setting
  (I, tab/overview summary). Devin Review of diffs in the editor, Fusion and Fast Context are from the
  2026-10-24 file (I).
- Extensions: "You cannot install extensions through any marketplace on Devin Desktop"; VS Code or Cursor
  configuration can be imported (D, getting-started). A search summary of the FAQ says existing extensions
  carry over on upgrade. The two readings are unreconciled (U).
- Windsurf plugins: the JetBrains plugin is in maintenance with Cascade being deprecated, the
  Remote Development plugin is no longer maintained, and the VS Code plugin is "under maintenance mode"
  with a recommendation to use Devin Desktop (I, search summaries of the plugin and troubleshooting pages).
  No end-of-life date was found.
- Sign-in: a Devin account (free to create) or a Devin API key (D, getting-started).
- Local and cloud: sessions move between Devin Desktop and Devin Cloud with context preserved; `devin ssh`
  into a Devin VM (I, carried).
- BYOK, privacy and zero-retention controls, and checkpoints as a documented product feature were not
  found on the pages read (U).

### 2.6 Gemini Code Assist

Sources read 2026-10-25: <https://developers.google.com/gemini-code-assist/docs/overview> (last updated
2026-10-09 per the page), <https://developers.google.com/gemini-code-assist/docs/deprecations>,
<https://docs.cloud.google.com/gemini/docs/codeassist/overview> (last updated 2026-10-22 per the page).

- IDEs: code completion in Cloud Shell Editor, Cloud Workstations, JetBrains IDEs, VS Code and Android
  Studio; conversational assistant in VS Code, JetBrains IDEs and Cloud Workstations (D).
- Editions: Standard and Enterprise both have completion, chat, "agentic chat (multi-step tasks, system
  tools, MCP servers)", smart actions and commands, local codebase awareness with a large context window,
  source citations, IP indemnification and VPC-SC. Enterprise adds code customization from private
  repositories (D).
- Lifecycle, all from the deprecations page (D):
  - consumer accounts: deprecated 2026-05-18, shutdown 2026-06-18;
  - consumer GitHub code review: shutdown 2026-07-17;
  - new Standard or Enterprise subscriptions: sales ended 2026-10-09;
  - additional licenses and annual renewals: end 2027-01-31; monthly renewals: end 2027-12-31.
- The Cloud overview says Gemini CLI "is not optimized for the latest Gemini models" and recommends
  Antigravity CLI (D). The deprecations page itself names no migration to Antigravity.
- Code review on GitHub for Cloud customers is listed in the 2026-10-24 file (I); the overview read today
  links to it without describing it (U).
- Checkpoints, plan mode, inline edit, background agents, BYOK and image input: not stated (U).

### 2.7 Google Antigravity

Sources read 2026-10-25: <https://antigravity.google/blog/antigravity-ide-extensions> (published
2026-08-20), <https://antigravity.google/docs/getting-started>, <https://antigravity.google/pricing>.

- Editors: VS Code (Marketplace extension "Google Antigravity"), Visual Studio, Zed, JetBrains (IntelliJ
  based, from 2026.2.1) and Xcode (27 beta 6 or later). JetBrains and Zed enterprise support is Preview (D, blog).
- The blog says development "will increasingly happen" on agent-first surfaces such as the 2.0 app or the
  CLI, with the editor extensions "a complement for detailed inspection"; inside the editor you get
  conversations, customizations and multi-agent orchestration that "shares context" with the rest of
  Antigravity (D, blog).
- Product line: Antigravity App (v2.5+), CLI `agy` (v1.2+), IDE extensions, a standalone Antigravity IDE, and
  a Python SDK (D, getting-started). The newest frontier model is in the App, CLI and extensions but not
  in the standalone IDE (D).
- Agent features documented for the product family: Agent Manager (Cmd+E), Projects with file scopes and
  permissions, Local mode and New worktree mode, Artifact Review (plans and diffs, Ctrl+R), slash commands
  `/goal`, `/plan`, `/schedule`, `/browser`, subagents and parallel orchestration, browser recordings with
  allowlist and denylist and a separate Chrome profile, MCP, skills, rules, plugins, hooks, a terminal
  sandbox, Tab completion, and Remote Control to "drive desktop & CLI sessions from any browser" (D,
  getting-started). Which of these appear inside the extensions is not itemised on the pages read; the
  2026-10-24 file lists plans, inline diffs, MCP and subagents for the extensions from the Marketplace
  listing through press (I).
- Free individuals: "Unlimited Tab completions" and "Unlimited Command requests" with "Basic weekly rate
  limits"; Google AI Pro and Ultra add rate limits and a "flexible AI credit pool"; business from $30 per
  seat per month or pay-as-you-go with a $0 seat fee (D, pricing).
- Sign-in: Google account on any Antigravity plan for individuals; Gemini Enterprise or Google Cloud
  credentials for enterprise (D, blog). Sessions fall under Google Cloud terms; "data is not used to train
  foundation models"; IAM and VPC Service Controls apply (D, blog).
- Checkpoints, AGENTS.md and GEMINI.md: the getting-started page "names Rules and workspace instructions
  but does not mention AGENTS.md, GEMINI.md, or checkpoints" (D, as read).
- BYOK: not stated; the nearest items are Gemini API key and Vertex AI auth types (U).

### 2.8 Amazon Kiro

Sources read 2026-10-25: <https://kiro.dev/docs/ide/chat/> (page updated 2026-09-30),
<https://kiro.dev/docs/cloud-sessions/> (page updated 2026-10-23), <https://kiro.dev/docs/privacy-and-security/>,
<https://kiro.dev/pricing/>, <https://kiro.dev/changelog/>; search summaries of
<https://kiro.dev/docs/ide/chat/autopilot/> and <https://kiro.dev/docs/ide/chat/terminal/> (Indirect).

- A standalone IDE built on Code OSS, not an extension for VS Code; JetBrains support is Kiro CLI over ACP
  (I, carried).
- Chat starts as free-flow or a built-in workflow: Spec (requirements, design, tasks), Plan, Bug Fix,
  Quick Spec; an agent selector with built-in, user and workspace agents (D, ide/chat).
- Autopilot toggles between autonomous execution and supervised approval; Supervised holds file changes
  until accepted or rejected and is "a code review workflow, not a security control"; checkpoints rewind
  code and conversation (D, ide/chat, privacy-and-security).
- `#` context providers: codebase, file, folder, git diff, terminal, problems, url, docs, steering, spec,
  MCP, code, repository, current file (D, ide/chat). Image input is not on the pages read (U).
- Shell commands need approval by default; trusted-command matching is string-prefix based; protected
  paths such as `.git/` and `mcp.json` ask before writes (D, privacy-and-security).
- Hooks, steering files, AGENTS.md, skills, Powers, sub-agents and memory (IDE 1.4.0, default Off from
  1.4.10) (I, carried; the changelog read today confirms the memory change, D).
- Cloud sessions: from the IDE (Agent Focus Mode), CLI or Web; repositories cloned server-side through
  GitHub or GitLab; results as a pull request; up to 10 concurrent sessions; Pro and higher; runs in one
  AWS region; no Supervised mode; handoffs documented from IDE to Web, IDE to CLI, CLI to Web, and to
  Mobile, but not from Web or CLI back into the IDE (D, cloud-sessions).
- Models: picker with Auto; Claude, GPT and open-weight families, availability varying by surface and
  region (D, changelog). BYOK is not mentioned on the pricing page (U).
- Enterprise: SAML and SCIM through AWS IAM Identity Center, admin dashboard, usage analytics; the
  enterprise docs moved and were not read (D for pricing page; U for detail). Data retention and training
  terms were on a data-protection page not read (U).
- Code review as a product feature: not found (U).

### 2.9 Cline

Sources read 2026-10-25: <https://docs.cline.bot/getting-started/what-is-cline>, <https://docs.cline.bot/usage/ide>,
<https://github.com/cline/cline>, <https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev>,
<https://cline.bot/pricing>; search summaries of <https://docs.cline.bot/customization/cline-rules> and
<https://docs.cline.bot/usage/acp> (Indirect).

- Open source under Apache-2.0, 70.8k GitHub stars; the JetBrains plugins are not open source (D, GitHub).
- Surfaces: VS Code extension, JetBrains plugin, CLI (`npm i -g cline`), an open-source desktop app with
  parallel sessions and scheduled tasks, an SDK, and Kanban (`npx kanban`) for many parallel agents with
  per-card worktrees; Cursor, Windsurf, Antigravity and Zed hosting, and Neovim through ACP (D,
  what-is-cline).
- Plan and Act modes; every file creation, edit and terminal command needs approval unless auto-approve is
  turned on; checkpoints after each change with Compare and three restore options, "separate from Git"
  (D, usage/ide).
- Edits shown as diffs with linter and compiler error monitoring; terminal commands with a background mode;
  browser use that clicks, types and captures screenshots and console logs; MCP, including tools Cline
  builds itself (D, marketplace listing).
- Context helpers `@url`, `@problems`, `@file`, `@folder` (D, marketplace listing).
- Rules: `.clinerules` or `.cline/rules/`, and AGENTS.md at the project or `~/.agents/AGENTS.md` (I, search
  summary of the rules page). Hooks, skills and subagents have docs pages (D, index; content not read).
- Models: OpenRouter, Anthropic, OpenAI, Gemini, Bedrock, Azure, Vertex, Cerebras, Groq, OpenAI-compatible
  endpoints, and local models through LM Studio or Ollama; or the Cline provider with one sign-in (D,
  marketplace listing, what-is-cline).
- Inline completions, next-edit, image input, code review and cloud agents: none found (U).
- Marketplace: 5,726,876 installs, four stars from 324 reviews (D).
- Enterprise: SSO, OIDC, SCIM, audit logs, VPC deployments, role-based access, inference-provider limits,
  OpenTelemetry; some configuration items marked "Coming Soon" (D, pricing). Telemetry terms were not read (U).

### 2.10 Zed and JetBrains AI Assistant

Zed and JetBrains AI Assistant matter to this picture only through the Agent Client Protocol (ACP):

- Antigravity ships a Zed extension (Zed 0.140 and later) (D, section 2.7). Cline and Kiro reach Zed,
  JetBrains or Neovim over ACP (D for Cline; I for Kiro).
- JetBrains AI Assistant lists Junie, Claude Agent and Codex as included in a JetBrains AI subscription,
  and lets you connect other ACP-compatible agents with your own subscription; Junie left beta in June
  2026 (I, search summaries of jetbrains.com pages read 2026-10-25). The same pages disagree on AI Pro
  price and credit counts, so no JetBrains price is recorded here (U).
- Zed's own AI features were not read (U).

## 3. Plans and how the subscription carries over

Prices are US list prices per month as shown on the cited page on 2026-10-25, unless marked. Where this
repeats `competitor-surfaces-2026-10-24.md` section 4, the numbers were re-read and match unless noted.

### 3.1 Subscription carries into the IDE

| Product             | Does the consumer or chat subscription work in the IDE?                                                                                                                                                                    | Evidence                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Claude Code         | Yes. Pro, Max, Team or Enterprise on claude.ai signs in to the extension, the CLI and the JetBrains plugin; "no API key is required". Claude Code "is included in all paid plans"; Free does not include it.               | D                       |
| Claude Code (usage) | One allowance: "Every plan has usage limits that reset on a rolling five-hour session window, and paid plans add weekly limits". The 2026-10-24 file records that Claude Code shares these limits with the rest of Claude. | D (limits), I (sharing) |
| Claude Code (API)   | A Claude Console account or API key also works in the extension and CLI. Cloud sessions, the Web tab, Chrome and voice dictation need a claude.ai subscription.                                                            | D                       |
| Codex               | Yes. "Sign in with ChatGPT for subscription access" or with an API key; the CLI and extension share one cached login. Plus is listed for "Codex on the web, in the CLI, in the IDE extension, and on iOS".                 | D                       |
| Codex (usage)       | Estimated local messages per five hours run from about 5 to 45 on the most capable tier to 350 to 3,000 on the efficient tier on Plus and standard Business; Pro has no five-hour limit currently; credits extend usage.   | D                       |
| Codex (API key)     | Works in the CLI, SDK and IDE extension at API rates, with "no cloud-based features". Codex cloud requires ChatGPT sign-in.                                                                                                | D                       |
| Copilot             | A separate GitHub plan, not a chat subscription. It can also carry other vendors' agents, below.                                                                                                                           | D                       |
| Cursor              | Sold inside The X Subscription; paid plans share one weekly pool across the editor agent, CLI, cloud agents, Grok Bot and Grok apps.                                                                                       | D                       |
| Antigravity         | Google AI plans (Pro, Ultra) raise the limits; free individuals get Tab and Command; "unified sign-in with CLI and 2.0 app, shared entitlements and rate limits" per the 2026-10-24 file.                                  | D (plans), I (sharing)  |
| Devin Desktop       | A Devin plan (Free, Pro, Max, Teams); Teams "full" seats include Devin Desktop. Not tied to a chat subscription.                                                                                                           | D                       |
| Kiro                | A Kiro plan paid in credits; social login or AWS Builder ID, or IAM Identity Center for organizations.                                                                                                                     | D                       |
| Cline               | Free software; pay for inference at cost, bring your own key, or use ClinePass.                                                                                                                                            | D                       |
| Gemini Code Assist  | Not available to consumers since 2026-06-18; licensed through Google Cloud.                                                                                                                                                | D                       |

Cross-vendor carry-over, the part the single-vendor docs do not show (all D, read 2026-10-25):

- Copilot's Claude harness is billed "through your Copilot subscription", or to your own Claude API key
  with BYOK. The page does not say whether a Claude Pro or Max subscription works there (U).
- Copilot's Codex harness has two routes. The OpenAI extension route follows the extension's own
  authentication. The Agent Host route (Experimental) signs in with Copilot Pro+ or a ChatGPT account,
  where "a free ChatGPT account is sufficient", and the model picker shows which subscription is used.
- A search summary of GitHub's docs says Claude and Codex agents are public preview on Pro, Pro+,
  Business and Enterprise with no separate Anthropic or OpenAI subscription, billed in AI credits and
  Actions minutes (I).
- Codex also runs inside Cursor and Windsurf-family editors, and Claude Code inside Cursor, each using the
  user's own vendor login (D, sections 2.1, 2.2).

### 3.2 Plan and price table

| Product            | Plan                      | Price                                                                            | What it adds for the IDE                                                                                      |
| ------------------ | ------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Claude             | Free                      | $0                                                                               | No Claude Code                                                                                                |
| Claude             | Pro                       | $17 annual ($200 up front) or $20 monthly                                        | Claude Code; five-hour and weekly limits                                                                      |
| Claude             | Max                       | From $100 (5x) and $200 (20x) of Pro usage                                       | Same features, larger limits; API credits equal to the price                                                  |
| Claude             | Team                      | Standard $20 annual or $25 monthly per seat; Premium $100 annual or $125 monthly | Claude Code, admin tools, SSO, server-managed settings; GitHub Code Review                                    |
| Claude             | Enterprise                | $20 per seat annual, 20-seat minimum, plus usage at API rates                    | Roles, SCIM, audit logs, Compliance API                                                                       |
| ChatGPT and Codex  | Free and Go ($8)          | $0, $8                                                                           | The pricing page read today leaves IDE use "Not stated"; the marketplace lists Plus and above; unresolved (U) |
| ChatGPT and Codex  | Plus                      | $20                                                                              | Codex on web, CLI, IDE extension and iOS; cloud integrations                                                  |
| ChatGPT and Codex  | Pro                       | From $100                                                                        | No five-hour limit currently; higher tiers in the 2026-10-24 file                                             |
| ChatGPT and Codex  | Business                  | $20 per user annual (2 or more users), $25 monthly                               | Admin controls; same per-seat limits as Plus on standard                                                      |
| ChatGPT and Codex  | Enterprise and Edu        | Contact sales                                                                    | Flexible pricing with credits, or Plus-like per-seat limits                                                   |
| ChatGPT and Codex  | API key                   | API rates                                                                        | CLI, SDK and IDE, no cloud features                                                                           |
| GitHub Copilot     | Free                      | $0                                                                               | Auto model selection only; 2,000 completions a month; review of a selection; no cloud agent                   |
| GitHub Copilot     | Pro                       | $10                                                                              | 1,500 AI credits (1,000 base, 500 flex); cloud agent, code review, third-party agents (public preview)        |
| GitHub Copilot     | Pro+                      | $39                                                                              | 7,000 credits (3,900 base, 3,100 flex); access to premium models                                              |
| GitHub Copilot     | Max                       | $100                                                                             | 20,000 credits (10,000 base, 10,000 flex); priority access to premium models                                  |
| GitHub Copilot     | Business                  | $19 per granted seat                                                             | 1,900 credits per user; Copilot policy control                                                                |
| GitHub Copilot     | Enterprise                | $39 per granted seat                                                             | 3,900 credits per user                                                                                        |
| Cursor             | Free                      | $0                                                                               | Limited; no third-party models                                                                                |
| Cursor             | Plus                      | $8 ($80 a year)                                                                  | Cursor's own models at fixed settings; no Auto, cloud agents, Bugbot, third-party models or own keys          |
| Cursor             | Premium                   | $30 ($300 a year)                                                                | 4x Plus usage; cloud agents, Automations, Bugbot, third-party models from prepaid credit, own keys            |
| Cursor             | Super                     | $100 ($1,000 a year)                                                             | 15x Plus; priority access at peak times                                                                       |
| Cursor             | Ultra                     | $200 ($2,000 a year)                                                             | 50x Plus; earliest access to new products                                                                     |
| Cursor             | Teams and Enterprise      | $30, $100 or $200 per seat; Enterprise custom                                    | Seat usage matches the tier; $0.25 per million tokens Cursor Token Rate on eligible third-party and BYOK use  |
| Devin Desktop      | Free                      | $0                                                                               | "Light quota to code with agents"                                                                             |
| Devin Desktop      | Pro                       | $20                                                                              | Increased quotas; cloud agents (Devin Cloud)                                                                  |
| Devin Desktop      | Max                       | $200                                                                             | "Significantly higher quotas"                                                                                 |
| Devin Desktop      | Teams                     | $80 base plus $40 per full developer seat                                        | Full seats include Devin Desktop                                                                              |
| Gemini Code Assist | Standard, Enterprise      | Google Cloud licensing; sold to new customers until 2026-10-09                   | Completion, chat, agentic chat with MCP; Enterprise adds private-repo customization                           |
| Antigravity        | Individuals               | $0                                                                               | Unlimited Tab and Command; basic weekly limits                                                                |
| Antigravity        | Google AI Pro, Ultra      | $19.99; $99.99 and $199.99 (2026-10-24 file)                                     | More limits and a flexible credit pool                                                                        |
| Antigravity        | Business                  | From $30 per seat, or pay-as-you-go with a $0 seat fee                           | Spend caps and admin controls                                                                                 |
| Kiro               | Free                      | $0, 50 credits                                                                   | Restricted model set                                                                                          |
| Kiro               | Pro, Pro+, Pro Max, Power | $20, $40, $100, $200 with 1,000, 2,000, 5,000, 10,000 credits                    | Add-on credits $0.04 each; cloud sessions and Web on Pro and higher                                           |
| Kiro               | Enterprise                | Contact sales                                                                    | Over 2 and up to 500 users; IAM Identity Center or an external IdP required                                   |
| Cline              | Open source               | Free                                                                             | Inference at cost or BYOK                                                                                     |
| Cline              | ClinePass                 | $9.99, a vendor claim of 2x to 5x usage on popular open coding models            | Flat subscription                                                                                             |
| Cline              | Enterprise                | Custom                                                                           | SSO, SCIM, audit logs, VPC, role-based access                                                                 |

Sources for the table: <https://claude.com/pricing>, <https://learn.chatgpt.com/docs/pricing>,
<https://docs.github.com/en/copilot/get-started/plans> (first 100,000 of about 199,000 characters read,
so Business and Enterprise feature rows are partial), <https://cursor.com/docs/account/pricing>,
<https://devin.ai/pricing>, <https://developers.google.com/gemini-code-assist/docs/deprecations>,
<https://antigravity.google/pricing>, <https://kiro.dev/pricing/>, <https://cline.bot/pricing>.
Antigravity Pro and Ultra prices are carried from the 2026-10-24 file because the pricing page read today
omits them.

## 4. Connections to the CLI, desktop, web and cloud

| Product            | IDE and the vendor CLI                                                                                                                                                                                                                                                                                                                      | Desktop, web and cloud                                                                                                                                                                                                                                          | Phone and Chrome                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude Code        | VS Code: the extension "bundles a private copy of the CLI"; it does not put `claude` on the PATH; extension and CLI share conversation history (`claude --resume`) (D). JetBrains: runs `claude` in the IDE terminal, needs the CLI installed, and talks to it over a local `ide` MCP server (D). `/ide` connects an external terminal (D). | The Web tab resumes cloud sessions by downloading a copy; "changes don't sync back to claude.ai" (D). `/desktop` continues a terminal session in the desktop app, `claude --teleport` pulls a web session into the terminal, both need claude.ai (D, overview). | Remote Control toggle for all sessions; Claude in Chrome via `@browser`; the Claude mobile app starts and follows web sessions; Slack (D). |
| Codex              | The extension bundles an executable and shares login and `config.toml` settings with the CLI (D, settings, auth); the 2026-10-24 file records shared MCP servers (I).                                                                                                                                                                       | `/cloud` and the Cloud selector delegate to Codex cloud and show results in the IDE; the ChatGPT macOS app can connect to VS Code; the desktop app hands chats between local and a worktree (D).                                                                | The 2026-10-24 file records mobile remote control of a desktop host and one account across the Chrome extension, desktop, CLI and IDE (I). |
| Copilot            | One shared harness runtime across VS Code, Copilot CLI and the Copilot app; sessions resume in the terminal (D).                                                                                                                                                                                                                            | Cloud agents return pull requests; Local sessions hand off to Cloud with history; the Agents window tracks sessions across harnesses (D).                                                                                                                       | Integrated browser rather than a Chrome extension; mobile not read (U).                                                                    |
| Cursor             | A CLI exists and shares the usage pool; whether the editor and CLI share an engine is not stated (D for pool, U for engine).                                                                                                                                                                                                                | Cloud agents from the editor, cursor.com/agents, iOS, Slack, Linear, GitHub and an API; move between cloud and local (D).                                                                                                                                       | iOS app; Android through a PWA; no official Chrome extension found (D for launch points, U for Chrome).                                    |
| Devin Desktop      | Devin Local shares its harness with Devin CLI (D).                                                                                                                                                                                                                                                                                          | Sessions move between Desktop and Devin Cloud; `devin ssh` opens a Devin VM in Desktop (I, carried).                                                                                                                                                            | Mobile waitlist and no Chrome extension found in the 2026-10-24 file (I).                                                                  |
| Gemini Code Assist | Separate from Gemini CLI, which Google now says is not optimized for the latest Gemini models (D).                                                                                                                                                                                                                                          | Google Cloud consoles and editors only (D).                                                                                                                                                                                                                     | Not stated (U).                                                                                                                            |
| Antigravity        | "Unified sign-in with CLI and 2.0 app, shared entitlements and rate limits" (I, carried; the blog confirms shared context with the rest of Antigravity (D)).                                                                                                                                                                                | App, CLI, standalone IDE and extensions are separate installs; Remote Control drives desktop and CLI sessions from any browser (D).                                                                                                                             | A browser agent uses a separate Chrome profile; whether there is a Chrome extension was not found (D, U).                                  |
| Kiro               | JetBrains reaches Kiro through Kiro CLI over ACP (I, carried). Whether the IDE and CLI share an engine is not stated (U).                                                                                                                                                                                                                   | Cloud sessions: IDE to Web, IDE to CLI, CLI to Web, and any surface to Mobile; Web or CLI back to the IDE is not documented (D).                                                                                                                                | Kiro Mobile is early access in the 2026-10-24 file; no Chrome extension found (I).                                                         |
| Cline              | The CLI, SDK, desktop app and extensions are built "on the same core" (D, what-is-cline).                                                                                                                                                                                                                                                   | Desktop app with scheduled tasks; Kanban board for parallel agents; no hosted cloud agent found (D, U).                                                                                                                                                         | No phone app or Chrome extension found (U).                                                                                                |

## 5. Unverified

- No product was driven. Every capability is documented or indirect; none is Observed. Behaviors such as
  how Auto approvals feel, diff latency, or checkpoint reliability are unknown.
- The matrix counts are floors. Many Unknown cells are probably Yes (for example image input in Codex,
  Devin Desktop and Cline; inline completions in Claude Code or Codex are probably No, but no page says so).
- Claude Code: web search and fetch inside the extension were not read; `.claude/rules` and AGENTS.md
  behavior is from the memory page only. The VS Code minimum version still differs between the docs
  (1.94.0) and the marketplace (1.98.0).
- Codex: whether Free and Go include the IDE extension is unresolved (pricing page "Not stated" against
  the marketplace plan list); the mapping from IDE approval-mode labels to policy settings; image input,
  terminal output, browser tools and checkpoints in the IDE; how cloud tasks are started from the IDE
  beyond the `/cloud` command. The app-server statement is from a search summary.
- Copilot: the second half of the plans page (Business and Enterprise rows) was not read. Whether the
  integrated browser is still Preview, whether code review costs premium requests or credits, and how
  Business and Enterprise differ on cloud agent and review. Whether a Claude or ChatGPT consumer
  subscription (as opposed to Copilot billing or an API key) works in Copilot's third-party harnesses.
- Cursor: Cmd+K inline edit, `.cursorrules` legacy support, memories, and the ownership question were not
  confirmed on today's pages; several docs URLs returned 404 and were reached through other paths. The
  per-plan Cursor usage figures beyond the multipliers were not found.
- Devin Desktop: rename date; whether any extension installs work; checkpoints, privacy and BYOK; plugin
  end-of-life dates. Most feature statements are search summaries.
- Gemini Code Assist: checkpoints, plan mode, inline edit and code review detail; how consumer users are
  directed to Antigravity beyond the Cloud overview's CLI note.
- Antigravity: which agent features run inside the IDE extensions as opposed to the app and CLI; paid
  plan prices and limits (the pricing page omits them); BYOK.
- Kiro: image input, web or docs retrieval beyond `#url`, data-protection and retention terms, enterprise
  controls detail, VS Code or JetBrains plugin status (none found), code review. Free-tier model details
  were left out under the no-versions rule.
- Cline: release date and version of the current build (the GitHub releases list was empty and the
  marketplace shows no date), inline completions, image input, hooks and subagent behavior, telemetry,
  privacy, and how ClinePass limits compare in practice (a vendor claim).
- JetBrains AI Assistant: pricing disagrees across JetBrains pages; Zed's own AI features were not read.
- Install counts and ratings change daily; the figures are as read on 2026-10-25.
