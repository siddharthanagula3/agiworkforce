# Tool Calling UI Components

Comprehensive React components for displaying AI tool/function calls and their results in chat interfaces. Built for the AGI Workforce desktop application with support for multi-step agent workflows, streaming execution, and rich data visualization.

## Overview

These components align with 2026 AI interface design trends:
- **Agentic AI**: Show autonomous agent decision-making process
- **Multi-step workflows**: Display complex tool chains visually
- **Transparency**: Make AI actions explainable and auditable
- **Human-in-the-loop**: Support approval flows for dangerous operations

## Components

### Core Components

#### `ToolCallCard`
Display individual tool invocations with parameters, status, and timing.

```tsx
import { ToolCallCard } from '@/components/ToolCalling';

<ToolCallCard
  toolCall={{
    id: 'call_123',
    tool_id: 'file_read',
    tool_name: 'Read File',
    tool_description: 'Read content from a file',
    parameters: { path: '/home/user/file.txt' },
    status: 'in_progress',
    created_at: '2025-11-14T10:00:00Z',
    streaming: true,
  }}
  onCancel={(id) => console.log('Cancel:', id)}
  onApprove={(id) => console.log('Approve:', id)}
  onReject={(id) => console.log('Reject:', id)}
  showParameters={true}
  defaultExpanded={false}
/>
```

**Features:**
- Expandable/collapsible parameter view
- Real-time status updates (pending, in_progress, completed, failed)
- Streaming indicator
- Approval/rejection actions
- Copy to clipboard
- Execution timing information

#### `ToolResultCard`
Display tool results with intelligent visualization based on output type.

```tsx
import { ToolResultCard } from '@/components/ToolCalling';

<ToolResultCard
  result={{
    tool_call_id: 'call_123',
    success: true,
    data: { rows: [...], columns: [...] },
    output_type: 'table',
    metadata: { row_count: 100 }
  }}
  defaultExpanded={true}
/>
```

**Supported Output Types:**
- `json` - JSON data with collapsible tree view
- `table` - Database query results with sorting/filtering
- `image` - Screenshots and images with zoom/download
- `code` - Syntax highlighted code
- `diff` - File modifications with additions/deletions
- `markdown` - Rendered markdown content
- `text` - Plain text output
- `error` - Beautiful error messages

#### `ToolErrorDisplay`
Beautiful error messages with troubleshooting tips and retry functionality.

```tsx
import { ToolErrorDisplay } from '@/components/ToolCalling';

<ToolErrorDisplay
  error="Permission denied: Cannot write to /etc/config"
  errorType="permission_denied"
  toolName="Write File"
  parameters={{ path: '/etc/config', content: '...' }}
  retryable={true}
  onRetry={() => retryOperation()}
/>
```

**Error Types:**
- `timeout` - Operation took too long
- `permission_denied` - Insufficient permissions
- `not_found` - Resource not found
- `execution_failed` - General execution error
- `cancelled` - User cancelled operation

#### `ToolApprovalDialog`
Modal dialog for approving dangerous tool operations before execution.

```tsx
import { ToolApprovalDialog } from '@/components/ToolCalling';

<ToolApprovalDialog
  open={showDialog}
  onOpenChange={setShowDialog}
  approval={{
    tool_call_id: 'call_456',
    tool_name: 'Execute Code',
    parameters: { language: 'bash', code: 'rm -rf /' },
    reason: 'This command can delete system files',
    risk_level: 'high'
  }}
  onApprove={() => approveExecution()}
  onReject={() => rejectExecution()}
/>
```

**Risk Levels:**
- `high` - Can modify system state or delete data (red)
- `medium` - May access sensitive information (orange)
- `low` - Minor side effects (yellow)

#### `ToolExecutionTimeline`
Visualize multi-step agent workflows with a timeline view.

```tsx
import { ToolExecutionTimeline } from '@/components/ToolCalling';

<ToolExecutionTimeline
  workflow={{
    id: 'workflow_789',
    description: 'Analyze sales data and generate report',
    goal_id: 'goal_001',
    status: 'in_progress',
    progress_percent: 60,
    current_step: 3,
    total_steps: 5,
    steps: [
      {
        step_number: 1,
        tool_call: { /* ... */ },
        result: { /* ... */ }
      },
      // More steps...
    ]
  }}
  onCancelTool={(id) => cancelTool(id)}
  onApproveTool={(id) => approveTool(id)}
  onRejectTool={(id) => rejectTool(id)}
  onRetryTool={(id) => retryTool(id)}
/>
```

**Features:**
- Visual timeline with step numbers
- Progress bar for overall workflow
- Nested sub-tasks (dependencies)
- Real-time status updates
- Expandable step details

### Visualization Components

#### `JsonViewer`
Interactive JSON data viewer with search, expand/collapse, and syntax highlighting.

```tsx
import { JsonViewer } from '@/components/ToolCalling';

<JsonViewer
  data={{
    user: { name: 'John', age: 30 },
    orders: [{ id: 1, total: 99.99 }]
  }}
  maxHeight="400px"
  defaultExpanded={true}
  searchable={true}
/>
```

#### `TableViewer`
Database query results with sorting, filtering, pagination, and CSV export.

```tsx
import { TableViewer } from '@/components/ToolCalling';

<TableViewer
  data={{
    columns: [
      { key: 'id', label: 'ID', type: 'number' },
      { key: 'name', label: 'Name', type: 'string' }
    ],
    rows: [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' }
    ]
  }}
  maxHeight="400px"
  paginated={true}
/>
```

#### `ImagePreview`
Display screenshots and images with zoom, fullscreen, and OCR text extraction.

```tsx
import { ImagePreview } from '@/components/ToolCalling';

<ImagePreview
  artifact={{
    id: 'img_123',
    type: 'image',
    name: 'screenshot.png',
    data: 'base64_encoded_image',
    mime_type: 'image/png',
    size: 102400
  }}
  maxHeight="400px"
  showMetadata={true}
  ocrText="Extracted text from OCR..."
/>
```

#### `DiffViewer`
File modification diffs with syntax highlighting for additions/deletions.

```tsx
import { DiffViewer } from '@/components/ToolCalling';

<DiffViewer
  data={{
    file_path: 'src/config.ts',
    hunks: [
      {
        old_start: 10,
        old_lines: 3,
        new_start: 10,
        new_lines: 4,
        lines: [
          { type: 'context', content: 'const port = 3000;' },
          { type: 'remove', content: 'const host = "localhost";' },
          { type: 'add', content: 'const host = "0.0.0.0";' },
          { type: 'add', content: 'const secure = true;' }
        ]
      }
    ]
  }}
  maxHeight="400px"
  defaultExpanded={true}
/>
```

## Integration with Chat Interface

### Extending Message Types

Add tool calls and results to your message type:

```typescript
interface MessageWithTools extends MessageUI {
  tool_calls?: ToolCallUI[];
  tool_results?: ToolResultUI[];
  workflow?: ToolExecutionWorkflow;
}
```

### Chat Store Integration

Add tool calling handlers to your chat store:

```typescript
// In chatStore.ts
import { listen } from '@tauri-apps/api/event';
import type { ToolCallStartPayload, ToolCallCompletePayload } from '../types/toolCalling';

// Listen for tool execution events
await listen<ToolCallStartPayload>('tool:call:start', ({ payload }) => {
  // Add tool call to current message
  useChatStore.setState((state) => {
    // Update messages with new tool call
  });
});

await listen<ToolCallCompletePayload>('tool:call:complete', ({ payload }) => {
  // Add tool result to current message
  useChatStore.setState((state) => {
    // Update messages with tool result
  });
});
```

### Display in Message Component

```tsx
// In Message.tsx
import { ToolCallCard, ToolResultCard, ToolExecutionTimeline } from './ToolCalling';

function Message({ message }: { message: MessageWithTools }) {
  return (
    <div className="message">
      {/* Regular message content */}
      <div className="content">{message.content}</div>

      {/* Tool Calls */}
      {message.tool_calls && message.tool_calls.length > 0 && (
        <div className="space-y-2 mt-3">
          {message.tool_calls.map((toolCall) => (
            <ToolCallCard key={toolCall.id} toolCall={toolCall} />
          ))}
        </div>
      )}

      {/* Tool Results */}
      {message.tool_results && message.tool_results.length > 0 && (
        <div className="space-y-2 mt-3">
          {message.tool_results.map((result) => (
            <ToolResultCard key={result.tool_call_id} result={result} />
          ))}
        </div>
      )}

      {/* Multi-step Workflow */}
      {message.workflow && (
        <div className="mt-3">
          <ToolExecutionTimeline workflow={message.workflow} />
        </div>
      )}
    </div>
  );
}
```

## Tauri Backend Integration

### Rust Events

Emit tool execution events from Rust:

```rust
// In tools.rs
use tauri::Manager;

pub async fn execute_tool(
    app: tauri::AppHandle,
    tool_call: ToolCall,
) -> Result<ToolResult> {
    // Emit start event
    app.emit_all("tool:call:start", ToolCallStartPayload {
        tool_call_id: tool_call.id.clone(),
        tool_id: tool_call.tool_id.clone(),
        tool_name: tool_call.tool_name.clone(),
        parameters: tool_call.parameters.clone(),
    })?;

    // Execute tool...
    let result = perform_execution(&tool_call).await?;

    // Emit complete event
    app.emit_all("tool:call:complete", ToolCallCompletePayload {
        tool_call_id: tool_call.id,
        result,
        duration_ms: elapsed.as_millis() as u64,
    })?;

    Ok(result)
}
```

### Approval Flow

```rust
// In approval.rs
#[tauri::command]
pub async fn request_tool_approval(
    app: tauri::AppHandle,
    tool_call_id: String,
    reason: String,
    risk_level: String,
) -> Result<bool> {
    // Emit approval request
    app.emit_all("tool:approval:request", ToolApprovalRequestPayload {
        tool_call_id,
        tool_name: "...".to_string(),
        parameters: serde_json::json!({}),
        reason,
        risk_level,
    })?;

    // Wait for approval response (use channels or state)
    let approved = wait_for_approval().await?;
    Ok(approved)
}
```

## Styling

All components use Tailwind CSS and respect your theme (light/dark mode). Key design tokens:

- **Status Colors:**
  - Success: `green-600` / `green-400`
  - Error: `red-600` / `red-400`
  - Warning: `yellow-600` / `yellow-400`
  - Info: `blue-600` / `blue-400`
  - Progress: `primary`

- **Spacing:**
  - Card padding: `p-3` / `p-4`
  - Gap between elements: `gap-2` / `gap-3`
  - Timeline steps: `pb-6`

## Best Practices

1. **Always show tool calls for transparency** - Users should see what AI is doing
2. **Require approval for dangerous operations** - File deletion, system commands, etc.
3. **Show progress for long-running tools** - Use streaming updates
4. **Provide retry on failure** - With modified parameters if needed
5. **Export data easily** - CSV export, copy to clipboard
6. **Support keyboard navigation** - Expand/collapse with arrow keys
7. **Show timing information** - Help users understand performance
8. **Display metadata** - Token usage, cost, resource consumption

## Examples

### Simple Tool Call

```tsx
// Single file read operation
<ToolCallCard
  toolCall={{
    id: 'call_1',
    tool_id: 'file_read',
    tool_name: 'Read File',
    tool_description: 'Read content from a file',
    parameters: { path: '/home/user/data.json' },
    status: 'completed',
    created_at: '2025-11-14T10:00:00Z',
    completed_at: '2025-11-14T10:00:01Z',
    duration_ms: 1234,
  }}
/>

<ToolResultCard
  result={{
    tool_call_id: 'call_1',
    success: true,
    data: { user: 'John', age: 30 },
    output_type: 'json',
  }}
/>
```

### Database Query

```tsx
// SQL query with table result
<ToolCallCard
  toolCall={{
    id: 'call_2',
    tool_id: 'db_query',
    tool_name: 'Database Query',
    tool_description: 'Execute SQL query',
    parameters: {
      connection_id: 'db_prod',
      query: 'SELECT * FROM users LIMIT 10'
    },
    status: 'completed',
    duration_ms: 234,
  }}
/>

<ToolResultCard
  result={{
    tool_call_id: 'call_2',
    success: true,
    data: {
      columns: [
        { key: 'id', label: 'ID', type: 'number' },
        { key: 'email', label: 'Email', type: 'string' }
      ],
      rows: [
        { id: 1, email: 'user1@example.com' },
        { id: 2, email: 'user2@example.com' }
      ]
    },
    output_type: 'table',
  }}
/>
```

### Multi-step Workflow

```tsx
// Complex agent workflow
<ToolExecutionTimeline
  workflow={{
    id: 'wf_1',
    description: 'Analyze sales data and generate PDF report',
    status: 'in_progress',
    progress_percent: 66,
    current_step: 2,
    total_steps: 3,
    steps: [
      {
        step_number: 1,
        tool_call: {
          id: 'call_a',
          tool_name: 'Database Query',
          status: 'completed',
          // ...
        },
        result: { success: true, data: [...] }
      },
      {
        step_number: 2,
        tool_call: {
          id: 'call_b',
          tool_name: 'Data Analysis',
          status: 'in_progress',
          // ...
        }
      },
      {
        step_number: 3,
        tool_call: {
          id: 'call_c',
          tool_name: 'Generate PDF',
          status: 'pending',
          // ...
        }
      }
    ]
  }}
/>
```

## Accessibility

- All interactive elements are keyboard accessible
- ARIA labels for screen readers
- Color is not the only indicator (icons + text)
- Focus indicators visible
- Sufficient contrast ratios

## Performance

- Large JSON objects use virtualization
- Table pagination prevents DOM bloat
- Images lazy-loaded
- Expandable sections reduce initial render
- Memoized components prevent unnecessary re-renders

## License

MIT - Part of AGI Workforce Desktop Application
