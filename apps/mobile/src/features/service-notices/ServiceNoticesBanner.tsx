import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarClock, CircleAlert, X } from 'lucide-react-native';
import type { ServiceNotice } from '@agiworkforce/cloud-contracts';
import { Button } from '@/components/ui/button';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { fetchServiceNotices, noticeUrl } from './service';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
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

  const notice = notices.find((entry) => !dismissed.includes(entry.id));
  if (!notice) return null;
  const Icon = notice.kind === 'maintenance' ? CalendarClock : CircleAlert;
  const iconColor =
    notice.tone === 'danger'
      ? colors.agentError
      : notice.tone === 'warning'
        ? colors.agentWarning
        : colors.textSecondary;

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { top: insets.top + 8 }]}>
      <View
        testID="service-notice"
        accessibilityRole="alert"
        style={[styles.banner, { backgroundColor: colors.surfaceBase, borderColor: colors.border }]}
      >
        <Icon size={18} color={iconColor} />
        <Text style={[styles.message, { color: colors.textPrimary }]}>{notice.message}</Text>
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
  overlay: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
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
