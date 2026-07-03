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
import {
  AUTO_MODES,
  getModelByIdForCloudAccess,
  getModelListForCloudAccess,
  isAutoMode,
  type AutoModeDef,
  type ModelDef,
} from '@/src/features/model-picker/service';
import { useThemeColors } from '@/src/ui/theme';

function groupBySurface(
  models: ModelDef[],
): Array<{ sectionId: string; sectionLabel: string; models: ModelDef[] }> {
  const local = models.filter((model) => model.surface === 'local');
  const cloud = models.filter((model) => model.surface === 'cloud_managed');
  const sections: Array<{ sectionId: string; sectionLabel: string; models: ModelDef[] }> = [];

  if (local.length > 0)
    sections.push({ sectionId: 'local', sectionLabel: 'On device', models: local });
  if (cloud.length > 0) sections.push({ sectionId: 'cloud', sectionLabel: 'Cloud', models: cloud });
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
}

export function ModelPickerSheet({
  sheetRef,
  openSignal,
  onSelect,
  onOpenCloudAccess,
  modelScope = 'local',
}: ModelPickerSheetProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const snapPoints = useMemo(() => ['58%', '90%'], []);

  const selectedModel = useModelStore((s) => s.selectedModel);
  const favorites = useModelStore((s) => s.favorites);
  const thinkingEnabledPerModel = useModelStore((s) => s.thinkingEnabledPerModel);
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
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
  const completeModelList = useMemo(
    () => getModelListForCloudAccess(cloudUnlocked),
    [cloudUnlocked],
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

  const handleSelectModel = useCallback(
    (id: string) => {
      const chosenModel = getModelByIdForCloudAccess(id, cloudUnlocked);
      if (!chosenModel) return;
      if (chosenModel.availability === 'locked') {
        openInvite();
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
        sheetRef.current?.close();
        return;
      }

      selectAndClose(id);
    },
    [
      cloudUnlocked,
      openInvite,
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
          onLockedPress={openInvite}
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
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: colors.textMuted, width: 36 }}
      >
        <View style={{ paddingHorizontal: 16, paddingBottom: 12, paddingTop: 2 }}>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: '700' }}>
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
                borderWidth: 1,
                borderColor: colors.border,
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
