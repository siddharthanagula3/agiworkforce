import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShieldAlert } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { openInAppBrowser } from '@/lib/safeOpenURL';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { WEB_SECURITY_URL, fetchWorkspaceMfaRequirement } from './service';

export function WorkspaceMfaBanner() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const isSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const appMode = useChatAppModeStore((state) => state.appMode);
  const [required, setRequired] = useState(false);

  useEffect(() => {
    if (!isSignedIn || appMode !== 'cloud') {
      setRequired(false);
      return;
    }
    const controller = new AbortController();
    const check = () => {
      fetchWorkspaceMfaRequirement(controller.signal)
        .then((next) => {
          if (!controller.signal.aborted) setRequired(next);
        })
        .catch(() => undefined);
    };
    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      controller.abort();
      subscription.remove();
    };
  }, [appMode, isSignedIn]);

  if (!required) return null;

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { top: insets.top + 8 }]}>
      <View
        accessibilityRole="alert"
        style={[styles.banner, { backgroundColor: colors.surfaceBase, borderColor: colors.border }]}
      >
        <ShieldAlert size={18} color={colors.agentWarning} />
        <Text style={[styles.message, { color: colors.textPrimary }]}>
          Your workspace requires two-factor authentication. Turn it on to keep using AGI Workforce.
        </Text>
        <Button
          title="Turn on"
          size="sm"
          variant="outline"
          onPress={() => void openInAppBrowser(WEB_SECURITY_URL)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  banner: {
    width: '100%',
    maxWidth: 560,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  message: { flex: 1, fontSize: typeScale.subhead, lineHeight: 20 },
});
