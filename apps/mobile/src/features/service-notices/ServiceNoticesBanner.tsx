import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarClock, CircleAlert, X } from 'lucide-react-native';
import type { ServiceNotice } from '@agiworkforce/cloud-contracts';
import { Button } from '@/components/ui/Button';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { fetchServiceNotices, noticeUrl } from './service';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { NATIVE_PURCHASES_AVAILABLE } from '@/src/features/billing/nativePurchaseAvailability';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const REFRESH_MS = 5 * 60 * 1000;

export function ServiceNoticesBanner() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const appMode = useChatAppModeStore((state) => state.appMode);
  const [notices, setNotices] = useState<ServiceNotice[]>([]);
  const [dismissed, setDismissed] = useState<readonly string[]>([]);

  useEffect(() => {
    if (appMode !== 'cloud') {
      setNotices([]);
      return;
    }
    const controller = new AbortController();
    const check = () => {
      if (AppState.currentState !== 'active') return;
      fetchServiceNotices(controller.signal)
        .then((next) => {
          if (controller.signal.aborted) return;
          setNotices(next);
          setDismissed((current) => current.filter((id) => next.some((n) => n.id === id)));
        })
        .catch(() => undefined);
    };
    check();
    const timer = setInterval(check, REFRESH_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      controller.abort();
      clearInterval(timer);
      subscription.remove();
    };
  }, [appMode]);

  const dismiss = useCallback((id: string) => {
    setDismissed((current) => (current.includes(id) ? current : [...current, id]));
  }, []);

  const notice = notices.find(
    (entry) =>
      !dismissed.includes(entry.id) && (NATIVE_PURCHASES_AVAILABLE || entry.scope !== 'billing'),
  );
  if (!notice) return null;
  const Icon = notice.kind === 'maintenance' ? CalendarClock : CircleAlert;
  const iconColor =
    notice.tone === 'danger'
      ? colors.agentError
      : notice.tone === 'warning'
        ? colors.agentWarning
        : colors.textSecondary;

  return (
    <View
      testID="service-notice-container"
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 8,
          paddingLeft: insets.left + 12,
          paddingRight: insets.right + 12,
        },
      ]}
    >
      <View
        testID="service-notice"
        style={[styles.banner, { backgroundColor: colors.surfaceBase, borderColor: colors.border }]}
      >
        <Icon size={18} color={iconColor} />
        <Text
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[styles.message, { color: colors.textPrimary }]}
        >
          {notice.message}
        </Text>
        <Button
          title={notice.linkLabel}
          size="sm"
          variant="outline"
          onPress={() => void openUntrustedUrlInAppBrowser(noticeUrl(notice.href))}
        />
        <Pressable
          onPress={() => dismiss(notice.id)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss this notice"
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={16} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingBottom: 8 },
  banner: {
    width: '100%',
    maxWidth: 560,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingLeft: 14,
    paddingVertical: 6,
  },
  message: { flex: 1, fontSize: typeScale.subhead, lineHeight: 20 },
});
