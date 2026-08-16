
import { getProviderModelCatalog, type ModelInfo } from '@agiworkforce/types';

export const GOOGLE_MODEL_CATALOG: readonly ModelInfo[] = getProviderModelCatalog('google');

interface ListModelsResponse {
  models?: Array<{
    name?: string;
    displayName?: string;
    inputTokenLimit?: number;
    outputTokenLimit?: number;
    supportedGenerationMethods?: string[];
  }>;
}

export async function fetchGoogleCatalog(params: {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
}): Promise<ModelInfo[]> {
  const baseUrl = (params.baseUrl ?? 'https://generativelanguage.googleapis.com').replace(
    /\/{1,32}$/,
    '',
  );
  const fetchFn = params.fetch ?? fetch;
  let res: Response;
  try {
    const url = `${baseUrl}/v1beta/models`;
    res = await fetchFn(url, {
      method: 'GET',
      headers: { 'x-goog-api-key': params.apiKey },
      ...(params.signal ? { signal: params.signal } : {}),
    });
  } catch {
    return [...GOOGLE_MODEL_CATALOG];
  }
  if (!res.ok) {
    return [...GOOGLE_MODEL_CATALOG];
  }
  const json = (await res.json()) as ListModelsResponse;
  const known = new Set(GOOGLE_MODEL_CATALOG.map((m) => m.id));
  const out: ModelInfo[] = [...GOOGLE_MODEL_CATALOG];
  for (const m of json.models ?? []) {
    if (!m.name) continue;
    const id = m.name.replace(/^models\//, '');
    if (!id.startsWith('gemini-')) continue;
    if (known.has(id)) continue;
    if (m.supportedGenerationMethods && !m.supportedGenerationMethods.includes('generateContent')) {
      continue;
    }
    out.push({
      id,
      ...(m.displayName ? { name: m.displayName } : {}),
      provider: 'google',
      ...(m.inputTokenLimit !== undefined ? { contextWindow: m.inputTokenLimit } : {}),
      ...(m.outputTokenLimit !== undefined ? { maxOutputTokens: m.outputTokenLimit } : {}),
    });
  }
  return out;
}
