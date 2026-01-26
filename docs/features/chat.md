# Chat Interface

The chat interface is the primary way users interact with AGI Workforce.

## Overview

Chat provides natural language interaction with multiple AI models through a unified interface.

## Supported Providers

| Provider  | Models                                               |
| --------- | ---------------------------------------------------- |
| OpenAI    | GPT-4o, GPT-4o-mini, GPT-4-turbo, o1, o1-mini        |
| Anthropic | Claude 4 Opus, Claude 4/3.5 Sonnet, Claude 3.5 Haiku |
| Google    | Gemini 2.5 Pro, Gemini 2.5 Flash                     |
| DeepSeek  | DeepSeek V3, DeepSeek Chat                           |
| xAI       | Grok 4, Grok 4 Fast                                  |
| Ollama    | Llama 3.3, Mistral, CodeLlama, Phi-3, Qwen 2.5       |

## Model Selection

### Auto Mode (Recommended)

Auto mode intelligently routes messages to the optimal model:

- **Auto Economy**: Cost-optimized selection
- **Auto Balanced**: Balance of cost and capability
- **Auto Premium**: Best model for each task type

### Manual Selection

Override auto mode by selecting a specific model from the dropdown.

## Task Classification

The router classifies messages into task types:

| Task Type  | Example                   | Optimized For       |
| ---------- | ------------------------- | ------------------- |
| Coding     | "Write a function to..."  | SWE-bench scores    |
| Reasoning  | "Analyze this problem..." | GPQA scores         |
| General    | "Explain what..."         | MMLU scores         |
| Agentic    | "Browse to..."            | Tool use capability |
| Multimodal | Image analysis            | Vision capability   |

## Features

### Streaming Responses

Responses stream in real-time for better UX:

```typescript
// Enabled by default
const settings = {
  streamResponses: true,
};
```

### Conversation History

Full conversation context is maintained:

```typescript
// Access conversation history
const messages = useChatStore((state) => state.messages);
```

### Token Counting

Real-time token usage display:

```typescript
// In settings
showTokenCount: true;
```

## Settings

| Setting          | Default     | Description               |
| ---------------- | ----------- | ------------------------- |
| Default Model    | Auto-select | Model for new chats       |
| Temperature      | 0.7         | Response creativity (0-1) |
| Max Tokens       | 4096        | Maximum response length   |
| Stream Responses | true        | Enable streaming          |

## Keyboard Shortcuts

| Action       | macOS         | Windows       |
| ------------ | ------------- | ------------- |
| Send Message | `Enter`       | `Enter`       |
| New Line     | `Shift+Enter` | `Shift+Enter` |
| New Chat     | `Cmd+N`       | `Ctrl+N`      |

## API Integration

### Send Message

```typescript
import { invoke } from '@tauri-apps/api/core';

const response = await invoke('send_chat_message', {
  conversationId: 'conv-123',
  content: 'Hello, how are you?',
  model: 'auto-balanced',
});
```

### Get Conversations

```typescript
const conversations = await invoke('get_conversations');
```

## Related Documentation

- [Agent Mode](agent-mode.md) - Autonomous task completion
- [Configuration](../getting-started/configuration.md) - API key setup
