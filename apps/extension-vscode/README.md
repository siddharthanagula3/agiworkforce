# AGI Workforce — VS Code

Multi-provider AI coding assistant. 10+ providers (Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, Ollama, LMStudio, plus any OpenAI-compatible BYO endpoint). Switch mid-conversation. BYOK or managed cloud — your choice.

## Features

- **`@agi` chat participant** with `/explain`, `/fix`, `/refactor`, `/tests`, `/docs`, `/model`.
- **Sidebar chat** with multi-conversation history, context-file pinning, and code-action suggestions.
- **Inline completions** (debounced, LRU-cached) — opt-in via `agiWorkforce.inlineCompletions.enabled`.
- **CodeLens** "Ask AI / Tests / Docs" actions on every function or class.
- **Agent mode** — multi-file edit with diff preview and one-click batch undo.
- **Desktop bridge** (port 8787) for round-trips with the AGI Workforce desktop app — token-authenticated, allowlisted message types only.
- **Multi-root workspace** support across git/test/patch operations.
- **Workspace Trust** integration — sensitive settings (`apiEndpoint`, `gatewayUrl`, `cliPath`, `systemPrompt`, `agentMode.autoApply`) are restricted in untrusted workspaces.

## Quick start

1. Install from the VS Code Marketplace (or sideload the `.vsix`).
2. Run **AGI Workforce: Set API Key** from the command palette (`cmd+shift+p`).
3. Or, if you have GitHub Copilot installed, leave `agiWorkforce.fallbackToVscodeLm` on (default true) and the `@agi` participant will use Copilot's model when no API key is set.

## Setup

1. Install the extension.
2. Open the AGI Workforce sidebar (Activity Bar icon).
3. Pick a provider:
   - **BYOK:** paste your provider API key in Settings → AGI Workforce → Models.
   - **Local:** install Ollama or LM Studio; the extension auto-detects them.
   - **Cloud:** sign in with your AGI Workforce account in the sidebar header.

## Configuration highlights

| Setting                                  | Default                               | What it does                                                     |
| ---------------------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `agiWorkforce.apiEndpoint`               | `https://agiworkforce.com/api/llm/v1` | LLM API endpoint. Restricted in untrusted workspaces.            |
| `agiWorkforce.model`                     | `auto-balanced`                       | Default model. Run **AGI Workforce: Select Model** to pick.      |
| `agiWorkforce.fallbackToVscodeLm`        | `true`                                | Use VS Code Language Model API when no AGI Workforce key is set. |
| `agiWorkforce.inlineCompletions.enabled` | `false`                               | Opt-in inline ghost-text completions.                            |
| `agiWorkforce.useProviderStream`         | `false`                               | Route chat through `/api/v1/providers/:id/stream` (Wave 3 path). |
| `agiWorkforce.telemetryEnabled`          | `false`                               | Anonymous usage telemetry.                                       |

## Keyboard shortcuts

- `Cmd/Ctrl+Shift+A` — open chat
- `Cmd/Ctrl+Shift+Alt+E` — explain selection
- `Cmd/Ctrl+Shift+Alt+G` — agent mode
- `Cmd/Ctrl+Shift+Alt+A` — ask about code
- `Cmd/Ctrl+Shift+Alt+X` — explain error
- `Cmd/Ctrl+Shift+Alt+T` — run terminal command
- `Cmd/Ctrl+Shift+Alt+N` — new conversation

See the `Keyboard Shortcuts` editor for the full list.

## Privacy

- No telemetry is sent unless both VS Code's global `telemetry.telemetryLevel` setting **and** the extension-level `agiWorkforce.telemetryEnabled` setting are on. Both default to off for this extension.
- Error messages and event properties are scrubbed for credentials (JWTs, Bearer tokens, OpenAI/Anthropic/Stripe/Slack/GitHub/Google/AWS keys) before any network call.
- Settings are read from the **global** scope only when in an untrusted workspace; workspace overrides for endpoint URLs and similar are ignored.

## Differentiators

Most VS Code AI extensions lock you into one vendor. AGI Workforce lets you:

- Switch providers mid-conversation (Claude → GPT → Llama in the same thread).
- Use Local LLMs (Ollama, LM Studio) with zero cloud dependency.
- Bring your own API keys — no subscription, no rate-limit ceiling beyond your own key's.

## License

Proprietary. © 2026 AGI Workforce. See `LICENSE`.

## Issues / feedback

- File issues at <https://github.com/agiworkforce/agiworkforce/issues>.
- Or use the in-extension **AGI Workforce: Send Feedback** command.
