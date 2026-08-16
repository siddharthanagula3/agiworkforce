
import {
  isDeveloperSessionSurface,
  type DeveloperSessionSurface,
  type SourceSurface,
} from '@agiworkforce/types';

export const SOURCE_SURFACE: SourceSurface = 'chrome';

if (!isDeveloperSessionSurface(SOURCE_SURFACE)) {
  throw new Error(
    `AGI sync-rule violation: Chrome SOURCE_SURFACE "${SOURCE_SURFACE}" is not a DeveloperSessionSurface.`,
  );
}

export const DEVELOPER_SURFACE: DeveloperSessionSurface = SOURCE_SURFACE as DeveloperSessionSurface;
