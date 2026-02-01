# Timeout UI - Quick Reference Card

## What Was Implemented

Complete timeout monitoring and management UI for long-running AGI tasks.

## File Locations

### New Components

```
apps/desktop/src/components/Execution/
├── TimeoutWarningDialog.tsx      (Modal dialog for timeout warnings)
├── TimeoutWarningBanner.tsx      (Inline banner for quick warnings)
└── __tests__/TimeoutWarningDialog.test.tsx

apps/desktop/src/hooks/
└── useTimeout.ts                 (Timeout management hook)
```

### Documentation

```
apps/desktop/TIMEOUT_UI_INTEGRATION.md         (Full technical guide)
TIMEOUT_UI_IMPLEMENTATION_SUMMARY.md           (What was done)
TIMEOUT_UI_QUICK_REFERENCE.md                  (This file)
```

### Modified Files

```
apps/desktop/src/
├── App.tsx                       (Added timeout listener and dialog)
├── components/Execution/index.ts (Export new components)
└── components/UnifiedAgenticChat/DynamicSidecar.tsx (Added 'tasks' panel)
```

## Component APIs

### TimeoutWarningDialog

```typescript
<TimeoutWarningDialog
  warning={timeoutWarningData}        // TimeoutWarningData | null
  onDismiss={() => handleDismiss()}  // Called when dialog closes
  isOpen={isOpen}                     // Boolean
/>
```

### TimeoutWarningBanner

```typescript
<TimeoutWarningBanner
  taskName="Task Name"
  remainingSeconds={1200}
  maxTimeoutMinutes={60}
  onExtend={() => handleExtend()}
  onDismiss={() => handleDismiss()}
  className="custom-class"
/>
```

### useTimeout Hook

```typescript
const {
  timeoutStatus, // Current timeout info
  isLoading, // Loading state
  error, // Error message
  getTimeoutStatus, // Get timeout for task
  extendTimeout, // Extend by N minutes
  pauseTask, // Pause task
  resumeTask, // Resume task
  abortTask, // Abort task
} = useTimeout();
```

### useBackgroundTasks Hook

```typescript
const {
  tasks, // All tasks
  activeTasks, // Running/queued tasks
  activeCount, // Count of active tasks
  isLoading, // Loading state
  refreshTasks, // Refresh task list
  cancelTask, // Cancel a task
} = useBackgroundTasks();
```

## Show Tasks Panel

```typescript
// In any component using DynamicSidecar:
const [panelType, setPanelType] = useState<DynamicPanelType>(null);

// Show tasks
const showTasks = () => setPanelType('tasks');

// Render
<DynamicSidecar panelType={panelType} onClose={() => setPanelType(null)} />
```

## Tauri Backend Integration

### Events (Listened To)

```typescript
// Timeout warning
listen<TimeoutWarningData>('agi:timeout_warning', (event) => {
  // Handle: taskId, taskName, remainingSeconds, etc.
});

// Task progress
listen<TaskProgressEvent>('task:progress', (event) => {
  // Handle task progress updates
});

// Task completion
listen<TaskProgressEvent>('task:completed', (event) => {
  // Handle completion
});
```

### Commands (Invoked)

```typescript
// Extend timeout
await invoke('agi_extend_timeout', {
  taskId: string,
  additionalMinutes: number,
});

// Pause task
await invoke('agi_pause_task', { taskId: string });

// Resume task
await invoke('agi_resume_task', { taskId: string });

// Abort task
await invoke('agi_abort_task', { taskId: string });

// Get timeout status
const status = await invoke('agi_get_timeout_status', { taskId });

// List background tasks
const tasks = await invoke('background_task_list');

// Cancel a task
await invoke('background_task_cancel', { taskId });
```

## Visual States

### Urgency Levels

| Level    | Time    | Colors | Icon |
| -------- | ------- | ------ | ---- |
| Info     | > 30min | Blue   | ℹ    |
| Warning  | 5-30min | Yellow | ⚠    |
| Critical | < 5min  | Red    | 🚨   |

## Data Types

### TimeoutWarningData

```typescript
{
  taskId: string;
  taskName: string;
  remainingSeconds: number;
  maxTimeoutMinutes: number;
  executedSteps: number;
  totalEstimatedSteps?: number;
  currentStep?: string;
}
```

### BackgroundTask

```typescript
{
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

## Common Tasks

### 1. Listen for Timeout Warnings (App.tsx)

```typescript
useEffect(() => {
  const unlisten = await listen<TimeoutWarningData>('agi:timeout_warning', (event) => {
    setTimeoutWarning(event.payload);
    setIsTimeoutWarningOpen(true);
  });
  return () => unlisten();
}, []);
```

### 2. Extend Timeout

```typescript
const { extendTimeout } = useTimeout();
const success = await extendTimeout('task-id', 30); // 30 more minutes
```

### 3. Monitor Active Tasks

```typescript
const { activeTasks, activeCount } = useBackgroundTasks();
console.log(`${activeCount} tasks running`);
```

### 4. Cancel a Task

```typescript
const { cancelTask } = useBackgroundTasks();
await cancelTask('task-id');
```

### 5. Show Tasks Sidebar

```typescript
// In chat component
const [sidecarType, setSidecarType] = useState<DynamicPanelType>(null);

// Show tasks
setSidecarType('tasks');

// Render
<DynamicSidecar panelType={sidecarType} />
```

## Testing

```bash
# Run timeout tests
pnpm test src/components/Execution/__tests__/TimeoutWarningDialog.test.tsx

# Run all tests
pnpm test

# Watch mode
pnpm test --watch
```

## Performance Tips

1. **Use Polling Wisely**: Background tasks auto-poll every 5s when active
2. **Minimize Renders**: Use useShallow() for store selectors
3. **Cleanup Listeners**: Always unlisten on unmount
4. **Debounce Events**: Consider debouncing frequent updates
5. **Lazy Load**: Dialog only renders when open

## Troubleshooting

| Issue                | Cause                    | Solution                                       |
| -------------------- | ------------------------ | ---------------------------------------------- |
| Dialog not showing   | Event not emitted        | Check Rust backend emits `agi:timeout_warning` |
| Tasks not displaying | Command not implemented  | Verify `background_task_list` exists in Rust   |
| Extend not working   | Command not implemented  | Verify `agi_extend_timeout` exists in Rust     |
| Memory leak          | Listeners not cleaned up | Check useEffect cleanup functions              |
| State mismatch       | Missing sync             | Refresh after backend actions                  |

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 15+
- Edge 90+
- Tauri (Electron-based)

## Keyboard Shortcuts

- `Tab` - Navigate between buttons
- `Enter` - Activate focused button
- `Escape` - Close dialog/banner
- `Shift+Tab` - Reverse navigation

## Accessibility

- Semantic HTML with proper ARIA labels
- Full keyboard navigation
- Focus management
- Color not as only indicator
- Clear language and descriptions

## Next Steps

1. **Backend Implementation**: Implement Tauri commands listed above
2. **Event Emissions**: Ensure backend emits timeout warning events
3. **Testing**: Run test suite to verify UI works
4. **Deployment**: Deploy with backend changes
5. **Monitoring**: Watch for any edge cases in production

## Resources

- Full docs: `apps/desktop/TIMEOUT_UI_INTEGRATION.md`
- Implementation: `TIMEOUT_UI_IMPLEMENTATION_SUMMARY.md`
- Components: `src/components/Execution/Timeout*.tsx`
- Hook: `src/hooks/useTimeout.ts`
- Tests: `src/components/Execution/__tests__/TimeoutWarningDialog.test.tsx`

## Support

For questions or issues:

1. Check documentation files
2. Review component JSDoc comments
3. Look at test examples
4. Check browser DevTools console for errors
