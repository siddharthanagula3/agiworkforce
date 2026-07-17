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

export async function fetchOllamaCatalog(params: {
  baseUrl?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}): Promise<ModelInfo[]> {
  // AUDIT-FIX: alert-398 — bound trailing-slash stripping to avoid polynomial-redos.
  const baseUrl = params.baseUrl?.replace(/\/{1,32}$/, '') ?? DEFAULT_BASE_URL;
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
    const parameterSizeBillion = parseParameterSizeBillion(m.details.parameter_size);
    return {
      id: m.model,
      name: m.name,
      provider: 'ollama' as const,
      ...(parameterSizeBillion !== undefined ? { sizeBillion: parameterSizeBillion } : {}),
    } satisfies ModelInfo;
  });
}
