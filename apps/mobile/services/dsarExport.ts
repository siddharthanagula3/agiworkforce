/**
 * DSAR (Data Subject Access Request) export — PRD-APPENDIX-D §D.4.
 *
 * Implements the "device-side readable export" layer: collects all user data
 * from the local SQLCipher database and MMKV store, serialises to a structured
 * JSON payload, writes to a temp file, and invokes the system share sheet.
 *
 * Per §D.4 two-layer architecture:
 *   (a) Server-side export  — /api/user/export (server handles this layer)
 *   (b) Device-side export  — THIS service
 *
 * What is included:
 *   - Conversations + messages from SQLCipher
 *   - Memory facts from SQLCipher
 *   - Custom instructions from SQLCipher
 *   - Settings from SQLCipher (key-value pairs)
 *   - Installed models manifest (metadata only — not the model weights)
 *   - Compliance ledger (disclosure + consent records from MMKV)
 *   - Export metadata (timestamp, app version, schema version)
 *
 * What is NOT included:
 *   - Model weight files (upstream-distributed, not user data)
 *   - Provider API keys (keychain-only, never exposed in export)
 *   - Telemetry queue (operational metadata, not user content)
 *
 * EU AI Act Article 50(2): if @agiworkforce/compliance exports
 * `wrapTextExportWithMarker`, AI-generated message content is wrapped before
 * serialisation. The import is guarded so the export works even if the
 * compliance package does not yet implement this export.
 *
 * No network calls. Fully on-device.
 */

import {
  cacheDirectory,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  deleteAsync,
  writeAsStringAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import { listConversations } from '@/storage/conversations';
import { getMessagesForConversation } from '@/storage/messages';
import { listMemoryFacts } from '@/storage/memory';
import { listCustomInstructions } from '@/storage/customInstructions';
import { getAllSettings } from '@/storage/settingsDb';
import { listInstalledModels } from '@/storage/installedModels';
import { mmkvDisclosureLedger, mmkvConsentLedger } from '@/services/complianceLedger';
import type {
  Conversation,
  Message,
  MemoryFact,
  CustomInstruction,
  InstalledModel,
} from '@/storage/types';

// ---------------------------------------------------------------------------
// Article 50(2) marker — optional, guarded import
// ---------------------------------------------------------------------------

// Matches the actual signature from @agiworkforce/compliance
type WrapMarkerFn = (opts: {
  text: string;
  provider: string;
  model: string;
  generatedAt?: string;
  contentHashSha256?: string;
}) => string;

type ComplianceModule = {
  wrapTextExportWithMarker?: WrapMarkerFn;
  CHINESE_HQ_PROVIDER_IDS?: string[];
};

let _compliance: ComplianceModule = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  _compliance = require('@agiworkforce/compliance') as ComplianceModule;
} catch {
  // Package not yet available — degrade gracefully
}

/**
 * Render a conversation's messages as a plain-text transcript, then wrap the
 * whole transcript with the Article 50(2) marker per compliance-engineer guidance:
 * the marker must be on the AI-generated *content* string, not the JSON container.
 *
 * Uses the provider/model from the last assistant message in the conversation
 * (most representative for a mixed-provider thread).
 */
export function buildMarkedTranscript(
  messages: Array<{
    role: string;
    content: string;
    provider: string | null;
    model: string | null;
    created_at: string;
  }>,
): string {
  const lines = messages.map((m) => {
    const ts = m.created_at.slice(0, 16).replace('T', ' ');
    const label = m.role === 'assistant' ? 'AGI' : m.role === 'user' ? 'You' : m.role.toUpperCase();
    return `[${ts}] ${label}: ${m.content}`;
  });
  const transcript = lines.join('\n\n');

  if (typeof _compliance.wrapTextExportWithMarker !== 'function') return transcript;

  // Use provider/model from the last assistant turn (best representative for the thread)
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const provider = lastAssistant?.provider ?? 'unknown';
  const model = lastAssistant?.model ?? 'unknown';

  return _compliance.wrapTextExportWithMarker({ text: transcript, provider, model });
}

// ---------------------------------------------------------------------------
// Export schema types
// ---------------------------------------------------------------------------

const DSAR_SCHEMA_VERSION = 1;

export interface DsarMessage {
  id: string;
  role: string;
  content: string;
  mode: string;
  provider: string | null;
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  duration_ms: number | null;
  created_at: string; // ISO-8601
}

export interface DsarConversation {
  id: string;
  title: string;
  default_mode: string;
  default_provider: string | null;
  default_model: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  pinned: boolean;
  messages: DsarMessage[];
  /** Plain-text transcript with EU AI Act Article 50(2) provenance markers on AI turns */
  marked_transcript: string;
}

export interface DsarLocalProject {
  id: string;
  name: string;
  description: string;
  instructions: string;
  created_at: string;
  updated_at: string;
  sources: Array<{
    id: string;
    name: string;
    mime_type: string;
    size_bytes: number;
    added_at: string;
  }>;
}

export interface DsarMobileSettings {
  app_mode: 'local' | 'cloud';
  selected_model: string;
  selected_provider: string;
  theme_mode: string;
  accent_color: string;
  font_preference: string;
  haptics_enabled: boolean;
  notifications_enabled: boolean;
  voice_enabled: boolean;
  background_fetch_enabled: boolean;
  reduce_sensitive_content: boolean;
  temporary_chat_enabled: boolean;
  personalization: {
    full_name: string;
    nickname: string;
    occupation: string;
    instructions: string;
    style: string;
    warmth: number;
    enthusiasm: number;
    headers_lists: number;
    emoji: number;
  };
  capabilities: Record<string, boolean>;
  chat_preferences: {
    mode: string;
    style: string;
    tool_access: string;
    features: Record<string, boolean>;
  };
}

interface DsarMemoryFact {
  id: string;
  fact: string;
  source_conversation_id: string | null;
  pinned: boolean;
  created_at: string;
}

interface DsarInstalledModel {
  id: string;
  display_name: string;
  runtime: string;
  format: string;
  size_bytes: number | null;
  installed_at: string;
  last_used_at: string | null;
}

interface DsarComplianceLedger {
  disclosure: unknown;
  /** keyed by providerId */
  consents: Record<string, unknown>;
}

interface DsarExportPayload {
  _meta: {
    schema_version: number;
    exported_at: string;
    app_version: string | null;
    platform: 'ios' | 'android' | 'unknown';
    note: string;
  };
  conversations: DsarConversation[];
  memory_facts: DsarMemoryFact[];
  custom_instructions: Array<{
    id: string;
    name: string;
    content: string;
    active: boolean;
    created_at: string;
  }>;
  local_projects: DsarLocalProject[];
  settings: Record<string, string>;
  mobile_settings: DsarMobileSettings | null;
  local_artifacts: unknown[];
  installed_models_manifest: DsarInstalledModel[];
  compliance_ledger: DsarComplianceLedger;
}

export interface DsarSupplementalLocalData {
  conversations?: DsarConversation[];
  local_projects?: DsarLocalProject[];
  mobile_settings?: DsarMobileSettings | null;
  local_artifacts?: unknown[];
}

export interface WipeAllLocalDataOptions {
  afterPersistentWipe?: () => Promise<void> | void;
}

// ---------------------------------------------------------------------------
// Progress callback type
// ---------------------------------------------------------------------------

export interface DsarExportProgress {
  stage:
    | 'conversations'
    | 'memory'
    | 'instructions'
    | 'settings'
    | 'models'
    | 'compliance'
    | 'writing'
    | 'sharing';
  done: number;
  total: number;
}

export type DsarProgressCallback = (progress: DsarExportProgress) => void;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tsToIso(ms: number): string {
  return new Date(ms).toISOString();
}

function getPlatform(): 'ios' | 'android' | 'unknown' {
  const p = Constants.platform;
  if (!p) return 'unknown';
  if (p.ios) return 'ios';
  if (p.android) return 'android';
  return 'unknown';
}

function getAppVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

// ---------------------------------------------------------------------------
// Export stages
// ---------------------------------------------------------------------------

async function collectConversations(): Promise<DsarConversation[]> {
  const convs = await listConversations({ limit: 10_000 });
  const allArchived = await listConversations({ archived: true, limit: 10_000 });
  const all: Conversation[] = [...convs, ...allArchived];

  const result: DsarConversation[] = [];
  for (const conv of all) {
    const msgs = await getMessagesForConversation(conv.id, { limit: 10_000 });
    const dsarMessages: DsarMessage[] = msgs.map(
      (m: Message): DsarMessage => ({
        id: m.id,
        role: m.role,
        content: m.content,
        mode: m.mode,
        provider: m.provider,
        model: m.model,
        tokens_in: m.tokens_in,
        tokens_out: m.tokens_out,
        duration_ms: m.duration_ms,
        created_at: tsToIso(m.created_at),
      }),
    );

    // Article 50(2): wrap the whole conversation transcript (not per-message content)
    // so the marker survives the JSON container and is readable as a text artifact.
    const marked_transcript = buildMarkedTranscript(dsarMessages);

    result.push({
      id: conv.id,
      title: conv.title,
      default_mode: conv.default_mode,
      default_provider: conv.default_provider,
      default_model: conv.default_model,
      created_at: tsToIso(conv.created_at),
      updated_at: tsToIso(conv.updated_at),
      archived_at: conv.archived_at ? tsToIso(conv.archived_at) : null,
      pinned: conv.pinned,
      messages: dsarMessages,
      marked_transcript,
    });
  }

  return result;
}

async function collectMemoryFacts(): Promise<DsarMemoryFact[]> {
  const facts = await listMemoryFacts({ limit: 10_000 });
  return facts.map(
    (f: MemoryFact): DsarMemoryFact => ({
      id: f.id,
      fact: f.fact,
      source_conversation_id: f.source_conversation_id,
      pinned: f.pinned,
      created_at: tsToIso(f.created_at),
    }),
  );
}

async function collectInstalledModels(): Promise<DsarInstalledModel[]> {
  const models = await listInstalledModels();
  return models.map(
    (m: InstalledModel): DsarInstalledModel => ({
      id: m.id,
      display_name: m.display_name,
      runtime: m.runtime,
      format: m.format,
      size_bytes: m.size_bytes,
      installed_at: tsToIso(m.installed_at),
      last_used_at: m.last_used_at ? tsToIso(m.last_used_at) : null,
    }),
  );
}

function collectComplianceLedger(): DsarComplianceLedger {
  const disclosure = mmkvDisclosureLedger.read();

  // Enumerate consents for all Chinese-HQ providers via the canonical ID list.
  // ConsentLedger has no listAll — must enumerate by known provider IDs.
  const chineseHqIds: string[] = Array.isArray(_compliance.CHINESE_HQ_PROVIDER_IDS)
    ? _compliance.CHINESE_HQ_PROVIDER_IDS
    : [];

  const consents: Record<string, unknown> = {};
  for (const providerId of chineseHqIds) {
    const consent = mmkvConsentLedger.getNamedProviderConsent(providerId);
    consents[providerId] = consent ?? null;
  }

  return {
    disclosure: disclosure ?? null,
    consents,
  };
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

const EXPORT_DIR = `${cacheDirectory}dsar_exports/`;
const EXPORT_FILE = `${EXPORT_DIR}agi_data_export.json`;

function mergeSupplementalConversations(
  conversations: DsarConversation[],
  supplemental: DsarConversation[] | undefined,
): DsarConversation[] {
  if (!supplemental || supplemental.length === 0) return conversations;
  const seen = new Set(conversations.map((conversation) => conversation.id));
  const novel = supplemental.filter((conversation) => !seen.has(conversation.id));
  return [...conversations, ...novel];
}

export async function exportAllUserData(
  onProgress?: DsarProgressCallback,
  supplemental: DsarSupplementalLocalData = {},
): Promise<void> {
  const notify = (stage: DsarExportProgress['stage'], done: number, total: number) =>
    onProgress?.({ stage, done, total });

  // Conversations + messages (most time-consuming)
  notify('conversations', 0, 1);
  const conversations = mergeSupplementalConversations(
    await collectConversations(),
    supplemental.conversations,
  );
  notify('conversations', 1, 1);

  // Memory facts
  notify('memory', 0, 1);
  const memory_facts = await collectMemoryFacts();
  notify('memory', 1, 1);

  // Custom instructions
  notify('instructions', 0, 1);
  const custom_instructions = await listCustomInstructions(false);
  notify('instructions', 1, 1);

  // Settings
  notify('settings', 0, 1);
  const settings = await getAllSettings();
  const local_projects = supplemental.local_projects ?? [];
  const mobile_settings = supplemental.mobile_settings ?? null;
  const local_artifacts = supplemental.local_artifacts ?? [];
  notify('settings', 1, 1);

  // Installed models manifest
  notify('models', 0, 1);
  const installed_models_manifest = await collectInstalledModels();
  notify('models', 1, 1);

  // Compliance ledger
  notify('compliance', 0, 1);
  const compliance_ledger = collectComplianceLedger();
  notify('compliance', 1, 1);

  // Assemble payload
  const payload: DsarExportPayload = {
    _meta: {
      schema_version: DSAR_SCHEMA_VERSION,
      exported_at: new Date().toISOString(),
      app_version: getAppVersion(),
      platform: getPlatform(),
      note: 'Device-side AGI data export per GDPR Article 20 / DPDP Act 2023. AI-generated messages may include machine-readable EU AI Act Article 50(2) provenance markers.',
    },
    conversations,
    memory_facts,
    custom_instructions: custom_instructions.map((ci) => ({
      id: ci.id,
      name: ci.name,
      content: ci.content,
      active: ci.active,
      created_at: tsToIso(ci.created_at),
    })),
    local_projects,
    settings,
    mobile_settings,
    local_artifacts,
    installed_models_manifest,
    compliance_ledger,
  };

  // Write to temp file
  notify('writing', 0, 1);
  const info = await getInfoAsync(EXPORT_DIR);
  if (!info.exists) {
    await makeDirectoryAsync(EXPORT_DIR, { intermediates: true });
  }
  await writeAsStringAsync(EXPORT_FILE, JSON.stringify(payload, null, 2), {
    encoding: EncodingType.UTF8,
  });
  notify('writing', 1, 1);

  // Share via native share sheet
  notify('sharing', 0, 1);
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(EXPORT_FILE, {
    mimeType: 'application/json',
    dialogTitle: 'Save your AGI data export',
    UTI: 'public.json',
  });
  notify('sharing', 1, 1);

  // Clean up temp file after sharing dialog is dismissed
  await deleteAsync(EXPORT_FILE, { idempotent: true });
}

// ---------------------------------------------------------------------------
// Wipe all local user data (Settings → Privacy → Delete everything)
// ---------------------------------------------------------------------------

export async function wipeAllLocalData(options: WipeAllLocalDataOptions = {}): Promise<void> {
  const { closeDb, getDb } = await import('@/storage/db');

  const db = await getDb();

  // Delete all user data in one transaction (CASCADE handles messages, doc_chunks)
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM telemetry_queue;');
    await db.execAsync('DELETE FROM memory_facts;');
    await db.execAsync('DELETE FROM custom_instructions;');
    await db.execAsync('DELETE FROM installed_models;');
    try {
      await db.execAsync('DELETE FROM provider_keys;');
    } catch {
      // Older private builds had this table. Current Mobile builds do not create it.
    }
    await db.execAsync('DELETE FROM settings;');
    await db.execAsync('DELETE FROM conversations;'); // cascades to messages + doc_chunks
    try {
      await db.execAsync('DELETE FROM memory_vectors;');
    } catch {
      // sqlite-vec table may not exist
    }
  });

  await closeDb();

  // Wipe MMKV
  const { storage } = await import('@/lib/mmkv');
  storage.clearAll();

  await options.afterPersistentWipe?.();

  // Delete downloaded model files
  await deleteAsync(`${documentDirectory}models/`, { idempotent: true });

  // Delete any cached DSAR exports
  await deleteAsync(EXPORT_DIR, { idempotent: true });

  // Delete user-initiated chat exports (PDF/TXT/MD) — "Delete everything" must
  // not leave exported conversation content on disk.
  const { EXPORTS_DIR } = await import('@/services/fileCreation');
  await deleteAsync(EXPORTS_DIR, { idempotent: true });
}
