import { View, Pressable, Switch } from 'react-native';
import { Star, Brain } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { useSettingsStore } from '@/stores/settingsStore';
import { type ModelDef } from '@/lib/models';
import { colors } from '@/lib/theme';
import {
  PROVIDER_DISPLAY,
  CAPABILITY_LABEL,
  type ProviderId,
  type CapabilityTier,
} from '@agiworkforce/types';
import { ProviderLogo } from './ProviderLogo';

// ---------------------------------------------------------------------------
// Map mobile model tier (PickerModelTier) → CapabilityTier for sub-label.
// economy  → fastest
// balanced → balanced
// premium  → most-capable
// ---------------------------------------------------------------------------

const TIER_TO_CAPABILITY: Record<string, CapabilityTier> = {
  economy: 'fastest',
  balanced: 'balanced',
  premium: 'most-capable',
};

interface ModelRowProps {
  model: ModelDef;
  isSelected: boolean;
  isFavorite: boolean;
  /** Whether the thinking toggle row is expanded (selected + tapped again). */
  isExpanded: boolean;
  /** Whether thinking is enabled for this specific model. */
  thinkingEnabled: boolean;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onToggleThinking: (id: string) => void;
}

export function ModelRow({
  model,
  isSelected,
  isFavorite,
  isExpanded,
  thinkingEnabled,
  onSelect,
  onToggleFavorite,
  onToggleThinking,
}: ModelRowProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const providerDisplay = PROVIDER_DISPLAY[model.provider as ProviderId];
  // supportsEffort drives the thinking toggle (replaces the narrower supportsThinking).
  // We still guard on model.supportsThinking so legacy local models remain safe.
  const canToggleThinking = model.supportsThinking && (providerDisplay?.supportsEffort ?? false);

  const capabilityTier = TIER_TO_CAPABILITY[model.tier] ?? 'balanced';
  const capabilityLabel = CAPABILITY_LABEL[capabilityTier];

  const handlePress = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onSelect(model.id);
  };

  const handleLongPress = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onToggleFavorite(model.id);
  };

  const handleThinkingToggle = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onToggleThinking(model.id);
  };

  return (
    <View>
      <Pressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={400}
        className={`flex-row items-center px-4 py-3 gap-3 ${
          isSelected ? 'bg-teal-500/10' : 'active:bg-white/5'
        }`}
        accessibilityLabel={`${model.name}${isSelected ? ', selected' : ''}${isFavorite ? ', favorite' : ''}`}
        accessibilityRole="button"
        accessibilityHint="Tap to select, long press to favorite"
        accessibilityState={{ selected: isSelected }}
      >
        {/* Provider logo — 24×24 SVG or brand-color circle */}
        <View
          className="w-6 h-6 rounded-md items-center justify-center overflow-hidden"
          style={{ backgroundColor: `${providerDisplay?.brandColor ?? colors.textMuted}18` }}
        >
          <ProviderLogo providerId={model.provider} size={18} />
        </View>

        {/* Model name + capability sub-label */}
        <View className="flex-1">
          <Text
            className={`text-sm font-medium ${isSelected ? 'text-teal-400' : 'text-white'}`}
            numberOfLines={1}
          >
            {model.name}
          </Text>
          <Text className="text-[11px] text-white/40 mt-0.5" numberOfLines={1}>
            {capabilityLabel}
          </Text>
        </View>

        {/* Right side: badges + favorite */}
        <View className="flex-row items-center gap-2">
          {model.isNew && <Badge label="New" color="teal" />}

          {isFavorite && <Star size={14} color="#f59e0b" fill="#f59e0b" />}
        </View>
      </Pressable>

      {/* Per-model thinking toggle — shown when model is selected + expanded */}
      {isExpanded && canToggleThinking && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
          className="flex-row items-center justify-between pl-[52px] pr-4 pb-3"
        >
          <View className="flex-row items-center gap-1.5">
            <Brain size={14} color={thinkingEnabled ? '#a78bfa' : colors.textMuted} />
            <Text
              className={`text-xs font-medium ${
                thinkingEnabled ? 'text-purple-400' : 'text-white/50'
              }`}
            >
              With thinking
            </Text>
          </View>

          <Switch
            value={thinkingEnabled}
            onValueChange={handleThinkingToggle}
            trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(167,139,250,0.4)' }}
            thumbColor={thinkingEnabled ? '#a78bfa' : '#666'}
            style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
            accessibilityLabel={`Thinking mode for ${model.name}`}
          />
        </Animated.View>
      )}
    </View>
  );
}
