import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Check, Cpu, Search, X as XIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { InviteCodeModal } from '@/src/features/cloud-bridge';
import { ModelRow } from './ModelRow';
import { useModelStore } from '@/src/features/model-picker/store';
import { useModelInstallStore } from '@/src/features/model-picker/installStore';
import {
  AUTO_MODES,
  MODEL_LIST,
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
        backgroundColor: selected ? `${colors.teal}10` : colors.transparent,
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? `${colors.teal}18` : colors.surfaceHover,
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
  onSelect?: (modelId: string) => void;
}

export function ModelPickerSheet({ sheetRef, onSelect }: ModelPickerSheetProps) {
  const colors = useThemeColors();
  const snapPoints = useMemo(() => ['58%', '90%'], []);

  const selectedModel = useModelStore((s) => s.selectedModel);
  const favorites = useModelStore((s) => s.favorites);
  const thinkingEnabledPerModel = useModelStore((s) => s.thinkingEnabledPerModel);
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    void hydrateInstalledModels();
  }, [hydrateInstalledModels]);

  const query = search.trim().toLowerCase();
  const filteredModels = useMemo(() => {
    if (!query) return MODEL_LIST;
    return MODEL_LIST.filter(
      (model) =>
        model.name.toLowerCase().includes(query) ||
        model.provider.toLowerCase().includes(query) ||
        model.providerLabel.toLowerCase().includes(query) ||
        model.runtimeLabel.toLowerCase().includes(query) ||
        model.id.toLowerCase().includes(query),
    );
  }, [query]);

  const favoriteModels = useMemo(
    () =>
      filteredModels.filter((model) => model.surface === 'local' && favorites.includes(model.id)),
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

  const handleSelectModel = useCallback(
    (id: string) => {
      const chosenModel = MODEL_LIST.find((model) => model.id === id);
      if (!chosenModel || chosenModel.availability === 'locked') return;

      const installStatus = statusForModel(chosenModel);
      if (installStatus.status === 'downloading' || installStatus.status === 'unavailable') return;

      if (installStatus.status === 'download_required' || installStatus.status === 'failed') {
        void prepareModel(chosenModel)
          .then(() => selectAndClose(id))
          .catch(() => undefined);
        return;
      }

      if (id === selectedModel && !isAutoMode(id)) {
        setExpandedModelId((prev) => (prev === id ? null : id));
        return;
      }

      selectAndClose(id);
    },
    [prepareModel, selectAndClose, selectedModel, statusForModel],
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

  const openInvite = useCallback(() => {
    sheetRef.current?.close();
    setInviteOpen(true);
  }, [sheetRef]);

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
              accessibilityLabel="Close model picker"
              accessibilityRole="button"
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
            Local models are selectable. Cloud models require an invite.
          </Text>
        </View>

        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 12,
            height: 42,
            borderRadius: 21,
            paddingHorizontal: 13,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Search size={16} color={colors.textMuted} />
          <TextInput
            ref={searchInputRef}
            style={{ flex: 1, color: colors.textPrimary, fontSize: 14, paddingVertical: 0 }}
            placeholder="Search models"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            selectionColor={colors.teal}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search models"
            accessibilityRole="search"
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
                No models matching "{search}"
              </Text>
            </View>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheet>

      <InviteCodeModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        source="other"
        defaultTab="invite"
      />
    </>
  );
}
