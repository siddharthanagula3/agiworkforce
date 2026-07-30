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

// Cross-surface break reminders and quiet-hours settings
export * from './time-focus';

// Deterministic strict-content policy shared by Local and Managed Cloud sends.
export * from './content-safety';

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

// Billing plan pricing and included-usage budget helpers
export * from './billing-catalog';

// Shared subscription-status entitlement policy
export * from './subscription-entitlement';

// Percentage-only public managed-usage status shared by cloud clients.
export * from './managed-usage-balance';

// Managed cloud-code sessions and terminal journal
export * from './cloud-code';

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

// Anthropic Dispatch HMAC envelope contract (canonical wire format)
export * from './dispatch';

// Workspace analytics types (enterprise usage tracking)
export * from './workspace-analytics';

// Enterprise admin, compliance, identity, support, and managed-credit contracts
export * from './enterprise';

// Command capability types (runtime-aware dispatch)
export * from './command-capabilities';

// Provider adapter contract (lifted from OpenClaw, adapted)
export * from './provider-adapter';

// Design-system shared contracts (provider identity, effort, agent mode, settings IA, etc.)
export * from './design-system';

// On-device model catalog types (Path C architecture — local LLM type system)
export * from './on-device-models';

// Cross-surface application-suite contracts
export * from './suite-contracts';

// Platform capability matrix — single source of truth for which user-facing
// capabilities each surface (web/desktop/mobile) exposes (platform axis).
export * from './capabilities';

// Cross-surface tool-call display registry (icon names + categories; pure TS,
// shared by desktop/web via lucide-react and mobile via lucide-react-native)
export * from './tool-display';

// Rust-owned local developer-session contracts consumed by IDE clients.
// Export selected names from the package root because legacy `moduleResolution:
// node` consumers cannot resolve package export subpaths reliably.
export type {
  AgentEventApprovalDecision,
  AgentEventApprovalRiskLevel,
  AgentEventEnvelope,
  AgentEventSource,
  AgentEventStopReason,
  AgentEventToolCategory,
  AgentTaskState,
  AppServerCapabilities,
  AppServerNotification,
  ApprovalResponseParams,
  DeveloperReasoningEffort,
  DeveloperRoutingTaskType,
  InitializeResponse,
  LocalModelListResponse,
  LocalModelProvider,
  LocalModelSummary,
  ThreadListParams,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadStartParams,
  ThreadSummary,
  TurnInterruptParams,
  TurnSteerParams,
  TurnStartParams,
  TurnSummary,
  UserInput,
} from './generated/protocol/index';

// Discriminated session-kind taxonomy + ExecutionProfile (Local/Cloud toggle
// resolving identity/data/inference/tools/workflow planes) — W5 discipline
// wave 1, CC §4.2/§4.3 and R5 adjudication.
export * from './sessions';

// Server-authoritative effective-capability handshake (model ∩ tier ∩
// surface ∩ settings) — W5 discipline wave 1, six-app report finding A.
export * from './capability-handshake';
