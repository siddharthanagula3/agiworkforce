import type { ContextSource, ContextSourceClass } from '@agiworkforce/context';
import { fenceUntrustedContent } from '@agiworkforce/utils';

export interface ContextManifest {
  sources: readonly ContextSource[];
  classes: readonly ContextSourceClass[];
  exportable: readonly ContextSource[];
  retrievable: readonly ContextSource[];
  memoryEligible: readonly ContextSource[];
  external: readonly ContextSource[];
  instructions: readonly ContextSource[];
}

export function buildContextManifest(
  ...groups: ReadonlyArray<readonly ContextSource[] | undefined>
): ContextManifest {
  const byId = new Map<string, ContextSource>();
  for (const group of groups) {
    for (const source of group ?? []) {
      if (!byId.has(source.id)) byId.set(source.id, source);
    }
  }
  const sources = [...byId.values()];
  return {
    sources,
    classes: [...new Set(sources.map((source) => source.sourceClass))],
    exportable: sources.filter((source) => source.trust.canBeExported),
    retrievable: sources.filter((source) => source.trust.canBeRetrieved),
    memoryEligible: sources.filter((source) => source.trust.canGenerateMemory),
    external: sources.filter((source) => source.trust.isExternal),
    instructions: sources.filter((source) => source.trust.isInstruction),
  };
}

// The fence is a property of the source's class, so a caller cannot forget it and
// cannot invent one for content the taxonomy trusts as instruction.
export function fenceContextSource(source: ContextSource, content: string, notice: string): string {
  if (!source.trust.requiresFence || !source.trust.fenceTag) {
    throw new Error(`${source.sourceClass} is trusted as instruction and is never fenced`);
  }
  return fenceUntrustedContent(content, source.trust.fenceTag, notice);
}

// A class that was both external and instruction would let a fetched page issue
// instructions, the injection this taxonomy exists to make unrepresentable.
export function assertNoExternalInstructions(sources: readonly ContextSource[]): void {
  const offender = sources.find((source) => source.trust.isExternal && source.trust.isInstruction);
  if (offender) {
    throw new Error(`${offender.id} is external and cannot be trusted as instruction`);
  }
}

export function contextSourcesById(
  sources: readonly ContextSource[],
): ReadonlyMap<string, ContextSource> {
  return new Map(sources.map((source) => [source.id, source]));
}
