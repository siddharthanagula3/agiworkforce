import { useCallback, useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Monitor, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { TaskChips, type TaskChipType } from '@/components/chat/TaskChips';
import { storage } from '@/lib/mmkv';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';

const MMKV_PAIRING_BANNER_KEY = 'dismissedDesktopPairingBanner';

const CHIP_PROMPTS: Record<TaskChipType, string> = {
  code: 'Help me write a function that...',
  write: 'Write a professional email about...',
  research: 'Research and summarize the latest on...',
  image: 'Generate an image of...',
  video: 'Create a video script for...',
  computer: 'Help me automate a task on my computer...',
};

interface ChatEmptyStateProps {
  /** Whether to show the desktop pairing banner (first launch). */
  showPairingBanner?: boolean;
  onPairDesktop?: () => void;
  /** Called when a task chip is tapped — prefills the composer with a starter prompt */
  onSelectPrompt?: (prompt: string) => void;
  /** Called when a chip is tapped — reports the active chip type */
  onChipSelect?: (chip: TaskChipType) => void;
  activeChip?: TaskChipType | null;
}

export function ChatEmptyState({
  showPairingBanner,
  onPairDesktop,
  onSelectPrompt,
  onChipSelect,
  activeChip,
}: ChatEmptyStateProps) {
  const nickname = useSettingsStore((s) => s.personalization.nickname);
  const fullName = useSettingsStore((s) => s.personalization.fullName);
  const displayName = nickname || fullName?.split(' ')[0] || '';

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

  const headline = displayName ? `Hi, ${displayName}` : 'Ask anything';

  return (
    <View
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}
    >
      {/* Desktop pairing banner (first launch only) */}
      {bannerVisible && (
        <Animated.View
          entering={FadeInDown.duration(300).delay(400)}
          style={{
            position: 'absolute',
            top: 16,
            left: 0,
            right: 0,
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

      {/* Display headline */}
      <Animated.View entering={FadeIn.duration(500)}>
        <Text
          style={{
            fontSize: 28,
            fontWeight: '400',
            color: colors.textPrimary,
            textAlign: 'center',
            marginBottom: 8,
          }}
        >
          {headline}
        </Text>
      </Animated.View>

      {/* Subtitle — only shown when no display name, otherwise headline is already personal */}
      {!displayName && (
        <Animated.View entering={FadeIn.duration(500).delay(150)}>
          <Text
            style={{
              fontSize: 15,
              color: colors.textMuted,
              textAlign: 'center',
              marginBottom: 0,
            }}
          >
            How can I help you?
          </Text>
        </Animated.View>
      )}

      {/* 6 task chips — Code/Write/Research/Image/Video/Computer */}
      <Animated.View
        entering={FadeIn.duration(500).delay(300)}
        style={{ marginTop: 32, width: '100%' }}
      >
        <TaskChips
          activeChip={activeChip}
          onChipPress={(chip) => {
            onChipSelect?.(chip);
            onSelectPrompt?.(CHIP_PROMPTS[chip]);
          }}
        />
      </Animated.View>
    </View>
  );
}
