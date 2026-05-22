/**
 * Surface identity for the Chrome extension.
 *
 * Anchors the canonical `SOURCE_SURFACE` constant that downstream code paths
 * use when self-identifying to the desktop bridge, the model gateway, or any
 * shared service that needs to know which surface emitted a request.
 *
 * The /goal sync rule is explicit: consumer chat sync is Web/Desktop/Mobile
 * only; CLI, VS Code, and Chrome keep separate developer-session histories.
 * This module asserts at load time that Chrome is registered as a developer
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

export const SOURCE_SURFACE: SourceSurface = 'chrome';

if (!isDeveloperSessionSurface(SOURCE_SURFACE)) {
  throw new Error(
    `AGI sync-rule violation: Chrome SOURCE_SURFACE "${SOURCE_SURFACE}" is not a DeveloperSessionSurface.`,
  );
}

export const DEVELOPER_SURFACE: DeveloperSessionSurface = SOURCE_SURFACE as DeveloperSessionSurface;
