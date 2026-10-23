import 'server-only';

const ENABLED_SPELLINGS: readonly string[] = ['1', 'true', 'yes', 'on'];

export function artifactAiEnabled(): boolean {
  const raw = process.env['AGI_ARTIFACT_AI_ENABLED']?.trim().toLowerCase();
  return raw !== undefined && ENABLED_SPELLINGS.includes(raw);
}
