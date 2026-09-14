export const LOCAL_INFERENCE_COMMANDS = [
  'local_model_servers',
  'local_model_list',
  'local_chat_start',
  'local_chat_cancel',
  'local_model_settings_read',
  'local_model_settings_write',
] as const;

export type LocalInferenceCommand = (typeof LOCAL_INFERENCE_COMMANDS)[number];

export const LOCAL_MODEL_SERVERS = ['ollama', 'lmstudio'] as const;

export type LocalModelServerId = (typeof LOCAL_MODEL_SERVERS)[number];

export const LOCAL_MODEL_SERVER_LABELS: Record<LocalModelServerId, string> = {
  ollama: 'Ollama',
  lmstudio: 'LM Studio',
};

export function isLocalModelServerId(value: string): value is LocalModelServerId {
  return (LOCAL_MODEL_SERVERS as readonly string[]).includes(value);
}

export const LOCAL_CHAT_TIMEOUT_DEFAULT_MS = 300_000;
export const LOCAL_CHAT_TIMEOUT_MAX_MS = 1_800_000;

/**
 * The prefix that separates a model running on this machine from every model
 * the managed catalogue publishes.
 *
 * A local model is discovered from whatever the user has pulled, so it can
 * never be a catalogue entry. The prefix is what lets the send path decide the
 * trust boundary from the id alone, before any request is built.
 */
export const LOCAL_MODEL_ID_PREFIX = 'local:';

export function localModelId(serverId: LocalModelServerId, name: string): string {
  return `${LOCAL_MODEL_ID_PREFIX}${serverId}/${name}`;
}

export interface LocalModelRef {
  serverId: LocalModelServerId;
  name: string;
}

export function parseLocalModelId(id: string): LocalModelRef | null {
  if (!id.startsWith(LOCAL_MODEL_ID_PREFIX)) return null;
  const body = id.slice(LOCAL_MODEL_ID_PREFIX.length);
  const separator = body.indexOf('/');
  if (separator <= 0) return null;
  const serverId = body.slice(0, separator);
  const name = body.slice(separator + 1);
  if (!isLocalModelServerId(serverId) || name === '') return null;
  return { serverId, name };
}

export function isLocalModelId(id: string): boolean {
  return parseLocalModelId(id) !== null;
}

export interface LocalModel {
  id: string;
  serverId: LocalModelServerId;
  serverLabel: string;
  name: string;
  sizeBillion?: number;
}

export interface LocalModelServerStatus {
  id: LocalModelServerId;
  label: string;
  baseUrl: string;
  reachable: boolean;
  modelCount: number;
  message?: string;
}

export interface LocalModelSnapshot {
  granted: boolean;
  servers: LocalModelServerStatus[];
}

export interface LocalModelSettings {
  baseUrls: Record<LocalModelServerId, string>;
}

export interface LocalChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LocalChatRequest {
  runId: string;
  modelId: string;
  messages: LocalChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export type LocalChatStopReason = 'end_turn' | 'max_tokens' | 'cancelled' | 'timeout' | 'error';

export interface LocalChatResult {
  runId: string;
  modelId: string;
  serverId: LocalModelServerId;
  text: string;
  thinking: string;
  stopReason: LocalChatStopReason;
  durationMs: number;
  message?: string;
}

export class LocalInferenceRefused extends Error {
  readonly reason:
    | 'unknown-model'
    | 'not-loopback'
    | 'invalid-base-url'
    | 'no-messages'
    | 'attachments'
    | 'model-too-small';
  constructor(reason: LocalInferenceRefused['reason'], message: string) {
    super(message);
    this.name = 'LocalInferenceRefused';
    this.reason = reason;
  }
}

export const LOCAL_MODEL_MIN_SIZE_BILLION = 1;

export const LOCAL_ATTACHMENT_REFUSAL =
  'Local models on this device cannot read attachments. Switch to a cloud model or remove the attachment.';

export function formatLocalModelSize(sizeBillion: number): string {
  return `${Number(sizeBillion.toFixed(sizeBillion < 10 ? 1 : 0))}B`;
}

export function isLocalModelBelowMinimum(model: Pick<LocalModel, 'sizeBillion'>): boolean {
  return model.sizeBillion !== undefined && model.sizeBillion < LOCAL_MODEL_MIN_SIZE_BILLION;
}

export function localModelBelowMinimumReason(model: Pick<LocalModel, 'name'>): string {
  return `${model.name} is under ${LOCAL_MODEL_MIN_SIZE_BILLION}B parameters and is hidden; pull a larger model`;
}

export interface LocalModelPartition {
  usable: LocalModel[];
  hidden: LocalModel[];
}

export function partitionLocalModels(models: readonly LocalModel[]): LocalModelPartition {
  const usable: LocalModel[] = [];
  const hidden: LocalModel[] = [];
  for (const model of models) {
    if (isLocalModelBelowMinimum(model)) hidden.push(model);
    else usable.push(model);
  }
  return { usable, hidden };
}

export function assertLocalModelMeetsMinimum(
  model: Pick<LocalModel, 'name' | 'sizeBillion'>,
): void {
  if (!isLocalModelBelowMinimum(model)) return;
  throw new LocalInferenceRefused('model-too-small', localModelBelowMinimumReason(model));
}

const LOCAL_MESSAGE_FIELDS: readonly string[] = ['role', 'content'];

const EMBEDDED_ATTACHMENT_BYTES = /data:[\w.+-]+\/[\w.+-]+;base64,/i;

export function assertLocalTurnCarriesNoAttachments(messages: readonly unknown[]): void {
  for (const message of messages) {
    if (typeof message !== 'object' || message === null || Array.isArray(message)) {
      throw new LocalInferenceRefused('attachments', LOCAL_ATTACHMENT_REFUSAL);
    }
    const record = message as Record<string, unknown>;
    if (Object.keys(record).some((key) => !LOCAL_MESSAGE_FIELDS.includes(key))) {
      throw new LocalInferenceRefused('attachments', LOCAL_ATTACHMENT_REFUSAL);
    }
    const content = record['content'];
    if (typeof content !== 'string' || EMBEDDED_ATTACHMENT_BYTES.test(content)) {
      throw new LocalInferenceRefused('attachments', LOCAL_ATTACHMENT_REFUSAL);
    }
  }
}

const LOOPBACK_HOSTNAMES: readonly string[] = ['localhost', '127.0.0.1', '::1'];

/**
 * Whether a base URL still means "this machine".
 *
 * The Local boundary is a claim about where the bytes go, not a label the user
 * chose. A base URL pointing at another host would keep the Local badge while
 * sending the conversation over the network, so a non-loopback URL is refused
 * rather than accepted with a warning.
 */
export function isLoopbackBaseUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const hostname = parsed.hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  return LOOPBACK_HOSTNAMES.includes(hostname);
}

export function normalizeLocalBaseUrl(value: string, fallback: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (trimmed === '') return fallback;
  if (!isLoopbackBaseUrl(trimmed)) {
    throw new LocalInferenceRefused(
      'not-loopback',
      `${trimmed} is not on this machine, so a chat sent there would leave it. Use a localhost address.`,
    );
  }
  return trimmed;
}

export function normalizeLocalModelSettings(
  value: Partial<LocalModelSettings> | undefined,
  defaults: Record<LocalModelServerId, string>,
): LocalModelSettings {
  const baseUrls = {} as Record<LocalModelServerId, string>;
  for (const serverId of LOCAL_MODEL_SERVERS) {
    const candidate = value?.baseUrls?.[serverId];
    baseUrls[serverId] =
      typeof candidate === 'string' && isLoopbackBaseUrl(candidate.trim().replace(/\/+$/, ''))
        ? candidate.trim().replace(/\/+$/, '')
        : defaults[serverId];
  }
  return { baseUrls };
}
