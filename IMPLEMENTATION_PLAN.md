# AGI Workforce Frontend-First Implementation Plan

**Priority Framework:** Frontend UI → Backend Integration → Advanced Features → Polish
**No timeframes - implementation based on priority tiers**

---

## Priority Tier 0: Foundation (Critical Path)

### 1. Unified Agentic Chat Interface Architecture

**Goal:** Replace current fragmented chat interfaces with single, production-ready component

**Components to Build:**

#### `UnifiedAgenticChat.tsx` (Main Container)
```typescript
interface UnifiedAgenticChatProps {
  className?: string;
  layout?: 'default' | 'compact' | 'immersive';
  sidecarPosition?: 'right' | 'left' | 'bottom';
  defaultSidecarOpen?: boolean;
}
```

**Features:**
- Responsive layout with configurable sidecar
- Mission Control modal overlay
- Global state management
- Event listener integration
- Auto-scroll with user override
- Keyboard shortcuts (Ctrl+K command palette)

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`

---

#### `ChatMessageList.tsx` (Message Display Area)
```typescript
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: MessageMetadata;
  attachments?: Attachment[];
  operations?: Operation[];
}
```

**Features:**
- Virtual scrolling for performance (react-window)
- Message grouping by time/session
- Loading states and skeletons
- Empty state with suggestions
- Search/filter messages
- Export conversation

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/ChatMessageList.tsx`

---

#### `MessageBubble.tsx` (Individual Message Component)
```typescript
interface MessageBubbleProps {
  message: Message;
  showAvatar?: boolean;
  showTimestamp?: boolean;
  enableActions?: boolean;
  onRegenerate?: () => void;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
  onCopy?: () => void;
}
```

**Features:**
- Role-based styling (user vs assistant vs system)
- Markdown rendering with syntax highlighting
- Code blocks with copy button
- Math equations (KaTeX)
- Tables and lists
- Action menu (copy, edit, delete, regenerate)
- Streaming animation
- Token count display

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/MessageBubble.tsx`

---

#### `ChatInputArea.tsx` (Message Input)
```typescript
interface ChatInputAreaProps {
  onSend: (content: string, options: SendOptions) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  enableAttachments?: boolean;
  enableVoice?: boolean;
  enableScreenshot?: boolean;
}
```

**Features:**
- Auto-resizing textarea (max 10 lines)
- Character/token counter
- File drag-and-drop
- File attachment preview
- Screenshot capture button
- Voice input button (UI ready)
- Send button with loading state
- Keyboard shortcuts (Enter to send, Shift+Enter for newline)
- Context pills (show active files/data)
- Quick actions menu

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx`

---

### 2. Sidecar Panel Components

#### `SidecarPanel.tsx` (Right Sidebar Container)
```typescript
interface SidecarPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  position: 'right' | 'left' | 'bottom';
  width?: number;
  sections: SidecarSection[];
}
```

**Features:**
- Collapsible/expandable
- Resizable width (drag handle)
- Section tabs
- Scroll container
- Minimize button
- Pin sections

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/SidecarPanel.tsx`

---

#### `ActiveOperationsSection.tsx`
```typescript
interface ActiveOperation {
  id: string;
  type: 'goal' | 'step' | 'tool' | 'task';
  description: string;
  progress: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: Date;
  estimatedCompletion?: Date;
}
```

**Features:**
- Current goal display with progress bar
- Current step indicator
- Active tool calls
- Pause/resume/cancel buttons
- ETA calculation
- Progress animation

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/Sidecar/ActiveOperations.tsx`

---

#### `ReasoningDisplay.tsx`
```typescript
interface ReasoningStep {
  id: string;
  thought: string;
  confidence?: number;
  alternatives?: string[];
  timestamp: Date;
  duration?: number;
}
```

**Features:**
- Collapsible thinking blocks
- Confidence scores
- Alternative approaches considered
- Reasoning timeline
- "Why did you do this?" explanations
- Copy reasoning
- Highlight relevant parts

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/Sidecar/ReasoningDisplay.tsx`

---

#### `FileOperationsLog.tsx`
```typescript
interface FileOperation {
  id: string;
  type: 'read' | 'write' | 'create' | 'delete' | 'move' | 'rename';
  filePath: string;
  oldContent?: string;
  newContent?: string;
  timestamp: Date;
  success: boolean;
  error?: string;
}
```

**Features:**
- Chronological list of file operations
- File path with icon
- Operation type badge
- Click to view diff
- Filter by type
- Search files
- Group by directory

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/Sidecar/FileOperationsLog.tsx`

---

#### `TerminalCommandLog.tsx`
```typescript
interface TerminalCommand {
  id: string;
  command: string;
  cwd: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  duration?: number;
  timestamp: Date;
}
```

**Features:**
- Command history list
- Syntax-highlighted commands
- Exit code indicators
- Click to expand output
- Copy command
- Re-run command button
- Filter by status

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/Sidecar/TerminalCommandLog.tsx`

---

#### `ToolUsageStats.tsx`
```typescript
interface ToolExecution {
  id: string;
  toolName: string;
  input: any;
  output?: any;
  error?: string;
  duration: number;
  timestamp: Date;
  success: boolean;
}
```

**Features:**
- Tool execution list
- Success/failure indicators
- Execution time chart
- Click to view details
- Tool frequency chart
- Average duration by tool
- Success rate by tool

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/Sidecar/ToolUsageStats.tsx`

---

#### `BackgroundTasksMonitor.tsx`
```typescript
interface BackgroundTask {
  id: string;
  name: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed';
  progress: number;
  priority: 'low' | 'normal' | 'high';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}
```

**Features:**
- Active tasks list
- Progress bars
- Priority badges
- Cancel/pause/resume controls
- Queue position
- Task details modal
- Filter by status/priority

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/Sidecar/BackgroundTasksMonitor.tsx`

---

#### `MultiAgentStatus.tsx`
```typescript
interface AgentStatus {
  id: string;
  name: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  currentGoal?: string;
  currentStep?: string;
  progress: number;
  resourceUsage: {
    cpu: number;
    memory: number;
  };
}
```

**Features:**
- Agent cards grid
- Status indicators
- Progress bars
- Resource usage meters
- Click to focus agent
- Agent coordination graph
- Resource lock indicators

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/Sidecar/MultiAgentStatus.tsx`

---

### 3. Message Enhancement Components

#### `FileOperationCard.tsx`
```typescript
interface FileOperationCardProps {
  operation: FileOperation;
  showDiff?: boolean;
  enableApproval?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}
```

**Features:**
- File icon and path
- Operation type badge (created, modified, deleted)
- File size change
- Inline diff preview (first 10 lines)
- "View full diff" button
- Approve/reject buttons (if approval required)
- Timestamp
- Click to open file

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/Cards/FileOperationCard.tsx`

---

#### `TerminalCommandCard.tsx`
```typescript
interface TerminalCommandCardProps {
  command: TerminalCommand;
  showOutput?: boolean;
  maxOutputLines?: number;
}
```

**Features:**
- Command with syntax highlighting
- Working directory
- Exit code badge (green for 0, red for errors)
- Collapsible output section
- ANSI color rendering
- Execution time
- Copy command/output buttons
- Re-run button

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/Cards/TerminalCommandCard.tsx`

---

#### `ToolExecutionCard.tsx`
```typescript
interface ToolExecutionCardProps {
  execution: ToolExecution;
  showDetails?: boolean;
}
```

**Features:**
- Tool icon and name
- Success/failure indicator
- Execution time badge
- Collapsible input section (formatted JSON)
- Collapsible output section
- Error display with stack trace
- Copy input/output buttons
- Retry button (if failed)

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/Cards/ToolExecutionCard.tsx`

---

#### `ApprovalRequestCard.tsx`
```typescript
interface ApprovalRequest {
  id: string;
  type: 'file_delete' | 'terminal_command' | 'api_call' | 'data_modification';
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  details: any;
  impact?: string;
}
```

**Features:**
- Risk level indicator (color-coded)
- Operation description
- Impact preview
- Details expandable section
- Approve button (green)
- Reject button (red)
- Modify button (edit parameters)
- Auto-approve checkbox
- Timeout countdown

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/Cards/ApprovalRequestCard.tsx`

---

#### `ScreenshotCard.tsx`
```typescript
interface ScreenshotCardProps {
  screenshot: {
    before?: string; // base64
    after?: string; // base64
    action?: string;
    timestamp: Date;
    annotations?: Annotation[];
  };
}
```

**Features:**
- Before/after image comparison
- Slider to compare
- Zoom controls
- Annotations overlay (click markers, type indicators)
- Action description
- Confidence score
- Full-screen view
- Download image

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/Cards/ScreenshotCard.tsx`

---

### 4. Visualization Components

#### `DiffViewer.tsx`
```typescript
interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  language?: string;
  fileName?: string;
  viewMode?: 'split' | 'unified';
  showLineNumbers?: boolean;
  highlightChanges?: boolean;
}
```

**Features:**
- Side-by-side or unified diff view
- Syntax highlighting per language
- Line numbers
- Add/remove color coding (green/red)
- Modified line highlighting (yellow)
- Fold unchanged sections
- Search in diff
- Copy old/new content
- Jump to change buttons
- Statistics (lines added/removed/modified)

**Libraries:** `react-diff-viewer-continued` or custom with `diff` library

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/Visualizations/DiffViewer.tsx`

---

#### `TerminalOutputViewer.tsx`
```typescript
interface TerminalOutputViewerProps {
  stdout: string;
  stderr: string;
  ansiEnabled?: boolean;
  maxLines?: number;
  searchable?: boolean;
}
```

**Features:**
- ANSI color/formatting support
- Syntax highlighting for common patterns (URLs, file paths, errors)
- Auto-scroll to bottom
- Search in output
- Filter stderr/stdout
- Line numbers
- Copy all output
- Download as text file
- Wrap long lines toggle

**Libraries:** `ansi-to-react` or `xterm.js` (read-only mode)

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/Visualizations/TerminalOutputViewer.tsx`

---

#### `CodeBlock.tsx`
```typescript
interface CodeBlockProps {
  code: string;
  language: string;
  fileName?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];
  theme?: 'dark' | 'light';
  enableCopy?: boolean;
}
```

**Features:**
- Syntax highlighting (140+ languages)
- Line numbers
- Copy code button
- Language badge
- File name display
- Line highlighting
- Theme switching
- Wrap toggle
- Download as file

**Libraries:** `react-syntax-highlighter` (already used)

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/Visualizations/CodeBlock.tsx`

---

#### `ProgressIndicator.tsx`
```typescript
interface ProgressIndicatorProps {
  value: number; // 0-100
  variant?: 'linear' | 'circular' | 'stepped';
  status?: 'active' | 'paused' | 'completed' | 'error';
  label?: string;
  showPercentage?: boolean;
  estimatedCompletion?: Date;
}
```

**Features:**
- Linear progress bar
- Circular progress (for compact views)
- Stepped progress (for multi-phase tasks)
- Color coding by status
- ETA display
- Smooth transitions
- Pulsing animation when active
- Completion celebration (confetti effect)

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/Visualizations/ProgressIndicator.tsx`

---

#### `TimelineView.tsx`
```typescript
interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  timestamp: Date;
  duration?: number;
  status: 'success' | 'error' | 'pending';
  details?: any;
}
```

**Features:**
- Vertical timeline of events
- Event icons by type
- Time markers
- Duration bars
- Parallel event visualization
- Zoom controls
- Filter by event type
- Click to view details
- Export timeline

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/Visualizations/TimelineView.tsx`

---

### 5. State Management

#### `unifiedChatStore.ts`
```typescript
interface UnifiedChatState {
  // Messages
  messages: EnhancedMessage[];
  isLoading: boolean;
  isStreaming: boolean;

  // Operations
  fileOperations: FileOperation[];
  terminalCommands: TerminalCommand[];
  toolExecutions: ToolExecution[];
  screenshots: Screenshot[];

  // Agents
  agents: AgentStatus[];

  // Tasks
  backgroundTasks: BackgroundTask[];

  // Approvals
  pendingApprovals: ApprovalRequest[];

  // Context
  activeContext: ContextItem[];

  // UI State
  sidecarOpen: boolean;
  sidecarSection: SidecarSection;
  missionControlOpen: boolean;
  selectedMessage: string | null;

  // Filters
  filters: {
    fileOperations: FileOperationType[];
    terminalStatus: ('success' | 'error')[];
    toolNames: string[];
  };

  // Actions
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  deleteMessage: (id: string) => void;

  addFileOperation: (op: FileOperation) => void;
  addTerminalCommand: (cmd: TerminalCommand) => void;
  addToolExecution: (exec: ToolExecution) => void;

  updateAgentStatus: (id: string, status: Partial<AgentStatus>) => void;
  updateTaskProgress: (id: string, progress: number) => void;

  approveOperation: (id: string) => void;
  rejectOperation: (id: string) => void;

  setSidecarOpen: (open: boolean) => void;
  setSidecarSection: (section: SidecarSection) => void;
  setMissionControlOpen: (open: boolean) => void;

  clearHistory: () => void;
  exportConversation: () => void;
}
```

**Features:**
- Zustand store with immer middleware
- Persist sidecar state to localStorage
- Selectors for optimized re-renders
- Computed values (stats, aggregations)
- Action batching for performance
- Event listener integration
- Automatic cleanup of old data

**File Location:** `apps/desktop/src/stores/unifiedChatStore.ts`

---

## Priority Tier 1: Mission Control & Analytics

### 6. Mission Control Dashboard

#### `MissionControl.tsx` (Modal Overlay)
```typescript
interface MissionControlProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'tasks' | 'agents' | 'resources' | 'analytics';
}
```

**Features:**
- Full-screen modal overlay
- Tab navigation
- Global statistics header
- Real-time updates
- Keyboard shortcuts (Esc to close, Cmd+M to toggle)
- Export all data
- Refresh all panels

**File Location:** `apps/desktop/src/components/MissionControl/index.tsx`

---

#### `TasksDashboard.tsx`
```typescript
interface TasksDashboardProps {
  tasks: BackgroundTask[];
  onTaskAction: (taskId: string, action: TaskAction) => void;
}
```

**Features:**
- Active tasks grid (cards)
- Queued tasks list
- Completed tasks history (last 50)
- Failed tasks with retry
- Task priority visualization
- Filter by status/priority
- Sort by date/priority/progress
- Bulk actions (pause all, resume all)
- Resource utilization chart
- Queue depth graph

**File Location:** `apps/desktop/src/components/MissionControl/TasksDashboard.tsx`

---

#### `AgentsDashboard.tsx`
```typescript
interface AgentsDashboardProps {
  agents: AgentStatus[];
  orchestrator: OrchestratorStatus;
}
```

**Features:**
- Agent cards with live status
- Resource usage per agent
- Agent dependency graph
- Shared resource locks visualization
- Agent timeline (Gantt chart)
- Spawn new agent button
- Cancel/pause all agents
- Agent comparison (side-by-side)
- Coordination patterns display

**File Location:** `apps/desktop/src/components/MissionControl/AgentsDashboard.tsx`

---

#### `ResourceMonitor.tsx`
```typescript
interface ResourceMonitorProps {
  resources: SystemResources;
  history: ResourceHistory[];
}
```

**Features:**
- CPU usage chart (line graph)
- Memory usage chart
- Network I/O chart
- Disk I/O chart
- Real-time updates (every 1s)
- Historical view (last 1h, 6h, 24h)
- Threshold alerts
- Resource allocation by agent
- Peak usage indicators
- Export resource logs

**File Location:** `apps/desktop/src/components/MissionControl/ResourceMonitor.tsx`

---

#### `AnalyticsDashboard.tsx`
```typescript
interface AnalyticsDashboardProps {
  stats: AnalyticsStats;
  dateRange: DateRange;
}
```

**Features:**
- Total operations count
- Success rate (pie chart)
- Operations over time (line graph)
- Tool usage frequency (bar chart)
- Average execution time by tool
- File operations breakdown
- Terminal command frequency
- Cost tracking (LLM API calls)
- Token usage statistics
- Top errors/failures
- Performance trends
- Export analytics report

**File Location:** `apps/desktop/src/components/MissionControl/AnalyticsDashboard.tsx`

---

### 7. Advanced Visualization Components

#### `GanttChart.tsx`
```typescript
interface GanttChartProps {
  tasks: GanttTask[];
  agents?: AgentStatus[];
  startDate: Date;
  endDate: Date;
  zoom?: 'hour' | 'day' | 'week';
}
```

**Features:**
- Horizontal timeline
- Task bars with progress
- Parallel task visualization
- Dependencies (arrows)
- Agent color coding
- Zoom controls
- Drag to reorder (future)
- Click task for details
- Export as image

**Libraries:** `react-gantt-chart` or `@dhtmlx/trial-react-gantt`

**File Location:** `apps/desktop/src/components/MissionControl/Visualizations/GanttChart.tsx`

---

#### `DependencyGraph.tsx`
```typescript
interface DependencyGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout?: 'tree' | 'force' | 'circular';
}
```

**Features:**
- Interactive node graph
- Directional edges (arrows)
- Node color coding by status
- Zoom/pan controls
- Node click for details
- Edge weight visualization
- Highlight dependencies on hover
- Layout algorithms
- Export as SVG

**Libraries:** `react-flow` or `vis-network`

**File Location:** `apps/desktop/src/components/MissionControl/Visualizations/DependencyGraph.tsx`

---

#### `MetricsChart.tsx`
```typescript
interface MetricsChartProps {
  data: MetricDataPoint[];
  type: 'line' | 'bar' | 'area' | 'pie' | 'scatter';
  xAxis: AxisConfig;
  yAxis: AxisConfig;
  legend?: boolean;
}
```

**Features:**
- Line charts for trends
- Bar charts for comparisons
- Area charts for cumulative data
- Pie charts for distributions
- Scatter plots for correlations
- Interactive tooltips
- Zoom/pan
- Export as PNG/SVG
- Responsive sizing
- Theme support

**Libraries:** `recharts` or `chart.js` with `react-chartjs-2`

**File Location:** `apps/desktop/src/components/MissionControl/Visualizations/MetricsChart.tsx`

---

## Priority Tier 2: Backend Integration

### 8. Event System Enhancement

#### Backend Events to Add

**File Operation Events:**
```rust
// apps/desktop/src-tauri/src/agi/executor.rs

#[derive(Serialize, Clone)]
struct FileOperationEvent {
    operation_id: String,
    operation_type: String, // "read", "write", "create", "delete"
    file_path: String,
    old_content: Option<String>,
    new_content: Option<String>,
    size_bytes: Option<u64>,
    success: bool,
    error: Option<String>,
    timestamp: i64,
}

// Emit after file operations
app_handle.emit_all("agi:file:operation", FileOperationEvent { ... })?;
```

**Terminal Command Events:**
```rust
// apps/desktop/src-tauri/src/commands/terminal.rs

#[derive(Serialize, Clone)]
struct TerminalCommandEvent {
    command_id: String,
    command: String,
    cwd: String,
    env: HashMap<String, String>,
    timestamp: i64,
}

#[derive(Serialize, Clone)]
struct TerminalOutputEvent {
    command_id: String,
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
    duration_ms: u64,
}

// Emit before execution
app_handle.emit_all("agi:terminal:command", TerminalCommandEvent { ... })?;

// Emit after execution
app_handle.emit_all("agi:terminal:output", TerminalOutputEvent { ... })?;
```

**Screenshot Events:**
```rust
// apps/desktop/src-tauri/src/automation/screen/mod.rs

#[derive(Serialize, Clone)]
struct ScreenshotEvent {
    screenshot_id: String,
    image_base64: String,
    action: Option<String>, // "click", "type", etc.
    element_bounds: Option<Rectangle>,
    confidence: Option<f64>,
    timestamp: i64,
}

// Emit after capturing screenshot
app_handle.emit_all("agi:ui:screenshot", ScreenshotEvent { ... })?;
```

**Approval Events:**
```rust
// apps/desktop/src-tauri/src/agent/approval.rs

#[derive(Serialize, Clone)]
struct ApprovalRequestEvent {
    approval_id: String,
    operation_type: String,
    description: String,
    risk_level: String, // "low", "medium", "high"
    details: serde_json::Value,
    impact: Option<String>,
    timeout_seconds: Option<u64>,
}

// Emit when approval needed
app_handle.emit_all("agi:approval:requested", ApprovalRequestEvent { ... })?;
```

---

#### Frontend Event Listeners

**File Location:** `apps/desktop/src/hooks/useAgenticEvents.ts`

```typescript
export function useAgenticEvents() {
  const store = useUnifiedChatStore();

  useEffect(() => {
    const listeners: UnlistenFn[] = [];

    // File operations
    listen<FileOperationEvent>('agi:file:operation', (event) => {
      store.addFileOperation(event.payload);
    }).then(unlisten => listeners.push(unlisten));

    // Terminal commands
    listen<TerminalCommandEvent>('agi:terminal:command', (event) => {
      store.addTerminalCommand(event.payload);
    }).then(unlisten => listeners.push(unlisten));

    listen<TerminalOutputEvent>('agi:terminal:output', (event) => {
      store.updateTerminalOutput(event.payload);
    }).then(unlisten => listeners.push(unlisten));

    // Screenshots
    listen<ScreenshotEvent>('agi:ui:screenshot', (event) => {
      store.addScreenshot(event.payload);
    }).then(unlisten => listeners.push(unlisten));

    // Approvals
    listen<ApprovalRequestEvent>('agi:approval:requested', (event) => {
      store.addApprovalRequest(event.payload);
    }).then(unlisten => listeners.push(unlisten));

    // Tool executions (already exists, enhance)
    listen<ToolExecutionEvent>('agi:tool:called', (event) => {
      store.addToolExecution(event.payload);
    }).then(unlisten => listeners.push(unlisten));

    // Cleanup
    return () => {
      listeners.forEach(unlisten => unlisten());
    };
  }, []);
}
```

---

### 9. Tauri Commands Enhancement

#### File Operations Commands

**File Location:** `apps/desktop/src-tauri/src/commands/file_ops.rs`

```rust
#[tauri::command]
pub async fn get_file_diff(
    file_path: String,
    old_content: String,
    new_content: String,
) -> Result<FileDiff, String> {
    // Generate diff using `similar` crate
    // Return unified or split diff
}

#[tauri::command]
pub async fn get_file_operations_history(
    limit: Option<usize>,
    filter: Option<FileOperationFilter>,
) -> Result<Vec<FileOperation>, String> {
    // Query from database or memory
    // Return paginated results
}
```

---

#### Terminal Commands

**File Location:** `apps/desktop/src-tauri/src/commands/terminal.rs`

```rust
#[tauri::command]
pub async fn get_terminal_history(
    limit: Option<usize>,
) -> Result<Vec<TerminalCommand>, String> {
    // Return recent commands with output
}

#[tauri::command]
pub async fn rerun_terminal_command(
    command_id: String,
) -> Result<String, String> {
    // Re-execute previous command
    // Return new command_id
}
```

---

#### Approval System

**File Location:** `apps/desktop/src-tauri/src/commands/approval.rs`

```rust
#[tauri::command]
pub async fn approve_operation(
    approval_id: String,
    auto_approve_similar: Option<bool>,
) -> Result<(), String> {
    // Mark operation as approved
    // Optionally add rule for auto-approval
}

#[tauri::command]
pub async fn reject_operation(
    approval_id: String,
    reason: Option<String>,
) -> Result<(), String> {
    // Mark operation as rejected
    // Log rejection reason
}

#[tauri::command]
pub async fn get_approval_policies() -> Result<Vec<ApprovalPolicy>, String> {
    // Return user's approval policies
}

#[tauri::command]
pub async fn update_approval_policy(
    policy: ApprovalPolicy,
) -> Result<(), String> {
    // Save updated policy
}
```

---

### 10. Database Schema Updates

**File Location:** `apps/desktop/src-tauri/src/db/migrations/v42_unified_chat_operations.sql`

```sql
-- File operations history
CREATE TABLE IF NOT EXISTS file_operations (
    id TEXT PRIMARY KEY,
    operation_type TEXT NOT NULL, -- 'read', 'write', 'create', 'delete', 'move', 'rename'
    file_path TEXT NOT NULL,
    old_content TEXT,
    new_content TEXT,
    size_bytes INTEGER,
    success BOOLEAN NOT NULL DEFAULT 1,
    error TEXT,
    session_id TEXT,
    agent_id TEXT,
    goal_id TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_file_operations_type ON file_operations(operation_type);
CREATE INDEX idx_file_operations_path ON file_operations(file_path);
CREATE INDEX idx_file_operations_created ON file_operations(created_at DESC);

-- Terminal command history
CREATE TABLE IF NOT EXISTS terminal_commands (
    id TEXT PRIMARY KEY,
    command TEXT NOT NULL,
    cwd TEXT NOT NULL,
    exit_code INTEGER,
    stdout TEXT,
    stderr TEXT,
    duration_ms INTEGER,
    session_id TEXT,
    agent_id TEXT,
    goal_id TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_terminal_commands_created ON terminal_commands(created_at DESC);

-- Screenshots
CREATE TABLE IF NOT EXISTS screenshots (
    id TEXT PRIMARY KEY,
    image_path TEXT NOT NULL, -- Store path instead of base64 in DB
    action TEXT,
    element_bounds TEXT, -- JSON
    confidence REAL,
    session_id TEXT,
    agent_id TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_screenshots_created ON screenshots(created_at DESC);

-- Approval requests
CREATE TABLE IF NOT EXISTS approval_requests (
    id TEXT PRIMARY KEY,
    operation_type TEXT NOT NULL,
    description TEXT NOT NULL,
    risk_level TEXT NOT NULL, -- 'low', 'medium', 'high'
    details TEXT, -- JSON
    impact TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'timeout'
    approved_at INTEGER,
    rejected_at INTEGER,
    rejection_reason TEXT,
    timeout_seconds INTEGER,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_approval_requests_status ON approval_requests(status);

-- Approval policies
CREATE TABLE IF NOT EXISTS approval_policies (
    id TEXT PRIMARY KEY,
    operation_pattern TEXT NOT NULL,
    risk_threshold TEXT NOT NULL, -- 'low', 'medium', 'high'
    auto_approve BOOLEAN NOT NULL DEFAULT 0,
    require_confirmation BOOLEAN NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

---

## Priority Tier 3: Advanced Features

### 11. Extended Thinking Display

#### `ExtendedThinkingViewer.tsx`
```typescript
interface ThinkingBlock {
  id: string;
  content: string;
  confidence?: number;
  alternatives?: string[];
  reasoning_type: 'analysis' | 'planning' | 'decision' | 'reflection';
  timestamp: Date;
}
```

**Features:**
- Collapsible sections for each thinking block
- Confidence meter
- Alternative approaches shown
- Reasoning type badges
- Copy thinking content
- "Why this approach?" button
- Link to documentation/sources

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/ExtendedThinking/index.tsx`

---

### 12. Context Pills System

#### `ContextPills.tsx`
```typescript
interface ContextItem {
  id: string;
  type: 'file' | 'folder' | 'url' | 'selection' | 'clipboard';
  name: string;
  path?: string;
  size?: number;
  icon?: string;
}
```

**Features:**
- Pill badges for each context item
- File type icons
- Size display
- Remove context button (X)
- Click to preview
- Drag to reorder
- Add context dropdown
- Context size meter (% of limit)

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/ContextPills.tsx`

---

### 13. Custom Shortcuts System

#### `ShortcutsManager.tsx`
```typescript
interface Shortcut {
  id: string;
  trigger: string; // e.g., "/analyze"
  name: string;
  description: string;
  template: string;
  parameters?: ShortcutParameter[];
  icon?: string;
}
```

**Features:**
- `/` command palette
- Fuzzy search shortcuts
- Parameter inputs (inline)
- Preview before execution
- Shortcut editor
- Import/export shortcuts
- Community shortcuts marketplace
- Usage analytics

**File Location:** `apps/desktop/src/components/UnifiedAgenticChat/Shortcuts/index.tsx`

---

### 14. Global Keyboard Shortcut

#### Implementation

**Backend:**
```rust
// apps/desktop/src-tauri/src/main.rs

use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Register global shortcut Ctrl+Shift+A
            app.global_shortcut().on_shortcut("Ctrl+Shift+A", move |app, _event| {
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        window.hide().ok();
                    } else {
                        window.show().ok();
                        window.set_focus().ok();
                    }
                }
            }).unwrap();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Frontend:**
```typescript
// Quick chat overlay component
function QuickChatOverlay() {
  // Minimal input-first interface
  // Auto-focus on show
  // Esc to hide
  // Results shown inline
}
```

---

### 15. MCP Integration Panel

#### `MCPManager.tsx`
```typescript
interface MCPServer {
  id: string;
  name: string;
  description: string;
  version: string;
  tools: MCPTool[];
  status: 'connected' | 'disconnected' | 'error';
  config: MCPConfig;
}
```

**Features:**
- Browse available MCP servers
- Install from marketplace
- Configure connection settings
- Test connection
- Enable/disable servers
- View available tools
- Tool usage statistics
- Update notifications
- Custom server addition

**File Location:** `apps/desktop/src/components/Settings/MCPManager.tsx`

---

## Priority Tier 4: Polish & Optimization

### 16. Performance Optimizations

#### Virtual Scrolling
- Implement `react-window` for message list
- Render only visible messages
- Lazy load old messages on scroll

#### Code Splitting
- Route-based code splitting
- Component lazy loading
- Dynamic imports for heavy components

#### Memoization
- React.memo for expensive components
- useMemo for computed values
- useCallback for event handlers

#### Debouncing/Throttling
- Debounce search inputs
- Throttle scroll events
- Throttle resize handlers

---

### 17. Accessibility (a11y)

#### Keyboard Navigation
- Tab order for all interactive elements
- Keyboard shortcuts documented
- Focus indicators
- Skip to content links

#### Screen Reader Support
- ARIA labels
- ARIA live regions for updates
- Semantic HTML
- Alt text for images

#### Color Contrast
- WCAG AA compliance
- High contrast mode
- Color-blind friendly palette

---

### 18. Themes & Customization

#### Theme System
```typescript
interface Theme {
  name: string;
  colors: ColorScheme;
  fonts: FontScheme;
  spacing: SpacingScheme;
  borderRadius: string;
  shadows: ShadowScheme;
}
```

**Themes:**
- Light (default)
- Dark (default)
- High Contrast Light
- High Contrast Dark
- Custom (user-defined)

**Customization:**
- Font size
- Line height
- Sidecar width
- Message density (compact/comfortable/spacious)
- Animation speed

---

### 19. Export & Import

#### Conversation Export
- Export as Markdown
- Export as JSON
- Export as HTML
- Include/exclude screenshots
- Include/exclude operations
- Date range filter

#### Data Import
- Import previous conversations
- Import shortcuts
- Import approval policies
- Migration from other tools

---

### 20. Error Boundaries & Recovery

#### Error Handling
```typescript
<ErrorBoundary
  fallback={<ErrorFallback />}
  onError={logErrorToService}
  resetKeys={[conversationId]}
>
  <UnifiedAgenticChat />
</ErrorBoundary>
```

**Features:**
- Graceful degradation
- Error reporting to backend
- Retry mechanisms
- User-friendly error messages
- Recovery suggestions

---

## Implementation Dependencies

### Component Dependency Graph

```
UnifiedAgenticChat (root)
├── ChatMessageList
│   ├── MessageBubble (depends on CodeBlock, DiffViewer)
│   ├── FileOperationCard (depends on DiffViewer)
│   ├── TerminalCommandCard (depends on TerminalOutputViewer)
│   ├── ToolExecutionCard
│   ├── ApprovalRequestCard
│   └── ScreenshotCard
├── ChatInputArea (depends on ContextPills)
├── SidecarPanel
│   ├── ActiveOperationsSection (depends on ProgressIndicator)
│   ├── ReasoningDisplay (depends on ExtendedThinkingViewer)
│   ├── FileOperationsLog
│   ├── TerminalCommandLog
│   ├── ToolUsageStats (depends on MetricsChart)
│   ├── BackgroundTasksMonitor (depends on ProgressIndicator)
│   └── MultiAgentStatus (depends on DependencyGraph)
└── MissionControl (modal)
    ├── TasksDashboard (depends on GanttChart, MetricsChart)
    ├── AgentsDashboard (depends on DependencyGraph, GanttChart)
    ├── ResourceMonitor (depends on MetricsChart)
    └── AnalyticsDashboard (depends on MetricsChart)
```

### Build Order (Frontend)

**Phase 1 - Foundation:**
1. CodeBlock (no deps)
2. ProgressIndicator (no deps)
3. MessageBubble (uses CodeBlock)
4. ChatMessageList (uses MessageBubble)
5. ChatInputArea (minimal deps)
6. unifiedChatStore (state management)

**Phase 2 - Cards:**
7. DiffViewer (no deps)
8. TerminalOutputViewer (no deps)
9. FileOperationCard (uses DiffViewer)
10. TerminalCommandCard (uses TerminalOutputViewer)
11. ToolExecutionCard (minimal deps)
12. ApprovalRequestCard (minimal deps)
13. ScreenshotCard (minimal deps)

**Phase 3 - Sidecar:**
14. ActiveOperationsSection (uses ProgressIndicator)
15. ReasoningDisplay (minimal deps)
16. FileOperationsLog (minimal deps)
17. TerminalCommandLog (minimal deps)
18. ToolUsageStats (uses basic charts)
19. BackgroundTasksMonitor (uses ProgressIndicator)
20. MultiAgentStatus (basic version)
21. SidecarPanel (assembles all sections)

**Phase 4 - Unified Chat:**
22. UnifiedAgenticChat (assembles all components)
23. useAgenticEvents hook (event listeners)

**Phase 5 - Visualizations:**
24. MetricsChart (for analytics)
25. GanttChart (for timeline views)
26. DependencyGraph (for agent coordination)
27. TimelineView (event timeline)

**Phase 6 - Mission Control:**
28. TasksDashboard (uses charts)
29. AgentsDashboard (uses graph)
30. ResourceMonitor (uses charts)
31. AnalyticsDashboard (uses charts)
32. MissionControl (assembles dashboards)

**Phase 7 - Advanced Features:**
33. ExtendedThinkingViewer
34. ContextPills
35. ShortcutsManager
36. MCPManager

**Phase 8 - Polish:**
37. Theme system
38. Accessibility improvements
39. Performance optimizations
40. Error boundaries

---

## Backend Integration Order

**Phase 1 - Events:**
1. Add file operation events to executor
2. Add terminal command events
3. Add screenshot events
4. Add approval events
5. Test event emission

**Phase 2 - Commands:**
6. File diff generation command
7. File operations history command
8. Terminal history command
9. Terminal rerun command
10. Approval commands (approve/reject/policies)

**Phase 3 - Database:**
11. Create migration v42 schema
12. Implement file operations persistence
13. Implement terminal command persistence
14. Implement screenshot persistence
15. Implement approval request persistence

**Phase 4 - Enhancement:**
16. Add metadata to existing events
17. Optimize event payload sizes
18. Add event filtering options
19. Implement event batching for performance

---

## Testing Strategy by Priority

### P0 - Critical Components
- UnifiedAgenticChat integration test
- ChatMessageList rendering test
- State management tests
- Event listener tests

### P1 - Core Features
- File operation card tests
- Terminal command card tests
- Diff viewer tests
- Sidecar panel tests

### P2 - Advanced Features
- Mission Control tests
- Analytics dashboard tests
- Charts/graphs rendering tests

### P3 - Polish
- Theme switching tests
- Accessibility tests
- Performance benchmarks

---

## Library Dependencies

### Essential (Install First)
```json
{
  "dependencies": {
    "react-window": "^1.8.10",
    "react-diff-viewer-continued": "^3.3.1",
    "ansi-to-react": "^6.1.6",
    "recharts": "^2.10.3",
    "react-flow": "^11.10.4",
    "zustand": "^4.4.7",
    "immer": "^10.0.3",
    "date-fns": "^2.30.0",
    "lucide-react": "^0.294.0"
  }
}
```

### Optional (Add as Needed)
```json
{
  "dependencies": {
    "@dhtmlx/trial-react-gantt": "^1.0.0",
    "vis-network": "^9.1.9",
    "chart.js": "^4.4.1",
    "react-chartjs-2": "^5.2.0",
    "react-syntax-highlighter": "^15.5.0",
    "remark-gfm": "^4.0.0",
    "remark-math": "^6.0.0",
    "rehype-katex": "^7.0.0"
  }
}
```

---

## Success Criteria

### Functionality
- ✅ All messages render correctly
- ✅ File operations show diffs
- ✅ Terminal commands show output
- ✅ Tools show execution details
- ✅ Agents show real-time status
- ✅ Tasks show progress
- ✅ Approvals work correctly
- ✅ Mission Control provides complete view

### Performance
- ✅ <100ms event latency
- ✅ 60 FPS with 100+ messages
- ✅ <500MB memory usage
- ✅ Smooth scrolling
- ✅ No layout shifts

### User Experience
- ✅ Intuitive navigation
- ✅ Clear visual hierarchy
- ✅ Responsive on all screen sizes
- ✅ Accessible (WCAG AA)
- ✅ Keyboard shortcuts work
- ✅ Themes apply correctly

---

## Summary

This implementation plan provides a **complete roadmap** for building a cutting-edge agentic chat interface with full visibility into all agent operations. The plan is organized by priority tiers, with frontend UI components first, followed by backend integration, advanced features, and polish.

**Total Components:** 40+ individual components
**Total Backend Enhancements:** 20+ events, commands, and database changes
**Libraries Required:** 15+ npm packages

The plan can be executed **incrementally**, with each phase delivering value before moving to the next. All components are designed to be **modular**, **reusable**, and **maintainable**.
