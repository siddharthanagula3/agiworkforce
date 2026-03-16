# Claude Cowork / Claude Code — Complete Reference Document

**Date:** 2026-03-16
**Purpose:** Implementation reference for replicating Claude Cowork + Claude Code capabilities in AGI Workforce
**Research method:** 12 parallel research agents, 50+ web sources, reverse-engineering reports

---

## 1. Architecture Summary

Claude Cowork = Claude Code CLI running inside a Linux VM. The VM exists purely for sandboxing.

```
┌─────────────────────────────────────────────┐
│ Claude Desktop (Electron app)                │
│  ├── Chat mode (conversational)              │
│  ├── Code mode (terminal CLI)                │
│  └── Cowork mode (agentic GUI)               │
│       │                                      │
│       ▼                                      │
│  ┌─────────────────────────────────┐         │
│  │ Apple Virtualization Framework   │         │
│  │  ┌───────────────────────────┐  │         │
│  │  │ Ubuntu 22.04 ARM64 VM     │  │         │
│  │  │  ├── Claude Code CLI      │  │         │
│  │  │  ├── bubblewrap sandbox   │  │         │
│  │  │  ├── goproxy MITM proxy   │  │         │
│  │  │  ├── SDK daemon (vsock)   │  │         │
│  │  │  └── Pre-installed tools  │  │         │
│  │  └───────────────────────────┘  │         │
│  └─────────────────────────────────┘         │
└─────────────────────────────────────────────┘
```

**AGI Workforce equivalent:** Tauri app → native OS tools → ToolGuard (no VM needed)

---

## 2. VM Specifications

| Spec | Value |
|------|-------|
| OS | Ubuntu 22.04.5 LTS (Jammy) ARM64 |
| Hypervisor | Apple Virtualization Framework |
| vCPUs | 4 |
| RAM | 3.8 GB (configurable up to 8 GB) |
| Root disk | 10 GB (sparse ext4) |
| Session disk | 36 MB+ at `/sessions` |
| Boot time | ~60 seconds |
| Bundle path | `~/Library/Application Support/Claude/vm_bundles/claudevm.bundle/` |
| Bundle size | ~2.3 GB zstd compressed |
| Host-guest comm | virtio socket (vsock), NOT TCP |
| File sharing | VirtioFS (paravirtualized) |
| Network | goproxy MITM on HTTP:3128, SOCKS:1080 |
| Windows | Hyper-V / Host Compute System with VHDX images |

### Pre-installed Software
- Python 3.10.12, Node.js 22.22.0, Ruby 3.0.2, TypeScript 5.9.3
- ffmpeg 4.4.2, git 2.34.1, pandoc 2.9.2, ImageMagick 6.9, ripgrep, jq 1.6, sqlite3
- Node packages: docx, pptxgenjs, pdf-lib, sharp
- Python packages: beautifulsoup4, camelot-py, pandas, numpy, matplotlib, pdfminer, opencv-python

### Network Allowlist (23 domains)
Confirmed: `api.anthropic.com`, `pypi.org`, `files.pythonhosted.org`, `registry.npmjs.org`, `github.com`, `rubygems.org`, `crates.io`

### Session Isolation
- Each conversation gets a dedicated Linux UID
- Directory: `/sessions/<random-name>/` with `drwxr-x---`
- Multiple conversations share ONE VM instance
- VirtioFS mounts: `/sessions/<name>/mnt/<FolderName>/` → user's macOS folder

---

## 3. Complete Tool List (29 Tools)

### Core File Operations
| Tool | Permission | Description |
|------|-----------|-------------|
| **Read** | No | Read file with line numbers, pagination (2000 lines default), PDF/image/notebook support |
| **Write** | Yes | Create or overwrite files |
| **Edit** | Yes | Exact string find-and-replace (must read first, old_string must be unique) |
| **MultiEdit** | Yes | Batch find-and-replace on single file |
| **NotebookEdit** | Yes | Edit Jupyter notebook cells |

### Search
| Tool | Permission | Description |
|------|-----------|-------------|
| **Glob** | No | File pattern matching (`**/*.ts`), sorted by mtime |
| **Grep** | No | Regex content search (ripgrep), 3 output modes, context lines |
| **LS** | No | Directory listing with ignore patterns |

### Execution
| Tool | Permission | Description |
|------|-----------|-------------|
| **Bash** | Yes | Shell commands, 10min timeout, background mode, sandbox support |
| **BashOutput** | No | Retrieve incremental output from background bash |
| **KillShell** | No | Terminate background process |

### Web
| Tool | Permission | Description |
|------|-----------|-------------|
| **WebSearch** | Yes | Web search with domain filtering |
| **WebFetch** | Yes | Fetch URL, convert HTML→markdown, process with small model |

### Orchestration
| Tool | Permission | Description |
|------|-----------|-------------|
| **Agent** | No | Spawn subagent with isolated context (Explore/Plan/general-purpose) |
| **AskUserQuestion** | No | Multiple-choice questions (1-4 questions, 2-4 options each) |
| **TodoWrite** | No | Session task checklist (non-interactive/SDK) |
| **TaskCreate/Get/List/Update/Stop/Output** | No | Interactive task management |
| **Skill** | Yes | Execute a skill in main conversation |
| **ToolSearch** | No | Discover and load deferred MCP tools |

### Planning & Git
| Tool | Permission | Description |
|------|-----------|-------------|
| **EnterPlanMode** | No | Switch to read-only planning mode |
| **ExitPlanMode** | Yes | Present plan for approval |
| **EnterWorktree** | No | Create isolated git worktree |
| **ExitWorktree** | No | Exit worktree session |

### Code Intelligence
| Tool | Permission | Description |
|------|-----------|-------------|
| **LSP** | No | Language Server Protocol (type errors, go-to-def, find-refs) |

### MCP
| Tool | Permission | Description |
|------|-----------|-------------|
| **ListMcpResourcesTool** | No | List MCP server resources |
| **ReadMcpResourceTool** | No | Read MCP resource by URI |

### Scheduling
| Tool | Permission | Description |
|------|-----------|-------------|
| **CronCreate/Delete/List** | No | Schedule recurring prompts within session |

---

## 4. Permission System

### Three Tiers
| Tier | Example | Approval | "Don't ask again" |
|------|---------|----------|-------------------|
| Read-only | Read, Glob, Grep | Never | N/A |
| File modification | Edit, Write | Once per session | Until session end |
| Bash commands | Shell execution | Per unique command | Permanently per project |

### Permission Modes (cycle with Shift+Tab)
- `default` — standard prompting
- `acceptEdits` — auto-accept file edits, still ask for commands
- `plan` — read-only tools only, creates plan for approval
- `dontAsk` — auto-deny unless pre-approved
- `bypassPermissions` — skip all checks (containers only)

### Rule Syntax
```
Bash(npm run *)        — glob match for bash commands
Read(./.env)           — specific file
Edit(/src/**/*.ts)     — gitignore-style path patterns
WebFetch(domain:example.com) — domain filter
Agent(Explore)         — specific subagent
```

### Rule Evaluation: deny → ask → allow (first match wins)

---

## 5. Cowork UI/UX (Detailed)

### Top-Level Navigation
- Three tabs at **top of window**: **Chat** | **Cowork** | **Code**
- Switching to Cowork transforms the entire interface into task-oriented mode
- "New Chat" becomes **"+ New Task"** in upper-left corner
- No split-view between modes (known pain point — GitHub issue #29136)

### Left Sidebar Layout
| Section | Purpose |
|---------|---------|
| **+ New Task** | Creates a new Cowork task (upper-left button) |
| **Task History** | List of previous and current tasks |
| **Scheduled** | View, create, edit, pause, resume, delete, run-on-demand |
| **Customize** | Unified hub: Plugins + Skills + Connectors management |

### Task Input Area
```
┌──────────────────────────────────────────────┐
│ [Model ▼]  Describe what you want done...    │
│                                              │
│ ☐ Work in a folder  [folder-icon]    [Send]  │
└──────────────────────────────────────────────┘
```
- **"Work in a folder" checkbox** → opens native OS folder picker, grants read/write/delete
- **Model selector dropdown** → adjacent to send button, locks once session starts
- **"/" slash command** → opens menu showing available Skills from plugins
- **"+" button** → shows Skills, Connectors, Tool Access settings

### Plan-Then-Execute Flow (Critical UX Pattern)
After submitting a task, Claude does NOT immediately execute:
1. Displays a **structured step-by-step plan** showing each intended action
2. Shows a **"Let it run" button** to authorize execution
3. Users can **review, edit, redirect, or reject** the plan
4. Only after approval does execution begin
5. Users can **intervene mid-task** to course-correct without stopping

### During Execution: Progress Display
- **TodoWrite progress widget** — checklist with three states:
  - `pending` → empty marker
  - `in_progress` → wrench/gear icon + `activeForm` text ("Analyzing files...")
  - `completed` → checkmark
- **Progress summary line**: "Progress: X/Y completed, Currently working on: Z"
- **Running log** of Claude's actions — "play-by-play" of commands/sub-tasks
- **Right sidebar** shows real-time progress
- **Parallel sub-agents visible** — multiple task streams shown simultaneously
- No loading spinner — granular checklist provides continuous transparency

### AskUserQuestion Widget
When Claude needs input during a task, renders as:
- **Question card** with header (max 12 chars) + full question text
- **2-4 clickable option buttons**, each with label + description
- **Preview panel** (optional) — markdown or HTML preview for visual comparisons
- **Multi-select mode** — checkboxes instead of radio buttons
- **"Other" option** — always present, opens free-text input
- Execution pauses until user responds

### File Output Display
- Generated files saved **directly to user's local folder** (not in-chat artifacts)
- **Artifacts pane** (right side) for inline preview: HTML, React JSX, Mermaid, SVG, PDF, Markdown
- **Viewer controls** (lower-right): view code, copy, download buttons
- Files are clickable, editable in the local directory
- Version tracking (e.g., `Newsletter_v1.md`)

### Folder Permission Dialog
- "Claude wants to read, edit, and delete files in [folder]. Allow?"
- Options: **"Allow once"** or **"Always Allow"** for repeated use
- Deletions always require explicit confirmation (no auto-approve)

### Customize Section (Sidebar)
**Plugins tab:**
- "Browse plugins" → catalog by department (sales, finance, legal, etc.)
- Install/uninstall toggles, "Upload" for custom plugins
- "Customize" button → Claude adjusts plugin config conversationally

**Skills tab:**
- Skills from installed plugins, accessed via "/" or "+"
- Document creation, presentations, spreadsheets, scheduling

**Connectors tab:**
- On/off toggles per connector
- **Per-tool permissions**: Allow | Ask | Block
- **Tool access mode**: Auto (default, <10 connectors) or On demand (10+)

### Scheduled Tasks UI
**Creation:** Type `/schedule` or click Scheduled > "+ New task"
| Field | Type |
|-------|------|
| Task name | Text |
| Description | Text |
| Prompt | Multi-line |
| Frequency | Dropdown: hourly, daily, weekly, weekdays, manual |
| Model | Optional dropdown |
| Working folder | Optional folder picker |

- Tasks only run while computer is awake and app is open
- Skipped runs logged in history, auto-run when app reopens

### Settings > Cowork
- **Global Instructions** — standing directives for all Cowork tasks (text editor + Save)
- **Folder Instructions** — per-project context (editable from chat or `.claude.md` file)
- **Internet access** — on/off toggle
- **Connector management** — link to settings

---

## 6. Plugin System

### Plugin = Bundle of (Skills + Connectors + Sub-agents)

**Directory structure:**
```
my-plugin/
  .claude-plugin/plugin.json    # Manifest
  skills/<name>/SKILL.md        # Skills
  agents/<name>.md              # Sub-agents
  hooks/hooks.json              # Event handlers
  .mcp.json                     # Connectors (MCP servers)
  .lsp.json                     # Language servers
  settings.json                 # Defaults
  scripts/                      # Utility scripts
```

### plugin.json (Manifest)
```json
{
  "name": "plugin-name",
  "version": "1.2.0",
  "description": "Brief description",
  "skills": "./skills/",
  "agents": "./agents/",
  "hooks": "./hooks/hooks.json",
  "mcpServers": "./.mcp.json"
}
```

### SKILL.md Format (Agent Skills Open Standard — agentskills.io)
```yaml
---
name: my-skill
description: When to use this skill
allowed-tools: Read, Grep, Glob
model: sonnet
context: fork
agent: Explore
user-invocable: true
---
# Skill Instructions
Claude follows these when the skill is active.
$ARGUMENTS placeholder for user input.
Dynamic context: !`shell command`
```

### Pre-built Plugins (by department)
- **Productivity**: Slack, Notion, Asana, Linear, Jira, Monday, ClickUp, Microsoft 365
- **Sales**: HubSpot, Close, Clay, ZoomInfo, Fireflies
- **Customer Support**: Intercom, Guru
- **Product Management**: Figma, Amplitude, Pendo
- **Marketing**: Canva, Ahrefs, SimilarWeb, Klaviyo
- **Legal**: Box, Egnyte, Harvey
- **Finance**: Snowflake, Databricks, BigQuery
- **Data**: Hex, statistical analysis
- **Bio Research**: PubMed, BioRender, bioRxiv, ClinicalTrials.gov
- **HR, Design, Engineering, Operations**: Various connectors

### Enterprise Marketplace
- Manual upload (100 plugins, 50MB max) or GitHub syncing (500 plugins)
- Admin controls: auto-install, per-user provisioning, non-editable, visibility gating

---

## 7. Deep Connectors

### What "Deep" Means
Connectors that expose a rich MCP tool surface covering full CRUD lifecycle. Claude chains multiple tool calls to navigate external services autonomously (browse → read → analyze → write → orchestrate).

### Connector vs MCP Server
| Aspect | Raw MCP Server | Managed Connector |
|--------|----------------|-------------------|
| Hosting | Self-hosted | Anthropic/partner hosted |
| Auth | Developer manages | Managed OAuth 2.1 + PKCE |
| Discovery | Manual URL | Browsable directory (200+) |
| Admin controls | None | Allowlist, provisioning, audit |
| Interactive UI | No | Can render React in sandboxed iframes |

### OAuth Flow: OAuth 2.1 + PKCE (mandatory)
1. Dynamic Client Registration → `client_id`
2. Authorization URL with `code_challenge` (PKCE)
3. User completes consent screen
4. Code exchange with `code_verifier`
5. Auto-refresh within 60-90 min

### Key Connectors
| Connector | Capabilities |
|-----------|-------------|
| **Google Drive** | Search, retrieve, analyze docs, save files back |
| **Gmail** | Search emails, read threads, draft replies (manual send only) |
| **Google Calendar** | Read schedules, find free time |
| **DocuSign** | Create, review, flag clauses, route for signature |
| **Microsoft 365** | Mail, Calendar, Teams, OneDrive, SharePoint (read-only currently) |
| **Slack** | Read/post messages, search channels |

### Enterprise Admin Controls
- Org-level connector enablement
- MDM deployment via `managed-mcp.json`
- Per-user provisioning
- OpenTelemetry for usage/cost tracking

---

## 8. Document Creation Skills

Built-in skills for professional document output:

| Format | Libraries Used | Capabilities |
|--------|---------------|-------------|
| PPTX | python-pptx | Layouts, themes, master slides, images, shapes |
| DOCX | python-docx | Formatting, styles, tables, images, TOC |
| XLSX | openpyxl | Formulas, charts, conditional formatting, pivot tables |
| PDF | pdf-lib | Parse, extract, generate reports, multipage |
| HTML/React | React 18 + embedded CSS/JS | Interactive single-file artifacts |
| Mermaid | mermaid.js | Diagrams, flowcharts |
| SVG | Native | Scalable vector graphics |

Available JS libraries for React artifacts: lucide-react, recharts, MathJS, lodash, d3, Plotly, Three.js, Papaparse, SheetJS, shadcn/ui, Chart.js, Tone.js, mammoth, tensorflow.js

---

## 9. Remote Control (Mobile Session Handoff)

### What It Is
Claude Code Remote Control lets you start a coding session on your desktop terminal and continue controlling it from your phone, tablet, or any browser via a secure QR code handoff. Launched February 25, 2026.

### How It Works
1. Run `claude remote-control` (server mode) or `/rc` from an existing session
2. Terminal displays a **QR code** + session URL
3. Scan with Claude mobile app (iOS/Android) or open URL in browser
4. Full session control from the remote device — same files, MCP servers, project config
5. Everything runs **locally on your machine** — only chat messages + tool results flow through encrypted bridge
6. Sessions auto-reconnect after network drops (up to ~10 minutes)

### Key Capabilities From Phone
- See what Claude is doing in real-time
- Approve or reject file changes
- Provide additional instructions
- Redirect work mid-task
- Monitor multiple sessions simultaneously

### Server Mode Flags
| Flag | Description |
|------|-------------|
| `--name "My Project"` | Custom session title |
| `--spawn <mode>` | `same-dir` (default) or `worktree` (each session gets own git worktree) |
| `--capacity <N>` | Max concurrent sessions (default 32) |
| `--sandbox` / `--no-sandbox` | Enable/disable filesystem+network isolation |

### Security Model
- Outbound HTTPS only — never opens inbound ports
- All traffic through Anthropic API over TLS
- Multiple short-lived credentials, each scoped and expiring independently
- Code never leaves your machine

### Availability
- All plans (Pro, Max, Team, Enterprise)
- Team/Enterprise admins must enable Claude Code in admin settings
- API keys not supported — requires claude.ai login

### AGI Workforce Equivalent
**You already have this architecture built!** Your signaling server + API gateway + mobile app design is the same pattern:
- `services/signaling-server/` — WebRTC signaling with QR pairing (`agiw:XXXXXXXX`)
- `services/api-gateway/src/routes/mobile.ts` — device registration + push tokens
- Mobile app → approve/deny agent actions via control messages through signal relay
- The infrastructure is operational — the mobile app UI (`apps/mobile/src/`) needs scaffolding

**Key differences:**
| Aspect | Claude Remote Control | AGI Workforce |
|--------|----------------------|---------------|
| Protocol | Anthropic API polling (HTTPS) | WebRTC signaling + WebSocket |
| Bridge | Anthropic-hosted relay | Self-hosted signaling server |
| Data locality | Code stays local, messages through Anthropic | Code stays local, messages through your server |
| Multi-session | Up to 32 concurrent (server mode) | Not yet implemented |
| Git worktree spawn | Built-in `--spawn worktree` | Not yet implemented |

---

## 10. AGI Workforce Gap Analysis

### What You Already Have (47+ tools)
- File read/write/delete/list with undo tracking
- Multi-edit with rollback
- Terminal execution (cross-platform)
- Code search (ripgrep-style)
- Web search + HTML scraping
- Browser automation via CDP
- Git operations
- Database queries
- Media generation
- Calendar, email, scheduling
- Desktop automation (mouse, keyboard, screen capture, OCR)
- Voice/speech (STT/TTS/PTT/VAD/wake word)
- 165 AI employee personas
- 22 LLM providers with intelligent routing

### What's Missing for Claude Code Parity (Sprint 1)
1. Wire existing `glob_search` + `grep_search` into LLM tool executor
2. Add `edit_exact_replace` (exact string match model)
3. Extend `grep_search` with output modes + context lines
4. Tiered permissions (extend existing ToolConfirmationState)
5. Named checkpoints with rewind UI (extend existing ChangeTracker)
6. Project instructions (`.agi/instructions.md`)
7. Coding agent system prompt
8. Folder selector in chat input

### What's Missing for Full Cowork Parity (Sprint 2+)
1. LSP integration (type errors, go-to-def, find-refs)
2. Document creation skills (PPTX, DOCX, XLSX, PDF)
3. Subagent spawning with isolated context
4. Deep Connectors (OAuth 2.1 + PKCE managed flow)
5. Plugin marketplace
6. Background agent execution with live status bar
7. Scheduled recurring tasks UI
8. AskUserQuestion structured widget
9. TodoWrite progress widget
10. Artifact inline rendering (HTML, React, Mermaid, SVG)

### What You EXCEED Claude Cowork On
1. **22 LLM providers** vs Claude-only
2. **Native desktop control** vs VM-isolated
3. **Voice/speech** (full stack) vs none
4. **Mobile companion** with QR pairing vs none
5. **165 AI personas** vs 7 document skills
6. **Memory/embeddings** with hybrid search vs none
7. **5 platforms** vs 2 (desktop only)
8. **BYOK** (user owns API keys) vs subscription-only

---

## 10. Sources

### Reverse Engineering / Architecture
- [Inside Claude Cowork (PVIEITO)](https://pvieito.com/2026/01/inside-claude-cowork)
- [VM Architecture Analysis (aaddrick.com)](https://aaddrick.com/blog/claude-desktop-cowork-mode-vm-architecture-analysis)
- [Claude Code Sandboxing (Anthropic Engineering)](https://www.anthropic.com/engineering/claude-code-sandboxing)
- [Sandbox Runtime (GitHub)](https://github.com/anthropic-experimental/sandbox-runtime)

### Official Documentation
- [Claude Code Tools Reference](https://code.claude.com/docs/en/tools-reference)
- [Claude Code Permissions](https://code.claude.com/docs/en/permissions)
- [Claude Code Plugins](https://code.claude.com/docs/en/plugins)
- [Claude Code Skills](https://code.claude.com/docs/en/skills)
- [Claude Code Subagents](https://code.claude.com/docs/en/sub-agents)
- [Get Started with Cowork](https://support.claude.com/en/articles/13345190-get-started-with-cowork)
- [Use Plugins in Cowork](https://support.claude.com/en/articles/13837440-use-plugins-in-cowork)
- [Schedule Recurring Tasks](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-cowork)
- [Cowork Plugins Enterprise Blog](https://claude.com/blog/cowork-plugins-across-enterprise)

### System Prompts & Internals
- [Claude Code System Prompts (GitHub)](https://github.com/Piebald-AI/claude-code-system-prompts)
- [Claude Code Tools Gist](https://gist.github.com/wong2/e0f34aac66caf890a332f7b6f9e2ba8f)
- [Agent Skills Standard](https://agentskills.io)

### Connectors
- [Connectors Directory](https://claude.com/connectors)
- [Microsoft 365 Security Guide](https://support.claude.com/en/articles/12684923-microsoft-365-connector-security-guide)
- [DocuSign MCP Connector Guide](https://www.docusign.com/blog/developers/claude-docusign-mcp-connector-guide)
- [Knowledge Work Plugins (GitHub)](https://github.com/anthropics/knowledge-work-plugins)
