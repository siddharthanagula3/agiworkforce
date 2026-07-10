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
import { useAgentControlStore } from '@/stores/agentControlStore';
import { EFFORT_LABEL, type Effort } from '@agiworkforce/types';
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

// Full UI effort axis, filtered per provider capability: OpenAI has no 'max'
// effort (OPENAI_REASONING_EFFORT in @agiworkforce/types); everyone else
// exposes the complete spectrum.
const FULL_EFFORT_OPTIONS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

function effortOptionsForProvider(providerId: string | undefined): readonly Effort[] {
  if (providerId === 'openai') return ['low', 'medium', 'high', 'xhigh'];
  return FULL_EFFORT_OPTIONS;
}

function groupBySurface(
  models: ModelDef[],
): Array<{ sectionId: string; sectionLabel: string; models: ModelDef[] }> {
  const local = models.filter((model) => model.surface === 'local');
  const cloud = models.filter((model) => model.surface === 'cloud_managed');
  const sections: Array<{ sectionId: string; sectionLabel: string; models: ModelDef[] }> = [];

  if (local.length > 0)
    sections.push({ sectionId: 'local', sectionLabel: 'On device', models: local });

  // Cloud models group by provider (OpenAI, Anthropic, Google, …) with
  // available rows sorted before locked upsell rows within each provider.
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
  /**
   * When set, the reasoning-effort selector writes a per-conversation override
   * via agentControlStore; otherwise it updates the '__default__' project
   * default that chatExecutionStore resolves for conversations without one.
   */
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
  // Effort is independent of model choice: selecting it must not change the
  // selected model or close the sheet. Resolution mirrors chatExecutionStore
  // (conversation override > '__default__' project default > 'medium').
  const selectedEffort = useAgentControlStore((s) =>
    conversationId
      ? s.resolve(conversationId, null).effort
      : (s.byProject.__default__?.effort ?? 'medium'),
  );
  const handleSelectEffort = useCallback(
    (effort: Effort) => {
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

  // Reasoning controls are capability-driven: only reasoning-capable models
  // (capabilities.thinking in the shared catalog) show the effort selector,
  // and the level set is filtered per provider. Auto modes route to capable
  // models server-side, so they keep the full default axis.
  const selectedModelDef = useMemo(
    () => getModelByIdForCloudAccess(selectedModel, cloudUnlocked),
    [selectedModel, cloudUnlocked],
  );
  const selectedSupportsReasoning =
    isAutoMode(selectedModel) || !!selectedModelDef?.supportsThinking;
  const effortOptions = useMemo(
    () =>
      effortOptionsForProvider(isAutoMode(selectedModel) ? undefined : selectedModelDef?.provider),
    [selectedModel, selectedModelDef],
  );
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

  // PUBLIC ALPHA (founder 2026-06-27, PA-2): managed cloud is open by default — the
  // signed-in entitlement IS the gate, no invite/waitlist. Callers may still supply
  // onOpenCloudAccess for screen-specific handling; otherwise route to sign-in
  // directly, matching chat.tsx / chat/[id].tsx / models.tsx (fix 0fe0598c3).
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

  // A model can be locked for two different reasons: not signed in / cloud not
  // unlocked (→ sign-in), or signed in but the subscription tier doesn't cover
  // this model (→ upgrade). Route each to its own destination instead of always
  // sending a Pro user who tapped a Max-only model to the sign-in screen.
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
        // Re-tapping the already-selected cloud model toggles its options row
        // (the per-model "With thinking" switch) instead of closing the sheet —
        // this is the only way the thinking toggle is reachable.
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
        snapPoints={snapPoints}
        enablePanDownToClose
        enableDynamicSizing={false}
        // Keyboard avoidance for the search input: extend the sheet above the
        // keyboard while typing and restore it (blurring the input) on drag,
        // so the effort selector and model list stay reachable.
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
            placeholder="Search models"
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

        {modelScope === 'cloud' && selectedSupportsReasoning ? (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>
              Reasoning effort
            </Text>
            <View
              testID="model-picker-effort-selector"
              style={{
                flex: 1,
                flexDirection: 'row',
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surfaceElevated,
                padding: 2,
                gap: 2,
              }}
            >
              {effortOptions.map((effort) => {
                const selected = selectedEffort === effort;
                return (
                  <Pressable
                    key={effort}
                    onPress={() => handleSelectEffort(effort)}
                    accessibilityRole="button"
                    accessibilityLabel={`Reasoning effort ${EFFORT_LABEL[effort]}`}
                    accessibilityState={{ selected }}
                    style={{
                      flex: 1,
                      minHeight: 30,
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected ? colors.accentSurface : colors.transparent,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? colors.teal : colors.textSecondary,
                        fontSize: 13,
                        fontWeight: '600',
                      }}
                    >
                      {EFFORT_LABEL[effort]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <BottomSheetScrollView
          testID="model-picker-sheet"
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {!query && modelScope !== 'cloud' ? (
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
                No models matching "{search}"
              </Text>
            </View>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheet>
    </>
  );
}
