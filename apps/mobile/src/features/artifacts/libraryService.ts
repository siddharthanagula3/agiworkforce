import { LIBRARY_PATH, artifactLibraryFile } from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';
import type { MobileArtifact } from './types';

export function canSaveArtifactToLibrary(artifact: MobileArtifact): boolean {
  return artifact.provenance?.scope === 'cloud' && artifact.kind !== 'image';
}

export async function saveArtifactToLibrary(artifact: MobileArtifact): Promise<string> {
  if (!canSaveArtifactToLibrary(artifact)) {
    throw new Error('Only Cloud artifacts can be saved to your Library.');
  }
  const file = artifactLibraryFile({
    title: artifact.title,
    type: artifact.kind,
    language: artifact.language,
    content: artifact.content,
  });
  const response = await api.post<{ id?: unknown }>(LIBRARY_PATH, file);
  if (typeof response?.id !== 'string') throw new Error('Your Library did not confirm the save.');
  return response.id;
}
