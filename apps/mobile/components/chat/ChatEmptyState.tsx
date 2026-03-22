import { useCallback, useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Sparkles, Monitor, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { storage } from '@/lib/mmkv';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';

const MMKV_PAIRING_BANNER_KEY = 'dismissedDesktopPairingBanner';

/**
 * Returns a time-aware greeting string.
 */
function getGreeting(name?: string): string {
  const hour = new Date().getHours();
  let timeOfDay: string;
  if (hour < 12) {
    timeOfDay = 'morning';
  } else if (hour < 17) {
    timeOfDay = 'afternoon';
  } else {
    timeOfDay = 'evening';
  }
  const displayName = name?.trim() || '';
  return displayName ? `Good ${timeOfDay}, ${displayName}` : `Good ${timeOfDay}`;
}

interface ChatEmptyStateProps {
  /** Whether to show the desktop pairing banner (first launch). */
  showPairingBanner?: boolean;
  onPairDesktop?: () => void;
}

/**
 * Minimal empty state matching the spec:
 * - AGI Workforce logo with subtle animation
 * - Time-aware greeting
 * - "How can I help you?" subtitle
 * - NO suggestion chips
 * - Dismissible desktop pairing banner on first launch
 */
export function ChatEmptyState({ showPairingBanner, onPairDesktop }: ChatEmptyStateProps) {
  const nickname = useSettingsStore((s) => s.personalization.nickname);
  const fullName = useSettingsStore((s) => s.personalization.fullName);
  const displayName = nickname || fullName?.split(' ')[0] || '';
  const greeting = getGreeting(displayName);

  const [bannerVisible, setBannerVisible] = useState(false);

  useEffect(() => {
    if (showPairingBanner !== false) {
      const dismissed = storage.getString(MMKV_PAIRING_BANNER_KEY);
      setBannerVisible(!dismissed);
    }
  }, [showPairingBanner]);

  const dismissBanner = useCallback(() => {
    storage.set(MMKV_PAIRING_BANNER_KEY, 'true');
    setBannerVisible(false);
  }, []);

  return (
    <View className="flex-1 items-center justify-center px-8">
      {/* Desktop pairing banner (first launch only) */}
      {bannerVisible && (
        <Animated.View
          entering={FadeInDown.duration(300).delay(400)}
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            right: 16,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(33, 128, 141, 0.12)',
            borderWidth: 1,
            borderColor: 'rgba(33, 128, 141, 0.25)',
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
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
              Scan QR to connect
            </Text>
          </Pressable>
          <Pressable
            onPress={dismissBanner}
            hitSlop={12}
            accessibilityLabel="Dismiss pairing banner"
            accessibilityRole="button"
          >
            <X size={16} color="rgba(255,255,255,0.3)" />
          </Pressable>
        </Animated.View>
      )}

      {/* Logo with subtle entrance animation */}
      <Animated.View entering={FadeIn.duration(500)}>
        <View
          style={{ backgroundColor: 'rgba(33, 128, 141, 0.12)' }}
          className="w-16 h-16 rounded-full items-center justify-center mb-6"
        >
          <Sparkles size={32} color={colors.teal} />
        </View>
      </Animated.View>

      {/* Time-aware greeting */}
      <Animated.View entering={FadeIn.duration(500).delay(150)}>
        <Text className="text-white text-2xl font-semibold text-center mb-2">{greeting}</Text>
      </Animated.View>

      {/* Subtitle */}
      <Animated.View entering={FadeIn.duration(500).delay(300)}>
        <Text className="text-white/40 text-base text-center">How can I help you?</Text>
      </Animated.View>
    </View>
  );
}
