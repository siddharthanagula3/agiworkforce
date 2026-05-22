import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, TextInput, FlatList, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ArrowLeft, Brain, Search, X, Plus, Upload } from 'lucide-react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import { Text } from '@/components/ui/text';
import { Skeleton } from '@/components/ui/skeleton';
import { MemoryItem } from '@/src/features/settings/components/MemoryItem';
import { AddMemorySheet } from '@/src/features/settings/components/AddMemorySheet';
import { useMemoryStore, type MemoryEntry } from '@/src/features/memory/store';
import { colors } from '@/src/ui/theme';

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
  const addSheetRef = useRef<BottomSheet>(null);

  const [searchText, setSearchText] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const [editingMemory, setEditingMemory] = useState<MemoryEntry | null>(null);

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
    addSheetRef.current?.snapToIndex(0);
  }, []);

  const handleEdit = useCallback((memory: MemoryEntry) => {
    setEditingMemory(memory);
    addSheetRef.current?.snapToIndex(0);
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
    <SafeAreaView className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="flex-row items-center px-4 h-12">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2 rounded-lg active:bg-white/5">
          <ArrowLeft size={22} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2 flex-1">
          Memory
        </Text>
        <Pressable
          onPress={handleImportPress}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Import memories"
        >
          <Upload size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Count subtitle */}
      <View className="px-4 mb-2">
        <Text className="text-[11px] text-white/30">
          {loading ? 'Loading…' : formatCount(entries.length)}
        </Text>
      </View>

      {/* Error banner */}
      {error && (
        <Animated.View entering={FadeIn.duration(200)} className="mx-4 mb-2">
          <View className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <Text className="text-xs text-red-400">{error}</Text>
          </View>
        </Animated.View>
      )}

      {/* Search bar */}
      <View className="mx-4 mb-3 flex-row items-center gap-2 bg-surface-elevated rounded-xl border border-white/8 px-3 py-2">
        <Search size={16} color={colors.textMuted} />
        <TextInput
          className="flex-1 text-white text-sm py-0"
          placeholder="Search memories..."
          placeholderTextColor="rgba(255,255,255,0.3)"
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
                className={`px-3 py-1.5 rounded-full border ${
                  isActive ? 'border-teal-500/50 bg-teal-500/15' : 'border-white/10 bg-white/5'
                }`}
              >
                <Text
                  className={`text-xs font-medium ${isActive ? 'text-teal-400' : 'text-white/60'}`}
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
        <LoadingSkeleton />
      ) : displayedEntries.length === 0 ? (
        <EmptyState hasSearch={searchText.length > 0} isPinnedFilter={activeFilter === 'Pinned'} />
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
      <View className="absolute bottom-6 right-6">
        <Pressable
          onPress={handleAddPress}
          className="w-14 h-14 rounded-full bg-teal-500 items-center justify-center shadow-lg active:bg-teal-600"
          accessibilityLabel="Add memory"
        >
          <Plus size={24} color={colors.white} />
        </Pressable>
      </View>

      {/* Add/Edit bottom sheet */}
      <AddMemorySheet
        sheetRef={addSheetRef}
        editingMemory={editingMemory}
        onSave={handleSave}
        onUpdate={handleUpdate}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <View className="px-4 gap-3 mt-2">
      {[1, 2, 3].map((i) => (
        <View key={i} className="bg-surface-elevated rounded-xl p-4 gap-2">
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
}: {
  hasSearch: boolean;
  isPinnedFilter: boolean;
}) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="w-20 h-20 rounded-2xl bg-white/5 items-center justify-center mb-4">
        <Brain size={36} color={colors.textMuted} />
      </View>
      <Text variant="subheading" className="text-center mb-1.5">
        {hasSearch ? 'No results found' : isPinnedFilter ? 'No pinned memories' : 'No memories yet'}
      </Text>
      <Text className="text-white/40 text-sm text-center leading-5">
        {hasSearch
          ? 'Try a different search term'
          : isPinnedFilter
            ? 'Pin a memory to keep it at the top'
            : 'Add notes manually or import from another app.'}
      </Text>
    </View>
  );
}
