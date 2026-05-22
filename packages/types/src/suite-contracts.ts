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

/** User-facing chat execution mode exposed by every app surface. */
export type ChatExecutionMode = 'local_only' | 'byok' | 'cloud_managed';

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

export const CHAT_EXECUTION_MODES = [
  'local_only',
  'byok',
  'cloud_managed',
] as const satisfies readonly ChatExecutionMode[];

export interface TrustBoundaryDisplayCopy {
  label: string;
  shortLabel: string;
  description: string;
}

export interface ProviderModeDisplayCopy extends TrustBoundaryDisplayCopy {
  privacyMode: PrivacyMode;
}

export interface ChatExecutionModeDisplayCopy extends TrustBoundaryDisplayCopy {
  privacyMode: PrivacyMode;
  defaultProviderMode: ProviderMode;
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

export const CHAT_EXECUTION_MODE_DISPLAY = {
  local_only: {
    label: 'Local Mode + Local LLMs',
    shortLabel: 'Local LLMs',
    privacyMode: 'local',
    defaultProviderMode: 'Local',
    description:
      'Runs local or on-device models and must not call AGI managed cloud or direct BYOK providers.',
  },
  byok: {
    label: 'Local Mode + BYOK',
    shortLabel: 'Local + BYOK',
    privacyMode: 'byok',
    defaultProviderMode: 'DirectByok',
    description: 'Keeps the app local while requests go directly to the user-owned provider key.',
  },
  cloud_managed: {
    label: 'Cloud Managed',
    shortLabel: 'Managed',
    privacyMode: 'managed',
    defaultProviderMode: 'ManagedGateway',
    description: 'Uses AGI-managed routing, credits, or hosted compute behind explicit consent.',
  },
} as const satisfies Readonly<Record<ChatExecutionMode, ChatExecutionModeDisplayCopy>>;

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

/**
 * Runtime guard for the cross-surface chat-sync rule. Throws when a caller
 * tries to enrol a `DeveloperSessionSurface` (cli / vscode / chrome) into
 * the synced-app chat pipeline. The goal contract for AGI Workforce is
 * explicit: normal consumer chat sync is Web / Desktop / Mobile only; the
 * developer surfaces keep separate workspace-scoped histories. Round-2
 * audit (2026-05-21).
 *
 * Use at any service boundary that touches synced chat — Supabase
 * realtime channel subscription, conversationSync.startBackgroundSync,
 * the API gateway chat-history endpoints — so a future caller cannot
 * accidentally cross the boundary.
 */
export function assertSurfaceCanSyncChats(
  surface: SourceSurface,
): asserts surface is SyncedAppSurface {
  if (!isSyncedAppSurface(surface)) {
    throw new Error(
      `AGI sync-rule violation: surface "${surface}" cannot participate in app chat sync. ` +
        `Only Web, Desktop, and Mobile are synced surfaces; CLI, VS Code, and Chrome ` +
        `keep separate workspace-scoped histories.`,
    );
  }
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

export function chatExecutionModeToPrivacyMode(mode: ChatExecutionMode): PrivacyMode {
  return CHAT_EXECUTION_MODE_DISPLAY[mode].privacyMode;
}

export function chatExecutionModeToProviderMode(mode: ChatExecutionMode): ProviderMode {
  return CHAT_EXECUTION_MODE_DISPLAY[mode].defaultProviderMode;
}

export function providerModeToChatExecutionMode(mode: ProviderMode): ChatExecutionMode {
  switch (mode) {
    case 'Local':
      return 'local_only';
    case 'DirectByok':
      return 'byok';
    case 'ManagedGateway':
    case 'ManagedNative':
      return 'cloud_managed';
  }
}

export function privacyModeToChatExecutionMode(mode: PrivacyMode): ChatExecutionMode {
  switch (mode) {
    case 'local':
      return 'local_only';
    case 'byok':
      return 'byok';
    case 'managed':
      return 'cloud_managed';
  }
}

export function getPrivacyModeDisplay(mode: PrivacyMode): TrustBoundaryDisplayCopy {
  return PRIVACY_MODE_DISPLAY[mode];
}

export function getProviderModeDisplay(mode: ProviderMode): ProviderModeDisplayCopy {
  return PROVIDER_MODE_DISPLAY[mode];
}

export function getChatExecutionModeDisplay(mode: ChatExecutionMode): ChatExecutionModeDisplayCopy {
  return CHAT_EXECUTION_MODE_DISPLAY[mode];
}

export function formatPrivacyModeLabel(mode: PrivacyMode): string {
  return getPrivacyModeDisplay(mode).label;
}

export function formatProviderModeLabel(mode: ProviderMode): string {
  return getProviderModeDisplay(mode).label;
}

export function formatChatExecutionModeLabel(mode: ChatExecutionMode): string {
  return getChatExecutionModeDisplay(mode).label;
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

export type ChatIntentKind =
  | 'chat'
  | 'code'
  | 'research'
  | 'artifact'
  | 'generated_file'
  | 'computer_use'
  | 'connector'
  | 'skill'
  | 'voice'
  | 'image'
  | 'handoff';

export type ChatReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'max';

export interface ChatIntent {
  id?: string;
  sourceSurface: SourceSurface;
  conversationId?: ConversationId | null;
  messageId?: MessageId | null;
  kind: ChatIntentKind;
  executionMode: ChatExecutionMode;
  privacyMode: PrivacyMode;
  providerMode: ProviderMode;
  provider?: Provider | string | null;
  model?: string | null;
  prompt?: string;
  projectId?: string | null;
  workspaceRoot?: string | null;
  skillIds?: string[];
  connectorIds?: string[];
  toolIds?: string[];
  attachmentIds?: string[];
  artifactIds?: string[];
  generatedFileIds?: string[];
  reasoningEffort?: ChatReasoningEffort;
  webSearch?: boolean;
  codeExecution?: boolean;
  computerUse?: boolean;
  temporary?: boolean;
  handoffRequired?: boolean;
  handoffDraftId?: string | null;
  createdAt?: string;
}

export type ConnectorConnectionStatus =
  | 'unsupported'
  | 'unavailable'
  | 'available'
  | 'needs_auth'
  | 'connected'
  | 'disabled'
  | 'failed';

export interface ConnectorStatusSnapshot {
  connectorId: string;
  sourceSurface: SourceSurface;
  status: ConnectorConnectionStatus;
  privacyMode?: PrivacyMode;
  providerMode?: ProviderMode;
  capabilityIds?: string[];
  message?: string;
  lastCheckedAt?: string;
}

export type PermissionDecision =
  | 'pending'
  | 'allow_once'
  | 'allow_session'
  | 'always_allow_workspace'
  | 'always_allow_site'
  | 'deny';

export type SuiteToolEventStatus =
  | 'queued'
  | 'approval_needed'
  | 'running'
  | 'progress'
  | 'result'
  | 'error'
  | 'cancelled';

export interface SuiteToolEvent {
  id: string;
  sourceSurface: SourceSurface;
  toolCallId: string;
  toolName: string;
  displayName?: string;
  status: SuiteToolEventStatus;
  privacyMode: PrivacyMode;
  providerMode: ProviderMode;
  connectorId?: string | null;
  permissionRequestId?: string | null;
  permissionDecision?: PermissionDecision;
  input?: Record<string, unknown>;
  output?: Record<string, unknown> | string;
  summary?: string;
  riskLevel?: RiskLevel;
  error?: string;
  createdAt: string;
  updatedAt?: string;
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
  sourceUri?: string | undefined;
  byteCount?: number | undefined;
  checksumSha256?: string | undefined;
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

export type ProjectAccentColor = 'emerald' | 'sky' | 'amber' | 'rose' | 'violet' | 'zinc';

export type ProjectImportSource = 'claude' | 'openai' | 'manual';

export interface ProjectRecord {
  id: string;
  /**
   * Owner user id. Stored as `user_id` in the Postgres `user_projects`
   * table for historical reasons (the column predates the round-10
   * schema). The data-layer maps both names; downstream code should
   * prefer `ownerUserId` because the SQL `user_id` is ambiguous
   * (project_members also has `user_id` for a different purpose).
   */
  ownerUserId: string;
  organizationId?: string | null;
  name: string;
  description?: string | null;
  defaultPrivacyMode: PrivacyMode;
  defaultProviderMode: ProviderMode;
  allowedSurfaces: SourceSurface[];
  /** Custom instructions / system prompt scoped to the project. */
  instructions?: string | null;
  /** Catalog model id from `packages/types/src/models.json`. Never invent. */
  defaultModelId?: string | null;
  /** Denormalized count for header rendering (avoids fan-out reads). */
  knowledgeFileCount?: number | null;
  /** Denormalized count for header rendering. */
  memberCount?: number | null;
  /** ISO-8601 timestamp of last activity, used for sort + "Last used" chip. */
  lastUsedAt?: string | null;
  /** Single emoji for visual identity. Capped at one grapheme by host. */
  iconEmoji?: string | null;
  /** Bounded accent palette. Host maps to its own color tokens. */
  accentColor?: ProjectAccentColor | null;
  /** Provenance for imported projects (Claude / OpenAI / manual). */
  importedFrom?: ProjectImportSource | null;
  /**
   * Whether the project is archived. Mirrors Postgres `is_archived`
   * column from the original 20260318 migration.
   */
  isArchived?: boolean;
  /**
   * Free-form jsonb metadata. Mirrors Postgres `metadata` column from
   * the original 20260318 migration. Reserved for app-specific
   * extensions that don't deserve a typed field yet.
   */
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export type ProjectMemberRole = 'owner' | 'editor' | 'viewer';

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectMemberRole;
  invitedByUserId?: string | null;
  addedAt: string;
}

export interface ProjectKnowledgeFile {
  id: string;
  projectId: string;
  fileName: string;
  mimeType: string;
  byteCount: number;
  checksumSha256: string;
  /** Optional short summary (for tooltips / search). */
  summary?: string | null;
  sourceSurface: SourceSurface;
  /**
   * Original uploader. Nullable because the FK uses `ON DELETE SET NULL`
   * (migration `20260521130000_fix_project_knowledge_files_fk.sql`) — when
   * the auth user is deleted, the file row survives with a tombstoned
   * audit trail. Hosts render "Uploaded by a deleted user" when null.
   */
  addedByUserId: string | null;
  addedAt: string;
  /** Retention timestamp if any (mirrors generated-file retention). */
  retentionExpiresAt?: string | null;
  deletedAt?: string | null;
  /**
   * Storage URI of the underlying binary in Supabase Storage. The
   * Postgres column is `storage_uri text NOT NULL`. Consumers should
   * not assume this is a public URL — most files require a signed-URL
   * fetch via the storage SDK.
   */
  storageUri: string;
}

export interface ProjectInstructions {
  /** Free-form system prompt prepended to chats inside the project. */
  systemPrompt?: string | null;
  /** Short rules-of-engagement (tone, format, etc.). */
  responseStyle?: string | null;
  /** Preferred response format ("markdown" / "json" / "plain"). */
  formatPreference?: string | null;
  /** Hard safety directives (will not be overridden by chat-scoped instructions). */
  safetyDirectives?: string | null;
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
  mimeType?: string | undefined;
  status: ComputeSessionStatus | 'unknown';
  statusLabel: string;
  isRunning: boolean;
  isComplete: boolean;
  isFailed: boolean;
  privacyMode?: PrivacyMode | undefined;
  privacyLabel?: string | undefined;
  privacyShortLabel?: string | undefined;
  providerMode?: ProviderMode | undefined;
  providerLabel?: string | undefined;
  sourceSurface?: SourceSurface | undefined;
  sourceSurfaceLabel?: string | undefined;
  sourceSessionId?: string | undefined;
  sourceSessionLabel?: string | undefined;
  computeSessionId?: string | undefined;
  generatedFileId?: string | undefined;
  artifactManifestId?: string | undefined;
  primaryUri?: string | undefined;
  previewUri?: string | undefined;
  byteCountLabel?: string | undefined;
  checksumShort?: string | undefined;
  retentionLabel?: string | undefined;
  storageScope?: StorageScope | undefined;
  canPreview: boolean;
  canDownload: boolean;
  canShare: boolean;
  localOnly: boolean;
}

export type GeneratedFileTrustBoundaryViolationCode =
  | 'compute-session-mismatch'
  | 'privacy-mode-mismatch'
  | 'provider-mode-mismatch'
  | 'local-file-uploaded'
  | 'local-storage-scope-mismatch'
  | 'byok-storage-scope-mismatch'
  | 'byok-transfer-preview-required'
  | 'byok-transfer-approval-required'
  | 'managed-storage-scope-mismatch'
  | 'managed-quota-reservation-required'
  | 'managed-owner-required'
  | 'managed-checksum-required'
  | 'managed-retention-required'
  | 'managed-deletion-metadata-required';

export interface GeneratedFileTransferEvidence {
  targetPrivacyMode: PrivacyMode;
  previewAccepted: boolean;
  approved: boolean;
  approvedAt?: string;
  previewHashSha256?: string;
}

export interface GeneratedFileManagedEvidence {
  quotaReservationId?: string | null;
}

export interface GeneratedFileTrustBoundaryInput {
  computeSession: ComputeSession;
  generatedFile: GeneratedFile;
  artifactManifest: ArtifactManifest;
  transfer?: GeneratedFileTransferEvidence;
  managed?: GeneratedFileManagedEvidence;
}

export interface GeneratedFileTrustBoundaryViolation {
  code: GeneratedFileTrustBoundaryViolationCode;
  message: string;
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

export function validateGeneratedFileTrustBoundary(
  input: GeneratedFileTrustBoundaryInput,
): GeneratedFileTrustBoundaryViolation[] {
  const { computeSession, generatedFile, artifactManifest } = input;
  const violations: GeneratedFileTrustBoundaryViolation[] = [];

  const addViolation = (code: GeneratedFileTrustBoundaryViolationCode, message: string) => {
    violations.push({ code, message });
  };

  if (
    generatedFile.computeSessionId !== computeSession.id ||
    artifactManifest.computeSessionId !== computeSession.id ||
    !artifactManifest.generatedFileIds.includes(generatedFile.id)
  ) {
    addViolation(
      'compute-session-mismatch',
      'Generated files, artifact manifests, and compute sessions must reference the same session.',
    );
  }

  const expectedPrivacyMode = providerModeToPrivacyMode(computeSession.providerMode);
  if (
    computeSession.privacyMode !== expectedPrivacyMode ||
    generatedFile.privacyMode !== expectedPrivacyMode ||
    artifactManifest.privacyMode !== expectedPrivacyMode
  ) {
    addViolation(
      'privacy-mode-mismatch',
      'Generated-file records must use the privacy mode implied by their provider mode.',
    );
  }

  if (
    generatedFile.providerMode !== computeSession.providerMode ||
    artifactManifest.providerMode !== computeSession.providerMode
  ) {
    addViolation(
      'provider-mode-mismatch',
      'Generated-file records must keep provider mode consistent across session, file, and manifest.',
    );
  }

  if (expectedPrivacyMode === 'local') {
    if (computeSession.providerMode !== 'Local' || !generatedFile.uri.startsWith('file://')) {
      addViolation(
        'local-file-uploaded',
        'Local generated files must stay on file:// storage and must not be uploaded to a provider or managed service.',
      );
    }
    if (artifactManifest.storageScope !== 'local_device') {
      addViolation(
        'local-storage-scope-mismatch',
        'Local generated files must use local_device storage scope.',
      );
    }
  }

  if (expectedPrivacyMode === 'byok') {
    if (artifactManifest.storageScope !== 'direct_byok_provider') {
      addViolation(
        'byok-storage-scope-mismatch',
        'BYOK generated files must use direct_byok_provider storage scope.',
      );
    }
    if (input.transfer?.targetPrivacyMode === 'byok') {
      if (!input.transfer.previewAccepted || !input.transfer.previewHashSha256) {
        addViolation(
          'byok-transfer-preview-required',
          'Transferring generated files into BYOK requires an accepted preview with hash evidence.',
        );
      }
      if (!input.transfer.approved || !input.transfer.approvedAt) {
        addViolation(
          'byok-transfer-approval-required',
          'Transferring generated files into BYOK requires explicit approval evidence.',
        );
      }
    }
  }

  if (expectedPrivacyMode === 'managed') {
    if (artifactManifest.storageScope !== 'managed_compute') {
      addViolation(
        'managed-storage-scope-mismatch',
        'Managed generated files must use managed_compute storage scope.',
      );
    }
    if (!input.managed?.quotaReservationId) {
      addViolation(
        'managed-quota-reservation-required',
        'Managed generated files require quota reservation evidence before the file is surfaced.',
      );
    }
    if (!computeSession.ownerUserId || !generatedFile.ownerUserId) {
      addViolation(
        'managed-owner-required',
        'Managed generated files require owner metadata on the compute session and generated file.',
      );
    }
    if (!generatedFile.checksumSha256 || !artifactManifest.checksumSha256) {
      addViolation(
        'managed-checksum-required',
        'Managed generated files require checksum metadata on the file and manifest.',
      );
    }
    if (!computeSession.ttlSeconds || !computeSession.retentionExpiresAt) {
      addViolation(
        'managed-retention-required',
        'Managed generated files require TTL and retention-expiry metadata.',
      );
    }
    if (computeSession.status === 'deleted' && !computeSession.deletedAt) {
      addViolation(
        'managed-deletion-metadata-required',
        'Deleted managed compute sessions require deletedAt metadata.',
      );
    }
  }

  return violations;
}

/**
 * Throw-variant of `validateGeneratedFileTrustBoundary`. Use at persistence
 * boundaries (anywhere a GeneratedFile record is written to durable
 * storage, replicated across surfaces, or transferred between trust
 * boundaries). Parallels `assertSurfaceCanSyncChats` — fail fast rather
 * than silently persist a record that violates the trust contract.
 *
 * The thrown Error includes every violation code so the call site can
 * choose to log, telemetry-emit, or rethrow as an http 422 / tauri
 * command error. Callers that want graceful degradation should call the
 * `validateGeneratedFileTrustBoundary` non-throw variant directly.
 *
 * Round-11 (2026-05-22) ultrathink slice — wires a defined-but-unused
 * defensive utility into a fail-fast boundary helper. Mirror of the
 * sync-rule guard pattern.
 */
export function assertGeneratedFileTrustBoundary(input: GeneratedFileTrustBoundaryInput): void {
  const violations = validateGeneratedFileTrustBoundary(input);
  if (violations.length === 0) return;
  const codes = violations.map((v) => v.code).join(', ');
  const messages = violations.map((v) => `- ${v.code}: ${v.message}`).join('\n');
  throw new Error(`AGI generated-file trust-boundary violation [${codes}]:\n${messages}`);
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

// ---------------------------------------------------------------------------
// SendPreview — "what will be sent" disclosure for cloud/BYOK turns
// ---------------------------------------------------------------------------
//
// Implements PLAN.md section 5 task: "Add visible 'what will be sent' previews
// for cloud/BYOK turns." Surfaces consume `SendPreviewPresentation` (built via
// `summarizeSendPreview`) to render a privacy-respecting disclosure of the
// outbound request shape before the user sends a message — model destination,
// privacy mode, attachment summary, system-prompt size, estimated context
// tokens. Local mode renders with a privacy-positive "stays on device" banner
// rather than the BYOK/Managed destination call-out. This is intentional —
// AGI's local-first stance treats Local turns as transparent by default.

export interface SendPreviewInput {
  providerMode: ProviderMode;
  modelLabel?: string | undefined;
  modelId?: string | undefined;
  messageBody?: string | undefined;
  attachmentCount?: number | undefined;
  attachmentSummaries?: ReadonlyArray<{ name: string; mimeType?: string }> | undefined;
  systemPromptLength?: number | undefined;
  estimatedInputTokens?: number | undefined;
  contextWindowTokens?: number | undefined;
  toolNames?: ReadonlyArray<string> | undefined;
  /** Destination host for BYOK/Managed turns (e.g., "api.anthropic.com"). */
  destinationHost?: string | undefined;
  /** Source session label inherited into this turn, if any. */
  sourceSessionLabel?: string | undefined;
}

export interface SendPreviewPresentation {
  providerMode: ProviderMode;
  privacyMode: PrivacyMode;
  privacyShortLabel: string;
  privacyLabel: string;
  /** True for `providerMode === 'Local'` — drives the privacy-positive banner. */
  staysLocal: boolean;
  destinationLabel: string;
  destinationHost?: string | undefined;
  modelLabel?: string | undefined;
  modelId?: string | undefined;
  bodyCharLabel?: string | undefined;
  attachmentLabel?: string | undefined;
  systemPromptLabel?: string | undefined;
  contextLabel?: string | undefined;
  toolsLabel?: string | undefined;
  sourceSessionLabel?: string | undefined;
  /** Long-form banner copy describing where the turn goes and what carries with it. */
  bannerCopy: string;
}

function compactNumber(value: number): string {
  if (value < 1000) return value.toString();
  if (value < 10_000) return `${(value / 1000).toFixed(1)}k`;
  if (value < 1_000_000) return `${Math.round(value / 1000)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

function joinDistinct(items: ReadonlyArray<string>): string | undefined {
  const unique: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (trimmed && !unique.includes(trimmed)) unique.push(trimmed);
  }
  if (unique.length === 0) return undefined;
  return unique.join(', ');
}

export function summarizeSendPreview(input: SendPreviewInput): SendPreviewPresentation {
  const providerMode = input.providerMode;
  const privacyMode = providerModeToPrivacyMode(providerMode);
  const privacyDisplay = getPrivacyModeDisplay(privacyMode);
  const providerDisplay = getProviderModeDisplay(providerMode);
  const staysLocal = providerMode === 'Local';

  let destinationLabel: string;
  if (staysLocal) {
    destinationLabel = 'Stays on this device';
  } else if (input.destinationHost) {
    destinationLabel = `Sent to ${input.destinationHost}`;
  } else if (providerMode === 'DirectByok') {
    destinationLabel = 'Sent to your BYOK provider';
  } else {
    destinationLabel = 'Sent through AGI Managed gateway';
  }

  const bodyChars = input.messageBody?.length ?? 0;
  const bodyCharLabel = bodyChars > 0 ? `${compactNumber(bodyChars)} chars` : undefined;

  const attachmentCount = input.attachmentCount ?? input.attachmentSummaries?.length ?? 0;
  let attachmentLabel: string | undefined;
  if (attachmentCount > 0) {
    const types =
      input.attachmentSummaries && input.attachmentSummaries.length > 0
        ? joinDistinct(
            input.attachmentSummaries.map((s) => (s.mimeType ?? '').split('/').pop() || 'file'),
          )
        : undefined;
    attachmentLabel = types
      ? `${attachmentCount} ${attachmentCount === 1 ? 'attachment' : 'attachments'} (${types})`
      : `${attachmentCount} ${attachmentCount === 1 ? 'attachment' : 'attachments'}`;
  }

  const systemPromptLabel =
    input.systemPromptLength && input.systemPromptLength > 0
      ? `${compactNumber(input.systemPromptLength)} char system prompt`
      : undefined;

  let contextLabel: string | undefined;
  if (input.estimatedInputTokens && input.estimatedInputTokens > 0) {
    contextLabel = input.contextWindowTokens
      ? `≈ ${compactNumber(input.estimatedInputTokens)} / ${compactNumber(input.contextWindowTokens)} tokens`
      : `≈ ${compactNumber(input.estimatedInputTokens)} tokens`;
  }

  const toolsLabel =
    input.toolNames && input.toolNames.length > 0 ? joinDistinct(input.toolNames) : undefined;

  const bannerCopy = staysLocal
    ? 'Local turn. The model runs on your device and nothing is uploaded to AGI cloud or third-party providers.'
    : providerMode === 'DirectByok'
      ? `BYOK turn. The request, attachments, and system prompt go directly to ${input.destinationHost ?? 'your configured provider'} via your API key. AGI does not receive a copy of the payload.`
      : `Managed turn. The request, attachments, and system prompt go through ${input.destinationHost ?? 'an AGI-managed gateway'} subject to the managed-mode retention and access controls.`;

  return {
    providerMode,
    privacyMode,
    privacyShortLabel: privacyDisplay.shortLabel,
    privacyLabel: privacyDisplay.label,
    staysLocal,
    destinationLabel,
    destinationHost: input.destinationHost,
    modelLabel: input.modelLabel ?? providerDisplay.label,
    modelId: input.modelId,
    bodyCharLabel,
    attachmentLabel,
    systemPromptLabel,
    contextLabel,
    toolsLabel,
    sourceSessionLabel: input.sourceSessionLabel,
    bannerCopy,
  };
}

// ============================================================================
// Project Header Presentation
// ============================================================================
//
// Pure derivation of header-level chips and labels from a ProjectRecord.
// Hosts (Web sidebar, Desktop project view, Mobile drawer) read the
// presentation to keep wording, accent palette, and surface-chip ordering
// identical across surfaces without sharing JSX.

const PROJECT_ACCENT_FALLBACK: ProjectAccentColor = 'zinc';

const PROJECT_IMPORT_SOURCE_LABELS: Record<ProjectImportSource, string> = {
  claude: 'Imported from Claude',
  openai: 'Imported from ChatGPT',
  manual: 'Created in AGI',
};

const PROJECT_MEMBER_ROLE_LABELS: Record<ProjectMemberRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

const SOURCE_SURFACE_CHIP_LABELS: Record<SourceSurface, string> = {
  web: 'Web',
  desktop: 'Desktop',
  mobile: 'Mobile',
  cli: 'CLI',
  vscode: 'VS Code',
  chrome: 'Chrome',
};

const SOURCE_SURFACE_CHIP_ORDER: SourceSurface[] = [
  'web',
  'desktop',
  'mobile',
  'cli',
  'vscode',
  'chrome',
];

export interface ProjectHeaderInput {
  project: ProjectRecord;
  /** Optional display label for the default model — host resolves from catalog. */
  defaultModelLabel?: string | null;
  /** Optional relative label like "2h ago" — host computes from `lastUsedAt`. */
  lastUsedRelativeLabel?: string | null;
}

export interface ProjectHeaderPresentation {
  id: string;
  title: string;
  description?: string | undefined;
  iconEmoji?: string | undefined;
  accentColor: ProjectAccentColor;
  privacyMode: PrivacyMode;
  privacyLabel: string;
  providerMode: ProviderMode;
  providerLabel: string;
  staysLocal: boolean;
  defaultModelId?: string | undefined;
  defaultModelLabel?: string | undefined;
  knowledgeFileCountLabel?: string | undefined;
  memberCountLabel?: string | undefined;
  lastUsedLabel?: string | undefined;
  importedFromLabel?: string | undefined;
  /**
   * Allowed-surface chips ordered by canonical surface order (web → desktop →
   * mobile → cli → vscode → chrome). Hosts render in this order so the chip
   * row is identical across surfaces.
   */
  surfaceChips: string[];
}

export function normalizeProjectAccentColor(
  value: ProjectAccentColor | string | null | undefined,
): ProjectAccentColor {
  if (
    value === 'emerald' ||
    value === 'sky' ||
    value === 'amber' ||
    value === 'rose' ||
    value === 'violet' ||
    value === 'zinc'
  ) {
    return value;
  }
  return PROJECT_ACCENT_FALLBACK;
}

export function summarizeProjectHeader(input: ProjectHeaderInput): ProjectHeaderPresentation {
  const project = input.project;
  const providerMode = project.defaultProviderMode;
  const privacyMode = project.defaultPrivacyMode;
  const providerDisplay = getProviderModeDisplay(providerMode);
  const privacyDisplay = getPrivacyModeDisplay(privacyMode);
  const staysLocal = privacyMode === 'local';

  const knowledgeFileCountLabel = knowledgeFileCountToLabel(project.knowledgeFileCount);
  const memberCountLabel = memberCountToLabel(project.memberCount);
  const lastUsedLabel = input.lastUsedRelativeLabel
    ? `Last used ${input.lastUsedRelativeLabel}`
    : undefined;
  const importedFromLabel = project.importedFrom
    ? PROJECT_IMPORT_SOURCE_LABELS[project.importedFrom]
    : undefined;

  const surfaceChips = SOURCE_SURFACE_CHIP_ORDER.filter((surface) =>
    project.allowedSurfaces.includes(surface),
  ).map((surface) => SOURCE_SURFACE_CHIP_LABELS[surface]);

  return {
    id: project.id,
    title: project.name,
    description: project.description ?? undefined,
    iconEmoji: project.iconEmoji ?? undefined,
    accentColor: normalizeProjectAccentColor(project.accentColor),
    privacyMode,
    privacyLabel: privacyDisplay.label,
    providerMode,
    providerLabel: providerDisplay.label,
    staysLocal,
    defaultModelId: project.defaultModelId ?? undefined,
    defaultModelLabel: input.defaultModelLabel ?? undefined,
    knowledgeFileCountLabel,
    memberCountLabel,
    lastUsedLabel,
    importedFromLabel,
    surfaceChips,
  };
}

export function projectMemberRoleLabel(role: ProjectMemberRole): string {
  return PROJECT_MEMBER_ROLE_LABELS[role];
}

function knowledgeFileCountToLabel(value: number | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value <= 0) return 'No knowledge files';
  if (value === 1) return '1 file';
  return `${compactNumber(value)} files`;
}

function memberCountToLabel(value: number | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (value <= 0) return 'No members';
  if (value === 1) return '1 member';
  return `${compactNumber(value)} members`;
}
