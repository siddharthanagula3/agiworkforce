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

## Privacy

- No telemetry is sent unless both VS Code's global `telemetry.telemetryLevel` setting **and** the extension-level `agiWorkforce.telemetryEnabled` setting are on. Both default to off for this extension.
- Error messages and event properties are scrubbed for credentials (JWTs, Bearer tokens, OpenAI/Anthropic/Stripe/Slack/GitHub/Google/AWS keys) before any network call.
- Settings are read from the **global** scope only when in an untrusted workspace; workspace overrides for endpoint URLs and similar are ignored.

## Configuration highlights

| Setting                                  | Default                               | What it does                                                     |
| ---------------------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `agiWorkforce.apiEndpoint`               | `https://agiworkforce.com/api/llm/v1` | LLM API endpoint. Restricted in untrusted workspaces.            |
| `agiWorkforce.model`                     | `auto-balanced`                       | Default model. Run **AGI Workforce: Select Model** to pick.      |
| `agiWorkforce.fallbackToVscodeLm`        | `true`                                | Use VS Code Language Model API when no AGI Workforce key is set. |
| `agiWorkforce.inlineCompletions.enabled` | `false`                               | Opt-in inline ghost-text completions.                            |
| `agiWorkforce.useProviderStream`         | `false`                               | Route chat through `/api/v1/providers/:id/stream` (Wave 3 path). |
| `agiWorkforce.telemetryEnabled`          | `false`                               | Anonymous usage telemetry.                                       |

## License

Proprietary. © 2026 AGI Workforce. See `LICENSE`.

## Issues / feedback

- File issues at <https://github.com/agiworkforce/agiworkforce/issues>.
- Or use the in-extension **AGI Workforce: Send Feedback** command.
