/**
 * Chat Components Index
 *
 * This file exports all chat-related components for easy importing
 */

// Core chat components
export { ChatInterface } from './ChatInterface';
export { Message } from './Message';
export { MessageList } from './MessageList';
export { InputComposer } from './InputComposer';
export { ConversationSidebar } from './ConversationSidebar';

// Enhanced components with artifact and attachment support
export { ChatInterface as ChatInterfaceEnhanced } from './ChatInterface.enhanced';
export { Message as MessageEnhanced } from './Message.enhanced';
export { InputComposer as InputComposerEnhanced } from './InputComposer.enhanced';

// Artifact components
export { ArtifactRenderer } from './ArtifactRenderer';

// File attachment components
export { FileAttachmentPreview } from './FileAttachmentPreview';
export { FileDropZone } from './FileDropZone';

// Helper functions
export { createExampleArtifacts, createExampleMessage } from './ChatInterface.enhanced';
