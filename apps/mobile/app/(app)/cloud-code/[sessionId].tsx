import { useLocalSearchParams } from 'expo-router';
import { CloudCodeSessionScreen } from '@/src/features/cloud-code';

export default function CloudCodeSessionRoute() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return <CloudCodeSessionScreen sessionId={sessionId ?? ''} />;
}
