import { Modal, View } from 'react-native';
import { Check, Plus } from 'lucide-react-native';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { UserAvatar } from '@/src/shared/components/UserAvatar';
import { useAuthStore } from '@/src/features/auth/store';
import { cardRadius, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import type { DeviceAccount, DeviceAccounts } from '../deviceAccounts';
import { useAccountSwitch, useAccountSwitchStore } from '../useDeviceAccounts';

const ACCOUNT_AVATAR_SIZE = 36;
const ACCOUNT_ROW_MIN_HEIGHT = 60;
const ADD_ROW_MIN_HEIGHT = 52;

function AccountRow({
  account,
  switching,
  disabled,
  onSwitch,
}: {
  account: DeviceAccount;
  switching: boolean;
  disabled: boolean;
  onSwitch: (account: DeviceAccount) => void;
}) {
  const colors = useThemeColors();
  const title = account.name ?? account.email;
  const content = (
    <>
      <UserAvatar
        size={ACCOUNT_AVATAR_SIZE}
        uri={account.imageUrl}
        initials={title}
        accessibilityLabel={`${title} profile picture`}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
        >
          {title}
        </Text>
        {account.name ? (
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
            {account.email}
          </Text>
        ) : null}
      </View>
      {switching ? (
        <LoadingIndicator testID={`device-account-switching-${account.sessionId}`} />
      ) : account.active ? (
        <Check
          testID={`device-account-active-${account.sessionId}`}
          size={20}
          color={colors.teal}
          strokeWidth={2.2}
        />
      ) : null}
    </>
  );
  const rowStyle = {
    minHeight: ACCOUNT_ROW_MIN_HEIGHT,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };

  if (account.active) {
    return (
      <View
        testID={`device-account-${account.sessionId}`}
        accessible
        accessibilityLabel={`${title}, ${account.email}, current account`}
        accessibilityState={{ selected: true }}
        style={rowStyle}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID={`device-account-${account.sessionId}`}
      accessibilityRole="button"
      accessibilityLabel={`Switch to ${account.email}`}
      accessibilityHint="Makes this the account the app uses"
      accessibilityState={{ selected: false, disabled, busy: switching }}
      disabled={disabled}
      onPress={() => onSwitch(account)}
      style={({ pressed }) => ({
        ...rowStyle,
        backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
        opacity: disabled && !switching ? 0.6 : 1,
      })}
    >
      {content}
    </Pressable>
  );
}

export function DeviceAccountsCard({ accounts }: { accounts: DeviceAccounts }) {
  const colors = useThemeColors();
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const switchingTo = useAccountSwitchStore((state) => state.switchingTo);
  const { switchTo, addAccount } = useAccountSwitch();

  if (!accounts.multiSession || !isClerkSignedIn || accounts.accounts.length === 0) return null;

  const busy = switchingTo !== null;
  return (
    <View
      testID="device-accounts-card"
      style={{
        marginBottom: 24,
        borderRadius: cardRadius,
        backgroundColor: colors.surfaceElevated,
        overflow: 'hidden',
      }}
    >
      {accounts.accounts.map((account) => (
        <AccountRow
          key={account.sessionId}
          account={account}
          switching={switchingTo?.sessionId === account.sessionId}
          disabled={busy}
          onSwitch={(target) => void switchTo(target)}
        />
      ))}
      <Pressable
        testID="device-accounts-add"
        accessibilityRole="button"
        accessibilityLabel="Add account"
        accessibilityHint="Opens sign in for another account. Your current account stays signed in."
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={() => void addAccount()}
        style={({ pressed }) => ({
          minHeight: ADD_ROW_MIN_HEIGHT,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
          opacity: busy ? 0.6 : 1,
        })}
      >
        <View
          style={{
            width: ACCOUNT_AVATAR_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Plus size={20} color={colors.textSecondary} strokeWidth={1.8} />
        </View>
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>Add account</Text>
      </Pressable>
    </View>
  );
}

export function AccountSwitchOverlay() {
  const colors = useThemeColors();
  const switchingTo = useAccountSwitchStore((state) => state.switchingTo);
  if (!switchingTo) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 32,
          backgroundColor: colors.scrim,
        }}
      >
        <View
          testID="account-switch-progress"
          accessibilityViewIsModal
          accessibilityLiveRegion="polite"
          style={{
            alignItems: 'center',
            gap: 14,
            paddingHorizontal: 24,
            paddingVertical: 22,
            borderRadius: cardRadius,
            backgroundColor: colors.surfaceOverlay,
          }}
        >
          <LoadingIndicator size="large" />
          <Text
            style={{ color: colors.textPrimary, fontSize: typeScale.callout, textAlign: 'center' }}
          >
            {`Switching to ${switchingTo.email}…`}
          </Text>
        </View>
      </View>
    </Modal>
  );
}
