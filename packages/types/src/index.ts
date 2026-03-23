/**
 * @agiworkforce/types
 *
 * Shared TypeScript types for the AGI Workforce platform.
 *
 * @packageDocumentation
 */

// Context types for AI conversations
export * from './context';

// Prompt enhancement types (reference for Rust implementation)
export * from './prompt-enhancement';

// Signaling protocol types for real-time communication
export * from './signaling';

// Tauri command and event types
export * from './tauri';

// Error types and codes
export * from './errors';

// Custom model configuration types
export * from './customModel';

// Tool event types for the agentic chat pipeline (matches Rust ToolEvent enum)
export * from './tool-events';

// Agent session and status tracking types
export * from './agent-status';

// Authentication types (sessions, tokens, bridge messages)
export * from './auth';

// Voice types (providers, config, transcription)
export * from './voice';

// Shared conversation and message contracts
export * from './conversation';

// Workflow engine types (nodes, edges, triggers, execution)
export * from './workflow';

// Provider type — canonical union of all LLM provider identifiers
export * from './provider';

// Model catalog types (metadata, capabilities, provider config)
export * from './model-catalog';

// Canonical model catalog data (single source of truth for all surfaces)
export { default as modelsCatalogJson } from './models.json';

// Runtime activity and approval contracts
export * from './runtime';

// Artifact contracts (code, documents, images, data)
export * from './artifacts';

// Web app offline and session management types
export * from './web-offline';

// Web app custom hook types
export * from './web-hooks';

// Agent types (Agent, AgentConfig, AgentLifecycleStatus, ToolExecution, AgentApprovalRequest)
export {
  type AgentConfig,
  type AgentLifecycleStatus,
  type Agent,
  type ToolExecution,
  type AgentApprovalRequest,
} from './agent';

// Chat types (ChatMessage, Conversation, ChatAttachment)
export * from './chat';

// Pairing types (PairingToken, PairingStatus, DeviceInfo)
export * from './pairing';

// Model types (ModelConfig, ModelProvider, ModelPricing)
export * from './model';

// User types (User, ExtendedUserProfile, SubscriptionTier)
export * from './user';

// Scheduler types (ScheduledTask, ScheduleConfig, CronExpression)
export * from './scheduler';

// Memory types (Memory, MemoryCategory, ImportanceScore)
export * from './memory';

// Research types (ResearchQuery, ResearchReport, Citation)
export * from './research';

// Council types (CouncilQuery, CouncilResponse, ModelVote)
export * from './council';

// Audit event types (AuditEvent, AuditAction, AuditSeverity, helpers)
export * from './audit';

// Event trigger types (cron, webhook, Slack, GitHub, Linear, file watcher)
export * from './event-triggers';

// MCP Apps types (interactive tool UIs in chat)
export * from './mcp-apps';

// A2A protocol types (agent-to-agent communication)
export * from './a2a';

// Cross-device orchestration types (desktop↔mobile threads)
export * from './cross-device';

// Workspace analytics types (enterprise usage tracking)
export * from './workspace-analytics';

// Command capability types (runtime-aware dispatch)
export * from './command-capabilities';
