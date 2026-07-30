import { useLocalSearchParams } from 'expo-router';

import ConnectorDetailScreen from '@/src/features/settings/cloud-connectors/ConnectorDetailScreen';

export default function ConnectorDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const connectorId = typeof id === 'string' ? id : '';

  return <ConnectorDetailScreen connectorId={connectorId} />;
}
