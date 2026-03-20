# AGI Workforce CLI

Multi-model AI agent in your terminal. A Claude Code / Codex CLI competitor with 7 provider backends, 9 built-in tools, MCP support, session persistence, team mode, and skills.

## Installation

```bash
# From the monorepo root
cargo install --path apps/cli

# Or build in-place
cd apps/cli && cargo build --release
# Binary at target/release/agiworkforce
```

## Quick Start

```bash
# One-shot mode (answer and exit)
agiworkforce "Explain the builder pattern in Rust"

# Interactive REPL (no arguments)
agiworkforce

# Pipe input
echo "Summarize this" | agiworkforce

# File context
agiworkforce -f src/main.rs "Find bugs in this file"
```

## CLI Flags

### Prompt & Input

| Flag                            | Description                                       |
| ------------------------------- | ------------------------------------------------- |
| `<PROMPT>`                      | One-shot prompt (starts REPL if omitted)          |
| `-f, --file <FILE>`             | Include file(s) in context (repeatable)           |
| `--system-prompt <PROMPT>`      | Override the system prompt                        |
| `--append-system-prompt <TEXT>` | Append text to the system prompt                  |
| `--stdin`                       | Read prompt from stdin (auto-detected when piped) |

### Model & Provider

| Flag                        | Description                                                 |
| --------------------------- | ----------------------------------------------------------- |
| `-m, --model <MODEL>`       | Model to use (default: `claude-opus-4-6`)                   |
| `-p, --provider <PROVIDER>` | Provider override (anthropic, openai, google, ollama, etc.) |
| `--max-tokens <N>`          | Maximum tokens in response                                  |
| `-t, --temperature <TEMP>`  | Sampling temperature (0.0 - 1.0)                            |
| `--fallback-model <MODEL>`  | Fallback model on primary model failure                     |
| `--list-models`             | List all available models and exit                          |
| `--effort <LEVEL>`          | Effort preset: `low`, `medium`, `high`, `max`               |

### Output

| Flag                | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `--json`            | Output raw JSON response                                 |
| `--raw`             | Print output without any formatting                      |
| `--print`           | Explicit non-interactive mode (output response and exit) |
| `--no-stream`       | Disable streaming (get complete response at once)        |
| `--stream`          | Enable streaming output (default: true)                  |
| `--output <FORMAT>` | Output format: `text`, `json`, `stream-json`             |
| `-v, --verbose`     | Verbose output (show debug info)                         |
| `-q, --quiet`       | Suppress non-essential output (only print the response)  |

### Sessions

| Flag                     | Description                                     |
| ------------------------ | ----------------------------------------------- |
| `-c, --continue-session` | Continue from the most recent session           |
| `--session <ID>`         | Resume a specific session by ID                 |
| `-r, --resume <ID>`      | Resume a specific session (alias for --session) |
| `-n, --name <NAME>`      | Name the current session                        |
| `--fork-session`         | Fork a session (use with --session/--resume)    |
| `--search <QUERY>`       | Search saved sessions by keyword                |
| `--stats`                | Show session database statistics                |

### Tool Confirmation

| Flag                             | Description                                              |
| -------------------------------- | -------------------------------------------------------- |
| `-y, --yes`                      | Auto-approve safe tool calls (reads, searches, listings) |
| `--dangerously-skip-permissions` | Skip ALL tool confirmation prompts                       |
| `--max-turns <N>`                | Maximum agentic tool-use iterations                      |

### Agent & Team

| Flag     | Description                                                             |
| -------- | ----------------------------------------------------------------------- |
| `--team` | Enable team mode (shared tasks, teammate messaging). Also: `AGI_TEAM=1` |

### Other

| Flag                    | Description                                                |
| ----------------------- | ---------------------------------------------------------- |
| `--config`              | Show current configuration and exit                        |
| `--cost`                | Show session cost summary / model pricing                  |
| `--init`                | Initialize project with a CLAUDE.md template               |
| `--completions <SHELL>` | Generate shell completions: `bash`, `zsh`, `fish`          |
| `--debug [CATEGORIES]`  | Enable debug logging (optional comma-separated categories) |

## Usage Examples

### One-Shot with File Context

```bash
# Analyze a file
agiworkforce -f src/lib.rs "What does this module do?"

# Multiple files
agiworkforce -f Cargo.toml -f src/main.rs "Check for dependency issues"

# Pipe + prompt
cat error.log | agiworkforce "What went wrong?"
```

### Model Selection

```bash
# Use GPT-4o
agiworkforce -m gpt-4o "Write a haiku about Rust"

# Use Gemini
agiworkforce -m gemini-2.0-flash -p google "Summarize this code" -f main.rs

# Use a local Ollama model
agiworkforce -m llama3.1:8b -p ollama "Explain monads"

# List all available models
agiworkforce --list-models
agiworkforce --list-models --output json
```

### Effort Levels

```bash
# Quick answer (3 turns, 2K tokens, temp 0.3)
agiworkforce --effort low "What is a mutex?"

# Thorough (50 turns, 16K tokens)
agiworkforce --effort high "Refactor src/main.rs to use the builder pattern"

# Exhaustive (100 turns, 32K tokens)
agiworkforce --effort max "Audit this codebase for security issues" -f src/
```

### Session Management

```bash
# Start a named session
agiworkforce -n "auth-refactor"

# Continue the last session
agiworkforce -c

# Resume a specific session
agiworkforce --resume abc12345

# Fork from an existing session (non-destructive branch)
agiworkforce --resume abc12345 --fork-session

# Search sessions
agiworkforce --search "authentication"

# View statistics
agiworkforce --stats
```

### Auto-Approve Safe Tools

```bash
# Auto-approve reads/searches, still prompt for writes
agiworkforce -y "Find all TODO comments in this project"

# Skip all confirmations (dangerous -- use in CI only)
agiworkforce --dangerously-skip-permissions "Run the test suite"
```

### JSON Output (CI/CD)

```bash
# Get structured output
agiworkforce --json "List the 5 biggest files" | jq '.response'

# Stream-compatible NDJSON
agiworkforce --output stream-json "Generate a migration plan"
```

### Shell Completions

```bash
# Bash
agiworkforce --completions bash > ~/.local/share/bash-completion/completions/agiworkforce

# Zsh
agiworkforce --completions zsh > ~/.zfunc/_agiworkforce

# Fish
agiworkforce --completions fish > ~/.config/fish/completions/agiworkforce.fish
```

## Provider / Model Configuration

Configuration is loaded from three sources (later sources override earlier):

1. **Global config**: `~/.agiworkforce/config.toml`
2. **Project config**: `.agiworkforce/config.toml` in the current git root
3. **Environment variables**: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.

### Config File Format

```toml
[default]
model = "claude-opus-4-6"
provider = "anthropic"
stream = true
max_tokens = 8192
# temperature = 0.7
# fast_model = "claude-haiku-3.5"
# fallback_chain = ["gpt-4o", "gemini-2.0-flash"]

[providers.anthropic]
api_key_env = "ANTHROPIC_API_KEY"

[providers.openai]
api_key_env = "OPENAI_API_KEY"

[providers.google]
api_key_env = "GOOGLE_API_KEY"

[providers.ollama]
base_url = "http://localhost:11434"

[providers.mistral]
api_key_env = "MISTRAL_API_KEY"

[providers.xai]
api_key_env = "XAI_API_KEY"

[providers.deepseek]
api_key_env = "DEEPSEEK_API_KEY"
```

### Supported Providers

| Provider  | Env Variable        | Models                                             |
| --------- | ------------------- | -------------------------------------------------- |
| Anthropic | `ANTHROPIC_API_KEY` | claude-opus-4-6, claude-sonnet-4, claude-haiku-3.5 |
| OpenAI    | `OPENAI_API_KEY`    | gpt-4o, gpt-4o-mini, o1, o3-mini                   |
| Google    | `GOOGLE_API_KEY`    | gemini-2.0-flash, gemini-2.0-pro                   |
| Ollama    | (local)             | llama3.1, mistral, codellama, any pulled model     |
| Mistral   | `MISTRAL_API_KEY`   | mistral-large, mistral-medium                      |
| xAI       | `XAI_API_KEY`       | grok-2, grok-2-mini                                |
| DeepSeek  | `DEEPSEEK_API_KEY`  | deepseek-chat, deepseek-reasoner                   |

## REPL Commands

Inside the interactive REPL, use slash commands:

### Agent & Mode

| Command            | Description                         |
| ------------------ | ----------------------------------- |
| `/model <name>`    | Switch model (e.g. `/model gpt-4o`) |
| `/plan`            | Toggle plan mode (read-only tools)  |
| `/fast [on\|off]`  | Toggle fast mode (cheaper model)    |
| `/compact [focus]` | Manual context compaction           |
| `/btw <question>`  | Side query (not added to history)   |
| `/rewind`          | Rewind to previous checkpoint       |
| `/branch [name]`   | Fork conversation at current point  |
| `/diff`            | Show uncommitted git changes        |

### Configuration

| Command               | Description                       |
| --------------------- | --------------------------------- |
| `/config`             | Show current configuration        |
| `/config set <k> <v>` | Set config value                  |
| `/config get <key>`   | Get config value                  |
| `/providers`          | List all providers and key status |
| `/setup`              | Interactive provider setup        |
| `/permissions`        | View/reset permissions            |

### Sessions

| Command                | Description                         |
| ---------------------- | ----------------------------------- |
| `/save`                | Save conversation                   |
| `/load <id>`           | Load a saved conversation           |
| `/history`             | List saved conversations            |
| `/delete <id>`         | Delete a conversation               |
| `/export`              | Export (markdown or `/export json`) |
| `/rename <id> <title>` | Rename session                      |
| `/sessions`            | List sessions (SQLite)              |
| `/migrate`             | Migrate JSON to SQLite              |

### Memory & Project

| Command                     | Description                                  |
| --------------------------- | -------------------------------------------- |
| `/memory`                   | Show all memory tiers (global/project/local) |
| `/memory <tier>`            | View a specific tier                         |
| `/memory add [tier] <text>` | Add text to tier (default: project)          |
| `/memory edit [tier]`       | Edit tier in $EDITOR                         |
| `/init`                     | Initialize project with CLAUDE.md            |
| `# <text>`                  | Append text to project CLAUDE.md             |

### Info

| Command    | Description                           |
| ---------- | ------------------------------------- |
| `/status`  | Show version, model, provider, status |
| `/cost`    | Show session cost summary             |
| `/context` | Show context window usage             |
| `/models`  | List available models                 |
| `/skills`  | List available skills                 |
| `/hooks`   | Show configured hooks                 |
| `/login`   | Login with subscription               |
| `/logout`  | Logout                                |
| `/clear`   | Clear conversation context            |
| `/help`    | Show help                             |
| `/exit`    | Exit                                  |

### Shortcuts

| Shortcut      | Description                                 |
| ------------- | ------------------------------------------- |
| `! <command>` | Run shell command (output added to context) |
| `# <text>`    | Append text to project CLAUDE.md            |
| `\`           | Multi-line input                            |
| `Ctrl-C`      | Cancel input                                |
| `Ctrl-D`      | Exit                                        |

Set `AGIWORKFORCE_VI=1` for vim keybindings in the REPL.

## Tool Confirmation Behavior

The CLI uses a three-tier safety classification for shell commands:

### Safety Tiers

| Tier          | Behavior                                        | Examples                                       |
| ------------- | ----------------------------------------------- | ---------------------------------------------- |
| **Safe**      | Auto-approved with `-y` flag. No prompt needed. | `cat`, `ls`, `grep`, `cargo check`, `npm test` |
| **Unknown**   | Prompts for confirmation.                       | `mkdir`, `cp`, custom scripts                  |
| **Dangerous** | Always prompts with a warning, even with `-y`.  | `sudo`, `rm -rf`, `git push --force`, `dd`     |

### Flag Behavior

- **No flags**: All tools prompt for confirmation.
- **`-y` / `--yes`**: Safe tools (read_file, search_files, list_directory, web_search, web_fetch) auto-approve. Unknown/dangerous tools still prompt.
- **`--dangerously-skip-permissions`**: Skips ALL prompts. Use only in trusted CI environments.

### Built-In Tools

| Tool             | Safety | Description                                         |
| ---------------- | ------ | --------------------------------------------------- |
| `read_file`      | Safe   | Read file contents (max 2000 lines)                 |
| `write_file`     | Write  | Create or overwrite a file                          |
| `edit_file`      | Write  | Apply targeted edits to a file                      |
| `run_command`    | Varies | Execute a shell command (classified by safety tier) |
| `search_files`   | Safe   | Search files with glob patterns                     |
| `list_directory` | Safe   | List directory contents                             |
| `web_search`     | Safe   | Search the web                                      |
| `web_fetch`      | Safe   | Fetch a URL                                         |

Plus team-mode tools: `send_message`, `check_messages`, `add_task`, `list_tasks`.

## Team Mode and Subagents

### Team Mode

Enable with `--team` flag or `AGI_TEAM=1` environment variable.

Team mode adds collaborative tools:

- **send_message**: Send messages to teammates
- **check_messages**: Read incoming messages
- **add_task**: Add items to a shared task list
- **list_tasks**: View all shared tasks

```bash
# Start in team mode
agiworkforce --team

# Or via environment
AGI_TEAM=1 agiworkforce
```

### Subagents

The CLI supports spawning subagents for parallel task execution. Subagents run independently with their own context and report back results. Subagent status can be Running, Completed, Failed, or Cancelled.

## Skills and MCP

### Skills

Skills are contextual prompt injections loaded from markdown files with YAML frontmatter:

- **Project skills**: `.agiworkforce/skills/*.md`
- **Global skills**: `~/.agiworkforce/skills/*.md`

Skills are automatically matched to queries by keyword overlap. Explicitly request a skill with `$skill-name` or `@skill-name` in your prompt.

View available skills in the REPL with `/skills`.

### MCP (Model Context Protocol)

The CLI supports MCP stdio-based tool servers. Configure servers in `~/.agiworkforce/config.toml` or `.mcp.json`.

MCP tools are namespaced as `mcp_{server}_{tool}` and appear alongside built-in tools.

## Session Storage

Sessions are persisted in SQLite at `~/.agiworkforce/sessions.db`. Each session stores:

- Message history (role, content, timestamps)
- Tool call records
- Token counts and cost tracking
- Session metadata (title, model, creation time)

## Memory System

Three-tier memory hierarchy:

| Tier    | Location               | Scope                |
| ------- | ---------------------- | -------------------- |
| Global  | `~/.agi/CLAUDE.md`     | All projects         |
| Project | `<git_root>/CLAUDE.md` | Current project      |
| Local   | In-session context     | Current conversation |

Memory files are automatically loaded into the system prompt.

## Comparison with Alternatives

| Feature             | AGI Workforce CLI               | Claude Code        | Codex CLI       |
| ------------------- | ------------------------------- | ------------------ | --------------- |
| Multi-model         | 7 providers                     | Anthropic only     | OpenAI only     |
| Local LLMs          | Ollama support                  | No                 | No              |
| Tool safety tiers   | 3-tier (safe/unknown/dangerous) | 2-tier             | Basic           |
| Session persistence | SQLite with search              | Markdown export    | None            |
| Team mode           | Built-in messaging + tasks      | No                 | No              |
| Subagents           | Parallel execution              | No                 | No              |
| Skills system       | YAML frontmatter markdown       | No                 | No              |
| MCP support         | stdio tool servers              | stdio + SSE        | No              |
| Context compaction  | Automatic at 90%                | Manual             | N/A             |
| Effort presets      | low/medium/high/max             | No                 | No              |
| Shell completions   | bash/zsh/fish                   | No                 | No              |
| BYOK                | All providers                   | Anthropic key only | OpenAI key only |
| Cost tracking       | Per-session + per-model         | Basic              | None            |
| Memory hierarchy    | Global + project + local        | Project only       | None            |
