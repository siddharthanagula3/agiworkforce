# EnhancedChatInterface Component

A modern, beautiful chat interface for the AGI Workforce desktop application with real-time AI processing visualization, streaming responses, tool execution tracking, and enhanced user experience.

## Features

### 1. Real-Time AI Processing Visualization

The component displays detailed processing steps while the AI is working:

- **Prompt Enhancement**: Shows when and how the user's prompt is being enhanced
- **API Routing**: Displays which LLM provider and model is selected
- **Tool Execution**: Real-time tracking of tool calls with input/output
- **Reasoning**: Collapsible section showing the AI's reasoning process
- **Generation**: Progress indicator for response generation

Each step includes:

- Status indicator (pending, in_progress, completed, error)
- Duration tracking
- Progress bars for long operations
- Metadata display (provider, model, etc.)

### 2. Streaming Response Animation

Beautiful typing animation while responses stream:

- Character-by-character reveal
- Smooth animations
- Real-time token counting
- Visual streaming indicator

### 3. Modern Message Bubbles

Beautifully designed message bubbles with:

- **Gradient avatars** with smooth scale animations
- **Syntax highlighting** for code blocks with copy button
- **Markdown support** including math equations (KaTeX)
- **Action menu** with copy, edit, delete, regenerate
- **Metadata display**: tokens, cost, provider/model
- **Hover effects** and smooth transitions

### 4. Enhanced Input Area

Production-ready input with modern features:

- **Auto-resizing textarea** (up to 10 lines)
- **File attachments** via button or drag & drop
- **Image previews** for attached files
- **Voice input button** (UI ready for integration)
- **Character counter** and token estimate
- **Keyboard shortcuts** (Enter to send, Shift+Enter for newline)
- **Visual feedback** for sending state

### 5. Tool Execution Display

Real-time visualization of tool usage:

- Tool name badges with status colors
- Input parameters display
- Output results with formatting
- Error messages with retry options
- Duration tracking

### 6. Error Handling

Comprehensive error handling:

- Retry buttons for failed operations
- Visual error indicators
- User-friendly error messages
- Graceful degradation

### 7. Performance Optimizations

Built for performance:

- Framer Motion animations with proper exit animations
- Memoized components to prevent unnecessary re-renders
- Efficient state updates
- Auto-scroll optimization with toggle
- Smooth 60fps animations

### 8. Accessibility

WCAG 2.1 compliant:

- Keyboard navigation support
- ARIA labels on all interactive elements
- Screen reader friendly
- Focus management
- Proper semantic HTML

## Usage

### Basic Usage

```tsx
import { EnhancedChatInterface } from '@/components/chat/EnhancedChatInterface';
import { TooltipProvider } from '@/components/ui/Tooltip';

function ChatPage() {
  return (
    <TooltipProvider>
      <div className="h-screen">
        <EnhancedChatInterface />
      </div>
    </TooltipProvider>
  );
}
```

### With Custom Styling

```tsx
<EnhancedChatInterface className="rounded-lg border shadow-xl" />
```

### Integration with Existing Routes

Replace your existing `ChatInterface` import:

```tsx
// Before
import { ChatInterface } from '@/components/Chat/ChatInterface';

// After
import { EnhancedChatInterface } from '@/components/chat/EnhancedChatInterface';
```

## Architecture

### Component Structure

```
EnhancedChatInterface (Main Container)
├── ScrollArea (Message List)
│   ├── MessageBubble[] (Individual Messages)
│   │   ├── Avatar
│   │   ├── ProcessingVisualization (AI steps)
│   │   ├── MessageContent (Markdown with syntax highlighting)
│   │   ├── ToolExecutionDisplay (Tool calls)
│   │   ├── ReasoningSection (Collapsible)
│   │   └── ActionsMenu (Copy, edit, delete, regenerate)
│   └── TypingIndicator (Loading state)
├── AutoScrollToggle
└── EnhancedInput (Input Area)
    ├── FileAttachments (Preview chips)
    ├── Toolbar (Attach, Voice)
    ├── Textarea (Auto-resizing)
    ├── CharacterCounter
    └── SendButton
```

### State Management

The component integrates with Zustand stores:

- **chatStore**: Messages, conversations, sending state
- **settingsStore**: LLM configuration, preferences

### Type System

```typescript
interface EnhancedMessage extends MessageUI {
  processingSteps?: ProcessingStep[];
  toolExecutions?: ToolExecution[];
  reasoning?: string;
  provider?: string;
  model?: string;
}

interface ProcessingStep {
  id: string;
  type: 'prompt_enhancement' | 'routing' | 'tool_call' | 'reasoning' | 'generation';
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  title: string;
  description?: string;
  progress?: number;
  metadata?: Record<string, unknown>;
  startTime?: number;
  endTime?: number;
}

interface ToolExecution {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'error';
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  duration?: number;
}
```

## Styling

### Tailwind Classes

The component uses a modern color palette with gradients:

- **User messages**: `bg-muted/30` with `from-primary to-primary/80` avatar
- **AI messages**: `bg-background` with `from-secondary to-secondary/80` avatar
- **Hover states**: `hover:bg-accent/30` with smooth transitions
- **Shadows**: `shadow-lg shadow-primary/20` for depth

### Animations

Framer Motion animations include:

- **Message entrance**: Fade + slide up (0.2s)
- **Avatar scale**: Spring animation (500 stiffness, 30 damping)
- **Typing dots**: Staggered scale pulse
- **Processing cards**: Slide down with delay
- **Code blocks**: Opacity fade for copy button

### Dark Mode Support

Automatically adapts to dark mode:

- Syntax highlighting switches between `oneDark` and `oneLight`
- Color scheme uses CSS variables from Tailwind config
- Proper contrast ratios maintained

## Backend Integration

### Current Implementation

The component currently uses mock data for processing steps. To connect to real backend events:

### 1. Listen to Processing Events

```typescript
// In EnhancedChatInterface component
useEffect(() => {
  const unsubscribe = listen<ProcessingStepPayload>('chat:processing-step', (event) => {
    // Update message with new processing step
    setEnhancedMessages((prev) =>
      prev.map((msg) =>
        msg.id === event.payload.messageId
          ? {
              ...msg,
              processingSteps: [...(msg.processingSteps || []), event.payload.step],
            }
          : msg,
      ),
    );
  });

  return () => {
    unsubscribe.then((fn) => fn());
  };
}, []);
```

### 2. Listen to Tool Execution Events

```typescript
useEffect(() => {
  const unsubscribe = listen<ToolExecutionPayload>('tool:execution', (event) => {
    // Update message with tool execution
    setEnhancedMessages((prev) =>
      prev.map((msg) =>
        msg.id === event.payload.messageId
          ? {
              ...msg,
              toolExecutions: [...(msg.toolExecutions || []), event.payload.execution],
            }
          : msg,
      ),
    );
  });

  return () => {
    unsubscribe.then((fn) => fn());
  };
}, []);
```

### 3. Rust Backend Events

Add these events in your Rust backend:

```rust
// apps/desktop/src-tauri/src/router/mod.rs

// Emit processing step
app.emit_all("chat:processing-step", ProcessingStepPayload {
    message_id,
    step: ProcessingStep {
        id: uuid::Uuid::new_v4().to_string(),
        type_: "prompt_enhancement",
        status: "in_progress",
        title: "Enhancing prompt",
        description: Some("Analyzing user intent"),
        progress: Some(50),
        start_time: Some(start_time),
        ..Default::default()
    }
})?;

// Emit tool execution
app.emit_all("tool:execution", ToolExecutionPayload {
    message_id,
    execution: ToolExecution {
        id: uuid::Uuid::new_v4().to_string(),
        name: "file_read".to_string(),
        status: "running",
        input: Some(serde_json::json!({ "path": "/file.txt" })),
        ..Default::default()
    }
})?;
```

## Customization

### Adding Custom Processing Steps

```typescript
const customSteps: ProcessingStep[] = [
  {
    id: '1',
    type: 'prompt_enhancement',
    status: 'completed',
    title: 'Custom Step',
    description: 'Your custom processing step',
    metadata: { custom: 'data' },
  },
];
```

### Custom Message Actions

Extend the actions menu:

```typescript
<DropdownMenuItem onClick={() => handleCustomAction(message)}>
  <CustomIcon className="h-4 w-4" />
  <span className="ml-2">Custom Action</span>
</DropdownMenuItem>
```

### Theming

Override Tailwind CSS variables in your `globals.css`:

```css
:root {
  --primary: 220 90% 56%;
  --primary-foreground: 0 0% 100%;
  --secondary: 240 5% 26%;
  --secondary-foreground: 0 0% 100%;
  /* ... other variables */
}
```

## Performance Tips

1. **Large Conversations**: Consider implementing virtual scrolling for 100+ messages
2. **Image Attachments**: Compress images before uploading
3. **Code Blocks**: Lazy load syntax highlighter for better initial load
4. **Animations**: Reduce motion for users with `prefers-reduced-motion`
5. **Auto-scroll**: Disable auto-scroll for better UX when scrolling up

## Testing

### Unit Tests

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { EnhancedChatInterface } from './EnhancedChatInterface';

describe('EnhancedChatInterface', () => {
  it('renders empty state', () => {
    render(<EnhancedChatInterface />);
    expect(screen.getByText('Start a Conversation')).toBeInTheDocument();
  });

  it('sends message on Enter key', () => {
    const { getByPlaceholder } = render(<EnhancedChatInterface />);
    const input = getByPlaceholder(/Type your message/);

    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Assert message was sent
  });
});
```

### E2E Tests

```typescript
import { test, expect } from '@playwright/test';

test('chat interface workflow', async ({ page }) => {
  await page.goto('/chat');

  // Type message
  await page.fill('textarea', 'Hello AI');
  await page.press('textarea', 'Enter');

  // Wait for response
  await expect(page.locator('[data-role="assistant"]')).toBeVisible();
});
```

## Troubleshooting

### Messages not appearing

- Ensure `TooltipProvider` wraps the component
- Check that `useChatStore` is properly initialized
- Verify backend events are being emitted

### Styling issues

- Ensure Tailwind CSS is configured correctly
- Check that CSS variables are defined in `globals.css`
- Verify `tailwindcss-animate` plugin is installed

### Performance issues

- Enable React DevTools Profiler
- Check for unnecessary re-renders
- Consider memoizing heavy computations

## Roadmap

- [ ] Virtual scrolling for large conversations
- [ ] Voice input integration
- [ ] Real-time collaboration
- [ ] Message reactions
- [ ] Conversation branching
- [ ] Export conversation as PDF/Markdown
- [ ] Search within conversation
- [ ] Message pinning
- [ ] Code execution sandbox
- [ ] Artifact preview (charts, diagrams)

## License

Part of AGI Workforce Desktop Application.

## Contributing

See the main project CONTRIBUTING.md for guidelines.
