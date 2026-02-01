# Timeout UI Integration Guide

This document describes the complete timeout UI system integrated into the AGI Workforce desktop application.

## Overview

The timeout UI system monitors long-running tasks and provides visual feedback when tasks approach their timeout limits. It allows users to:

- View real-time task status and remaining time
- Receive timeout warnings at configurable intervals
- Extend timeouts without interrupting execution
- Pause or abort tasks when needed
- Track background task progress

## Architecture

### Components

#### 1. **TimeoutWarningDialog** (`components/Execution/TimeoutWarningDialog.tsx`)

Main modal dialog displayed when a task approaches timeout.

**Features:**

- Displays urgency level (critical, warning, info) with visual indicators
- Shows remaining time in human-readable format
- Displays task progress (executed steps, estimated total)
- Progress bar showing time remaining
- Action buttons: Extend (+30m), Pause, Abort, Continue

**Props:**

```typescript
interface TimeoutWarningDialogProps {
  warning: TimeoutWarningData | null; // Warning data or null
  onDismiss: () => void; // Called when dialog closes
  isOpen: boolean; // Controls dialog visibility
}
```

**Usage:**

```typescript
<TimeoutWarningDialog
  warning={timeoutWarning}
  onDismiss={handleDismissTimeoutWarning}
  isOpen={isTimeoutWarningOpen}
/>
```

#### 2. **TimeoutWarningBanner** (`components/Execution/TimeoutWarningBanner.tsx`)

Compact banner for displaying timeout warning in sidebar or inline.

**Features:**

- Urgent status badges
- Remaining time display
- Quick action buttons (Extend, Dismiss)
- Responsive design

**Props:**

```typescript
interface TimeoutWarningBannerProps {
  taskName: string;
  remainingSeconds: number;
  maxTimeoutMinutes: number;
  onExtend?: () => void;
  onDismiss?: () => void;
  className?: string;
}
```

**Usage:**

```typescript
<TimeoutWarningBanner
  taskName="Data Analysis Task"
  remainingSeconds={1200}
  maxTimeoutMinutes={60}
  onExtend={handleExtendTimeout}
  onDismiss={handleDismissBanner}
/>
```

#### 3. **BackgroundTasksPanel** (`components/BackgroundTasks/BackgroundTasksPanel.tsx`)

Displays all background tasks with their status and progress.

**Features:**

- Task list with status indicators
- Progress bars for active tasks
- Cancel button for running tasks
- Task time tracking
- Empty state when no tasks

**Usage:**

```typescript
<BackgroundTasksPanel maxHeight="400px" onClose={() => setOpen(false)} />
```

### Hooks

#### **useTimeout** (`hooks/useTimeout.ts`)

Custom hook for managing timeout functionality.

**Methods:**

```typescript
const {
  timeoutStatus, // Current timeout status
  isLoading, // Loading state
  error, // Error message
  getTimeoutStatus, // Get timeout status for a task
  extendTimeout, // Extend timeout by N minutes
  pauseTask, // Pause execution
  resumeTask, // Resume execution
  abortTask, // Abort task completely
} = useTimeout();
```

**Example:**

```typescript
const { extendTimeout } = useTimeout();
await extendTimeout('task-123', 30); // Extend by 30 minutes
```

#### **useBackgroundTasks** (`hooks/useBackgroundTasks.ts`)

Hook for managing background task state and operations.

**Methods:**

```typescript
const {
  tasks, // All tasks
  activeTasks, // Running/queued tasks
  activeCount, // Count of active tasks
  isLoading, // Loading state
  error, // Error message
  refreshTasks, // Refresh task list
  cancelTask, // Cancel a task
  getTaskStatus, // Get task status
} = useBackgroundTasks();
```

## Integration Points

### 1. App Component (`src/App.tsx`)

The App component is the entry point for timeout warning events:

```typescript
// Setup timeout warning listener
useEffect(() => {
  const unlisten = await listen<TimeoutWarningData>(
    'agi:timeout_warning',
    (event) => {
      setTimeoutWarning(event.payload);
      setIsTimeoutWarningOpen(true);
    }
  );
  return () => unlisten();
}, []);

// Render dialog
<TimeoutWarningDialog
  warning={timeoutWarning}
  onDismiss={handleDismissTimeoutWarning}
  isOpen={isTimeoutWarningOpen}
/>
```

### 2. DynamicSidecar Component (`src/components/UnifiedAgenticChat/DynamicSidecar.tsx`)

The DynamicSidecar now includes a "tasks" panel type:

```typescript
export type DynamicPanelType =
  | 'terminal'
  | 'browser'
  | 'code'
  | 'video'
  | 'media'
  | 'files'
  | 'data'
  | 'preview'
  | 'diff'
  | 'canvas'
  | 'artifact'
  | 'tasks'  // NEW
  | null;

// Render tasks panel
case 'tasks':
  return <BackgroundTasksPanel className="flex-1" maxHeight="100%" />;
```

**Trigger the tasks panel:**

```typescript
// In chat or elsewhere, emit an event to open tasks panel
setPanelType('tasks');
```

### 3. Settings Integration

Timeout behavior is controlled via ExecutionPreferences in `settingsStore.ts`:

```typescript
export interface ExecutionPreferences {
  maxTimeoutMinutes: number; // Max task duration (1-4320)
  enableCheckpointing: boolean; // Enable progress saving
  checkpointInterval: number; // Steps between checkpoints
  autoResumeOnRestart: boolean; // Resume on app restart
  enableTimeoutWarnings: boolean; // Show timeout warnings
}
```

## Tauri Backend Events

### Emitted Events

The Rust backend emits these events to the frontend:

#### **`agi:timeout_warning`**

Emitted when a task approaches timeout.

```typescript
interface TimeoutWarningData {
  taskId: string;
  taskName: string;
  remainingSeconds: number;
  maxTimeoutMinutes: number;
  executedSteps: number;
  totalEstimatedSteps?: number;
  currentStep?: string;
}
```

#### **`task:progress`**

Emitted for task progress updates.

#### **`task:completed`**

Emitted when a task completes.

#### **`task:failed`**

Emitted when a task fails.

### Tauri Backend Commands

Frontend calls these Tauri commands:

#### **`agi_extend_timeout`**

Extend task timeout.

```typescript
await invoke('agi_extend_timeout', {
  taskId: string,
  additionalMinutes: number,
});
```

#### **`agi_pause_task`**

Pause task execution.

```typescript
await invoke('agi_pause_task', { taskId: string });
```

#### **`agi_resume_task`**

Resume paused task.

```typescript
await invoke('agi_resume_task', { taskId: string });
```

#### **`agi_abort_task`**

Cancel task execution.

```typescript
await invoke('agi_abort_task', { taskId: string });
```

#### **`agi_get_timeout_status`**

Get current timeout status.

```typescript
const status = await invoke<TimeoutStatus>('agi_get_timeout_status', {
  taskId: string,
});
```

#### **`background_task_list`**

Get all background tasks.

```typescript
const tasks = await invoke<BackendTaskResponse[]>('background_task_list');
```

#### **`background_task_cancel`**

Cancel a background task.

```typescript
await invoke('background_task_cancel', { taskId: string });
```

## Data Models

### TimeoutWarningData

```typescript
interface TimeoutWarningData {
  taskId: string;
  taskName: string;
  remainingSeconds: number;
  maxTimeoutMinutes: number;
  executedSteps: number;
  totalEstimatedSteps?: number;
  currentStep?: string;
}
```

### TimeoutStatus

```typescript
interface TimeoutStatus {
  taskId: string;
  taskName: string;
  remainingSeconds: number;
  maxTimeoutMinutes: number;
  executedSteps: number;
  totalEstimatedSteps?: number;
}
```

### BackgroundTask

```typescript
interface BackgroundTask {
  id: string;
  name: string;
  description?: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  priority: 'low' | 'normal' | 'high';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}
```

## Usage Examples

### Example 1: Display timeout warning when approaching limit

```typescript
// In App.tsx
useEffect(() => {
  const unlisten = await listen<TimeoutWarningData>('agi:timeout_warning', (event) => {
    setTimeoutWarning(event.payload);
    setIsTimeoutWarningOpen(true);
  });
  return () => unlisten();
}, []);
```

### Example 2: Extend timeout from warning dialog

```typescript
// In TimeoutWarningDialog.tsx
const handleExtendTimeout = async () => {
  await invoke('agi_extend_timeout', {
    taskId: warning.taskId,
    additionalMinutes: 30,
  });
  toast({ title: 'Timeout extended by 30 minutes' });
  onDismiss();
};
```

### Example 3: Monitor background tasks

```typescript
// In component
const { tasks, activeTasks, activeCount } = useBackgroundTasks();

return (
  <div>
    <p>Active tasks: {activeCount}</p>
    {tasks.map(task => (
      <TaskItem key={task.id} task={task} />
    ))}
  </div>
);
```

### Example 4: Show tasks panel in sidebar

```typescript
// In chat interface
const [sidecarPanel, setSidecarPanel] = useState<DynamicPanelType>(null);

// Show tasks panel
const showTasksPanel = () => setSidecarPanel('tasks');

// Render
<DynamicSidecar panelType={sidecarPanel} onClose={() => setSidecarPanel(null)} />
```

## Visual Design

### Urgency Levels

The UI provides visual feedback based on remaining time:

| Urgency      | Remaining Time | Colors        | Icon                      |
| ------------ | -------------- | ------------- | ------------------------- |
| **Info**     | > 30 minutes   | Blue          | Info circle               |
| **Warning**  | 5-30 minutes   | Yellow/Orange | Alert triangle            |
| **Critical** | < 5 minutes    | Red           | Alert triangle (animated) |

### Components Appearance

**TimeoutWarningDialog:**

- Modal overlay with semi-transparent backdrop
- Animated entrance/exit
- Color-coded urgency indicators
- Progress bar showing time remaining
- Action buttons with clear hierarchy

**TimeoutWarningBanner:**

- Compact inline display
- Can be placed in sidebars or inline panels
- Quick action buttons
- Dismissible

**BackgroundTasksPanel:**

- Scrollable task list
- Status icons with animations
- Progress bars for active tasks
- Cancel buttons
- Time tracking per task

## Testing

### Test Scenarios

1. **Timeout Warning Display**
   - Start long-running task
   - Verify warning appears at timeout threshold
   - Check all data displays correctly

2. **Extend Timeout**
   - Click "Extend Timeout" button
   - Verify remaining time updates
   - Check that task continues

3. **Pause/Resume**
   - Click "Pause" button
   - Verify task status changes
   - Click "Resume" to continue
   - Verify execution resumes

4. **Abort Task**
   - Click "Abort" button
   - Confirm abort
   - Verify task stops and appears as cancelled

5. **Background Tasks**
   - Start multiple tasks
   - Open tasks panel
   - Verify all tasks display with correct status
   - Cancel a task and verify removal

6. **Real-time Updates**
   - Monitor tasks as they execute
   - Verify progress bars update
   - Verify time remaining decreases
   - Verify completion status

## Configuration

### Execution Preferences

Users can configure timeout behavior in Settings:

```typescript
{
  maxTimeoutMinutes: 1440,           // Default 24 hours
  enableCheckpointing: true,
  checkpointInterval: 5,
  autoResumeOnRestart: true,
  enableTimeoutWarnings: true,       // Show warnings
}
```

### Warning Thresholds

The backend typically emits warnings at:

- 1 hour remaining
- 30 minutes remaining
- 5 minutes remaining

These are configurable in the Rust backend.

## Performance Considerations

1. **Polling:** Background tasks poll every 5 seconds when active, automatically stops when idle
2. **Event Listeners:** Use Tauri event system for real-time updates to minimize polling
3. **Memory:** Dialog and banners are only rendered when needed
4. **State Management:** Uses Zustand for efficient state updates

## Troubleshooting

### Timeout warning not appearing

- Check that `agi:timeout_warning` events are being emitted from backend
- Verify listener is setup in App component
- Check browser DevTools for event firing
- Ensure `enableTimeoutWarnings` is true in settings

### Tasks not displaying

- Verify `background_task_list` command is implemented in Rust
- Check that tasks are being added to the store
- Verify WebSocket events are properly emitted
- Check browser console for errors

### Extend timeout not working

- Verify `agi_extend_timeout` command exists in Rust backend
- Check that task ID is valid
- Verify user has permission to modify task
- Check console for error messages

## Files Modified

1. `src/components/Execution/TimeoutWarningDialog.tsx` - NEW
2. `src/components/Execution/TimeoutWarningBanner.tsx` - NEW
3. `src/components/Execution/index.ts` - UPDATED
4. `src/components/UnifiedAgenticChat/DynamicSidecar.tsx` - UPDATED
5. `src/App.tsx` - UPDATED
6. `src/hooks/useTimeout.ts` - NEW

## Future Enhancements

1. **Timeout Presets:** Save favorite timeout durations
2. **Auto-extend:** Automatically extend based on patterns
3. **Notifications:** Desktop notifications for timeout warnings
4. **History:** Track timeout extensions for analysis
5. **Recommendations:** AI-suggested timeout based on task type
6. **Checkpointing:** More granular checkpoint intervals
7. **Recovery:** Better resumption after pauses
