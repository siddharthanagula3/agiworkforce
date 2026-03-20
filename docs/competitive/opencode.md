# OpenCode Competitive Analysis

**Date**: 2026-03-19
**Subject**: OpenCode (sst/opencode) -- open-source AI coding agent
**Purpose**: Competitive intelligence for AGI Workforce CLI (`apps/cli/`)

---

## 1. Project Overview

| Attribute | Value |
|-----------|-------|
| **Name** | OpenCode |
| **Tagline** | "The open source coding agent" |
| **Repo** | github.com/sst/opencode (also github.com/anomalyco/opencode) |
| **Website** | opencode.ai |
| **License** | MIT |
| **Stars** | 125,526 |
| **Forks** | 13,226 |
| **Open Issues** | 7,190 |
| **Created** | 2025-04-30 |
| **Latest Release** | v1.2.27 (2026-03-16) -- shipping ~2x/week |
| **Primary Language** | TypeScript (54.9%), MDX docs (40.9%), Rust (0.5% -- Tauri shell) |
| **Runtime** | Bun |
| **Package Manager** | Bun workspaces (monorepo) |
| **Monthly Active Devs** | ~2.5M (reported) |

**History**: Originally built in Go by opencode-ai (Bubble Tea TUI). That repo was archived September 2025. The SST team (creators of SST framework and terminal.shop) rebuilt it from scratch in TypeScript. The SST version is now the canonical active project with 125K+ stars.

**Key People**: thdxr (Dax Raad, SST co-founder), adamdotdevin, rekram1-node, jayair (Jay V, SST co-founder), fwang (Frank Wang, SST co-founder).

---

## 2. Architecture

### Client-Server Model

OpenCode uses a **decoupled client-server architecture**, which is a major architectural differentiator:

```
opencode serve  (headless backend -- Hono HTTP server + SSE)
    |
    +-- TUI client (terminal, built with OpenTUI)
    +-- Desktop client (Tauri v2 + Solid.js)
    +-- VS Code extension
    +-- Web client (browser)
    +-- Mobile (remote attach via HTTP)
    +-- ACP (Agent Client Protocol -- Zed, JetBrains, Neovim)
```

The server can run standalone (`opencode serve`) and clients attach to it via HTTP/SSE. This means:
- Run the server on a powerful machine, drive it from a phone or tablet
- Multiple clients can attach to the same server
- `opencode run --attach http://localhost:4096 "prompt"` sends commands to a running server
- mDNS discovery for LAN service advertising

### Core Backend Stack

| Component | Technology |
|-----------|-----------|
| HTTP Server | Hono |
| Database | SQLite + Drizzle ORM |
| Schema Validation | Zod |
| AI Provider Abstraction | Vercel AI SDK (ai-sdk v5) |
| Runtime | Bun |
| Monorepo | Turbo |
| TUI Rendering | OpenTUI (custom) |
| Syntax Highlighting | Shiki |
| Markdown | Marked |

### Monorepo Structure (20+ packages)

```
packages/opencode/        # Core CLI + server (main package)
packages/app/              # Shared UI logic (Solid.js)
packages/ui/               # Component library + theming
packages/desktop/          # Tauri desktop app
packages/web/              # Astro documentation site
packages/sdk/js/           # TypeScript SDK (auto-generated from OpenAPI)
packages/plugin/           # Plugin interface
packages/slack/            # Slack bot (Bolt framework)
packages/function/         # Cloud functions (GitHub webhooks)
packages/console/          # OpenCode Zen admin (SolidStart + Cloudflare Workers)
sdks/vscode/               # VS Code extension
```

### Agent Processing Pipeline

```
Client -> Server.App (HTTP) -> SessionPrompt.prompt()
  -> Provider.getModel() -> AI SDK LanguageModel
  -> SessionPrompt.loop() iterates:
     1. AI generates response with tool calls
     2. Tool.execute() runs each tool
     3. Permission checks applied
     4. Results sent back to AI model
     5. All state persists to sessions.db
     6. SSE events streamed to client
```

---

## 3. Feature Catalog

### 3.1 Multi-Provider Support (75+ providers)

| Category | Providers |
|----------|-----------|
| Cloud | Anthropic, OpenAI, Google, AWS Bedrock, Azure OpenAI, Google Vertex AI |
| Gateways | OpenRouter, Cloudflare AI Gateway |
| Specialized | GitHub Copilot, GitLab Duo, DeepSeek, Groq |
| Local | Ollama, LM Studio (via openai-compatible adapter) |
| Curated | OpenCode Zen (managed service with billing) |

Model switching: `Ctrl+O` in TUI or `--model provider/model-id` on CLI.

### 3.2 Built-in Tools (20+)

| Tool | Description | Notes |
|------|-------------|-------|
| `bash` | Execute shell commands | Permission-controlled, glob patterns for command allowlists |
| `edit` | Exact string replacement in files | Primary file modification mechanism |
| `write` | Create new files or overwrite | Governed by `edit` permission |
| `read` | Read file contents | Supports line ranges for large files |
| `grep` | Regex search across codebase | Uses ripgrep, respects .gitignore |
| `glob` | Find files by pattern | Returns sorted by modification time |
| `list` | List files/directories | With glob filtering |
| `patch` | Apply patch files | Controlled by `edit` permission |
| `task` | Delegate to subagents | Multi-step parallel task delegation |
| `skill` | Load SKILL.md files | On-demand reusable instructions |
| `todowrite` | Manage todo lists | Track multi-step operations |
| `todoread` | Read todo lists | Check pending/completed tasks |
| `webfetch` | Fetch web pages | Documentation lookup |
| `websearch` | Web search via Exa AI | Requires OPENCODE_ENABLE_EXA=1 |
| `question` | Ask user questions | Supports custom answer options |
| `lsp` | LSP operations | Experimental: goToDefinition, findReferences, hover, symbols, callHierarchy |
| `multiedit` | Batch file edits | Multiple edits in one call |

### 3.3 Agent System

**Built-in Primary Agents:**
- **Build**: Default agent. All tools enabled. Full development capability.
- **Plan**: Analysis/planning only. File edits and bash set to `ask`. Read-only by default.

**Built-in Subagents:**
- **General**: Full tool access (except todo). For multi-step parallel tasks.
- **Explore**: Read-only. Quick codebase exploration.

**Hidden System Agents:**
- **Compaction**: Auto-summarizes conversations near context limit.
- **Title**: Generates session titles.
- **Summary**: Creates conversation summaries.

**Custom Agents**: Defined in JSON config or markdown files in `.opencode/agents/` or `~/.config/opencode/agents/`. Each agent supports:
- Custom system prompt (inline or `{file:path}`)
- Model override
- Temperature / top_p control
- Step limits (max agentic iterations)
- Per-agent permission overrides
- Color customization for UI
- Mode: primary, subagent, or all

**Agent Switching**: `Tab` key in TUI toggles between primary agents.

### 3.4 Agent Skills

Reusable instruction sets loaded on-demand via the `skill` tool:
- Directory: `.opencode/skills/<name>/SKILL.md`
- Also reads `.claude/skills/` and `.agents/skills/` (cross-tool compatibility)
- Global: `~/.config/opencode/skills/`
- YAML frontmatter: name, description, license, compatibility, metadata
- Permission control: allow/deny/ask per skill via glob patterns
- Traverses upward from CWD to git root, loading skills along the way

### 3.5 Session Management

- SQLite-backed persistent sessions
- `Ctrl+A` to switch sessions in TUI
- `Ctrl+N` for new session
- `--continue` / `-c` to resume last session
- `--session <id>` to resume specific session
- `--fork` to branch a session
- Export/import sessions (JSON or share URLs)
- `/share` command generates shareable links
- Session statistics: `opencode stats --days 30 --tools 10 --models`
- Auto-compact: summarizes at 95% context capacity

### 3.6 Configuration System (8-Layer Precedence)

From lowest to highest priority:
1. Remote config (`.well-known/opencode` endpoint)
2. Global config (`~/.config/opencode/opencode.json`)
3. Custom config (`OPENCODE_CONFIG` env var)
4. Project config (`opencode.json` in project root)
5. `.opencode/opencode.json`
6. Inline config (`OPENCODE_CONFIG_CONTENT` env var)
7. Managed config (`/etc/opencode/opencode.json`)
8. Runtime managed override

Variable substitution: `{env:VAR}` for env vars, `{file:path}` for file contents.

### 3.7 LSP Integration (30+ Languages)

Auto-detects and starts LSP servers for:
- Python (Pyright), TypeScript/JavaScript, Rust, Go, Java, C/C++, C#
- PHP, Ruby, Dart, Kotlin, Swift, Lua
- Gleam, Elixir, Clojure, Haskell, OCaml, F#, Zig, Nix
- Terraform, Typst, Prisma
- Astro, Vue, Svelte (auto-install)

Features: diagnostics feedback to LLM, goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, goToImplementation, callHierarchy.

Auto-download can be disabled via `OPENCODE_DISABLE_LSP_DOWNLOAD`.

### 3.8 MCP Support

- **Local servers**: Launched via command array (stdio transport)
- **Remote servers**: HTTP/HTTPS URL (streamable HTTP)
- **OAuth2**: Automatic flow detection on 401 + Dynamic Client Registration (RFC 7591)
- **Pre-registered OAuth**: Manual client ID/secret/scope configuration
- **API key auth**: Bearer token via headers
- Permission model: same as built-in tools (allow/deny/ask)
- Per-agent MCP tool control
- CLI management: `opencode mcp add|list|auth|logout|debug`

### 3.9 ACP (Agent Client Protocol) Support

Open protocol for editor-agent communication via JSON-RPC over stdio:
- **Zed**: `opencode acp` in settings.json agent_servers
- **JetBrains**: acp.json with binary path
- **Neovim**: Avante.nvim or CodeCompanion.nvim integration
- Full tool access maintained in ACP mode
- Limitation: `/undo` and `/redo` not yet supported in ACP

### 3.10 Permissions System

Three-tier permission model:
- **allow**: Execute without approval
- **deny**: Cannot run
- **ask**: Requires user approval

Granular control:
- Per-tool permissions
- Per-command bash patterns (`"git *": "ask"`, `"grep *": "allow"`)
- Per-agent overrides
- Per-skill permissions
- Wildcard glob support (`"mymcp_*": "ask"`)
- Session-level allow (`A` key allows for entire session)

### 3.11 TUI (Terminal UI)

Built with OpenTUI (custom terminal rendering framework, NOT Bubble Tea in current version):
- Vim-like keybindings (hjkl navigation)
- Inline diff viewer
- Session browser (`Ctrl+A`)
- Model selector (`Ctrl+O`)
- Command palette (`Ctrl+K`)
- Help overlay (`Ctrl+?`)
- Log viewer (`Ctrl+L`)
- External editor support (`Ctrl+E`)
- Image drag-and-drop support
- File reference with `@` fuzzy search
- Plan mode toggle with `Tab`
- Custom themes via `tui.json`
- Scroll speed/acceleration configuration

### 3.12 Desktop Application (Tauri v2)

- Cross-platform: macOS (x64/arm64), Windows (x64), Linux (x64/arm64)
- Spawns `opencode serve` as sidecar process
- UI: Solid.js (from `@opencode-ai/app`)
- Multiple parallel sessions
- Workspace management
- Diff viewer with inline commenting
- Integrated terminal tabs
- One-click handoff to external editors
- Native notifications, clipboard, deep linking, auto-updates
- UI components: Kobalte (headless UI primitives)

### 3.13 Non-Interactive / Headless Mode

```bash
opencode run "prompt"                    # Single prompt execution
opencode run "prompt" --format json      # JSON output
opencode run --attach http://host:port   # Attach to running server
opencode serve                           # Headless API server
opencode web                             # Headless with web UI
```

### 3.14 GitHub Integration

- `opencode github install`: Set up GitHub Actions workflow
- `opencode github run`: Execute GitHub agent in CI
- Supports `--event` for mock GitHub events
- `--token` for PAT authentication
- Cloud function handlers for GitHub webhooks (`packages/function/`)

### 3.15 Slack Integration

- Full Slack bot via Bolt framework (`packages/slack/`)
- Drive OpenCode from Slack channels

### 3.16 Additional Features

- **`/init` command**: Analyzes project structure, generates AGENTS.md
- **`/undo` and `/redo`**: Revert or reapply code changes
- **`/share`**: Generate shareable conversation links
- **Custom commands**: Template-based slash commands with named arguments
- **Code formatters**: 25+ built-in formatters, custom formatter support
- **File snapshots**: Track file changes during sessions (toggleable for large repos)
- **Auto-update**: `true`, `"notify"`, or `false`
- **Plugin system**: npm packages or `.opencode/plugins/` with hooks:
  - `auth.loader`
  - `chat.params`
  - `tool.execute.before`
  - `tool.execute.after`
- **Context compaction**: auto, prune, reserved token buffer modes
- **File watcher**: Directory watching with ignore patterns
- **Instructions files**: Load from paths/globs specified in config
- **SDKs**: TypeScript SDK and Go SDK (auto-generated from OpenAPI spec)
- **Docker support**: Multi-arch images at `ghcr.io/anomalyco/opencode`
- **Claude compatibility**: Reads `.claude/CLAUDE.md`, `.claude/skills/`, `.claude/rules/`

---

## 4. Installation Methods

| Method | Command |
|--------|---------|
| curl | `curl -fsSL https://opencode.ai/install \| bash` |
| npm | `npm i -g opencode` |
| pnpm | `pnpm add -g opencode` |
| bun | `bun add -g opencode` |
| Homebrew | `brew install opencode` |
| AUR | `pacman -S opencode` |
| Chocolatey | `choco install opencode` |
| Scoop | `scoop install opencode` |
| Docker | `docker run ghcr.io/anomalyco/opencode` |
| Mise | Via mise version manager |
| Desktop | `.dmg` / `.exe` / `.AppImage` from GitHub Releases |

---

## 5. Environment Variables (40+)

Key environment variables:

| Variable | Purpose |
|----------|---------|
| `OPENCODE_CONFIG` | Custom config file path |
| `OPENCODE_CONFIG_CONTENT` | Inline JSON config |
| `OPENCODE_PERMISSION` | Inline JSON permissions |
| `OPENCODE_CLIENT` | Client identifier |
| `OPENCODE_AUTO_SHARE` | Auto-share sessions |
| `OPENCODE_DISABLE_AUTOUPDATE` | Skip update checks |
| `OPENCODE_DISABLE_LSP_DOWNLOAD` | Skip LSP auto-download |
| `OPENCODE_ENABLE_EXA` | Enable web search |
| `OPENCODE_DISABLE_CLAUDE_CODE` | Skip .claude reading |
| `OPENCODE_SERVER_PASSWORD` | Enable HTTP basic auth |
| `OPENCODE_EXPERIMENTAL` | Enable all experimental features |
| `OPENCODE_EXPERIMENTAL_PLAN_MODE` | Planning mode |
| `OPENCODE_EXPERIMENTAL_LSP_TOOL` | LSP tool access |

---

## 6. Competitive Comparison: OpenCode vs AGI Workforce CLI

### Feature Matrix

| Feature | OpenCode | AGI Workforce CLI | Winner |
|---------|----------|-------------------|--------|
| **Language** | TypeScript (Bun) | Rust | AGI (performance) |
| **Binary Size** | Node/Bun runtime needed | Single static binary | AGI |
| **Stars** | 125K | N/A (proprietary) | OpenCode (OSS momentum) |
| **Provider Support** | 75+ via AI SDK | 9+ via custom router | OpenCode |
| **Local Models** | Ollama, LM Studio | Ollama, LM Studio | Tie |
| **TUI** | OpenTUI (custom) | Custom Rust TUI | Tie |
| **Desktop App** | Tauri v2 + Solid.js | Tauri v2 + React 19 | Tie (similar tech) |
| **Mobile** | Remote attach via HTTP | QR-pair companion app | AGI |
| **Client-Server** | Full decoupled arch | Integrated | OpenCode |
| **Session Persistence** | SQLite + Drizzle | SQLite | Tie |
| **MCP Support** | stdio + HTTP + OAuth | stdio + SSE + HTTP | Tie |
| **ACP Support** | Zed, JetBrains, Neovim | N/A | OpenCode |
| **LSP Integration** | 30+ languages | N/A | OpenCode |
| **Agent System** | Primary + subagents | Agents + skills | Tie |
| **Skills System** | SKILL.md on-demand | Skills system | Tie |
| **GitHub CI** | Built-in Actions agent | N/A | OpenCode |
| **Slack Bot** | Built-in | N/A | OpenCode |
| **Plugin System** | npm plugins + hooks | N/A | OpenCode |
| **SDKs** | TypeScript + Go | N/A | OpenCode |
| **Non-Coding Skills** | Code-focused only | 150+ (healthcare, legal, finance) | AGI |
| **Voice Mode** | N/A | Whisper voice mode | AGI |
| **Desktop Autonomy** | Limited (code-focused) | Full desktop control (1375 commands) | AGI |
| **Security** | Permissions system | ToolGuard + SecretManager + Argon2id | AGI |
| **Cross-Device Sync** | Remote attach | Persistent thread sync | AGI |
| **Pricing** | Free (BYOK) + Zen paid tier | BYOK + SaaS model | Tie |
| **Claude Compatibility** | Reads .claude/ files | Native Claude support | Tie |
| **Web Search** | Exa AI integration | Built-in | Tie |
| **Code Formatters** | 25+ built-in | N/A | OpenCode |
| **Custom Commands** | Template-based | N/A | OpenCode |
| **Session Sharing** | `/share` with URLs | N/A | OpenCode |
| **Auto-Compact** | Context compaction | Compaction system | Tie |
| **File Snapshots** | Built-in | N/A | OpenCode |

### Where OpenCode Wins

1. **Massive OSS community**: 125K stars, 13K forks, 2.5M monthly devs
2. **Provider breadth**: 75+ providers via Vercel AI SDK abstraction
3. **Client-server architecture**: Run server remotely, attach from anywhere
4. **ACP protocol**: Native integration with Zed, JetBrains, Neovim
5. **LSP integration**: 30+ language servers for code intelligence
6. **Plugin ecosystem**: npm-based plugins with lifecycle hooks
7. **GitHub Actions agent**: Built-in CI/CD agent
8. **Slack bot**: Drive coding tasks from Slack
9. **Code formatters**: 25+ formatters built in
10. **Session sharing**: Generate shareable conversation URLs
11. **SDKs**: TypeScript and Go SDKs for programmatic access
12. **Ecosystem compatibility**: Reads Claude Code, Agents, and OpenCode skill formats

### Where AGI Workforce CLI Wins

1. **Performance**: Rust binary -- faster startup, lower memory, no runtime dependency
2. **Desktop autonomy**: 1375 system commands vs code-only tools
3. **Non-coding skills**: 150+ skills (healthcare, legal, finance, etc.)
4. **Mobile companion**: QR-pair with desktop, live dashboard, approve/deny from phone
5. **Voice mode**: Whisper-based voice input
6. **Security depth**: ToolGuard + SecretManager + Argon2id + AES-GCM encryption
7. **Cross-device sync**: Persistent thread sync across desktop and mobile
8. **Desktop control**: Full system automation beyond just code editing

### Key Threats from OpenCode

1. **OSS momentum is enormous** -- 125K stars and growing fast. Community contributions accelerate feature development.
2. **Provider flexibility** is a major selling point. Developers frustrated with Claude Code's Anthropic lock-in switch to OpenCode.
3. **Client-server architecture** enables remote coding workflows that are hard to replicate in a monolithic CLI.
4. **ACP protocol** means OpenCode works inside Zed, JetBrains, and Neovim natively -- expanding its reach beyond the terminal.
5. **Plugin system** allows third-party extensions without forking the project.
6. **Claude compatibility** (reading .claude/ files) lowers switching cost from Claude Code.
7. **Shipping velocity**: Releasing 2x/week with a core team of 5+ active contributors.

---

## 7. Strategic Recommendations for AGI Workforce CLI

### Must-Have (Close gaps immediately)

1. **LSP integration**: OpenCode's 30+ language server support gives the LLM much better code intelligence. Our CLI should integrate LSP diagnostics.
2. **Session sharing**: The ability to share conversations via URL is a compelling collaboration feature.
3. **ACP/editor protocol**: Consider supporting ACP for Zed/JetBrains/Neovim integration.
4. **GitHub CI agent**: A built-in GitHub Actions mode would expand our surface area.

### Should-Have (Strengthen differentiation)

5. **Client-server mode**: Consider decoupling the CLI into a server + thin client for remote workflows.
6. **Plugin hooks**: A plugin API with lifecycle hooks (pre-tool, post-tool, auth) would enable community extensions.
7. **Code formatters**: Integrate common formatters (prettier, rustfmt, gofmt, black, etc.) as built-in tools.
8. **File snapshots**: Track and visualize file changes during sessions for easy rollback.

### Unique Advantages to Double Down On

9. **Desktop autonomy** (1375 commands) -- OpenCode cannot match this. Emphasize non-code workflows.
10. **Mobile companion** -- OpenCode has remote attach but no dedicated mobile app with QR pairing.
11. **Voice mode** -- No equivalent in OpenCode.
12. **Non-coding skills** (150+) -- OpenCode is purely code-focused. Our breadth is a moat.
13. **Security depth** -- Enterprise-grade encryption and tool validation vs basic permissions.

---

## 8. Release Cadence & Activity

| Metric | Value |
|--------|-------|
| Release frequency | ~2x per week |
| Latest release | v1.2.27 (2026-03-16) |
| Top contributor | thdxr (1,924 commits) |
| Active core team | 5-6 people (SST team) |
| Bot contributions | opencode-agent[bot]: 257 contributions |
| Repo size | 217 MB |

---

## 9. Key Takeaways

1. **OpenCode is the #1 open-source Claude Code alternative** with 125K stars and massive adoption.
2. **It is NOT a direct competitor to AGI Workforce** -- OpenCode is code-only; AGI Workforce is a general-purpose AI desktop platform. But in the CLI coding use case, they overlap significantly.
3. **The client-server architecture is clever** -- it enables remote workflows, multiple frontends, and programmatic access via SDKs.
4. **The SST team ships fast** -- TypeScript rewrite from Go, desktop app, Slack bot, VS Code extension, and 1.2.27 releases in ~11 months.
5. **Provider flexibility is their biggest selling point** -- 75+ providers vs Anthropic-only Claude Code.
6. **Our moat is non-coding**: desktop autonomy, mobile companion, voice, 150+ non-coding skills, enterprise security. These are features OpenCode does not have and is not building toward.
