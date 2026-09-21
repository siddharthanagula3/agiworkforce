import { clientHandshakeHeaders } from '@agiworkforce/cloud-contracts';
import type { SourceSurface } from '@agiworkforce/types';

export const SOURCE_SURFACE: SourceSurface = 'desktop';

/**
 * The shell has two runtimes and each learns its version differently, so the
 * version arrives here rather than being read here.
 */
export function platformRequestHeaders(version: string | undefined): Record<string, string> {
  return clientHandshakeHeaders({ surface: SOURCE_SURFACE, version });
}
