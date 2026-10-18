import type { ContextSource } from '@agiworkforce/context';
import { fenceUntrustedContent } from '@agiworkforce/utils';

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
