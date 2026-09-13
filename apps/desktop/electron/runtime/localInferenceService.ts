import {
  LOCAL_CHAT_TIMEOUT_DEFAULT_MS,
  LOCAL_CHAT_TIMEOUT_MAX_MS,
  LOCAL_MODEL_SERVERS,
  LOCAL_MODEL_SERVER_LABELS,
  LocalInferenceRefused,
  localModelId,
  parseLocalModelId,
  type LocalChatRequest,
  type LocalChatResult,
  type LocalChatStopReason,
  type LocalModel,
  type LocalModelServerId,
  type LocalModelServerStatus,
} from '@agiworkforce/local-runtime-contract';
import type { ChatRequest, ModelInfo, ProviderAdapter } from '@agiworkforce/types';
import { createOllamaAdapter, fetchOllamaCatalog } from '@agiworkforce/providers-ollama';
import { createLMStudioAdapter } from '@agiworkforce/providers-lmstudio';
import { readLocalBaseUrl, readLocalModelSettings } from './localModelSettingsStore';

const PROBE_TIMEOUT_MS = 1_500;

export interface LocalChatDelta {
  runId: string;
  channel: 'text' | 'thinking';
  delta: string;
}

function adapterFor(serverId: LocalModelServerId, baseUrl: string): ProviderAdapter {
  return serverId === 'ollama'
    ? createOllamaAdapter({ baseUrl })
    : createLMStudioAdapter({ baseUrl });
}

async function catalogFor(serverId: LocalModelServerId, baseUrl: string): Promise<ModelInfo[]> {
  if (serverId === 'ollama') return fetchOllamaCatalog({ baseUrl });
  return adapterFor(serverId, baseUrl).catalog();
}

/**
 * Whether something is listening at all.
 *
 * The adapters answer an unreachable server and a running server with nothing
 * loaded the same way, with an empty list, and those two states need different
 * words in the settings panel. Any HTTP reply, a 404 included, proves a server
 * is there.
 */
async function isListening(baseUrl: string): Promise<boolean> {
  try {
    await fetch(baseUrl, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return true;
  } catch {
    return false;
  }
}

export async function listLocalServers(): Promise<LocalModelServerStatus[]> {
  const { baseUrls } = readLocalModelSettings();
  return Promise.all(
    LOCAL_MODEL_SERVERS.map(async (serverId): Promise<LocalModelServerStatus> => {
      const baseUrl = baseUrls[serverId];
      const models = await catalogFor(serverId, baseUrl).catch(() => []);
      const reachable = models.length > 0 ? true : await isListening(baseUrl);
      return {
        id: serverId,
        label: LOCAL_MODEL_SERVER_LABELS[serverId],
        baseUrl,
        reachable,
        modelCount: models.length,
        ...(reachable && models.length === 0
          ? { message: `${LOCAL_MODEL_SERVER_LABELS[serverId]} is running with no models loaded.` }
          : {}),
      };
    }),
  );
}

export async function listLocalModels(): Promise<LocalModel[]> {
  const { baseUrls } = readLocalModelSettings();
  const perServer = await Promise.all(
    LOCAL_MODEL_SERVERS.map(async (serverId) => {
      const models = await catalogFor(serverId, baseUrls[serverId]).catch(() => []);
      return models.map(
        (model): LocalModel => ({
          id: localModelId(serverId, model.id),
          serverId,
          serverLabel: LOCAL_MODEL_SERVER_LABELS[serverId],
          name: model.name ?? model.id,
          ...(model.sizeBillion !== undefined ? { sizeBillion: model.sizeBillion } : {}),
        }),
      );
    }),
  );
  return perServer.flat();
}

const runs = new Map<string, AbortController>();

export function cancelLocalChat(runId: string): boolean {
  const controller = runs.get(runId);
  if (!controller) return false;
  controller.abort();
  runs.delete(runId);
  return true;
}

function boundedTimeout(requested: number | undefined): number {
  if (requested === undefined) return LOCAL_CHAT_TIMEOUT_DEFAULT_MS;
  return Math.min(Math.max(requested, 1_000), LOCAL_CHAT_TIMEOUT_MAX_MS);
}

export async function runLocalChat(
  input: LocalChatRequest,
  emit: (delta: LocalChatDelta) => void,
): Promise<LocalChatResult> {
  const ref = parseLocalModelId(input.modelId);
  if (!ref) {
    throw new LocalInferenceRefused(
      'unknown-model',
      'That model is not one of the models found on this machine.',
    );
  }
  if (input.messages.length === 0) {
    throw new LocalInferenceRefused('no-messages', 'A local turn needs at least one message.');
  }

  const baseUrl = readLocalBaseUrl(ref.serverId);
  const adapter = adapterFor(ref.serverId, baseUrl);
  const request: ChatRequest = {
    model: ref.name,
    messages: input.messages.map((message) => ({ role: message.role, content: message.content })),
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.maxOutputTokens !== undefined ? { maxOutputTokens: input.maxOutputTokens } : {}),
  };

  const controller = new AbortController();
  runs.set(input.runId, controller);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, boundedTimeout(input.timeoutMs));

  const startedAtMs = Date.now();
  let text = '';
  let thinking = '';
  let stopReason: LocalChatStopReason = 'end_turn';
  let message: string | undefined;

  try {
    for await (const chunk of adapter.stream(request, controller.signal)) {
      if (chunk.type === 'text-delta') {
        text += chunk.delta;
        emit({ runId: input.runId, channel: 'text', delta: chunk.delta });
      } else if (chunk.type === 'thinking-delta') {
        thinking += chunk.delta;
        emit({ runId: input.runId, channel: 'thinking', delta: chunk.delta });
      } else if (chunk.type === 'error') {
        stopReason = 'error';
        message = chunk.message;
      } else if (chunk.type === 'stop' && stopReason !== 'error') {
        stopReason = chunk.reason === 'max_tokens' ? 'max_tokens' : 'end_turn';
      }
    }
  } catch (error) {
    stopReason = 'error';
    message = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timer);
    runs.delete(input.runId);
  }

  if (controller.signal.aborted) {
    stopReason = timedOut ? 'timeout' : 'cancelled';
    message = timedOut
      ? `${LOCAL_MODEL_SERVER_LABELS[ref.serverId]} did not finish in time.`
      : undefined;
  }

  return {
    runId: input.runId,
    modelId: input.modelId,
    serverId: ref.serverId,
    text,
    thinking,
    stopReason,
    durationMs: Date.now() - startedAtMs,
    ...(message ? { message } : {}),
  };
}
