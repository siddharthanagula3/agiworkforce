import { useLocalSearchParams } from 'expo-router';
import { LibraryScreen } from '@/src/features/library';

export default function LibraryRoute() {
  const params = useLocalSearchParams<{
    imageId?: string | string[];
    filter?: string | string[];
  }>();
  const imageId = Array.isArray(params.imageId) ? params.imageId[0] : params.imageId;
  const filter = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  return <LibraryScreen initialImageId={imageId} initialFilter={filter} />;
}
