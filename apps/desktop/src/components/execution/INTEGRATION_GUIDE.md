# Execution Dashboard Integration Guide

This guide shows how to integrate the Execution Dashboard into your AGI Workforce desktop app.

## Step 1: Update App.tsx

Add the ExecutionDashboard import and component to your main app layout.

**File:** `/apps/desktop/src/App.tsx`

```tsx
// Add import at the top
import { ExecutionDashboard } from './components/execution';

const DesktopShell = () => {
  // ... existing code ...

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      <TitleBar
        state={{ focused: state.focused, maximized: state.maximized }}
        actions={actions}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        commandShortcutHint={commandShortcutHint}
      />
      <main className="flex flex-1 overflow-hidden min-h-0 min-w-0">
        {!sidebarCollapsed && (
          <Sidebar className="shrink-0" onOpenSettings={() => setSettingsPanelOpen(true)} />
        )}
        <div className="flex flex-1 overflow-hidden min-w-0">
          {/* Agent Chat (Left) */}
          {agentChatVisible && agentChatPosition === 'left' && (
            <>
              <AgentChatInterface className="w-96 shrink-0" position="left" />
              <div className="w-px bg-border shrink-0" />
            </>
          )}

          {/* Main Chat Interface */}
          <div className="flex-1 overflow-hidden min-w-0">
            <ChatInterface className="h-full" />
          </div>

          {/* Agent Chat (Right) */}
          {agentChatVisible && agentChatPosition === 'right' && (
            <>
              <div className="w-px bg-border shrink-0" />
              <AgentChatInterface className="w-96 shrink-0" position="right" />
            </>
          )}

          {/* Toggle Button */}
          {!agentChatVisible && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute bottom-4 right-4 z-10"
              onClick={() => setAgentChatVisible(true)}
            >
              {agentChatPosition === 'right' ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </main>
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        options={commandOptions}
      />
      <SettingsPanel open={settingsPanelOpen} onOpenChange={setSettingsPanelOpen} />

      {/* ===== ADD EXECUTION DASHBOARD HERE ===== */}
      <ExecutionDashboard />
    </div>
  );
};
```

## Step 2: Emit Events from Rust Backend

Update your Rust AGI execution code to emit events that the dashboard listens for.

**File:** `/apps/desktop/src-tauri/src/agi/executor.rs` (or equivalent)

### Goal Events

```rust
use tauri::Manager;
use serde::Serialize;

#[derive(Serialize, Clone)]
struct GoalSubmittedPayload {
    goal_id: String,
    description: String,
}

#[derive(Serialize, Clone)]
struct PlanCreatedPayload {
    goal_id: String,
    total_steps: usize,
    estimated_duration_ms: u64,
}

#[derive(Serialize, Clone)]
struct StepStartedPayload {
    goal_id: String,
    step_id: String,
    step_index: usize,
    total_steps: usize,
    description: String,
}

#[derive(Serialize, Clone)]
struct StepCompletedPayload {
    goal_id: String,
    step_id: String,
    step_index: usize,
    total_steps: usize,
    success: bool,
    execution_time_ms: u64,
    error: Option<String>,
}

#[derive(Serialize, Clone)]
struct ProgressPayload {
    goal_id: String,
    completed_steps: usize,
    total_steps: usize,
    progress_percent: u8,
}

#[derive(Serialize, Clone)]
struct GoalAchievedPayload {
    goal_id: String,
    total_steps: usize,
    completed_steps: usize,
}

#[derive(Serialize, Clone)]
struct GoalErrorPayload {
    goal_id: String,
    error: String,
}

// Example: Submit goal
pub fn submit_goal(app: &AppHandle, goal: &Goal) -> Result<(), Error> {
    app.emit("agi:goal:submitted", GoalSubmittedPayload {
        goal_id: goal.id.clone(),
        description: goal.description.clone(),
    })?;

    Ok(())
}

// Example: Create plan
pub fn create_plan(app: &AppHandle, goal_id: &str, plan: &Plan) -> Result<(), Error> {
    app.emit("agi:goal:plan_created", PlanCreatedPayload {
        goal_id: goal_id.to_string(),
        total_steps: plan.steps.len(),
        estimated_duration_ms: plan.estimated_duration_ms,
    })?;

    Ok(())
}

// Example: Start step
pub fn start_step(app: &AppHandle, goal_id: &str, step: &Step, step_index: usize, total_steps: usize) -> Result<(), Error> {
    app.emit("agi:goal:step_started", StepStartedPayload {
        goal_id: goal_id.to_string(),
        step_id: step.id.clone(),
        step_index,
        total_steps,
        description: step.description.clone(),
    })?;

    Ok(())
}

// Example: Complete step
pub fn complete_step(
    app: &AppHandle,
    goal_id: &str,
    step_id: &str,
    step_index: usize,
    total_steps: usize,
    result: &StepResult,
) -> Result<(), Error> {
    app.emit("agi:goal:step_completed", StepCompletedPayload {
        goal_id: goal_id.to_string(),
        step_id: step_id.to_string(),
        step_index,
        total_steps,
        success: result.success,
        execution_time_ms: result.execution_time_ms,
        error: result.error.clone(),
    })?;

    Ok(())
}

// Example: Update progress
pub fn update_progress(
    app: &AppHandle,
    goal_id: &str,
    completed: usize,
    total: usize,
) -> Result<(), Error> {
    let progress_percent = ((completed as f64 / total as f64) * 100.0) as u8;

    app.emit("agi:goal:progress", ProgressPayload {
        goal_id: goal_id.to_string(),
        completed_steps: completed,
        total_steps: total,
        progress_percent,
    })?;

    Ok(())
}
```

### LLM Streaming Events

```rust
#[derive(Serialize, Clone)]
struct LLMChunkPayload {
    step_id: String,
    chunk: String,
}

#[derive(Serialize, Clone)]
struct LLMCompletePayload {
    step_id: String,
}

pub fn stream_llm_reasoning(app: &AppHandle, step_id: &str, chunk: &str) -> Result<(), Error> {
    app.emit("agi:llm_chunk", LLMChunkPayload {
        step_id: step_id.to_string(),
        chunk: chunk.to_string(),
    })?;

    Ok(())
}

pub fn complete_llm_stream(app: &AppHandle, step_id: &str) -> Result<(), Error> {
    app.emit("agi:llm_complete", LLMCompletePayload {
        step_id: step_id.to_string(),
    })?;

    Ok(())
}
```

### Terminal Events

```rust
#[derive(Serialize, Clone)]
struct TerminalOutputPayload {
    command: String,
    output: String,
    exit_code: Option<i32>,
}

pub fn log_terminal_output(
    app: &AppHandle,
    command: &str,
    output: &str,
    exit_code: Option<i32>,
) -> Result<(), Error> {
    app.emit("agi:terminal_output", TerminalOutputPayload {
        command: command.to_string(),
        output: output.to_string(),
        exit_code,
    })?;

    Ok(())
}
```

### Browser Events

```rust
#[derive(Serialize, Clone)]
struct BrowserActionPayload {
    #[serde(rename = "type")]
    action_type: String,
    url: Option<String>,
    selector: Option<String>,
    value: Option<String>,
    screenshot_base64: Option<String>,
    success: bool,
    error: Option<String>,
}

pub fn log_browser_action(
    app: &AppHandle,
    action_type: &str,
    url: Option<&str>,
    selector: Option<&str>,
    value: Option<&str>,
    screenshot: Option<&[u8]>,
    success: bool,
    error: Option<&str>,
) -> Result<(), Error> {
    use base64::{Engine as _, engine::general_purpose};

    let screenshot_base64 = screenshot.map(|s| general_purpose::STANDARD.encode(s));

    app.emit("agi:browser_action", BrowserActionPayload {
        action_type: action_type.to_string(),
        url: url.map(String::from),
        selector: selector.map(String::from),
        value: value.map(String::from),
        screenshot_base64,
        success,
        error: error.map(String::from),
    })?;

    Ok(())
}
```

### File Events

```rust
#[derive(Serialize, Clone)]
struct FileChangedPayload {
    path: String,
    operation: String, // "create", "modify", "delete"
    old_content: Option<String>,
    new_content: Option<String>,
    language: Option<String>,
}

pub fn log_file_change(
    app: &AppHandle,
    path: &str,
    operation: &str,
    old_content: Option<&str>,
    new_content: Option<&str>,
    language: Option<&str>,
) -> Result<(), Error> {
    app.emit("agi:file_changed", FileChangedPayload {
        path: path.to_string(),
        operation: operation.to_string(),
        old_content: old_content.map(String::from),
        new_content: new_content.map(String::from),
        language: language.map(String::from),
    })?;

    Ok(())
}
```

## Step 3: Example Integration in AGI Executor

Here's a complete example of how to integrate event emission in your AGI executor:

```rust
use tauri::AppHandle;

pub async fn execute_goal(app: AppHandle, goal: Goal) -> Result<(), Error> {
    // 1. Submit goal
    submit_goal(&app, &goal)?;

    // 2. Create plan
    let plan = planner::create_plan(&app, &goal).await?;
    create_plan(&app, &goal.id, &plan)?;

    // 3. Execute steps
    let total_steps = plan.steps.len();
    let mut completed_steps = 0;

    for (index, step) in plan.steps.iter().enumerate() {
        // Start step
        start_step(&app, &goal.id, step, index, total_steps)?;

        // Stream LLM reasoning
        for chunk in llm::reason(&app, step).await? {
            stream_llm_reasoning(&app, &step.id, &chunk)?;
        }
        complete_llm_stream(&app, &step.id)?;

        // Execute step actions
        match &step.action {
            Action::Terminal(cmd) => {
                let output = execute_command(cmd).await?;
                log_terminal_output(&app, cmd, &output.stdout, Some(output.exit_code))?;
            }
            Action::Browser(action) => {
                let result = browser::execute_action(action).await?;
                log_browser_action(
                    &app,
                    &action.action_type,
                    Some(&action.url),
                    action.selector.as_deref(),
                    action.value.as_deref(),
                    result.screenshot.as_deref(),
                    result.success,
                    result.error.as_deref(),
                )?;
            }
            Action::FileEdit(edit) => {
                let (old, new) = filesystem::apply_edit(edit).await?;
                log_file_change(
                    &app,
                    &edit.path,
                    "modify",
                    Some(&old),
                    Some(&new),
                    Some(&edit.language),
                )?;
            }
            _ => {}
        }

        // Complete step
        let result = StepResult {
            success: true,
            execution_time_ms: 1500,
            error: None,
        };
        complete_step(&app, &goal.id, &step.id, index, total_steps, &result)?;

        // Update progress
        completed_steps += 1;
        update_progress(&app, &goal.id, completed_steps, total_steps)?;
    }

    // 4. Goal achieved
    app.emit("agi:goal:achieved", GoalAchievedPayload {
        goal_id: goal.id.clone(),
        total_steps,
        completed_steps,
    })?;

    Ok(())
}
```

## Step 4: Test the Integration

1. **Start the app in dev mode:**
   ```bash
   pnpm --filter @agiworkforce/desktop dev
   ```

2. **Submit a test goal:**
   - Type a goal-like message in the chat (e.g., "Create a new React component")
   - The dashboard should automatically appear at the bottom

3. **Verify each panel:**
   - **Thinking**: Should show planning and execution steps
   - **Terminal**: Should show command output (if any commands run)
   - **Browser**: Should show browser actions (if browser automation occurs)
   - **Files**: Should show file changes (if files are modified)

4. **Test keyboard shortcuts:**
   - Press `Cmd+Shift+E` to toggle dashboard
   - Press `Cmd+Shift+T`, `Cmd+Shift+R`, `Cmd+Shift+B`, `Cmd+Shift+F` to switch tabs

## Step 5: Customize (Optional)

### Adjust Panel Height

In `ExecutionDashboard.tsx`, change the default height:

```tsx
<motion.div
  // ...
  className={cn(
    'fixed inset-x-0 bottom-0 z-50 flex flex-col border-t border-border bg-background shadow-2xl',
    isMaximized ? 'top-0' : isCollapsed ? 'h-12' : 'h-[600px]', // Changed from 500px
    className,
  )}
>
```

### Change Auto-show Behavior

Disable auto-show when goals start:

```tsx
// In ExecutionDashboard.tsx
// Comment out or remove this useEffect:
/*
useEffect(() => {
  if (activeGoal && !panelVisible) {
    setPanelVisible(true);
  }
}, [activeGoal, panelVisible, setPanelVisible]);
*/
```

### Persist Panel State

Add localStorage persistence:

```tsx
// In executionStore.ts
import { persist } from 'zustand/middleware';

export const useExecutionStore = create<ExecutionState>()(
  persist(
    immer((set) => ({
      // ... existing state
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

## Troubleshooting

### Dashboard not appearing
1. Check if ExecutionDashboard is imported in App.tsx
2. Verify component is rendered in the return statement
3. Check browser console for errors

### Events not working
1. Verify Rust backend is emitting events correctly
2. Check event payload types match TypeScript interfaces
3. Open browser DevTools and check console for event listener errors

### Styling issues
1. Ensure Tailwind CSS is configured correctly
2. Check for z-index conflicts with other components
3. Verify theme colors are defined in tailwind.config.js

## Complete Example

See `/apps/desktop/src/components/execution/README.md` for a complete feature reference and advanced usage.

## Next Steps

1. Customize panel behavior for your use case
2. Add additional event types as needed
3. Extend with custom visualizations
4. Add export/logging features
5. Implement execution history and replay

---

**Need help?** Check the README.md in the execution directory for more details.
