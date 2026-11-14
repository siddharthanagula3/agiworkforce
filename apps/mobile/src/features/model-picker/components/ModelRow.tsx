import type React from 'react';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { View, Switch } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Brain, Check, Cloud, Cpu, Download, Lock, Star } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  CLOUD_LOCK_REASON,
  formatModelFileSize,
  type ModelDef,
} from '@/src/features/model-picker/service';
import { NATIVE_PURCHASES_AVAILABLE } from '@/src/features/billing/nativePurchaseAvailability';
import { getModelMetadataById, getModelReasoning } from '@agiworkforce/types';
import {
  useModelInstallStore,
  type ModelInstallJob,
} from '@/src/features/model-picker/installStore';
import { useThemeColors, motion } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useProviderOutage } from '@/src/features/model-picker/providerAvailabilityStore';
import { upcomingRetirementLabel } from '@/src/features/model-picker/retirement';
import { ProviderMark, hasProviderMark } from './ProviderMark';

const ROW_TEXT_INSET = 58;

interface ModelRowProps {
  model: ModelDef;
  isSelected: boolean;
  isFavorite: boolean;
  isExpanded: boolean;
  thinkingEnabled: boolean;
  installStatus: ModelInstallJob;
  nested?: boolean;
  detail?: string;
  trailing?: React.ReactNode;
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
  nested = false,
  detail,
  trailing,
  onSelect,
  onLockedPress,
  onToggleFavorite,
  onToggleThinking,
}: ModelRowProps) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const isLocked = model.availability === 'locked';
  const isSignInLock = isLocked && model.lockReason === CLOUD_LOCK_REASON;
  const isLocal = model.surface === 'local';
  const reasoning = getModelReasoning(model.id);
  const requiresThinking = reasoning.capable && reasoning.canDisableThinking === false;
  const canToggleThinking = !isLocked && model.supportsThinking && !requiresThinking;
  const effectiveThinkingEnabled = requiresThinking || thinkingEnabled;
  const isDownloading = installStatus.status === 'downloading';
  const isUnavailable = installStatus.status === 'unavailable';
  const isFailed = installStatus.status === 'failed';
  const isReady = installStatus.status === 'ready';
  const outage = useProviderOutage(model.provider, !isLocal && !isLocked);
  const disabled = isDownloading || isUnavailable || outage !== null;
  const metadata = isLocal ? undefined : getModelMetadataById(model.id);
  const retirementLabel = upcomingRetirementLabel(metadata);
  const drawsProviderMark = !isLocal && hasProviderMark(model.provider);
  const origin = detail
    ? detail
    : isLocal
      ? model.fileSizeBytes === undefined
        ? null
        : formatModelFileSize(model.fileSizeBytes)
      : nested || drawsProviderMark
        ? null
        : model.providerLabel;
  const visiblySelected = isSelected && (!isLocal || isReady) && !isLocked;
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

  const handleCancelDownload = () => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    useModelInstallStore.getState().cancelModelDownload(model.id);
  };

  const iconBackground = visiblySelected
    ? colors.accentSurface
    : isLocked
      ? colors.warningSurface
      : colors.surfaceHover;

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: visiblySelected ? colors.accentSurface : colors.transparent,
        }}
      >
        <PressableBox
          testID={`model-row-${model.id}`}
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={400}
          disabled={disabled}
          accessibilityLabel={`${model.name}${visiblySelected ? ', selected' : ''}${isFavorite ? ', favorite' : ''}${isLocked ? `, ${isSignInLock ? 'sign in required' : NATIVE_PURCHASES_AVAILABLE ? 'upgrade required' : 'not included in your plan'}, ${model.lockReason ?? ''}` : ''}${isDownloading ? `, downloading ${progressPercent}%` : ''}${isFailed ? ', download failed' : ''}${isUnavailable ? ', unavailable' : ''}${outage ? ', unavailable right now' : ''}${isLocal && isReady ? ', ready' : ''}${isLocal && installStatus.status === 'download_required' ? ', not downloaded' : ''}`}
          accessibilityRole="button"
          accessibilityHint={
            isLocked
              ? isSignInLock
                ? 'Opens AGI Cloud sign-in'
                : NATIVE_PURCHASES_AVAILABLE
                  ? 'Opens plan upgrade options'
                  : "This model isn't included in your plan"
              : isUnavailable
                ? unavailableHint
                : outage
                  ? outage.reason || 'This model is unavailable right now.'
                  : isDownloading
                    ? 'Model download is in progress'
                    : isFailed
                      ? 'Tap to retry download'
                      : installStatus.status === 'download_required'
                        ? 'Tap to download, long press to favorite'
                        : 'Tap to select, long press to favorite'
          }
          accessibilityState={{ selected: visiblySelected, disabled }}
          style={{
            flex: 1,
            minHeight: 52,
            paddingLeft: nested ? ROW_TEXT_INSET : 16,
            paddingRight: trailing ? 4 : 16,
            paddingVertical: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            opacity: disabled ? 0.62 : 1,
          }}
        >
          {nested ? null : (
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 9,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                backgroundColor: drawsProviderMark ? colors.transparent : iconBackground,
              }}
            >
              {isLocal ? (
                <Cpu
                  testID="model-row-icon-local"
                  size={17}
                  color={visiblySelected ? colors.teal : colors.textSecondary}
                />
              ) : drawsProviderMark ? (
                <ProviderMark
                  provider={model.provider}
                  size={22}
                  color={isLocked ? colors.textMuted : colors.textPrimary}
                />
              ) : (
                <Cloud
                  testID="model-row-icon-cloud"
                  size={17}
                  color={visiblySelected ? colors.teal : colors.textSecondary}
                />
              )}
            </View>
          )}

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text
                numberOfLines={1}
                style={{
                  flexShrink: 1,
                  color: visiblySelected ? colors.teal : colors.textPrimary,
                  fontSize: typeScale.body,
                  fontWeight: '600',
                }}
              >
                {model.name}
              </Text>
              {origin ? (
                <Text
                  testID="model-row-origin"
                  numberOfLines={1}
                  style={{ flex: 1, color: colors.textMuted, fontSize: typeScale.footnote }}
                >
                  {origin}
                </Text>
              ) : null}
            </View>
            {retirementLabel ? (
              <Text
                testID="model-row-retirement"
                numberOfLines={1}
                style={{ color: colors.agentWarning, fontSize: typeScale.caption, marginTop: 2 }}
              >
                {retirementLabel}
              </Text>
            ) : null}
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
                <Text style={{ color: colors.teal, fontSize: typeScale.caption }}>
                  {progressPercent}%
                </Text>
                <LoadingIndicator size="small" />
              </>
            ) : null}
            {isLocal && isFailed ? <Badge label="Retry" color="yellow" /> : null}
            {isLocal && isUnavailable ? <Badge label="Device" color="gray" /> : null}
            {outage ? <Badge label="Unavailable" color="gray" /> : null}
            {isLocked ? (
              <>
                <Badge
                  label={
                    isSignInLock
                      ? 'Sign in'
                      : NATIVE_PURCHASES_AVAILABLE
                        ? 'Upgrade'
                        : 'Not included'
                  }
                  color="yellow"
                />
                <Lock size={14} color={colors.agentWarning} />
              </>
            ) : null}
            {visiblySelected ? <Check size={17} color={colors.teal} /> : null}
            {isFavorite ? (
              <Star size={14} color={colors.agentWarning} fill={colors.agentWarning} />
            ) : null}
          </View>
        </PressableBox>
        {trailing}
      </View>

      {outage ? (
        <View style={{ paddingLeft: ROW_TEXT_INSET, paddingRight: 16, paddingBottom: 10 }}>
          <Text
            numberOfLines={2}
            style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 16 }}
          >
            {outage.reason
              ? `Unavailable right now: ${outage.reason}`
              : 'Unavailable right now. Try again soon or pick another model.'}
          </Text>
        </View>
      ) : null}

      {isDownloading && installStatus.cancellable ? (
        <View style={{ paddingLeft: ROW_TEXT_INSET, paddingRight: 16, paddingBottom: 10 }}>
          <PressableBox
            testID={`model-cancel-${model.id}`}
            onPress={handleCancelDownload}
            accessibilityRole="button"
            accessibilityLabel={`Cancel downloading ${model.name}`}
            hitSlop={8}
            style={{ minHeight: 28, justifyContent: 'center' }}
          >
            <Text
              style={{ color: colors.agentError, fontSize: typeScale.footnote, fontWeight: '600' }}
            >
              Cancel download
            </Text>
          </PressableBox>
        </View>
      ) : null}

      {(isFailed || isUnavailable) && installStatus.error ? (
        <View style={{ paddingLeft: ROW_TEXT_INSET, paddingRight: 16, paddingBottom: 10 }}>
          <Text
            numberOfLines={3}
            style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 16 }}
          >
            {installStatus.error}
          </Text>
        </View>
      ) : null}

      {isExpanded && (canToggleThinking || requiresThinking) ? (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(motion.quick)}
          exiting={reducedMotion ? undefined : FadeOut.duration(motion.instant)}
          style={{
            paddingLeft: ROW_TEXT_INSET,
            paddingRight: 16,
            paddingBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Brain
              size={15}
              color={effectiveThinkingEnabled ? colors.agentThinking : colors.textMuted}
            />
            <Text
              style={{
                color: effectiveThinkingEnabled ? colors.agentThinking : colors.textSecondary,
                fontSize: typeScale.footnote,
                fontWeight: '600',
              }}
            >
              {requiresThinking ? 'Reasoning always on' : 'With thinking'}
            </Text>
          </View>
          {requiresThinking ? (
            <Badge label="Always on" color="gray" />
          ) : (
            <Switch
              value={thinkingEnabled}
              onValueChange={handleThinkingToggle}
              trackColor={{ false: colors.border, true: colors.purpleSurface }}
              thumbColor={thinkingEnabled ? colors.agentThinking : colors.textMuted}
              style={{ transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }] }}
              accessibilityLabel={`Thinking mode for ${model.name}`}
            />
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}
