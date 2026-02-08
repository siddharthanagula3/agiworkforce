# AGI Workforce

> Autonomous AI desktop automation for everyone — not just developers

**AGI Workforce** is a chat-first AI platform that gives you a personal AI agent capable of controlling your entire desktop. Unlike code editors like [Cursor](https://cursor.com) or [Windsurf](https://codeium.com/windsurf), AGI Workforce is designed for **non-technical users** who want AI to handle complex tasks autonomously — with a safety net.

## Why AGI Workforce?

| Feature | AGI Workforce | Cursor/Windsurf | Claude Code |
|---------|---------------|-----------------|-------------|
| **Target User** | Everyone | Developers | Developers |
| **Interface** | Chat (no commands) | Slash commands | CLI commands |
| **Autonomy** | Full with approval gates | Manual execution | Manual execution |
| **Undo System** | Complete change reversal | Basic undo | Basic undo |
| **Screen Awareness** | Continuous (3-sec loop) | On-demand | Manual |
| **Desktop Control** | Full (browser, UI, files) | IDE only | IDE only |
| **Learning** | Adapts from experience | None | None |
| **Local-First** | SQLite, works offline | Cloud-dependent | Cloud-dependent |

---

## Core Philosophy

### 1. Chat-First, Command-Free

No slash commands. No memorizing syntax. Just describe what you want:

```
"Book me a flight to NYC next Friday under $500"
"Find all invoices from last month and summarize them"
"Create a presentation about Q3 sales with charts"
```

The AI understands your **intent** automatically using smart pattern matching — 40+ action verbs recognized, confidence scoring, and automatic execution suggestions.

### 2. Full Autonomy with Safety Net

AGI Workforce gives AI real power to act, but you stay in control:

- **Approval Workflow**: Multi-level rules decide what needs your OK
- **Undo Everything**: Reverse any action — single change, last change, or entire task
- **Dangerous Op Detection**: Automatically flags risky operations
- **Screen Monitoring**: AI sees what it's doing in real-time

### 3. Beyond Code — Full Desktop Automation

Not limited to editing files. AGI Workforce can:

- **Browser**: Navigate, click, fill forms, extract data
- **Desktop UI**: Control any application via accessibility APIs
- **Terminal**: Run commands with AI-assisted suggestions
- **Files**: Read, write, organize, with full undo support
- **Communication**: Email, calendar, messaging integrations

---

## Key Features

### 🧠 AGI Reasoning Engine

A sophisticated multi-turn reasoning system — not just autocomplete:

- **Goal Decomposition**: Breaks complex tasks into executable steps
- **Planning**: Creates multi-step plans with dependency tracking
- **Reflection**: Learns from failures, generates corrections
- **Memory**: Maintains working memory (1000-entry temporal store)
- **Knowledge Base**: SQLite-backed long-term knowledge with indexing

**Safety Limits**: 1000 iterations max, 5-minute timeout, 3 consecutive failures triggers stop.

```typescript
// Submit a goal - AI handles planning and execution
const { goal_id } = await invoke('agi_submit_goal', {
  goal: 'Research competitors and create a comparison report',
  priority: 'High',
});
```

### ↩️ Universal Undo System

**The killer feature for autonomous operation.** Every AI action is tracked and reversible:

- **File Operations**: Create, modify, delete — all reversible with content restoration
- **Task-Scoped Undo**: Reverse an entire agent session with one command
- **Change History**: Browse and selectively undo any past change
- **Content Preservation**: Original file contents stored for perfect restoration

```typescript
// Undo last change
await invoke('undo_last', {});

// See what can be undone
const summary = await invoke('undo_get_summary', {});
// { revertible_changes: 15, changes_by_type: { file_create: 5, file_modify: 10 } }

// Undo entire task
await invoke('undo_task', { taskId: 'task-123' });
```

**Chat Commands**:
- `/undo` — Undo the last change
- `/undo list` — Show all undoable changes
- `/undo [id]` — Undo specific change

### 👁️ Continuous Screen Awareness

Unlike on-demand screenshots, AGI Workforce maintains **continuous visual context**:

- **3-Second Capture Loop**: Always knows what's on screen
- **Change Detection**: Skips redundant frames (hash-based)
- **Memory Efficient**: Circular buffer of 10 frames, auto-downscaled to 1280px
- **Real-Time Decisions**: AI uses latest screenshot for every action

### 🔐 Multi-Level Approval Workflow

Five built-in approval rules — extend with your own:

| Rule | Description |
|------|-------------|
| PatternMatch | Block/allow based on task description patterns |
| NoFileSystemOps | Require approval for any file operations |
| NoNetworkOps | Require approval for network requests |
| ReadOnly | Allow reads, block writes |
| AlwaysRequire | Always ask for approval |

**Dangerous operation detection** flags: file deletion, system modification, network requests to unknown hosts, shell commands with pipes/redirects.

### 📚 Learning & Reflection

The AI improves over time:

- **Experience Tracking**: Records tool success rates, execution times
- **Strategy Profiles**: Builds effective patterns for task types
- **Reflection Engine**: Analyzes failures, generates corrections
- **Outcome Scoring**: Rates process efficiency to optimize future attempts

### 🔀 Multi-Provider LLM Router

Intelligent routing across **10 LLM providers**:

| Provider | Models |
|----------|--------|
| OpenAI | GPT-5.2, GPT-5, GPT-5-nano, o3 |
| Anthropic | Claude 4.6 Opus, Claude 4.5 Sonnet, Claude 4.5 Haiku |
| Google | Gemini 3 Pro, Gemini 3 Flash (via ManagedCloud) |
| DeepSeek | DeepSeek V3, DeepSeek Reasoner |
| xAI | Grok 4.1, Grok 4 |
| Perplexity | Sonar Pro, Sonar Reasoning |
| Ollama | Any local model (Llama 4, Gemma 3, etc.) |
| Qwen | Qwen3 Max, Qwen3 Coder |
| Moonshot | Kimi K2.5 |
| ManagedCloud | Proxy routing to any provider |

**Features**:
- Automatic fallback on provider failure
- Cost optimization based on task complexity
- Token accounting per conversation
- Full streaming support (SSE)

### 🌐 Browser Automation

Semantic web automation — describe what you want, not CSS selectors:

```typescript
// Semantic (AGI Workforce)
await invoke('click_semantic', { description: 'Login button' });

// vs. Traditional (brittle)
await invoke('browser_click', { selector: '#btn-login-2024-v2' });
```

**Capabilities**:
- Multi-tab orchestration
- Form filling, data extraction
- Screenshot documentation
- Network interception
- JavaScript execution

### 💻 AI-Powered Terminal

Beyond command execution:

- **PTY Integration**: Full terminal (bash, zsh, fish, PowerShell)
- **AI Suggestions**: Describe task, get command
- **Error Explanation**: AI explains what went wrong and how to fix
- **Smart Commits**: Auto-generate meaningful git messages

```typescript
const suggestion = await invoke('terminal_ai_suggest_command', {
  description: 'Find files larger than 100MB modified this week',
});
// Returns: "find . -size +100M -mtime -7"
```

### 🔌 MCP Integration (40+ Servers)

Full Model Context Protocol support:

- **Pre-configured servers**: GitHub, Slack, Google, Notion, and more
- **Secure credentials**: OS keyring integration
- **Auto-reconnection**: Health monitoring with recovery
- **Tool caching**: Reduces redundant calls

### 🏢 Enterprise Features

Built for teams:

- **Team Management**: Create teams, manage members
- **Role-Based Access**: Granular permissions
- **Audit Logging**: Tamper-proof event trail (hash chain)
- **Policy Engine**: ABAC (Attribute-Based Access Control)
- **Analytics**: ROI calculator, usage reports

---

## Architecture

```
src/
├── core/                 # AI Systems
│   ├── agi/              # Reasoning engine (19 files)
│   │   ├── core.rs       # Main orchestration
│   │   ├── planner.rs    # Goal → plan decomposition
│   │   ├── executor.rs   # Step execution
│   │   ├── memory.rs     # Working memory (1000-entry)
│   │   ├── learning.rs   # Experience tracking
│   │   ├── knowledge.rs  # Long-term knowledge base
│   │   └── reflection.rs # Failure analysis
│   ├── agent/            # Agent system (16 files)
│   │   ├── autonomous.rs # Self-healing task execution
│   │   ├── approval.rs   # 5-rule approval manager
│   │   ├── undo_manager.rs # Change reversal
│   │   └── change_tracker.rs # Action tracking
│   ├── llm/              # LLM routing (30+ files)
│   │   ├── llm_router.rs # Provider selection
│   │   ├── providers/    # 11 provider implementations
│   │   └── cost_calculator.rs # Cost tracking
│   └── mcp/              # MCP protocol (13 files)
├── sys/commands/         # Tauri API (70+ files)
│   ├── chat/             # Intent detection, messaging
│   ├── undo.rs           # Undo commands
│   └── ...               # 70+ command modules
├── automation/           # Desktop control
│   ├── screen/           # Continuous capture
│   ├── browser/          # Web automation
│   └── input/            # Keyboard/mouse simulation
├── data/                 # Persistence
│   └── db/               # SQLite with migrations
└── features/             # High-level features
    ├── terminal/         # AI-assisted terminal
    ├── document/         # PDF, Word, Excel
    └── teams/            # Team management
```

**462 Rust files** • **508 TypeScript files** • **Single-developer built**

---

## Quick Start

### Prerequisites

- Rust 1.70+
- Node.js 22+
- macOS: Xcode CLI | Windows: VS Build Tools | Linux: build-essential

### Development

```bash
pnpm install
pnpm dev:desktop    # Hot-reload at localhost:5173
cargo test          # Run Rust tests
cargo clippy        # Lint
```

### Production Build

```bash
pnpm build:desktop
# Creates: DMG (macOS) | EXE (Windows) | AppImage (Linux)
```

---

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `RUST_LOG` | Logging: debug, info, warn, error |
| `AGI_API_URL` | Base URL for the AGI Workforce managed cloud (Vercel proxy) |

### SQLite Optimizations

```sql
PRAGMA busy_timeout = 5000;   -- Wait for locks
PRAGMA journal_mode = WAL;    -- Write-Ahead Logging
PRAGMA cache_size = -64000;   -- 64MB cache
```

**Location**: `~/.config/agiworkforce/agiworkforce.db`

---

## Documentation

- **[Developer Guide](./DEVELOPER_GUIDE.md)** — Commands, database, security
- **[Updater Keys](./UPDATER_KEYS.md)** — Auto-updater configuration
- **[UI Components](../UI_COMPONENTS.md)** — Component catalog
- **[Component Documentation](../COMPONENT_DOCUMENTATION.md)** — Feature components

---

## Comparison with Similar Tools

### vs. Cursor / Windsurf

These are **AI code editors** — great for developers who want autocomplete and inline suggestions. AGI Workforce is a **task automation platform** for anyone who wants AI to handle entire workflows, not just write code.

### vs. Claude Code / Codex CLI

These are **terminal-based coding agents**. AGI Workforce provides a **visual chat interface** with continuous screen awareness — no command-line required.

### vs. n8n / Zapier

These are **workflow automation tools** requiring manual setup. AGI Workforce uses **natural language** — just describe what you want, and the AI builds and executes the workflow.

---

## Security

- **Policy Engine**: ABAC with granular action control
- **Approval Workflow**: Multi-level gates for risky operations
- **Audit Logging**: Hash-chained event trail
- **Secret Management**: AES-GCM encryption with machine-derived keys
- **Prompt Injection Detection**: Identifies malicious prompts
- **Sandbox**: Isolated code execution

---

## Sources & Inspiration

- [Best AI Coding Agents 2025](https://martinterhaak.medium.com/best-ai-coding-agents-summer-2025-c4d20cd0c846) — Industry landscape
- [Claude Code vs Cursor](https://www.qodo.ai/blog/claude-code-vs-cursor/) — Comparison insights
- [Agentic AI Best Practices](https://www.amplifilabs.com/post/agentic-ai-coding-assistants-in-2025-which-ones-should-you-try) — Design principles
- [Tauri Architecture](https://v2.tauri.app/concept/architecture/) — Technical foundation

---

## Contributing

1. Fork → Branch → Code → Test → PR
2. Run `cargo fmt && cargo clippy` before committing
3. Add tests for new features

---

## License

See LICENSE file.

---

**Built with** Tauri 2.9 • Rust • React 19 • SQLite • Tokio

**Version**: 1.1.1 with global auto-updater
