// Lib
export * from './lib/tokens';
export * from './lib/types';
export * from './lib/runtime';
export * from './lib/hostBridge';
export * from './lib/capabilities';
export * from './lib/utils';
export * from './lib/greetings';
export {
  buildSandboxedHtml,
  ARTIFACT_SANDBOX_ATTR,
  ARTIFACT_SANDBOX_SCHEME,
  buildArtifactSandboxUrl,
  configureArtifactSandboxOrigin,
  getArtifactSandboxOrigin,
  isArtifactSandboxMessage,
  postRenderToArtifactSandbox,
} from './lib/artifact-sandbox';
export type {
  ArtifactRenderPayload,
  ArtifactSandboxKind,
  SandboxIncomingMessage,
} from './lib/artifact-sandbox';
export {
  getSameDocumentScriptSupport,
  probeSameDocumentScriptSupport,
  SCRIPTS_BLOCKED_NOTICE,
} from './lib/artifact-preview-capability';
export type { ArtifactPreviewScriptSupport } from './lib/artifact-preview-capability';
export {
  getConnectorPermissionStore,
  ConnectorPermissionsUnavailableError,
} from './lib/connectorPermissionStore';
export type { ConnectorPermissionStore } from './lib/connectorPermissionStore';
export {
  isContinuableFinishReason,
  isMessageContinuable,
  hasStreamError,
  getStreamErrorMessage,
  CONTINUE_GENERATION_INSTRUCTION,
} from './lib/continue-generation';
export type {
  ContinuableMessageLike,
  StreamErrorMessageLike,
  StreamErrorInfo,
} from './lib/continue-generation';
export {
  getRegenerateReplayDecision,
  planRegenerateRollback,
  replayToSendOptions,
} from './lib/regenerateReplay';
export type {
  RegenerateReplayDecision,
  RegenerateReplayMetadata,
  SendReplayMetadataLike,
} from './lib/regenerateReplay';
export {
  isAlwaysOnReasoningModel,
  resolveThinkingSendPolicy,
  showsThinkingSwitch,
} from './lib/thinkingPolicy';
export type { ThinkingSendPolicy } from './lib/thinkingPolicy';
export { classifyPrompt, TASK_LABEL } from './lib/promptClassifier';
export type { ClassifiedTask, ClassificationResult, ClassifyOptions } from './lib/promptClassifier';
export {
  getModelsAdmittedForExecutionMode,
  isLocalChatModel,
  isModelAdmittedForExecutionMode,
} from './lib/modelAdmission';
export {
  createChatModelInfo,
  isChatModelSelectable,
  parseDiscoveredChatModels,
} from './lib/modelInfo';
export type { DiscoveredChatModel, DiscoveredChatModelRecord } from './lib/modelInfo';
export {
  BUILT_IN_SLASH_COMMANDS,
  BUILT_IN_COMMAND_IDS,
  clearSlashCommands,
  filterSlashCommands,
  filterSlashCommandsByCapability,
  getSlashCommand,
  listSlashCommands,
  parseSlashCommand,
  registerBuiltinSlashCommands,
  registerSlashCommand,
} from './lib/slashCommands';
export type {
  ParsedSlashCommand,
  SlashCommand,
  SlashCommandContext,
  SlashCommandDefinition,
  SlashCommandIconName,
} from './lib/slashCommands';
// Stores — prefixed to avoid collisions with host-app store names
export { useChatStore } from './stores/chatStore';
export { useModelStore as useChatModelStore } from './stores/modelStore';
export { useUIStore as useChatUIStore } from './stores/uiStore';
export { useProjectStore as useChatProjectStore } from './stores/projectStore';
export { useSettingsStore as useChatSettingsStore } from './stores/settingsStore';
export { useArtifactStore as useChatArtifactStore } from './stores/artifactStore';
export { useAgentControlStore as useChatAgentControlStore } from './stores/agentControlStore';

// Send pipeline queue (per-surface; see packages/client/client-runtime for primitives)
export {
  getSendQueue,
  enqueuePrompt,
  defaultBrowserStorage,
  __resetAllSendQueuesForTests,
} from './queue/sendQueue';
export type { GetSendQueueOptions } from './queue/sendQueue';

// Hooks
export { useChat } from './hooks/useChat';
export { useTheme } from './hooks/useTheme';
export { useSidebar } from './hooks/useSidebar';
export { useArtifact } from './hooks/useArtifact';
export { useSameDocumentScriptSupport } from './hooks/useSameDocumentScriptSupport';
export { useKeyboard } from './hooks/useKeyboard';
export { useModel } from './hooks/useModel';

// UI Primitives
export { Button, type ButtonProps, ScrollArea } from '@agiworkforce/ui';
export { Tooltip } from './components/ui/Tooltip';
export { ChatBadge } from './components/ui/ChatBadge';

// Markdown renderer (canonical chain: react-markdown + remark-gfm/math/breaks
// + rehype-highlight/katex/raw+sanitize). Source of truth ported from
// apps/web/features/chat/components/messages/.
export { MarkdownContent, type MarkdownContentProps } from './components/markdown/MarkdownContent';
export { MARKDOWN_SANITIZE_SCHEMA } from './components/markdown/markdownSanitizeSchema';
export { preprocessMath } from './components/markdown/preprocessMath';

// Local-to-BYOK handoff ceremony dialog (founder decision 2026-07-08)
export {
  LocalByokHandoffDialog,
  type LocalByokHandoffDialogProps,
  type HandoffContextCandidate,
} from './components/LocalByokHandoffDialog';

// Top-level orchestrator
//
// `ChatInterface` is the shipping shared Desktop chat orchestrator. It owns
// the shared model-selector/send path while the host supplies the active
// conversation boundary and a platform-specific `ChatRuntime`. Web still
// uses its surface-specific page/orchestrator. Do not remove this export until
// Desktop has deliberately migrated to another shared owner and the host
// bridge has no live consumers.
export { ChatInterface, useRuntime } from './components/ChatInterface';
export type { ChatInterfaceProps } from './components/ChatInterface';

// Components
export { EmptyState } from './components/EmptyState';
export type { EmptyStateProps } from './components/EmptyState';
export { ChatInput } from './components/ChatInput';
export type {
  ChatInputProps,
  ChatInputProjectPicker,
  ChatInputSlashCommandHost,
  ChatWorkMode,
  ChatWorkScope,
  ComposerVoiceController,
  ComposerVoiceState,
} from './components/ChatInput';
export { AgentControl } from './components/AgentControl';
export type { AgentControlProps } from './components/AgentControl';
export { ModelSelector } from './components/ModelSelector';
export type { ModelSelectorProps } from './components/ModelSelector';
export { AttachmentMenu } from './components/AttachmentMenu';
export { getWritingStyleInstruction, type WritingStyle } from './lib/writingStyle';
export { SendButton } from './components/SendButton';
export type { SendButtonProps, SendButtonMode } from './components/SendButton';
export { Disclaimer } from './components/Disclaimer';

// Sidebar components
export { Sidebar } from './components/Sidebar';
export { ConversationItem } from './components/ConversationItem';
export { UserProfile } from './components/UserProfile';

// Chat area components
export { MessageList } from './components/MessageList';
export { MessageBubble, MarkdownLite } from './components/MessageBubble';
export {
  MessageLimitCard,
  formatResetLabel,
  readMessagePaywall,
} from './components/MessageLimitCard';
export { UsageWarningBanner } from './components/UsageWarningBanner';
export type { UsageWarningBannerProps } from './components/UsageWarningBanner';
export type { MessageLimitCardProps, MessagePaywallBlock } from './components/MessageLimitCard';
export { ThinkingControl } from './components/ThinkingControl';
export type { ThinkingControlProps } from './components/ThinkingControl';
export { ActionBar } from './components/ActionBar';
export { ConversationHeader } from './components/ConversationHeader';
export type { ConversationHeaderProps } from './components/ConversationHeader';

// Rich message components
export { ThinkingBlock } from './components/ThinkingBlock';
export { CitationPill } from './components/CitationPill';
export { WebSearchCard, LegacyWebSearchCard } from './components/WebSearchCard';
export type {
  WebSearchCardProps,
  LegacyWebSearchCardProps,
  LegacyWebSearchResult,
} from './components/WebSearchCard';
export { ProvenanceFooter } from './components/ProvenanceFooter';
export type { ProvenanceFooterProps } from './components/ProvenanceFooter';

// Artifact and media components
export { ArtifactPanel } from './components/ArtifactPanel';
export type {
  ArtifactPanelProps,
  ArtifactPublishResult,
  ArtifactLocalPublishResult,
} from './components/ArtifactPanel';
export { DownloadCard } from './components/DownloadCard';
export type { DownloadCardProps } from './components/DownloadCard';
export { GeneratedFileCard } from './components/GeneratedFileCard';
export {
  LibraryView,
  iconKindFor,
  generatedFileFromLibraryItem,
} from './components/library/LibraryView';
export type { LibraryTransport } from './components/library/LibraryView';
export { TasksPage } from './components/tasks/TasksPage';
export type { TasksTransport } from './components/tasks/TasksPage';
export type { AgiWorkRerunGoal } from './components/tasks/task-display';
export {
  workModeLabel,
  taskStateLabel,
  taskStateTone,
  isCancellableState,
  isLiveTaskState,
  TASK_TONE_BADGE_CLASS,
} from './components/tasks/task-display';
export type { AgentTaskState, TaskStateTone } from './components/tasks/task-display';
export type { GeneratedFileCardProps } from './components/GeneratedFileCard';
export {
  MessageGeneratedFiles,
  generatedFileFromEntry,
  hasRunningExecutionTool,
} from './components/MessageGeneratedFiles';
export type {
  MessageGeneratedFilesProps,
  MessageGeneratedFilesMessage,
} from './components/MessageGeneratedFiles';
export { SendPreview } from './components/SendPreview';
export type { SendPreviewProps } from './components/SendPreview';
export { ImageGenCard } from './components/ImageGenCard';
export type { ImageGenCardProps } from './components/ImageGenCard';
export { VideoGenCard } from './components/VideoGenCard';
export type { VideoGenCardProps } from './components/VideoGenCard';

// Modal overlays
export { SettingsModal } from './components/SettingsModal';
export { SettingsShell, DEFAULT_SETTINGS_SECTIONS } from './components/SettingsShell';
export type { SettingsSection, SettingsShellProps } from './components/SettingsShell';
export { MemoryEditor } from './components/MemoryEditor';
export type {
  MemoryEditorDataAdapter,
  MemoryEditorProps,
  MemoryEditorSyncStatus,
} from './components/MemoryEditor';
export { ProjectCard } from './components/ProjectCard';
export type { ProjectCardProps } from './components/ProjectCard';
export { ProjectGallery } from './components/ProjectGallery';
export type { ProjectGalleryCreateInput, ProjectGalleryProps } from './components/ProjectGallery';
export { ProjectHeader } from './components/ProjectHeader';
export type { ProjectHeaderProps } from './components/ProjectHeader';
export { useMemoryStore, selectMemoryFacts, selectMemoryCount } from './stores/memoryStore';
export type { MemoryFact } from './stores/memoryStore';
export { CommandPalette } from './components/CommandPalette';

// Phase A Slice 1 — Budget + agentic-loop status (ported from UAC)
export { BudgetTracker } from './components/BudgetTracker';
export { BudgetAlertsPanel } from './components/BudgetAlertsPanel';
export { TokenCounter } from './components/TokenCounter';
export type { TokenCounterProps } from './components/TokenCounter';
export {
  UsageLimitBanner,
  UsageLimitBannerContainer,
  getUsageUrgency,
  type UrgencyLevel,
} from './components/UsageLimitBanner';
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
export {
  AgentActivityTimeline,
  buildAgentActivitySummary,
} from './components/AgentActivityTimeline';
export type { AgentActivityTimelineProps } from './components/AgentActivityTimeline';
export { ToolCallCard, detectCodeBlock } from './components/ToolCallCard';
export type { ToolCallCardProps, ToolCallStatus } from './components/ToolCallCard';
// Lazy authentication: the inline Connect card and the trusted-path reader that
// decides when one may be rendered.
export { ConnectorConnectCard } from './components/ConnectorConnectCard';
export type { ConnectorConnectCardProps } from './components/ConnectorConnectCard';
export {
  CONNECTOR_AUTHORIZATION_REQUIRED_KEY,
  CONNECTOR_OAUTH_START_PATH,
  buildConnectHref,
  readConnectorConnectRequest,
} from './lib/connector-connect-required';
export type {
  ConnectorAuthorizationReason,
  ConnectorConnectRequest,
} from './lib/connector-connect-required';
export {
  InlineToolCall,
  InlineToolCallStack,
  inferKindFromLabel,
  KIND_TO_BADGE,
} from './components/InlineToolCall';
export type {
  InlineToolCallProps,
  InlineToolCallStackProps,
  InlineToolCallStatus,
  InlineToolKind,
  InlineToolIconStyle,
  BadgeConfig,
} from './components/InlineToolCall';
export { InlineToolCallGroup } from './components/InlineToolCallGroup';
export type { InlineToolCallGroupProps } from './components/InlineToolCallGroup';
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

// Phase A Slice 4 — Artifacts + sidecar (ported from UAC, covers Task #16)
export { ArtifactRenderer, isTabularType } from './components/ArtifactRenderer';
export type { ArtifactRendererProps } from './components/ArtifactRenderer';
export { ArtifactsSidebar } from './components/ArtifactsSidebar';
export type { ArtifactsSidebarProps } from './components/ArtifactsSidebar';
export { SidecarPanel } from './components/sidecar/SidecarPanel';
export type { SidecarPanelProps, SidecarPanelType } from './components/sidecar/SidecarPanel';
export { PresentationArtifact } from './components/artifact-components/PresentationArtifact';
export type { PresentationArtifactProps } from './components/artifact-components/PresentationArtifact';
export {
  ReactPreview,
  buildReactPreviewDocument,
} from './components/artifact-components/ReactPreview';
export type { ReactPreviewProps } from './components/artifact-components/ReactPreview';
export { ArtifactSandboxFrame } from './components/artifact-components/ArtifactSandboxFrame';
export type { ArtifactSandboxFrameProps } from './components/artifact-components/ArtifactSandboxFrame';
export {
  SpreadsheetArtifact,
  SPREADSHEET_ROW_CAP,
} from './components/artifact-components/SpreadsheetArtifact';
export type { SpreadsheetArtifactProps } from './components/artifact-components/SpreadsheetArtifact';
export {
  EmailArtifact,
  parseEmail,
  emailToText,
} from './components/artifact-components/EmailArtifact';
export type {
  EmailArtifactProps,
  ParsedEmail,
} from './components/artifact-components/EmailArtifact';
export { splitSlides } from './components/artifact-components/PresentationArtifact';
export {
  parseTabular,
  parseDelimited,
  toCsv,
  toMarkdownTable,
  isNumericCell,
  numericValue,
} from './lib/tabular';
export type { TabularData } from './lib/tabular';
// Store selectors for the conversation-keyed artifact map
export { selectArtifacts, selectActiveArtifact, selectArtifactById } from './stores/artifactStore';

// Phase A Slice 5 — Chat UX shell (ported from UAC)
export { BrandedGreeting } from './components/BrandedGreeting';
export type { BrandedGreetingProps } from './components/BrandedGreeting';
export { AdvancedEmptyState } from './components/AdvancedEmptyState';
export type { AdvancedEmptyStateProps } from './components/AdvancedEmptyState';
export {
  BriefStatus,
  FloatingBriefStatus,
  useBriefStatus,
  actionMessages,
} from './components/BriefStatus';
export type {
  BriefStatusState,
  BriefStatusProps,
  FloatingBriefStatusProps,
} from './components/BriefStatus';
export { ChatNotificationBadge } from './components/ChatNotificationBadge';
export type {
  ChatNotificationBadgeProps,
  BadgeNotificationType,
} from './components/ChatNotificationBadge';
export { BrowserActivityBadge } from './components/BrowserActivityBadge';
export type {
  BrowserActivityBadgeProps,
  BrowserAgentStatus,
} from './components/BrowserActivityBadge';
export { KeyboardShortcutsDialog } from './components/KeyboardShortcutsDialog';
export type { KeyboardShortcutsDialogProps } from './components/KeyboardShortcutsDialog';
export { KeyboardShortcutsOverlay } from './components/KeyboardShortcutsOverlay';
export type {
  KeyboardShortcutsOverlayProps,
  ShortcutItem,
  ShortcutSection,
} from './components/KeyboardShortcutsOverlay';
export { ChatStream } from './components/ChatStream';
export type { ChatStreamProps } from './components/ChatStream';
export { ChatInputToolbar, PlanModeToggle } from './components/ChatInputToolbar';
export type { ChatInputToolbarProps, PlanModeToggleProps } from './components/ChatInputToolbar';
export { SlashCommandMenu } from './components/SlashCommandMenu';
export type { SlashCommandMenuProps, CommandSuggestion } from './components/SlashCommandMenu';
export { SkillMentionPicker } from './components/SkillMentionPicker';
export type { SkillMentionPickerProps, MentionSkill } from './components/SkillMentionPicker';
export { FileMentionPicker } from './components/FileMentionPicker';
export type { FileMentionPickerProps, MentionFile } from './components/FileMentionPicker';
export { PromptStash } from './components/PromptStash';
export type { PromptStashProps } from './components/PromptStash';
export { PromptSuggestionsDropdown } from './components/PromptSuggestionsDropdown';
export type {
  PromptSuggestionsDropdownProps,
  PromptSuggestion,
  PromptSuggestionType,
} from './components/PromptSuggestionsDropdown';
// New stores
export {
  useMentionStore,
  selectActiveMentionTrigger,
  selectMentionQuery,
  selectMentionCursorIndex,
} from './stores/mentionStore';
export type { MentionTrigger } from './stores/mentionStore';
export {
  usePromptStashStore,
  selectPromptStashEntries,
  selectPromptStashCount,
} from './stores/promptStashStore';
export type { PromptStashEntry } from './stores/promptStashStore';
// Re-export plan-mode store selectors (added in Slice 3, referenced by Task #18)
export {
  selectPlanMode,
  selectPendingPlan,
  selectHasPendingApproval,
} from './stores/planModeStore';

// Max tier gating (Task #17 — multi-provider in-thread switch)
export { MaxUpgradePrompt } from './components/MaxUpgradePrompt';
export type { MaxUpgradePromptProps } from './components/MaxUpgradePrompt';
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
