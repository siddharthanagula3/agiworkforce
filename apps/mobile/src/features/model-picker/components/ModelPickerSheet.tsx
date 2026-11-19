import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import React, { Children, isValidElement, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Check, ChevronDown, ChevronUp, Cpu, Search, X as XIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { ModelRow } from './ModelRow';
import { SpeedControl } from './SpeedControl';
import {
  EffortSlider,
  effortStepsFor,
  effortStepsForModel,
  resolveEffortStep,
  useScopedEffort,
} from './EffortSlider';
import { ModelFilterChips } from './ModelFilterChips';
import { useModelStore } from '@/src/features/model-picker/store';
import { useFreeQuotaCatalogueStore } from '@/src/features/model-picker/freeQuotaCatalogue';
import { isCloudAccountEpochCurrent } from '@/src/features/auth/services/cloudAccountSession';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import { useModelInstallStore } from '@/src/features/model-picker/installStore';
import { claimModelSelection } from '@/src/features/model-picker/selectionIntent';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useTierStore } from '@/src/features/billing/store';
import { NATIVE_PURCHASES_AVAILABLE } from '@/src/features/billing/nativePurchaseAvailability';
import {
  EFFORT_LABEL,
  ROUTING_PROFILE_CHOICE_OPTIONS,
  canAccessAutoRoutingProfileForTier,
  getModelFamilySlotForModel,
  getModelReasoning,
  type Effort,
} from '@agiworkforce/types';
import {
  AUTO_MODES,
  CLOUD_LOCK_REASON,
  DEFAULT_AUTO_MODE_ID,
  getModelByIdForCloudAccess,
  getModelListForCloudAccess,
  isAutoMode,
  type AutoModeDef,
  type ModelDef,
} from '@/src/features/model-picker/service';
import { guardProviderSwitch } from '@/src/features/model-picker/tierGuard';
import { groupByModelLine, leadModelOf } from '@/src/features/model-picker/modelLines';
import { matchesModelFilters, type ModelFilterId } from '@/src/features/model-picker/modelFilters';
import { getConversationMessageStore } from '@/stores/chat/conversationRepository';
import { useThemeColors, sheetRadius } from '@/src/ui/theme';
import { radii, typeScale } from '@/src/ui/theme/tokens';

function establishedCloudModel(
  conversationId: string,
  cloudUnlocked: boolean,
  subscriptionTier: string,
): ModelDef | undefined {
  const messages =
    getConversationMessageStore(conversationId).getState().messages[conversationId] ?? [];
  const answered = [...messages].reverse().find((message) => message.role === 'assistant');
  if (!answered?.model || isAutoMode(answered.model)) return undefined;
  const model = getModelByIdForCloudAccess(answered.model, cloudUnlocked, subscriptionTier);
  return model?.surface === 'cloud_managed' ? model : undefined;
}

const AUTO_ROUTING_PROFILE_OPTION = ROUTING_PROFILE_CHOICE_OPTIONS.find(
  (option) => option.choice === 'auto',
);

function byModelFamily(models: ModelDef[]): ModelDef[] {
  const firstIndex = new Map<string, number>();
  models.forEach((model, index) => {
    const family = getModelFamilySlotForModel(model.id) ?? model.id;
    if (!firstIndex.has(family)) firstIndex.set(family, index);
  });
  return models
    .map((model, index) => ({ model, index }))
    .sort((left, right) => {
      const leftFamily = getModelFamilySlotForModel(left.model.id) ?? left.model.id;
      const rightFamily = getModelFamilySlotForModel(right.model.id) ?? right.model.id;
      return (
        (firstIndex.get(leftFamily) ?? 0) - (firstIndex.get(rightFamily) ?? 0) ||
        left.index - right.index
      );
    })
    .map(({ model }) => model);
}

function availableFirst(models: ModelDef[]): ModelDef[] {
  return [
    ...byModelFamily(models.filter((model) => model.availability !== 'locked')),
    ...byModelFamily(models.filter((model) => model.availability === 'locked')),
  ];
}

function ModelGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  const colors = useThemeColors();
  const rows = Children.toArray(children);
  if (rows.length === 0) return null;

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 14 }}>
      {title ? (
        <Text
          accessibilityRole="header"
          style={{
            color: colors.textMuted,
            fontSize: typeScale.caption,
            fontWeight: '700',
            paddingHorizontal: 4,
            marginBottom: 6,
          }}
        >
          {title}
        </Text>
      ) : null}
      <View
        style={{
          borderRadius: radii.xl,
          backgroundColor: colors.neutralSurface,
          overflow: 'hidden',
        }}
      >
        {rows.map((row, index) => (
          <View
            key={isValidElement(row) && row.key !== null ? row.key : index}
            style={
              index > 0
                ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.neutralBorder }
                : undefined
            }
          >
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

function LineDisclosure({
  testID,
  accessibilityLabel,
  expanded,
  onPress,
}: {
  testID: string;
  accessibilityLabel: string;
  expanded: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const Disclosure = expanded ? ChevronUp : ChevronDown;
  return (
    <PressableBox
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded }}
      style={{ width: 48, minHeight: 52, alignItems: 'center', justifyContent: 'center' }}
    >
      <Disclosure size={18} color={colors.textMuted} />
    </PressableBox>
  );
}

function AutoModeRow({
  mode,
  description,
  selected,
  onPress,
}: {
  mode: AutoModeDef;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <PressableBox
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${mode.name}: ${description}`}
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
            fontSize: typeScale.body,
            fontWeight: '700',
          }}
        >
          {mode.name}
        </Text>
        <Text
          style={{ color: colors.textMuted, fontSize: typeScale.caption, marginTop: 2 }}
          numberOfLines={2}
        >
          {description}
        </Text>
      </View>
      {selected ? <Check size={17} color={colors.teal} /> : null}
    </PressableBox>
  );
}

interface ModelPickerSheetProps {
  sheetRef: React.RefObject<BottomSheet | null>;
  openSignal?: number;
  onSelect?: (modelId: string) => void;
  selectedModelId?: string;
  onOpenCloudAccess?: (defaultTab?: 'invite' | 'waitlist') => void;
  modelScope?: 'local' | 'cloud' | 'all';
  conversationId?: string;
  showSpeed?: boolean;
  showEffort?: boolean;
}

export function ModelPickerSheet({
  sheetRef,
  openSignal,
  onSelect,
  selectedModelId,
  onOpenCloudAccess,
  modelScope = 'local',
  conversationId,
  showSpeed = true,
  showEffort = true,
}: ModelPickerSheetProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const snapPoints = useMemo(() => ['58%', '90%'], []);

  const selectedModel = useModelStore((s) => s.selectedModel);
  const rowSelectedModel = selectedModelId ?? selectedModel;
  const favorites = useModelStore((s) => s.favorites);
  const recentModels = useModelStore((s) => s.recentModels);
  const thinkingEnabledPerModel = useModelStore((s) => s.thinkingEnabledPerModel);
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const freeQuotaCatalogue = useFreeQuotaCatalogueStore((s) => s.catalogue);
  const freeQuotaAccount = useFreeQuotaCatalogueStore((s) => s.account);
  const freeQuotaLoading = useFreeQuotaCatalogueStore((s) => s.loading);
  const freeQuotaError = useFreeQuotaCatalogueStore((s) => s.error);
  const refreshFreeQuotaCatalogue = useFreeQuotaCatalogueStore((s) => s.refresh);
  const subscriptionTier = useTierStore((s) => s.tier);
  const showsFreeCatalogue = cloudUnlocked && modelScope !== 'local' && subscriptionTier === 'free';
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
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<ModelFilterId[]>([]);
  const [selectedEffort, handleSelectEffort] = useScopedEffort(conversationId);
  const completeModelList = useMemo(
    () => getModelListForCloudAccess(cloudUnlocked, subscriptionTier, freeQuotaCatalogue),
    [cloudUnlocked, subscriptionTier, freeQuotaCatalogue],
  );
  // Auto's plan floor is a managed cloud rule: on-device routing costs nothing,
  // so the local picker offers Auto on every plan.
  const selectableAutoModes = useMemo(
    () =>
      modelScope === 'local'
        ? AUTO_MODES
        : AUTO_MODES.filter((mode) =>
            canAccessAutoRoutingProfileForTier(mode.id, subscriptionTier),
          ),
    [modelScope, subscriptionTier],
  );
  const offersFilters = modelScope !== 'local';
  const filtering = offersFilters && activeFilters.length > 0;
  const everydayTier = AUTO_MODES.find((mode) => mode.id === DEFAULT_AUTO_MODE_ID)?.tier;

  const selectedReasoning = useMemo(() => getModelReasoning(selectedModel), [selectedModel]);
  const effortOptions = useMemo(() => effortStepsFor(selectedReasoning), [selectedReasoning]);
  const selectedSupportsReasoning = effortOptions.length > 0;
  const selectedRequiresReasoning =
    selectedReasoning.capable && selectedReasoning.canDisableThinking === false;
  const showEffortControl = showEffort && modelScope === 'cloud' && selectedSupportsReasoning;

  useEffect(() => {
    if (!showEffortControl) return;
    if (effortOptions.includes(selectedEffort)) return;
    const fallback = resolveEffortStep(effortOptions, selectedEffort, selectedReasoning);
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

  // Reading what is installed is async, so the list would otherwise render with
  // every on-device model marked "download required" and then correct itself.
  const [readingInstalled, setReadingInstalled] = useState(true);
  useEffect(() => {
    let active = true;
    setReadingInstalled(true);
    void hydrateInstalledModels().finally(() => {
      if (active) setReadingInstalled(false);
    });
    return () => {
      active = false;
    };
  }, [hydrateInstalledModels]);

  useEffect(() => {
    if (!openSignal) return;
    if (cloudUnlocked && modelScope !== 'local') void refreshFreeQuotaCatalogue();
    requestAnimationFrame(() => {
      sheetRef.current?.snapToIndex(0);
    });
  }, [cloudUnlocked, modelScope, openSignal, refreshFreeQuotaCatalogue, sheetRef]);

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

  // Recency order comes from the store, not from the catalogue, so the row is
  // built by walking `recentModels` rather than filtering the model list. Cloud
  // models are reached through their line, so only on-device ones are listed.
  const recentModelDefs = useMemo(() => {
    if (query) return [];
    const byId = new Map(
      filteredModels.filter((model) => model.surface === 'local').map((model) => [model.id, model]),
    );
    return recentModels
      .map((id) => byId.get(id))
      .filter((model): model is ModelDef => model !== undefined);
  }, [filteredModels, query, recentModels]);

  const favoriteModels = useMemo(
    () => filteredModels.filter((model) => favorites.includes(model.id)),
    [favorites, filteredModels],
  );

  const nonFavoriteModels = useMemo(() => {
    const pinnedIds = new Set([...favorites, ...recentModelDefs.map((model) => model.id)]);
    if (pinnedIds.size === 0) return filteredModels;
    return filteredModels.filter((model) => !pinnedIds.has(model.id));
  }, [favorites, filteredModels, recentModelDefs]);

  const onDeviceModels = useMemo(
    () => nonFavoriteModels.filter((model) => model.surface === 'local'),
    [nonFavoriteModels],
  );

  const modelLines = useMemo(
    () =>
      groupByModelLine(
        availableFirst(filteredModels.filter((model) => model.surface === 'cloud_managed')),
      ),
    [filteredModels],
  );

  const matchingModels = useMemo(
    () =>
      filtering
        ? availableFirst(
            filteredModels.filter(
              (model) =>
                model.surface === 'cloud_managed' && matchesModelFilters(model, activeFilters),
            ),
          )
        : [],
    [activeFilters, filteredModels, filtering],
  );

  const selectAndClose = useCallback(
    (id: string) => {
      claimModelSelection();
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
      router.push(beginCloudPostAuthIntent());
    });
  }, [onOpenCloudAccess, router, sheetRef]);

  const openUpgrade = useCallback(() => {
    if (!NATIVE_PURCHASES_AVAILABLE) return;
    sheetRef.current?.close();
    requestAnimationFrame(() => {
      router.push('/(app)/settings/cloud-billing' as Parameters<typeof router.push>[0]);
    });
  }, [router, sheetRef]);

  const handleSelectModel = useCallback(
    (id: string, effort?: Effort) => {
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

      const establishedModel =
        chosenModel.surface === 'cloud_managed' && conversationId
          ? establishedCloudModel(conversationId, cloudUnlocked, subscriptionTier)
          : undefined;
      if (
        establishedModel &&
        guardProviderSwitch(establishedModel.provider, chosenModel.provider, subscriptionTier) ===
          'upgrade-required'
      ) {
        Alert.alert(
          'Start a new chat for this model',
          NATIVE_PURCHASES_AVAILABLE
            ? `Switching from ${establishedModel.providerLabel} to ${chosenModel.providerLabel} mid-chat needs the Max plan.`
            : `Switching from ${establishedModel.providerLabel} to ${chosenModel.providerLabel} mid-chat isn't included in your plan. Start a new chat to use ${chosenModel.providerLabel}.`,
          NATIVE_PURCHASES_AVAILABLE
            ? [
                { text: 'OK', style: 'cancel' },
                { text: 'See plans', onPress: openUpgrade },
              ]
            : [{ text: 'OK', style: 'cancel' }],
        );
        return;
      }

      const installStatus = statusForModel(chosenModel);
      if (installStatus.status === 'downloading' || installStatus.status === 'unavailable') return;

      if (installStatus.status === 'download_required' || installStatus.status === 'failed') {
        const stillWanted = claimModelSelection();
        void prepareModel(chosenModel)
          .then(() => {
            if (stillWanted()) selectAndClose(id);
          })
          .catch(() => undefined);
        return;
      }

      if (id === rowSelectedModel && !isAutoMode(id)) {
        claimModelSelection();
        if (effort) {
          handleSelectEffort(effort);
          sheetRef.current?.close();
          return;
        }
        if (chosenModel.surface === 'cloud_managed' && chosenModel.supportsThinking) {
          setExpandedModelId((prev) => (prev === id ? null : id));
          return;
        }
        sheetRef.current?.close();
        return;
      }

      if (effort) handleSelectEffort(effort);
      selectAndClose(id);
    },
    [
      cloudUnlocked,
      conversationId,
      handleSelectEffort,
      subscriptionTier,
      openInvite,
      openUpgrade,
      prepareModel,
      rowSelectedModel,
      selectAndClose,
      sheetRef,
      statusForModel,
    ],
  );

  const handleSelectAutoMode = useCallback(
    (id: string) => {
      claimModelSelection();
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

  const resetView = useCallback(() => {
    setSearch('');
    setOpenLineId(null);
    setActiveFilters([]);
  }, []);

  const toggleFilter = useCallback((id: ModelFilterId) => {
    setActiveFilters((current) =>
      current.includes(id) ? current.filter((active) => active !== id) : [...current, id],
    );
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
    (
      model: ModelDef,
      keyPrefix: string,
      placement: { nested?: boolean; trailing?: React.ReactNode; effort?: Effort } = {},
    ) => {
      const installStatus =
        installJobs[model.id] ??
        (installedModelIds.includes(model.id) || readySystemModelIds.includes(model.id)
          ? { status: 'ready' as const, progress: 1 }
          : statusForModel(model));

      return (
        <ModelRow
          key={`${keyPrefix}-${model.id}`}
          model={model}
          isSelected={rowSelectedModel === model.id}
          isFavorite={favorites.includes(model.id)}
          isExpanded={expandedModelId === model.id && rowSelectedModel === model.id}
          thinkingEnabled={thinkingEnabledPerModel[model.id] ?? false}
          installStatus={installStatus}
          nested={placement.nested}
          trailing={placement.trailing}
          detail={placement.effort ? EFFORT_LABEL[placement.effort] : undefined}
          onSelect={
            placement.effort
              ? (id: string) => handleSelectModel(id, placement.effort)
              : handleSelectModel
          }
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
      rowSelectedModel,
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
        onClose={resetView}
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
                fontSize: typeScale.headline,
                fontWeight: '600',
                flex: 1,
                textAlign: 'center',
              }}
            >
              Models
            </Text>
            <PressableBox
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
            </PressableBox>
          </View>
          {showsFreeCatalogue && freeQuotaLoading ? (
            <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, marginTop: 6 }}>
              Checking provider-funded Free models…
            </Text>
          ) : null}
          {showsFreeCatalogue && freeQuotaError ? (
            <View style={{ marginTop: 6 }}>
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.caption }}>
                {freeQuotaError}
              </Text>
              <PressableBox
                onPress={() => void refreshFreeQuotaCatalogue()}
                accessibilityRole="button"
                accessibilityLabel="Retry loading provider-funded Free models"
                style={{ minHeight: 40, justifyContent: 'center' }}
              >
                <Text style={{ color: colors.teal, fontSize: typeScale.caption }}>
                  Retry Free models
                </Text>
              </PressableBox>
            </View>
          ) : null}
          {showsFreeCatalogue &&
          isCloudAccountEpochCurrent(freeQuotaAccount) &&
          !freeQuotaLoading &&
          !freeQuotaError &&
          !freeQuotaCatalogue?.models.some(
            (model) => model.category === 'chat' && model.status === 'ready',
          ) ? (
            <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, marginTop: 6 }}>
              No provider-funded Free chat models are available right now.
            </Text>
          ) : null}
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
              fontSize: typeScale.callout,
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
            <PressableBox onPress={clearSearch} accessibilityLabel="Clear search" hitSlop={15}>
              <XIcon size={14} color={colors.textMuted} />
            </PressableBox>
          ) : null}
        </View>

        {offersFilters ? <ModelFilterChips active={activeFilters} onToggle={toggleFilter} /> : null}

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
              paddingHorizontal: 10,
              paddingTop: 8,
              paddingBottom: 10,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 4,
                paddingBottom: 8,
              }}
            >
              <Text
                style={{ color: colors.textMuted, fontSize: typeScale.caption, fontWeight: '700' }}
              >
                Effort
              </Text>
              {selectedRequiresReasoning ? (
                <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                  Always on
                </Text>
              ) : null}
            </View>
            <EffortSlider
              testID="model-picker-effort"
              steps={effortOptions}
              value={effortOptions.includes(selectedEffort) ? selectedEffort : undefined}
              onChange={handleSelectEffort}
              showDescription={false}
            />
          </View>
        ) : null}

        {modelScope === 'cloud' && showSpeed ? <SpeedControl modelId={selectedModel} /> : null}

        {readingInstalled ? (
          <View
            testID="model-picker-loading"
            style={{ paddingVertical: 28, alignItems: 'center', gap: 10 }}
            accessibilityRole="progressbar"
            accessibilityLabel="Loading models"
          >
            <LoadingIndicator size="small" />
            <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
              Loading models…
            </Text>
          </View>
        ) : null}

        <BottomSheetScrollView
          testID="model-picker-sheet"
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {!query && !filtering ? (
            <ModelGroup>
              {selectableAutoModes.map((mode) => (
                <AutoModeRow
                  key={mode.id}
                  mode={mode}
                  description={
                    (modelScope === 'cloud' && mode.id === DEFAULT_AUTO_MODE_ID
                      ? AUTO_ROUTING_PROFILE_OPTION?.description
                      : undefined) ?? mode.description
                  }
                  selected={rowSelectedModel === mode.id}
                  onPress={() => handleSelectAutoMode(mode.id)}
                />
              ))}
            </ModelGroup>
          ) : null}

          {filtering ? (
            <ModelGroup>
              {matchingModels.map((model) =>
                renderModelRow(model, 'filter', {
                  effort: activeFilters.includes('instant')
                    ? effortStepsForModel(model.id)[0]
                    : undefined,
                }),
              )}
            </ModelGroup>
          ) : (
            <>
              <ModelGroup title="Recent">
                {recentModelDefs.map((model) => renderModelRow(model, 'recent'))}
              </ModelGroup>

              <ModelGroup title="Favorites">
                {favoriteModels.map((model) => renderModelRow(model, 'fav'))}
              </ModelGroup>

              {query ? (
                <ModelGroup>
                  {nonFavoriteModels.map((model) => renderModelRow(model, 'search'))}
                </ModelGroup>
              ) : (
                <>
                  <ModelGroup title="On device">
                    {onDeviceModels.map((model) => renderModelRow(model, 'local'))}
                  </ModelGroup>
                  <ModelGroup>
                    {modelLines.map((line) => {
                      const expanded = openLineId === line.id;
                      const lead = leadModelOf(line, rowSelectedModel, recentModels, everydayTier);
                      const others = line.models.filter((model) => model.id !== lead.id);
                      return (
                        <View key={line.id}>
                          {renderModelRow(lead, `line-${line.id}`, {
                            trailing:
                              others.length > 0 ? (
                                <LineDisclosure
                                  testID={`model-line-${line.id}`}
                                  accessibilityLabel={`More ${line.label} models`}
                                  expanded={expanded}
                                  onPress={() => setOpenLineId(expanded ? null : line.id)}
                                />
                              ) : undefined,
                          })}
                          {expanded
                            ? others.map((model) =>
                                renderModelRow(model, `line-${line.id}`, { nested: true }),
                              )
                            : null}
                        </View>
                      );
                    })}
                  </ModelGroup>
                </>
              )}
            </>
          )}

          {filtering && matchingModels.length === 0 ? (
            <View
              testID="model-filters-empty"
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 44,
                paddingHorizontal: 28,
              }}
            >
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: typeScale.subhead,
                  textAlign: 'center',
                }}
              >
                No models match these filters.
              </Text>
            </View>
          ) : null}

          {!filtering && filteredModels.length === 0 ? (
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 44,
                paddingHorizontal: 28,
              }}
            >
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: typeScale.subhead,
                  textAlign: 'center',
                }}
              >
                No models matching “{search}”
              </Text>
            </View>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheet>
    </>
  );
}
