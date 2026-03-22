# AGI Workforce CLI

The multi-model AI agent for your terminal. Connect any LLM provider, automate your desktop, and run 150+ AI skills — all from the command line.

**[Documentation](https://agiworkforce.com/docs/cli)** | **[Desktop App](https://agiworkforce.com/download)** | **[Discord](https://discord.gg/agiworkforce)**

## Install

**macOS / Linux:**

```bash
curl -fsSL https://agiworkforce.com/install.sh | bash
```

**Homebrew:**

```bash
brew install siddharthanagula3/tap/agiworkforce
```

**npm:**

```bash
npm install -g @agiworkforce/cli
```

**bun:**

```bash
bun install -g @agiworkforce/cli
```

**Cargo (build from source):**

```bash
cargo install --git https://github.com/siddharthanagula3/agiworkforce-desktop-app agiworkforce-cli
```

## Quick Start

```bash
# Interactive mode
agiworkforce

# One-shot execution
agiworkforce exec "explain this codebase"

# Code review
agiworkforce review --base main

# With a specific model
agiworkforce -m claude-opus-4-6 "refactor this function"

# Full auto-approve (safe commands only)
agiworkforce --yes "add error handling to all API routes"
```

## Features

- **24 LLM providers** — Anthropic, OpenAI, Google, Ollama, Mistral, xAI, DeepSeek, Groq, Together, Fireworks, and 14 more
- **BYOK** — Bring your own API keys, encrypted with Argon2id + AES-256-GCM
- **12 built-in tools** — read/write files, run commands, web search, grep, and more
- **Voice mode** — Whisper STT with push-to-talk (`/voice` or `--voice-lang`)
- **Session persistence** — Resume, fork, and search conversations
- **OS sandboxing** — macOS Seatbelt, Linux Bubblewrap/Landlock
- **MCP support** — Unlimited Model Context Protocol tools
- **Agent teams** — Delegate tasks to subagents via A2A protocol
- **Daemon mode** — Cron, webhooks, and file watcher triggers

## Configuration

```bash
# Set up your API key
export ANTHROPIC_API_KEY="sk-ant-..."

# Or configure in ~/.agiworkforce/config.toml
agiworkforce --init
```

## Reporting Issues

File issues at [GitHub](https://github.com/siddharthanagula3/agiworkforce-desktop-app/issues).
