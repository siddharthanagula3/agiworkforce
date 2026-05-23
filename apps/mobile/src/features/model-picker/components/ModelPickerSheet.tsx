import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, TextInput, Pressable, Switch } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Brain, Search, X as XIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { AutoModeCards } from './AutoModeCard';
import { ModelRow } from './ModelRow';
import { useModelStore } from '@/src/features/model-picker/store';
import { useModelInstallStore } from '@/src/features/model-picker/installStore';
import {
  AUTO_MODES,
  MODEL_LIST,
  isAutoMode,
  type ModelDef,
} from '@/src/features/model-picker/service';
import { colors } from '@/src/ui/theme';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupBySurface(
  models: ModelDef[],
): Array<{ sectionId: string; sectionLabel: string; models: ModelDef[] }> {
  const local = models.filter((model) => model.surface === 'local');
  const cloud = models.filter((model) => model.surface === 'cloud_managed');
  const sections: Array<{ sectionId: string; sectionLabel: string; models: ModelDef[] }> = [];

  if (local.length > 0) {
    sections.push({ sectionId: 'local', sectionLabel: 'On device', models: local });
  }
  if (cloud.length > 0) {
    sections.push({
      sectionId: 'cloud_managed',
      sectionLabel: 'Cloud Managed (locked)',
      models: cloud,
    });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ModelPickerSheetProps {
  /** Ref forwarded so the parent can open/close the sheet. */
  sheetRef: React.RefObject<BottomSheet | null>;
  /**
   * Optional override for model selection. When provided, the sheet calls this
   * instead of updating the global modelStore. Useful for forms that manage
   * their own model state (e.g. ScheduleForm).
   */
  onSelect?: (modelId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ModelPickerSheet({ sheetRef, onSelect }: ModelPickerSheetProps) {
  const snapPoints = useMemo(() => ['50%', '90%'], []);

  const selectedModel = useModelStore((s) => s.selectedModel);
  const favorites = useModelStore((s) => s.favorites);
  const thinkingEnabledPerModel = useModelStore((s) => s.thinkingEnabledPerModel);
  const thinkingModeEnabled = useModelStore((s) => s.thinkingModeEnabled);
  const setModel = useModelStore((s) => s.setModel);
  const setThinkingMode = useModelStore((s) => s.setThinkingMode);
  const toggleFavorite = useModelStore((s) => s.toggleFavorite);
  const toggleThinkingForModel = useModelStore((s) => s.toggleThinkingForModel);
  const installJobs = useModelInstallStore((s) => s.jobs);
  const installedModelIds = useModelInstallStore((s) => s.installedModelIds);
  const readySystemModelIds = useModelInstallStore((s) => s.readySystemModelIds);
  const hydrateInstalledModels = useModelInstallStore((s) => s.hydrateInstalledModels);
  const prepareModel = useModelInstallStore((s) => s.prepareModel);
  const statusForModel = useModelInstallStore((s) => s.statusForModel);

  const [search, setSearch] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const catalogModels = MODEL_LIST;

  // Track which model row is expanded to show the thinking toggle.
  // A model expands when it is already selected and tapped again.
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);

  useEffect(() => {
    void hydrateInstalledModels();
  }, [hydrateInstalledModels]);

  // Filter models by search query
  const query = search.trim().toLowerCase();
  const filteredModels = useMemo(() => {
    if (!query) return catalogModels;
    return catalogModels.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.provider.toLowerCase().includes(query) ||
        m.providerLabel.toLowerCase().includes(query) ||
        m.runtimeLabel.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query),
    );
  }, [query, catalogModels]);

  const favoriteModels = useMemo(() => {
    return filteredModels.filter((m) => m.surface === 'local' && favorites.includes(m.id));
  }, [filteredModels, favorites]);

  const nonFavoriteModels = useMemo(() => {
    if (favoriteModels.length === 0) return filteredModels;
    const favSet = new Set(favorites);
    return filteredModels.filter((m) => !favSet.has(m.id));
  }, [filteredModels, favoriteModels, favorites]);

  const groupedModels = useMemo(() => groupBySurface(nonFavoriteModels), [nonFavoriteModels]);

  const selectAndClose = useCallback(
    (id: string) => {
      setExpandedModelId(null);
      if (onSelect) {
        onSelect(id);
      } else {
        setModel(id);
      }
      sheetRef.current?.close();
    },
    [onSelect, setModel, sheetRef],
  );

  const handleSelectModel = useCallback(
    (id: string) => {
      const chosenModel = catalogModels.find((m) => m.id === id);
      if (!chosenModel || chosenModel.availability === 'locked') return;

      const installStatus = statusForModel(chosenModel);
      if (installStatus.status === 'downloading' || installStatus.status === 'unavailable') {
        return;
      }

      if (installStatus.status === 'download_required' || installStatus.status === 'failed') {
        void prepareModel(chosenModel)
          .then(() => {
            selectAndClose(id);
          })
          .catch(() => undefined);
        return;
      }

      // If tapping the already-selected model, toggle expansion (show thinking toggle).
      if (id === selectedModel && !isAutoMode(id)) {
        setExpandedModelId((prev) => (prev === id ? null : id));
        return;
      }

      selectAndClose(id);
    },
    [catalogModels, prepareModel, selectAndClose, selectedModel, statusForModel],
  );

  const handleSelectAutoMode = useCallback(
    (id: string) => {
      setExpandedModelId(null);
      if (onSelect) {
        onSelect(id);
      } else {
        setModel(id);
      }
      sheetRef.current?.close();
    },
    [onSelect, setModel, sheetRef],
  );

  const handleToggleThinking = useCallback(
    (modelId: string) => {
      toggleThinkingForModel(modelId);
    },
    [toggleThinkingForModel],
  );

  const handleToggleExtendedThinking = useCallback(() => {
    setThinkingMode(!thinkingModeEnabled);
  }, [setThinkingMode, thinkingModeEnabled]);

  const clearSearch = useCallback(() => {
    setSearch('');
    searchInputRef.current?.blur();
  }, []);

  const handleClose = useCallback(() => {
    sheetRef.current?.close();
  }, [sheetRef]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.6}
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
          onToggleFavorite={toggleFavorite}
          onToggleThinking={handleToggleThinking}
        />
      );
    },
    [
      selectedModel,
      favorites,
      expandedModelId,
      thinkingEnabledPerModel,
      installJobs,
      installedModelIds,
      readySystemModelIds,
      statusForModel,
      handleSelectModel,
      toggleFavorite,
      handleToggleThinking,
    ],
  );

  return (
    <BottomSheet
      ref={sheetRef as React.RefObject<BottomSheet>}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDynamicSizing={false}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.background }}
      handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.3)', width: 36 }}
    >
      {/* ---- Header ---- */}
      <View className="px-4 pb-3 pt-1 flex-row items-center justify-between">
        <View>
          <Text variant="subheading">Models</Text>
          <Text className="text-xs text-white/40 mt-0.5">Local LLMs are active</Text>
        </View>

        <Pressable
          onPress={handleClose}
          className="p-1.5 rounded-full bg-white/5 active:bg-white/10"
          accessibilityLabel="Close model picker"
          accessibilityRole="button"
        >
          <XIcon size={16} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* ---- Search bar ---- */}
      <View className="mx-4 mb-3 flex-row items-center gap-2 bg-surface-elevated rounded-xl border border-white/8 px-3 py-2">
        <Search size={16} color={colors.textMuted} />
        <TextInput
          ref={searchInputRef}
          className="flex-1 text-white text-sm py-0"
          placeholder="Search models..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={search}
          onChangeText={setSearch}
          selectionColor={colors.teal}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search models"
          accessibilityRole="search"
        />
        {search.length > 0 && (
          <Pressable
            onPress={clearSearch}
            className="p-0.5"
            accessibilityLabel="Clear search"
            accessibilityRole="button"
          >
            <XIcon size={14} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* ---- Scrollable content ---- */}
      <BottomSheetScrollView
        testID="model-picker-sheet"
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Auto modes (hidden when searching) */}
        {!query && (
          <AutoModeCards
            modes={AUTO_MODES}
            selectedId={selectedModel}
            onSelect={handleSelectAutoMode}
          />
        )}

        {/* Separator between auto modes and model list */}
        {!query && <View className="mx-4 mb-2 mt-1 border-b border-white/8" />}

        {/* Favorites section — always shown flat (no sub-grouping) */}
        {favoriteModels.length > 0 && (
          <View className="mb-2">
            <Text className="text-xs text-white/40 font-medium uppercase tracking-wider px-4 mb-1">
              Favorites
            </Text>
            {favoriteModels.map((model) => renderModelRow(model, 'fav'))}
          </View>
        )}

        {/* Provider-grouped model list */}
        {query ? (
          // While searching, render a flat list without section headers.
          <View>
            {favoriteModels.length > 0 && nonFavoriteModels.length > 0 && (
              <Text className="text-xs text-white/40 font-medium uppercase tracking-wider px-4 mb-1 mt-1">
                All Models
              </Text>
            )}
            {nonFavoriteModels.map((model) => renderModelRow(model, 'all'))}
          </View>
        ) : (
          // No active search → provider sections with headers.
          groupedModels.map(({ sectionId, sectionLabel, models }) => (
            <View key={sectionId} className="mb-1">
              <Text className="text-xs text-white/40 font-medium uppercase tracking-wider px-4 pt-2 pb-1">
                {sectionLabel}
              </Text>
              {models.map((model) => renderModelRow(model, `grp-${sectionId}`))}
            </View>
          ))
        )}

        {/* Extended thinking toggle — shown when not searching */}
        {!query && (
          <>
            <View className="mx-4 mt-3 mb-1 border-b border-white/8" />
            <Pressable
              onPress={handleToggleExtendedThinking}
              className="flex-row items-center px-4 py-3 gap-3 active:bg-white/5"
              accessibilityLabel="Extended thinking"
              accessibilityRole="switch"
              accessibilityState={{ checked: thinkingModeEnabled }}
              accessibilityHint="Think longer for complex tasks"
            >
              <View
                className="w-6 h-6 rounded-md items-center justify-center"
                style={{
                  backgroundColor: thinkingModeEnabled
                    ? 'rgba(167,139,250,0.15)'
                    : 'rgba(255,255,255,0.06)',
                }}
              >
                <Brain size={16} color={thinkingModeEnabled ? '#a78bfa' : colors.textMuted} />
              </View>

              <View className="flex-1">
                <Text
                  className={`text-sm font-medium ${
                    thinkingModeEnabled ? 'text-purple-400' : 'text-white'
                  }`}
                >
                  Extended thinking
                </Text>
                <Text className="text-[11px] text-white/40 mt-0.5">
                  Think longer for complex tasks
                </Text>
              </View>

              <Switch
                value={thinkingModeEnabled}
                onValueChange={handleToggleExtendedThinking}
                trackColor={{ false: 'rgba(255,255,255,0.15)', true: 'rgba(167,139,250,0.4)' }}
                thumbColor={thinkingModeEnabled ? '#a78bfa' : '#666'}
                style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                accessibilityLabel="Enable extended thinking"
              />
            </Pressable>
          </>
        )}

        {/* Empty state */}
        {filteredModels.length === 0 && (
          <View className="items-center justify-center py-12 px-8">
            <Text className="text-white/40 text-sm text-center">
              No models matching &quot;{search}&quot;
            </Text>
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}
