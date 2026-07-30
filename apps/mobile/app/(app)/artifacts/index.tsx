import { useLocalSearchParams } from 'expo-router';
import { ArtifactsGalleryScreen } from '@/src/features/artifacts';

/**
 * Expo route wrapper for the Artifacts gallery.
 *
 * `artifactId` lets global search open the exact authorized gallery item.
 */
export default function ArtifactsRoute() {
  const params = useLocalSearchParams<{ artifactId?: string | string[] }>();
  const artifactId = Array.isArray(params.artifactId) ? params.artifactId[0] : params.artifactId;
  return <ArtifactsGalleryScreen initialArtifactId={artifactId} />;
}
