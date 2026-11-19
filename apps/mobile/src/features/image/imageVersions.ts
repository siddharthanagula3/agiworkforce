export interface ImageVersion {
  imageUrl: string;
  prompt?: string;
  aspect?: string;
  model?: string;
}

const IMAGE_URL_LIMIT = 2_048;
const PROMPT_LIMIT = 4_000;
const FIELD_LIMIT = 200;
const VERSION_LIMIT = 50;

function boundedString(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text && text.length <= limit ? text : undefined;
}

export function imageVersionsFromMetadata(
  metadata: Record<string, unknown> | undefined,
): ImageVersion[] {
  const raw = metadata?.['imageVersions'];
  if (!Array.isArray(raw)) return [];
  const versions: ImageVersion[] = [];
  for (const entry of raw.slice(-VERSION_LIMIT)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const imageUrl = boundedString(record['imageUrl'], IMAGE_URL_LIMIT);
    if (!imageUrl) continue;
    const prompt = boundedString(record['prompt'], PROMPT_LIMIT);
    const aspect = boundedString(record['aspect'], FIELD_LIMIT);
    const model = boundedString(record['model'], FIELD_LIMIT);
    versions.push({
      imageUrl,
      ...(prompt ? { prompt } : {}),
      ...(aspect ? { aspect } : {}),
      ...(model ? { model } : {}),
    });
  }
  return versions;
}

export function imageVersionLabel(position: number, total: number): string {
  return `${position} of ${total}`;
}
