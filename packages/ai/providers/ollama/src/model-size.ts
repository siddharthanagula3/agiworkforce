export const OLLAMA_PARAMETER_COUNT_KEY = 'general.parameter_count';

const UNIT_BILLIONS: Record<string, number> = {
  k: 1e-6,
  m: 1e-3,
  b: 1,
  t: 1e3,
};

const PARAMETER_SIZE = /^(\d+(?:\.\d+)?)\s*([kmbt])$/i;

export function parseOllamaParameterSize(value: string | null | undefined): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = PARAMETER_SIZE.exec(value.trim());
  if (!match?.[1] || !match[2]) return undefined;
  const amount = Number(match[1]);
  const multiplier = UNIT_BILLIONS[match[2].toLowerCase()];
  if (!Number.isFinite(amount) || amount <= 0 || multiplier === undefined) return undefined;
  return amount * multiplier;
}

export function parseOllamaParameterCount(value: unknown): number | undefined {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return undefined;
  return amount / 1e9;
}

export function ollamaModelSizeBillion(input: {
  parameterSize?: string | null | undefined;
  modelInfo?: Record<string, unknown> | null | undefined;
}): number | undefined {
  return (
    parseOllamaParameterSize(input.parameterSize) ??
    parseOllamaParameterCount(input.modelInfo?.[OLLAMA_PARAMETER_COUNT_KEY])
  );
}
