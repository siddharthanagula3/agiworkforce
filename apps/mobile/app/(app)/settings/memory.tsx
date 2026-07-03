import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable, TextInput, FlatList, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ArrowLeft, Brain, Search, X, Plus, Upload } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { AddMemorySheet, MemoryItem } from '@/src/features/settings/components';
import { useMemoryStore, type MemoryEntry } from '@/src/features/memory/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILTER_CATEGORIES = ['All', 'Pinned'] as const;

function formatCount(n: number): string {
  if (n === 1) return '1 memory';
  return `${n} memories`;
}

export default function MemoryScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { scope } = useLocalSearchParams<{ scope?: string }>();
  const currentIsCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';
  // The memory store's read/write path follows the CURRENT chat mode toggle
  // (trust-boundary requirement — chat-time retrieval must match the active
  // conversation's mode). When the user navigates here via a Local- or
  // Cloud-labeled Settings row that doesn't match the current toggle, show an
  // honest notice instead of silently listing the other mode's memories.
  const scopeMismatch =
    (scope === 'cloud' && !currentIsCloud) || (scope === 'local' && currentIsCloud);

  const [searchText, setSearchText] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [editingMemory, setEditingMemory] = useState<MemoryEntry | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);

  const {
    entries,
    filteredEntries,
    loading,
    error,
    searchQuery,
    fetchMemories,
    addMemory,
    updateMemory,
    deleteMemory,
    togglePin,
    setSearchQuery,
    clearError,
  } = useMemoryStore();

  // Fetch on mount
  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  // Auto-clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 5_000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  // Determine displayed entries: search results or category-filtered entries
  const displayedEntries = useMemo(() => {
    const source = searchQuery.trim() ? filteredEntries : entries;

    if (activeFilter === 'All') return source;

    return source.filter((e) => e.pinned);
  }, [entries, filteredEntries, searchQuery, activeFilter]);

  // Handlers
  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchText(text);
      setSearchQuery(text);
    },
    [setSearchQuery],
  );

  const handleClearSearch = useCallback(() => {
    setSearchText('');
    setSearchQuery('');
  }, [setSearchQuery]);

  const handleRefresh = useCallback(() => {
    fetchMemories();
  }, [fetchMemories]);

  const handleTogglePin = useCallback(
    (id: string) => {
      togglePin(id);
    },
    [togglePin],
  );

  const handleImportPress = useCallback(() => {
    router.push('/(app)/settings/memory-import' as Parameters<typeof router.push>[0]);
  }, [router]);

  const handleAddPress = useCallback(() => {
    setEditingMemory(null);
    setAddSheetOpen(true);
  }, []);

  const handleEdit = useCallback((memory: MemoryEntry) => {
    setEditingMemory(memory);
    setAddSheetOpen(true);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setAddSheetOpen(false);
    setEditingMemory(null);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      deleteMemory(id);
    },
    [deleteMemory],
  );

  const handleSave = useCallback(
    (content: string, _category?: string) => {
      addMemory(content);
    },
    [addMemory],
  );

  const handleUpdate = useCallback(
    (id: string, content: string) => {
      updateMemory(id, content);
    },
    [updateMemory],
  );

  // Render helpers
  const renderItem = useCallback(
    ({ item }: { item: MemoryEntry }) => (
      <MemoryItem
        memory={item}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onTogglePin={handleTogglePin}
      />
    ),
    [handleEdit, handleDelete, handleTogglePin],
  );

  const keyExtractor = useCallback((item: MemoryEntry) => item.id, []);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      {/* Header */}
      <View className="flex-row items-center px-4 h-12">
        <Pressable
          onPress={() =>
            router.replace('/(app)/(tabs)/settings' as Parameters<typeof router.replace>[0])
          }
          accessibilityLabel="Go back"
          accessibilityRole="button"
          className="p-2 -ml-2 rounded-lg"
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
          })}
        >
          <ArrowLeft size={22} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2 flex-1" style={{ color: colors.textPrimary }}>
          {currentIsCloud ? 'Cloud Memory' : 'Memory'}
        </Text>
        <Pressable
          onPress={handleImportPress}
          className="p-2 rounded-lg"
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
          })}
          accessibilityLabel="Import memories"
          accessibilityRole="button"
        >
          <Upload size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {scopeMismatch ? (
        <View className="mx-4 mb-3">
          <View
            className="rounded-lg px-3 py-2.5"
            style={{
              backgroundColor: colors.surfaceElevated,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
              {scope === 'cloud'
                ? "You're currently chatting in Local Mode, so this shows your Local memories, not Cloud. Switch to Cloud in chat to manage Cloud memories."
                : "You're currently chatting in Cloud mode, so this shows your Cloud memories, not Local. Switch to Local in chat to manage Local memories."}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Count subtitle */}
      <View className="px-4 mb-2">
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>
          {loading ? 'Loading…' : formatCount(entries.length)}
        </Text>
      </View>

      {/* Error banner */}
      {error && (
        <Animated.View entering={FadeIn.duration(200)} className="mx-4 mb-2">
          <View
            className="rounded-lg px-3 py-2"
            style={{
              backgroundColor: colors.dangerSurface,
              borderWidth: 1,
              borderColor: colors.dangerBorder,
            }}
          >
            <Text style={{ color: colors.agentError, fontSize: 12 }}>{error}</Text>
          </View>
        </Animated.View>
      )}

      {/* Search bar */}
      <View
        className="mx-4 mb-3 flex-row items-center gap-2 rounded-xl px-3 py-2"
        style={{
          backgroundColor: colors.surfaceElevated,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Search size={16} color={colors.textMuted} />
        <TextInput
          className="flex-1 py-0"
          style={{ color: colors.textPrimary, fontSize: 14, letterSpacing: 0 }}
          placeholder="Search memories..."
          placeholderTextColor={colors.textMuted}
          value={searchText}
          onChangeText={handleSearchChange}
          selectionColor={colors.teal}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <Pressable onPress={handleClearSearch} className="p-0.5">
            <X size={14} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Category filter chips */}
      <View className="mb-3">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {FILTER_CATEGORIES.map((cat) => {
            const isActive = activeFilter === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setActiveFilter(cat)}
                accessibilityLabel={`${cat} memories`}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                className="px-3 py-1.5 rounded-full"
                style={{
                  borderWidth: 1,
                  borderColor: isActive ? colors.accentBorder : colors.border,
                  backgroundColor: isActive ? colors.accentSurface : colors.surfaceElevated,
                }}
              >
                <Text
                  style={{
                    color: isActive ? colors.textPrimary : colors.textSecondary,
                    fontSize: 12,
                    fontWeight: '500',
                  }}
                >
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Memory list */}
      {loading && entries.length === 0 ? (
        <LoadingSkeleton colors={colors} />
      ) : displayedEntries.length === 0 ? (
        <EmptyState
          hasSearch={searchText.length > 0}
          isPinnedFilter={activeFilter === 'Pinned'}
          colors={colors}
        />
      ) : (
        <FlatList
          data={displayedEntries}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading && entries.length > 0}
              onRefresh={handleRefresh}
              tintColor={colors.teal}
            />
          }
        />
      )}

      {/* Floating action button */}
      {!addSheetOpen ? (
        <View style={{ position: 'absolute', right: 24, bottom: 24, zIndex: 10 }}>
          <Pressable
            onPress={handleAddPress}
            accessibilityRole="button"
            accessibilityLabel="Add memory"
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.black,
              borderWidth: 1,
              borderColor: colors.border,
              shadowColor: colors.black,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.18,
              shadowRadius: 16,
              elevation: 6,
            }}
          >
            <Plus size={24} color={colors.white} />
          </Pressable>
        </View>
      ) : null}

      {/* Add/Edit bottom sheet */}
      <AddMemorySheet
        editingMemory={editingMemory}
        onClose={handleCloseEditor}
        onDelete={handleDelete}
        onSave={handleSave}
        onUpdate={handleUpdate}
        open={addSheetOpen}
        isCloud={currentIsCloud}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingSkeleton({ colors }: { colors: ColorScheme }) {
  return (
    <View className="px-4 gap-3 mt-2">
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          className="rounded-xl p-4 gap-2"
          style={{
            backgroundColor: colors.surfaceElevated,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Skeleton width="100%" height={14} />
          <Skeleton width="80%" height={14} />
          <Skeleton width="60%" height={14} />
          <View className="flex-row gap-2 mt-2">
            <Skeleton width={60} height={18} borderRadius={9} />
            <Skeleton width={48} height={18} borderRadius={9} />
          </View>
        </View>
      ))}
    </View>
  );
}

function EmptyState({
  hasSearch,
  isPinnedFilter,
  colors,
}: {
  hasSearch: boolean;
  isPinnedFilter: boolean;
  colors: ColorScheme;
}) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View
        className="w-20 h-20 rounded-2xl items-center justify-center mb-4"
        style={{
          backgroundColor: colors.surfaceElevated,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Brain size={36} color={colors.textMuted} />
      </View>
      <Text
        variant="subheading"
        className="text-center mb-1.5"
        style={{ color: colors.textPrimary }}
      >
        {hasSearch ? 'No results found' : isPinnedFilter ? 'No pinned memories' : 'No memories yet'}
      </Text>
      <Text className="text-center leading-5" style={{ color: colors.textMuted, fontSize: 14 }}>
        {hasSearch
          ? 'Try a different search term'
          : isPinnedFilter
            ? 'Pin a memory to keep it at the top'
            : 'Add notes manually or import from another app.'}
      </Text>
    </View>
  );
}
