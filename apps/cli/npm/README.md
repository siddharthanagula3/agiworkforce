# @agiworkforce/cli

> **Multi-provider AI agent for your terminal.** Switch between 10+ Providers (cloud + local) mid-conversation. BYOK. No vendor lock.

The npm wrapper is release-gated until `@agiworkforce/cli` and its platform
binary packages are published. Until then, use the universal installer or build
from source.

`agi` is the primary command. `agiworkforce` remains available as a backward-compatible alias.

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

## Managed Cloud plans

Managed Cloud is available to signed-in users and remains a separate trust
boundary from Local and BYOK. CLI access is a managed developer-surface
benefit on Pro, Max 5x, Max 15x, Team, and Enterprise. Free and Basic accounts
can keep using Local/BYOK, but the CLI does not present managed models as
unlocked.

| Plan           | Public price           | CLI Managed Cloud |
| -------------- | ---------------------- | ----------------- |
| **Free**       | Free                   | No                |
| **Basic**      | $7/month               | No                |
| **Pro**        | $20/month or $200/year | Yes               |
| **Max 5x**     | $100/month             | Yes               |
| **Max 15x**    | $200/month             | Yes               |
| **Team**       | Contact sales          | Yes               |
| **Enterprise** | Contract               | Contract          |

Account, billing, Team administration, connector setup, and Enterprise sales
remain in the Web control plane at
[agiworkforce.com](https://agiworkforce.com). The CLI inherits the same
server-enforced identity, subscription status, model roster, and usage limits.
Do not infer SSO or SCIM availability from the Enterprise label; those
integrations are not shipped.

## Installation

### Universal installer

```bash
curl -fsSL https://agiworkforce.com/install.sh | bash
```

### Homebrew (macOS / Linux)

```bash
brew install agiworkforce/tap/agiworkforce
```

### npm

```bash
npm install -g @agiworkforce/cli
```

This command is valid only after the public npm release publishes the wrapper
and all platform packages (`@agiworkforce/cli-darwin-arm64`, etc.). The wrapper
does not fall back to a random `agi` on `PATH`; it runs only the matching
platform package, bundled `vendor/` binary, or `AGI_CLI_BINARY_PATH`.

### From source (Rust 1.94+)

```bash
cargo install --git https://github.com/siddharthanagula3/agiworkforce agiworkforce-cli --bin agi
```

## Quick start

```bash
# 1. Authenticate (OAuth or paste API key)
agi login

# 2. Check what providers are available
agi auth-status
agi --list-models

# 3. One-shot prompt
agi exec "what files are in this directory?"

# 4. Interactive TUI
agi

# 5. Multi-provider with fallback chain
agi exec -m "claude-opus-5,gpt-5.6-terra,llama3.1:8b" "explain this code"
```

## 26 subcommands

| Group            | Commands                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Run              | `exec` (alias `e`), `review`, `apply` (alias `a`), `sandbox`                              |
| Servers          | `mcp-server`, `app-server`                                                                |
| Sessions         | `resume`, `fork`, `session`                                                               |
| Models / Plugins | `models`, `plugin`, `marketplace`                                                         |
| Completions      | `completion` (alias `completions`)                                                        |
| Inspection       | `features`, `execpolicy`, `ecosystem`, `history`, `--list-models`, `--dump-system-prompt` |
| Policy           | `approvals`                                                                               |
| Sync             | `sync`                                                                                    |
| Auth             | `login`, `logout`, `auth-status`                                                          |
| Setup            | `init`, `onboarding`, `migrate`                                                           |

Run `agi <command> --help` for any.

## Local LLMs (Ollama)

```bash
# Install Ollama: https://ollama.com
ollama pull llama3.1:8b

# Use it via AGI Workforce
agi -m llama3.1:8b exec "hello"
agi -m "claude-sonnet-5,llama3.1:8b" exec "..."  # cloud first, fallback local
```

## MCP support

AGI Workforce CLI is both an MCP client (consumes external MCP servers) and an MCP server (`agi mcp-server`). Configure in `.mcp.json` (project) or `~/.agiworkforce/.mcp.json` (global).

## Documentation

- Project home: <https://agiworkforce.com>
- GitHub: <https://github.com/siddharthanagula3/agiworkforce>
- CLI architecture: <https://github.com/siddharthanagula3/agiworkforce/blob/main/apps/cli/ARCHITECTURE.md>
- Single source of truth: <https://github.com/siddharthanagula3/agiworkforce/blob/main/AGI_WORKFORCE.md>

## License

PROPRIETARY. See [LICENSE](https://github.com/siddharthanagula3/agiworkforce/blob/main/LICENSE).
