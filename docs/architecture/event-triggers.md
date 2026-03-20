# Event Triggers Architecture

_Updated: 2026-03-19 | Wave 5 Feature_

## Overview

Event triggers enable automatic agent execution in response to external events. The system supports multiple trigger sources:
- **Cron**: Scheduled recurring execution (standard 5-field or 6-field cron syntax)
- **Webhooks**: Inbound HTTP endpoints (Slack, GitHub, Linear, custom)
- **File Watchers**: Local filesystem changes with debouncing
- **Integrations**: Slack messages, GitHub issues/PRs, Linear tasks

## Architecture

### Core Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `TriggerRegistry` | `core/agent/triggers.rs` | Manages all active triggers in memory |
| `TriggerType` | `packages/types/event-triggers.ts` | Discriminant enum (cron, webhook, slack, github, linear, file_watcher) |
| `EventTriggerDefinition` | `packages/types/event-triggers.ts` | Full trigger configuration with metadata |
| Tauri Commands | `core/agent/triggers.rs` (bottom) | register_trigger, unregister_trigger, list_triggers, toggle_trigger |

### Execution Flow

```
External Event → TriggerRegistry.execute_trigger()
                 ↓
            Emit Tauri event (frontend UI notified)
                 ↓
            Background agent system spawns new session
                 ↓
            Optional approval gate (if configured)
                 ↓
            Agent execution with configurable timeout
```

### Background Task Management

- **Cron polling**: Dedicated `tokio::task` checks schedules at 60-second intervals
- **Webhook server**: Localhost HTTP server (port configurable) listens for inbound events
- **File watchers**: `notify` crate with configurable debounce duration (default: 500ms)
- **Graceful shutdown**: All tasks joined and cleaned up in `TriggerRegistry.stop()`

## Trigger Configuration

Each trigger type has a discriminant in `TriggerConfig` union:

### Cron Trigger
```typescript
{
  type: 'cron',
  schedule: '0 9 * * MON-FRI',  // 9am weekdays
  description: 'Weekly standup reminder',
  agentPrompt: 'Summarize pending tasks for standup',
  approvable: false  // Auto-execute
}
```

### Webhook Trigger
```typescript
{
  type: 'webhook',
  path: '/webhooks/github-pr',  // Registered as /webhooks/github-pr on localhost
  description: 'Auto-review GitHub PRs',
  agentPrompt: 'Review this PR for code quality',
  approvable: true,  // User approval required
  timeoutSeconds: 60
}
```

### File Watcher Trigger
```typescript
{
  type: 'file_watcher',
  watchPath: '/path/to/project/inbox',
  description: 'Process new inbox items',
  agentPrompt: 'Process this file and file it',
  debounceMs: 500
}
```

### Slack / GitHub / Linear Triggers
Similar structure with platform-specific config (channel ID, repository, etc.)

## Frontend Integration

- **Dashboard**: List/enable/disable triggers, view execution history
- **Event listeners**: Subscribe to `trigger:executed`, `trigger:failed`, `trigger:queued` events
- **Approval UI**: Modal overlay when `approvable: true` and trigger fires
- **Execution monitor**: Real-time log stream for running trigger agents

## Security Considerations

1. **Approval gates**: Dangerous agents can require user approval before execution
2. **Webhook validation**: HMAC-SHA256 signature verification for GitHub/Slack events
3. **Rate limiting**: Per-trigger execution rate limiting to prevent abuse
4. **Timeout enforcement**: `timeoutSeconds` cap prevents runaway agents
5. **Sandboxing**: All agents run in isolated session context

## Future Enhancements

- WebRTC-based remote triggers (cross-device)
- Conditional execution (if-then-else chains)
- Trigger chaining (one trigger spawns another)
- Advanced filtering (event body pattern matching)
- Execution history analytics
