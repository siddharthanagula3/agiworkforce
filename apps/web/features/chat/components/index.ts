// Chat Components - Organized by Domain

// Messages
export * from './messages';

// Dialogs
export * from './dialogs';

// Agents
export * from './agents';

// Artifacts
export * from './artifacts';

// Search
export * from './search';

// Workflows
export * from './workflows';

// Tokens
export * from './tokens';

// Shortcuts
export * from './shortcuts';

// Main (re-export from Main folder)
export * from './Main';

// Sidebar (re-export from Sidebar folder)
export * from './Sidebar';

// Composer (re-export from Composer folder)
export * from './Composer';

// Tools (re-export from Tools folder)
export * from './Tools';

// Branch Navigation
export { BranchNavigator, BranchIndicator, MessageBranchIndicator } from './BranchNavigator';

// ── New feature components ────────────────────────────────────────────────────
// Feature 1: ToolCallCard — web-native tool call display (pending/running/complete/error)
export { ToolCallCard } from './ToolCallCard';
export type { ToolCall, ToolCallStatus } from './ToolCallCard';

// Feature 2: VoiceInputButton — Web Speech API voice-to-text input
export { VoiceInputButton } from './VoiceInputButton';

// Feature 3a: ThinkingBlock — collapsible extended reasoning display (no framer-motion)
export { ThinkingBlock } from './ThinkingBlock';

// Feature 3b: ArtifactBlock — detect and render code blocks (html/csv/json/mermaid/generic)
export { ArtifactBlock } from './ArtifactBlock';
