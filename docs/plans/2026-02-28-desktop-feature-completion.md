# Desktop Feature Completion Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire up all orphaned backend features, build missing UI panels, and close competitive gaps vs Claude Desktop / Perplexity / ChatGPT in the Tauri desktop app.

**Architecture:** 8 parallel workstreams — TypeScript (A–F, H) plus Rust (G). Each workstream owns specific files and commits independently. No cross-stream file conflicts. USER HAS AUTHORIZED DIRECT RUST EDITS (all restrictions overridden).

**Tech Stack:** React 19, TypeScript, Zustand v5, Tauri v2 invoke(), Tailwind CSS 4, Lucide icons, Sonner toasts, Radix UI primitives

---

## Workstream A — Composer Feature Unlocks
**Agent: composer-agent**
**Files owned:** `src/components/UnifiedAgenticChat/ChatInputArea.tsx`, `src/components/UnifiedAgenticChat/InputToolbar.tsx`, `src/components/UnifiedAgenticChat/ModelSelectorButton.tsx`, `src/components/UnifiedAgenticChat/SkillMentionPicker.tsx` (new)

---

### Task A1: Research Button in Chat Toolbar

**Files:**
- Modify: `apps/desktop/src/components/UnifiedAgenticChat/InputToolbar.tsx`
- Modify: `apps/desktop/src/stores/researchStore.ts` (or useResearchStore)

**Context:** The full research backend exists and `research_start` Tauri command is registered. The ResearchPanel component exists. There's just no button to open it in the toolbar. The toolbar already has voice, screen capture, file attach buttons — add a Globe icon button next to them.

**Step 1:** Read InputToolbar.tsx fully to understand the button pattern used for existing buttons (voice, file attach, screen capture).

**Step 2:** Add a Research toggle button after the existing toolbar buttons:
```tsx
// In InputToolbar.tsx, add after screen capture button:
import { Globe } from 'lucide-react';

// In JSX:
<button
  type="button"
  onClick={onToggleResearch}
  title="Deep Research (Cmd+Shift+R)"
  className={cn(
    "p-2 rounded-lg transition-colors",
    researchOpen
      ? "text-teal-400 bg-teal-400/10"
      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
  )}
>
  <Globe size={16} />
</button>
```

**Step 3:** Pass `researchOpen` and `onToggleResearch` as props from the parent ChatInputArea, which already controls the ResearchPanel open state (or add it to the unifiedChatStore).

**Step 4:** Add keyboard shortcut Cmd+Shift+R to open research (if not already registered).

**Step 5:** Commit:
```bash
git add apps/desktop/src/components/UnifiedAgenticChat/InputToolbar.tsx
git commit -m "feat(desktop): add research button to chat composer toolbar"
```

---

### Task A2: @Mention Skill Picker in Chat Composer

**Files:**
- Create: `apps/desktop/src/components/UnifiedAgenticChat/SkillMentionPicker.tsx`
- Modify: `apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx`

**Context:** 140 AI employee skills exist as markdown files in `apps/web/.agi/employees/`. The skills system routes messages. There's no @mention UI in the chat. The pattern should be: user types `@` → dropdown appears with searchable skill list → selecting a skill prefixes the message with the skill's routing tag.

**Step 1:** Read `apps/desktop/src/components/Settings/SkillsPluginsSettings.tsx` to understand how skills are loaded and their data structure.

**Step 2:** Read `apps/desktop/src/stores/settingsStore.ts` to find where skills/employees are stored in state.

**Step 3:** Create `SkillMentionPicker.tsx`:
```tsx
// apps/desktop/src/components/UnifiedAgenticChat/SkillMentionPicker.tsx
import { useState, useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';

interface Skill {
  id: string;
  name: string;
  category: string;
  description?: string;
}

interface SkillMentionPickerProps {
  query: string;           // text after the @ symbol
  onSelect: (skill: Skill) => void;
  onClose: () => void;
  anchorRect: DOMRect | null;
}

export function SkillMentionPicker({ query, onSelect, onClose, anchorRect }: SkillMentionPickerProps) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selected, setSelected] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load skills from settingsStore or static import
    // Filter by query
    const allSkills = getAvailableSkills(); // implement based on how skills are stored
    const filtered = allSkills.filter(s =>
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      s.category.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 8);
    setSkills(filtered);
    setSelected(0);
  }, [query]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, skills.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === 'Enter') { e.preventDefault(); if (skills[selected]) onSelect(skills[selected]); }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [skills, selected, onSelect, onClose]);

  if (!skills.length) return null;

  return (
    <div
      ref={ref}
      className="absolute z-50 w-72 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden"
      style={{ bottom: anchorRect ? window.innerHeight - anchorRect.top + 8 : 'auto', left: anchorRect?.left ?? 0 }}
    >
      <div className="p-2 border-b border-zinc-700 text-xs text-zinc-400 font-medium px-3">
        AI Skills — type to filter
      </div>
      {skills.map((skill, i) => (
        <button
          key={skill.id}
          className={cn(
            "w-full text-left px-3 py-2 flex items-center gap-2 transition-colors",
            i === selected ? "bg-teal-500/20 text-teal-300" : "text-zinc-300 hover:bg-zinc-700"
          )}
          onClick={() => onSelect(skill)}
        >
          <span className="font-medium text-sm">{skill.name}</span>
          <span className="text-xs text-zinc-500 ml-auto">{skill.category}</span>
        </button>
      ))}
    </div>
  );
}
```

**Step 4:** In `ChatInputArea.tsx`, detect `@` in the textarea and show the picker:
```tsx
// Add to ChatInputArea state:
const [mentionQuery, setMentionQuery] = useState<string | null>(null);
const [mentionAnchor, setMentionAnchor] = useState<DOMRect | null>(null);

// In the onChange handler for the textarea:
const handleInputChange = (value: string) => {
  setInputValue(value);
  // Detect @ mention
  const match = value.match(/@(\w*)$/);
  if (match) {
    setMentionQuery(match[1]);
    const rect = textareaRef.current?.getBoundingClientRect() ?? null;
    setMentionAnchor(rect);
  } else {
    setMentionQuery(null);
  }
};

// Handle skill selection:
const handleSkillSelect = (skill: Skill) => {
  // Replace the @query with the skill mention
  const newValue = inputValue.replace(/@\w*$/, `@${skill.id} `);
  setInputValue(newValue);
  setMentionQuery(null);
  // Store selected skill for routing
  setSelectedSkill(skill);
};
```

**Step 5:** Render `SkillMentionPicker` in the ChatInputArea JSX when `mentionQuery !== null`.

**Step 6:** Commit:
```bash
git add apps/desktop/src/components/UnifiedAgenticChat/SkillMentionPicker.tsx
git add apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx
git commit -m "feat(desktop): add @mention skill picker to chat composer"
```

---

### Task A3: Thinking Budget Slider

**Files:**
- Modify: `apps/desktop/src/components/UnifiedAgenticChat/ModelSelectorButton.tsx`
- Modify: `apps/desktop/src/stores/modelStore.ts`

**Context:** `thinkingModeEnabled: boolean` exists in modelStore. The UI shows a boolean toggle. Replace with a budget slider (Off / 1K / 4K / 8K / 16K / 32K tokens) for models that support thinking. The budget value should be passed with the invoke call (already added in previous sprint as `enableThinking`).

**Step 1:** Read `ModelSelectorButton.tsx` to find the current thinking toggle component.

**Step 2:** Add `thinkingBudget: number` (default 8192) to modelStore alongside `thinkingModeEnabled`. Add `setThinkingBudget(budget: number)` action.

**Step 3:** Replace the boolean toggle with a budget selector in ModelSelectorButton:
```tsx
const BUDGET_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '1K', value: 1024 },
  { label: '4K', value: 4096 },
  { label: '8K', value: 8192 },
  { label: '16K', value: 16384 },
  { label: '32K', value: 32768 },
];

// In JSX (shown when model has thinking: true capability):
<div className="flex items-center gap-1 mt-2">
  <span className="text-xs text-zinc-400 mr-1">Think:</span>
  {BUDGET_OPTIONS.map(opt => (
    <button
      key={opt.value}
      onClick={() => {
        setThinkingBudget(opt.value);
        if (opt.value === 0) disableThinking();
        else enableThinking();
      }}
      className={cn(
        "px-2 py-0.5 rounded text-xs transition-colors",
        currentBudget === opt.value
          ? "bg-teal-500/30 text-teal-300 border border-teal-500/50"
          : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
      )}
    >
      {opt.label}
    </button>
  ))}
</div>
```

**Step 4:** Update the invoke payload in ChatInputArea to pass `thinkingBudget` alongside `enableThinking`.

**Step 5:** Update `docs/rust-fixes-needed.md` to note that `thinking_budget` from frontend should be used as the `budget_tokens` in Anthropic's thinking config instead of the hardcoded 8192.

**Step 6:** Commit:
```bash
git commit -m "feat(desktop): add thinking budget selector to model picker"
```

---

### Task A4: Inline Fork Button on Messages

**Files:**
- Modify: `apps/desktop/src/components/UnifiedAgenticChat/MessageBubble/MessageActions.tsx` (or equivalent message action bar)

**Context:** CheckpointManager exists with branch support. Need a "Fork" button in the message context menu / hover actions that creates a checkpoint at that message.

**Step 1:** Read `MessageActions.tsx` (or wherever hover actions appear on messages) to understand the action bar pattern.

**Step 2:** Add a Fork button (GitFork icon from lucide) to the message actions bar:
```tsx
import { GitFork } from 'lucide-react';

// In message actions:
<button
  onClick={() => handleForkFromMessage(message.id)}
  title="Fork conversation from here"
  className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
>
  <GitFork size={14} />
</button>
```

**Step 3:** Implement `handleForkFromMessage`:
```tsx
const handleForkFromMessage = async (messageId: string) => {
  try {
    await invoke('checkpoint_create', {
      conversationId: currentConversationId,
      messageId,
      branchName: `fork-${Date.now()}`,
      label: `Fork from message ${messageId.slice(0, 8)}`
    });
    toast.success('Conversation forked — new branch created');
  } catch (e) {
    toast.error('Failed to fork conversation');
  }
};
```

**Step 4:** Verify the `checkpoint_create` command exists in lib.rs. If the exact command name differs, grep for `checkpoint` in `src-tauri/src/sys/commands/` and use the correct name.

**Step 5:** Commit:
```bash
git commit -m "feat(desktop): add fork conversation button to message actions"
```

---

## Workstream B — Conversation & Calendar Features
**Agent: conversation-agent**
**Files owned:** `src/components/UnifiedAgenticChat/MessageActions.tsx`, `src/components/Settings/`, `src/stores/calendarStore.ts`, new share components

---

### Task B1: Full Conversation Sharing

**Files:**
- Create: `apps/desktop/src/components/UnifiedAgenticChat/ShareConversationDialog.tsx`
- Modify: `apps/desktop/src/components/UnifiedAgenticChat/Sidebar.tsx` (add share button to conversation context menu)

**Step 1:** Read `src/components/Artifacts/ShareArtifactDialog.tsx` to understand the existing share pattern and reuse the same design.

**Step 2:** Create `ShareConversationDialog.tsx`:
```tsx
// apps/desktop/src/components/UnifiedAgenticChat/ShareConversationDialog.tsx
import { useState } from 'react';
import { Copy, Check, Link } from 'lucide-react';
import { invoke } from '../../lib/tauri-mock';
import { toast } from 'sonner';

interface ShareConversationDialogProps {
  conversationId: string;
  conversationTitle: string;
  onClose: () => void;
}

export function ShareConversationDialog({ conversationId, conversationTitle, onClose }: ShareConversationDialogProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateLink = async () => {
    setLoading(true);
    try {
      const result = await invoke<{ url: string }>('conversation_share', { conversationId });
      setShareUrl(result.url);
    } catch {
      toast.error('Failed to generate share link');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Link copied to clipboard');
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-800 rounded-2xl p-6 w-96 shadow-2xl border border-zinc-700" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <Link size={18} className="text-teal-400" />
          <h3 className="text-white font-semibold">Share Conversation</h3>
        </div>
        <p className="text-zinc-400 text-sm mb-4">"{conversationTitle}"</p>
        {!shareUrl ? (
          <button
            onClick={generateLink}
            disabled={loading}
            className="w-full py-2.5 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
          >
            {loading ? 'Generating...' : 'Generate Share Link'}
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 bg-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 outline-none"
            />
            <button
              onClick={copyLink}
              className="p-2 bg-teal-500 hover:bg-teal-400 text-white rounded-lg transition-colors"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        )}
        <button onClick={onClose} className="w-full mt-3 py-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
```

**Step 3:** Add "Share" option to the conversation context menu in Sidebar.tsx (the ... menu on each conversation). Check if `conversation_share` is a registered Tauri command — if not, note it needs to be added to the Rust spec.

**Step 4:** Commit: `feat(desktop): add share conversation dialog with link generation`

---

### Task B2: Wire Calendar UI to Existing Commands

**Files:**
- Modify: `apps/desktop/src/stores/calendarStore.ts`
- Modify: existing calendar UI component (find via Glob `src/components/**/Calendar*`)

**Context:** Calendar Tauri commands exist: `calendar_connect`, `calendar_list_accounts`, `calendar_list_events`, `calendar_create_event`, `calendar_update_event`. The calendarStore exists but only calls `calendar_delete_event`. Wire the missing ones.

**Step 1:** Read `apps/desktop/src/stores/calendarStore.ts` fully.

**Step 2:** Find the calendar UI component: `Glob apps/desktop/src/components/**/Calendar*`

**Step 3:** Add these actions to calendarStore:
```typescript
fetchAccounts: async () => {
  const accounts = await invoke<CalendarAccount[]>('calendar_list_accounts');
  set({ accounts });
},
fetchEvents: async (accountId: string, startDate: string, endDate: string) => {
  const events = await invoke<CalendarEvent[]>('calendar_list_events', {
    accountId, startDate, endDate
  });
  set({ events });
},
createEvent: async (accountId: string, event: NewCalendarEvent) => {
  await invoke('calendar_create_event', { accountId, event });
  await get().fetchEvents(accountId, event.startDate, event.endDate);
},
connectAccount: async (provider: 'google' | 'outlook') => {
  await invoke('calendar_connect', { provider });
  await get().fetchAccounts();
},
```

**Step 4:** Update the calendar UI to call these actions on mount and when user requests.

**Step 5:** Commit: `feat(desktop): wire calendar UI to existing tauri commands`

---

### Task B3: Agent Mode Toggle in Chat Composer

**Files:**
- Modify: `apps/desktop/src/components/UnifiedAgenticChat/InputToolbar.tsx`

**Context:** An agent mode toggle exists somewhere in the Workforce section but not in the main chat toolbar. Add a Bot/Zap icon button to the toolbar that toggles agent mode for the current message.

**Step 1:** Grep for `enableAgentMode` or `agentMode` in the chat store/input area.

**Step 2:** Add agent mode toggle button to InputToolbar:
```tsx
import { Zap } from 'lucide-react';

<button
  type="button"
  onClick={onToggleAgentMode}
  title="Agent Mode — AI executes multi-step tasks autonomously"
  className={cn(
    "p-2 rounded-lg transition-colors",
    agentModeEnabled
      ? "text-amber-400 bg-amber-400/10"
      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
  )}
>
  <Zap size={16} />
</button>
```

**Step 3:** Wire to the existing `enable_agent_mode` field in the chat send payload (already present in ChatSendMessageRequest type).

**Step 4:** Commit: `feat(desktop): add agent mode toggle to chat composer toolbar`

---

## Workstream C — Agentic Task Panel
**Agent: agentic-task-agent**
**Files owned:** `src/components/AGI/` (new files), `src/stores/agentTaskStore.ts` (new)

---

### Task C1: Create Agentic Task Panel

**Files:**
- Create: `apps/desktop/src/components/AGI/AgentTaskPanel.tsx`
- Create: `apps/desktop/src/components/AGI/AgentTaskCreator.tsx`
- Create: `apps/desktop/src/components/AGI/AgentTaskMonitor.tsx`
- Create: `apps/desktop/src/stores/agentTaskStore.ts`
- Modify: `apps/desktop/src/components/UnifiedAgenticChat/Sidebar.tsx` (add Tasks entry in sidebar nav)

**Context:** These Tauri commands are registered and ready: `agi_submit_goal`, `agi_list_goals`, `agi_get_goal_status`, `agi_get_reflection_insights`. Build a "Tasks" panel in the sidebar that lets users create and monitor autonomous AI tasks.

**Step 1:** Read `apps/desktop/src-tauri/src/sys/commands/` to find the AGI command signatures (what parameters they accept, what they return).

**Step 2:** Create `agentTaskStore.ts`:
```typescript
// apps/desktop/src/stores/agentTaskStore.ts
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';

export interface AgentTask {
  id: string;
  goal: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
  iterations?: number;
  result?: string;
  insights?: string[];
  error?: string;
}

interface AgentTaskState {
  tasks: AgentTask[];
  loading: boolean;
  submitGoal: (goal: string, options?: { maxIterations?: number; parallel?: boolean }) => Promise<string>;
  fetchTasks: () => Promise<void>;
  getTaskStatus: (taskId: string) => Promise<AgentTask>;
  cancelTask: (taskId: string) => Promise<void>;
}

export const useAgentTaskStore = create<AgentTaskState>()(
  devtools(
    persist(
      (set, get) => ({
        tasks: [],
        loading: false,
        submitGoal: async (goal, options = {}) => {
          const result = await invoke<{ id: string }>('agi_submit_goal', {
            goal,
            maxIterations: options.maxIterations ?? 10,
            parallel: options.parallel ?? false,
          });
          await get().fetchTasks();
          return result.id;
        },
        fetchTasks: async () => {
          set({ loading: true });
          try {
            const tasks = await invoke<AgentTask[]>('agi_list_goals');
            set({ tasks, loading: false });
          } catch {
            set({ loading: false });
          }
        },
        getTaskStatus: async (taskId) => {
          return await invoke<AgentTask>('agi_get_goal_status', { goalId: taskId });
        },
        cancelTask: async (taskId) => {
          await invoke('agi_cancel_goal', { goalId: taskId });
          await get().fetchTasks();
        },
      }),
      { name: 'agiworkforce-agent-tasks' }
    )
  )
);
```

**Step 3:** Create `AgentTaskCreator.tsx` — a form with:
- Goal textarea (multi-line, "What do you want the AI to accomplish?")
- Max iterations slider (1-20)
- Parallel execution toggle
- "Launch Task" submit button

**Step 4:** Create `AgentTaskMonitor.tsx` — a list of tasks with:
- Status badge (pending/running/completed/failed) with color coding
- Goal text (truncated)
- Running time or completion time
- Expand row → shows result + reflection insights
- Cancel button for running tasks
- Auto-refresh every 5s for running tasks

**Step 5:** Create `AgentTaskPanel.tsx` that tabs between Creator and Monitor.

**Step 6:** Add Tasks button to the sidebar navigation (Zap icon, labeled "Tasks").

**Step 7:** Commit: `feat(desktop): add agentic task panel with create and monitor UI`

---

## Workstream D — Connectors Gallery UI
**Agent: connectors-agent**
**Files owned:** `src/components/Connectors/` (all new), `src/stores/connectorsStore.ts` (new)

---

### Task D1: ConnectorCard Component

**Files:**
- Create: `apps/desktop/src/components/Connectors/ConnectorCard.tsx`
- Create: `apps/desktop/src/components/Connectors/ConnectorsGallery.tsx`
- Create: `apps/desktop/src/components/Connectors/ConnectorOAuthFlow.tsx`
- Create: `apps/desktop/src/stores/connectorsStore.ts`

**Context:** OAuth types exist in `src/types/mcp.ts` (McpOAuthProvider: 'github' | 'google_drive' | 'slack'). Phase 1 connectors: Gmail, Google Drive, Notion, Slack, GitHub. Build a gallery UI similar to how Claude Desktop shows connectors.

**Step 1:** Read `src/types/mcp.ts` to understand existing OAuth types.

**Step 2:** Define 10 Phase 1 connectors in a static config:
```typescript
// apps/desktop/src/components/Connectors/connectorDefinitions.ts
export const CONNECTORS = [
  { id: 'gmail', name: 'Gmail', icon: '📧', description: 'Read, search, and send emails', provider: 'google', category: 'Communication', color: 'red' },
  { id: 'google_drive', name: 'Google Drive', icon: '📁', description: 'Access files and folders', provider: 'google', category: 'Storage', color: 'blue' },
  { id: 'notion', name: 'Notion', icon: '📝', description: 'Read and edit pages and databases', provider: 'notion', category: 'Productivity', color: 'gray' },
  { id: 'slack', name: 'Slack', icon: '💬', description: 'Send messages and search channels', provider: 'slack', category: 'Communication', color: 'purple' },
  { id: 'github', name: 'GitHub', icon: '🐙', description: 'Read repos, issues, and PRs', provider: 'github', category: 'Development', color: 'gray' },
  { id: 'google_sheets', name: 'Google Sheets', icon: '📊', description: 'Read and update spreadsheets', provider: 'google', category: 'Productivity', color: 'green' },
  { id: 'outlook', name: 'Outlook', icon: '📨', description: 'Microsoft email and calendar', provider: 'microsoft', category: 'Communication', color: 'blue' },
  { id: 'onedrive', name: 'OneDrive', icon: '☁️', description: 'Microsoft file storage', provider: 'microsoft', category: 'Storage', color: 'blue' },
  { id: 'linear', name: 'Linear', icon: '🎯', description: 'Issues, projects, and cycles', provider: 'linear', category: 'Development', color: 'purple' },
  { id: 'jira', name: 'Jira', icon: '📋', description: 'Project management and tracking', provider: 'atlassian', category: 'Development', color: 'blue' },
];
```

**Step 3:** Create `ConnectorCard.tsx`:
```tsx
// Shows: icon, name, description, status (connected/disconnected), connect/disconnect button
// Connected state: green dot + "Connected" badge + "Disconnect" button
// Disconnected state: gray dot + "Connect" button → triggers OAuth flow
interface ConnectorCardProps {
  connector: ConnectorDef;
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}
```

**Step 4:** Create `ConnectorsGallery.tsx` — a grid of ConnectorCards grouped by category, with a search/filter bar at top.

**Step 5:** Create `connectorsStore.ts`:
```typescript
// Tracks connected status per connector ID
// connect(id) → invoke('mcp_oauth_start', { provider: id })
// disconnect(id) → invoke('mcp_oauth_revoke', { provider: id })
// fetchConnected() → invoke('mcp_list_connected_providers')
```

**Step 6:** Add Connectors tab to Settings (Integrations tab or new Connectors tab).

**Step 7:** Commit: `feat(desktop): add connectors gallery with oauth flow ui`

---

## Workstream E — Computer Use Live View
**Agent: computer-use-agent**
**Files owned:** `src/components/ComputerUse/` (new files)

---

### Task E1: Computer Use Monitor Panel

**Files:**
- Create: `apps/desktop/src/components/ComputerUse/ComputerUseMonitor.tsx`
- Create: `apps/desktop/src/components/ComputerUse/ScreenPreview.tsx`
- Create: `apps/desktop/src/components/ComputerUse/ActionLog.tsx`
- Create: `apps/desktop/src/stores/computerUseStore.ts`

**Context:** Computer use Tauri commands exist: `computer_use_start_session`, `computer_use_capture_screen`, `computer_use_click`, `computer_use_type_text`. Claude models with `computerUse: true` can call these. Build a monitoring panel that shows the live screen and action log when computer use is active.

**Step 1:** Read `src-tauri/src/sys/commands/` to find exact computer use command signatures. Specifically look at what `computer_use_capture_screen` returns (base64 image? URL?).

**Step 2:** Create `computerUseStore.ts`:
```typescript
interface ComputerUseState {
  isActive: boolean;
  sessionId: string | null;
  currentScreenshot: string | null; // base64 or URL
  actionLog: ComputerAction[];
  startSession: () => Promise<void>;
  stopSession: () => Promise<void>;
  captureScreen: () => Promise<string>;
  logAction: (action: ComputerAction) => void;
}
```

**Step 3:** Create `ScreenPreview.tsx`:
```tsx
// Shows live screenshot with:
// - Image from computerUseStore.currentScreenshot
// - Semi-transparent overlay showing last click position (red circle pulse animation)
// - Auto-refresh every 2s when session is active
// - Resolution info + timestamp
```

**Step 4:** Create `ActionLog.tsx`:
```tsx
// Scrollable log of computer actions:
// [timestamp] CLICK at (x, y) on element "Submit Button"
// [timestamp] TYPE "hello world"
// [timestamp] SCREENSHOT captured
// Each entry has an icon matching the action type
```

**Step 5:** Create `ComputerUseMonitor.tsx` combining ScreenPreview + ActionLog in a resizable split panel. Add a "Start Computer Use Session" button that calls `computer_use_start_session`.

**Step 6:** Listen to Tauri events (`computer_use:action`, `computer_use:screenshot`) to update the store reactively.

**Step 7:** Add a Computer Use button to the sidebar (Monitor icon) that opens the panel.

**Step 8:** Commit: `feat(desktop): add computer use live monitor with screen preview and action log`

---

## Workstream F — Document Generation Pipeline
**Agent: doc-gen-agent**
**Files owned:** `src/components/Documents/` (new), `src/api/documents.ts` (new or extend)

---

### Task F1: Document Generation UI

**Files:**
- Create: `apps/desktop/src/components/Documents/DocumentGenerator.tsx`
- Create: `apps/desktop/src/components/UnifiedAgenticChat/InlineToolResults/InlineDocumentGeneration.tsx` (extend existing if present)
- Modify: `apps/desktop/src/stores/documentStore.ts`

**Context:** `document_create_pdf`, `document_create_word`, `document_create_excel` commands are registered. The document store only reads documents. Wire up generation commands.

**Step 1:** Read the current `documentStore.ts` and any existing InlineDocumentGeneration component.

**Step 2:** Read the Rust command signatures from `src-tauri/src/sys/commands/` for `document_create_pdf`, `document_create_word`, `document_create_excel` — understand what parameters they accept (content? template? title?).

**Step 3:** Add generation actions to documentStore:
```typescript
generatePdf: async (title: string, content: string, options?: PdfOptions) => {
  const result = await invoke<{ path: string; url?: string }>('document_create_pdf', {
    title, content, options
  });
  toast.success(`PDF created: ${title}`);
  return result;
},
generateWord: async (title: string, content: string) => {
  return await invoke<{ path: string }>('document_create_word', { title, content });
},
generateExcel: async (title: string, data: unknown[][], headers: string[]) => {
  return await invoke<{ path: string }>('document_create_excel', { title, data, headers });
},
```

**Step 4:** Create `DocumentGenerator.tsx` — a form component (shown as a slash command `/doc` or as a tool result renderer):
```tsx
// Format selector: PDF | Word | Excel
// Title input
// Content textarea (or auto-filled from conversation context)
// Generate button → calls appropriate store action
// Result: download link + file size + open button
```

**Step 5:** Wire the document generator as a slash command `/pdf`, `/word`, `/excel` that pre-fills with conversation context.

**Step 6:** Update `InlineDocumentGeneration.tsx` to show generated documents with:
- File type icon (PDF red, Word blue, Excel green)
- File name + size
- Download button (`invoke('file_open_with_default_app', { path })`)
- Open in folder button

**Step 7:** Commit: `feat(desktop): add pdf word excel document generation with inline download ui`

---

## Workstream G — Rust Fixes
**Agent: rust-fixes-agent**
**Files owned:** `apps/desktop/src-tauri/src/` Rust files only

**USER HAS AUTHORIZED DIRECT RUST EDITS.**

---

### Task G1: Fix DeepSeek R1 Model ID (B2)

**File:** `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`

**Context:** DeepSeek R1 requests are sent as `"deepseek-r1"` but the actual API model ID is `"deepseek-reasoner"`. Every R1 request returns 404.

**Step 1:** Read `provider_adapter.rs`. Search for `"deepseek-r1"` or `"deepseek_r1"` string literals.

**Step 2:** Find the model ID canonicalization function (likely `canonicalize_model` or similar).

**Step 3:** Add mapping:
```rust
"deepseek-r1" | "deepseek-r1-zero" => "deepseek-reasoner",
```

**Step 4:** Run: `cargo check 2>&1 | head -30` — ensure no errors.

**Step 5:** Commit: `fix(rust): map deepseek-r1 to deepseek-reasoner model id`

---

### Task G2: Apply Remaining B3 Rust Changes

**Files:** `src-tauri/src/features/extension.rs`, `src-tauri/src/core/agent/agent.rs`, `src-tauri/src/core/agent/executor.rs`, `src-tauri/src/core/agent/mod.rs`, `src-tauri/src/automation/mod.rs`

**Step 1:** Read `docs/rust-fixes-needed.md` for the full B3 spec.

**Step 2:** For each file listed in B3, read the file, apply the specified change, run `cargo check`, commit individually.

**Step 3:** Commit each fix separately with descriptive message.

---

### Task G3: Add conversation_share Tauri Command

**File:** `apps/desktop/src-tauri/src/sys/commands/` (find or create conversation sharing command)

**Context:** Workstream B needs `conversation_share` command. Check if it exists. If not, add a stub that generates a shareable URL via the web API.

**Step 1:** Grep for `conversation_share` in `src-tauri/src/`.

**Step 2:** If missing, create the command in the appropriate commands file:
```rust
#[tauri::command]
pub async fn conversation_share(
    conversation_id: String,
    app_handle: AppHandle,
) -> Result<ShareResponse, String> {
    // POST to web API /api/conversations/share
    // Returns { url: String, expires_at: Option<String> }
    todo!("Implement conversation sharing via web API")
}
```

**Step 3:** Register in `lib.rs` invoke handler list.

**Step 4:** Run `cargo check`.

**Step 5:** Commit: `feat(rust): add conversation_share tauri command stub`

---

## Commit Order by Agent

### composer-agent commits:
1. `feat(desktop): add research button to chat composer toolbar`
2. `feat(desktop): add @mention skill picker to chat composer`
3. `feat(desktop): add thinking budget selector to model picker`
4. `feat(desktop): add fork conversation button to message actions`

### conversation-agent commits:
1. `feat(desktop): add share conversation dialog with link generation`
2. `feat(desktop): wire calendar ui to existing tauri commands`
3. `feat(desktop): add agent mode toggle to chat composer toolbar`

### agentic-task-agent commits:
1. `feat(desktop): add agent task store with agi goal management`
2. `feat(desktop): add agentic task panel with create and monitor ui`

### connectors-agent commits:
1. `feat(desktop): add connector definitions and connectors store`
2. `feat(desktop): add connector card component with oauth flow`
3. `feat(desktop): add connectors gallery to settings integrations tab`

### computer-use-agent commits:
1. `feat(desktop): add computer use store and session management`
2. `feat(desktop): add screen preview component with live refresh`
3. `feat(desktop): add computer use monitor panel with action log`

### doc-gen-agent commits:
1. `feat(desktop): wire document generation commands to document store`
2. `feat(desktop): add document generator with pdf word excel support`
3. `feat(desktop): add inline document result with download ui`

### rust-fixes-agent commits:
1. `fix(rust): map deepseek-r1 to deepseek-reasoner model id`
2. `fix(rust): apply b3 rust batch fixes`
3. `feat(rust): add conversation_share tauri command`

---

## Workstream H — Voice Input (Wispr Flow Style)
**Agent: voice-agent**
**Files owned:** `src/components/Voice/` (new), `src/stores/voiceInputStore.ts` (new), `src-tauri/src/features/speech/` (Rust)

**USER HAS AUTHORIZED DIRECT RUST EDITS.**

---

### Task H1: Wispr Flow-Style Global Hotkey Dictation

**Context:** Wispr Flow is a macOS voice input tool that lets you hold a key anywhere to dictate. Our desktop app should have the same: hold Option (⌥) or Ctrl+Space anywhere in the app → recording indicator appears → speak → release → text is transcribed and inserted into the focused text field (chat composer, any input). The app already has `vad` and `local-whisper` optional Rust features + `src/features/speech/` module.

**Files:**
- Create: `apps/desktop/src/components/Voice/VoiceInputOverlay.tsx`
- Create: `apps/desktop/src/stores/voiceInputStore.ts`
- Modify: `apps/desktop/src/components/UnifiedAgenticChat/ChatInputArea.tsx` (add voice-to-text integration)
- Modify: `apps/desktop/src-tauri/src/features/speech/mod.rs` (add start/stop/transcribe commands if missing)

**Step 1:** Read `apps/desktop/src-tauri/src/features/speech/mod.rs` and `apps/desktop/src/components/Voice/` to understand existing voice infrastructure.

**Step 2:** Grep for `global_shortcut` or `register_shortcut` in `src-tauri/` to see if global shortcuts are already set up.

**Step 3:** Create `voiceInputStore.ts`:
```typescript
// apps/desktop/src/stores/voiceInputStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { invoke } from '../lib/tauri-mock';

type VoiceMode = 'idle' | 'listening' | 'transcribing';

interface VoiceInputState {
  mode: VoiceMode;
  transcript: string;
  error: string | null;
  // Wispr Flow settings
  hotkey: 'option' | 'ctrl+space' | 'ctrl+shift+v';
  provider: 'local_whisper' | 'deepgram' | 'openai_whisper';
  language: string;
  startListening: () => Promise<void>;
  stopListening: () => Promise<void>;
  setHotkey: (hotkey: VoiceInputState['hotkey']) => void;
  setProvider: (provider: VoiceInputState['provider']) => void;
  clearTranscript: () => void;
}

export const useVoiceInputStore = create<VoiceInputState>()(
  devtools((set, get) => ({
    mode: 'idle',
    transcript: '',
    error: null,
    hotkey: 'option',
    provider: 'local_whisper',
    language: 'en',
    startListening: async () => {
      set({ mode: 'listening', transcript: '', error: null });
      try {
        await invoke('speech_start_recording', { provider: get().provider });
      } catch (e) {
        set({ mode: 'idle', error: String(e) });
      }
    },
    stopListening: async () => {
      set({ mode: 'transcribing' });
      try {
        const result = await invoke<{ text: string }>('speech_stop_and_transcribe', {
          provider: get().provider,
          language: get().language,
        });
        set({ mode: 'idle', transcript: result.text });
      } catch (e) {
        set({ mode: 'idle', error: String(e) });
      }
    },
    setHotkey: (hotkey) => set({ hotkey }),
    setProvider: (provider) => set({ provider }),
    clearTranscript: () => set({ transcript: '' }),
  }), { name: 'voice-input-store' })
);
```

**Step 4:** Create `VoiceInputOverlay.tsx` — a floating recording indicator shown anywhere in the app while listening:
```tsx
// apps/desktop/src/components/Voice/VoiceInputOverlay.tsx
import { useEffect } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { useVoiceInputStore } from '../../stores/voiceInputStore';
import { cn } from '../../lib/utils';

export function VoiceInputOverlay() {
  const { mode, transcript, error } = useVoiceInputStore();

  if (mode === 'idle') return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2">
      {/* Pulsing mic circle */}
      <div className={cn(
        "w-16 h-16 rounded-full flex items-center justify-center shadow-2xl border-2 transition-all",
        mode === 'listening'
          ? "bg-red-500/90 border-red-300 animate-pulse"
          : "bg-zinc-700/90 border-zinc-500"
      )}>
        {mode === 'listening' && <Mic size={24} className="text-white" />}
        {mode === 'transcribing' && <Loader2 size={24} className="text-white animate-spin" />}
      </div>

      {/* Status label */}
      <div className="bg-zinc-800/95 backdrop-blur-sm border border-zinc-700 rounded-full px-4 py-1.5 text-sm text-zinc-200 shadow-lg">
        {mode === 'listening' ? '⌥ Release to transcribe' : 'Transcribing...'}
      </div>

      {/* Live transcript preview */}
      {transcript && (
        <div className="max-w-sm bg-zinc-800/95 backdrop-blur-sm border border-zinc-700 rounded-xl px-4 py-2 text-sm text-zinc-300 shadow-lg text-center">
          {transcript}
        </div>
      )}

      {error && (
        <div className="text-red-400 text-xs">{error}</div>
      )}
    </div>
  );
}
```

**Step 5:** Add global hotkey listeners using Tauri's global shortcut API. In `src/App.tsx` or a new `useVoiceHotkey.ts` hook:
```tsx
// apps/desktop/src/hooks/useVoiceHotkey.ts
import { useEffect } from 'react';
import { useVoiceInputStore } from '../stores/voiceInputStore';
import { invoke } from '../lib/tauri-mock';

export function useVoiceHotkey() {
  const { startListening, stopListening, hotkey } = useVoiceInputStore();

  useEffect(() => {
    // Register global shortcut via Tauri
    const hotkeyStr = hotkey === 'option' ? 'Option' : hotkey === 'ctrl+space' ? 'CommandOrControl+Space' : 'CommandOrControl+Shift+V';

    invoke('register_voice_hotkey', { hotkey: hotkeyStr }).catch(() => {
      // Fall back to keyboard event listener
    });

    // Listen for Tauri events from global shortcut
    const unlisten = window.__TAURI_INTERNALS__?.tauri?.listen?.('voice:hotkey:pressed', () => {
      startListening();
    });
    const unlistenRelease = window.__TAURI_INTERNALS__?.tauri?.listen?.('voice:hotkey:released', () => {
      stopListening();
    });

    return () => {
      unlisten?.then((f: () => void) => f());
      unlistenRelease?.then((f: () => void) => f());
    };
  }, [hotkey, startListening, stopListening]);
}
```

**Step 6:** In `ChatInputArea.tsx`, watch `voiceInputStore.transcript` and when it changes, append it to the input value:
```tsx
const transcript = useVoiceInputStore(s => s.transcript);
const clearTranscript = useVoiceInputStore(s => s.clearTranscript);

useEffect(() => {
  if (transcript) {
    setInputValue(prev => prev + (prev ? ' ' : '') + transcript);
    clearTranscript();
    textareaRef.current?.focus();
  }
}, [transcript, clearTranscript]);
```

**Step 7:** Add the VoiceInputOverlay to the App root layout (above everything else, in `App.tsx` or the main layout component).

**Step 8:** Add Voice Input settings to Settings → General (or new Voice tab):
- Hotkey selector (Option / Ctrl+Space / Ctrl+Shift+V)
- Provider selector (Local Whisper / Deepgram / OpenAI Whisper)
- Language selector (en/es/fr/de/ja/zh)
- Test button

**Step 9:** For Rust — check if `speech_start_recording` and `speech_stop_and_transcribe` commands exist. If not, add stubs that call into the existing `src/features/speech/` module:
```rust
// In src-tauri/src/sys/commands/ or src/features/speech/mod.rs
#[tauri::command]
pub async fn speech_start_recording(provider: String) -> Result<(), String> {
    // Start audio capture using the speech module
    // Use local microphone recording
    todo!("Wire to speech module audio capture")
}

#[tauri::command]
pub async fn speech_stop_and_transcribe(
    provider: String,
    language: String,
) -> Result<TranscriptResult, String> {
    // Stop recording and transcribe with the given provider
    // Local: whisper-rs inference
    // Cloud: Deepgram/OpenAI API
    todo!("Wire to speech module transcription")
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct TranscriptResult {
    pub text: String,
    pub confidence: f32,
    pub language: String,
}
```

**Step 10:** Register any new commands in `lib.rs`.

**Step 11:** Commit sequence:
```bash
git commit -m "feat(desktop): add voice input store and wispr flow hotkey system"
git commit -m "feat(desktop): add voice input overlay with pulsing recording indicator"
git commit -m "feat(desktop): wire voice transcript to chat composer input"
git commit -m "feat(desktop): add voice input settings to settings panel"
git commit -m "feat(rust): add speech recording and transcription tauri commands"
```

---

## Post-Implementation Checklist

- [ ] `pnpm typecheck` passes — no TypeScript errors
- [ ] `pnpm lint` passes — no ESLint errors
- [ ] `cargo check` passes — no Rust compile errors
- [ ] `cargo clippy` passes — no Rust warnings
- [ ] Research button appears in chat toolbar and opens ResearchPanel
- [ ] Typing `@` in chat shows skill picker dropdown
- [ ] Thinking budget selector shows for Claude/GPT-5.2 models, hidden for others
- [ ] Fork button appears in message hover actions
- [ ] Share Conversation dialog generates and copies a URL
- [ ] Calendar UI shows events after connecting account
- [ ] Agent Tasks panel shows in sidebar, creates and monitors goals
- [ ] Connectors gallery shows 10 connectors with connect/disconnect
- [ ] Computer Use panel shows screen preview when session active
- [ ] PDF/Word/Excel generation produces downloadable files
- [ ] DeepSeek R1 requests succeed (no 404)
- [ ] Hold Option/hotkey → VoiceInputOverlay appears with pulsing red mic
- [ ] Release → transcript inserted into chat composer
- [ ] Voice settings page shows hotkey + provider + language options
