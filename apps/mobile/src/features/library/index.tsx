import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { useNavigation, useRouter } from 'expo-router';
import { stageComposerAttachments } from '@/src/features/chat/composerHandoff';
import { setDraft } from '@/src/features/chat/draftStore';
import { enterMediaMode, listMediaModels } from '@/src/features/chat/actions/mediaMode';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  BookImage,
  Check,
  FileText,
  ImageIcon,
  MoreHorizontal,
  Sparkles,
  Video,
} from 'lucide-react-native';
import {
  LIBRARY_DEFAULT_SORT,
  LIBRARY_SORTS,
  type LibrarySort,
} from '@agiworkforce/cloud-contracts';
import { formatBytes } from '@agiworkforce/utils/format';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale, zIndex } from '@/src/ui/theme/tokens';
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
import {
  downloadGeneratedFile,
  prepareLocalVideoPlayer,
  shareFile,
  type LocalVideoPlayer,
} from '@/services/fileCreation';
import { VideoPlayerModal } from '@/src/features/chat/components/VideoPlayerModal';
import { API_URL } from '@/lib/constants';
import {
  MAX_GRID_CONTENT_WIDTH,
  useResponsiveLayout,
} from '@/src/shared/hooks/useResponsiveLayout';
import type { LibraryAsset, LibraryScope } from './libraryClient';
import { useLibraryAssets } from './useLibraryAssets';
import { MediaJobsSection } from './MediaJobsSection';
import type { ImageAreaEdit } from '@/src/features/image/components/ImageAreaEditor';
import { generateImage } from '@/src/features/image/services/imagegen';
import { showToast } from '@/src/shared/components/Toast';
import { toUserMessage } from '@/services/userMessage';
import { useChatStore } from '@/stores/chatStore';
import { FEATURES } from '@/lib/v1FeatureFlags';

const CARD_GAP = 14;
const HORIZONTAL_PADDING = 16;
const SEARCH_DEBOUNCE_MS = 350;
const SORT_LABELS: Record<LibrarySort, string> = {
  modified: 'Recently added',
  oldest: 'Oldest first',
  type: 'Type',
  name: 'Name',
  size: 'Size',
};

type LibraryFilter =
  'all' | 'images' | 'videos' | 'documents' | 'uploads' | 'generated' | 'artifacts';

const GENERATION_FILTERS: ReadonlySet<LibraryFilter> = new Set(['all', 'images', 'videos']);

function scopeForFilter(filter: LibraryFilter, showDeleted: boolean): LibraryScope {
  if (showDeleted) return { deleted: true };
  if (filter === 'uploads') return { origin: 'uploaded' };
  if (filter === 'generated') return { origin: 'generated', kind: 'file' };
  return {};
}

type LibraryRow =
  | { row: 'asset'; id: string; asset: LibraryAsset }
  | { row: 'artifact'; id: string; artifact: MobileArtifact };

function absoluteAssetUrl(uri: string): string {
  return /^https?:\/\//i.test(uri) ? uri : `${API_URL.replace(/\/+$/, '')}${uri}`;
}

export function LibraryScreen({ initialImageId }: { initialImageId?: string }) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { contentWidth, gridColumns } = useResponsiveLayout();
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [sort, setSort] = useState<LibrarySort>(LIBRARY_DEFAULT_SORT);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [previewImage, setPreviewImage] = useState<LibraryAsset | null>(null);
  const previewImageScopeRef = useRef<AccountScopedUiState | null>(null);
  const [videoPlayer, setVideoPlayer] = useState<{
    player: LocalVideoPlayer;
    label: string;
  } | null>(null);
  const videoLoadingRef = useRef(false);
  const selectionScopeRef = useRef<AccountScopedUiState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
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

  const library = useLibraryAssets(search, sort, scopeForFilter(filter, showDeleted));

  const selectionActive =
    selectedIds !== null && isAccountScopedUiStateOwned(selectionScopeRef.current);

  const openSortOptions = useCallback(() => {
    const sortOption = (value: LibrarySort) => ({
      text: `${sort === value ? '✓ ' : ''}${SORT_LABELS[value]}`,
      onPress: () => setSort(value),
    });
    Alert.alert('Sort saved files', 'Artifacts keep their own order.', [
      ...LIBRARY_SORTS.map(sortOption),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [sort]);

  const beginSelection = useCallback(() => {
    const scope = captureAccountScopedUiState('cloud');
    if (!scope || library.signedOut) return;
    selectionScopeRef.current = scope;
    setSelectedIds(new Set());
    setFilter('all');
    setQuery('');
    setSearch('');
  }, [library.signedOut]);

  const endSelection = useCallback(() => {
    selectionScopeRef.current = null;
    setSelectedIds(null);
    setDeletingSelected(false);
  }, []);

  const openLibraryOptions = useCallback(() => {
    Alert.alert('Library', undefined, [
      ...(library.signedOut || showDeleted
        ? []
        : [{ text: 'Select saved files', onPress: beginSelection }]),
      { text: 'Sort saved files', onPress: openSortOptions },
      ...(library.signedOut
        ? []
        : [
            showDeleted
              ? { text: 'Back to Library', onPress: () => setShowDeleted(false) }
              : {
                  text: 'Recently deleted',
                  onPress: () => {
                    setFilter('all');
                    setShowDeleted(true);
                  },
                },
          ]),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [beginSelection, library.signedOut, openSortOptions, showDeleted]);

  useLayoutEffect(() => {
    if (!previewImage) return;
    if (isAccountScopedUiStateOwned(previewImageScopeRef.current)) return;
    previewImageScopeRef.current = null;
    setPreviewImage(null);
  }, [clerkUserId, previewImage]);

  useLayoutEffect(() => {
    if (selectedIds === null || isAccountScopedUiStateOwned(selectionScopeRef.current)) return;
    endSelection();
  }, [clerkUserId, endSelection, selectedIds]);

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
      filter === 'artifacts' && !showDeleted
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
      selectionActive ||
      showDeleted ||
      filter === 'images' ||
      filter === 'videos' ||
      filter === 'documents' ||
      filter === 'uploads' ||
      filter === 'generated'
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
  }, [artifacts, filter, library.assets, search, selectionActive, showDeleted]);

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

  const handleEditPreviewArea = useCallback(
    (edit: ImageAreaEdit) => {
      const asset = previewImage;
      if (!asset) return;
      handleCloseImage();
      showToast('Editing the image. The new version appears in your Library.');
      void generateImage({
        prompt: edit.prompt,
        ...(asset.model ? { model: asset.model } : {}),
        ...(asset.conversationId ? { conversation_id: asset.conversationId } : {}),
        operation: 'inpaint',
        source_image: { b64_json: edit.sourceBase64 },
        mask_image: { b64_json: edit.maskBase64 },
        size: '1024x1024',
        n: 1,
        quality: 'standard',
        transparent_background: false,
      })
        .then(() => library.refresh())
        .catch((error: unknown) => {
          Alert.alert('Could not edit the image', toUserMessage(error, 'Try again in a moment.'));
        });
    },
    [handleCloseImage, library, previewImage],
  );

  const handleDeletePreview = useCallback(() => {
    const asset = previewImage;
    if (!asset) return;
    handleCloseImage();
    void (async () => {
      try {
        if (asset.conversationId) {
          await useChatStore.getState().deleteConversation(asset.conversationId);
        }
        await library.removeAsset(asset.id);
      } catch {
        Alert.alert('Delete failed', 'The image could not be deleted. Try again.');
      }
    })();
  }, [handleCloseImage, library, previewImage]);

  const handleShareAsset = useCallback(async (asset: LibraryAsset) => {
    try {
      const localUri = await downloadGeneratedFile(absoluteAssetUrl(asset.uri), asset.fileName);
      await shareFile(localUri);
    } catch {
      Alert.alert('Could not open this file', 'The file could not be downloaded. Try again.');
    }
  }, []);

  const handlePlayVideo = useCallback(
    async (asset: LibraryAsset) => {
      if (videoLoadingRef.current) return;
      videoLoadingRef.current = true;
      try {
        const player = await prepareLocalVideoPlayer(absoluteAssetUrl(asset.uri), c.black);
        setVideoPlayer({ player, label: asset.prompt ? `Video: ${asset.prompt}` : asset.fileName });
      } catch {
        Alert.alert('Could not play the video', 'Check your connection and try again.');
      } finally {
        videoLoadingRef.current = false;
      }
    },
    [c.black],
  );

  const handleCloseVideo = useCallback(() => setVideoPlayer(null), []);

  const router = useRouter();
  const handleAddToChat = useCallback(
    (asset: LibraryAsset) => {
      stageComposerAttachments('new-chat', [
        {
          id: `library-${asset.id}`,
          uri: asset.uri,
          mimeType: asset.mimeType,
          fileName: asset.fileName,
          ...(asset.byteCount != null ? { fileSize: asset.byteCount } : {}),
          assetId: asset.id,
        },
      ]);
      router.push('/(app)/(tabs)/chat' as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  const handleRemix = useCallback(
    (asset: LibraryAsset) => {
      if (asset.model && listMediaModels('image').includes(asset.model)) {
        useChatViewStore.getState().setMediaModel('image', asset.model);
      }
      if (!enterMediaMode('image')) {
        Alert.alert('Image generation is unavailable', 'No image model is available right now.');
        return;
      }
      if (asset.prompt?.trim() && clerkUserId) {
        setDraft('new-chat', asset.prompt, { scope: 'cloud', ownerId: clerkUserId });
      }
      handleAddToChat(asset);
    },
    [clerkUserId, handleAddToChat],
  );

  const handleDeleteAsset = useCallback(
    (asset: LibraryAsset) => {
      Alert.alert('Delete from Library?', `“${asset.fileName}” moves to deleted items.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void library.removeAsset(asset.id).catch(() => {
              Alert.alert('Delete failed', 'The file could not be deleted. Try again.');
            });
          },
        },
      ]);
    },
    [library],
  );

  const handleRestoreAsset = useCallback(
    (asset: LibraryAsset) => {
      void library.restoreAsset(asset.id).catch(() => {
        Alert.alert('Restore failed', 'The file could not be restored. Try again.');
      });
    },
    [library],
  );

  const handlePermanentDelete = useCallback(
    (asset: LibraryAsset) => {
      Alert.alert(
        'Delete permanently?',
        `“${asset.fileName}” is erased now instead of after 30 days. This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete permanently',
            style: 'destructive',
            onPress: () => {
              void library.permanentlyDeleteAsset(asset.id).catch(() => {
                Alert.alert('Delete failed', 'The file could not be deleted. Try again.');
              });
            },
          },
        ],
      );
    },
    [library],
  );

  const handleAssetActions = useCallback(
    (asset: LibraryAsset) => {
      if (showDeleted) {
        Alert.alert(asset.fileName, undefined, [
          { text: 'Restore', onPress: () => handleRestoreAsset(asset) },
          {
            text: 'Delete permanently',
            style: 'destructive',
            onPress: () => handlePermanentDelete(asset),
          },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }
      Alert.alert(asset.fileName, undefined, [
        ...(appMode === 'cloud' && asset.kind !== 'video'
          ? [{ text: 'Add to chat', onPress: () => handleAddToChat(asset) }]
          : []),
        ...(appMode === 'cloud' && asset.kind === 'image'
          ? [{ text: 'Remix', onPress: () => handleRemix(asset) }]
          : []),
        { text: 'Share', onPress: () => void handleShareAsset(asset) },
        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteAsset(asset) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [
      appMode,
      handleAddToChat,
      handleDeleteAsset,
      handleRemix,
      handlePermanentDelete,
      handleRestoreAsset,
      handleShareAsset,
      showDeleted,
    ],
  );

  const toggleSelected = useCallback((id: string) => {
    if (!isAccountScopedUiStateOwned(selectionScopeRef.current)) return;
    setSelectedIds((current) => {
      if (current === null) return null;
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllShown = useCallback(() => {
    if (!isAccountScopedUiStateOwned(selectionScopeRef.current)) return;
    setSelectedIds(new Set(rows.filter((row) => row.row === 'asset').map((row) => row.id)));
  }, [rows]);

  const shareSelected = useCallback(() => {
    if (!isAccountScopedUiStateOwned(selectionScopeRef.current) || selectedIds?.size !== 1) return;
    const asset = library.assets.find((candidate) => selectedIds.has(candidate.id));
    if (asset) void handleShareAsset(asset);
  }, [handleShareAsset, library.assets, selectedIds]);

  const deleteSelected = useCallback(() => {
    const scope = selectionScopeRef.current;
    if (!isAccountScopedUiStateOwned(scope) || !selectedIds?.size) return;
    const assets = library.assets.filter((asset) => selectedIds.has(asset.id));
    if (!assets.length) return;
    Alert.alert('Delete saved files?', `${assets.length} saved files move to deleted items.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (selectionScopeRef.current !== scope || !isAccountScopedUiStateOwned(scope)) return;
          void (async () => {
            setDeletingSelected(true);
            let failures = 0;
            for (const asset of assets) {
              if (selectionScopeRef.current !== scope || !isAccountScopedUiStateOwned(scope)) break;
              try {
                await library.removeAsset(asset.id);
                if (selectionScopeRef.current !== scope || !isAccountScopedUiStateOwned(scope))
                  break;
                setSelectedIds((current) => {
                  if (current === null) return null;
                  const next = new Set(current);
                  next.delete(asset.id);
                  return next;
                });
              } catch {
                failures += 1;
              }
            }
            if (selectionScopeRef.current === scope && isAccountScopedUiStateOwned(scope)) {
              setDeletingSelected(false);
              if (failures) Alert.alert('Some files could not be deleted', 'Try again.');
              else endSelection();
            }
          })();
        },
      },
    ]);
  }, [endSelection, library, selectedIds]);

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
      const onLongPress = () =>
        selectionActive ? toggleSelected(asset.id) : handleAssetActions(asset);
      const onPress = () => toggleSelected(asset.id);
      if (showDeleted) {
        return (
          <LibraryFileCard
            asset={asset}
            width={cardWidth}
            style={style}
            selectionMode={false}
            selected={false}
            onPress={() => handleAssetActions(asset)}
            onLongPress={() => handleAssetActions(asset)}
          />
        );
      }
      if (asset.kind === 'image') {
        return (
          <LibraryImageCard
            asset={asset}
            width={cardWidth}
            style={style}
            selectionMode={selectionActive}
            selected={selectedIds?.has(asset.id) ?? false}
            onPress={selectionActive ? onPress : () => handleOpenImage(asset)}
            onLongPress={onLongPress}
          />
        );
      }
      return (
        <LibraryFileCard
          asset={asset}
          width={cardWidth}
          style={style}
          selectionMode={selectionActive}
          selected={selectedIds?.has(asset.id) ?? false}
          onPress={
            selectionActive
              ? onPress
              : asset.kind === 'video'
                ? () => void handlePlayVideo(asset)
                : () => void handleShareAsset(asset)
          }
          onLongPress={onLongPress}
        />
      );
    },
    [
      cardWidth,
      gridColumns,
      handleAssetActions,
      handleOpenImage,
      handlePlayVideo,
      handleShareAsset,
      selectedIds,
      selectionActive,
      showDeleted,
      toggleSelected,
    ],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }} edges={['top']}>
      <View className="h-12 flex-row items-center px-3 gap-2">
        <DrawerButton testID="library-open-drawer" onPress={openDrawer} />
        <Text
          style={{ flex: 1, color: c.textPrimary, fontSize: typeScale.headline, fontWeight: '700' }}
        >
          Library
        </Text>
        <Pressable
          onPress={selectionActive ? endSelection : openLibraryOptions}
          accessibilityRole="button"
          accessibilityLabel={selectionActive ? 'Done selecting files' : 'Library options'}
          accessibilityHint={selectionActive ? undefined : 'Select or sort saved files'}
          style={{ minWidth: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          {selectionActive ? (
            <Text style={{ color: c.teal, fontWeight: '600' }}>Done</Text>
          ) : (
            <MoreHorizontal size={22} color={c.textPrimary} />
          )}
        </Pressable>
      </View>

      {/* Horizontally scrollable, not a fixed row. The labels already overflow
          a 375pt screen at the default text size, and at any accessibility
          size the last filter was pushed off-screen with no way to reach it. */}
      {showDeleted ? (
        <Text
          testID="library-deleted-heading"
          style={{
            color: c.textMuted,
            fontSize: typeScale.footnote,
            paddingHorizontal: 16,
            paddingBottom: 12,
          }}
        >
          Recently deleted. Files are erased 30 days after you delete them. Long press to restore.
        </Text>
      ) : null}

      {!selectionActive && !showDeleted ? (
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
            label="Uploads"
            active={filter === 'uploads'}
            onPress={() => setFilter('uploads')}
          />
          <FilterChip
            label="Generated files"
            active={filter === 'generated'}
            onPress={() => setFilter('generated')}
          />
          <FilterChip
            label="Artifacts"
            active={filter === 'artifacts'}
            onPress={() => setFilter('artifacts')}
          />
        </ScrollView>
      ) : null}

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
          <>
            {library.error ? (
              <LibraryNotice
                testID="library-error"
                text={
                  library.showingCachedPage
                    ? `Showing the last synced page · ${library.error}`
                    : library.error
                }
              />
            ) : null}
            {!showDeleted && library.storageUsedBytes !== null ? (
              <Text
                testID="library-storage-used"
                style={{ color: c.textMuted, fontSize: typeScale.caption, marginBottom: 12 }}
              >
                {library.storageLimitBytes !== null
                  ? `${formatBytes(library.storageUsedBytes, 1)} of ${formatBytes(library.storageLimitBytes, 0)} file storage used`
                  : `${formatBytes(library.storageUsedBytes, 1)} of file storage used`}
              </Text>
            ) : null}
            {appMode === 'cloud' &&
            !showDeleted &&
            !library.signedOut &&
            GENERATION_FILTERS.has(filter) ? (
              <MediaJobsSection
                onOpenConversation={(conversationId) =>
                  router.push({ pathname: '/(app)/chat/[id]', params: { id: conversationId } })
                }
              />
            ) : null}
          </>
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
            <LibraryEmptyState
              filter={filter}
              query={search}
              signedOut={library.signedOut}
              showDeleted={showDeleted}
            />
          )
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      {/* Bottom-anchored, not between the chips and the grid. Both references
          float search as a pill under the thumb and the chats list already
          shipped that treatment. */}
      {selectionActive ? (
        <View
          testID="library-selection-actions"
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: insets.bottom + 12,
            gap: 12,
            borderTopWidth: 1,
            borderTopColor: c.border,
          }}
        >
          <Text style={{ color: c.textPrimary, fontWeight: '600' }}>
            {selectedIds?.size ?? 0} selected
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <Pressable
              testID="library-select-all-shown"
              accessibilityRole="button"
              onPress={selectAllShown}
              disabled={deletingSelected}
            >
              <Text style={{ color: c.teal }}>Select all shown</Text>
            </Pressable>
            <Pressable
              testID="library-share-selected"
              accessibilityRole="button"
              accessibilityState={{ disabled: deletingSelected || selectedIds?.size !== 1 }}
              disabled={deletingSelected || selectedIds?.size !== 1}
              onPress={shareSelected}
            >
              <Text style={{ color: c.teal, opacity: selectedIds?.size === 1 ? 1 : 0.5 }}>
                Share
              </Text>
            </Pressable>
            <Pressable
              testID="library-delete-selected"
              accessibilityRole="button"
              accessibilityState={{ disabled: deletingSelected || !selectedIds?.size }}
              disabled={deletingSelected || !selectedIds?.size}
              onPress={deleteSelected}
            >
              <Text style={{ color: c.agentError, opacity: selectedIds?.size ? 1 : 0.5 }}>
                Delete
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <BottomSearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search library"
          accessibilityLabel="Search library"
          clearAccessibilityLabel="Clear library search"
          testID="library-search"
        />
      )}

      <ImageFullScreen
        imageUrl={previewImage?.uri ?? null}
        prompt={previewImage?.prompt ?? undefined}
        visible={previewImage !== null}
        onClose={handleCloseImage}
        onEditArea={appMode === 'cloud' && FEATURES.imageGen ? handleEditPreviewArea : undefined}
        onDelete={appMode === 'cloud' ? handleDeletePreview : undefined}
        deleteMessage={
          previewImage?.conversationId
            ? 'Deleting this image also deletes the chat it was made in, with all of its messages.'
            : 'The image moves to deleted items in your Library.'
        }
      />

      <VideoPlayerModal
        player={videoPlayer?.player ?? null}
        visible={videoPlayer !== null}
        onClose={handleCloseVideo}
        label={videoPlayer?.label ?? 'Video'}
        failureHint="Long-press the video and choose Share to open it in another app."
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
  showDeleted,
}: {
  filter: LibraryFilter;
  query: string;
  signedOut: boolean;
  showDeleted: boolean;
}) {
  const c = useThemeColors();
  const copy = signedOut
    ? 'Sign in to see the images, videos, and files saved to your account.'
    : showDeleted
      ? 'Nothing deleted in the last 30 days'
      : filter === 'uploads' && !query.trim()
        ? 'Files you upload will appear here'
        : filter === 'generated' && !query.trim()
          ? 'Files AGI creates for you will appear here'
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
  selectionMode,
  selected,
  onPress,
  onLongPress,
}: {
  asset: LibraryAsset;
  width: number;
  style?: object;
  selectionMode: boolean;
  selected: boolean;
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
      accessibilityLabel={
        selectionMode
          ? `${selected ? 'Deselect' : 'Select'} ${asset.fileName}`
          : `Open ${asset.fileName}`
      }
      accessibilityHint={selectionMode ? undefined : 'Long press for share and delete'}
      accessibilityState={{ selected }}
    >
      <View
        style={{
          height: previewHeight,
          borderRadius: 16,
          borderCurve: 'continuous',
          backgroundColor: c.surfaceElevated,
          borderWidth: 1,
          borderColor: selected ? c.teal : c.border,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: 16,
        }}
      >
        {selectionMode ? (
          <View
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              width: 24,
              height: 24,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: selected ? c.teal : c.textMuted,
              backgroundColor: selected ? c.teal : c.surfaceElevated,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {selected ? <Check size={15} color={c.accentText} /> : null}
          </View>
        ) : null}
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
          style={{
            color: c.textPrimary,
            fontSize: typeScale.footnote,
            lineHeight: 18,
            textAlign: 'center',
          }}
        >
          {asset.fileName}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        style={{
          color: c.textPrimary,
          fontSize: typeScale.subhead,
          fontWeight: '600',
          marginTop: 9,
        }}
      >
        {asset.fileName}
      </Text>
      <Text
        numberOfLines={1}
        style={{ color: c.textMuted, fontSize: typeScale.caption, marginTop: 3 }}
      >
        {formatAssetSize(asset.byteCount)} · {asset.sourceLabel}
      </Text>
    </Pressable>
  );
}

function LibraryImageCard({
  asset,
  width,
  style,
  selectionMode,
  selected,
  onPress,
  onLongPress,
}: {
  asset: LibraryAsset;
  width: number;
  style?: object;
  selectionMode: boolean;
  selected: boolean;
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
      accessibilityLabel={
        selectionMode
          ? `${selected ? 'Deselect' : 'Select'} ${asset.fileName}`
          : `Open image ${asset.prompt ?? asset.fileName}`.trim()
      }
      accessibilityHint={selectionMode ? undefined : 'Long press for share and delete'}
      accessibilityState={{ selected }}
      accessibilityRole="button"
    >
      <View
        className="rounded-2xl border overflow-hidden"
        style={{
          width,
          height,
          backgroundColor: c.surfaceElevated,
          borderColor: selected ? c.teal : c.border,
        }}
      >
        {selectionMode ? (
          <View
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              zIndex: zIndex.control,
              width: 24,
              height: 24,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: selected ? c.teal : c.textMuted,
              backgroundColor: selected ? c.teal : c.surfaceElevated,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {selected ? <Check size={15} color={c.accentText} /> : null}
          </View>
        ) : null}
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
            <Text style={{ color: c.textMuted, fontSize: typeScale.caption, textAlign: 'center' }}>
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
            className="text-xs leading-[14px]"
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
