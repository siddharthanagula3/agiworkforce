/**
 * Shared "download all artifacts as a zip" helper.
 *
 * Single source of truth reused by BOTH the artifact panel header and the inline
 * artifact cards under a multi-file message (ponytail: one implementation, not
 * two). Takes a minimal structural shape so it works for any artifact-like type.
 */

export interface DownloadableArtifact {
  title?: string;
  content: string;
  language?: string | null;
  type?: string | null;
  generatedFile?: {
    uri: string;
    fileName: string;
    mimeType?: string | null;
  } | null;
}

const DOWNLOAD_TIMEOUT_MS = 60_000;

function sanitizeFilename(name: string): string {
  const withoutControls = Array.from(name.trim() || 'artifact', (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? '_' : character;
  }).join('');
  return withoutControls.replace(/[/\\:*?"<>|]/g, '_').slice(0, 180);
}

function artifactFilename(artifact: DownloadableArtifact): string {
  if (artifact.generatedFile?.fileName) {
    return sanitizeFilename(artifact.generatedFile.fileName);
  }

  const title = sanitizeFilename(artifact.title || 'artifact');
  if (/\.[a-z0-9]{1,12}$/i.test(title)) return title;
  const ext = sanitizeFilename(artifact.language || artifact.type || 'txt').replace(/^\.+/, '');
  return `${title}.${ext || 'txt'}`;
}

function uniqueFilename(filename: string, used: Set<string>): string {
  if (!used.has(filename)) {
    used.add(filename);
    return filename;
  }

  const extensionIndex = filename.lastIndexOf('.');
  const hasExtension = extensionIndex > 0;
  const base = hasExtension ? filename.slice(0, extensionIndex) : filename;
  const extension = hasExtension ? filename.slice(extensionIndex) : '';
  let ordinal = 2;
  let candidate = `${base} (${ordinal})${extension}`;
  while (used.has(candidate)) {
    ordinal += 1;
    candidate = `${base} (${ordinal})${extension}`;
  }
  used.add(candidate);
  return candidate;
}

function requestCredentials(uri: string): RequestCredentials {
  try {
    const resolved = new URL(uri, window.location.href);
    return resolved.origin === window.location.origin ? 'same-origin' : 'omit';
  } catch {
    return 'omit';
  }
}

async function fetchGeneratedFile(uri: string, fileName: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(uri, {
      credentials: requestCredentials(uri),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Could not download ${fileName} (HTTP ${response.status})`);
    }
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Could not download ${fileName} (request timed out)`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = sanitizeFilename(fileName);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Build the real archive bytes separately so the binary contract is directly testable. */
export async function createArtifactsZip(
  artifacts: readonly DownloadableArtifact[],
): Promise<ArrayBuffer> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const usedNames = new Set<string>();

  const entries = await Promise.all(
    artifacts.map(async (artifact) => {
      const fileName = uniqueFilename(artifactFilename(artifact), usedNames);
      if (!artifact.generatedFile?.uri) {
        return { fileName, data: artifact.content };
      }

      const response = await fetchGeneratedFile(artifact.generatedFile.uri, fileName);
      return { fileName, data: await response.arrayBuffer() };
    }),
  );

  for (const entry of entries) {
    zip.file(entry.fileName, entry.data);
  }

  return zip.generateAsync({ type: 'arraybuffer' });
}

/** Download one persisted generated file through its authenticated byte endpoint. */
export async function downloadGeneratedFile(
  uri: string,
  fileName: string,
  mimeType = 'application/octet-stream',
): Promise<void> {
  const response = await fetchGeneratedFile(uri, fileName);
  const bytes = await response.arrayBuffer();
  triggerBrowserDownload(new Blob([bytes], { type: mimeType }), fileName);
}

export async function downloadAllArtifacts(
  artifacts: readonly DownloadableArtifact[],
): Promise<void> {
  if (artifacts.length === 0) return;

  const archiveBytes = await createArtifactsZip(artifacts);
  triggerBrowserDownload(new Blob([archiveBytes], { type: 'application/zip' }), 'artifacts.zip');
}
