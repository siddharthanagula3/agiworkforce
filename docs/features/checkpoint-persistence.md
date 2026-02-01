# AGI Task Checkpoint Persistence

## Overview

The checkpoint persistence system enables long-running AGI tasks to be paused, interrupted, and resumed without losing progress. All execution state is automatically saved at configurable intervals, allowing tasks to recover from failures or user interruptions.

## Architecture

### Core Components

#### 1. Checkpoint Model (`checkpoint.rs`)

- Immutable snapshot of execution state at a specific step
- Contains goal, current_step, completed_steps, tool_results, context_memory
- Includes metadata: progress_percent, elapsed_time_ms, estimated_remaining_ms
- Supports branching via optional parent_checkpoint_id

#### 2. Checkpoint Store (`checkpoint_store.rs`)

- SQLite persistence layer
- Atomic checkpoint creation with transactional guarantees
- Efficient querying via indices on task_id and created_at_ms
- Automatic WAL mode for concurrent access

#### 3. Checkpoint Manager (`checkpoint_manager.rs`)

- Orchestrates checkpoint lifecycle
- Determines when to save (interval, timeout, pause, explicit)
- Handles task resumption from checkpoints
- Tracks execution metrics (elapsed_time, tool_calls, failures)

#### 4. Tauri Commands (`agi_checkpoint.rs`)

- User-facing API endpoints
- Async command dispatch
- Error translation to user-friendly messages

### Database Schema

```sql
-- Task tracking
CREATE TABLE agi_tasks (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER,
  created_at TEXT NOT NULL
);

-- Checkpoint storage
CREATE TABLE agi_task_checkpoints (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  goal_json TEXT NOT NULL,
  current_step INTEGER NOT NULL,
  completed_steps_json TEXT NOT NULL,
  current_state_json TEXT NOT NULL,
  tool_results_json TEXT NOT NULL,
  context_memory_json TEXT NOT NULL,
  available_resources_json TEXT NOT NULL,
  checkpoint_reason TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  total_steps INTEGER NOT NULL,
  progress_percent REAL NOT NULL,
  elapsed_time_ms INTEGER NOT NULL,
  estimated_remaining_ms INTEGER,
  tool_calls_executed INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_error_message TEXT,
  is_latest BOOLEAN NOT NULL DEFAULT 1,
  parent_checkpoint_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(task_id) REFERENCES agi_tasks(id),
  FOREIGN KEY(parent_checkpoint_id) REFERENCES agi_task_checkpoints(id)
);

-- Restore history
CREATE TABLE agi_checkpoint_restore_history (
  id TEXT PRIMARY KEY,
  checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  restored_at_ms INTEGER NOT NULL,
  resumed_steps INTEGER NOT NULL DEFAULT 0,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  restored_at TEXT NOT NULL,
  FOREIGN KEY(checkpoint_id) REFERENCES agi_task_checkpoints(id),
  FOREIGN KEY(task_id) REFERENCES agi_tasks(id)
);
```

### Indices

- `idx_agi_checkpoints_task_id`: Fast lookup by task
- `idx_agi_checkpoints_latest`: Fast retrieval of latest checkpoint
- `idx_agi_checkpoints_created`: Chronological ordering

## Configuration

```rust
pub struct CheckpointConfig {
  // Save checkpoint after every N completed steps (default: 5)
  pub checkpoint_interval_steps: usize,

  // Save when this many seconds remain before timeout (default: 30)
  pub timeout_checkpoint_threshold_secs: u64,

  // Maximum checkpoints to keep per task (default: 50)
  pub max_checkpoints_per_task: usize,

  // Enable automatic cleanup of old checkpoints (default: true)
  pub enable_checkpoint_cleanup: bool,

  // Max context memory items in checkpoint (default: 500)
  pub max_context_memory_items: usize,

  // Max tool results in checkpoint (default: 200)
  pub max_tool_results_items: usize,
}
```

## Checkpoint Reasons

Checkpoints are created for different reasons:

- **Interval**: Regular interval-based save (every N steps)
- **UserPaused**: User explicitly paused execution
- **TimeoutApproaching**: Task approaching timeout deadline
- **ExplicitSave**: User or system requested explicit save
- **ErrorRecovery**: Saving state after error for recovery
- **TaskComplete**: Task completed successfully

## Usage

### Rust (Backend)

#### Initialize Checkpoint System

```rust
use crate::core::agi::{CheckpointStore, CheckpointManager, CheckpointConfig};
use std::sync::Arc;

// Create store and manager
let store = Arc::new(CheckpointStore::new("/path/to/db")?);
store.init().await?;

let config = CheckpointConfig::default();
let manager = CheckpointManager::new(store, config);
```

#### Create a Checkpoint

```rust
use crate::core::agi::{CheckpointReason, CreateCheckpointRequest};

let checkpoint = manager.create_checkpoint(
  task_id,
  &execution_context,
  current_step,
  completed_steps,
  CheckpointReason::Interval,
  total_steps,
  &metrics,
  None, // parent_checkpoint_id
).await?;

println!("Created checkpoint: {}", checkpoint.id);
```

#### Resume from Checkpoint

```rust
let resumable = manager.resume_from_checkpoint(checkpoint_id).await?;

// Restore context and skip already-completed steps
let context = resumable.context;
let skip_steps = resumable.skip_steps;
```

#### Track Execution Metrics

```rust
use crate::core::agi::{CheckpointedExecution, ExecutionMetrics};
use std::time::Duration;

let checkpointed = CheckpointedExecution::new(
  manager.clone(),
  task_id.to_string(),
  Some(Duration::from_secs(300)), // 5 minute timeout
);

// During execution:
for step in plan.steps {
  checkpointed.record_tool_call().await;

  // Execute step...
  let error = None;
  checkpointed.record_step_completed(error).await;

  // Check if checkpoint should be created
  if let Some(cp) = checkpointed.maybe_checkpoint(
    &context,
    current_step,
    completed_steps.clone(),
    plan.steps.len(),
    CheckpointReason::Interval,
  ).await? {
    println!("Checkpoint saved: {}", cp.id);
  }
}
```

### TypeScript (Frontend)

#### Save a Checkpoint

```typescript
import { saveCheckpoint } from '@/api/agi_checkpoint';

const checkpoint = await saveCheckpoint({
  task_id: 'task-123',
  goal_id: 'goal-1',
  goal_description: 'Build a website',
  current_step: 5,
  completed_steps: [0, 1, 2, 3, 4],
  total_steps: 10,
  elapsed_time_ms: 30000,
  tool_calls_executed: 15,
  failure_count: 2,
  reason: 'interval',
});
```

#### List Checkpoints

```typescript
import { listCheckpoints } from '@/api/agi_checkpoint';

const response = await listCheckpoints('task-123');
console.log(`Found ${response.checkpoints.length} checkpoints`);

response.checkpoints.forEach((cp) => {
  console.log(`${cp.current_step}/${cp.total_steps} - ${cp.progress_percent.toFixed(1)}%`);
});
```

#### Resume from Checkpoint

```typescript
import { getLatestCheckpoint, recordRestore } from '@/api/agi_checkpoint';

const latest = await getLatestCheckpoint('task-123');
if (latest) {
  console.log(`Can resume from step ${latest.current_step}`);

  // Restore execution state
  const context = latest.context;
  const skipSteps = latest.completed_steps;

  // Record the restore event
  await recordRestore(latest.id, 'task-123', skipSteps.length);
}
```

### React Hook

#### useCheckpoints

```typescript
import { useCheckpoints } from '@/hooks/useCheckpoints';

function MyComponent() {
  const { state, actions } = useCheckpoints({
    taskId: 'task-123',
    autoRefresh: true,
    refreshInterval: 5000,
  });

  const handleSaveCheckpoint = async () => {
    const checkpoint = await actions.saveCheckpoint({
      task_id: 'task-123',
      // ... other params
    });
  };

  return (
    <div>
      <p>Checkpoints: {state.checkpoints.length}</p>
      <p>Latest: {state.latestCheckpoint?.id || 'None'}</p>
      {state.error && <p className="error">{state.error}</p>}
    </div>
  );
}
```

#### useCheckpointResume

```typescript
import { useCheckpointResume } from '@/hooks/useCheckpoints';

function ResumeComponent() {
  const { resumableCheckpoint, hasResumable, resume } = useCheckpointResume('task-123');

  if (!hasResumable) return null;

  return (
    <button onClick={() => resume(resumableCheckpoint!)}>
      Resume from step {resumableCheckpoint?.current_step}
    </button>
  );
}
```

### UI Component

#### CheckpointManager

```tsx
import { CheckpointManager } from '@/components/Execution/CheckpointManager';

function TaskExecution() {
  return (
    <CheckpointManager
      taskId="task-123"
      goalDescription="Build a website"
      onResumeClick={(checkpointId) => {
        console.log(`Resuming from: ${checkpointId}`);
      }}
      autoRefresh={true}
    />
  );
}
```

## Persistence Strategy

### When Checkpoints are Created

1. **Regular Interval** (every N steps)
   - Default: every 5 steps
   - Configurable via `checkpoint_interval_steps`

2. **User Pause**
   - Created when user clicks pause button
   - Captures full state for smooth resumption

3. **Timeout Approaching**
   - When remaining time < threshold (default: 30s)
   - Ensures state is saved before timeout

4. **Explicit Save**
   - User or system requests immediate save
   - e.g., before risky operations

5. **Error Recovery**
   - Automatically saved on errors
   - Enables recovery and analysis

6. **Task Complete**
   - Final checkpoint when task succeeds
   - For auditing and analytics

### Cleanup Strategy

- Only latest checkpoint is marked `is_latest=1`
- Old checkpoints kept for history (up to `max_checkpoints_per_task`)
- Automatic cleanup enabled by default
- Manual cleanup via `cleanup_checkpoints(task_id, keep_count)`

## Recovery Guarantees

### Atomicity

- Checkpoint writes wrapped in SQLite transactions
- Either fully saved or fully rolled back
- Previous `is_latest` state updated atomically

### Durability

- SQLite with WAL mode for crash resistance
- Fsync on checkpoint commits
- Persistent across application restarts

### Consistency

- Restored state validated before resumption
- Foreign key constraints enforced
- Tool results and context memory preserved

### Isolation

- Concurrent checkpoint operations don't interfere
- Each checkpoint immutable after creation
- Separate restore history table for tracking

## Performance Considerations

### Storage

- Typical checkpoint: 50-200 KB (small tasks)
- Large tasks with many tool results: up to 5 MB
- Recommended: 50 checkpoints × 200 KB = 10 MB per task

### Query Performance

- Latest checkpoint retrieval: O(1) via is_latest index
- Task checkpoints list: O(log n) via task_id index
- Cleanup operation: O(m) where m = old checkpoint count

### Memory Impact

- Checkpoints created asynchronously
- State snapshots use JSON serialization
- Context memory truncated at 500 items

## Best Practices

1. **Configure intervals based on task complexity**
   - Fast tasks: 10 steps
   - Medium tasks: 5 steps
   - Slow tasks: 3 steps

2. **Monitor checkpoint sizes**
   - Use CheckpointMetadata.progress_summary for logging
   - Track tool_calls_executed and failure_count

3. **Test resumption logic**
   - Verify skip_steps are handled correctly
   - Ensure tool results not re-executed
   - Check context_memory restoration

4. **Handle recovery gracefully**
   - Show "Resume interrupted task" UI prominently
   - Provide estimated time to completion
   - Allow branching from old checkpoints

5. **Regular cleanup**
   - Run cleanup after task completion
   - Keep only recent checkpoints in production
   - Archive important checkpoints separately

## Error Handling

### Common Errors

| Error                        | Cause                          | Resolution                        |
| ---------------------------- | ------------------------------ | --------------------------------- |
| "Checkpoint not found"       | ID invalid or deleted          | Use get_latest_checkpoint instead |
| "Failed to parse checkpoint" | Corruption or version mismatch | Delete and restart task           |
| "Timeout approaching"        | Task running too slow          | Extend timeout or optimize task   |
| "Restore failed"             | State incompatible             | Check tool execution logs         |

### Logging

Enable debug logging to track checkpoint operations:

```rust
// In Rust code
tracing::debug!("Saving checkpoint {}", checkpoint.id);
tracing::info!("Resumed from checkpoint {}", checkpoint_id);
tracing::warn!("Cleanup removed {} old checkpoints", deleted_count);
```

## Examples

### Full Execution Loop with Checkpointing

```rust
// Initialize
let checkpointed_exec = CheckpointedExecution::new(
  manager.clone(),
  task_id.to_string(),
  Some(Duration::from_secs(600)), // 10 min timeout
);

// Execute plan
for (step_idx, step) in plan.steps.iter().enumerate() {
  // Check if we've timed out
  if checkpointed_exec.has_timed_out().await {
    // Create final checkpoint and exit
    checkpointed_exec.maybe_checkpoint(
      &context,
      step_idx,
      completed_steps.clone(),
      plan.steps.len(),
      CheckpointReason::TimeoutApproaching,
    ).await?;
    break;
  }

  // Record tool call
  checkpointed_exec.record_tool_call().await;

  // Execute the step
  match execute_step(&step, &context).await {
    Ok(result) => {
      context.tool_results.push(result);
      completed_steps.push(step_idx);
      checkpointed_exec.record_step_completed(None).await;
    }
    Err(e) => {
      let error_str = e.to_string();
      checkpointed_exec.record_step_completed(Some(error_str)).await;

      // Create error recovery checkpoint
      checkpointed_exec.maybe_checkpoint(
        &context,
        step_idx,
        completed_steps.clone(),
        plan.steps.len(),
        CheckpointReason::ErrorRecovery,
      ).await?;

      // Handle recovery...
    }
  }

  // Regular checkpoint
  if let Some(_cp) = checkpointed_exec.maybe_checkpoint(
    &context,
    step_idx + 1,
    completed_steps.clone(),
    plan.steps.len(),
    CheckpointReason::Interval,
  ).await? {
    // Checkpoint created
  }
}
```

### UI: Resume Task on App Start

```tsx
function AppStart() {
  const { resumableCheckpoint, hasResumable, resume } = useCheckpointResume('current-task');

  if (!hasResumable) {
    return <CreateNewTask />;
  }

  return (
    <div className="p-6">
      <h1>Welcome Back!</h1>
      <CheckpointResume checkpoint={resumableCheckpoint!} />
      <button onClick={() => resume(resumableCheckpoint!)}>Continue Task</button>
      <button onClick={() => CreateNewTask()}>Start New Task</button>
    </div>
  );
}
```

## Migration Guide

### From v52 to v53

The migration automatically creates the necessary tables:

```sql
-- Runs automatically on app startup
CREATE TABLE agi_tasks (...)
CREATE TABLE agi_task_checkpoints (...)
CREATE TABLE agi_checkpoint_restore_history (...)
```

No manual migration needed. Checkpoints start working automatically.

## Future Enhancements

1. **Checkpoint branching**: Support alternative execution paths from old checkpoints
2. **Checkpoint compression**: Gzip large context_memory before storage
3. **Distributed checkpoints**: Cloud backup of important checkpoints
4. **Checkpoint recovery**: Automatic attempt to recover from last checkpoint on error
5. **ML model checkpoints**: Support for model state in checkpoints
6. **Checkpoint diffing**: Show what changed between checkpoints
7. **Parallel task checkpoints**: Track multiple concurrent task executions

## FAQ

**Q: How much storage do checkpoints use?**
A: Typical checkpoint ~100 KB, large tasks ~1 MB. Configure max_checkpoints_per_task to limit.

**Q: Can I resume from any checkpoint?**
A: Yes! But resuming from old checkpoints may skip important context. Latest is recommended.

**Q: What happens if a checkpoint is corrupted?**
A: Delete it and resume from the previous one, or restart the task fresh.

**Q: How do I know if a task can be resumed?**
A: Use getLatestCheckpoint() - returns null if no resumable checkpoint exists.

**Q: Can I manually create checkpoints?**
A: Yes! Use saveCheckpoint with CheckpointReason::ExplicitSave.

## See Also

- [AGI Architecture](./agi-architecture.md)
- [Agent Mode](./agent-mode.md)
- [Undo System](./undo-system.md)
