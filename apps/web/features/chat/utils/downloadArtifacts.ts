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
}

export async function downloadAllArtifacts(
  artifacts: readonly DownloadableArtifact[],
): Promise<void> {
  if (artifacts.length === 0) return;
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  artifacts.forEach((artifact) => {
    const ext = artifact.language || artifact.type || 'txt';
    const safeName = (artifact.title || 'artifact').replace(/[/\\:*?"<>|]/g, '_');
    zip.file(`${safeName}.${ext}`, artifact.content);
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'artifacts.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
