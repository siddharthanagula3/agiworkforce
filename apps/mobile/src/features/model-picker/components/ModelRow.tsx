import { ActivityIndicator, View, Pressable, Switch } from 'react-native';
import { Brain, Check, Cloud, Cpu, Download, Lock, Star } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { useSettingsStore } from '@/stores/settingsStore';
import { type ModelDef } from '@/src/features/model-picker/service';
import type { ModelInstallJob } from '@/src/features/model-picker/installStore';
import { useThemeColors } from '@/src/ui/theme';
import { ProviderLogo } from './ProviderLogo';

interface ModelRowProps {
  model: ModelDef;
  isSelected: boolean;
  isFavorite: boolean;
  isExpanded: boolean;
  thinkingEnabled: boolean;
  installStatus: ModelInstallJob;
  onSelect: (id: string) => void;
  onLockedPress: () => void;
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
  onLockedPress,
  onToggleFavorite,
  onToggleThinking,
}: ModelRowProps) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const isLocked = model.availability === 'locked';
  const isLocal = model.surface === 'local';
  const canToggleThinking = !isLocked && model.supportsThinking;
  const isDownloading = installStatus.status === 'downloading';
  const isUnavailable = installStatus.status === 'unavailable';
  const isFailed = installStatus.status === 'failed';
  const isReady = installStatus.status === 'ready';
  const disabled = isDownloading || isUnavailable;
  const progressPercent = Math.round(installStatus.progress * 100);
  const unavailableHint =
    installStatus.error ?? 'This model package/system model is unavailable on this device.';

  const handlePress = () => {
    if (disabled) return;
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLocked) {
      onLockedPress();
      return;
    }
    onSelect(model.id);
  };

  const handleLongPress = () => {
    if (disabled || isLocked) return;
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onToggleFavorite(model.id);
  };

  const handleThinkingToggle = () => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleThinking(model.id);
  };

  const iconBackground = isSelected
    ? colors.accentSurface
    : isLocked
      ? colors.warningSurface
      : colors.surfaceHover;

  return (
    <View>
      <Pressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={400}
        disabled={disabled}
        accessibilityLabel={`${model.name}${isSelected ? ', selected' : ''}${isFavorite ? ', favorite' : ''}${isLocked ? `, invite required, ${model.lockReason ?? ''}` : ''}${isDownloading ? `, downloading ${progressPercent}%` : ''}${isFailed ? ', download failed' : ''}${isUnavailable ? ', unavailable' : ''}`}
        accessibilityRole="button"
        accessibilityHint={
          isLocked
            ? 'Opens AGI Cloud invite access'
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
        style={{
          minHeight: 62,
          paddingHorizontal: 16,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: isSelected ? colors.accentSurface : colors.transparent,
          opacity: disabled ? 0.62 : 1,
        }}
      >
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            backgroundColor: iconBackground,
          }}
        >
          {isLocal ? (
            <Cpu size={17} color={isSelected ? colors.teal : colors.textSecondary} />
          ) : (
            <ProviderLogo providerId={model.provider} size={20} />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{
              color: isSelected ? colors.teal : colors.textPrimary,
              fontSize: 15,
              fontWeight: '600',
            }}
          >
            {model.name}
          </Text>
          {model.description ? (
            <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              {model.description}
            </Text>
          ) : null}
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
            {model.detailLabel}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          {isLocal && isReady ? <Badge label="Ready" color="green" /> : null}
          {isLocal && installStatus.status === 'download_required' ? (
            <>
              <Badge label="Download" color="gray" />
              <Download size={14} color={colors.textMuted} />
            </>
          ) : null}
          {isLocal && isDownloading ? (
            <>
              <Text style={{ color: colors.teal, fontSize: 11 }}>{progressPercent}%</Text>
              <ActivityIndicator size="small" color={colors.teal} />
            </>
          ) : null}
          {isLocal && isFailed ? <Badge label="Retry" color="yellow" /> : null}
          {isLocal && isUnavailable ? <Badge label="Device" color="gray" /> : null}
          {isLocked ? (
            <>
              <Badge label="Invite" color="yellow" />
              <Lock size={14} color={colors.agentWarning} />
            </>
          ) : null}
          {isSelected ? <Check size={17} color={colors.teal} /> : null}
          {isFavorite ? (
            <Star size={14} color={colors.agentWarning} fill={colors.agentWarning} />
          ) : null}
        </View>
      </Pressable>

      {isLocked ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingLeft: 58,
            paddingRight: 16,
            paddingBottom: 10,
          }}
        >
          <Cloud size={13} color={colors.agentWarning} />
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
            {model.lockReason ?? 'AGI Cloud is invite-only on mobile.'}
          </Text>
        </View>
      ) : null}

      {(isFailed || isUnavailable) && installStatus.error ? (
        <View style={{ paddingLeft: 58, paddingRight: 16, paddingBottom: 10 }}>
          <Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 12 }}>
            {installStatus.error}
          </Text>
        </View>
      ) : null}

      {isExpanded && canToggleThinking ? (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(150)}
          exiting={reducedMotion ? undefined : FadeOut.duration(100)}
          style={{
            paddingLeft: 58,
            paddingRight: 16,
            paddingBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Brain size={15} color={thinkingEnabled ? colors.agentThinking : colors.textMuted} />
            <Text
              style={{
                color: thinkingEnabled ? colors.agentThinking : colors.textSecondary,
                fontSize: 13,
                fontWeight: '600',
              }}
            >
              With thinking
            </Text>
          </View>
          <Switch
            value={thinkingEnabled}
            onValueChange={handleThinkingToggle}
            trackColor={{ false: colors.border, true: colors.purpleSurface }}
            thumbColor={thinkingEnabled ? colors.agentThinking : colors.textMuted}
            style={{ transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }] }}
            accessibilityLabel={`Thinking mode for ${model.name}`}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
