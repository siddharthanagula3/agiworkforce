# AGI Workforce Hook Examples

This directory contains example hooks that demonstrate the hook system's capabilities.

## What are Hooks?

Hooks are scripts or commands that automatically run in response to specific events in the AGI Workforce system. They enable:
- Custom logging and analytics
- CI/CD integration
- External notifications
- Pre/post-processing workflows
- Audit trails

## Available Events

The hook system supports 14 event types:

### Session Events
- **SessionStart** - Triggered when a new session begins
- **SessionEnd** - Triggered when a session ends

### Tool Events
- **PreToolUse** - Triggered before a tool is executed
- **PostToolUse** - Triggered after a tool successfully executes
- **ToolError** - Triggered when a tool execution fails

### Step Events
- **StepStart** - Triggered when a plan step begins
- **StepCompleted** - Triggered when a plan step completes successfully
- **StepError** - Triggered when a plan step fails

### Goal Events
- **GoalStart** - Triggered when a goal is initiated
- **GoalCompleted** - Triggered when a goal is completed successfully
- **GoalError** - Triggered when a goal fails

### User Interaction Events
- **UserPromptSubmit** - Triggered when a user submits a prompt

### Approval Events
- **ApprovalRequired** - Triggered when user approval is requested
- **ApprovalGranted** - Triggered when approval is granted
- **ApprovalDenied** - Triggered when approval is denied

## Hook Configuration

Hooks are configured in `~/.agiworkforce/hooks.yaml`:

```yaml
hooks:
  - name: "Hook Name"
    events: [SessionStart, SessionEnd]
    priority: 10  # 1-100, lower = higher priority
    command: "path/to/script.sh"  # or "node script.js", etc.
    enabled: true
    timeout_secs: 30
    continue_on_error: true
    env:
      CUSTOM_VAR: "value"
    working_dir: "/path/to/workdir"  # optional
```

## Environment Variables

Hooks receive event data through environment variables:

- `HOOK_EVENT_JSON` - Full event data in JSON format
- `HOOK_EVENT_TYPE` - Event type (e.g., "SessionStart")
- `HOOK_SESSION_ID` - Unique session identifier

## Example Hooks

### 1. Simple Logger (`log-all-events.sh`)
Logs all events to a file with timestamps.

### 2. Tool Usage Tracker (`track-tool-usage.js`)
Tracks and analyzes tool usage patterns.

### 3. Session Report Generator (`session-report.sh`)
Generates a report when a session ends.

### 4. Slack Notifier (`notify-slack.js`)
Sends notifications to Slack for specific events.

### 5. Pre-commit Validator (`pre-commit-hook.sh`)
Runs linting and type-checking on SessionEnd.

## Testing Hooks

You can test hooks using the Tauri commands:

```typescript
// Initialize hooks
await invoke('hooks_initialize');

// List all hooks
const hooks = await invoke('hooks_list');

// Add a hook
await invoke('hooks_add', {
  hook: {
    name: "Test Hook",
    events: ["SessionStart"],
    priority: 50,
    command: "echo 'Session started!'",
    enabled: true,
    timeout_secs: 30,
    continue_on_error: true
  }
});

// Toggle a hook
await invoke('hooks_toggle', { name: "Test Hook", enabled: false });

// Remove a hook
await invoke('hooks_remove', { name: "Test Hook" });
```

## Best Practices

1. **Keep hooks fast** - Use timeout_secs to prevent hanging
2. **Handle errors gracefully** - Set continue_on_error: true for non-critical hooks
3. **Use priority wisely** - Lower numbers = higher priority
4. **Test thoroughly** - Test hooks in isolation before deploying
5. **Log appropriately** - Use stderr for errors, stdout for results
6. **Be secure** - Validate all inputs, avoid executing untrusted code
