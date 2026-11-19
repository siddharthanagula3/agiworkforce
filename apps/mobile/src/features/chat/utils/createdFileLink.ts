import { Alert } from 'react-native';
import type { AgentActivityArtifactEntry } from '@agiworkforce/client-runtime';
import { resolveGeneratedFileUri } from '@agiworkforce/cloud-contracts';
import { API_URL } from '@/lib/constants';
import { downloadFailureMessage, downloadGeneratedFile, shareFile } from '@/services/fileCreation';
import type { Artifact } from '@/types/chat';

const DOWNLOAD_FAILED_TITLE = 'Download failed';
const DOWNLOAD_FAILED = 'Could not download or share this file. Try again.';

export function createdFileArtifact(
  entry: Pick<AgentActivityArtifactEntry, 'artifactId' | 'uri'>,
  artifacts: readonly Artifact[],
): Artifact | undefined {
  const entryUri = createdFileDownloadUrl(entry.uri) ?? entry.uri;
  return (
    artifacts.find(
      (artifact) =>
        artifact.id === entry.artifactId || artifact.generatedFile?.id === entry.artifactId,
    ) ?? artifacts.find((artifact) => artifact.generatedFile?.uri === entryUri)
  );
}

export function createdFileDownloadUrl(uri: string): string | null {
  if (!uri.startsWith('/') || uri.startsWith('//')) return null;
  const resolved = resolveGeneratedFileUri(uri, API_URL);
  return /^https?:\/\//i.test(resolved) ? resolved : null;
}

export async function downloadAndShareCreatedFile(url: string, name: string): Promise<void> {
  try {
    await shareFile(await downloadGeneratedFile(url, name));
  } catch (error) {
    Alert.alert(DOWNLOAD_FAILED_TITLE, downloadFailureMessage(error, DOWNLOAD_FAILED));
  }
}
