# Agent Mode (AGI)

Agent Mode enables autonomous task completion through natural language goals.

## Overview

When Agent Mode is enabled, the AI operates with full autonomy:

1. **Understand**: Parse the user's goal
2. **Plan**: Create an execution plan
3. **Execute**: Perform actions with tools
4. **Reflect**: Learn from outcomes
5. **Iterate**: Adjust and continue until goal is achieved

## Enabling Agent Mode

### Toggle in UI

Click the Agent Mode toggle in chat settings.

### Always On

Enable "Always Use Agent Mode" in Settings → Agent Settings.

### Via Zustand Store

```typescript
useSettingsStore.getState().setAlwaysUseAgentMode(true);
```

## How It Works

### Goal Execution Flow

```
User: "Research the top JavaScript frameworks"
     |
     v
Planner creates subtasks:
  1. Search for framework comparisons
  2. Analyze each framework
  3. Compile pros/cons
  4. Format summary
     |
     v
Executor runs each subtask:
  - Uses MCP tools (browser, search)
  - Writes intermediate results
  - Handles errors with retry
     |
     v
Reflection evaluates progress:
  - Goal achieved? → Complete
  - Partial success? → Adjust plan
  - Failed? → Try alternative approach
```

### Safety Limits

| Limit                | Value     | Purpose                  |
| -------------------- | --------- | ------------------------ |
| Max Iterations       | 1000      | Prevent infinite loops   |
| Timeout              | 5 minutes | Limit execution time     |
| Consecutive Failures | 3         | Trigger goal abandonment |
| Max Thinking Tokens  | 64k       | Limit reasoning depth    |

### Events

```typescript
// Listen for AGI events
import { listen } from '@tauri-apps/api/event';

listen('agi:goal:timeout', () => {
  console.log('Goal timed out');
});

listen('agi:goal:max_iterations', () => {
  console.log('Max iterations reached');
});

listen('agi:goal:cancelled', () => {
  console.log('Goal was cancelled');
});
```

## Undo System

**All AGI actions are reversible.** This is how we enable full autonomy safely.

### Reversibility Matrix

| Action             | Reversible | Method                |
| ------------------ | ---------- | --------------------- |
| File edit          | Yes        | Restore original      |
| File create        | Yes        | Delete file           |
| File delete        | Yes        | Restore from snapshot |
| Terminal command   | Partial    | Depends on command    |
| Browser navigation | Yes        | Navigate back         |
| Form submission    | No         | Requires confirmation |

### Undo Command

```typescript
// In chat: "undo that" or "revert the last change"

// Programmatically
await invoke('undo_last_action', { goalId });
```

### Undo Action Types

```typescript
type UndoableAction =
  | { type: 'file_edit'; path: string; before: string; after: string }
  | { type: 'file_create'; path: string; content: string }
  | { type: 'file_delete'; path: string; content: string }
  | { type: 'terminal_command'; command: string; output: string }
  | { type: 'browser_navigation'; from: string; to: string }
  | { type: 'setting_change'; key: string; before: any; after: any };
```

## Available Tools

AGI has access to these tool categories:

### File Operations

- Read files
- Write files
- Search files
- Delete files (reversible)

### Browser

- Navigate URLs
- Click elements
- Fill forms
- Take screenshots

### Terminal

- Execute commands
- Read output
- Handle errors

### MCP Tools

- Supabase queries
- GitHub operations
- Custom tools

## Settings

| Setting               | Default | Description             |
| --------------------- | ------- | ----------------------- |
| Always Use Agent Mode | false   | Enable for all chats    |
| Max Iterations        | 1000    | Goal iteration limit    |
| Timeout               | 300s    | Goal timeout in seconds |

## Example Goals

### Research Task

```
"Research the pros and cons of React vs Vue vs Angular
and create a comparison document"
```

### Code Task

```
"Create a REST API endpoint for user registration
with email validation and password hashing"
```

### Automation Task

```
"Find all TODO comments in the codebase
and create GitHub issues for each one"
```

## Monitoring Progress

### Status Trail

The StatusTrail component shows real-time progress:

- Current task
- Completed subtasks
- Errors encountered
- Time elapsed

### Checkpoints

CheckpointManager allows:

- Viewing all changes
- Undoing specific actions
- Reverting entire goals

## Best Practices

1. **Be specific**: Clear goals lead to better results
2. **Start small**: Test with simple tasks first
3. **Review changes**: Check the undo log for modifications
4. **Set reasonable limits**: Adjust timeout for complex tasks

## Related Documentation

- [Undo System Architecture](../../ARCHITECTURE.md#undo-system-architecture)
- [Chat Interface](chat.md)
- [MCP Integration](mcp.md)
