// Lib
export * from './lib/tokens';
export * from './lib/types';
export * from './lib/runtime';
export * from './lib/utils';
export * from './lib/greetings';

// Stores — prefixed to avoid collisions with host-app store names
export { useChatStore } from './stores/chatStore';
export { useModelStore as useChatModelStore } from './stores/modelStore';
export { useUIStore as useChatUIStore } from './stores/uiStore';
export { useProjectStore as useChatProjectStore } from './stores/projectStore';
export { useSettingsStore as useChatSettingsStore } from './stores/settingsStore';

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
