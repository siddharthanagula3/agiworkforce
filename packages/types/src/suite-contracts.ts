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

export interface TrustBoundaryDisplayCopy {
  label: string;
  shortLabel: string;
  description: string;
}

export interface ProviderModeDisplayCopy extends TrustBoundaryDisplayCopy {
  privacyMode: PrivacyMode;
}

export const PRIVACY_MODE_DISPLAY = {
  local: {
    label: 'Local',
    shortLabel: 'Local',
    description: 'Runs on this device or workspace without AGI-managed cloud execution.',
  },
  byok: {
    label: 'BYOK',
    shortLabel: 'BYOK',
    description: 'Uses the user-owned provider key; payloads go to that provider account.',
  },
  managed: {
    label: 'Managed',
    shortLabel: 'Managed',
    description: 'Uses AGI-managed provider access or hosted compute behind explicit consent.',
  },
} as const satisfies Readonly<Record<PrivacyMode, TrustBoundaryDisplayCopy>>;

export const PROVIDER_MODE_DISPLAY = {
  Local: {
    label: 'Local',
    shortLabel: 'Local',
    privacyMode: 'local',
    description: 'Model execution stays on the local device, workspace, or local host.',
  },
  DirectByok: {
    label: 'BYOK',
    shortLabel: 'BYOK',
    privacyMode: 'byok',
    description: 'Requests use a user-owned provider key without AGI-managed model credits.',
  },
  ManagedGateway: {
    label: 'Managed Gateway',
    shortLabel: 'Managed',
    privacyMode: 'managed',
    description: 'Requests route through an AGI-managed gateway or proxy with managed consent.',
  },
  ManagedNative: {
    label: 'Managed Native',
    shortLabel: 'Managed',
    privacyMode: 'managed',
    description: 'Requests use AGI-managed provider access directly from managed services.',
  },
} as const satisfies Readonly<Record<ProviderMode, ProviderModeDisplayCopy>>;

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

export function getPrivacyModeDisplay(mode: PrivacyMode): TrustBoundaryDisplayCopy {
  return PRIVACY_MODE_DISPLAY[mode];
}

export function getProviderModeDisplay(mode: ProviderMode): ProviderModeDisplayCopy {
  return PROVIDER_MODE_DISPLAY[mode];
}

export function formatPrivacyModeLabel(mode: PrivacyMode): string {
  return getPrivacyModeDisplay(mode).label;
}

export function formatProviderModeLabel(mode: ProviderMode): string {
  return getProviderModeDisplay(mode).label;
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

export interface GeneratedFilePresentationInput {
  computeSession?: ComputeSession | null;
  generatedFile?: GeneratedFile | null;
  artifactManifest?: ArtifactManifest | null;
  fallbackFileName?: string | null;
  fallbackKind?: GeneratedFileKind | string | null;
  fallbackMimeType?: string | null;
  fallbackUri?: string | null;
  fallbackStatus?: ComputeSessionStatus | string | null;
}

export interface GeneratedFilePresentation {
  title: string;
  fileName: string;
  kindLabel: string;
  mimeType?: string;
  status: ComputeSessionStatus | 'unknown';
  statusLabel: string;
  isRunning: boolean;
  isComplete: boolean;
  isFailed: boolean;
  privacyMode?: PrivacyMode;
  privacyLabel?: string;
  privacyShortLabel?: string;
  providerMode?: ProviderMode;
  providerLabel?: string;
  sourceSurface?: SourceSurface;
  sourceSurfaceLabel?: string;
  sourceSessionId?: string;
  sourceSessionLabel?: string;
  computeSessionId?: string;
  generatedFileId?: string;
  artifactManifestId?: string;
  primaryUri?: string;
  previewUri?: string;
  byteCountLabel?: string;
  checksumShort?: string;
  retentionLabel?: string;
  storageScope?: StorageScope;
  canPreview: boolean;
  canDownload: boolean;
  canShare: boolean;
  localOnly: boolean;
}

const GENERATED_FILE_KIND_LABELS: Readonly<Record<GeneratedFileKind, string>> = {
  pdf: 'PDF',
  docx: 'Word',
  xlsx: 'Excel',
  pptx: 'PowerPoint',
  csv: 'CSV',
  json: 'JSON',
  markdown: 'Markdown',
  html: 'HTML',
  image: 'Image',
  archive: 'Archive',
  other: 'File',
};

const COMPUTE_SESSION_STATUS_LABELS: Readonly<Record<ComputeSessionStatus, string>> = {
  queued: 'Queued',
  running: 'Generating',
  completed: 'Ready',
  failed: 'Failed',
  expired: 'Expired',
  deleted: 'Deleted',
};

const SOURCE_SURFACE_LABELS: Readonly<Record<SourceSurface, string>> = {
  web: 'Web',
  desktop: 'Desktop',
  mobile: 'Mobile',
  cli: 'CLI',
  vscode: 'VS Code',
  chrome: 'Chrome',
};

export function formatGeneratedFileKindLabel(kind?: GeneratedFileKind | string | null): string {
  if (!kind) return 'File';
  return (
    GENERATED_FILE_KIND_LABELS[kind as GeneratedFileKind] ??
    kind.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

export function formatComputeSessionStatusLabel(
  status?: ComputeSessionStatus | string | null,
): string {
  if (!status) return 'Unknown';
  return (
    COMPUTE_SESSION_STATUS_LABELS[status as ComputeSessionStatus] ??
    status.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

export function formatSourceSurfaceLabel(surface?: SourceSurface | string | null): string {
  if (!surface) return 'Unknown surface';
  return (
    SOURCE_SURFACE_LABELS[surface as SourceSurface] ??
    surface.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

export function formatGeneratedFileByteCount(byteCount?: number | null): string | undefined {
  if (typeof byteCount !== 'number' || !Number.isFinite(byteCount) || byteCount < 0) {
    return undefined;
  }
  if (byteCount < 1024) return `${byteCount} B`;
  if (byteCount < 1024 * 1024) return `${(byteCount / 1024).toFixed(1)} KB`;
  if (byteCount < 1024 * 1024 * 1024) {
    return `${(byteCount / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(byteCount / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function summarizeGeneratedFileBundle(
  input: GeneratedFilePresentationInput,
): GeneratedFilePresentation {
  const { computeSession, generatedFile, artifactManifest } = input;
  const privacyMode =
    generatedFile?.privacyMode ?? artifactManifest?.privacyMode ?? computeSession?.privacyMode;
  const providerMode =
    generatedFile?.providerMode ?? artifactManifest?.providerMode ?? computeSession?.providerMode;
  const status = (computeSession?.status ?? input.fallbackStatus ?? 'unknown') as
    | ComputeSessionStatus
    | 'unknown';
  const sourceSurface = generatedFile?.sourceSurface ?? computeSession?.sourceSurface;
  const primaryUri = generatedFile?.uri ?? input.fallbackUri ?? undefined;
  const previewUri = generatedFile?.previewDerivatives[0]?.uri;
  const fileName = generatedFile?.fileName ?? input.fallbackFileName ?? 'generated-file';
  const kind = generatedFile?.kind ?? input.fallbackKind;
  const retentionExpiresAt =
    generatedFile?.retentionExpiresAt ?? computeSession?.retentionExpiresAt ?? undefined;
  const sourceSessionId = artifactManifest?.sourceSessionId ?? undefined;

  return {
    title: artifactManifest?.title ?? fileName,
    fileName,
    kindLabel: formatGeneratedFileKindLabel(kind),
    mimeType: generatedFile?.mimeType ?? input.fallbackMimeType ?? undefined,
    status,
    statusLabel: formatComputeSessionStatusLabel(status),
    isRunning: status === 'queued' || status === 'running',
    isComplete: status === 'completed',
    isFailed: status === 'failed' || status === 'expired' || status === 'deleted',
    privacyMode,
    privacyLabel: privacyMode ? formatPrivacyModeLabel(privacyMode) : undefined,
    privacyShortLabel: privacyMode ? getPrivacyModeDisplay(privacyMode).shortLabel : undefined,
    providerMode,
    providerLabel: providerMode ? formatProviderModeLabel(providerMode) : undefined,
    sourceSurface,
    sourceSurfaceLabel: sourceSurface ? formatSourceSurfaceLabel(sourceSurface) : undefined,
    sourceSessionId,
    sourceSessionLabel: sourceSessionId ? `Session ${sourceSessionId}` : undefined,
    computeSessionId: computeSession?.id ?? generatedFile?.computeSessionId,
    generatedFileId: generatedFile?.id,
    artifactManifestId: artifactManifest?.id,
    primaryUri,
    previewUri,
    byteCountLabel: formatGeneratedFileByteCount(generatedFile?.byteCount),
    checksumShort: generatedFile?.checksumSha256
      ? generatedFile.checksumSha256.slice(0, 12)
      : artifactManifest?.checksumSha256
        ? artifactManifest.checksumSha256.slice(0, 12)
        : undefined,
    retentionLabel: retentionExpiresAt ? `Retains until ${retentionExpiresAt}` : undefined,
    storageScope: artifactManifest?.storageScope,
    canPreview: Boolean(previewUri || primaryUri),
    canDownload: Boolean(primaryUri) && status === 'completed',
    canShare: Boolean(primaryUri) && status === 'completed',
    localOnly: privacyMode === 'local' || providerMode === 'Local',
  };
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
// Developer Session Event Stream, Fork, And Replay Records
// ============================================================================

export type DeveloperSessionEventKind =
  | 'session.started'
  | 'session.paused'
  | 'session.resumed'
  | 'session.completed'
  | 'session.failed'
  | 'message.created'
  | 'message.delta'
  | 'message.completed'
  | 'tool.requested'
  | 'tool.started'
  | 'tool.delta'
  | 'tool.completed'
  | 'tool.failed'
  | 'permission.requested'
  | 'permission.resolved'
  | 'hook.started'
  | 'hook.completed'
  | 'mcp.prompt.invoked'
  | 'subagent.started'
  | 'subagent.completed'
  | 'checkpoint.created'
  | 'privacy.changed'
  | 'provider.changed'
  | 'fork.created'
  | 'replay.started'
  | 'replay.completed'
  | 'error';

export const DEVELOPER_SESSION_EVENT_KINDS = [
  'session.started',
  'session.paused',
  'session.resumed',
  'session.completed',
  'session.failed',
  'message.created',
  'message.delta',
  'message.completed',
  'tool.requested',
  'tool.started',
  'tool.delta',
  'tool.completed',
  'tool.failed',
  'permission.requested',
  'permission.resolved',
  'hook.started',
  'hook.completed',
  'mcp.prompt.invoked',
  'subagent.started',
  'subagent.completed',
  'checkpoint.created',
  'privacy.changed',
  'provider.changed',
  'fork.created',
  'replay.started',
  'replay.completed',
  'error',
] as const satisfies readonly DeveloperSessionEventKind[];

export interface DeveloperSessionLifecycleEventPayload {
  status?: DeveloperSession['status'];
  title?: string;
  workspaceRoot?: string;
  reason?: string;
}

export interface DeveloperSessionMessageEventPayload {
  messageId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string;
  delta?: string;
  tokenCount?: number;
}

export interface DeveloperSessionToolEventPayload {
  toolCallId: string;
  toolName: string;
  displayName?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown> | string;
  exitCode?: number | null;
  durationMs?: number;
  riskLevel?: RiskLevel;
  error?: string;
}

export interface DeveloperSessionPermissionEventPayload {
  requestId: string;
  toolName?: string;
  question: string;
  riskLevel: RiskLevel;
  decision: 'pending' | 'approved' | 'rejected' | 'expired';
  decidedByUserId?: string | null;
  reason?: string;
}

export interface DeveloperSessionHookEventPayload {
  hookName: string;
  stage: 'pre_tool' | 'post_tool' | 'session_start' | 'session_stop' | 'custom';
  status?: 'running' | 'completed' | 'failed';
  durationMs?: number;
  output?: string;
}

export interface DeveloperSessionMcpPromptEventPayload {
  connectorId: string;
  promptName: string;
  arguments?: Record<string, unknown>;
}

export interface DeveloperSessionSubagentEventPayload {
  subagentRunId: string;
  agentSpecId?: string;
  parentSessionId: string;
  findingsUri?: string | null;
  status?: SubagentRun['status'];
}

export interface DeveloperSessionCheckpointEventPayload {
  checkpointId: string;
  summary: string;
  dirtyState: DeveloperSessionDirtyState;
}

export interface DeveloperSessionModeChangeEventPayload {
  previousPrivacyMode?: PrivacyMode;
  nextPrivacyMode?: PrivacyMode;
  previousProviderMode?: ProviderMode;
  nextProviderMode?: ProviderMode;
  reason?: string;
}

export interface DeveloperSessionForkEventPayload {
  forkId: string;
  targetSessionId: string;
  forkedFromSequence: number;
  selectedContextIds: string[];
  reason?: string;
}

export interface DeveloperSessionReplayEventPayload {
  replayId: string;
  requestId?: string;
  fromSequence?: number;
  toSequence?: number;
  replayedEventCount?: number;
  skippedEventIds?: string[];
  status?: DeveloperSessionReplayStatus;
  error?: string;
}

export interface DeveloperSessionErrorEventPayload {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface DeveloperSessionEventPayloads {
  'session.started': DeveloperSessionLifecycleEventPayload;
  'session.paused': DeveloperSessionLifecycleEventPayload;
  'session.resumed': DeveloperSessionLifecycleEventPayload;
  'session.completed': DeveloperSessionLifecycleEventPayload;
  'session.failed': DeveloperSessionLifecycleEventPayload;
  'message.created': DeveloperSessionMessageEventPayload;
  'message.delta': DeveloperSessionMessageEventPayload;
  'message.completed': DeveloperSessionMessageEventPayload;
  'tool.requested': DeveloperSessionToolEventPayload;
  'tool.started': DeveloperSessionToolEventPayload;
  'tool.delta': DeveloperSessionToolEventPayload;
  'tool.completed': DeveloperSessionToolEventPayload;
  'tool.failed': DeveloperSessionToolEventPayload;
  'permission.requested': DeveloperSessionPermissionEventPayload;
  'permission.resolved': DeveloperSessionPermissionEventPayload;
  'hook.started': DeveloperSessionHookEventPayload;
  'hook.completed': DeveloperSessionHookEventPayload;
  'mcp.prompt.invoked': DeveloperSessionMcpPromptEventPayload;
  'subagent.started': DeveloperSessionSubagentEventPayload;
  'subagent.completed': DeveloperSessionSubagentEventPayload;
  'checkpoint.created': DeveloperSessionCheckpointEventPayload;
  'privacy.changed': DeveloperSessionModeChangeEventPayload;
  'provider.changed': DeveloperSessionModeChangeEventPayload;
  'fork.created': DeveloperSessionForkEventPayload;
  'replay.started': DeveloperSessionReplayEventPayload;
  'replay.completed': DeveloperSessionReplayEventPayload;
  error: DeveloperSessionErrorEventPayload;
}

export type DeveloperSessionEvent = {
  [Kind in DeveloperSessionEventKind]: {
    id: string;
    sessionId: string;
    parentEventId?: string | null;
    kind: Kind;
    sourceSurface: DeveloperSessionSurface;
    sequence: number;
    privacyMode: PrivacyMode;
    providerMode: ProviderMode;
    payload: DeveloperSessionEventPayloads[Kind];
    createdAt: string;
  };
}[DeveloperSessionEventKind];

export interface DeveloperSessionEventStreamCursor {
  sessionId: string;
  afterSequence?: number;
  afterEventId?: string;
}

export interface DeveloperSessionEventStreamFrame {
  sessionId: string;
  cursor: DeveloperSessionEventStreamCursor;
  events: DeveloperSessionEvent[];
  hasMore: boolean;
  emittedAt: string;
}

export type DeveloperSessionDirtyState = 'clean' | 'dirty' | 'unknown';

export interface DeveloperSessionCheckpoint {
  id: string;
  sessionId: string;
  eventId: string;
  sequence: number;
  workspaceRoot: string;
  gitHead?: string | null;
  dirtyState: DeveloperSessionDirtyState;
  summary: string;
  createdAt: string;
}

export interface DeveloperSessionFork {
  id: string;
  sourceSessionId: string;
  targetSessionId: string;
  forkedFromEventId?: string | null;
  forkedFromSequence: number;
  selectedContextIds: string[];
  privacyMode: PrivacyMode;
  providerMode: ProviderMode;
  reason?: string;
  createdAt: string;
}

export type DeveloperSessionReplayStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface DeveloperSessionReplayRequest {
  id: string;
  sourceSessionId: string;
  targetSurface: DeveloperSessionSurface;
  targetWorkspaceRoot?: string | null;
  fromSequence?: number;
  toSequence?: number;
  includeToolResults: boolean;
  includeGeneratedFiles: boolean;
  redactionReport?: RedactionReport;
  createdAt: string;
}

export interface DeveloperSessionReplayResult {
  id: string;
  requestId: string;
  targetSessionId: string;
  status: DeveloperSessionReplayStatus;
  replayedEventCount: number;
  skippedEventIds: string[];
  error?: string;
  createdAt: string;
  completedAt?: string | null;
}

export type AgentSessionEventKind = DeveloperSessionEventKind;

// Compatibility name for older agent-session callers. New code should use
// `DeveloperSessionEvent` so CLI, VS Code, Chrome, and future viewers share
// sequence-aware stream frames.
export interface AgentSessionEvent {
  id: string;
  sessionId: string;
  parentEventId?: string | null;
  kind: AgentSessionEventKind;
  sourceSurface: SourceSurface;
  sequence?: number;
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
