import {
  PROMPT_MANIFEST,
  isPromptId,
  type PromptEntry,
  type PromptId,
  type PromptKind,
} from './prompt-manifest';

/**
 * The one module that turns a prompt id into text.
 *
 * Nothing else reads `PROMPT_MANIFEST` directly, so the version a turn actually
 * used is decided in one place and can be stamped from the same value that was
 * sent. `resolvePrompt` never throws on an unknown variant: an A/B arm pointing
 * at a version that has been withdrawn falls back to the pinned one, because a
 * stale flag must not take a surface down.
 */

export interface ResolvedPrompt {
  readonly id: PromptId;
  readonly kind: PromptKind;
  readonly version: number;
  readonly text: string;
  /** `id@version`, the value written to the cost ledger and the routing trace. */
  readonly stamp: string;
  readonly selectedBy: 'pinned' | 'variant';
}

export interface ResolvePromptOptions {
  /** Prompt-manifest variants for this subject, keyed by prompt id. */
  readonly variants?: Readonly<Record<string, number>>;
}

function entry(id: PromptId): PromptEntry {
  return PROMPT_MANIFEST[id];
}

export function promptStamp(id: PromptId, version: number): string {
  return `${id}@${version}`;
}

export function promptVersions(id: PromptId): readonly number[] {
  return entry(id).versions.map((version) => version.version);
}

export function resolvePrompt(id: PromptId, options: ResolvePromptOptions = {}): ResolvedPrompt {
  const definition = entry(id);
  const requested = options.variants?.[id];
  const selected =
    (requested === undefined
      ? undefined
      : definition.versions.find((version) => version.version === requested)) ??
    definition.versions.find((version) => version.version === definition.pinnedVersion);

  if (!selected) {
    throw new Error(
      `Prompt ${id} pins version ${definition.pinnedVersion}, which it does not hold`,
    );
  }

  return {
    id,
    kind: definition.kind,
    version: selected.version,
    text: selected.text,
    stamp: promptStamp(id, selected.version),
    selectedBy: selected.version === requested ? 'variant' : 'pinned',
  };
}

export function resolvePromptText(id: PromptId, options: ResolvePromptOptions = {}): string {
  return resolvePrompt(id, options).text;
}

export function promptStampsFor(
  ids: readonly PromptId[],
  options: ResolvePromptOptions = {},
): string[] {
  return ids.map((id) => resolvePrompt(id, options).stamp);
}

export function parsePromptStamp(stamp: string): { id: PromptId; version: number } | null {
  const separator = stamp.lastIndexOf('@');
  if (separator <= 0) return null;
  const id = stamp.slice(0, separator);
  const version = Number.parseInt(stamp.slice(separator + 1), 10);
  if (!isPromptId(id) || !Number.isInteger(version) || version < 1) return null;
  return { id, version };
}
