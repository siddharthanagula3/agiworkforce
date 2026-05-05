/**
 * UpsellCard — prompts free-plan users to upgrade to Hobby.
 *
 * Dismissible: stores a timestamp under `tier_upsell_dismissed_at` in MMKV.
 * The card re-appears automatically after 7 days.
 *
 * Touch targets: all interactive elements ≥44pt (iOS HIG).
 */
import { useCallback, useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Zap, Check, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { storage } from '@/lib/mmkv';
import { colors } from '@/lib/theme';

const MMKV_DISMISS_KEY = 'tier_upsell_dismissed_at';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const FEATURE_BULLETS: string[] = [
  'Managed cloud — no API keys required',
  'Access to basic cloud models',
  'Limited monthly credits included',
  'Shared chats and cross-device sync',
];

interface UpsellCardProps {
  /** Called when the user taps the primary "Upgrade" CTA. */
  onUpgradePress: () => void;
}

/** Returns true when the card should be shown (not dismissed within TTL). */
function shouldShowUpsell(): boolean {
  const raw = storage.getNumber(MMKV_DISMISS_KEY);
  if (!raw) return true;
  return Date.now() - raw > DISMISS_TTL_MS;
}

export function UpsellCard({ onUpgradePress }: UpsellCardProps) {
  const [visible, setVisible] = useState(false);

  // Read MMKV after component mounts so the encrypted storage is ready.
  useEffect(() => {
    setVisible(shouldShowUpsell());
  }, []);

  const handleDismiss = useCallback(() => {
    storage.set(MMKV_DISMISS_KEY, Date.now());
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <View
      style={{
        backgroundColor: '#1a2428',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.teal + '40',
        padding: 16,
      }}
    >
      {/* Header row */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2">
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: colors.teal + '20',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Zap size={16} color={colors.teal} />
          </View>
          <Text className="text-base font-semibold text-white">Upgrade to Hobby</Text>
        </View>

        {/* Dismiss — 44pt min touch target */}
        <Pressable
          onPress={handleDismiss}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          accessibilityLabel="Dismiss upgrade prompt"
          accessibilityRole="button"
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <X size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Feature bullets */}
      <View className="gap-2 mb-4">
        {FEATURE_BULLETS.map((bullet) => (
          <View key={bullet} className="flex-row items-center gap-2">
            <Check size={14} color={colors.teal} />
            <Text className="text-sm text-white/70 flex-1">{bullet}</Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      <Button
        title="Upgrade"
        variant="primary"
        size="md"
        onPress={onUpgradePress}
        accessibilityLabel="Upgrade to Hobby plan"
      />

      {/* Secondary dismiss link — 44pt touch target */}
      <Pressable
        onPress={handleDismiss}
        style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}
        accessibilityLabel="Maybe later"
        accessibilityRole="button"
      >
        <Text className="text-sm text-white/40">Maybe later</Text>
      </Pressable>
    </View>
  );
}
