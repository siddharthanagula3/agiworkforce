import { useCallback, useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { Monitor, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { storage } from '@/lib/mmkv';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useThemeColors } from '@/src/ui/theme';

const MMKV_PAIRING_BANNER_KEY = 'dismissedDesktopPairingBanner';

interface ChatEmptyStateProps {
  /** Whether to show the desktop pairing banner (first launch). */
  showPairingBanner?: boolean;
  onPairDesktop?: () => void;
}

export function ChatEmptyState({ showPairingBanner, onPairDesktop }: ChatEmptyStateProps) {
  const colors = useThemeColors();
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';
  const localNickname = useLocalSettingsStore((s) => s.personalization.nickname);
  const localFullName = useLocalSettingsStore((s) => s.personalization.fullName);
  const cloudNickname = useCloudSettingsStore((s) => s.personalization.nickname);
  const cloudFullName = useCloudSettingsStore((s) => s.personalization.fullName);
  const nickname = isCloud ? cloudNickname : localNickname;
  const fullName = isCloud ? cloudFullName : localFullName;
  const displayName = nickname || fullName?.split(' ')[0] || '';

  const reducedMotion = useReducedMotion();
  const [bannerVisible, setBannerVisible] = useState(false);

  useEffect(() => {
    if (FEATURES.companion && showPairingBanner !== false && onPairDesktop) {
      const dismissed = storage.getString(MMKV_PAIRING_BANNER_KEY);
      setBannerVisible(!dismissed);
    } else {
      setBannerVisible(false);
    }
  }, [onPairDesktop, showPairingBanner]);

  const dismissBanner = useCallback(() => {
    storage.set(MMKV_PAIRING_BANNER_KEY, 'true');
    setBannerVisible(false);
  }, []);

  const headline = displayName ? `Hi, ${displayName}` : 'Ask anything';

  return (
    <View
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}
    >
      {/* Desktop pairing banner (first launch only) */}
      {bannerVisible && (
        <Animated.View
          entering={reducedMotion ? undefined : FadeInDown.duration(300).delay(400)}
          style={{
            position: 'absolute',
            top: 16,
            left: 0,
            right: 0,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.accentSurface,
            borderWidth: 1,
            borderColor: colors.accentBorder,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            gap: 10,
          }}
        >
          <Monitor size={18} color={colors.teal} />
          <Pressable
            onPress={onPairDesktop}
            style={{ flex: 1 }}
            accessibilityLabel="Pair your desktop"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.teal }}>
              Pair your desktop?
            </Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>
              Scan QR to connect
            </Text>
          </Pressable>
          <Pressable
            onPress={dismissBanner}
            hitSlop={12}
            accessibilityLabel="Dismiss pairing banner"
            accessibilityRole="button"
          >
            <X size={16} color={colors.textMuted} />
          </Pressable>
        </Animated.View>
      )}

      {/* Display headline */}
      <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(500)}>
        <Text
          style={{
            fontSize: 28,
            lineHeight: 36,
            fontWeight: '500',
            color: colors.textPrimary,
            textAlign: 'center',
            marginBottom: 8,
            width: '100%',
          }}
        >
          {headline}
        </Text>
      </Animated.View>

      {/* Subtitle — only shown when no display name, otherwise headline is already personal */}
      {!displayName && (
        <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(500).delay(150)}>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: colors.textMuted,
              textAlign: 'center',
              marginBottom: 0,
              width: '100%',
            }}
          >
            How can I help you?
          </Text>
        </Animated.View>
      )}
    </View>
  );
}
