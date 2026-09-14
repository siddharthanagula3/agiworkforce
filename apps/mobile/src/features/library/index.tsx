import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { BookImage, FileText, ImageIcon, Sparkles, Video } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { useThemeColors } from '@/src/ui/theme';
import { BottomSearchBar } from '@/src/shared/components/BottomSearchBar';
import { DrawerButton } from '@/src/shared/components/DrawerButton';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  useArtifactStore,
  accentColorForKind,
  mergeMobileArtifactsForGallery,
} from '@/src/features/artifacts/store';
import type { MobileArtifact } from '@/src/features/artifacts/types';
import { ImageFullScreen } from '@/src/features/chat/components/ImageFullScreen';
import { useGeneratedImageSource } from '@/src/features/image/hooks/useGeneratedImageSource';
import { useAuthStore } from '@/src/features/auth/store';
import {
  captureAccountScopedUiState,
  isAccountScopedUiStateOwned,
  type AccountScopedUiState,
} from '@/src/features/auth/services/accountScopedUiState';
import { downloadGeneratedFile, shareFile } from '@/services/fileCreation';
import { API_URL } from '@/lib/constants';
import {
  MAX_GRID_CONTENT_WIDTH,
  useResponsiveLayout,
} from '@/src/shared/hooks/useResponsiveLayout';
import type { LibraryAsset } from './libraryClient';
import { useLibraryAssets } from './useLibraryAssets';

const CARD_GAP = 14;
const HORIZONTAL_PADDING = 16;
const SEARCH_DEBOUNCE_MS = 350;

type LibraryFilter = 'all' | 'images' | 'videos' | 'documents' | 'artifacts';

type LibraryRow =
  | { row: 'asset'; id: string; asset: LibraryAsset }
  | { row: 'artifact'; id: string; artifact: MobileArtifact };

function absoluteAssetUrl(uri: string): string {
  return /^https?:\/\//i.test(uri) ? uri : `${API_URL.replace(/\/+$/, '')}${uri}`;
}

export function LibraryScreen({ initialImageId }: { initialImageId?: string }) {
  const c = useThemeColors();
  const navigation = useNavigation();
  const { contentWidth, gridColumns } = useResponsiveLayout();
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [previewImage, setPreviewImage] = useState<LibraryAsset | null>(null);
  const previewImageScopeRef = useRef<AccountScopedUiState | null>(null);
  const openedInitialImageRef = useRef<string | null>(null);

  const appMode = useChatAppModeStore((s) => s.appMode);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const storedArtifacts = useArtifactStore((s) => s.artifacts);
  const cloudArtifacts = useArtifactStore((s) => s.cloudArtifacts);
  const cloudArtifactsOwnerId = useArtifactStore((s) => s.cloudArtifactsOwnerId);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const library = useLibraryAssets(search);

  useLayoutEffect(() => {
    if (!previewImage) return;
    if (isAccountScopedUiStateOwned(previewImageScopeRef.current)) return;
    previewImageScopeRef.current = null;
    setPreviewImage(null);
  }, [clerkUserId, previewImage]);

  const artifacts = useMemo(
    () =>
      mergeMobileArtifactsForGallery(storedArtifacts, cloudArtifacts, c, cloudArtifactsOwnerId)
        .filter((artifact) => artifact.provenance?.scope === appMode)
        .filter((artifact) => artifact.kind !== 'image')
        .map((a) => ({ ...a, accentColor: accentColorForKind(a.kind, c) })),
    [appMode, cloudArtifacts, cloudArtifactsOwnerId, storedArtifacts, c],
  );

  const rows = useMemo<LibraryRow[]>(() => {
    const normalizedQuery = search.trim().toLocaleLowerCase();
    const assetRows: LibraryRow[] =
      filter === 'artifacts'
        ? []
        : library.assets
            .filter((asset) => {
              if (filter === 'images') return asset.kind === 'image';
              if (filter === 'videos') return asset.kind === 'video';
              if (filter === 'documents') return asset.kind === 'document';
              return true;
            })
            .map((asset) => ({ row: 'asset' as const, id: asset.id, asset }));
    const artifactRows: LibraryRow[] =
      filter === 'images' || filter === 'videos' || filter === 'documents'
        ? []
        : artifacts
            .filter(
              (artifact) =>
                !normalizedQuery ||
                [artifact.title, artifact.content, artifact.kind, artifact.language].some((value) =>
                  value?.toLocaleLowerCase().includes(normalizedQuery),
                ),
            )
            .map((artifact) => ({ row: 'artifact' as const, id: artifact.id, artifact }));
    return [...assetRows, ...artifactRows];
  }, [artifacts, filter, library.assets, search]);

  const openDrawer = useCallback(() => {
    openNearestDrawer(navigation);
  }, [navigation]);

  const gridWidth = Math.min(contentWidth, MAX_GRID_CONTENT_WIDTH) - HORIZONTAL_PADDING * 2;
  const cardWidth = Math.floor((gridWidth - CARD_GAP * (gridColumns - 1)) / gridColumns);

  const keyExtractor = useCallback((item: LibraryRow) => `${item.row}-${item.id}`, []);

  const handleOpenImage = useCallback(
    (asset: LibraryAsset) => {
      const scope = captureAccountScopedUiState(appMode);
      if (!scope) return;
      previewImageScopeRef.current = scope;
      setPreviewImage(asset);
    },
    [appMode],
  );

  const handleCloseImage = useCallback(() => {
    previewImageScopeRef.current = null;
    setPreviewImage(null);
  }, []);

  const handleShareAsset = useCallback(async (asset: LibraryAsset) => {
    try {
      const localUri = await downloadGeneratedFile(absoluteAssetUrl(asset.uri), asset.fileName);
      await shareFile(localUri);
    } catch (error) {
      Alert.alert(
        'Could not open this file',
        error instanceof Error ? error.message : 'The file could not be downloaded.',
      );
    }
  }, []);

  const handleDeleteAsset = useCallback(
    (asset: LibraryAsset) => {
      Alert.alert('Delete from Library?', `“${asset.fileName}” moves to deleted items.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void library.removeAsset(asset.id).catch((error: unknown) => {
              Alert.alert(
                'Delete failed',
                error instanceof Error ? error.message : 'The file could not be deleted.',
              );
            });
          },
        },
      ]);
    },
    [library],
  );

  const handleAssetActions = useCallback(
    (asset: LibraryAsset) => {
      Alert.alert(asset.fileName, undefined, [
        { text: 'Share', onPress: () => void handleShareAsset(asset) },
        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteAsset(asset) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [handleDeleteAsset, handleShareAsset],
  );

  useEffect(() => {
    if (!initialImageId || openedInitialImageRef.current === initialImageId) return;
    const asset = library.assets.find(
      (candidate) => candidate.id === initialImageId && candidate.kind === 'image',
    );
    if (!asset) return;
    openedInitialImageRef.current = initialImageId;
    handleOpenImage(asset);
  }, [handleOpenImage, initialImageId, library.assets]);

  const renderItem = useCallback(
    ({ item, index }: { item: LibraryRow; index: number }) => {
      const style = index % gridColumns !== 0 ? { marginLeft: CARD_GAP } : undefined;
      if (item.row === 'artifact') {
        return <LibraryArtifactCard artifact={item.artifact} width={cardWidth} style={style} />;
      }
      const asset = item.asset;
      const onLongPress = () => handleAssetActions(asset);
      if (asset.kind === 'image') {
        return (
          <LibraryImageCard
            asset={asset}
            width={cardWidth}
            style={style}
            onPress={() => handleOpenImage(asset)}
            onLongPress={onLongPress}
          />
        );
      }
      return (
        <LibraryFileCard
          asset={asset}
          width={cardWidth}
          style={style}
          onPress={() => void handleShareAsset(asset)}
          onLongPress={onLongPress}
        />
      );
    },
    [cardWidth, gridColumns, handleAssetActions, handleOpenImage, handleShareAsset],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }} edges={['top']}>
      <View className="h-12 flex-row items-center px-3 gap-2">
        <DrawerButton testID="library-open-drawer" onPress={openDrawer} />
        <Text style={{ flex: 1, color: c.textPrimary, fontSize: 17, fontWeight: '700' }}>
          Library
        </Text>
      </View>

      {/* Horizontally scrollable, not a fixed row. The labels already overflow
          a 375pt screen at the default text size, and at any accessibility
          size the last filter was pushed off-screen with no way to reach it. */}
      <ScrollView
        testID="library-filter-row"
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, paddingBottom: 16 }}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
      >
        <FilterChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        <FilterChip
          label="Images"
          active={filter === 'images'}
          onPress={() => setFilter('images')}
        />
        <FilterChip
          label="Videos"
          active={filter === 'videos'}
          onPress={() => setFilter('videos')}
        />
        <FilterChip
          label="Documents"
          active={filter === 'documents'}
          onPress={() => setFilter('documents')}
        />
        <FilterChip
          label="Artifacts"
          active={filter === 'artifacts'}
          onPress={() => setFilter('artifacts')}
        />
      </ScrollView>

      <FlatList
        key={`library-${gridColumns}`}
        data={rows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={gridColumns}
        contentInsetAdjustmentBehavior="automatic"
        testID="library-grid"
        contentContainerStyle={{
          paddingHorizontal: HORIZONTAL_PADDING,
          paddingTop: 4,
          paddingBottom: 24,
          alignSelf: 'center',
          width: Math.min(contentWidth, MAX_GRID_CONTENT_WIDTH),
        }}
        refreshControl={
          <RefreshControl
            refreshing={library.refreshing}
            onRefresh={library.refresh}
            tintColor={c.textMuted}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={library.loadMore}
        ListHeaderComponent={
          library.error ? (
            <LibraryNotice
              testID="library-error"
              text={
                library.showingCachedPage
                  ? `Showing the last synced page · ${library.error}`
                  : library.error
              }
            />
          ) : null
        }
        ListFooterComponent={
          library.loadingMore ? (
            <View className="py-6 items-center">
              <ActivityIndicator color={c.textMuted} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          library.loading ? (
            <View testID="library-loading" className="py-20 items-center">
              <ActivityIndicator color={c.textMuted} />
            </View>
          ) : (
            <LibraryEmptyState filter={filter} query={search} signedOut={library.signedOut} />
          )
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      {/* Bottom-anchored, not between the chips and the grid. Both references
          float search as a pill under the thumb and the chats list already
          shipped that treatment. */}
      <BottomSearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Search library"
        accessibilityLabel="Search library"
        clearAccessibilityLabel="Clear library search"
        testID="library-search"
      />

      <ImageFullScreen
        imageUrl={previewImage?.uri ?? null}
        prompt={previewImage?.prompt ?? undefined}
        visible={previewImage !== null}
        onClose={handleCloseImage}
      />
    </SafeAreaView>
  );
}

function LibraryNotice({ text, testID }: { text: string; testID: string }) {
  const c = useThemeColors();
  return (
    <View
      testID={testID}
      className="rounded-2xl border px-4 py-3 mb-4"
      style={{ backgroundColor: c.dangerSurface, borderColor: c.dangerBorder }}
    >
      <Text className="text-[13px] leading-[18px]" style={{ color: c.textPrimary }}>
        {text}
      </Text>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      className="px-3 rounded-full"
      hitSlop={6}
      style={{
        minHeight: 40,
        justifyContent: 'center',
        backgroundColor: active ? c.accentSurface : c.surfaceElevated,
        borderWidth: 1,
        borderColor: active ? c.accentBorder : c.border,
      }}
      accessibilityLabel={`${label} filter`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text className="text-xs font-medium" style={{ color: active ? c.teal : c.textSecondary }}>
        {label}
      </Text>
    </Pressable>
  );
}

function LibraryEmptyState({
  filter,
  query,
  signedOut,
}: {
  filter: LibraryFilter;
  query: string;
  signedOut: boolean;
}) {
  const c = useThemeColors();
  const copy = signedOut
    ? 'Sign in to see the images, videos, and files saved to your account.'
    : query.trim()
      ? `Nothing in ${filter === 'all' ? 'your Library' : filter} matches “${query.trim()}”`
      : filter === 'images'
        ? 'Images you generate or upload will appear here'
        : filter === 'videos'
          ? 'Videos you generate will appear here'
          : filter === 'documents'
            ? 'Files you attach or generate will appear here for reuse'
            : filter === 'artifacts'
              ? 'Artifacts you create in conversations will appear here'
              : 'Images, videos, files, and artifacts from your account will appear here';
  return (
    <View testID="library-empty-state" className="flex-1 items-center justify-center py-20 px-8">
      <View
        className="w-16 h-16 rounded-full items-center justify-center mb-5"
        style={{ backgroundColor: c.surfaceElevated }}
      >
        <BookImage size={28} color={c.textSecondary} />
      </View>
      <Text className="text-[18px] font-semibold text-center mb-2" style={{ color: c.textPrimary }}>
        {signedOut ? 'Signed out' : 'Nothing here yet'}
      </Text>
      <Text className="text-[14px] text-center leading-[20px]" style={{ color: c.textMuted }}>
        {copy}
      </Text>
    </View>
  );
}

function formatAssetSize(size: number | null): string {
  if (size == null) return 'Saved to your account';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function LibraryFileCard({
  asset,
  width,
  style,
  onPress,
  onLongPress,
}: {
  asset: LibraryAsset;
  width: number;
  style?: object;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const c = useThemeColors();
  const previewHeight = Math.max(120, Math.round(width * 0.72));
  const isVideo = asset.kind === 'video';

  return (
    <Pressable
      testID={`library-${asset.kind}-card-${asset.id}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[{ width, marginBottom: 20 }, style]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${asset.fileName}`}
      accessibilityHint="Long press for share and delete"
    >
      <View
        style={{
          height: previewHeight,
          borderRadius: 16,
          borderCurve: 'continuous',
          backgroundColor: c.surfaceElevated,
          borderWidth: 1,
          borderColor: c.border,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: 16,
        }}
      >
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 15,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.accentSurface,
            borderWidth: 1,
            borderColor: c.accentBorder,
          }}
        >
          {isVideo ? (
            <Video size={23} color={c.textPrimary} />
          ) : (
            <FileText size={23} color={c.textPrimary} />
          )}
        </View>
        <Badge label={isVideo ? 'Video' : 'Document'} color="gray" />
        <Text
          numberOfLines={2}
          style={{ color: c.textPrimary, fontSize: 13, lineHeight: 18, textAlign: 'center' }}
        >
          {asset.fileName}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        style={{ color: c.textPrimary, fontSize: 14, fontWeight: '600', marginTop: 9 }}
      >
        {asset.fileName}
      </Text>
      <Text numberOfLines={1} style={{ color: c.textMuted, fontSize: 12, marginTop: 3 }}>
        {formatAssetSize(asset.byteCount)} · {asset.sourceLabel}
      </Text>
    </Pressable>
  );
}

function LibraryImageCard({
  asset,
  width,
  style,
  onPress,
  onLongPress,
}: {
  asset: LibraryAsset;
  width: number;
  style?: object;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const c = useThemeColors();
  const height = Math.max(120, Math.round(width * 0.9));
  const { source, status } = useGeneratedImageSource(asset.uri, false);
  return (
    <Pressable
      testID={`library-image-card-${asset.id}`}
      onPress={onPress}
      onLongPress={onLongPress}
      className="active:opacity-80"
      style={[{ width, marginBottom: 20 }, style]}
      accessibilityLabel={`Open image ${asset.prompt ?? asset.fileName}`.trim()}
      accessibilityHint="Long press for share and delete"
      accessibilityRole="button"
    >
      <View
        className="rounded-2xl border overflow-hidden"
        style={{ width, height, backgroundColor: c.surfaceElevated, borderColor: c.border }}
      >
        <View className="absolute top-3 left-3 z-10 flex-row items-center gap-1.5">
          <ImageIcon size={12} color={c.terraCotta} />
          <Badge label="Image" color="terra-cotta" />
        </View>
        {status === 'ready' && source ? (
          <Image
            source={source}
            style={{ width, height }}
            contentFit="cover"
            transition={150}
            cachePolicy="memory"
            accessibilityLabel={asset.prompt ?? asset.fileName}
          />
        ) : (
          <View
            style={{ width, height, alignItems: 'center', justifyContent: 'center', padding: 16 }}
          >
            <Text style={{ color: c.textMuted, fontSize: 12, textAlign: 'center' }}>
              {status === 'signed-out'
                ? 'Sign in to view'
                : status === 'authorizing'
                  ? 'Loading image…'
                  : 'Image unavailable'}
            </Text>
          </View>
        )}
      </View>
      <Text className="text-[13px] mt-2" style={{ color: c.textMuted }} numberOfLines={1}>
        {asset.prompt ?? asset.sourceLabel}
      </Text>
    </Pressable>
  );
}

function LibraryArtifactCard({
  artifact,
  width,
  style,
}: {
  artifact: MobileArtifact;
  width: number;
  style?: object;
}) {
  const c = useThemeColors();
  const previewHeight = Math.max(120, Math.round(width * 0.72));
  return (
    <View
      testID={`library-artifact-card-${artifact.id}`}
      style={[{ width, marginBottom: 20 }, style]}
      accessibilityLabel={`Artifact ${artifact.title}`}
    >
      <View
        className="rounded-2xl border overflow-hidden justify-end px-3 pb-3 pt-10"
        style={{ height: previewHeight, backgroundColor: c.surfaceHover, borderColor: c.border }}
      >
        <View className="absolute top-3 left-3 z-10 flex-row items-center gap-1.5">
          <Sparkles size={12} color={artifact.accentColor} />
          <Badge label={artifact.language ?? artifact.kind} color="gray" />
        </View>
        {artifact.previewLines.slice(0, 5).map((line, index) => (
          <Text
            key={`${artifact.id}-${index}`}
            className="text-[10px] leading-[14px]"
            numberOfLines={1}
            style={{
              color: index === 0 ? artifact.accentColor : c.textSecondary,
              opacity: index === 0 ? 1 : Math.max(0.35, 1 - index * 0.18),
            }}
          >
            {line}
          </Text>
        ))}
      </View>
      <Text
        className="text-[15px] leading-[20px] mt-2.5 font-semibold"
        style={{ color: c.textPrimary }}
        numberOfLines={2}
      >
        {artifact.title}
      </Text>
      <Text className="text-[12px] mt-1" style={{ color: c.textMuted }} numberOfLines={1}>
        {artifact.ageLabel}
      </Text>
    </View>
  );
}

export default LibraryScreen;
