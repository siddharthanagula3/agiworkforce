import type { ModelInfo } from '@agiworkforce/types';

import { ollamaModelSizeBillion, parseOllamaParameterCount } from './model-size';
import type { OllamaShowResponse, OllamaTagsResponse } from './types';

export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';

async function showModelSizeBillion(
  baseUrl: string,
  fetchFn: typeof fetch,
  model: string,
  signal: AbortSignal | undefined,
): Promise<number | undefined> {
  try {
    const res = await fetchFn(`${baseUrl}/api/show`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model }),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as OllamaShowResponse;
    return (
      ollamaModelSizeBillion({
        parameterSize: json.details?.parameter_size,
        modelInfo: json.model_info,
      }) ?? parseOllamaParameterCount(json.model_info?.['parameter_count'])
    );
  } catch {
    return undefined;
  }
}

export async function fetchOllamaCatalog(params: {
  baseUrl?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}): Promise<ModelInfo[]> {
  const baseUrl = params.baseUrl?.replace(/\/{1,32}$/, '') ?? OLLAMA_DEFAULT_BASE_URL;
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
  return Promise.all(
    json.models.map(async (m) => {
      const sizeBillion =
        ollamaModelSizeBillion({ parameterSize: m.details?.parameter_size }) ??
        (await showModelSizeBillion(baseUrl, fetchFn, m.model, params.signal));
      return {
        id: m.model,
        name: m.name,
        provider: 'ollama' as const,
        ...(sizeBillion !== undefined ? { sizeBillion } : {}),
      } satisfies ModelInfo;
    }),
  );
}
