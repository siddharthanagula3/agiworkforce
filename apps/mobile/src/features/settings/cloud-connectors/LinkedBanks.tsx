import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Switch, View } from 'react-native';
import type { BankAccountsItem } from '@agiworkforce/cloud-contracts';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { toUserMessage } from '@/services/userMessage';
import {
  fetchBankItems,
  linkBankAccountsInApp,
  removeBankItem,
  setBankItemExcludedAccounts,
} from '@/services/connectors';

export function LinkedBanks({ onChanged }: { onChanged: () => void }) {
  const colors = useThemeColors();
  const [items, setItems] = useState<BankAccountsItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await fetchBankItems());
      setFailed(false);
    } catch (error) {
      console.warn('[connectors] linked banks could not be loaded', error);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (title: string, action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        await load();
        onChanged();
      } catch (error) {
        Alert.alert(title, toUserMessage(error, 'Check your connection and try again.'));
      } finally {
        setBusy(false);
      }
    },
    [load, onChanged],
  );

  const toggle = (item: BankAccountsItem, accountId: string, include: boolean) => {
    const excluded = item.accounts
      .filter((account) => (account.accountId === accountId ? !include : !account.included))
      .map((account) => account.accountId);
    void run('That change was not saved', () => setBankItemExcludedAccounts(item.id, excluded));
  };

  const remove = (item: BankAccountsItem) => {
    const name = item.institutionName ?? 'this bank';
    Alert.alert(
      `Remove ${name}?`,
      'Its accounts stop appearing in chats and the finance view, and the link is removed at Plaid.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove bank',
          style: 'destructive',
          onPress: () => void run('The bank was not removed', () => removeBankItem(item.id)),
        },
      ],
    );
  };

  return (
    <View style={{ marginBottom: 18, gap: 10 }}>
      <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '700' }}>
        Linked banks
      </Text>
      {failed ? (
        <Text style={{ color: colors.agentError, fontSize: typeScale.footnote }}>
          Your linked banks could not be loaded.
        </Text>
      ) : items === null ? (
        <ActivityIndicator color={colors.teal} />
      ) : (
        items.map((item) => (
          <View
            key={item.id}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 12,
              gap: 6,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text
                style={{
                  flex: 1,
                  color: colors.textPrimary,
                  fontSize: typeScale.subhead,
                  fontWeight: '600',
                }}
              >
                {item.institutionName ?? 'Linked bank'}
              </Text>
              <Pressable
                onPress={() => remove(item)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.institutionName ?? 'this bank'}`}
                style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
              >
                <Text style={{ color: colors.agentError, fontSize: typeScale.footnote }}>
                  Remove bank
                </Text>
              </Pressable>
            </View>
            {item.status === 'ready' ? (
              item.accounts.map((account) => (
                <View
                  key={account.accountId}
                  style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 }}
                >
                  <Text
                    style={{ flex: 1, color: colors.textSecondary, fontSize: typeScale.footnote }}
                  >
                    {account.mask ? `${account.name} ••${account.mask}` : account.name}
                  </Text>
                  <Switch
                    value={account.included}
                    disabled={busy}
                    onValueChange={(next) => toggle(item, account.accountId, next)}
                    accessibilityLabel={`Include ${account.name} in chats`}
                  />
                </View>
              ))
            ) : (
              <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
                {item.status === 'reconnect'
                  ? 'The bank asks you to sign in again before it shares its accounts.'
                  : 'The bank did not answer, so its accounts could not be listed.'}
              </Text>
            )}
          </View>
        ))
      )}
      <Pressable
        onPress={() =>
          void run('Bank not linked', async () => {
            await linkBankAccountsInApp();
          })
        }
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Link another bank"
        style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
      >
        <Text style={{ color: colors.teal, fontSize: typeScale.subhead, fontWeight: '600' }}>
          Link another bank
        </Text>
      </Pressable>
      <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
        Accounts you switch off stay linked but are left out of chats.
      </Text>
    </View>
  );
}
