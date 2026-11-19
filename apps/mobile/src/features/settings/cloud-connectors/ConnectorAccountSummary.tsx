import { useCallback, useEffect, useState } from 'react';
import { UserRound } from 'lucide-react-native';
import type { ConnectorAccount } from '@agiworkforce/cloud-contracts';
import { fetchConnectorAccounts } from '@/services/connectors';
import { SettingsRow } from '@/src/features/settings/Common';

export const CONNECTOR_ACCOUNT_LOADING = 'Reading the connected account';
export const CONNECTOR_ACCOUNT_FAILED = 'Could not be read. Tap to retry.';
export const CONNECTOR_ACCOUNT_UNNAMED = 'The provider did not share the account name';
export const CONNECTOR_ACCOUNT_RECONNECT = 'Needs reconnecting';

function accountValue(account: ConnectorAccount): string {
  const label = account.accountLabel?.trim() || CONNECTOR_ACCOUNT_UNNAMED;
  return account.needsReauthorization ? `${label} · ${CONNECTOR_ACCOUNT_RECONNECT}` : label;
}

export function ConnectorAccountRows({ connectorId }: { connectorId: string }) {
  const [accounts, setAccounts] = useState<ConnectorAccount[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let current = true;
    setFailed(false);
    setAccounts(null);
    fetchConnectorAccounts(connectorId)
      .then((next) => {
        if (current) setAccounts(next);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [attempt, connectorId]);

  if (failed) {
    return (
      <SettingsRow
        label="Account"
        value={CONNECTOR_ACCOUNT_FAILED}
        icon={UserRound}
        onPress={retry}
      />
    );
  }
  if (accounts === null) {
    return <SettingsRow label="Account" value={CONNECTOR_ACCOUNT_LOADING} icon={UserRound} />;
  }
  return (
    <>
      {accounts.map((account) => (
        <SettingsRow
          key={account.accountKey}
          label="Account"
          value={accountValue(account)}
          icon={UserRound}
        />
      ))}
    </>
  );
}
