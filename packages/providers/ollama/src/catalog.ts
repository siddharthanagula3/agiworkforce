/**
 * Ollama catalog discovery via `/api/tags`.
 *
 * Ollama doesn't ship a static model catalog — local model availability is
 * dynamic per host. We hit the running daemon's `/api/tags` endpoint and
 * surface what's installed. If the daemon isn't reachable, we surface an
 * empty list rather than throw, so the UI can still render a "configure
 * Ollama" state.
 */

import type { ModelInfo } from '@agiworkforce/types';

import type { OllamaTagsResponse } from './types';

const DEFAULT_BASE_URL = 'http://localhost:11434';

function parseParameterSizeBillion(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const match = /^(\d+(?:\.\d+)?)b$/i.exec(text.trim());
  if (!match || !match[1]) return undefined;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : undefined;
}

function estimateContextWindow(family: string | undefined): number {
  // Ollama doesn't expose per-model context limits via /api/tags. Defaults
  // come from typical published context windows; users can override via
  // `OLLAMA_CONTEXT_LENGTH` env or `options.num_ctx` on the request.
  if (!family) return 8192;
  const f = family.toLowerCase();
  if (f.includes('llama3.3') || f.includes('llama-3.3')) return 128_000;
  if (f.includes('llama3.2') || f.includes('llama-3.2')) return 128_000;
  if (f.includes('llama3.1') || f.includes('llama-3.1')) return 128_000;
  if (f.includes('llama3') || f.includes('llama-3')) return 8192;
  if (f.includes('llama2') || f.includes('llama-2')) return 4096;
  if (f.includes('qwen2.5') || f.includes('qwen-2.5')) return 32_768;
  if (f.includes('qwen3') || f.includes('qwen-3')) return 32_768;
  if (f.includes('qwen')) return 32_768;
  if (f.includes('mistral')) return 32_768;
  if (f.includes('mixtral')) return 32_768;
  if (f.includes('phi')) return 4096;
  if (f.includes('gemma')) return 8192;
  if (f.includes('deepseek')) return 16_384;
  return 8192;
}

export async function fetchOllamaCatalog(params: {
  baseUrl?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}): Promise<ModelInfo[]> {
  const baseUrl = params.baseUrl?.replace(/\/+$/, '') ?? DEFAULT_BASE_URL;
  const fetchFn = params.fetch ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(`${baseUrl}/api/tags`, {
      method: 'GET',
      ...(params.signal ? { signal: params.signal } : {}),
    });
  } catch {
    return [];
  }
  if (!res.ok) {
    return [];
  }
  const json = (await res.json()) as OllamaTagsResponse;
  if (!Array.isArray(json.models)) {
    return [];
  }
  return json.models.map((m) => {
    const family = m.details.family ?? m.details.families?.[0];
    const parameterSizeBillion = parseParameterSizeBillion(m.details.parameter_size);
    return {
      id: m.model,
      name: m.name,
      provider: 'ollama' as const,
      contextWindow: estimateContextWindow(family),
      capabilities: { streaming: true, tools: true, vision: false, json: true },
      ...(parameterSizeBillion !== undefined ? { sizeBillion: parameterSizeBillion } : {}),
    } satisfies ModelInfo;
  });
}
