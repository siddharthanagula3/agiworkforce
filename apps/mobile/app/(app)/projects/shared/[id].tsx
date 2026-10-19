import { useLocalSearchParams } from 'expo-router';
import { SharedProjectScreen } from '@/src/features/projects/components/SharedProjectScreen';

export default function SharedProjectRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <SharedProjectScreen projectId={id ?? ''} />;
}
