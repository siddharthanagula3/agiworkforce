import { useLocalSearchParams } from 'expo-router';
import { ArtifactsGalleryScreen } from '@/src/features/artifacts';

export default function ArtifactsRoute() {
  const params = useLocalSearchParams<{ artifactId?: string | string[] }>();
  const artifactId = Array.isArray(params.artifactId) ? params.artifactId[0] : params.artifactId;
  return <ArtifactsGalleryScreen initialArtifactId={artifactId} />;
}
