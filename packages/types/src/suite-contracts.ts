/**
 * Cross-surface AGI application-suite contracts.
 *
 * These types are the source of truth for the Local/BYOK/Managed trust
 * boundary, app-chat sync boundary, generated-file manifests, explicit
 * developer-session handoff, connector registry, and remote-control protocol.
 *
 * Surfaces may keep local view models, but persistent records and wire payloads
 * should adapt to these contracts at the boundary.
 *
 * @module suite-contracts
 * @packageDocumentation
 */

import type { Provider } from './provider';
import type { ArtifactType, ConversationId, MessageId, RiskLevel } from './conversation';

// ============================================================================
// Trust Boundary And Surface Contracts
// ============================================================================

/** User-visible privacy boundary for every conversation, session, and artifact. */
export type PrivacyMode = 'local' | 'byok' | 'managed';

/**
 * Provider execution path.
 *
 * These values intentionally differ from `PrivacyMode`: a managed-native
 * provider may still be privacy-mode `managed`, while direct BYOK is always
 * privacy-mode `byok`.
 */
export type ProviderMode = 'Local' | 'DirectByok' | 'ManagedGateway' | 'ManagedNative';

export type SourceSurface = 'web' | 'desktop' | 'mobile' | 'cli' | 'vscode' | 'chrome';

export type SyncedAppSurface = Extract<SourceSurface, 'web' | 'desktop' | 'mobile'>;

export type DeveloperSessionSurface = Extract<SourceSurface, 'cli' | 'vscode' | 'chrome'>;

export type StorageScope =
  | 'local_device'
  | 'synced_app_cloud'
  | 'developer_workspace'
  | 'direct_byok_provider'
  | 'managed_compute';

export const PRIVACY_MODES = ['local', 'byok', 'managed'] as const satisfies readonly PrivacyMode[];

export const PROVIDER_MODES = [
  'Local',
  'DirectByok',
  'ManagedGateway',
  'ManagedNative',
] as const satisfies readonly ProviderMode[];

export const SYNCED_APP_SURFACES = [
  'web',
  'desktop',
  'mobile',
] as const satisfies readonly SyncedAppSurface[];

export const DEVELOPER_SESSION_SURFACES = [
  'cli',
  'vscode',
  'chrome',
] as const satisfies readonly DeveloperSessionSurface[];

export function isSyncedAppSurface(surface: SourceSurface): surface is SyncedAppSurface {
  return (SYNCED_APP_SURFACES as readonly SourceSurface[]).includes(surface);
}

export function isDeveloperSessionSurface(
  surface: SourceSurface,
): surface is DeveloperSessionSurface {
  return (DEVELOPER_SESSION_SURFACES as readonly SourceSurface[]).includes(surface);
}

export function providerModeToPrivacyMode(mode: ProviderMode): PrivacyMode {
  switch (mode) {
    case 'Local':
      return 'local';
    case 'DirectByok':
      return 'byok';
    case 'ManagedGateway':
    case 'ManagedNative':
      return 'managed';
  }
}

export function providerSurfaceToProviderMode(
  surface: 'managed_cloud' | 'byok' | 'local' | 'hidden',
): ProviderMode | null {
  switch (surface) {
    case 'local':
      return 'Local';
    case 'byok':
      return 'DirectByok';
    case 'managed_cloud':
      return 'ManagedGateway';
    case 'hidden':
      return null;
  }
}

// ============================================================================
// Synced App Conversations And Developer Sessions
// ============================================================================

export type ConversationVisibility = 'private' | 'team' | 'organization';

export interface SyncedAppConversation {
  id: ConversationId;
  ownerUserId: string;
  organizationId?: string | null;
  sourceSurface: SyncedAppSurface;
  title: string;
  visibility: ConversationVisibility;
  privacyMode: PrivacyMode;
  providerMode: ProviderMode;
  storageScope: Extract<StorageScope, 'local_device' | 'synced_app_cloud' | 'managed_compute'>;
  projectId?: string | null;
  artifactIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SyncedAppMessage {
  id: MessageId;
  conversationId: ConversationId;
  sourceSurface: SyncedAppSurface;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  privacyMode: PrivacyMode;
  providerMode?: ProviderMode;
  provider?: Provider | string | null;
  model?: string | null;
  artifactIds?: string[];
  generatedFileIds?: string[];
  createdAt: string;
}

// Compatibility contract for the existing web_conversations/web_messages sync
// tables. Root conversations/messages remain the target canonical sync schema.
export type LegacyWebSyncOrigin = SyncedAppSurface;
export type LegacyWebSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export interface LegacyWebSyncedConversation {
  id: string;
  user_id: string;
  title: string | null;
  model: string | null;
  is_active: boolean | null;
  synced_from: LegacyWebSyncOrigin | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}

export interface LegacyWebSyncedMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_cents: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface LegacyWebSyncEvent {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  conversation: LegacyWebSyncedConversation;
}

export type DeveloperSessionKind =
  | 'cli'
  | 'ide'
  | 'browser'
  | 'code_review'
  | 'automation'
  | 'subagent';

export interface DeveloperSession {
  id: string;
  sourceSurface: DeveloperSessionSurface;
  kind: DeveloperSessionKind;
  workspaceRoot: string;
  title: string;
  privacyMode: PrivacyMode;
  providerMode: ProviderMode;
  parentSessionId?: string | null;
  forkedFromEventId?: string | null;
  status: 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface SecretScanFinding {
  id: string;
  ruleId: string;
  label: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: string;
  redactedPreview: string;
}

export interface RedactionReport {
  scannerVersion: string;
  findings: SecretScanFinding[];
  redactedByteCount: number;
  blocked: boolean;
  generatedAt: string;
}

export interface HandoffContextItem {
  id: string;
  kind: 'message' | 'file' | 'artifact' | 'generated_file' | 'selection' | 'terminal_output';
  label: string;
  sourceUri?: string;
  byteCount?: number;
  checksumSha256?: string;
}

export interface HandoffDraft {
  id: string;
  sourceSessionId: string;
  sourceSurface: DeveloperSessionSurface | SyncedAppSurface;
  targetSurface: SyncedAppSurface;
  targetPrivacyMode: PrivacyMode;
  targetProviderMode: ProviderMode;
  selectedContext: HandoffContextItem[];
  redactionReport: RedactionReport;
  previewHashSha256: string;
  consentRequired: boolean;
  consentedAt?: string | null;
  expiresAt: string;
  createdAt: string;
}

// ============================================================================
// Projects, Artifacts, Compute Sessions, And Generated Files
// ============================================================================

export interface ProjectRecord {
  id: string;
  ownerUserId: string;
  organizationId?: string | null;
  name: string;
  description?: string | null;
  defaultPrivacyMode: PrivacyMode;
  defaultProviderMode: ProviderMode;
  allowedSurfaces: SourceSurface[];
  createdAt: string;
  updatedAt: string;
}

export type ComputeSessionStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'deleted';

export interface ComputeSession {
  id: string;
  ownerUserId: string;
  organizationId?: string | null;
  sourceSurface: SourceSurface;
  privacyMode: PrivacyMode;
  providerMode: ProviderMode;
  provider?: Provider | string | null;
  model?: string | null;
  status: ComputeSessionStatus;
  workdirUri: string;
  retentionExpiresAt?: string | null;
  ttlSeconds?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  deletedAt?: string | null;
}

export type GeneratedFileKind =
  | 'pdf'
  | 'docx'
  | 'xlsx'
  | 'pptx'
  | 'csv'
  | 'json'
  | 'markdown'
  | 'html'
  | 'image'
  | 'archive'
  | 'other';

export interface GeneratedFilePreview {
  kind: 'thumbnail' | 'text' | 'html' | 'pdf_page' | 'image';
  uri: string;
  checksumSha256?: string;
  byteCount?: number;
  pageNumber?: number;
}

export interface GeneratedFile {
  id: string;
  computeSessionId: string;
  ownerUserId: string;
  sourceSurface: SourceSurface;
  privacyMode: PrivacyMode;
  providerMode: ProviderMode;
  kind: GeneratedFileKind;
  fileName: string;
  mimeType: string;
  uri: string;
  byteCount: number;
  checksumSha256: string;
  previewDerivatives: GeneratedFilePreview[];
  retentionExpiresAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
}

export interface ArtifactManifest {
  id: string;
  artifactId: string;
  type: ArtifactType | 'data' | 'generated_file_bundle';
  title: string;
  sourceConversationId?: string | null;
  sourceMessageId?: string | null;
  sourceSessionId?: string | null;
  computeSessionId?: string | null;
  generatedFileIds: string[];
  privacyMode: PrivacyMode;
  providerMode: ProviderMode;
  storageScope: StorageScope;
  checksumSha256?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Remote Control, Computer Use, And Dispatch Payloads
// ============================================================================

export type RemoteControlSessionStatus =
  | 'pairing'
  | 'connected'
  | 'paused'
  | 'revoked'
  | 'expired'
  | 'failed';

export interface RemoteControlSession {
  id: string;
  desktopDeviceId: string;
  controllerSurface: Extract<SourceSurface, 'mobile' | 'web'>;
  privacyMode: PrivacyMode;
  status: RemoteControlSessionStatus;
  allowedActions: ComputerActionKind[];
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
}

export type ComputerActionKind =
  | 'screenshot'
  | 'click'
  | 'type_text'
  | 'press_key'
  | 'scroll'
  | 'drag'
  | 'open_url'
  | 'download_file'
  | 'approve_tool'
  | 'reject_tool';

export interface ComputerAction {
  id: string;
  sessionId: string;
  kind: ComputerActionKind;
  target?: string;
  args?: Record<string, unknown>;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  status: 'queued' | 'approved' | 'running' | 'completed' | 'rejected' | 'failed';
  createdAt: string;
  completedAt?: string | null;
}

export type RemoteDispatchPayload =
  | { action: 'approval.response'; requestId: string; approved: boolean; reason?: string }
  | { action: 'agent.command'; agentId: string; command: 'pause' | 'resume' | 'cancel' }
  | { action: 'agent.refresh' }
  | { action: 'heartbeat.ping'; sentAt: string }
  | { action: 'remote_control.action'; actionRecord: ComputerAction }
  | { action: 'generated_file.preview'; generatedFileId: string }
  | { action: 'generated_file.download'; generatedFileId: string }
  | { action: 'emergency_stop'; reason?: string };

export interface DispatchApprovalEvent {
  id: string;
  payload: RemoteDispatchPayload;
  riskLevel: RiskLevel;
  approvedByUserId?: string | null;
  decidedAt?: string | null;
}

// ============================================================================
// Connector/MCP Registry
// ============================================================================

export type ConnectorTransport = 'stdio' | 'sse' | 'http' | 'websocket' | 'native_host';

export interface ConnectorCapability {
  id: string;
  kind: 'tool' | 'prompt' | 'resource' | 'oauth' | 'file_access' | 'browser_access';
  name: string;
  description?: string;
}

export interface ConnectorRegistryEntry {
  id: string;
  displayName: string;
  provider: 'mcp' | 'native' | 'browser' | 'api';
  transport: ConnectorTransport;
  allowedSurfaces: SourceSurface[];
  capabilities: ConnectorCapability[];
  permissionIds: string[];
  adminApprovalRequired: boolean;
  consentRequired: boolean;
  version: string;
  installedAt?: string | null;
}

// ============================================================================
// Agent/Subagent Event Records
// ============================================================================

export type AgentSessionEventKind =
  | 'session.started'
  | 'session.paused'
  | 'session.resumed'
  | 'session.completed'
  | 'session.failed'
  | 'message.created'
  | 'tool.started'
  | 'tool.completed'
  | 'hook.started'
  | 'hook.completed'
  | 'mcp.prompt.invoked'
  | 'subagent.started'
  | 'subagent.completed'
  | 'privacy.changed'
  | 'provider.changed'
  | 'fork.created'
  | 'replay.started';

export interface AgentSessionEvent {
  id: string;
  sessionId: string;
  parentEventId?: string | null;
  kind: AgentSessionEventKind;
  sourceSurface: SourceSurface;
  privacyMode: PrivacyMode;
  providerMode: ProviderMode;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface AgentSpec {
  id: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  allowedTools: string[];
  privacyMode: PrivacyMode;
  providerMode: ProviderMode;
  createdAt: string;
  updatedAt: string;
}

export interface SubagentRun {
  id: string;
  parentSessionId: string;
  agentSpecId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  findingsUri?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface TaskBoard {
  id: string;
  sessionId: string;
  tasks: Array<{
    id: string;
    title: string;
    laneId?: string;
    status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
    ownerAgentId?: string | null;
  }>;
  updatedAt: string;
}
