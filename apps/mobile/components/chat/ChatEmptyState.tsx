import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Monitor, X, Code, PenLine, Search } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { storage } from '@/lib/mmkv';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';

const MMKV_PAIRING_BANNER_KEY = 'dismissedDesktopPairingBanner';

interface PromptChip {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  label: string;
  prompt: string;
}

const PROMPT_CHIPS: PromptChip[] = [
  { icon: Code, label: 'Code', prompt: 'Help me write a function that...' },
  { icon: PenLine, label: 'Write', prompt: 'Write a professional email about...' },
  { icon: Search, label: 'Research', prompt: 'Research and summarize the latest on...' },
];

interface ChatEmptyStateProps {
  /** Whether to show the desktop pairing banner (first launch). */
  showPairingBanner?: boolean;
  onPairDesktop?: () => void;
  /** Called when a prompt chip is tapped — prefills the composer */
  onSelectPrompt?: (prompt: string) => void;
}

export function ChatEmptyState({
  showPairingBanner,
  onPairDesktop,
  onSelectPrompt,
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

      {/* Horizontal prompt chips — 3 stateless one-tap shortcuts, no header label */}
      <Animated.View
        entering={FadeIn.duration(500).delay(300)}
        style={{ marginTop: 32, width: '100%' }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}
        >
          {PROMPT_CHIPS.map((chip) => (
            <PromptChipButton key={chip.label} chip={chip} onPress={onSelectPrompt} />
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

interface PromptChipButtonProps {
  chip: PromptChip;
  onPress?: (prompt: string) => void;
}

function PromptChipButton({ chip, onPress }: PromptChipButtonProps) {
  const IconComponent = chip.icon;
  return (
    <Pressable
      onPress={() => onPress?.(chip.prompt)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 34,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: pressed ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.1)',
        borderRadius: 999,
        backgroundColor: pressed ? colors.surfaceHover : 'transparent',
      })}
      accessibilityLabel={`${chip.label} prompt`}
      accessibilityRole="button"
      accessibilityHint={`Pre-fills: ${chip.prompt}`}
    >
      <IconComponent size={14} color={colors.textSecondary} strokeWidth={1.75} />
      <Text style={{ fontSize: 13, color: colors.textSecondary }}>{chip.label}</Text>
    </Pressable>
  );
}
