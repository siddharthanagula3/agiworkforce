import { ActivityIndicator, View, Pressable, Switch } from 'react-native';
import { Brain, Check, CloudOff, Cpu, Download, Lock, Star } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { useSettingsStore } from '@/stores/settingsStore';
import { type ModelDef } from '@/src/features/model-picker/service';
import type { ModelInstallJob } from '@/src/features/model-picker/installStore';
import { colors } from '@/src/ui/theme';
import { PROVIDER_DISPLAY, type ProviderId } from '@agiworkforce/types';
import { ProviderLogo } from './ProviderLogo';

interface ModelRowProps {
  model: ModelDef;
  isSelected: boolean;
  isFavorite: boolean;
  /** Whether the thinking toggle row is expanded (selected + tapped again). */
  isExpanded: boolean;
  /** Whether thinking is enabled for this specific model. */
  thinkingEnabled: boolean;
  installStatus: ModelInstallJob;
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
  installStatus,
  onSelect,
  onToggleFavorite,
  onToggleThinking,
}: ModelRowProps) {
  const reducedMotion = useReducedMotion();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const providerDisplay = PROVIDER_DISPLAY[model.provider as ProviderId];
  const isLocked = model.availability === 'locked';
  const isLocal = model.surface === 'local';
  const lockReason = model.lockReason ?? 'Cloud Managed is locked in Mobile v1';
  const canToggleThinking = !isLocked && model.supportsThinking;
  const isDownloading = installStatus.status === 'downloading';
  const isUnavailable = installStatus.status === 'unavailable';
  const isFailed = installStatus.status === 'failed';
  const isReady = installStatus.status === 'ready';
  const disabled = isLocked || isDownloading || isUnavailable;
  const progressPercent = Math.round(installStatus.progress * 100);
  const unavailableHint =
    installStatus.error ?? 'This model package/system model is unavailable on this device.';

  const handlePress = () => {
    if (disabled) return;
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onSelect(model.id);
  };

  const handleLongPress = () => {
    if (disabled) return;
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
        disabled={disabled}
        className={`flex-row items-center px-4 py-3 gap-3 ${
          isSelected ? 'bg-teal-500/10' : disabled ? 'opacity-60' : 'active:bg-white/5'
        }`}
        accessibilityLabel={`${model.name}${isSelected ? ', selected' : ''}${isFavorite ? ', favorite' : ''}${isLocked ? `, locked, ${lockReason}` : ''}${isDownloading ? `, downloading ${progressPercent}%` : ''}${isFailed ? ', download failed' : ''}${isUnavailable ? ', unavailable' : ''}`}
        accessibilityRole="button"
        accessibilityHint={
          isLocked
            ? lockReason
            : isUnavailable
              ? unavailableHint
              : isDownloading
                ? 'Model download is in progress'
                : isFailed
                  ? 'Tap to retry download'
                  : installStatus.status === 'download_required'
                    ? 'Tap to download, long press to favorite'
                    : 'Tap to select, long press to favorite'
        }
        accessibilityState={{ selected: isSelected, disabled }}
      >
        <View
          className="w-6 h-6 rounded-md items-center justify-center overflow-hidden"
          style={{
            backgroundColor: isLocal
              ? `${colors.teal}18`
              : `${providerDisplay?.brandColor ?? colors.textMuted}14`,
          }}
        >
          {isLocal ? (
            <Cpu size={16} color={isSelected ? colors.teal : colors.textMuted} />
          ) : (
            <ProviderLogo providerId={model.provider} size={18} />
          )}
        </View>

        <View className="flex-1">
          <Text
            className={`text-sm font-medium ${
              isSelected ? 'text-teal-400' : isLocked ? 'text-white/70' : 'text-white'
            }`}
            numberOfLines={1}
          >
            {model.name}
          </Text>
          <Text className="text-[11px] text-white/40 mt-0.5" numberOfLines={1}>
            {model.detailLabel}
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          {isLocal && isReady && <Badge label="Ready" color="green" />}
          {isLocal && installStatus.status === 'download_required' && (
            <>
              <Badge label="Download" color="gray" />
              <Download size={14} color={colors.textMuted} />
            </>
          )}
          {isLocal && isDownloading && (
            <>
              <Text className="text-[11px] text-teal-300">{progressPercent}%</Text>
              <ActivityIndicator size="small" color={colors.teal} />
            </>
          )}
          {isLocal && isFailed && <Badge label="Retry" color="yellow" />}
          {isLocal && isUnavailable && <Badge label="Soon" color="gray" />}
          {isLocal && installStatus.status === 'locked' && <Badge label="Locked" color="gray" />}
          {isLocked && (
            <>
              <Badge label="Locked" color="gray" />
              <Lock size={14} color={colors.textMuted} />
            </>
          )}

          {isSelected && <Check size={16} color={colors.teal} />}
          {isFavorite && <Star size={14} color="#f59e0b" fill="#f59e0b" />}
        </View>
      </Pressable>

      {isLocked && (
        <View className="flex-row items-center gap-1.5 pl-[52px] pr-4 pb-3">
          <CloudOff size={12} color={colors.textMuted} />
          <Text className="text-[11px] text-white/35" numberOfLines={1}>
            {lockReason}
          </Text>
        </View>
      )}

      {(isFailed || isUnavailable) && installStatus.error ? (
        <View className="flex-row items-center gap-1.5 pl-[52px] pr-4 pb-3">
          <Text className="text-[11px] text-white/35" numberOfLines={1}>
            {installStatus.error}
          </Text>
        </View>
      ) : null}

      {isExpanded && canToggleThinking && (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(150)}
          exiting={reducedMotion ? undefined : FadeOut.duration(100)}
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
