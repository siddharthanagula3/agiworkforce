import { useCallback, useMemo, useRef, useState } from 'react';
import { View, TextInput, Pressable, ScrollView } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Search, X, Brain } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { AutoModeCards } from './AutoModeCard';
import { ModelGroup } from './ModelGroup';
import { ModelRow } from './ModelRow';
import { useModelStore } from '@/stores/modelStore';
import {
  AUTO_MODES,
  PROVIDERS,
  MODEL_LIST,
  getModelsByProvider,
  isAutoMode,
} from '@/lib/models';
import { colors } from '@/lib/theme';

interface ModelPickerSheetProps {
  /** Ref forwarded so the parent can open/close the sheet. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sheetRef: any;
}

export function ModelPickerSheet({ sheetRef }: ModelPickerSheetProps) {
  const snapPoints = useMemo(() => ['50%', '90%'], []);

  const selectedModel = useModelStore((s) => s.selectedModel);
  const favorites = useModelStore((s) => s.favorites);
  const thinkingModeEnabled = useModelStore((s) => s.thinkingModeEnabled);
  const setModel = useModelStore((s) => s.setModel);
  const toggleFavorite = useModelStore((s) => s.toggleFavorite);
  const setThinkingMode = useModelStore((s) => s.setThinkingMode);

  const [search, setSearch] = useState('');
  const searchInputRef = useRef<TextInput>(null);

  // Filter models by search query
  const query = search.trim().toLowerCase();
  const filteredModels = useMemo(() => {
    if (!query) return MODEL_LIST;
    return MODEL_LIST.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.provider.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query),
    );
  }, [query]);

  // Group filtered models by provider
  const providerGroups = useMemo(() => {
    return PROVIDERS.map((p) => ({
      provider: p,
      models: filteredModels.filter((m) => m.provider === p.id),
    })).filter((g) => g.models.length > 0);
  }, [filteredModels]);

  // Favorites subset from filtered models
  const favoriteModels = useMemo(() => {
    return filteredModels.filter((m) => favorites.includes(m.id));
  }, [filteredModels, favorites]);

  // Determine which provider group should start expanded
  const selectedProviderForModel = useMemo(() => {
    if (isAutoMode(selectedModel)) return null;
    const m = MODEL_LIST.find((mod) => mod.id === selectedModel);
    return m?.provider ?? null;
  }, [selectedModel]);

  const handleSelectModel = useCallback(
    (id: string) => {
      setModel(id);
      // Close the sheet after selection.
      sheetRef.current?.close();
    },
    [setModel, sheetRef],
  );

  const handleSelectAutoMode = useCallback(
    (id: string) => {
      setModel(id);
      sheetRef.current?.close();
    },
    [setModel, sheetRef],
  );

  const clearSearch = useCallback(() => {
    setSearch('');
    searchInputRef.current?.blur();
  }, []);

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

  return (
    <BottomSheet
      ref={sheetRef}
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
        <Text variant="subheading">Select Model</Text>

        {/* Thinking mode toggle */}
        <Pressable
          onPress={() => setThinkingMode(!thinkingModeEnabled)}
          className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${
            thinkingModeEnabled
              ? 'border-purple-500/50 bg-purple-500/15'
              : 'border-white/10 bg-white/5'
          }`}
        >
          <Brain
            size={14}
            color={thinkingModeEnabled ? '#a78bfa' : colors.textMuted}
          />
          <Text
            className={`text-xs font-medium ${
              thinkingModeEnabled ? 'text-purple-400' : 'text-white/50'
            }`}
          >
            Thinking
          </Text>
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
        />
        {search.length > 0 && (
          <Pressable onPress={clearSearch} className="p-0.5">
            <X size={14} color={colors.textMuted} />
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
          <>
            <Text className="text-xs text-white/40 font-medium uppercase tracking-wider px-4 mb-2">
              Auto Mode
            </Text>
            <AutoModeCards
              modes={AUTO_MODES}
              selectedId={selectedModel}
              onSelect={handleSelectAutoMode}
            />
          </>
        )}

        {/* Favorites section */}
        {favoriteModels.length > 0 && (
          <View className="mb-2">
            <Text className="text-xs text-white/40 font-medium uppercase tracking-wider px-4 mb-1">
              Favorites
            </Text>
            {favoriteModels.map((model) => (
              <ModelRow
                key={`fav-${model.id}`}
                model={model}
                isSelected={selectedModel === model.id}
                isFavorite
                onSelect={handleSelectModel}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </View>
        )}

        {/* Provider groups */}
        <Text className="text-xs text-white/40 font-medium uppercase tracking-wider px-4 mb-1 mt-1">
          All Models
        </Text>

        {providerGroups.map(({ provider, models }) => (
          <ModelGroup
            key={provider.id}
            provider={provider}
            models={models}
            selectedModelId={selectedModel}
            favorites={favorites}
            onSelectModel={handleSelectModel}
            onToggleFavorite={toggleFavorite}
            initiallyExpanded={provider.id === selectedProviderForModel}
          />
        ))}

        {/* Empty state */}
        {filteredModels.length === 0 && (
          <View className="items-center justify-center py-12 px-8">
            <Text className="text-white/40 text-sm text-center">
              No models matching "{search}"
            </Text>
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}
