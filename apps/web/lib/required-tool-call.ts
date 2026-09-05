import { getModelMetadataById } from '@agiworkforce/types';

export type ForcedFunctionToolChoice = { type: 'function'; function: { name: string } };

export function forcedFunctionToolChoice(name: string): ForcedFunctionToolChoice {
  return { type: 'function', function: { name } };
}

/**
 * A provider that documents forced tool choice as unsupported errors on one
 * rather than ignoring it, so the caller has to fall back to a prompt line.
 */
export function modelAcceptsForcedToolChoice(model: string | undefined): boolean {
  if (!model) return true;
  return getModelMetadataById(model)?.providerCompatibility?.forcedToolChoice !== false;
}

/**
 * Is this the forced choice for `name`? Only a choice the request pipeline
 * installed is released to `auto` after its step; a choice the caller sent
 * stands for the whole turn.
 */
export function isForcedToolChoiceFor(choice: unknown, name: string): boolean {
  if (!choice || typeof choice !== 'object' || Array.isArray(choice)) return false;
  const record = choice as Record<string, unknown>;
  if (record['type'] !== 'function') return false;
  const fn = record['function'];
  if (!fn || typeof fn !== 'object') return false;
  return (fn as Record<string, unknown>)['name'] === name;
}

export function hasGenericFunctionTool(
  tools: readonly unknown[] | undefined,
  name: string,
): boolean {
  for (const tool of tools ?? []) {
    if (!tool || typeof tool !== 'object') continue;
    const record = tool as Record<string, unknown>;
    if (record['type'] !== 'function') continue;
    const fn = record['function'];
    if (!fn || typeof fn !== 'object') continue;
    if ((fn as Record<string, unknown>)['name'] === name) return true;
  }
  return false;
}
