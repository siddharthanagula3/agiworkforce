# AGI Workforce

AGI Workforce is a multi-model AI agent platform with a desktop app, CLI, and web interface. It supports 24 LLM providers including Ollama, with desktop automation, 150+ AI skills, and BYOK (bring your own keys).

Open models can be used with AGI Workforce through Ollama, enabling you to use models such as `qwen3-coder`, `glm-4.7-flash`, `llama3.2`.

## Install

Install the [AGI Workforce CLI](https://agiworkforce.com):

**macOS / Linux:**

```bash
curl -fsSL https://agiworkforce.com/install.sh | bash
```

**npm:**

```bash
npm install -g @agiworkforce/cli
```

**Cargo (build from source):**

```bash
cargo install --git https://github.com/siddharthanagula3/agiworkforce-desktop-app agiworkforce-cli
```

## Usage with Ollama

### Quick setup

```bash
ollama launch agiworkforce
```

### Run directly with a model

```bash
ollama launch agiworkforce --model qwen3-coder
```

### Configure without launching

```bash
ollama launch agiworkforce --config
```

## Recommended Models

**Local models:**

| Model           | Best for                           | VRAM   |
| --------------- | ---------------------------------- | ------ |
| `qwen3-coder`   | Code generation and analysis       | ~16 GB |
| `glm-4.7-flash` | Fast reasoning and code generation | ~25 GB |
| `llama3.2`      | General purpose tasks              | ~4 GB  |
| `qwen3.5`       | Balanced performance               | ~16 GB |

**Cloud models** (available at [ollama.com/search?c=cloud](https://ollama.com/search?c=cloud)):

| Model                | Best for                      |
| -------------------- | ----------------------------- |
| `kimi-k2.5:cloud`    | Multimodal reasoning          |
| `glm-5:cloud`        | Reasoning and code generation |
| `minimax-m2.7:cloud` | Fast coding and productivity  |
| `qwen3.5:cloud`      | Balanced cloud performance    |

## Non-interactive (headless) mode

Run AGI Workforce without interaction for use in Docker, CI/CD, or scripts:

```bash
ollama launch agiworkforce --model qwen3-coder --yes -- exec "explain this codebase"
```

The `--yes` flag auto-pulls the model, skips selectors, and requires `--model` to be specified. Arguments after `--` are passed directly to AGI Workforce.

## Manual setup

AGI Workforce connects to Ollama natively — no special flags needed.

1. Run with Ollama as the provider:

```bash
agiworkforce --provider ollama --model qwen3-coder
```

2. Or configure in `~/.agiworkforce/config.toml`:

```toml
[default]
model = "qwen3-coder"
provider = "ollama"

[providers.ollama]
base_url = "http://localhost:11434"
```

3. For a custom Ollama host:

```bash
agiworkforce --provider ollama --ollama-host http://remote-server:11434 --model qwen3-coder
```

## Connecting to ollama.com

Create an [API key](https://ollama.com/settings/keys) from ollama.com and export it as `OLLAMA_API_KEY`.

Edit `~/.agiworkforce/config.toml`:

```toml
[default]
model = "kimi-k2.5:cloud"
provider = "ollama-cloud"

[providers.ollama-cloud]
base_url = "https://ollama.com/v1"
api_key_env = "OLLAMA_API_KEY"
```

Run `agiworkforce` in a new terminal to load the new settings.

## Desktop App

AGI Workforce also has a native desktop app (macOS, Windows, Linux) with a full GUI:

1. [Download](https://agiworkforce.com/download) the desktop app
2. Open **Settings** → **Models & Keys**
3. Find **Ollama** and configure the host (default: `http://localhost:11434`)
4. Select your model from the dropdown

The desktop app includes all CLI features plus desktop automation, browser control, and a visual chat interface.

## Web Search

AGI Workforce has built-in web search capabilities. When using Ollama models, web search is available through the `web` focus mode or via tool calls.

## Multi-Model Routing

AGI Workforce uniquely supports 24 LLM providers simultaneously. You can use Ollama for local models while having BYOK API keys for cloud providers (Anthropic, OpenAI, Google, etc.) as fallbacks:

```toml
[default]
model = "qwen3-coder"
provider = "ollama"
fallback_model = "claude-sonnet-4.6"
fallback_provider = "anthropic"
```

**Note:** AGI Workforce requires a large context window for agentic use. We recommend at least 64k tokens. See the [context length documentation](https://docs.ollama.com/context-length) for how to adjust context length in Ollama.
