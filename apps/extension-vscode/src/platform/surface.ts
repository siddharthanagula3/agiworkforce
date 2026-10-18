import { isDeveloperSessionSurface, type SourceSurface } from '@agiworkforce/types';

export const SOURCE_SURFACE: SourceSurface = 'vscode';

if (!isDeveloperSessionSurface(SOURCE_SURFACE)) {
  throw new Error(
    `AGI sync-rule violation: VS Code SOURCE_SURFACE "${SOURCE_SURFACE}" is not a DeveloperSessionSurface.`,
  );
}
