
import {
  isDeveloperSessionSurface,
  type DeveloperSessionSurface,
  type SourceSurface,
} from '@agiworkforce/types';

export const SOURCE_SURFACE: SourceSurface = 'vscode';

if (!isDeveloperSessionSurface(SOURCE_SURFACE)) {
  throw new Error(
    `AGI sync-rule violation: VS Code SOURCE_SURFACE "${SOURCE_SURFACE}" is not a DeveloperSessionSurface.`,
  );
}

/**
 * Narrowed alias — exported so call sites that need the
 * `DeveloperSessionSurface` discriminated union don't have to repeat the
 * `isDeveloperSessionSurface` check.
 */
export const DEVELOPER_SURFACE: DeveloperSessionSurface = SOURCE_SURFACE as DeveloperSessionSurface;
