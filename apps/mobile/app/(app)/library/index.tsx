import { useLocalSearchParams } from 'expo-router';
import { LibraryScreen } from '@/src/features/library';

/**
 * Expo route wrapper for the Library tab.
 *
 * `imageId` lets global search open the exact authorized generated image.
 */
export default function LibraryRoute() {
  const params = useLocalSearchParams<{ imageId?: string | string[] }>();
  const imageId = Array.isArray(params.imageId) ? params.imageId[0] : params.imageId;
  return <LibraryScreen initialImageId={imageId} />;
}
