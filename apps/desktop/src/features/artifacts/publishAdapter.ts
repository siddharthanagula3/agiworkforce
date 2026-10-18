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
import { writeFile, writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { spreadsheetSafeExport } from '@agiworkforce/unified-chat';
import { publishArtifact as corePublishArtifact } from '@agiworkforce/artifacts';
import type { LocalPublishResult } from '@agiworkforce/artifacts';
import type { PublishableArtifact } from '@agiworkforce/artifacts';

export type { LocalPublishResult };

// language is model-controlled and lands inside a filesystem path, so it is reduced to a
// single plain extension token: it can neither escape the artifacts directory nor smuggle
// a second extension ("data.csv") past the spreadsheet guard below
function languageExtension(language: string | undefined): string {
  return (
    (language ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'txt'
  );
}

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
      return languageExtension(language);
    default:
      return 'txt';
  }
}

const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/;

const IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

function decodeImageArtifact(content: string): { bytes: Uint8Array; ext: string } {
  const match = IMAGE_DATA_URL.exec(content.trim());
  const mime = match?.[1];
  const payload = match?.[2];
  if (!mime || !payload) {
    throw new Error(
      'This image is not stored inside the artifact, so it cannot be saved as a file. Open it and save it from there.',
    );
  }
  const binary = atob(payload.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { bytes, ext: IMAGE_MIME_EXTENSIONS[mime] ?? 'png' };
}

async function tauriLocalFileWriter(artifact: PublishableArtifact): Promise<string> {
  const image = artifact.type === 'image' ? decodeImageArtifact(artifact.content) : null;
  const dataDir = await appDataDir();
  const artifactsDir = await join(dataDir, 'artifacts');

  await mkdir(artifactsDir, { recursive: true });

  const ext = image?.ext ?? artifactTypeToExtension(artifact.type, artifact.language);
  const safeTitle = artifact.title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  const fileName = `${safeTitle}-${artifact.id}.${ext}`;
  const filePath = await join(artifactsDir, fileName);

  if (image) {
    await writeFile(filePath, image.bytes);
    return `file://${filePath}`;
  }

  // artifact.language is model-controlled, so `code` publishes can name this file .csv and
  // the success toast hands the user its path: neutralize before the bytes reach disk
  const { body } = spreadsheetSafeExport(artifact.content, ext);
  await writeTextFile(filePath, body);

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
    if (result.kind !== 'local') {
      throw new Error(
        `publishArtifact returned "${result.kind}" for a local publish; expected "local".`,
      );
    }
    return result;
  };
}
