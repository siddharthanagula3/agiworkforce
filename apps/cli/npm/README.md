# @agiworkforce/cli

> **Multi-provider AI agent for your terminal.** Switch between 10+ Providers (cloud + local) mid-conversation. BYOK. No vendor lock.

```bash
npm install -g @agiworkforce/cli
agiworkforce login
agiworkforce            # interactive TUI
agiworkforce exec "..."  # one-shot
```

## Why AGI Workforce CLI

| You want                                          | Claude Code  | OpenAI Codex CLI | Gemini CLI | AGI Workforce CLI          |
| ------------------------------------------------- | ------------ | ---------------- | ---------- | -------------------------- |
| One model family                                  | ✅ Anthropic | ✅ OpenAI        | ✅ Google  | ✅ Pick from 10+ Providers |
| Bring your own API key                            | ❌           | ❌               | ❌         | ✅                         |
| Run local LLMs (Ollama / LMStudio)                | ❌           | ❌               | ❌         | ✅                         |
| Switch model mid-conversation                     | ❌           | Limited          | ❌         | ✅ Across providers        |
| Subscription paths (Copilot / ChatGPT Plus)       | N/A          | ✅               | N/A        | ✅                         |
| MCP support                                       | ✅           | ✅               | ✅         | ✅                         |
| TUI (Ratatui)                                     | ✅           | ✅               | ✅         | ✅                         |
| Sandbox (Seatbelt / Bwrap / Landlock / Win Token) | ✅           | ✅               | ❌         | ✅                         |

The unique slice: **multi-provider + BYOK + local LLM**. No competitor offers all three in their CLI.

## Pricing

| Tier           | Price         | What                                                           |
| -------------- | ------------- | -------------------------------------------------------------- |
| **Local**      | Free forever  | Self-hosted, no cloud (Ollama / LMStudio)                      |
| **BYOK**       | Free forever  | Bring your own API keys                                        |
| **Hobby**      | Coming soon   | Managed cloud, limited credits ($5/mo target)                  |
| **Pro / Max**  | Waitlist      | Full models (post-security-audit)                              |
| **Enterprise** | Contact sales | SSO, SCIM, custom retention — https://agiworkforce.com/contact |

## Installation

### npm (recommended)

```bash
npm install -g @agiworkforce/cli
```

This installs a thin Node.js wrapper that resolves the right native Rust binary for your platform (darwin-arm64/x64, linux-arm64/x64, win32-arm64/x64) via npm `optionalDependencies`.

### Homebrew (macOS / Linux)

```bash
brew install agiworkforce/tap/agiworkforce
```

### Universal installer

```bash
curl -fsSL https://agiworkforce.com/install.sh | bash
```

### From source (Rust 1.94+)

```bash
cargo install --git https://github.com/siddharthanagula3/agiworkforce agiworkforce-cli
```

## Quick start

```bash
# 1. Authenticate (OAuth or paste API key)
agiworkforce login

# 2. Check what providers are available
agiworkforce auth-status
agiworkforce --list-models

# 3. One-shot prompt
agiworkforce exec "what files are in this directory?"

# 4. Interactive TUI
agiworkforce

# 5. Multi-provider with fallback chain
agiworkforce exec -m "claude-opus-4-6,gpt-5.4,llama3.1:8b" "explain this code"
```

## 22 subcommands

| Group           | Commands                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------- |
| Run             | `exec` (alias `e`), `review`, `apply` (alias `a`), `sandbox`                              |
| Servers         | `mcp-server`, `app-server`                                                                |
| Sessions        | `resume`, `fork`, `session`                                                               |
| Cloud / Plugins | `cloud`, `plugin`, `marketplace`                                                          |
| Inspection      | `features`, `execpolicy`, `ecosystem`, `history`, `--list-models`, `--dump-system-prompt` |
| Sync            | `sync`                                                                                    |
| Auth            | `login`, `logout`, `auth-status`                                                          |
| Setup           | `init`, `onboarding`                                                                      |

Run `agiworkforce <command> --help` for any.

## Local LLMs (Ollama)

```bash
# Install Ollama: https://ollama.com
ollama pull llama3.1:8b

# Use it via AGI Workforce
agiworkforce -m llama3.1:8b exec "hello"
agiworkforce -m "claude-sonnet-4-6,llama3.1:8b" exec "..."  # cloud first, fallback local
```

## MCP support

AGI Workforce CLI is both an MCP client (consumes external MCP servers) and an MCP server (`agiworkforce mcp-server`). Configure in `.mcp.json` (project) or `~/.agiworkforce/.mcp.json` (global).

## Documentation

- Project home: <https://agiworkforce.com>
- GitHub: <https://github.com/siddharthanagula3/agiworkforce>
- CLI architecture: <https://github.com/siddharthanagula3/agiworkforce/blob/main/apps/cli/ARCHITECTURE.md>
- Single source of truth: <https://github.com/siddharthanagula3/agiworkforce/blob/main/AGI_WORKFORCE.md>

## License

PROPRIETARY. See [LICENSE](https://github.com/siddharthanagula3/agiworkforce/blob/main/LICENSE).
