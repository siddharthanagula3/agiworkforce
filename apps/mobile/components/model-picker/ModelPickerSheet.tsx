import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Search, X as XIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { AutoModeCards } from './AutoModeCard';
import { ModelRow } from './ModelRow';
import { useModelStore } from '@/stores/modelStore';
import { AUTO_MODES, MODEL_LIST, PROVIDERS, isAutoMode, type ModelDef } from '@/lib/models';
import { fetchModelCatalog } from '@/services/modelCatalog';
import { colors } from '@/lib/theme';
import { PROVIDER_DISPLAY, type ProviderId } from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Group an array of models by their provider, preserving PROVIDERS order. */
function groupByProvider(
  models: ModelDef[],
  providerOrder: Array<{ id: string; name: string }>,
): Array<{ providerId: string; providerLabel: string; models: ModelDef[] }> {
  const byProvider = new Map<string, ModelDef[]>();
  for (const model of models) {
    const group = byProvider.get(model.provider);
    if (group) {
      group.push(model);
    } else {
      byProvider.set(model.provider, [model]);
    }
  }

  const result: Array<{ providerId: string; providerLabel: string; models: ModelDef[] }> = [];

  // First pass: providers in canonical order
  for (const { id, name } of providerOrder) {
    const group = byProvider.get(id);
    if (group && group.length > 0) {
      const display = PROVIDER_DISPLAY[id as ProviderId];
      result.push({ providerId: id, providerLabel: display?.label ?? name, models: group });
      byProvider.delete(id);
    }
  }

  // Second pass: any providers not in PROVIDERS order (e.g., from remote catalog)
  for (const [providerId, group] of byProvider) {
    if (group.length > 0) {
      const display = PROVIDER_DISPLAY[providerId as ProviderId];
      result.push({
        providerId,
        providerLabel: display?.label ?? providerId,
        models: group,
      });
    }
  }

  return result;
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
  const setModel = useModelStore((s) => s.setModel);
  const toggleFavorite = useModelStore((s) => s.toggleFavorite);
  const toggleThinkingForModel = useModelStore((s) => s.toggleThinkingForModel);

  const [search, setSearch] = useState('');
  const searchInputRef = useRef<TextInput>(null);
  const [remoteModels, setRemoteModels] = useState<ModelDef[]>([]);

  // Track which model row is expanded to show the thinking toggle.
  // A model expands when it is already selected and tapped again.
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);

  // Fetch remote model catalog on mount (falls back to embedded MODEL_LIST)
  useEffect(() => {
    fetchModelCatalog()
      .then((models) => {
        if (models.length > 0 && models !== MODEL_LIST) {
          setRemoteModels(models);
        }
      })
      .catch((err) => {
        // Fall through — use embedded MODEL_LIST
        console.warn('[ModelPickerSheet] Remote model catalog fetch failed:', err);
      });
  }, []);

  // Use remote models if available, otherwise fall back to embedded list
  const modelSource = remoteModels.length > 0 ? remoteModels : MODEL_LIST;

  // Filter models by search query
  const query = search.trim().toLowerCase();
  const filteredModels = useMemo(() => {
    if (!query) return modelSource;
    return modelSource.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.provider.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query),
    );
  }, [query, modelSource]);

  // Favorites subset from filtered models
  const favoriteModels = useMemo(() => {
    return filteredModels.filter((m) => favorites.includes(m.id));
  }, [filteredModels, favorites]);

  // Non-favorite models (to avoid duplication when favorites section is shown)
  const nonFavoriteModels = useMemo(() => {
    if (favoriteModels.length === 0) return filteredModels;
    const favSet = new Set(favorites);
    return filteredModels.filter((m) => !favSet.has(m.id));
  }, [filteredModels, favoriteModels, favorites]);

  // Provider-grouped non-favorite models (used when NOT searching)
  const groupedModels = useMemo(() => {
    return groupByProvider(nonFavoriteModels, PROVIDERS);
  }, [nonFavoriteModels]);

  const handleSelectModel = useCallback(
    (id: string) => {
      // If tapping the already-selected model, toggle expansion (show thinking toggle).
      if (id === selectedModel && !isAutoMode(id)) {
        setExpandedModelId((prev) => (prev === id ? null : id));
        return;
      }

      // Select the model.
      setExpandedModelId(null);
      if (onSelect) {
        onSelect(id);
      } else {
        setModel(id);
      }
      sheetRef.current?.close();
    },
    [onSelect, setModel, sheetRef, selectedModel],
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
    (model: ModelDef, keyPrefix: string) => (
      <ModelRow
        key={`${keyPrefix}-${model.id}`}
        model={model}
        isSelected={selectedModel === model.id}
        isFavorite={favorites.includes(model.id)}
        isExpanded={expandedModelId === model.id && selectedModel === model.id}
        thinkingEnabled={thinkingEnabledPerModel[model.id] ?? false}
        onSelect={handleSelectModel}
        onToggleFavorite={toggleFavorite}
        onToggleThinking={handleToggleThinking}
      />
    ),
    [
      selectedModel,
      favorites,
      expandedModelId,
      thinkingEnabledPerModel,
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
        <Text variant="subheading">Models</Text>

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
          groupedModels.map(({ providerId, providerLabel, models }) => (
            <View key={providerId} className="mb-1">
              <Text className="text-xs text-white/40 font-medium uppercase tracking-wider px-4 pt-2 pb-1">
                {providerLabel}
              </Text>
              {models.map((model) => renderModelRow(model, `grp-${providerId}`))}
            </View>
          ))
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
