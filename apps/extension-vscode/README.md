# AGI Workforce for VS Code

**Model-agnostic AI coding assistant — use GPT, Claude, Gemini, and 15+ more LLMs directly in VS Code.**

AGI Workforce brings the power of every major LLM provider into your editor. Switch models mid-conversation, auto-route to the best model for the task, and keep your workflow in one place.

## Features

- **15+ LLM Models** — Claude Opus/Sonnet/Haiku, GPT-5.4/4o, Gemini 3 Pro/Flash, DeepSeek R1, Perplexity Sonar, Grok 4, and more
- **Smart Auto-Routing** — Let AGI Workforce pick the best model: economy, balanced, or premium tier
- **Chat Participant** — Type `@agi` in VS Code Chat to invoke the assistant with full editor context
- **Sidebar Panel** — Dedicated chat panel with workspace-aware context (diagnostics, git status, open files)
- **@File References** — Type `@filename` in the sidebar to inject file content into your prompt
- **Agent Mode** — Multi-file editing with diff preview, per-file accept/reject, and batch undo
- **Inline Completions** — Ghost-text completions as you type (opt-in)
- **CodeLens** — "Ask AI", "Tests", "Docs" actions above functions and classes
- **Code Review** — AI-powered code review that populates the Problems panel
- **Terminal Integration** — Run, explain, and get suggested terminal commands
- **Error Explainer** — One-click explanations for diagnostics and errors
- **Model Dashboard** — Track per-model request count, latency, tokens, and estimated cost
- **Desktop Bridge** — Connect to the AGI Workforce desktop app for extended agent capabilities
- **Slash Commands** — `/explain`, `/fix`, `/refactor`, `/tests`, `/docs`, `/model` for common tasks
- **SSE Streaming** — Real-time token streaming with cancellation support
- **Secure Key Storage** — API keys stored via VS Code SecretStorage (never in plaintext)
- **VS Code LM Fallback** — Falls back to VS Code built-in language models when no API key is set

## Screenshots

<!-- TODO: add screenshots before Marketplace publish -->

## Getting Started

1. **Install** the extension from the VS Code Marketplace
2. **Set your API key** — Open the command palette (`Cmd+Shift+P`) and run `AGI Workforce: Set API Key`
3. **Start chatting** — Type `@agi` in the VS Code Chat panel, or open the AGI Workforce sidebar

## Commands

| Command                               | Description                      |
| ------------------------------------- | -------------------------------- |
| `AGI Workforce: Open Chat`            | Open the chat panel              |
| `AGI Workforce: Agent Mode`           | Open multi-file agent mode       |
| `AGI Workforce: New Conversation`     | Start a fresh conversation       |
| `AGI Workforce: Explain Selection`    | Explain the selected code        |
| `AGI Workforce: Fix Issue`            | Find and fix bugs                |
| `AGI Workforce: Refactor Code`        | Suggest refactoring improvements |
| `AGI Workforce: Generate Tests`       | Generate unit tests              |
| `AGI Workforce: Generate Docs`        | Generate documentation           |
| `AGI Workforce: Code Review`          | AI-powered code review           |
| `AGI Workforce: Select Model`         | Switch the active LLM model      |
| `AGI Workforce: Model Dashboard`      | View model performance metrics   |
| `AGI Workforce: Set API Key`          | Configure your API key           |
| `AGI Workforce: Explain Error`        | Explain an error or diagnostic   |
| `AGI Workforce: Run Terminal Command` | Execute a terminal command       |

## Keyboard Shortcuts

| Shortcut                               | Action                  |
| -------------------------------------- | ----------------------- |
| `Cmd+Shift+A` / `Ctrl+Shift+A`         | Open AGI Workforce chat |
| `Cmd+Shift+Alt+E` / `Ctrl+Shift+Alt+E` | Explain selected code   |
| `Cmd+Shift+Alt+G` / `Ctrl+Shift+Alt+G` | Open Agent Mode         |
| `Cmd+Shift+Alt+N` / `Ctrl+Shift+Alt+N` | New Conversation        |
| `Cmd+Shift+Alt+A` / `Ctrl+Shift+Alt+A` | Ask about code          |
| `Cmd+Shift+Alt+X` / `Ctrl+Shift+Alt+X` | Explain error           |
| `Cmd+Shift+Alt+T` / `Ctrl+Shift+Alt+T` | Run terminal command    |

## Configuration

| Setting                                  | Type    | Default                               | Description                            |
| ---------------------------------------- | ------- | ------------------------------------- | -------------------------------------- |
| `agiWorkforce.model`                     | string  | `auto-balanced`                       | Default LLM model or auto-routing tier |
| `agiWorkforce.apiEndpoint`               | string  | `https://agiworkforce.com/api/llm/v1` | API endpoint URL                       |
| `agiWorkforce.streamingEnabled`          | boolean | `true`                                | Enable SSE streaming responses         |
| `agiWorkforce.contextLines`              | number  | `50`                                  | Surrounding lines included as context  |
| `agiWorkforce.fallbackToVscodeLm`        | boolean | `true`                                | Fall back to VS Code built-in LM       |
| `agiWorkforce.codeLensEnabled`           | boolean | `true`                                | Show CodeLens above functions          |
| `agiWorkforce.inlineCompletions.enabled` | boolean | `false`                               | Enable ghost-text completions          |
| `agiWorkforce.agent.planMode`            | boolean | `false`                               | Show plan before agent edits           |
| `agiWorkforce.telemetryEnabled`          | boolean | `false`                               | Send anonymous usage telemetry         |
| `agiWorkforce.desktopBridge.enabled`     | boolean | `true`                                | Connect to desktop app                 |

## Requirements

- VS Code 1.95.0 or later
- An API key from any supported LLM provider (OpenAI, Anthropic, Google, etc.)
- Internet connection for LLM API calls

## Privacy

AGI Workforce does not collect, store, or transmit your code outside of the LLM API calls you explicitly initiate. API keys are stored securely using VS Code's built-in SecretStorage API and never leave your machine. Anonymous telemetry is opt-in and disabled by default.

## License

Proprietary. See [LICENSE](LICENSE) for details.
