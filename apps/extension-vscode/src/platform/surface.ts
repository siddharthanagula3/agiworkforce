/**
 * Surface identity for the VS Code extension.
 *
 * Anchors the canonical `SOURCE_SURFACE` constant that downstream code paths
 * use when self-identifying to the desktop bridge, the model gateway, or any
 * shared service that needs to know which surface emitted a request.
 *
 * The /goal sync rule is explicit: consumer chat sync is Web/Desktop/Mobile
 * only; CLI, VS Code, and Chrome keep separate developer-session histories.
 * This module asserts at load time that VS Code is registered as a developer
 * surface — if a future refactor accidentally promotes it into the synced-app
 * vocabulary, this assertion fires immediately rather than letting the
 * mistake propagate silently.
 *
 * Round-10 autonomous suite-transformation slice, 2026-05-21.
 */

import {
  isDeveloperSessionSurface,
  type DeveloperSessionSurface,
  type SourceSurface,
} from '@agiworkforce/types';

export const SOURCE_SURFACE: SourceSurface = 'vscode';

// Module-load assertion: any future refactor that breaks the sync-rule
// vocabulary will fail extension activation rather than silently produce
// bad telemetry.
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
