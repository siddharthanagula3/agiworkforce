/**
 * Desktop Artifact Publish Adapter
 *
 * Tauri-specific implementation of the LocalFileWriter contract required by
 * @agiworkforce/artifacts publishArtifact. Writes the artifact content to
 * `<app_data_dir>/artifacts/<artifact-id>.<ext>` and returns the resulting
 * `file://` URL.
 *
 * Usage (in ArtifactPanel):
 *   const publish = makeDesktopPublishCallback(artifact);
 *   const { shareUrl } = await publish();
 *
 * Current boundary:
 *   This adapter only handles the local path, so it always calls the service
 *   with `privacyMode: 'local'` and narrows the result to
 *   {@link LocalPublishResult}. Publishing to a hosted URL needs a
 *   `CloudPublisher`, and the web adapter is the only one that exists today
 *   (apps/web/features/chat/components/artifacts/publishArtifactClient.ts);
 *   desktop injects none, so no caller here can receive a cloud result.
 */

import { appDataDir, join } from '@tauri-apps/api/path';
import { writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { publishArtifact as corePublishArtifact } from '@agiworkforce/artifacts';
import type { LocalPublishResult } from '@agiworkforce/artifacts';
import type { PublishableArtifact } from '@agiworkforce/artifacts';

// Re-export for convenience so ArtifactPanel does not import from two places.
export type { LocalPublishResult };

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
 */
export function makeDesktopPublishCallback(
  artifact: PublishableArtifact,
): () => Promise<LocalPublishResult> {
  return async () => {
    const result = await corePublishArtifact({
      artifact,
      privacyMode: 'local',
      surface: 'desktop',
      localFileWriter: tauriLocalFileWriter,
    });
    // The service's local path returns a LocalPublishResult or throws; the
    // cloud/unavailable arms belong to byok/managed, which this adapter never
    // asks for. Assert the cross-package contract here so the panel is not
    // forced to carry a branch it can never take.
    if (result.kind !== 'local') {
      throw new Error(
        `publishArtifact returned "${result.kind}" for a local publish; expected "local".`,
      );
    }
    return result;
  };
}
