// Lib
export * from './lib/tokens';
export * from './lib/types';
export * from './lib/runtime';
export * from './lib/hostBridge';
export * from './lib/utils';
export * from './lib/greetings';
export { getConnectorPermissionStore } from './lib/connectorPermissionStore';
export type { ConnectorPermissionStore } from './lib/connectorPermissionStore';
export { classifyPrompt, buildRoutingDecision, TASK_LABEL } from './lib/promptClassifier';
export type { ClassifiedTask, ClassificationResult, ClassifyOptions } from './lib/promptClassifier';

// Stores — prefixed to avoid collisions with host-app store names
export { useChatStore } from './stores/chatStore';
export { useModelStore as useChatModelStore } from './stores/modelStore';
export { useUIStore as useChatUIStore } from './stores/uiStore';
export { useProjectStore as useChatProjectStore } from './stores/projectStore';
export { useSettingsStore as useChatSettingsStore } from './stores/settingsStore';
export { useArtifactStore as useChatArtifactStore } from './stores/artifactStore';
export { useAgentControlStore as useChatAgentControlStore } from './stores/agentControlStore';

// Hooks
export { useChat } from './hooks/useChat';
export { useTheme } from './hooks/useTheme';
export { useSidebar } from './hooks/useSidebar';
export { useArtifact } from './hooks/useArtifact';
export { useKeyboard } from './hooks/useKeyboard';
export { useModel } from './hooks/useModel';

// UI Primitives
export { Button } from './components/ui/Button';
export type { ButtonProps } from './components/ui/Button';
export { Tooltip } from './components/ui/Tooltip';
export { Badge } from './components/ui/Badge';
export { ScrollArea } from './components/ui/ScrollArea';

// Top-level orchestrator
export { ChatInterface, useRuntime } from './components/ChatInterface';
export type { ChatInterfaceProps } from './components/ChatInterface';

// Components
export { EmptyState } from './components/EmptyState';
export { QuickChips } from './components/QuickChips';
export type { ChipType } from './components/QuickChips';
export { ChatInput } from './components/ChatInput';
export type { ChatInputProps } from './components/ChatInput';
export { AgentControl } from './components/AgentControl';
export type { AgentControlProps } from './components/AgentControl';
export { ModelSelector } from './components/ModelSelector';
export type { ModelSelectorProps } from './components/ModelSelector';
export { AttachmentMenu } from './components/AttachmentMenu';
export { Disclaimer } from './components/Disclaimer';

// Sidebar components
export { Sidebar } from './components/Sidebar';
export { ConversationItem } from './components/ConversationItem';
export { UserProfile } from './components/UserProfile';

// Chat area components
export { MessageList } from './components/MessageList';
export { MessageBubble } from './components/MessageBubble';
export { ActionBar } from './components/ActionBar';
export { ConversationHeader } from './components/ConversationHeader';

// Rich message components
export { ThinkingBlock } from './components/ThinkingBlock';
export { CitationPill } from './components/CitationPill';
export { WebSearchCard } from './components/WebSearchCard';

// Artifact and media components
export { ArtifactPanel } from './components/ArtifactPanel';
export type { ArtifactPanelProps } from './components/ArtifactPanel';
export { DownloadCard } from './components/DownloadCard';
export type { DownloadCardProps } from './components/DownloadCard';
export { ImageGenCard } from './components/ImageGenCard';
export type { ImageGenCardProps } from './components/ImageGenCard';
export { VideoGenCard } from './components/VideoGenCard';
export type { VideoGenCardProps } from './components/VideoGenCard';

// Modal overlays
export { SettingsModal } from './components/SettingsModal';
export { CommandPalette } from './components/CommandPalette';

// Phase A Slice 1 — Budget + agentic-loop status (ported from UAC)
export { BudgetTracker } from './components/BudgetTracker';
export { BudgetAlertsPanel } from './components/BudgetAlertsPanel';
export { TokenCounter } from './components/TokenCounter';
export type { TokenCounterProps } from './components/TokenCounter';
export { UsageLimitBanner, UsageLimitBannerContainer } from './components/UsageLimitBanner';
export { CurrentActionBadge, CurrentActionStack } from './components/CurrentActionBadge';
export {
  useBudgetStore,
  selectBudget,
  selectBudgetPercentage,
  selectActiveActions,
  selectVisibleAlerts,
  formatTokens,
} from './stores/budgetStore';
export type {
  BudgetSnapshot,
  BudgetAlert,
  ActionTrailEntry,
  ActionTrailEntryType,
} from './stores/budgetStore';

// Phase A Slice 2 — Agentic-loop visualizers (ported from UAC)
export { AgenticLoopStatusBar } from './components/AgenticLoopStatusBar';
export { AgentStepTimeline } from './components/AgentStepTimeline';
export type {
  AgentStep,
  AgentStepTimelineProps,
  AgentType,
  StepStatus,
} from './components/AgentStepTimeline';
export { AgentProgressFooter } from './components/AgentProgressFooter';
export { ActionLogTimeline, ActionLogTimelineContent } from './components/ActionLogTimeline';
export type {
  ActionLogTimelineProps,
  ActionLogTimelineContentProps,
} from './components/ActionLogTimeline';
export { StatusTrail, StatusTrailContent, FloatingStatusTrail } from './components/StatusTrail';
export type {
  StatusTrailProps,
  StatusTrailContentProps,
  FloatingStatusTrailProps,
} from './components/StatusTrail';
export { SubtaskTimeline } from './components/SubtaskTimeline';
export type { SubtaskStep, SubtaskTimelineProps } from './components/SubtaskTimeline';
export { TaskPhaseTimeline } from './components/TaskPhaseTimeline';
export type {
  TaskPhaseTimelineProps,
  ToolLabelEntryWithPhase,
} from './components/TaskPhaseTimeline';
export { TaskPhaseSection } from './components/TaskPhaseSection';
export type { TaskPhase, TaskPhaseSectionProps } from './components/TaskPhaseSection';
export { ToolTimeline } from './components/ToolTimeline';
export type { ToolTimelineProps } from './components/ToolTimeline';
export { ToolCallCard } from './components/ToolCallCard';
export type { ToolCallCardProps, ToolCallStatus } from './components/ToolCallCard';
export { RewindTimeline } from './components/RewindTimeline';
export type { RewindTimelineProps, CodingCheckpoint } from './components/RewindTimeline';
export {
  useAgentLoopStore,
  selectAgentLoop,
  selectActiveGoal,
  selectActionLog,
} from './stores/agentLoopStore';
export type {
  AgentLoopStatus,
  ActiveGoal,
  ActionLogEntry,
  ActionLogEntryType,
  ActionLogStatus,
} from './stores/agentLoopStore';
export { useReducedMotion } from './hooks/useReducedMotion';

// Phase A Slice 3 — Checkpoints + branches (ported from UAC)
export { CheckpointManager } from './components/CheckpointManager';
export type { CheckpointManagerProps, ManagerCheckpoint } from './components/CheckpointManager';
export { BranchNavigator, BranchNavigatorContainer } from './components/BranchNavigator';
export type {
  BranchNavigatorProps,
  BranchNavigatorContainerProps,
  BranchItem,
} from './components/BranchNavigator';
export { RewindTimelineContainer } from './components/RewindTimeline';
export type { RewindTimelineContainerProps } from './components/RewindTimeline';
export {
  useCheckpointStore,
  selectCheckpoints,
  selectBranches,
  selectActiveBranchId,
} from './stores/checkpointStore';
export type { Checkpoint, Branch } from './stores/checkpointStore';

// Pro+ tier gating (Task #17 — multi-provider in-thread switch)
export { ProPlusUpgradePrompt } from './components/ProPlusUpgradePrompt';
export type { ProPlusUpgradePromptProps } from './components/ProPlusUpgradePrompt';
export {
  useTierStore,
  selectTier,
  selectCanSwitchProvider,
  selectIsFreePlan,
  selectIsCrossProviderSwitch,
  selectProviderSwitchGate,
  tierAtLeast,
  canSwitchProviderInThread,
  isFreePlan,
} from './stores/tierStore';
export type { UIPlanTier } from './stores/tierStore';
