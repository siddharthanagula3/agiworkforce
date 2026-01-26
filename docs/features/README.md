# Features Overview

AGI Workforce combines multiple AI capabilities into a unified chat-first interface.

## Core Features

### Chat Interface

Natural language interaction with multiple AI models.

- **Multi-provider support**: OpenAI, Anthropic, Google, DeepSeek, xAI, Ollama
- **Intelligent routing**: Auto-selects optimal model for each task
- **Streaming responses**: Real-time response generation
- **Conversation history**: Full context preservation

[Learn more →](chat.md)

### Agent Mode (AGI)

Autonomous task completion with full reversibility.

- **Goal-based execution**: Describe what you want, AI figures out how
- **Self-directed reasoning**: Plans, executes, reflects, iterates
- **Undo system**: Every action is reversible
- **Safety limits**: Timeouts and iteration caps

[Learn more →](agent-mode.md)

### Browser Automation

Web task automation through natural language.

- **Natural commands**: "Book a flight to NYC"
- **Visual context**: Screenshot-based navigation
- **Form filling**: Automated data entry
- **Multi-step workflows**: Complex task sequences

[Learn more →](browser-automation.md)

### Credit System

Usage-based billing with subscription tiers.

- **Subscription tiers**: Hobby, Pro, Max, Enterprise
- **Token tracking**: Usage tracked in cents
- **Managed billing**: We handle all LLM API costs
- **Credit alerts**: Notifications for usage limits

[Learn more →](credit-system.md)

### MCP Integration

Extensible tool ecosystem via Model Context Protocol.

- **Pre-configured servers**: Supabase, GitHub, Filesystem
- **Custom tools**: Add your own MCP servers
- **Hidden complexity**: Users never see "MCP"
- **Secure credentials**: OS keyring storage

[Learn more →](mcp.md)

## Quick Feature Matrix

| Feature         | Description                  | Status    |
| --------------- | ---------------------------- | --------- |
| Chat            | Multi-model AI conversations | ✅ Stable |
| Agent Mode      | Autonomous task completion   | ✅ Stable |
| Browser         | Web automation               | ✅ Stable |
| MCP             | Tool integration             | ✅ Stable |
| Credit System   | Usage-based billing          | ✅ Stable |
| Terminal        | Shell command execution      | ✅ Stable |
| Code Editor     | AI-assisted coding           | ✅ Stable |
| File Operations | Read, write, search files    | ✅ Stable |

## Feature Settings

Most features can be configured in Settings:

| Setting        | Location       | Default |
| -------------- | -------------- | ------- |
| Default Model  | Chat Settings  | Auto    |
| Agent Mode     | Chat Settings  | Off     |
| Max Iterations | Agent Settings | 1000    |
| Timeout        | Agent Settings | 300s    |

## Keyboard Shortcuts

| Action       | macOS         | Windows/Linux  |
| ------------ | ------------- | -------------- |
| New Chat     | `Cmd+N`       | `Ctrl+N`       |
| Toggle Agent | `Cmd+Shift+A` | `Ctrl+Shift+A` |
| Send Message | `Enter`       | `Enter`        |
| New Line     | `Shift+Enter` | `Shift+Enter`  |
| Undo         | `Cmd+Z`       | `Ctrl+Z`       |

## Related Documentation

- [Architecture Overview](../architecture/overview.md)
- [API Reference](../api/README.md)
- [Configuration Guide](../getting-started/configuration.md)
