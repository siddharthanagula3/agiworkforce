import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Check, Cpu, Search, X as XIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/text';
import { ModelRow } from './ModelRow';
import { useModelStore } from '@/src/features/model-picker/store';
import { useModelInstallStore } from '@/src/features/model-picker/installStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useTierStore } from '@/src/features/billing/store';
import { useAgentControlStore, type PickerEffort } from '@/stores/agentControlStore';
import { getModelReasoning } from '@agiworkforce/types';
import {
  AUTO_MODES,
  CLOUD_LOCK_REASON,
  getModelByIdForCloudAccess,
  getModelListForCloudAccess,
  isAutoMode,
  type AutoModeDef,
  type ModelDef,
} from '@/src/features/model-picker/service';
import { useThemeColors, sheetRadius } from '@/src/ui/theme';

const EFFORT_LADDER_ORDER: readonly string[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

const REASONING_EFFORT_LABEL: Readonly<Record<string, string>> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'xHigh',
  max: 'Max',
};

const REASONING_EFFORT_TRADEOFF: Readonly<Record<string, string>> = {
  none: 'Answers straight away. Cheapest, weakest on hard problems.',
  minimal: 'Barely pauses to think. Best for quick lookups and rewrites.',
  low: 'A short think. Faster and cheaper than the default.',
  medium: 'Balanced thinking time for everyday work.',
  high: 'Thinks longer. Better on tricky reasoning, slower and pricier.',
  xhigh: 'Thinks much longer. Use when accuracy matters more than the wait.',
  max: 'Thinks as long as it can. Slowest and most expensive.',
};

function sortEffortLadder(efforts: readonly string[]): PickerEffort[] {
  return [...efforts]
    .sort((a, b) => EFFORT_LADDER_ORDER.indexOf(a) - EFFORT_LADDER_ORDER.indexOf(b))
    .map((effort) => effort as PickerEffort);
}

function groupBySurface(
  models: ModelDef[],
): Array<{ sectionId: string; sectionLabel: string; models: ModelDef[] }> {
  const local = models.filter((model) => model.surface === 'local');
  const cloud = models.filter((model) => model.surface === 'cloud_managed');
  const sections: Array<{ sectionId: string; sectionLabel: string; models: ModelDef[] }> = [];

  if (local.length > 0)
    sections.push({ sectionId: 'local', sectionLabel: 'On device', models: local });

  const byProvider = new Map<string, { label: string; models: ModelDef[] }>();
  for (const model of cloud) {
    const entry = byProvider.get(model.provider) ?? { label: model.providerLabel, models: [] };
    entry.models.push(model);
    byProvider.set(model.provider, entry);
  }
  for (const [providerId, entry] of byProvider) {
    const available = entry.models.filter((m) => m.availability !== 'locked');
    const locked = entry.models.filter((m) => m.availability === 'locked');
    sections.push({
      sectionId: `cloud-${providerId}`,
      sectionLabel: entry.label,
      models: [...available, ...locked],
    });
  }
  return sections;
}

function AutoModeRow({
  mode,
  selected,
  onPress,
}: {
  mode: AutoModeDef;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${mode.name}: ${mode.description}`}
      accessibilityState={{ selected }}
      style={{
        minHeight: 62,
        paddingHorizontal: 16,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: selected ? colors.accentSurface : colors.transparent,
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? colors.accentSurface : colors.surfaceHover,
        }}
      >
        <Cpu size={17} color={selected ? colors.teal : colors.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: selected ? colors.teal : colors.textPrimary,
            fontSize: 15,
            fontWeight: '700',
          }}
        >
          {mode.name}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
          {mode.description}
        </Text>
      </View>
      {selected ? <Check size={17} color={colors.teal} /> : null}
    </Pressable>
  );
}

interface ModelPickerSheetProps {
  sheetRef: React.RefObject<BottomSheet | null>;
  openSignal?: number;
  onSelect?: (modelId: string) => void;
  onOpenCloudAccess?: (defaultTab?: 'invite' | 'waitlist') => void;
  modelScope?: 'local' | 'cloud' | 'all';
  conversationId?: string;
}

export function ModelPickerSheet({
  sheetRef,
  openSignal,
  onSelect,
  onOpenCloudAccess,
  modelScope = 'local',
  conversationId,
}: ModelPickerSheetProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const snapPoints = useMemo(() => ['58%', '90%'], []);

  const selectedModel = useModelStore((s) => s.selectedModel);
  const favorites = useModelStore((s) => s.favorites);
  const thinkingEnabledPerModel = useModelStore((s) => s.thinkingEnabledPerModel);
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const subscriptionTier = useTierStore((s) => s.tier);
  const setModel = useModelStore((s) => s.setModel);
  const toggleFavorite = useModelStore((s) => s.toggleFavorite);
  const toggleThinkingForModel = useModelStore((s) => s.toggleThinkingForModel);
  const installJobs = useModelInstallStore((s) => s.jobs);
  const installedModelIds = useModelInstallStore((s) => s.installedModelIds);
  const readySystemModelIds = useModelInstallStore((s) => s.readySystemModelIds);
  const hydrateInstalledModels = useModelInstallStore((s) => s.hydrateInstalledModels);
  const prepareModel = useModelInstallStore((s) => s.prepareModel);
  const statusForModel = useModelInstallStore((s) => s.statusForModel);

  const [search, setSearch] = useState('');
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const selectedEffort = useAgentControlStore((s) =>
    conversationId
      ? s.resolve(conversationId, null).effort
      : (s.byProject.__default__?.effort ?? 'medium'),
  );
  const handleSelectEffort = useCallback(
    (effort: PickerEffort) => {
      if (conversationId) {
        useAgentControlStore.getState().setEffort(conversationId, effort);
      } else {
        useAgentControlStore.getState().setProjectDefault('__default__', { effort });
      }
    },
    [conversationId],
  );
  const completeModelList = useMemo(
    () => getModelListForCloudAccess(cloudUnlocked, subscriptionTier),
    [cloudUnlocked, subscriptionTier],
  );

  const selectedReasoning = useMemo(() => getModelReasoning(selectedModel), [selectedModel]);
  const effortOptions = useMemo(
    () => sortEffortLadder(selectedReasoning.supportedEfforts ?? []),
    [selectedReasoning],
  );
  const selectedSupportsReasoning =
    selectedReasoning.capable &&
    selectedReasoning.control === 'effort_levels' &&
    effortOptions.length > 0;
  const selectedRequiresReasoning =
    selectedReasoning.capable && selectedReasoning.canDisableThinking === false;
  const showEffortControl = modelScope === 'cloud' && selectedSupportsReasoning;

  useEffect(() => {
    if (!showEffortControl) return;
    if (effortOptions.includes(selectedEffort)) return;
    const fallback = effortOptions.includes(selectedReasoning.defaultEffort as PickerEffort)
      ? (selectedReasoning.defaultEffort as PickerEffort)
      : effortOptions[0];
    if (fallback) handleSelectEffort(fallback);
  }, [showEffortControl, effortOptions, selectedEffort, selectedReasoning, handleSelectEffort]);
  const modelList = useMemo(() => {
    if (modelScope === 'local') {
      return completeModelList.filter((model) => model.surface === 'local');
    }
    if (modelScope === 'cloud') {
      return completeModelList.filter((model) => model.surface === 'cloud_managed');
    }
    return completeModelList;
  }, [completeModelList, modelScope]);

  useEffect(() => {
    void hydrateInstalledModels();
  }, [hydrateInstalledModels]);

  useEffect(() => {
    if (!openSignal) return;
    requestAnimationFrame(() => {
      sheetRef.current?.snapToIndex(0);
    });
  }, [openSignal, sheetRef]);

  const query = search.trim().toLowerCase();
  const filteredModels = useMemo(() => {
    if (!query) return modelList;
    return modelList.filter(
      (model) =>
        model.name.toLowerCase().includes(query) ||
        model.provider.toLowerCase().includes(query) ||
        model.providerLabel.toLowerCase().includes(query) ||
        model.runtimeLabel.toLowerCase().includes(query) ||
        model.id.toLowerCase().includes(query),
    );
  }, [modelList, query]);

  const favoriteModels = useMemo(
    () => filteredModels.filter((model) => favorites.includes(model.id)),
    [favorites, filteredModels],
  );

  const nonFavoriteModels = useMemo(() => {
    if (favoriteModels.length === 0) return filteredModels;
    const favoriteIds = new Set(favorites);
    return filteredModels.filter((model) => !favoriteIds.has(model.id));
  }, [favoriteModels, favorites, filteredModels]);

  const groupedModels = useMemo(() => groupBySurface(nonFavoriteModels), [nonFavoriteModels]);

  const selectAndClose = useCallback(
    (id: string) => {
      setExpandedModelId(null);
      if (onSelect) onSelect(id);
      else setModel(id);
      sheetRef.current?.close();
    },
    [onSelect, setModel, sheetRef],
  );

  const openInvite = useCallback(() => {
    sheetRef.current?.close();
    requestAnimationFrame(() => {
      if (onOpenCloudAccess) {
        onOpenCloudAccess('invite');
        return;
      }
      router.push('/(auth)/login' as Parameters<typeof router.push>[0]);
    });
  }, [onOpenCloudAccess, router, sheetRef]);

  const openUpgrade = useCallback(() => {
    sheetRef.current?.close();
    requestAnimationFrame(() => {
      router.push('/(app)/settings/cloud-billing' as Parameters<typeof router.push>[0]);
    });
  }, [router, sheetRef]);

  const handleSelectModel = useCallback(
    (id: string) => {
      const chosenModel = getModelByIdForCloudAccess(id, cloudUnlocked, subscriptionTier);
      if (!chosenModel) return;
      if (chosenModel.availability === 'locked') {
        if (chosenModel.lockReason === CLOUD_LOCK_REASON) {
          openInvite();
        } else {
          openUpgrade();
        }
        return;
      }

      const installStatus = statusForModel(chosenModel);
      if (installStatus.status === 'downloading' || installStatus.status === 'unavailable') return;

      if (installStatus.status === 'download_required' || installStatus.status === 'failed') {
        void prepareModel(chosenModel)
          .then(() => selectAndClose(id))
          .catch(() => undefined);
        return;
      }

      if (id === selectedModel && !isAutoMode(id)) {
        if (chosenModel.surface === 'cloud_managed' && chosenModel.supportsThinking) {
          setExpandedModelId((prev) => (prev === id ? null : id));
          return;
        }
        sheetRef.current?.close();
        return;
      }

      selectAndClose(id);
    },
    [
      cloudUnlocked,
      subscriptionTier,
      openInvite,
      openUpgrade,
      prepareModel,
      selectAndClose,
      selectedModel,
      sheetRef,
      statusForModel,
    ],
  );

  const handleSelectAutoMode = useCallback(
    (id: string) => {
      setExpandedModelId(null);
      if (onSelect) onSelect(id);
      else setModel(id);
      sheetRef.current?.close();
    },
    [onSelect, setModel, sheetRef],
  );

  const clearSearch = useCallback(() => {
    setSearch('');
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.54}
        pressBehavior="close"
      />
    ),
    [],
  );

  const renderModelRow = useCallback(
    (model: ModelDef, keyPrefix: string) => {
      const installStatus =
        installJobs[model.id] ??
        (installedModelIds.includes(model.id) || readySystemModelIds.includes(model.id)
          ? { status: 'ready' as const, progress: 1 }
          : statusForModel(model));

      return (
        <ModelRow
          key={`${keyPrefix}-${model.id}`}
          model={model}
          isSelected={selectedModel === model.id}
          isFavorite={favorites.includes(model.id)}
          isExpanded={expandedModelId === model.id && selectedModel === model.id}
          thinkingEnabled={thinkingEnabledPerModel[model.id] ?? false}
          installStatus={installStatus}
          onSelect={handleSelectModel}
          onLockedPress={model.lockReason === CLOUD_LOCK_REASON ? openInvite : openUpgrade}
          onToggleFavorite={toggleFavorite}
          onToggleThinking={toggleThinkingForModel}
        />
      );
    },
    [
      expandedModelId,
      favorites,
      handleSelectModel,
      installJobs,
      installedModelIds,
      openInvite,
      openUpgrade,
      readySystemModelIds,
      selectedModel,
      statusForModel,
      thinkingEnabledPerModel,
      toggleFavorite,
      toggleThinkingForModel,
    ],
  );

  return (
    <>
      <BottomSheet
        ref={sheetRef as React.RefObject<BottomSheet>}
        index={-1}
        accessible={false}
        snapPoints={snapPoints}
        enablePanDownToClose
        enableDynamicSizing={false}
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backdropComponent={renderBackdrop}
        backgroundStyle={{
          backgroundColor: colors.background,
          borderTopLeftRadius: sheetRadius,
          borderTopRightRadius: sheetRadius,
        }}
        handleIndicatorStyle={{ backgroundColor: colors.textMuted, width: 36 }}
      >
        <View style={{ paddingHorizontal: 16, paddingBottom: 12, paddingTop: 2 }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <View style={{ width: 32 }} />
            <Text
              style={{
                color: colors.textPrimary,
                fontSize: 17,
                fontWeight: '600',
                flex: 1,
                textAlign: 'center',
              }}
            >
              Models
            </Text>
            <Pressable
              onPress={() => sheetRef.current?.close()}
              testID="model-picker-close"
              accessible
              accessibilityLabel="Close model picker"
              accessibilityRole="button"
              hitSlop={8}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surfaceElevated,
              }}
            >
              <XIcon size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
            {modelScope === 'cloud'
              ? 'AGI Cloud models are managed separately from Local Mode.'
              : modelScope === 'all'
                ? 'Local and AGI Cloud models are shown in separate groups.'
                : 'Local models run on this device. AGI Cloud is managed separately.'}
          </Text>
        </View>

        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 12,
            minHeight: 48,
            borderRadius: 24,
            paddingHorizontal: 13,
            paddingVertical: 6,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Search size={16} color={colors.textMuted} />
          <BottomSheetTextInput
            testID="model-picker-search-input"
            accessible
            accessibilityRole="search"
            style={{
              flex: 1,
              minHeight: 32,
              color: colors.textPrimary,
              fontSize: 16,
              lineHeight: 21,
              letterSpacing: 0,
              paddingTop: 0,
              paddingBottom: 0,
            }}
            placeholder="Search models…"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            selectionColor={colors.teal}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search models"
            accessibilityHint="Filters the model list"
            accessibilityValue={{ text: search }}
          />
          {search.length > 0 ? (
            <Pressable onPress={clearSearch} accessibilityLabel="Clear search" hitSlop={8}>
              <XIcon size={14} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {showEffortControl ? (
          <View
            testID="model-picker-effort-selector"
            style={{
              marginHorizontal: 16,
              marginBottom: 12,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceElevated,
              paddingHorizontal: 6,
              paddingVertical: 6,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 8,
                paddingBottom: 4,
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>
                Effort
              </Text>
              {selectedRequiresReasoning ? (
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>Always on</Text>
              ) : null}
            </View>
            {effortOptions.map((effort) => {
              const label = REASONING_EFFORT_LABEL[effort] ?? effort;
              const tradeoff = REASONING_EFFORT_TRADEOFF[effort];
              const active = effort === selectedEffort;
              return (
                <Pressable
                  key={effort}
                  testID={`model-picker-effort-${effort}`}
                  onPress={() => handleSelectEffort(effort)}
                  accessibilityRole="button"
                  accessibilityLabel={`Reasoning effort ${label}`}
                  accessibilityHint={tradeoff}
                  accessibilityState={{ selected: active }}
                >
                  {({ pressed }) => (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        minHeight: 44,
                        paddingHorizontal: 8,
                        paddingVertical: 6,
                        borderRadius: 12,
                        backgroundColor: active
                          ? colors.accentSurface
                          : pressed
                            ? colors.surfaceHover
                            : colors.transparent,
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            color: active ? colors.teal : colors.textPrimary,
                            fontSize: 14,
                            fontWeight: active ? '600' : '500',
                          }}
                        >
                          {label}
                        </Text>
                        {tradeoff ? (
                          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                            {tradeoff}
                          </Text>
                        ) : null}
                      </View>
                      {active ? <Check size={16} color={colors.teal} /> : null}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <BottomSheetScrollView
          testID="model-picker-sheet"
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {!query ? (
            <View style={{ marginBottom: 8 }}>
              {AUTO_MODES.map((mode) => (
                <AutoModeRow
                  key={mode.id}
                  mode={mode}
                  selected={selectedModel === mode.id}
                  onPress={() => handleSelectAutoMode(mode.id)}
                />
              ))}
            </View>
          ) : null}

          {favoriteModels.length > 0 ? (
            <View style={{ marginBottom: 6 }}>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 12,
                  fontWeight: '700',
                  paddingHorizontal: 16,
                  paddingVertical: 6,
                }}
              >
                Favorites
              </Text>
              {favoriteModels.map((model) => renderModelRow(model, 'fav'))}
            </View>
          ) : null}

          {query ? (
            <View>{nonFavoriteModels.map((model) => renderModelRow(model, 'search'))}</View>
          ) : (
            groupedModels.map(({ sectionId, sectionLabel, models }) => (
              <View key={sectionId} style={{ marginBottom: 6 }}>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: 12,
                    fontWeight: '700',
                    paddingHorizontal: 16,
                    paddingVertical: 6,
                  }}
                >
                  {sectionLabel}
                </Text>
                {models.map((model) => renderModelRow(model, `grp-${sectionId}`))}
              </View>
            ))
          )}

          {filteredModels.length === 0 ? (
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 44,
                paddingHorizontal: 28,
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center' }}>
                No models matching “{search}”
              </Text>
            </View>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheet>
    </>
  );
}
