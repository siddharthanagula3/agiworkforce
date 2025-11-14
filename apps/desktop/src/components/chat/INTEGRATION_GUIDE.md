# EnhancedChatInterface Integration Guide

This guide walks you through integrating the EnhancedChatInterface into your AGI Workforce desktop application.

## Quick Start (5 minutes)

### Step 1: Import the Component

In your route or page component, import the EnhancedChatInterface:

```typescript
// src/pages/ChatPage.tsx or wherever you want to use it
import { EnhancedChatInterface } from '@/components/chat/EnhancedChatInterface';
import { TooltipProvider } from '@/components/ui/Tooltip';

export function ChatPage() {
  return (
    <TooltipProvider>
      <div className="h-screen w-full">
        <EnhancedChatInterface />
      </div>
    </TooltipProvider>
  );
}
```

### Step 2: Ensure Required Dependencies

The component uses these packages (already installed in your project):

- ✅ `framer-motion` - Animations
- ✅ `react-markdown` - Markdown rendering
- ✅ `react-syntax-highlighter` - Code highlighting
- ✅ `lucide-react` - Icons
- ✅ `@radix-ui/*` - UI primitives
- ✅ `zustand` - State management

### Step 3: Test It Out

Run your development server:

```bash
pnpm --filter @agiworkforce/desktop dev
```

Navigate to the chat page and start typing! The interface is fully functional out of the box.

## Full Integration (Production Ready)

### 1. Replace Existing ChatInterface

If you're already using the older `ChatInterface`:

```typescript
// Before
import { ChatInterface } from '@/components/Chat/ChatInterface';

function App() {
  return <ChatInterface />;
}

// After
import { EnhancedChatInterface } from '@/components/chat/EnhancedChatInterface';
import { TooltipProvider } from '@/components/ui/Tooltip';

function App() {
  return (
    <TooltipProvider>
      <EnhancedChatInterface />
    </TooltipProvider>
  );
}
```

### 2. Connect Real-Time Processing Events

To show real processing steps, connect to backend events:

```typescript
// src/hooks/useEnhancedChat.ts
import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { ProcessingStepPayload, ToolExecutionStartPayload } from '@/types/chatEvents';

export function useEnhancedChat(messageId: number) {
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([]);

  useEffect(() => {
    const unlistenProcessing = listen<ProcessingStepPayload>('chat:processing-step', (event) => {
      if (event.payload.messageId === messageId) {
        setProcessingSteps((prev) => [...prev, event.payload.step]);
      }
    });

    const unlistenTools = listen<ToolExecutionStartPayload>(
      'chat:tool-execution-start',
      (event) => {
        if (event.payload.messageId === messageId) {
          setToolExecutions((prev) => [...prev, event.payload.execution]);
        }
      },
    );

    return () => {
      unlistenProcessing.then((fn) => fn());
      unlistenTools.then((fn) => fn());
    };
  }, [messageId]);

  return { processingSteps, toolExecutions };
}
```

Then update the EnhancedChatInterface to use this hook (see advanced customization below).

### 3. Add Backend Event Emission

In your Rust backend, emit events during processing:

```rust
// apps/desktop/src-tauri/src/router/mod.rs

use serde::Serialize;
use tauri::Manager;

#[derive(Serialize)]
struct ProcessingStep {
    id: String,
    #[serde(rename = "type")]
    step_type: String,
    status: String,
    title: String,
    description: Option<String>,
    progress: Option<u8>,
    metadata: Option<serde_json::Value>,
    #[serde(rename = "startTime")]
    start_time: Option<i64>,
    #[serde(rename = "endTime")]
    end_time: Option<i64>,
}

#[derive(Serialize)]
struct ProcessingStepPayload {
    #[serde(rename = "conversationId")]
    conversation_id: i64,
    #[serde(rename = "messageId")]
    message_id: i64,
    step: ProcessingStep,
}

// In your LLM routing logic
pub async fn send_message_with_events(
    app: &tauri::AppHandle,
    conversation_id: i64,
    message_id: i64,
    content: &str,
) -> Result<String> {
    // 1. Emit prompt enhancement event
    app.emit_all("chat:processing-step", ProcessingStepPayload {
        conversation_id,
        message_id,
        step: ProcessingStep {
            id: uuid::Uuid::new_v4().to_string(),
            step_type: "prompt_enhancement".to_string(),
            status: "in_progress".to_string(),
            title: "Enhancing prompt".to_string(),
            description: Some("Analyzing user intent and context".to_string()),
            progress: Some(0),
            metadata: None,
            start_time: Some(chrono::Utc::now().timestamp_millis()),
            end_time: None,
        }
    })?;

    // Perform prompt enhancement
    let enhanced_prompt = enhance_prompt(content).await?;

    // Emit completion
    app.emit_all("chat:processing-step", ProcessingStepPayload {
        conversation_id,
        message_id,
        step: ProcessingStep {
            id: uuid::Uuid::new_v4().to_string(),
            step_type: "prompt_enhancement".to_string(),
            status: "completed".to_string(),
            title: "Prompt enhanced".to_string(),
            description: Some(format!("Added {} tokens of context", 150)),
            progress: Some(100),
            metadata: Some(serde_json::json!({
                "tokensAdded": 150,
                "enhancements": ["clarity", "context"]
            })),
            start_time: Some(chrono::Utc::now().timestamp_millis() - 500),
            end_time: Some(chrono::Utc::now().timestamp_millis()),
        }
    })?;

    // 2. Emit routing event
    app.emit_all("chat:processing-step", ProcessingStepPayload {
        conversation_id,
        message_id,
        step: ProcessingStep {
            id: uuid::Uuid::new_v4().to_string(),
            step_type: "routing".to_string(),
            status: "in_progress".to_string(),
            title: "Selecting optimal model".to_string(),
            description: Some("Evaluating available providers".to_string()),
            progress: Some(0),
            metadata: None,
            start_time: Some(chrono::Utc::now().timestamp_millis()),
            end_time: None,
        }
    })?;

    // Perform routing
    let (provider, model) = select_provider_and_model(&enhanced_prompt).await?;

    // Emit routing completion
    app.emit_all("chat:processing-step", ProcessingStepPayload {
        conversation_id,
        message_id,
        step: ProcessingStep {
            id: uuid::Uuid::new_v4().to_string(),
            step_type: "routing".to_string(),
            status: "completed".to_string(),
            title: "Model selected".to_string(),
            description: Some(format!("Using {} - {}", provider, model)),
            progress: Some(100),
            metadata: Some(serde_json::json!({
                "provider": provider,
                "model": model,
                "estimatedCost": 0.002
            })),
            start_time: Some(chrono::Utc::now().timestamp_millis() - 200),
            end_time: Some(chrono::Utc::now().timestamp_millis()),
        }
    })?;

    // 3. Emit generation event
    app.emit_all("chat:processing-step", ProcessingStepPayload {
        conversation_id,
        message_id,
        step: ProcessingStep {
            id: uuid::Uuid::new_v4().to_string(),
            step_type: "generation".to_string(),
            status: "in_progress".to_string(),
            title: "Generating response".to_string(),
            description: Some("Streaming from model".to_string()),
            progress: Some(0),
            metadata: Some(serde_json::json!({
                "provider": provider,
                "model": model
            })),
            start_time: Some(chrono::Utc::now().timestamp_millis()),
            end_time: None,
        }
    })?;

    // Generate response (with streaming)
    let response = generate_response(&provider, &model, &enhanced_prompt).await?;

    // Emit generation completion
    app.emit_all("chat:processing-step", ProcessingStepPayload {
        conversation_id,
        message_id,
        step: ProcessingStep {
            id: uuid::Uuid::new_v4().to_string(),
            step_type: "generation".to_string(),
            status: "completed".to_string(),
            title: "Response generated".to_string(),
            description: Some(format!("Completed in {}ms", 1500)),
            progress: Some(100),
            metadata: Some(serde_json::json!({
                "tokens": 450,
                "duration": 1500
            })),
            start_time: Some(chrono::Utc::now().timestamp_millis() - 1500),
            end_time: Some(chrono::Utc::now().timestamp_millis()),
        }
    })?;

    Ok(response)
}
```

### 4. Tool Execution Events

When executing tools, emit tool execution events:

```rust
// In your tool execution logic
#[derive(Serialize)]
struct ToolExecution {
    id: String,
    name: String,
    status: String,
    input: Option<serde_json::Value>,
    output: Option<String>,
    error: Option<String>,
    duration: Option<i64>,
}

#[derive(Serialize)]
struct ToolExecutionPayload {
    #[serde(rename = "conversationId")]
    conversation_id: i64,
    #[serde(rename = "messageId")]
    message_id: i64,
    execution: ToolExecution,
}

// Start tool execution
app.emit_all("chat:tool-execution-start", ToolExecutionPayload {
    conversation_id,
    message_id,
    execution: ToolExecution {
        id: uuid::Uuid::new_v4().to_string(),
        name: "file_read".to_string(),
        status: "running".to_string(),
        input: Some(serde_json::json!({ "path": "/file.txt" })),
        output: None,
        error: None,
        duration: None,
    }
})?;

// Execute tool
let start = std::time::Instant::now();
let result = execute_tool("file_read", params).await;
let duration = start.elapsed().as_millis() as i64;

// Emit completion
app.emit_all("chat:tool-execution-end", ToolExecutionPayload {
    conversation_id,
    message_id,
    execution: ToolExecution {
        id: tool_id.clone(),
        name: "file_read".to_string(),
        status: if result.is_ok() { "completed" } else { "error" }.to_string(),
        input: Some(serde_json::json!({ "path": "/file.txt" })),
        output: result.ok(),
        error: result.err().map(|e| e.to_string()),
        duration: Some(duration),
    }
})?;
```

## Advanced Customization

### Custom Processing Steps

Create your own processing step types:

```typescript
// Extend the ProcessingStepType
type CustomStepType = ProcessingStepType | 'code_analysis' | 'data_validation';

// Add custom steps
const customStep: ProcessingStep = {
  id: uuid(),
  type: 'code_analysis',
  status: 'in_progress',
  title: 'Analyzing code quality',
  description: 'Running ESLint and TypeScript checks',
  progress: 45,
  metadata: {
    lintErrors: 3,
    typeErrors: 0,
    warnings: 12,
  },
};
```

### Custom Message Rendering

Extend the MessageBubble component:

```typescript
// Create a custom renderer for specific message types
function CustomMessageBubble({ message, ...props }: MessageBubbleProps) {
  if (message.metadata?.type === 'code_review') {
    return <CodeReviewMessage message={message} {...props} />;
  }

  if (message.metadata?.type === 'image_generation') {
    return <ImageGenerationMessage message={message} {...props} />;
  }

  return <MessageBubble message={message} {...props} />;
}
```

### Theme Customization

Customize the color scheme:

```css
/* src/index.css */
:root {
  /* Primary gradient for user messages */
  --chat-user-from: 220 90% 56%;
  --chat-user-to: 220 90% 46%;

  /* Secondary gradient for AI messages */
  --chat-ai-from: 240 5% 26%;
  --chat-ai-to: 240 5% 20%;

  /* Processing visualization */
  --chat-processing-bg: var(--primary) / 0.05;
  --chat-processing-border: var(--primary) / 0.2;
}

.dark {
  --chat-user-from: 220 90% 60%;
  --chat-user-to: 220 90% 50%;

  --chat-ai-from: 240 5% 30%;
  --chat-ai-to: 240 5% 24%;
}
```

## Testing

### Unit Tests

```typescript
// src/components/chat/__tests__/EnhancedChatInterface.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EnhancedChatInterface } from '../EnhancedChatInterface';
import { TooltipProvider } from '@/components/ui/Tooltip';

describe('EnhancedChatInterface', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <TooltipProvider>{children}</TooltipProvider>
  );

  it('renders empty state correctly', () => {
    render(<EnhancedChatInterface />, { wrapper });
    expect(screen.getByText('Start a Conversation')).toBeInTheDocument();
  });

  it('sends message on button click', async () => {
    render(<EnhancedChatInterface />, { wrapper });

    const input = screen.getByPlaceholderText(/Type your message/);
    const sendButton = screen.getByLabelText(/Send message/);

    fireEvent.change(input, { target: { value: 'Hello AI' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('Hello AI')).toBeInTheDocument();
    });
  });

  it('handles file attachments', () => {
    render(<EnhancedChatInterface />, { wrapper });

    const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
    const input = screen.getByLabelText(/Attach files/);

    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('test.txt')).toBeInTheDocument();
  });
});
```

### E2E Tests

```typescript
// e2e/chat.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Enhanced Chat Interface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
  });

  test('complete chat workflow', async ({ page }) => {
    // Type message
    const input = page.locator('textarea');
    await input.fill('Write a hello world in Python');
    await input.press('Enter');

    // Wait for AI response
    await expect(page.locator('[data-role="assistant"]')).toBeVisible();

    // Verify code block appears
    await expect(page.locator('code')).toContainText('print');
  });

  test('file attachment workflow', async ({ page }) => {
    // Click attach button
    await page.click('[aria-label="Attach files"]');

    // Upload file
    await page.setInputFiles('input[type="file"]', 'test-file.txt');

    // Verify preview
    await expect(page.locator('text=test-file.txt')).toBeVisible();
  });
});
```

## Performance Optimization

### Lazy Loading

For large conversations, implement virtual scrolling:

```typescript
import { FixedSizeList } from 'react-window';

function VirtualizedMessageList({ messages }: { messages: EnhancedMessage[] }) {
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style}>
      <MessageBubble message={messages[index]} />
    </div>
  );

  return (
    <FixedSizeList
      height={600}
      itemCount={messages.length}
      itemSize={150}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```

### Memoization

Memoize expensive computations:

```typescript
const processedMessages = useMemo(() => {
  return messages.map((msg) => ({
    ...msg,
    // Expensive processing
    formattedContent: formatMarkdown(msg.content),
    tokenCount: calculateTokens(msg.content),
  }));
}, [messages]);
```

## Troubleshooting

### Issue: Messages not appearing

**Solution**: Ensure TooltipProvider wraps the component:

```typescript
import { TooltipProvider } from '@/components/ui/Tooltip';

<TooltipProvider>
  <EnhancedChatInterface />
</TooltipProvider>
```

### Issue: Styles not applying

**Solution**: Verify Tailwind CSS configuration includes the component path:

```javascript
// tailwind.config.js
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  // ...
};
```

### Issue: Animations not working

**Solution**: Install and configure Framer Motion:

```bash
pnpm add framer-motion
```

### Issue: Code blocks not highlighting

**Solution**: Ensure syntax highlighter is installed:

```bash
pnpm add react-syntax-highlighter
pnpm add -D @types/react-syntax-highlighter
```

## Migration Checklist

- [ ] Import EnhancedChatInterface in your route
- [ ] Wrap with TooltipProvider
- [ ] Test basic send/receive functionality
- [ ] Implement backend event emission (optional)
- [ ] Add custom processing steps (optional)
- [ ] Configure theme colors (optional)
- [ ] Add unit tests
- [ ] Add E2E tests
- [ ] Performance test with large conversations
- [ ] Document custom features for your team

## Support

For issues or questions:

1. Check the README.md for feature documentation
2. Review example files for usage patterns
3. Check type definitions in `chatEvents.ts`
4. Review Rust backend examples for event emission

## Next Steps

1. **Try it out**: Replace your current chat interface and test
2. **Add events**: Implement backend event emission for live updates
3. **Customize**: Adjust colors, add custom steps, extend functionality
4. **Test**: Write tests and ensure everything works smoothly
5. **Deploy**: Build and ship your enhanced chat experience!
