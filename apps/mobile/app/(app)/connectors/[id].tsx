import { Redirect, useLocalSearchParams } from 'expo-router';
import { BANK_ACCOUNTS_CONNECTOR_ID } from '@agiworkforce/cloud-contracts';

import { FEATURES } from '@/lib/v1FeatureFlags';
import ConnectorDetailScreen from '@/src/features/settings/cloud-connectors/ConnectorDetailScreen';

export default function ConnectorDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const connectorId = typeof id === 'string' ? id : '';

  if (!FEATURES.bankLinking && connectorId === BANK_ACCOUNTS_CONNECTOR_ID) {
    return <Redirect href="/(app)/connectors" />;
  }

  return <ConnectorDetailScreen connectorId={connectorId} />;
}
