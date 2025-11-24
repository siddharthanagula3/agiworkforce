# Tool Calling UI Integration Guide

Complete step-by-step guide for integrating tool calling UI components with the AGI Workforce desktop application.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Chat Store Integration](#chat-store-integration)
3. [Message Component Integration](#message-component-integration)
4. [Tauri Backend Events](#tauri-backend-events)
5. [Tool Approval Flow](#tool-approval-flow)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)

## Quick Start

The fastest way to see tool calling UI in action:

```tsx
// 1. Import the MessageWithTools component
import { MessageWithTools } from './Chat/MessageWithTools';

// 2. Use it in your MessageList
<MessageWithTools
  message={message}
  onCancelTool={handleCancelTool}
  onApproveTool={handleApproveTool}
  onRejectTool={handleRejectTool}
  onRetryTool={handleRetryTool}
/>;
```

## Chat Store Integration

### Step 1: Add Tool Event Listeners

Update `apps/desktop/src/stores/unifiedChatStore.ts` to listen for tool execution events:

```typescript
import { listen } from '@tauri-apps/api/event';
import type {
  ToolCallStartPayload,
  ToolCallProgressPayload,
  ToolCallCompletePayload,
  ToolCallErrorPayload,
  ToolApprovalRequestPayload,
} from '../types/toolCalling';

// Add these listeners in the initialization section
async function initializeToolListeners() {
  try {
    // Tool execution started
    await listen<ToolCallStartPayload>('tool:call:start', ({ payload }) => {
      useUnifiedChatStore.setState((state) => {
        // Find the message that initiated this tool call
        const messageIndex = state.messages.findIndex(
          (msg) => msg.role === 'assistant' && msg.streaming,
        );

        if (messageIndex !== -1) {
          const message = state.messages[messageIndex];
          const toolCall: ToolCallUI = {
            id: payload.tool_call_id,
            tool_id: payload.tool_id,
            tool_name: payload.tool_name,
            tool_description: '',
            parameters: payload.parameters,
            status: payload.requires_approval ? 'awaiting_approval' : 'in_progress',
            created_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            requires_approval: payload.requires_approval,
            streaming: true,
          };

          // Add tool call to message
          const updatedMessage = {
            ...message,
            tool_calls: [...(message.tool_calls || []), toolCall],
          };

          state.messages[messageIndex] = updatedMessage;
        }
      });
    });

    // Tool execution progress
    await listen<ToolCallProgressPayload>('tool:call:progress', ({ payload }) => {
      useUnifiedChatStore.setState((state) => {
        const messageIndex = state.messages.findIndex((msg) =>
          msg.tool_calls?.some((tc) => tc.id === payload.tool_call_id),
        );

        if (messageIndex !== -1) {
          const message = state.messages[messageIndex];
          const toolCallIndex = message.tool_calls!.findIndex(
            (tc) => tc.id === payload.tool_call_id,
          );

          if (toolCallIndex !== -1) {
            const updatedToolCalls = [...message.tool_calls!];
            updatedToolCalls[toolCallIndex] = {
              ...updatedToolCalls[toolCallIndex],
              // Update with progress info
            };

            state.messages[messageIndex] = {
              ...message,
              tool_calls: updatedToolCalls,
            };
          }
        }
      });
    });

    // Tool execution completed
    await listen<ToolCallCompletePayload>('tool:call:complete', ({ payload }) => {
      useUnifiedChatStore.setState((state) => {
        const messageIndex = state.messages.findIndex((msg) =>
          msg.tool_calls?.some((tc) => tc.id === payload.tool_call_id),
        );

        if (messageIndex !== -1) {
          const message = state.messages[messageIndex];
          const toolCallIndex = message.tool_calls!.findIndex(
            (tc) => tc.id === payload.tool_call_id,
          );

          if (toolCallIndex !== -1) {
            // Update tool call status
            const updatedToolCalls = [...message.tool_calls!];
            updatedToolCalls[toolCallIndex] = {
              ...updatedToolCalls[toolCallIndex],
              status: 'completed',
              completed_at: new Date().toISOString(),
              duration_ms: payload.duration_ms,
              streaming: false,
            };

            // Add tool result
            const toolResults = [...(message.tool_results || []), payload.result];

            state.messages[messageIndex] = {
              ...message,
              tool_calls: updatedToolCalls,
              tool_results: toolResults,
            };
          }
        }
      });
    });

    // Tool execution error
    await listen<ToolCallErrorPayload>('tool:call:error', ({ payload }) => {
      useUnifiedChatStore.setState((state) => {
        const messageIndex = state.messages.findIndex((msg) =>
          msg.tool_calls?.some((tc) => tc.id === payload.tool_call_id),
        );

        if (messageIndex !== -1) {
          const message = state.messages[messageIndex];
          const toolCallIndex = message.tool_calls!.findIndex(
            (tc) => tc.id === payload.tool_call_id,
          );

          if (toolCallIndex !== -1) {
            // Update tool call status
            const updatedToolCalls = [...message.tool_calls!];
            updatedToolCalls[toolCallIndex] = {
              ...updatedToolCalls[toolCallIndex],
              status: 'failed',
              completed_at: new Date().toISOString(),
              streaming: false,
            };

            // Add error result
            const toolResults = [
              ...(message.tool_results || []),
              {
                tool_call_id: payload.tool_call_id,
                success: false,
                data: null,
                error: payload.error,
              },
            ];

            state.messages[messageIndex] = {
              ...message,
              tool_calls: updatedToolCalls,
              tool_results: toolResults,
            };
          }
        }
      });
    });

    console.log('[unifiedChatStore] Tool execution listeners initialized');
  } catch (error) {
    console.error('[unifiedChatStore] Failed to initialize tool listeners:', error);
  }
}

// Call in your store initialization
if (typeof window !== 'undefined') {
  void initializeStreamListeners();
  void initializeAGIListeners();
  void initializeToolListeners(); // Add this
}
```

### Step 2: Add Tool Action Handlers

Add these action handlers to your chat store:

```typescript
interface ChatState {
  // ... existing state
  cancelToolExecution: (toolCallId: string) => Promise<void>;
  approveToolExecution: (toolCallId: string) => Promise<void>;
  rejectToolExecution: (toolCallId: string) => Promise<void>;
  retryToolExecution: (toolCallId: string) => Promise<void>;
}

// In your store implementation
export const useUnifiedChatStore = create<UnifiedChatState>()(
  persist(
    immer((set, get) => ({
      // ... existing state and actions

      cancelToolExecution: async (toolCallId: string) => {
        try {
          await invoke('cancel_tool_execution', { toolCallId });

          set((state) => {
            const messageIndex = state.messages.findIndex((msg) =>
              msg.tool_calls?.some((tc) => tc.id === toolCallId),
            );

            if (messageIndex !== -1) {
              const message = state.messages[messageIndex];
              const toolCallIndex = message.tool_calls!.findIndex((tc) => tc.id === toolCallId);

              if (toolCallIndex !== -1) {
                const updatedToolCalls = [...message.tool_calls!];
                updatedToolCalls[toolCallIndex] = {
                  ...updatedToolCalls[toolCallIndex],
                  status: 'cancelled',
                  streaming: false,
                };

                state.messages[messageIndex] = {
                  ...message,
                  tool_calls: updatedToolCalls,
                };
              }
            }
          });
        } catch (error) {
          console.error('Failed to cancel tool execution:', error);
          throw error;
        }
      },

      approveToolExecution: async (toolCallId: string) => {
        try {
          await invoke('approve_tool_execution', { toolCallId });

          set((state) => {
            const messageIndex = state.messages.findIndex((msg) =>
              msg.tool_calls?.some((tc) => tc.id === toolCallId),
            );

            if (messageIndex !== -1) {
              const message = state.messages[messageIndex];
              const toolCallIndex = message.tool_calls!.findIndex((tc) => tc.id === toolCallId);

              if (toolCallIndex !== -1) {
                const updatedToolCalls = [...message.tool_calls!];
                updatedToolCalls[toolCallIndex] = {
                  ...updatedToolCalls[toolCallIndex],
                  status: 'in_progress',
                  approved: true,
                  approved_at: new Date().toISOString(),
                };

                state.messages[messageIndex] = {
                  ...message,
                  tool_calls: updatedToolCalls,
                };
              }
            }
          });
        } catch (error) {
          console.error('Failed to approve tool execution:', error);
          throw error;
        }
      },

      rejectToolExecution: async (toolCallId: string) => {
        try {
          await invoke('reject_tool_execution', { toolCallId });

          set((state) => {
            const messageIndex = state.messages.findIndex((msg) =>
              msg.tool_calls?.some((tc) => tc.id === toolCallId),
            );

            if (messageIndex !== -1) {
              const message = state.messages[messageIndex];
              const toolCallIndex = message.tool_calls!.findIndex((tc) => tc.id === toolCallId);

              if (toolCallIndex !== -1) {
                const updatedToolCalls = [...message.tool_calls!];
                updatedToolCalls[toolCallIndex] = {
                  ...updatedToolCalls[toolCallIndex],
                  status: 'cancelled',
                  approved: false,
                  approved_at: new Date().toISOString(),
                  streaming: false,
                };

                state.messages[messageIndex] = {
                  ...message,
                  tool_calls: updatedToolCalls,
                };
              }
            }
          });
        } catch (error) {
          console.error('Failed to reject tool execution:', error);
          throw error;
        }
      },

      retryToolExecution: async (toolCallId: string) => {
        try {
          // Get the original tool call
          const state = get();
          const message = state.messages.find((msg) =>
            msg.tool_calls?.some((tc) => tc.id === toolCallId),
          );

          if (!message) return;

          const toolCall = message.tool_calls!.find((tc) => tc.id === toolCallId);
          if (!toolCall) return;

          // Retry with same parameters
          await invoke('execute_tool', {
            toolId: toolCall.tool_id,
            parameters: toolCall.parameters,
          });
        } catch (error) {
          console.error('Failed to retry tool execution:', error);
          throw error;
        }
      },
    })),
    // ... persistence config
  ),
);
```

## Message Component Integration

### Option 1: Replace Existing Message Component

Replace your existing `Message.tsx` with `MessageWithTools.tsx`:

```tsx
// In MessageList.tsx
import { MessageWithTools } from './MessageWithTools';

// Replace <Message /> with:
<MessageWithTools
  message={message}
  onRegenerate={onRegenerateMessage}
  onEdit={onEditMessage}
  onDelete={onDeleteMessage}
  onCancelTool={handleCancelTool}
  onApproveTool={handleApproveTool}
  onRejectTool={handleRejectTool}
  onRetryTool={handleRetryTool}
/>;
```

### Option 2: Extend Existing Message Component

Add tool calling sections to your existing Message component:

```tsx
// In your existing Message.tsx, after the message content:

{
  /* Tool Execution Workflow */
}
{
  message.workflow && (
    <div className="mt-3">
      <ToolExecutionTimeline
        workflow={message.workflow}
        onCancelTool={onCancelTool}
        onApproveTool={onApproveTool}
        onRejectTool={onRejectTool}
        onRetryTool={onRetryTool}
      />
    </div>
  );
}

{
  /* Individual Tool Calls */
}
{
  !message.workflow && message.tool_calls && message.tool_calls.length > 0 && (
    <div className="space-y-2 mt-3">
      {message.tool_calls.map((toolCall) => (
        <ToolCallCard
          key={toolCall.id}
          toolCall={toolCall}
          onCancel={onCancelTool}
          onApprove={onApproveTool}
          onReject={onRejectTool}
        />
      ))}
    </div>
  );
}

{
  /* Tool Results */
}
{
  !message.workflow && message.tool_results && message.tool_results.length > 0 && (
    <div className="space-y-2 mt-3">
      {message.tool_results.map((result) => (
        <ToolResultCard key={result.tool_call_id} result={result} />
      ))}
    </div>
  );
}
```

## Tauri Backend Events

### Rust Event Emission

In your Rust backend (`apps/desktop/src-tauri/src/agi/executor.rs` or similar):

```rust
use tauri::Manager;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct ToolCallStartPayload {
    pub tool_call_id: String,
    pub tool_id: String,
    pub tool_name: String,
    pub parameters: serde_json::Value,
    pub requires_approval: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolCallCompletePayload {
    pub tool_call_id: String,
    pub result: ToolResult,
    pub duration_ms: u64,
}

pub async fn execute_tool(
    app: tauri::AppHandle,
    tool_call: ToolCall,
) -> Result<ToolResult> {
    let start = std::time::Instant::now();

    // Emit start event
    app.emit_all("tool:call:start", ToolCallStartPayload {
        tool_call_id: tool_call.id.clone(),
        tool_id: tool_call.tool_id.clone(),
        tool_name: tool_call.tool_name.clone(),
        parameters: serde_json::to_value(&tool_call.parameters)?,
        requires_approval: Some(tool_call.requires_approval),
    })?;

    // Execute tool (with approval check if needed)
    let result = match perform_execution(&tool_call).await {
        Ok(r) => r,
        Err(e) => {
            // Emit error event
            app.emit_all("tool:call:error", ToolCallErrorPayload {
                tool_call_id: tool_call.id,
                error: e.to_string(),
                error_type: Some("execution_failed".to_string()),
                retry_able: Some(true),
            })?;
            return Err(e);
        }
    };

    let duration = start.elapsed().as_millis() as u64;

    // Emit complete event
    app.emit_all("tool:call:complete", ToolCallCompletePayload {
        tool_call_id: tool_call.id,
        result: result.clone(),
        duration_ms: duration,
    })?;

    Ok(result)
}
```

### Register Tauri Commands

In `apps/desktop/src-tauri/src/main.rs`:

```rust
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            // ... existing commands
            execute_tool,
            cancel_tool_execution,
            approve_tool_execution,
            reject_tool_execution,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## Tool Approval Flow

### Backend Approval System

```rust
// In approval.rs
use tokio::sync::oneshot;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct ApprovalManager {
    pending: Arc<Mutex<HashMap<String, oneshot::Sender<bool>>>>,
}

impl ApprovalManager {
    pub fn new() -> Self {
        Self {
            pending: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn request_approval(
        &self,
        app: tauri::AppHandle,
        tool_call_id: String,
        reason: String,
        risk_level: String,
    ) -> Result<bool> {
        let (tx, rx) = oneshot::channel();

        // Store pending approval
        self.pending.lock().await.insert(tool_call_id.clone(), tx);

        // Emit approval request to frontend
        app.emit_all("tool:approval:request", ToolApprovalRequestPayload {
            tool_call_id: tool_call_id.clone(),
            tool_name: "...".to_string(),
            parameters: serde_json::json!({}),
            reason,
            risk_level,
        })?;

        // Wait for approval response (with timeout)
        let approved = tokio::time::timeout(
            std::time::Duration::from_secs(300), // 5 minute timeout
            rx
        ).await??;

        Ok(approved)
    }

    pub async fn respond_approval(&self, tool_call_id: &str, approved: bool) -> Result<()> {
        if let Some(tx) = self.pending.lock().await.remove(tool_call_id) {
            let _ = tx.send(approved);
        }
        Ok(())
    }
}

#[tauri::command]
pub async fn approve_tool_execution(
    approval_manager: tauri::State<'_, Arc<ApprovalManager>>,
    tool_call_id: String,
) -> Result<()> {
    approval_manager.respond_approval(&tool_call_id, true).await?;
    Ok(())
}

#[tauri::command]
pub async fn reject_tool_execution(
    approval_manager: tauri::State<'_, Arc<ApprovalManager>>,
    tool_call_id: String,
) -> Result<()> {
    approval_manager.respond_approval(&tool_call_id, false).await?;
    Ok(())
}
```

### Frontend Approval Handler

```typescript
// In unifiedChatStore.ts or a dedicated approval handler
import { ToolApprovalDialog } from '../components/ToolCalling';

// Listen for approval requests
await listen<ToolApprovalRequestPayload>('tool:approval:request', ({ payload }) => {
  // Show approval dialog
  // This could be managed by a separate approval state/context
  showApprovalDialog(payload);
});

function showApprovalDialog(approval: ToolApprovalRequestPayload) {
  // Update your UI state to show the approval dialog
  // The ToolApprovalDialog component will handle the UI
  // When user approves/rejects, call the corresponding chat store action
}
```

## Testing

### Unit Tests

Test individual components:

```typescript
// ToolCallCard.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ToolCallCard } from '../ToolCalling';

describe('ToolCallCard', () => {
  it('renders tool call information', () => {
    const toolCall = {
      id: 'call_123',
      tool_id: 'file_read',
      tool_name: 'Read File',
      tool_description: 'Read content from a file',
      parameters: { path: '/test.txt' },
      status: 'completed',
      created_at: '2025-11-14T10:00:00Z',
    };

    render(<ToolCallCard toolCall={toolCall} />);

    expect(screen.getByText('Read File')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('calls onCancel when cancel button clicked', () => {
    const handleCancel = jest.fn();
    const toolCall = {
      // ... tool call data
      status: 'in_progress',
    };

    render(<ToolCallCard toolCall={toolCall} onCancel={handleCancel} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(handleCancel).toHaveBeenCalledWith('call_123');
  });
});
```

### Integration Tests

Test the full flow with Playwright:

```typescript
// e2e/tool-execution.spec.ts
import { test, expect } from '@playwright/test';

test('tool execution workflow', async ({ page }) => {
  await page.goto('http://localhost:5173');

  // Send message that triggers tool execution
  await page.fill('[data-testid="message-input"]', 'Read the file /test.txt');
  await page.click('[data-testid="send-button"]');

  // Wait for tool call to appear
  await expect(page.locator('.tool-call-card')).toBeVisible();
  await expect(page.locator('text=Read File')).toBeVisible();

  // Wait for tool result
  await expect(page.locator('.tool-result-card')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=Success')).toBeVisible();
});
```

## Troubleshooting

### Tool Calls Not Appearing

1. **Check event listeners are initialized:**

   ```typescript
   console.log('[DEBUG] Tool listeners initialized?');
   ```

2. **Verify Tauri events are being emitted:**

   ```rust
   println!("[DEBUG] Emitting tool:call:start for {}", tool_call_id);
   ```

3. **Check message has tool_calls array:**
   ```typescript
   console.log('Message tool calls:', message.tool_calls);
   ```

### Tool Results Not Updating

1. **Verify result payload matches ToolResult type**
2. **Check that tool_call_id matches between call and result**
3. **Ensure state updates are immutable (using immer)**

### Approval Dialog Not Showing

1. **Check approval request event is being emitted**
2. **Verify ToolApprovalDialog is mounted**
3. **Check open state is being updated**

### Performance Issues

1. **Enable memoization on Message components**
2. **Use virtualization for large message lists**
3. **Limit default expansion depth in JsonViewer**
4. **Enable pagination in TableViewer**

## Next Steps

1. **Add Tool Registry UI** - Show available tools and their descriptions
2. **Tool Execution History** - Dedicated view for past tool executions
3. **Tool Performance Metrics** - Track execution times and success rates
4. **Custom Tool Visualizations** - Add custom renderers for specific tool types
5. **Tool Chaining UI** - Visual builder for multi-step workflows

## Support

For issues or questions:

- Check the [main README](./README.md) for component documentation
- Review example usage in [MessageWithTools.tsx](../Chat/MessageWithTools.tsx)
- Examine type definitions in [toolCalling.ts](../../types/toolCalling.ts)
