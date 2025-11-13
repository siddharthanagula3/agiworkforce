# Execution Dashboard

A comprehensive visual execution dashboard for the AGI Workforce desktop app, providing real-time transparency into AI agent execution. Inspired by Cursor Composer's execution visibility.

## Overview

The Execution Dashboard displays real-time progress across 4 specialized views:
1. **Thinking Tab** - LLM reasoning with streaming output
2. **Terminal Tab** - Command execution with xterm.js
3. **Browser Tab** - Browser automation preview
4. **Files Tab** - File changes with Monaco diff viewer

## Architecture

### Components

```
execution/
├── ExecutionDashboard.tsx    # Main dashboard with tabbed interface
├── ThinkingPanel.tsx          # Shows planning steps and LLM reasoning
├── TerminalPanel.tsx          # Terminal output with xterm.js
├── BrowserPanel.tsx           # Browser automation with screenshots
├── FilesPanel.tsx             # File changes with Monaco diff editor
├── index.ts                   # Exports
└── README.md                  # This file
```

### State Management

**Store:** `/apps/desktop/src/stores/executionStore.ts`

The execution store manages all dashboard state using Zustand with immer middleware:

```typescript
interface ExecutionState {
  // Active goals and steps
  activeGoal: ActiveGoal | null;
  steps: ExecutionStep[];

  // Terminal output
  terminalLogs: TerminalLog[];
  terminalScrollLock: boolean;

  // Browser automation
  browserActions: BrowserAction[];
  currentBrowserUrl: string | null;
  currentScreenshot: string | null;

  // File changes
  fileChanges: FileChange[];

  // LLM streaming
  currentLLMStream: string;
  isStreaming: boolean;

  // Panel visibility
  panelVisible: boolean;
  activeTab: 'thinking' | 'terminal' | 'browser' | 'files';
}
```

## Event Listeners

The dashboard automatically subscribes to Tauri events emitted by the Rust backend:

### AGI Goal Events
- `agi:goal:submitted` - New goal started
- `agi:goal:plan_created` - Plan generated with total steps
- `agi:goal:step_started` - Step execution started
- `agi:goal:step_completed` - Step execution completed
- `agi:goal:progress` - Progress update
- `agi:goal:achieved` - Goal successfully completed
- `agi:goal:error` - Goal execution failed

### LLM Streaming Events
- `agi:llm_chunk` - Streaming LLM reasoning chunk
- `agi:llm_complete` - LLM reasoning complete

### Terminal Events
- `agi:terminal_output` - Terminal command output

### Browser Events
- `agi:browser_action` - Browser automation action (navigate, click, type, extract, screenshot)

### File Events
- `agi:file_changed` - File created, modified, or deleted

## Integration

### 1. Add to App.tsx

Add the ExecutionDashboard component to your main app layout:

```tsx
import { ExecutionDashboard } from './components/execution';

const DesktopShell = () => {
  // ... existing code ...

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      <TitleBar {...} />
      <main className="flex flex-1 overflow-hidden min-h-0 min-w-0">
        {/* ... existing layout ... */}
      </main>
      <CommandPalette {...} />
      <SettingsPanel {...} />

      {/* Add Execution Dashboard */}
      <ExecutionDashboard />
    </div>
  );
};
```

### 2. Initialize Event Listeners

Event listeners are automatically initialized when the store is imported. The store is already imported in the ExecutionDashboard component, so no additional setup is needed.

### 3. Trigger Events from Rust

Emit events from your Rust backend using Tauri's event system:

```rust
use tauri::Manager;

// In your AGI execution code
app.emit("agi:goal:submitted", GoalPayload {
    goal_id: goal.id,
    description: goal.description,
})?;

app.emit("agi:goal:step_started", StepPayload {
    goal_id: goal.id,
    step_id: step.id,
    step_index: step.index,
    total_steps: plan.total_steps,
    description: step.description,
})?;

// LLM streaming
app.emit("agi:llm_chunk", LLMChunkPayload {
    step_id: step.id,
    chunk: reasoning_text,
})?;

// Terminal output
app.emit("agi:terminal_output", TerminalPayload {
    command: "npm install",
    output: "Installing packages...",
    exit_code: Some(0),
})?;

// Browser action
app.emit("agi:browser_action", BrowserPayload {
    type_: "navigate",
    url: Some("https://example.com"),
    screenshot_base64: Some(base64_screenshot),
    success: true,
    error: None,
})?;

// File change
app.emit("agi:file_changed", FilePayload {
    path: "/path/to/file.ts",
    operation: "modify",
    old_content: Some(old),
    new_content: Some(new),
    language: Some("typescript"),
})?;
```

## Keyboard Shortcuts

The dashboard includes comprehensive keyboard shortcuts:

- **Cmd/Ctrl + Shift + E** - Toggle dashboard visibility
- **Cmd/Ctrl + Shift + T** - Switch to Thinking tab
- **Cmd/Ctrl + Shift + R** - Switch to Terminal tab
- **Cmd/Ctrl + Shift + B** - Switch to Browser tab
- **Cmd/Ctrl + Shift + F** - Switch to Files tab

## Features

### Thinking Panel
- Real-time step-by-step execution tracking
- Status indicators (pending, in-progress, completed, failed)
- Streaming LLM reasoning output
- Collapsible step details with markdown support
- Execution time tracking

### Terminal Panel
- Full xterm.js terminal integration
- Syntax-highlighted command output
- Search functionality
- Copy/paste support
- Scroll lock toggle
- Command history with exit codes

### Browser Panel
- Live screenshot preview
- Action timeline (navigate, click, type, extract)
- URL display with external link
- Success/failure indicators
- Detailed action information (selectors, values)

### Files Panel
- Side-by-side file list and diff viewer
- Monaco diff editor with syntax highlighting
- Accept/reject individual file changes
- Pending/accepted/rejected status tracking
- Support for create, modify, and delete operations
- Language-specific syntax highlighting

## UI/UX Features

- **Auto-expand**: Dashboard automatically shows when a goal starts
- **Smart tabs**: Badge counts show active items per tab
- **Responsive layout**: Maximize, minimize, and collapse modes
- **Smooth animations**: Framer Motion for polished transitions
- **Dark theme**: Consistent with app theme
- **Accessible**: Keyboard navigation and ARIA labels

## State Persistence

Panel visibility and active tab selection are managed in-memory. To persist across sessions, you can extend the store with localStorage:

```typescript
import { persist } from 'zustand/middleware';

export const useExecutionStore = create<ExecutionState>()(
  persist(
    immer((set) => ({
      // ... state and actions
    })),
    {
      name: 'execution-dashboard',
      partialize: (state) => ({
        panelVisible: state.panelVisible,
        activeTab: state.activeTab,
      }),
    },
  ),
);
```

## Performance Considerations

- **Log limits**: Terminal logs capped at 1000 entries, browser actions at 100
- **Selective rendering**: Only active tab renders content
- **Virtualization**: Large file lists use efficient rendering
- **Lazy loading**: Monaco editor loads only when Files tab is active
- **Event debouncing**: High-frequency events are batched

## Customization

### Styling

All components use Tailwind CSS and can be customized via `className` props:

```tsx
<ExecutionDashboard className="custom-dashboard" />
<ThinkingPanel className="custom-thinking" />
```

### Theme Colors

Status colors are defined using Tailwind utilities and can be customized in `tailwind.config.js`:

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        success: '#10b981', // Green for completed
        destructive: '#ef4444', // Red for failed
        primary: '#3b82f6', // Blue for in-progress
      },
    },
  },
};
```

### Panel Behavior

Customize auto-show, auto-hide, and collapse behavior:

```tsx
// In ExecutionDashboard.tsx
const [isMaximized, setIsMaximized] = useState(false);
const [isCollapsed, setIsCollapsed] = useState(false);

// Auto-show panel when goal starts
useEffect(() => {
  if (activeGoal && !panelVisible) {
    setPanelVisible(true);
  }
}, [activeGoal, panelVisible, setPanelVisible]);
```

## Testing

### Unit Tests

```tsx
import { render, screen } from '@testing-library/react';
import { ExecutionDashboard } from './ExecutionDashboard';
import { useExecutionStore } from '../../stores/executionStore';

describe('ExecutionDashboard', () => {
  it('renders when panel is visible', () => {
    useExecutionStore.setState({ panelVisible: true });
    render(<ExecutionDashboard />);
    expect(screen.getByText('Execution Dashboard')).toBeInTheDocument();
  });

  it('hides when panel is not visible', () => {
    useExecutionStore.setState({ panelVisible: false });
    const { container } = render(<ExecutionDashboard />);
    expect(container.firstChild).toBeNull();
  });
});
```

### Integration Tests

Test event flow from Rust to UI:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_goal_submission_emits_event() {
        let app = create_test_app();
        let goal = Goal { id: "test-1", description: "Test goal" };

        submit_goal(&app, goal).unwrap();

        // Verify event was emitted
        assert_event_emitted(&app, "agi:goal:submitted");
    }
}
```

## Troubleshooting

### Dashboard not appearing
- Check `panelVisible` state: `useExecutionStore.getState().panelVisible`
- Ensure ExecutionDashboard is rendered in App.tsx
- Verify no z-index conflicts

### Events not updating
- Check browser console for event listener errors
- Verify Rust backend is emitting events correctly
- Ensure event payload matches TypeScript interfaces

### Terminal not rendering
- Check xterm.js is installed: `pnpm list @xterm/xterm`
- Verify terminal ref is attached to DOM element
- Check for CSS import: `import '@xterm/xterm/css/xterm.css'`

### Monaco editor issues
- Ensure @monaco-editor/react is installed
- Check for conflicting Monaco instances
- Verify language files are loaded

## Future Enhancements

- [ ] Export execution logs to file
- [ ] Replay execution history
- [ ] Custom panel layouts (split, grid)
- [ ] Filter and search across all panels
- [ ] Performance metrics and profiling
- [ ] Screenshot annotations
- [ ] File diff review workflow
- [ ] Terminal command autocomplete
- [ ] Execution bookmarks and snapshots
- [ ] Multi-goal parallel tracking

## Contributing

When adding new features:

1. Update TypeScript interfaces in `executionStore.ts`
2. Add Tauri event listeners for new events
3. Update component UI to display new data
4. Add keyboard shortcuts if applicable
5. Update this README with new features
6. Add tests for new functionality

## License

Part of AGI Workforce Desktop App. See main repository LICENSE.
