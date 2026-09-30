import { useLocalSearchParams } from 'expo-router';
import { CloudCodeSessionScreen } from '@/src/features/cloud-code';

export default function CloudCodeSessionRoute() {
  const { sessionId, goal } = useLocalSearchParams<{ sessionId: string; goal?: string }>();
  return <CloudCodeSessionScreen sessionId={sessionId ?? ''} initialGoal={goal} />;
}
