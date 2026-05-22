/**
 * Desktop Artifact Publish Adapter
 *
 * Tauri-specific implementation of the LocalFileWriter contract required by
 * @agiworkforce/services publishArtifact. Writes the artifact content to
 * `<app_data_dir>/artifacts/<artifact-id>.<ext>` and returns the resulting
 * `file://` URL.
 *
 * Usage (in ArtifactPanel):
 *   import { makeDesktopPublishArtifact } from './publishAdapter';
 *   const publishArtifact = makeDesktopPublishArtifact();
 *   <UnifiedArtifactPanel publishArtifact={publishArtifact} ... />
 *
 * v1 LOCAL ONLY (lock: v1-local-only-cloud-waitlist-2026-05-18):
 *   This adapter only handles the local path. Cloud publish is deferred
 *   until the Cloud Managed tier launches (TODO: EXEC-SUMMARY-r2 hours).
 */

import { appDataDir, join } from '@tauri-apps/api/path';
import { writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { publishArtifact as corePublishArtifact } from '@agiworkforce/services';
import type { PublishResult } from '@agiworkforce/services';
import type { PublishableArtifact } from '@agiworkforce/services';

// Re-export for convenience so ArtifactPanel does not import from two places.
export type { PublishResult };

/**
 * Map artifact type to a file extension for local export.
 * Mirrors the extension logic in the desktop ArtifactPanel download handler.
 */
function artifactTypeToExtension(type: string, language?: string): string {
  switch (type) {
    case 'html':
      return 'html';
    case 'react':
      return 'tsx';
    case 'markdown':
    case 'document':
      return 'md';
    case 'json':
      return 'json';
    case 'svg':
      return 'svg';
    case 'mermaid':
      return 'mmd';
    case 'image':
      return 'png';
    case 'code':
      return language ?? 'txt';
    default:
      return 'txt';
  }
}

/**
 * The Tauri file:// writer. Resolves the app data directory at call time,
 * creates the `artifacts/` sub-directory if needed, writes the content, and
 * returns the `file://` URL.
 */
async function tauriLocalFileWriter(artifact: PublishableArtifact): Promise<string> {
  const dataDir = await appDataDir();
  const artifactsDir = await join(dataDir, 'artifacts');

  // Create the directory (no-op if it already exists).
  await mkdir(artifactsDir, { recursive: true });

  const ext = artifactTypeToExtension(artifact.type, artifact.language);
  const safeTitle = artifact.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  const fileName = `${safeTitle}-${artifact.id}.${ext}`;
  const filePath = await join(artifactsDir, fileName);

  await writeTextFile(filePath, artifact.content);

  // Return a proper file:// URL. On macOS/Linux the path starts with /;
  // on Windows it starts with a drive letter (C:\...). The URL constructor
  // handles both cases correctly.
  return `file://${filePath}`;
}

/**
 * Build a publishArtifact callback for injection into the desktop ArtifactPanel.
 *
 * @param artifact - The artifact to publish. Captured at call time so the
 *   returned function is a stable zero-argument callback that the panel can
 *   call directly.
 * @param privacyMode - Current session privacy mode. Defaults to 'local' (v1).
 */
export function makeDesktopPublishCallback(
  artifact: PublishableArtifact,
  privacyMode: 'local' | 'byok' | 'managed' = 'local',
): () => Promise<PublishResult> {
  return async () =>
    corePublishArtifact({
      artifact,
      privacyMode,
      surface: 'desktop',
      localFileWriter: tauriLocalFileWriter,
    });
}
