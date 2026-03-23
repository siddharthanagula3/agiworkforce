# Specification: UI Redesign — Parallel Agent Coordination

Generated: 2026-03-22T00:00:00Z
Source: `/Users/siddhartha/Desktop/agiworkforce/docs/UI_REDESIGN_SPEC.md` (28 approved decisions)
Scope: Desktop (Tauri) + Web (Next.js) chat interfaces via shared `packages/chat/`

---

## Task Overview

Redesign the desktop and web chat UIs to match a Claude.ai-inspired design language. The core architectural change is creating a new shared package `packages/chat/` that both `apps/desktop/` and `apps/web/` import from. The redesign covers layout, sidebar, input bar, model selector, thinking blocks, artifacts, projects, settings, command palette, themes, and design tokens.

---

## Team Composition

- **Agent A: Package Foundation** -- Creates `packages/chat/` scaffolding, design tokens, runtime interface, types, and UI primitives.
- **Agent B: Core Chat Components** -- Builds Sidebar, EmptyState, ChatInput, ModelSelector, PlusMenu, MessageList, MessageBubble, ActionBar, ConversationHeader, QuickChips.
- **Agent C: Advanced Features** -- Builds ThinkingBlock, ToolTimeline, CitationPill, WebSearchCard, ArtifactPanel, ImageGenCard, VideoGenCard, DownloadCard.
- **Agent D: Hub & Settings** -- Builds Customize hub, Settings modal, Project detail page, Connector marketplace, Command palette, UserProfile.
- **Agent E: Integration** -- Wires desktop and web apps to consume `@agiworkforce/chat`, applies themes, runtime adapters, final testing.

---

## File Allocation

### Agent A: Package Foundation

**Creates (new files):**

- `packages/chat/package.json`
- `packages/chat/tsconfig.json`
- `packages/chat/src/index.ts`
- `packages/chat/src/lib/tokens.ts`
- `packages/chat/src/lib/runtime.ts`
- `packages/chat/src/lib/utils.ts`
- `packages/chat/src/lib/types.ts`
- `packages/chat/src/lib/greetings.ts`
- `packages/chat/src/styles/globals.css`
- `packages/chat/src/styles/themes/dusk.css`
- `packages/chat/src/styles/themes/dawn.css`
- `packages/chat/src/components/ui/Button.tsx`
- `packages/chat/src/components/ui/Input.tsx`
- `packages/chat/src/components/ui/Dialog.tsx`
- `packages/chat/src/components/ui/Popover.tsx`
- `packages/chat/src/components/ui/DropdownMenu.tsx`
- `packages/chat/src/components/ui/Badge.tsx`
- `packages/chat/src/components/ui/Toggle.tsx`
- `packages/chat/src/components/ui/ScrollArea.tsx`
- `packages/chat/src/components/ui/ResizeHandle.tsx`
- `packages/chat/src/components/ui/Tooltip.tsx`
- `packages/chat/src/stores/chatStore.ts`
- `packages/chat/src/stores/modelStore.ts`
- `packages/chat/src/stores/uiStore.ts`
- `packages/chat/src/stores/projectStore.ts`
- `packages/chat/src/stores/settingsStore.ts`
- `packages/chat/src/hooks/useChat.ts`
- `packages/chat/src/hooks/useModel.ts`
- `packages/chat/src/hooks/useTheme.ts`
- `packages/chat/src/hooks/useSidebar.ts`
- `packages/chat/src/hooks/useArtifact.ts`
- `packages/chat/src/hooks/useKeyboard.ts`

**DO NOT TOUCH:**

- Any file in `apps/desktop/` or `apps/web/`
- Any file in existing `packages/types/`, `packages/utils/`, `packages/stores/`, `packages/api/`, `packages/runtime/`

### Agent B: Core Chat Components

**Creates (new files):**

- `packages/chat/src/components/ChatInterface.tsx`
- `packages/chat/src/components/Sidebar.tsx`
- `packages/chat/src/components/ConversationItem.tsx`
- `packages/chat/src/components/EmptyState.tsx`
- `packages/chat/src/components/QuickChips.tsx`
- `packages/chat/src/components/ChatInput.tsx`
- `packages/chat/src/components/ModelSelector.tsx`
- `packages/chat/src/components/PlusMenu.tsx`
- `packages/chat/src/components/ConversationHeader.tsx`
- `packages/chat/src/components/MessageList.tsx`
- `packages/chat/src/components/MessageBubble.tsx`
- `packages/chat/src/components/ActionBar.tsx`
- `packages/chat/src/components/Disclaimer.tsx`
- `packages/chat/src/components/UserProfile.tsx`

**Depends on (must exist first):**

- `packages/chat/src/lib/tokens.ts` (Agent A)
- `packages/chat/src/lib/types.ts` (Agent A)
- `packages/chat/src/lib/utils.ts` (Agent A)
- `packages/chat/src/lib/runtime.ts` (Agent A)
- `packages/chat/src/lib/greetings.ts` (Agent A)
- `packages/chat/src/stores/chatStore.ts` (Agent A)
- `packages/chat/src/stores/modelStore.ts` (Agent A)
- `packages/chat/src/stores/uiStore.ts` (Agent A)
- All `packages/chat/src/components/ui/*` primitives (Agent A)

**DO NOT TOUCH:**

- Any file in `apps/desktop/` or `apps/web/`
- Any file Agent A, C, or D is responsible for

### Agent C: Advanced Features

**Creates (new files):**

- `packages/chat/src/components/ThinkingBlock.tsx`
- `packages/chat/src/components/ToolTimeline.tsx`
- `packages/chat/src/components/CitationPill.tsx`
- `packages/chat/src/components/WebSearchCard.tsx`
- `packages/chat/src/components/ArtifactPanel.tsx`
- `packages/chat/src/components/ImageGenCard.tsx`
- `packages/chat/src/components/VideoGenCard.tsx`
- `packages/chat/src/components/DownloadCard.tsx`

**Depends on (must exist first):**

- `packages/chat/src/lib/tokens.ts` (Agent A)
- `packages/chat/src/lib/types.ts` (Agent A)
- `packages/chat/src/lib/utils.ts` (Agent A)
- `packages/chat/src/stores/chatStore.ts` (Agent A)
- `packages/chat/src/stores/uiStore.ts` (Agent A)
- All `packages/chat/src/components/ui/*` primitives (Agent A)

**DO NOT TOUCH:**

- Any file in `apps/desktop/` or `apps/web/`
- `packages/chat/src/components/ChatInterface.tsx` (Agent B)
- `packages/chat/src/components/MessageList.tsx` (Agent B)
- `packages/chat/src/components/MessageBubble.tsx` (Agent B)

### Agent D: Hub & Settings

**Creates (new files):**

- `packages/chat/src/components/CustomizeHub.tsx`
- `packages/chat/src/components/SkillList.tsx`
- `packages/chat/src/components/SkillDetail.tsx`
- `packages/chat/src/components/ConnectorList.tsx`
- `packages/chat/src/components/ConnectorDetail.tsx`
- `packages/chat/src/components/ConnectorMarketplace.tsx`
- `packages/chat/src/components/SettingsModal.tsx`
- `packages/chat/src/components/settings/GeneralTab.tsx`
- `packages/chat/src/components/settings/AccountTab.tsx`
- `packages/chat/src/components/settings/PrivacyTab.tsx`
- `packages/chat/src/components/settings/BillingTab.tsx`
- `packages/chat/src/components/settings/UsageTab.tsx`
- `packages/chat/src/components/settings/CapabilitiesTab.tsx`
- `packages/chat/src/components/settings/ConnectorsTab.tsx`
- `packages/chat/src/components/settings/ModelsKeysTab.tsx`
- `packages/chat/src/components/settings/VoiceTab.tsx`
- `packages/chat/src/components/settings/AgentsTab.tsx`
- `packages/chat/src/components/ProjectsPage.tsx`
- `packages/chat/src/components/ProjectDetail.tsx`
- `packages/chat/src/components/CommandPalette.tsx`

**Depends on (must exist first):**

- `packages/chat/src/lib/tokens.ts` (Agent A)
- `packages/chat/src/lib/types.ts` (Agent A)
- `packages/chat/src/lib/utils.ts` (Agent A)
- `packages/chat/src/lib/runtime.ts` (Agent A)
- `packages/chat/src/stores/settingsStore.ts` (Agent A)
- `packages/chat/src/stores/projectStore.ts` (Agent A)
- All `packages/chat/src/components/ui/*` primitives (Agent A)

**DO NOT TOUCH:**

- Any file in `apps/desktop/` or `apps/web/`
- Any file Agent A, B, or C is responsible for

### Agent E: Integration

**Modifies (existing files):**

- `apps/desktop/src/App.tsx`
- `apps/desktop/package.json` (add `@agiworkforce/chat` dependency)
- `apps/web/package.json` (add `@agiworkforce/chat` dependency)
- `apps/web/app/chat/page.tsx` (rewrite to use ChatInterface)
- `apps/web/app/chat/layout.tsx` (add auth guard + chat shell)
- `pnpm-workspace.yaml` (verify `packages/*` glob is present -- it already is)

**Creates (new files):**

- `apps/desktop/src/chat/TauriRuntime.ts` (implements ChatRuntime with invoke/events)
- `apps/desktop/src/chat/TitleBar.tsx` (Tauri window drag region + controls)
- `apps/web/app/chat/WebRuntime.ts` (implements ChatRuntime with fetch/SSE)

**Depends on (must exist first):**

- ALL Agent A, B, C, D output (everything in `packages/chat/`)

**DO NOT TOUCH:**

- Any file inside `packages/chat/` (read-only access to import)
- `apps/desktop/src-tauri/` (Rust backend -- no changes needed)
- `apps/desktop/src/stores/` (existing stores remain for non-chat features)
- `apps/desktop/src/components/UnifiedAgenticChat/` (do not delete yet; keep for reference)

---

## Interface Contracts

### Contract 1: ChatRuntime (Agent A defines, Agent E implements)

**File:** `packages/chat/src/lib/runtime.ts`

```typescript
// The runtime adapter that platform shells must implement.
// Desktop provides a TauriRuntime; web provides a WebRuntime.

interface SendParams {
  conversationId: string;
  content: string;
  attachments?: FileRef[];
  modelId?: string;
  focusMode?: FocusMode;
  webSearch?: boolean;
  systemPrompt?: string;
}

interface StreamChunk {
  type:
    | 'text'
    | 'thinking'
    | 'tool_call'
    | 'tool_result'
    | 'citation'
    | 'artifact'
    | 'error'
    | 'done';
  content?: string;
  metadata?: Record<string, unknown>;
}

interface FileRef {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url?: string;
  content?: string;
}

interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface ChatRuntime {
  /** Send a message and receive streaming response chunks */
  sendMessage(params: SendParams): AsyncIterable<StreamChunk>;

  /** Upload a file and get a reference to use in messages */
  uploadFile(file: File): Promise<FileRef>;

  /** Invoke a platform-specific command (IPC on desktop, API on web) */
  invokeCommand(cmd: string, args: Record<string, unknown>): Promise<unknown>;

  /** Get persistent storage adapter (localStorage on web, Tauri store on desktop) */
  getStorage(): StorageAdapter;

  /** Returns the current platform */
  getPlatform(): 'desktop' | 'web' | 'mobile';

  /** Create a new conversation */
  createConversation(title: string): Promise<string>;

  /** Load conversation list */
  getConversations(): Promise<ConversationSummary[]>;

  /** Load messages for a conversation */
  getMessages(conversationId: string): Promise<ChatMessage[]>;

  /** Delete a conversation */
  deleteConversation(conversationId: string): Promise<void>;

  /** Get available models */
  getModels(): Promise<ModelInfo[]>;

  /** Stop active generation */
  stopGeneration(): void;
}
```

**Provided by:** Agent A (interface definition only -- no implementation)
**Consumed by:** Agent E (creates TauriRuntime and WebRuntime implementations)
**Used by:** Agent B, C, D components via `useChat()` hook

### Contract 2: Shared Types (Agent A defines, all agents consume)

**File:** `packages/chat/src/lib/types.ts`

```typescript
// Types that ALL agents must use. Do NOT create local type aliases.

/** Re-export shared types from @agiworkforce/types */
export type { ConversationId, MessageId, ActionId } from '@agiworkforce/types';
export type { Provider, ModelCapabilities } from '@agiworkforce/types';

/** Chat-specific types for the shared package */

export type ThemeMode = 'dusk' | 'dawn' | 'system';

export type FocusMode = 'code' | 'write' | 'research' | 'skills' | 'web' | null;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  streaming?: boolean;
  error?: string;
  metadata?: ChatMessageMetadata;
  attachments?: FileRef[];
  thinkingBlocks?: ThinkingBlock[];
  citations?: Citation[];
  artifacts?: ArtifactRef[];
}

export interface ChatMessageMetadata {
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  duration?: number;
  toolCalls?: ToolCallEntry[];
  webSearches?: WebSearchEntry[];
  imageGen?: ImageGenEntry;
  videoGen?: VideoGenEntry;
}

export interface ConversationSummary {
  id: string;
  title: string;
  pinned: boolean;
  archived?: boolean;
  lastMessage?: string;
  updatedAt: Date;
  projectId?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  displayName: string;
  provider: Provider;
  providerDisplayName: string;
  tier: 'flagship' | 'standard' | 'fast' | 'local';
  supportsThinking: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  isBYOK: boolean;
  isLocal: boolean;
  contextWindow: number;
  maxOutput: number;
}

export interface ThinkingBlock {
  id: string;
  summary: string;
  steps: ThinkingStep[];
  collapsed: boolean;
  status: 'in-progress' | 'completed';
}

export interface ThinkingStep {
  id: string;
  type:
    | 'thinking'
    | 'tool_call'
    | 'tool_result'
    | 'file_read'
    | 'file_write'
    | 'terminal'
    | 'web_search'
    | 'mcp_call'
    | 'done';
  icon: string;
  label: string;
  detail?: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: ThinkingStepResult;
  timestamp: Date;
}

export interface ThinkingStepResult {
  type: 'text' | 'code' | 'file' | 'script';
  label: string;
  content?: string;
  badge: 'result' | 'script' | 'file';
}

export interface Citation {
  id: string;
  index: number;
  url: string;
  title?: string;
  domain?: string;
  favicon?: string;
}

export interface WebSearchEntry {
  query: string;
  resultCount: number;
  results: WebSearchResult[];
}

export interface WebSearchResult {
  url: string;
  title: string;
  domain: string;
  favicon?: string;
}

export interface ArtifactRef {
  id: string;
  title: string;
  type: 'html' | 'react' | 'code' | 'document' | 'image';
  language?: string;
  content: string;
}

export interface ImageGenEntry {
  prompt: string;
  status: 'generating' | 'completed' | 'error';
  imageUrl?: string;
  error?: string;
}

export interface VideoGenEntry {
  prompt: string;
  status: 'generating' | 'completed' | 'error';
  progress?: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

export interface ToolCallEntry {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  input?: Record<string, unknown>;
  output?: string;
  duration?: number;
}

export interface ProjectInfo {
  id: string;
  name: string;
  description?: string;
  updatedAt: Date;
  conversationCount: number;
  memory?: string;
  instructions?: string;
  files?: ProjectFile[];
}

export interface ProjectFile {
  id: string;
  name: string;
  type: 'file' | 'github_repo';
  size?: number;
  url?: string;
}

export interface ConnectorInfo {
  id: string;
  name: string;
  icon: string;
  description: string;
  connected: boolean;
  popularity?: number;
  category: string;
  tools?: ConnectorTool[];
}

export interface ConnectorTool {
  name: string;
  description: string;
  permission: 'auto' | 'ask' | 'blocked';
  isReadOnly: boolean;
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  addedBy: 'user' | 'built-in';
  updatedAt: Date;
  invokedBy: 'user' | 'ai' | 'both';
  allowedTools: string[];
  files: string[];
  content?: string;
}

export type SettingsTab =
  | 'general'
  | 'account'
  | 'privacy'
  | 'billing'
  | 'usage'
  | 'capabilities'
  | 'connectors'
  | 'models-keys'
  | 'voice'
  | 'agents';
```

### Contract 3: Store Schemas (Agent A defines, Agents B/C/D consume)

**File:** `packages/chat/src/stores/chatStore.ts`

```typescript
interface ChatStoreState {
  // Conversations
  conversations: ConversationSummary[];
  activeConversationId: string | null;

  // Messages for the active conversation
  messages: ChatMessage[];
  isStreaming: boolean;

  // Loading states
  loadingConversations: boolean;
  loadingMessages: boolean;

  // Actions
  createConversation: (title: string) => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  pinConversation: (id: string) => void;
  archiveConversation: (id: string) => void;

  sendMessage: (content: string, attachments?: FileRef[]) => Promise<void>;
  retryMessage: (messageId: string) => Promise<void>;
  stopGeneration: () => void;

  // Feedback
  reactToMessage: (messageId: string, reaction: 'thumbsUp' | 'thumbsDown') => void;
}
```

**File:** `packages/chat/src/stores/modelStore.ts`

```typescript
interface ModelStoreState {
  // Model state
  models: ModelInfo[];
  selectedModelId: string | null;
  extendedThinking: boolean;

  // Computed
  selectedModel: ModelInfo | null;
  modelsByTier: Record<string, ModelInfo[]>;

  // Actions
  selectModel: (id: string) => void;
  toggleExtendedThinking: () => void;
  loadModels: () => Promise<void>;
}
```

**File:** `packages/chat/src/stores/uiStore.ts`

```typescript
interface UIStoreState {
  // Sidebar
  sidebarCollapsed: boolean;
  sidebarWidth: number;

  // Panels
  artifactPanelOpen: boolean;
  artifactPanelWidth: number;
  activeArtifactId: string | null;

  // Views
  activeView: 'chat' | 'projects' | 'project-detail' | 'customize' | 'settings';
  settingsTab: SettingsTab | null;

  // Theme
  theme: ThemeMode;
  resolvedTheme: 'dusk' | 'dawn';

  // Modals
  commandPaletteOpen: boolean;
  settingsOpen: boolean;
  connectorMarketplaceOpen: boolean;
  shareDialogOpen: boolean;

  // Focus mode
  focusMode: FocusMode;
  webSearchEnabled: boolean;

  // Actions
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  openArtifactPanel: (artifactId: string) => void;
  closeArtifactPanel: () => void;
  setArtifactPanelWidth: (width: number) => void;
  setActiveView: (view: UIStoreState['activeView']) => void;
  setTheme: (theme: ThemeMode) => void;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  toggleCommandPalette: () => void;
  setFocusMode: (mode: FocusMode) => void;
  toggleWebSearch: () => void;
}
```

**File:** `packages/chat/src/stores/projectStore.ts`

```typescript
interface ProjectStoreState {
  projects: ProjectInfo[];
  activeProjectId: string | null;
  loadingProjects: boolean;

  loadProjects: () => Promise<void>;
  selectProject: (id: string) => void;
  createProject: (name: string, description?: string) => Promise<void>;
  updateProjectInstructions: (id: string, instructions: string) => Promise<void>;
  uploadProjectFile: (id: string, file: File) => Promise<void>;
}
```

**File:** `packages/chat/src/stores/settingsStore.ts`

```typescript
interface SettingsStoreState {
  // Profile
  nickname: string;
  avatarUrl: string | null;
  workType: string;
  personalPreferences: string;

  // Appearance
  language: string;

  // Capabilities
  memoryEnabled: boolean;
  artifactsEnabled: boolean;
  codeExecutionEnabled: boolean;
  toolAccessMode: 'load-when-needed' | 'always-loaded';

  // Agent
  autoApproveMode: 'ask' | 'smart' | 'full';
  maxAgentSteps: number;
  agentTimeout: number;
  agentCostCap: number;

  // Actions
  updateProfile: (
    fields: Partial<
      Pick<SettingsStoreState, 'nickname' | 'avatarUrl' | 'workType' | 'personalPreferences'>
    >,
  ) => void;
  setLanguage: (lang: string) => void;
  setAutoApproveMode: (mode: 'ask' | 'smart' | 'full') => void;
}
```

### Contract 4: Design Tokens (Agent A defines, all agents consume)

**File:** `packages/chat/src/lib/tokens.ts`

```typescript
// Agents: import from '@agiworkforce/chat' or from '../lib/tokens' within the package.
// NEVER hardcode color/spacing values -- always reference these tokens.

export const colors = {
  // Core
  background: 'var(--background)',
  foreground: 'var(--foreground)',

  // Surfaces
  surfaceBase: 'var(--surface-base)',
  surfaceElevated: 'var(--surface-elevated)',
  surfaceOverlay: 'var(--surface-overlay)',
  surfaceHover: 'var(--surface-hover)',

  // Text
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  textPlaceholder: 'var(--text-placeholder)',

  // Borders
  border: 'var(--border)',
  borderStrong: 'var(--border-strong)',

  // Brand
  accentPrimary: 'var(--accent-primary)',
  accentSecondary: 'var(--accent-secondary)',

  // Specific UI
  userBubbleBg: 'var(--user-bubble-bg)',
  thinkingText: 'var(--thinking-text)',
  thinkingLine: 'var(--thinking-line)',

  // Badges
  badgeResult: 'var(--badge-result)',
  badgeScript: 'var(--badge-script)',
  badgeFile: 'var(--badge-file)',

  // Agent status
  agentThinking: 'var(--agent-thinking)',
  agentActive: 'var(--agent-active)',
  agentSuccess: 'var(--agent-success)',
  agentError: 'var(--agent-error)',
  agentWarning: 'var(--agent-warning)',

  // Semantic
  destructive: 'var(--destructive)',
  info: 'var(--info)',
  success: 'var(--success)',
  warning: 'var(--warning)',
} as const;

export const spacing = {
  1: 'var(--space-1)', // 4px
  2: 'var(--space-2)', // 8px
  3: 'var(--space-3)', // 12px
  4: 'var(--space-4)', // 16px
  5: 'var(--space-5)', // 20px
  6: 'var(--space-6)', // 24px
  8: 'var(--space-8)', // 32px
  10: 'var(--space-10)', // 40px
  12: 'var(--space-12)', // 48px
} as const;

export const radius = {
  sm: 'var(--radius-sm)', // 6px
  md: 'var(--radius-md)', // 8px
  lg: 'var(--radius-lg)', // 12px
  xl: 'var(--radius-xl)', // 16px
  '2xl': 'var(--radius-2xl)', // 24px
  full: 'var(--radius-full)', // 9999px
} as const;

export const shadows = {
  sm: 'var(--shadow-sm)',
  md: 'var(--shadow-md)',
  lg: 'var(--shadow-lg)',
  xl: 'var(--shadow-xl)',
} as const;

export const layout = {
  sidebarExpanded: 260, // px
  sidebarCollapsed: 52, // px
  sidebarMin: 200, // px
  sidebarMax: 400, // px
  artifactDefault: 400, // px
  artifactMin: 280, // px
  artifactMax: 900, // px
  chatMaxWidth: '80rem', // max-w-5xl equivalent
  inputMaxHeight: 200, // px
} as const;
```

### Contract 5: Component Props (cross-agent boundaries)

These prop interfaces define how components from different agents connect.

**MessageBubble (Agent B) renders ThinkingBlock (Agent C):**

```typescript
// Agent C exports ThinkingBlock with these props
interface ThinkingBlockProps {
  block: ThinkingBlock; // from types.ts
  onToggleCollapse: () => void;
  isStreaming?: boolean;
}
```

**MessageBubble (Agent B) renders CitationPill (Agent C):**

```typescript
interface CitationPillProps {
  citation: Citation; // from types.ts
  onClick: (url: string) => void;
}
```

**MessageBubble (Agent B) renders WebSearchCard (Agent C):**

```typescript
interface WebSearchCardProps {
  search: WebSearchEntry; // from types.ts
  expanded?: boolean;
  onToggle: () => void;
}
```

**MessageBubble (Agent B) renders ImageGenCard (Agent C):**

```typescript
interface ImageGenCardProps {
  entry: ImageGenEntry; // from types.ts
  onCopy: () => void;
  onDownload: () => void;
}
```

**MessageBubble (Agent B) renders VideoGenCard (Agent C):**

```typescript
interface VideoGenCardProps {
  entry: VideoGenEntry; // from types.ts
}
```

**MessageBubble (Agent B) renders DownloadCard (Agent C):**

```typescript
interface DownloadCardProps {
  artifact: ArtifactRef; // from types.ts
  onOpen: () => void;
  onDownload: () => void;
}
```

**ChatInterface (Agent B) renders ArtifactPanel (Agent C):**

```typescript
interface ArtifactPanelProps {
  artifactId: string;
  onClose: () => void;
  width: number;
  onResize: (width: number) => void;
}
```

**Sidebar (Agent B) opens CustomizeHub (Agent D):**

```typescript
// Agent B calls uiStore.setActiveView('customize')
// Agent D's CustomizeHub renders when uiStore.activeView === 'customize'
// No direct prop passing -- coordination through uiStore
```

**Sidebar (Agent B) opens Settings (Agent D):**

```typescript
// Agent B calls uiStore.openSettings(tab?)
// Agent D's SettingsModal renders when uiStore.settingsOpen === true
```

**Sidebar (Agent B) opens CommandPalette (Agent D):**

```typescript
// Agent B calls uiStore.toggleCommandPalette()
// Agent D's CommandPalette renders when uiStore.commandPaletteOpen === true
```

---

## Export Contract

**File:** `packages/chat/src/index.ts`

Agent A creates the initial barrel file. Each agent APPENDS their exports when their components are ready. The final shape must be:

```typescript
// ---- Lib ----
export { colors, spacing, radius, shadows, layout } from './lib/tokens';
export type { ChatRuntime, SendParams, StreamChunk, FileRef, StorageAdapter } from './lib/runtime';
export { cn } from './lib/utils';
export type * from './lib/types';
export { getGreeting } from './lib/greetings';

// ---- Stores ----
export { useChatStore } from './stores/chatStore';
export { useModelStore } from './stores/modelStore';
export { useUIStore } from './stores/uiStore';
export { useProjectStore } from './stores/projectStore';
export { useSettingsStore } from './stores/settingsStore';

// ---- Hooks ----
export { useChat } from './hooks/useChat';
export { useModel } from './hooks/useModel';
export { useTheme } from './hooks/useTheme';
export { useSidebar } from './hooks/useSidebar';
export { useArtifact } from './hooks/useArtifact';
export { useKeyboard } from './hooks/useKeyboard';

// ---- Components (core) ----
export { ChatInterface } from './components/ChatInterface';
export { Sidebar } from './components/Sidebar';
export { ConversationItem } from './components/ConversationItem';
export { EmptyState } from './components/EmptyState';
export { QuickChips } from './components/QuickChips';
export { ChatInput } from './components/ChatInput';
export { ModelSelector } from './components/ModelSelector';
export { PlusMenu } from './components/PlusMenu';
export { ConversationHeader } from './components/ConversationHeader';
export { MessageList } from './components/MessageList';
export { MessageBubble } from './components/MessageBubble';
export { ActionBar } from './components/ActionBar';
export { Disclaimer } from './components/Disclaimer';
export { UserProfile } from './components/UserProfile';

// ---- Components (advanced) ----
export { ThinkingBlock } from './components/ThinkingBlock';
export { ToolTimeline } from './components/ToolTimeline';
export { CitationPill } from './components/CitationPill';
export { WebSearchCard } from './components/WebSearchCard';
export { ArtifactPanel } from './components/ArtifactPanel';
export { ImageGenCard } from './components/ImageGenCard';
export { VideoGenCard } from './components/VideoGenCard';
export { DownloadCard } from './components/DownloadCard';

// ---- Components (hub & settings) ----
export { CustomizeHub } from './components/CustomizeHub';
export { SettingsModal } from './components/SettingsModal';
export { ProjectsPage } from './components/ProjectsPage';
export { ProjectDetail } from './components/ProjectDetail';
export { ConnectorMarketplace } from './components/ConnectorMarketplace';
export { CommandPalette } from './components/CommandPalette';

// ---- UI Primitives ----
export { Button } from './components/ui/Button';
export { Input } from './components/ui/Input';
export { Dialog } from './components/ui/Dialog';
export { Popover } from './components/ui/Popover';
export { DropdownMenu } from './components/ui/DropdownMenu';
export { Badge } from './components/ui/Badge';
export { Toggle } from './components/ui/Toggle';
export { ScrollArea } from './components/ui/ScrollArea';
export { ResizeHandle } from './components/ui/ResizeHandle';
export { Tooltip } from './components/ui/Tooltip';

// ---- Styles ----
// Consumers must import the CSS: import '@agiworkforce/chat/styles/globals.css'
```

---

## Package.json for packages/chat/

Agent A must create this exactly:

```json
{
  "name": "@agiworkforce/chat",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": "./src/index.ts",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc --project tsconfig.json",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@agiworkforce/types": "workspace:*",
    "@agiworkforce/utils": "workspace:*",
    "zustand": "^5.0.11",
    "immer": "^11.1.4"
  },
  "peerDependencies": {
    "react": ">=19.0.0",
    "react-dom": ">=19.0.0",
    "@radix-ui/react-dialog": ">=1.1.0",
    "@radix-ui/react-dropdown-menu": ">=2.1.0",
    "@radix-ui/react-popover": ">=1.1.0",
    "@radix-ui/react-scroll-area": ">=1.2.0",
    "@radix-ui/react-switch": ">=1.2.0",
    "@radix-ui/react-tooltip": ">=1.2.0",
    "@radix-ui/react-tabs": ">=1.1.0",
    "class-variance-authority": ">=0.7.0",
    "clsx": ">=2.1.0",
    "tailwind-merge": ">=3.0.0",
    "lucide-react": ">=0.400.0",
    "framer-motion": ">=12.0.0",
    "cmdk": ">=1.0.0",
    "sonner": ">=2.0.0"
  }
}
```

---

## Existing Codebase: Current State (Verified)

### Existing packages/ structure

| Package                           | Name                    | Purpose                                                        |
| --------------------------------- | ----------------------- | -------------------------------------------------------------- |
| `packages/types/`                 | `@agiworkforce/types`   | Shared TS types (conversation, model-catalog, artifacts, etc.) |
| `packages/utils/`                 | `@agiworkforce/utils`   | Shared utilities (formatters, debounce, etc.)                  |
| `packages/api/`                   | `@agiworkforce/api`     | 1,061 typed Tauri command wrappers                             |
| `packages/runtime/`               | `@agiworkforce/runtime` | Runtime detection + capability routing                         |
| `packages/stores/`                | `@agiworkforce/stores`  | Shared Zustand stores                                          |
| `packages/react-native-worklets/` | (mobile)                | React Native worklets                                          |

### Existing desktop stores (relevant)

| Store              | File                         | Purpose                                  |
| ------------------ | ---------------------------- | ---------------------------------------- |
| `unifiedChatStore` | `stores/unifiedChatStore.ts` | DEPRECATED facade over modular stores    |
| `chatStore`        | `stores/chat/chatStore.ts`   | Conversations + messages (uses invoke()) |
| `agentStore`       | `stores/chat/agentStore.ts`  | Agent status + background tasks          |
| `toolStore`        | `stores/chat/toolStore.ts`   | Tool executions + approvals              |
| `modelStore`       | `stores/modelStore.ts`       | Model selection + BYOK + managed cloud   |
| `artifactStore`    | `stores/artifactStore.ts`    | Artifact CRUD + streaming                |
| `settingsStore`    | `stores/settingsStore.ts`    | User preferences                         |
| `projectStore`     | `stores/projectStore.ts`     | Project management                       |
| `skillsStore`      | `stores/skillsStore.ts`      | Skill management                         |
| `connectorsStore`  | `stores/connectorsStore.ts`  | Connector management                     |
| `uiStore`          | `stores/ui.ts`               | Sidecar/sidebar state                    |

### Existing desktop components (in UnifiedAgenticChat/)

There are 90+ component files in `apps/desktop/src/components/UnifiedAgenticChat/`. Key ones relevant to the redesign:

| Component             | File                      | Relevance                            |
| --------------------- | ------------------------- | ------------------------------------ |
| `AppLayout`           | `AppLayout.tsx`           | Current 2/3-panel layout (537 lines) |
| `Sidebar`             | `Sidebar.tsx`             | Current sidebar (28+ nav items)      |
| `ChatInputArea`       | `ChatInputArea.tsx`       | Current input bar                    |
| `MessageBubble`       | `MessageBubble.tsx`       | Current message rendering            |
| `ChatMessageList`     | `ChatMessageList.tsx`     | Current message list                 |
| `ThinkingBlock`       | `ThinkingBlock.tsx`       | Current thinking UI                  |
| `ToolTimeline`        | `ToolTimeline.tsx`        | Current tool timeline                |
| `ModelSelectorButton` | `ModelSelectorButton.tsx` | Current model picker                 |
| `PlusMenu`            | `PlusMenu.tsx`            | Current + menu                       |
| `CommandPalette`      | `CommandPalette.tsx`      | Current cmd+k                        |
| `CitationBadge`       | `CitationBadge.tsx`       | Current citations                    |
| `BrandedGreeting`     | `BrandedGreeting.tsx`     | Current empty state                  |
| `ProjectsView`        | `ProjectsView.tsx`        | Current projects page                |

### Web app current state

The web `/chat` route currently redirects to an external chat URL (`chat.agiworkforce.com`) with session tokens in the hash. The redesign will replace this with an embedded Next.js page that imports `ChatInterface` from `@agiworkforce/chat`.

### pnpm-workspace.yaml

Already configured with `packages/*` glob -- no changes needed for the new package.

---

## DO NOT TOUCH Sections

### Critical -- No agent may modify these:

| Path                        | Reason                                                                   |
| --------------------------- | ------------------------------------------------------------------------ |
| `apps/desktop/src-tauri/**` | Rust backend. No changes needed for UI redesign                          |
| `apps/cli/**`               | CLI crate. Completely unrelated                                          |
| `apps/mobile/**`            | Mobile app. Separate redesign effort                                     |
| `apps/extension/**`         | Chrome extension. Unrelated                                              |
| `apps/extension-vscode/**`  | VS Code extension. Unrelated                                             |
| `packages/types/src/**`     | Shared types. Use existing types; do not add chat-specific types here    |
| `packages/utils/src/**`     | Shared utilities. Use existing utils; add new ones in packages/chat/lib/ |
| `packages/api/src/**`       | Tauri command wrappers. Desktop-only, do not modify                      |
| `packages/runtime/src/**`   | Runtime detection. Not for chat UI                                       |
| `packages/stores/src/**`    | Shared stores. Chat stores go in packages/chat/                          |
| `services/**`               | API Gateway + Signaling Server. Backend services                         |
| `supabase/**`               | Database migrations                                                      |
| `CLAUDE.md`                 | Project constitution                                                     |
| `package.json` (root)       | Root config -- managed by lead only                                      |
| `tsconfig.json` (root)      | Root TS config -- does not exist (each package has own)                  |

### Sensitive -- Agent E only:

| Path                           | Reason                                     |
| ------------------------------ | ------------------------------------------ |
| `apps/desktop/src/App.tsx`     | Entry point. Only Agent E wires the import |
| `apps/desktop/package.json`    | Only Agent E adds the dependency           |
| `apps/web/package.json`        | Only Agent E adds the dependency           |
| `apps/web/app/chat/page.tsx`   | Only Agent E rewrites this                 |
| `apps/web/app/chat/layout.tsx` | Only Agent E modifies this                 |

### Preserved -- Do not delete:

| Path                                                | Reason                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `apps/desktop/src/components/UnifiedAgenticChat/**` | Keep existing components until migration is fully verified. Agent E may reference but NOT delete them |
| `apps/desktop/src/stores/**`                        | Existing stores remain for non-chat features (canvas, MCP workspace, images gallery, schedules, etc.) |

---

## Build Sequence

```
Phase 1: Agent A (blocks all others)
   Creates packages/chat/ with:
   - package.json, tsconfig.json
   - lib/ (tokens, runtime interface, utils, types, greetings)
   - styles/ (globals.css, themes/)
   - components/ui/ (11 primitives)
   - stores/ (5 store shells)
   - hooks/ (6 hook shells)
   - index.ts (barrel exports)

Phase 2: Agents B, C, D (in parallel, after Agent A completes)
   Agent B: Core chat components (14 files)
   Agent C: Advanced feature components (8 files)
   Agent D: Hub + settings components (20 files)

Phase 3: Agent E (after B, C, D complete)
   - Adds @agiworkforce/chat dependency to desktop + web
   - Creates TauriRuntime and WebRuntime implementations
   - Wires ChatInterface into desktop App.tsx
   - Rewrites web /chat route
   - Applies themes, tests
```

---

## Verification Checklist

Before spawning agents, verify:

- [x] All file paths in this spec point to files that exist or will be created
- [x] All interface contracts reference types defined in Contract 2
- [x] No circular dependencies between agent scopes
- [x] DO NOT TOUCH sections are comprehensive
- [x] `pnpm-workspace.yaml` already includes `packages/*` glob
- [x] Both desktop and web `package.json` already list workspace dependencies
- [x] Existing `@agiworkforce/types` exports `Provider`, `ConversationId`, `MessageId`, `ModelCapabilities`
- [x] Existing `@agiworkforce/utils` exports `formatBytes`, `formatNumber`, `formatDate`, `formatRelativeTime`, etc.
- [x] Root `package.json` uses `pnpm@9.15.3` and `node@22`

---

## Key Design Decisions to Enforce

All agents must follow these decisions from the UI redesign spec (Appendix C):

1. **Everything inline** -- Images, tables, code blocks, thinking, citations all render in the message stream. Never in a side panel (except artifacts that meet the 4 triggers).
2. **7 sidebar items only** -- New Chat, Search, Customize, Chats, Projects, Skills, Connectors. All 28+ previous items are removed from sidebar.
3. **Warm dark theme (Dusk)** as default -- `#1a1915` background, terra cotta accent `#da7756`.
4. **Claude.ai is the primary reference** -- When ambiguous, follow Claude.ai's pattern.
5. **No follow-up suggestions** -- Clean responses, no suggestion chips after responses.
6. **Context-aware disclaimer** -- Changes text based on whether response contains citations or code.
7. **Model selector shows provider icon + model name + tier** -- Multi-provider is the key differentiator.
8. **BYOK and Local badges** -- Must be visible in model selector and input bar.
9. **prefers-reduced-motion** -- All animations must be disabled when this media query matches.
10. **Named exports only** -- No default exports, per project convention.
