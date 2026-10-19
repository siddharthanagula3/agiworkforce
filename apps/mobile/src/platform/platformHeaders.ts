import Constants from 'expo-constants';
import { clientHandshakeHeaders } from '@agiworkforce/cloud-contracts';
import type { SourceSurface } from '@agiworkforce/types';

export const SOURCE_SURFACE: SourceSurface = 'mobile';

/**
 * The version is the one Expo built into the installed binary, so a report
 * names the build the user has rather than the one in the repository.
 */
export function platformRequestHeaders(): Record<string, string> {
  return clientHandshakeHeaders({
    surface: SOURCE_SURFACE,
    version: Constants.expoConfig?.version ?? undefined,
  });
}
