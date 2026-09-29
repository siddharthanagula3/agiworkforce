import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { RefreshCw, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale, zIndex } from '@/src/ui/theme/tokens';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useAuthStore } from '@/src/features/auth/store';
import { useCloudSyncStateStore } from '@/stores/chat/cloudSyncStateStore';
import { syncNow } from '@/services/cloudSyncEngine';

export function CloudSyncErrorBanner() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { isOnline } = useNetworkStatus();
  const appMode = useChatAppModeStore((state) => state.appMode);
  const isSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const status = useCloudSyncStateStore((state) => state.status);
  const lastError = useCloudSyncStateStore((state) => state.lastError);
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'idle') setDismissedError(null);
  }, [status]);

  const errorKey = lastError ?? 'Cloud sync failed';
  if (
    !isOnline ||
    !isSignedIn ||
    appMode !== 'cloud' ||
    status !== 'error' ||
    dismissedError === errorKey
  ) {
    return null;
  }

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel="Cloud changes have not synced"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: zIndex.notification,
        paddingTop: insets.top + 8,
        paddingBottom: 10,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: colors.dangerSurface,
        borderBottomWidth: 1,
        borderBottomColor: colors.dangerBorder,
      }}
    >
      <Text
        style={{
          color: colors.agentError,
          fontSize: typeScale.caption,
          fontWeight: '600',
          flex: 1,
        }}
      >
        Cloud changes haven’t synced. Check your connection and retry.
      </Text>
      <PressableBox
        accessibilityRole="button"
        accessibilityLabel="Retry Cloud sync"
        onPress={() => void syncNow()}
        hitSlop={8}
      >
        <RefreshCw size={18} color={colors.agentError} />
      </PressableBox>
      <PressableBox
        accessibilityRole="button"
        accessibilityLabel="Dismiss Cloud sync error"
        onPress={() => setDismissedError(errorKey)}
        hitSlop={8}
      >
        <X size={18} color={colors.agentError} />
      </PressableBox>
    </View>
  );
}
