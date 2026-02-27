# AGI Workforce for VS Code

**Model-agnostic AI coding assistant -- use GPT, Claude, Gemini, and 15+ more LLMs directly in VS Code.**

AGI Workforce brings the power of every major LLM provider into your editor. Switch models mid-conversation, auto-route to the best model for the task, and keep your workflow in one place.

## Features

- **15+ LLM Models** -- GPT-4o, Claude 3.5 Sonnet, Gemini 2.0 Flash, DeepSeek R1, Perplexity Sonar, Grok, Mistral, and more
- **Smart Auto-Routing** -- Let AGI Workforce pick the best model: economy, balanced, or premium tier
- **Chat Participant** -- Type `@agi` in VS Code chat to invoke the assistant with full editor context
- **Sidebar Panel** -- Dedicated chat panel with AGI Workforce dark theme
- **Slash Commands** -- `/explain`, `/fix`, `/refactor`, `/tests`, `/docs`, `/model` for common tasks
- **SSE Streaming** -- Real-time token streaming with cancellation support
- **Secure Key Storage** -- API keys stored via VS Code SecretStorage (never in plaintext)
- **VS Code LM Fallback** -- Falls back to VS Code built-in language models when no API key is set
- **Status Bar Indicator** -- See the active model at a glance in your status bar

## Getting Started

1. **Install** the extension from the VS Code Marketplace
2. **Set your API key** -- Open the command palette (`Cmd+Shift+P`) and run `AGI Workforce: Set API Key`, then enter your OpenAI, Anthropic, or Google API key
3. **Start chatting** -- Type `@agi` in the VS Code chat panel, or open the AGI Workforce sidebar

## Slash Commands

| Command     | Description                                 |
| ----------- | ------------------------------------------- |
| `/explain`  | Explain the selected code in plain language |
| `/fix`      | Diagnose and fix bugs in the selected code  |
| `/refactor` | Suggest refactoring improvements            |
| `/tests`    | Generate unit tests for the selected code   |
| `/docs`     | Generate documentation or comments          |
| `/model`    | Switch the active LLM model                 |

## Keyboard Shortcuts

| Shortcut                                         | Action                  |
| ------------------------------------------------ | ----------------------- |
| `Cmd+Shift+A` (Mac) / `Ctrl+Shift+A` (Win/Linux) | Open AGI Workforce chat |
| `Cmd+Shift+E` (Mac) / `Ctrl+Shift+E` (Win/Linux) | Explain selected code   |

## Configuration

| Setting                         | Type    | Default                           | Description                               |
| ------------------------------- | ------- | --------------------------------- | ----------------------------------------- |
| `agiWorkforce.defaultModel`     | string  | `auto-balanced`                   | Default LLM model ID or auto-routing tier |
| `agiWorkforce.apiEndpoint`      | string  | `https://api.agiworkforce.com/v1` | API endpoint URL                          |
| `agiWorkforce.maxTokens`        | number  | `4096`                            | Maximum tokens per response               |
| `agiWorkforce.streamResponses`  | boolean | `true`                            | Enable SSE streaming for responses        |
| `agiWorkforce.telemetryEnabled` | boolean | `false`                           | Send anonymous usage telemetry            |
| `agiWorkforce.theme`            | string  | `dark`                            | Chat panel theme (`dark` or `light`)      |

## Requirements

- VS Code 1.96.0 or later
- An API key from any supported LLM provider (OpenAI, Anthropic, Google, etc.)
- Internet connection for LLM API calls

## Privacy

AGI Workforce does not collect, store, or transmit your code outside of the LLM API calls you explicitly initiate. API keys are stored securely using VS Code's built-in SecretStorage API and never leave your machine. Anonymous telemetry is opt-in and disabled by default.

## License

See [LICENSE](LICENSE) for details.
