import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { stageComposerAttachments, stageComposerText } from '@/src/features/chat/composerHandoff';
import { enterMediaMode, listMediaModels } from '@/src/features/chat/actions/mediaMode';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { BookImage, Check, FileText, MoreHorizontal, Sparkles, Video } from 'lucide-react-native';
import {
  LIBRARY_DEFAULT_SORT,
  LIBRARY_SORTS,
  type LibrarySort,
} from '@agiworkforce/cloud-contracts';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { useTheme, useThemeColors } from '@/src/ui/theme';
import { HEADER_TEXT_SCALE_LIMIT, spacing, typeScale, zIndex } from '@/src/ui/theme/tokens';
import { BottomSearchBar } from '@/src/shared/components/BottomSearchBar';
import { DrawerButton } from '@/src/shared/components/DrawerButton';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  useArtifactStore,
  accentColorForKind,
  mergeMobileArtifactsForGallery,
} from '@/src/features/artifacts/store';
import type { MobileArtifact, MobileArtifactKind } from '@/src/features/artifacts/types';
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
import { FileViewerScreen } from '@/src/features/chat/components/artifact-viewers/FileViewerScreen';
import type { FileViewerSource } from '@/src/features/chat/components/artifact-viewers/ArtifactViewer';
import { formatAttachmentSize } from '@/src/features/chat/utils/attachmentSize';
import { ReportSheet } from '@/src/features/chat/components/ReportFlagButton';
import { reportAssetFor } from '@/services/contentReportAsset';
import { API_URL } from '@/lib/constants';
import {
  MAX_GRID_CONTENT_WIDTH,
  useResponsiveLayout,
} from '@/src/shared/hooks/useResponsiveLayout';
import type { LibraryAsset, LibraryScope } from './libraryClient';
import { useLibraryThumbnail } from './useLibraryThumbnail';
import { useLargeTextRows } from '@/src/shared/hooks/useLargeTextRows';
import { useLibraryAssets } from './useLibraryAssets';
import { MediaJobsSection } from './MediaJobsSection';
import { LibraryFeaturePromoSheet } from './LibraryFeaturePromoSheet';
import type { ImageAreaEdit } from '@/src/features/image/components/ImageAreaEditor';
import { generateImage } from '@/src/features/image/services/imagegen';
import { sharingWithProvidersAllowed } from '@/src/features/chat/actions/mediaGenerationConsent';
import { CloudProviderConsentRequiredError } from '@/services/llmGate';
import { showToast } from '@/src/shared/components/Toast';
import { toUserMessage } from '@/services/userMessage';
import { useChatStore } from '@/stores/chatStore';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { ActionMenuSheet } from '@/src/features/conversation-actions/RenameConversationModal';
import { useActionMenu } from '@/src/shared/hooks/useActionMenu';

const CARD_GAP = 14;
const TILE_PREVIEW_LINES = 4;
const HORIZONTAL_PADDING = 16;
const SEARCH_DEBOUNCE_MS = 350;
const LIBRARY_HEADER_SLOT_WIDTH = 56;
const SORT_LABELS: Record<LibrarySort, string> = {
  modified: 'Recently added',
  oldest: 'Oldest first',
  type: 'Type',
  name: 'Name',
  size: 'Size',
};

type ArtifactKindFilter = 'code' | 'charts' | 'research';

type LibraryFilter =
  | 'all'
  | 'images'
  | 'videos'
  | 'documents'
  | 'uploads'
  | 'generated'
  | 'artifacts'
  | ArtifactKindFilter;

const LIBRARY_FILTERS: ReadonlySet<string> = new Set<LibraryFilter>([
  'all',
  'images',
  'videos',
  'documents',
  'uploads',
  'generated',
  'artifacts',
  'code',
  'charts',
  'research',
]);

function isLibraryFilter(value: string | undefined): value is LibraryFilter {
  return value !== undefined && LIBRARY_FILTERS.has(value);
}

const ARTIFACT_KIND_FOR_FILTER: Record<ArtifactKindFilter, MobileArtifactKind> = {
  code: 'code',
  charts: 'chart',
  research: 'research',
};

function artifactKindForFilter(filter: LibraryFilter): MobileArtifactKind | null {
  return filter in ARTIFACT_KIND_FOR_FILTER
    ? ARTIFACT_KIND_FOR_FILTER[filter as ArtifactKindFilter]
    : null;
}

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

function libraryReportTarget(asset: LibraryAsset & { kind: 'image' | 'video' }) {
  return {
    messageId: asset.id,
    conversationId: asset.conversationId ?? `library:${asset.id}`,
    contentExcerpt: asset.prompt ?? '',
    asset: reportAssetFor(asset.kind, absoluteAssetUrl(asset.uri)),
  };
}

function isGeneratedMedia(
  asset: LibraryAsset,
): asset is LibraryAsset & { kind: 'image' | 'video' } {
  return (asset.kind === 'image' || asset.kind === 'video') && Boolean(asset.prompt || asset.model);
}

export function LibraryScreen({
  initialImageId,
  initialFilter,
}: {
  initialImageId?: string;
  initialFilter?: string;
}) {
  const { colors: c, isDark } = useTheme();
  const pageBackground = isDark ? c.background : c.surfaceBase;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { contentWidth, gridColumns: layoutColumns } = useResponsiveLayout();
  const largeText = useLargeTextRows();
  const gridColumns = largeText ? Math.max(1, layoutColumns - 1) : layoutColumns;
  const [filter, setFilter] = useState<LibraryFilter>(
    isLibraryFilter(initialFilter) ? initialFilter : 'all',
  );
  const [sort, setSort] = useState<LibrarySort>(LIBRARY_DEFAULT_SORT);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [previewImage, setPreviewImage] = useState<LibraryAsset | null>(null);
  const [reportedAsset, setReportedAsset] = useState<
    (LibraryAsset & { kind: 'image' | 'video' }) | null
  >(null);
  const previewImageScopeRef = useRef<AccountScopedUiState | null>(null);
  const [videoPlayer, setVideoPlayer] = useState<{
    player: LocalVideoPlayer;
    label: string;
    reportTarget?: ReturnType<typeof libraryReportTarget>;
  } | null>(null);
  const videoLoadingRef = useRef(false);
  const videoScopeRef = useRef<AccountScopedUiState | null>(null);
  const [openFile, setOpenFile] = useState<FileViewerSource | null>(null);
  const [openFileChatId, setOpenFileChatId] = useState<string | null>(null);
  const openFileScopeRef = useRef<AccountScopedUiState | null>(null);
  const selectionScopeRef = useRef<AccountScopedUiState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const openedInitialImageRef = useRef<string | null>(null);
  const actionMenu = useActionMenu();
  const openActionMenu = actionMenu.open;

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
  const revalidateRef = useRef(library.revalidate);
  revalidateRef.current = library.revalidate;
  const focusedBeforeRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (focusedBeforeRef.current) revalidateRef.current();
      focusedBeforeRef.current = true;
      setFilter(isLibraryFilter(initialFilter) ? initialFilter : 'all');
      return () => setFilter('all');
    }, [initialFilter]),
  );

  const downloadMeter =
    library.downloadUsedBytes != null && library.downloadLimitBytes != null
      ? { used: library.downloadUsedBytes, limit: library.downloadLimitBytes }
      : null;

  const selectionActive =
    selectedIds !== null && isAccountScopedUiStateOwned(selectionScopeRef.current);

  const openSortOptions = useCallback(() => {
    openActionMenu(
      'Sort saved files',
      LIBRARY_SORTS.map((value) => ({
        key: `sort-${value}`,
        label: SORT_LABELS[value],
        selected: sort === value,
        run: () => setSort(value),
      })),
      'Artifacts keep their own order.',
    );
  }, [openActionMenu, sort]);

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
    openActionMenu('Library', [
      ...(library.signedOut || showDeleted
        ? []
        : [{ key: 'select', label: 'Select saved files', run: beginSelection }]),
      { key: 'sort', label: 'Sort saved files', run: openSortOptions },
      ...(library.signedOut
        ? []
        : [
            showDeleted
              ? { key: 'back', label: 'Back to Library', run: () => setShowDeleted(false) }
              : {
                  key: 'deleted',
                  label: 'Recently deleted',
                  run: () => {
                    setFilter('all');
                    setShowDeleted(true);
                  },
                },
          ]),
    ]);
  }, [beginSelection, library.signedOut, openActionMenu, openSortOptions, showDeleted]);

  useLayoutEffect(() => {
    if (!previewImage) return;
    if (isAccountScopedUiStateOwned(previewImageScopeRef.current)) return;
    previewImageScopeRef.current = null;
    setPreviewImage(null);
  }, [clerkUserId, previewImage]);

  useLayoutEffect(() => {
    if (!videoPlayer) return;
    if (isAccountScopedUiStateOwned(videoScopeRef.current)) return;
    videoScopeRef.current = null;
    setVideoPlayer(null);
  }, [clerkUserId, videoPlayer]);

  useLayoutEffect(() => {
    if (!openFile) return;
    if (isAccountScopedUiStateOwned(openFileScopeRef.current)) return;
    openFileScopeRef.current = null;
    setOpenFile(null);
  }, [clerkUserId, openFile]);

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
    const artifactKind = artifactKindForFilter(filter);
    const assetRows: LibraryRow[] =
      (filter === 'artifacts' || artifactKind) && !showDeleted
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
            .filter((artifact) => !artifactKind || artifact.kind === artifactKind)
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
      const scope = previewImageScopeRef.current;
      void sharingWithProvidersAllowed()
        .then((allowed) => {
          if (!allowed) return;
          if (previewImageScopeRef.current !== scope || !isAccountScopedUiStateOwned(scope)) return;
          handleCloseImage();
          showToast('Editing the image. The new version appears in your Library.');
          return generateImage({
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
          }).then(() => library.refresh());
        })
        .catch((error: unknown) => {
          if (error instanceof CloudProviderConsentRequiredError) return;
          Alert.alert('Could not edit the image', toUserMessage(error, 'Try again in a moment.'));
        });
    },
    [handleCloseImage, library, previewImage],
  );

  const handleDeletePreview = useCallback(() => {
    const asset = previewImage;
    const scope = previewImageScopeRef.current;
    if (!asset || scope?.scope !== 'cloud' || !isAccountScopedUiStateOwned(scope)) return;
    void (async () => {
      try {
        if (
          asset.conversationId &&
          !(await useChatStore.getState().deleteConversation(asset.conversationId, scope.account))
        )
          return;
        if (!isAccountScopedUiStateOwned(scope)) return;
        await library.removeAsset(asset.id);
        if (scope === previewImageScopeRef.current && isAccountScopedUiStateOwned(scope)) {
          handleCloseImage();
        }
      } catch {
        if (isAccountScopedUiStateOwned(scope)) {
          Alert.alert('Delete failed', 'The image could not be deleted. Try again.');
        }
      }
    })();
  }, [handleCloseImage, library, previewImage]);

  const handleShareAsset = useCallback(async (asset: LibraryAsset) => {
    const scope = captureAccountScopedUiState('cloud');
    if (!scope) return;
    const isCurrent = () => isAccountScopedUiStateOwned(scope);
    try {
      const localUri = await downloadGeneratedFile(absoluteAssetUrl(asset.uri), asset.fileName);
      await shareFile(localUri, { isCurrent });
    } catch (error) {
      if (!isCurrent()) return;
      Alert.alert(
        'Could not open this file',
        toUserMessage(error, 'The file could not be downloaded. Try again.'),
      );
    }
  }, []);

  const handleOpenFile = useCallback((asset: LibraryAsset) => {
    const scope = captureAccountScopedUiState('cloud');
    if (!scope) return;
    openFileScopeRef.current = scope;
    setOpenFileChatId(asset.conversationId ?? null);
    setOpenFile({
      title: asset.fileName,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      url: absoluteAssetUrl(asset.uri),
      ...(asset.byteCount ? { byteCount: asset.byteCount } : {}),
    });
  }, []);

  const isOpenFileCurrent = useCallback(
    () => isAccountScopedUiStateOwned(openFileScopeRef.current),
    [],
  );

  const handleCloseFile = useCallback(() => {
    openFileScopeRef.current = null;
    setOpenFile(null);
    setOpenFileChatId(null);
  }, []);

  const handlePlayVideo = useCallback(
    async (asset: LibraryAsset) => {
      if (videoLoadingRef.current) return;
      const scope = captureAccountScopedUiState('cloud');
      if (!scope) return;
      videoLoadingRef.current = true;
      try {
        const player = await prepareLocalVideoPlayer(absoluteAssetUrl(asset.uri), c.black);
        if (!isAccountScopedUiStateOwned(scope)) return;
        videoScopeRef.current = scope;
        setVideoPlayer({
          player,
          label: asset.prompt ? `Video: ${asset.prompt}` : asset.fileName,
          reportTarget: isGeneratedMedia(asset) ? libraryReportTarget(asset) : undefined,
        });
      } catch {
        if (!isAccountScopedUiStateOwned(scope)) return;
        Alert.alert('Could not play the video', 'Check your connection and try again.');
      } finally {
        videoLoadingRef.current = false;
      }
    },
    [c.black],
  );

  const handleCloseVideo = useCallback(() => {
    videoScopeRef.current = null;
    setVideoPlayer(null);
  }, []);

  const router = useRouter();
  const handleOpenFileChat = useCallback(() => {
    if (!openFileChatId) return;
    handleCloseFile();
    router.push(`/(app)/chat/${openFileChatId}` as Parameters<typeof router.push>[0]);
  }, [handleCloseFile, openFileChatId, router]);
  const handleOpenArtifact = useCallback(
    (artifact: MobileArtifact) => {
      router.push({ pathname: '/(app)/artifacts', params: { artifactId: artifact.id } });
    },
    [router],
  );
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
        stageComposerText('new-chat', asset.prompt);
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
        openActionMenu(asset.fileName, [
          { key: 'restore', label: 'Restore', run: () => handleRestoreAsset(asset) },
          {
            key: 'delete-permanently',
            label: 'Delete permanently',
            destructive: true,
            run: () => handlePermanentDelete(asset),
          },
        ]);
        return;
      }
      openActionMenu(asset.fileName, [
        ...(appMode === 'cloud' && asset.kind !== 'video'
          ? [{ key: 'add-to-chat', label: 'Add to chat', run: () => handleAddToChat(asset) }]
          : []),
        ...(appMode === 'cloud' && asset.kind === 'image'
          ? [{ key: 'remix', label: 'Remix', run: () => handleRemix(asset) }]
          : []),
        ...(asset.conversationId
          ? [
              {
                key: 'open-chat',
                label: 'Open chat',
                run: () =>
                  router.push(
                    `/(app)/chat/${asset.conversationId}` as Parameters<typeof router.push>[0],
                  ),
              },
            ]
          : []),
        { key: 'share', label: 'Share', run: () => void handleShareAsset(asset) },
        ...(isGeneratedMedia(asset)
          ? [{ key: 'report', label: 'Report', run: () => setReportedAsset(asset) }]
          : []),
        {
          key: 'delete',
          label: 'Delete',
          destructive: true,
          run: () => handleDeleteAsset(asset),
        },
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
      openActionMenu,
      router,
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
        return (
          <LibraryArtifactCard
            artifact={item.artifact}
            width={cardWidth}
            style={style}
            onPress={handleOpenArtifact}
          />
        );
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
                : () => handleOpenFile(asset)
          }
          onLongPress={onLongPress}
        />
      );
    },
    [
      cardWidth,
      gridColumns,
      handleAssetActions,
      handleOpenArtifact,
      handleOpenFile,
      handleOpenImage,
      handlePlayVideo,
      selectedIds,
      selectionActive,
      showDeleted,
      toggleSelected,
    ],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: pageBackground }} edges={['top']}>
      <View testID="library-header" className="min-h-12 flex-row items-center px-3 gap-2">
        <View style={{ width: LIBRARY_HEADER_SLOT_WIDTH, alignItems: 'flex-start' }}>
          <DrawerButton testID="library-open-drawer" onPress={openDrawer} />
        </View>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
          style={{
            flex: 1,
            color: c.textPrimary,
            fontSize: typeScale.headline,
            fontWeight: '600',
            textAlign: 'center',
          }}
        >
          Library
        </Text>
        <Pressable
          onPress={selectionActive ? endSelection : openLibraryOptions}
          accessibilityRole="button"
          accessibilityLabel={selectionActive ? 'Done selecting files' : 'Library options'}
          accessibilityHint={selectionActive ? undefined : 'Select or sort saved files'}
          style={{
            width: LIBRARY_HEADER_SLOT_WIDTH,
            height: 44,
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          {selectionActive ? (
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
              style={{ color: c.teal, fontWeight: '600' }}
            >
              Done
            </Text>
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
          Recently deleted. Erased after 30 days. Long press to restore.
        </Text>
      ) : null}

      {!selectionActive && !showDeleted ? (
        <ScrollView
          testID="library-filter-row"
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, flexShrink: 0 }}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: spacing.lg,
            gap: spacing.sm,
            alignItems: 'center',
          }}
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
          <FilterChip label="Code" active={filter === 'code'} onPress={() => setFilter('code')} />
          <FilterChip
            label="Charts"
            active={filter === 'charts'}
            onPress={() => setFilter('charts')}
          />
          <FilterChip
            label="Research"
            active={filter === 'research'}
            onPress={() => setFilter('research')}
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
            {!showDeleted && (library.storageUsedBytes != null || downloadMeter !== null) ? (
              <View style={{ gap: 2, marginBottom: 12 }}>
                {library.storageUsedBytes != null ? (
                  <Text
                    testID="library-storage-used"
                    numberOfLines={2}
                    maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
                    style={{ color: c.textMuted, fontSize: typeScale.caption }}
                  >
                    {library.storageLimitBytes != null
                      ? `${formatAttachmentSize(library.storageUsedBytes)} of ${formatAttachmentSize(library.storageLimitBytes)} file storage used`
                      : `${formatAttachmentSize(library.storageUsedBytes)} of file storage used`}
                  </Text>
                ) : null}
                {downloadMeter !== null ? (
                  <Text
                    testID="library-downloads-used"
                    numberOfLines={2}
                    maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
                    style={{ color: c.textMuted, fontSize: typeScale.caption }}
                  >
                    {`${formatAttachmentSize(downloadMeter.used)} of ${formatAttachmentSize(downloadMeter.limit)} file downloads used this month`}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {appMode === 'cloud' &&
            !showDeleted &&
            !library.signedOut &&
            GENERATION_FILTERS.has(filter) ? (
              <MediaJobsSection
                onJobsCompleted={library.refresh}
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
              <LoadingIndicator />
            </View>
          ) : null
        }
        ListEmptyComponent={
          library.loading ? (
            <View testID="library-loading" className="py-20 items-center">
              <LoadingIndicator />
            </View>
          ) : (
            <LibraryEmptyState
              filter={filter}
              query={search}
              signedOut={library.signedOut}
              showDeleted={showDeleted}
              failed={Boolean(library.error)}
              onRetry={library.refresh}
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
            testID="library-selection-buttons"
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              columnGap: 12,
              rowGap: 8,
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
          columnKind="grid"
        />
      )}

      <ImageFullScreen
        imageUrl={previewImage?.uri ?? null}
        prompt={previewImage?.prompt ?? undefined}
        visible={previewImage !== null}
        onClose={handleCloseImage}
        onEditArea={appMode === 'cloud' && FEATURES.imageGen ? handleEditPreviewArea : undefined}
        onDelete={appMode === 'cloud' ? handleDeletePreview : undefined}
        reportTarget={
          previewImage && isGeneratedMedia(previewImage)
            ? libraryReportTarget(previewImage)
            : undefined
        }
        deleteMessage={
          previewImage?.conversationId
            ? 'Deleting this image also deletes the chat it was made in, with all of its messages.'
            : 'The image moves to deleted items in your Library.'
        }
      />

      {reportedAsset ? (
        <ReportSheet
          visible
          onClose={() => setReportedAsset(null)}
          target={libraryReportTarget(reportedAsset)}
        />
      ) : null}

      <VideoPlayerModal
        player={videoPlayer?.player ?? null}
        visible={videoPlayer !== null}
        onClose={handleCloseVideo}
        label={videoPlayer?.label ?? 'Video'}
        reportTarget={videoPlayer?.reportTarget}
        failureHint="Long-press the video and choose Share to open it in another app."
      />

      <FileViewerScreen
        source={openFile}
        onClose={handleCloseFile}
        isCurrent={isOpenFileCurrent}
        {...(openFileChatId ? { onOpenChat: handleOpenFileChat } : {})}
      />

      <ActionMenuSheet menu={actionMenu.menu} dismissLabel="Dismiss Library actions" />

      <LibraryFeaturePromoSheet />
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
      <Text className="text-sm leading-[18px]" style={{ color: c.textPrimary }}>
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
      <Text className="text-sm font-medium" style={{ color: active ? c.teal : c.textSecondary }}>
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
  failed,
  onRetry,
}: {
  filter: LibraryFilter;
  query: string;
  signedOut: boolean;
  showDeleted: boolean;
  failed: boolean;
  onRetry: () => void;
}) {
  const c = useThemeColors();
  if (failed && !signedOut) {
    return (
      <View testID="library-load-failed" className="flex-1 items-center justify-center py-20 px-8">
        <View
          className="w-16 h-16 rounded-full items-center justify-center mb-5"
          style={{ backgroundColor: c.surfaceElevated }}
        >
          <BookImage size={28} color={c.textSecondary} />
        </View>
        <Text
          className="text-[18px] font-semibold text-center mb-2"
          style={{ color: c.textPrimary }}
        >
          {query.trim() ? 'Search could not be completed' : 'Library could not be loaded'}
        </Text>
        <Text
          className="text-[14px] text-center leading-[20px] mb-4"
          style={{ color: c.textMuted }}
        >
          Check your connection and try again.
        </Text>
        <Pressable
          testID="library-retry"
          accessibilityRole="button"
          accessibilityLabel="Retry"
          onPress={onRetry}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 }}
        >
          <Text style={{ color: c.teal, fontWeight: '600' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }
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
                    : filter === 'code'
                      ? 'Code you create in conversations will appear here'
                      : filter === 'charts'
                        ? 'Charts you create in conversations will appear here'
                        : filter === 'research'
                          ? 'Research you create in conversations will appear here'
                          : 'Your images, videos, files and artifacts will appear here';
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
  return formatAttachmentSize(size);
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
  const { fontScale } = useWindowDimensions();
  const previewHeight = Math.max(120, Math.round(width * 0.72));
  const isVideo = asset.kind === 'video';
  const showNameInTile = fontScale <= 1;

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
        testID={`library-${asset.kind}-tile-${asset.id}`}
        style={{
          height: previewHeight,
          borderRadius: 16,
          borderCurve: 'continuous',
          backgroundColor: c.surfaceElevated,
          borderWidth: 1,
          borderColor: selected ? c.teal : c.border,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 16,
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
          testID={`library-${asset.kind}-tile-content-${asset.id}`}
          style={{ flexShrink: 1, alignItems: 'center', gap: 10 }}
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
          {showNameInTile ? (
            <View
              testID={`library-${asset.kind}-tile-name-${asset.id}`}
              style={{ flexShrink: 1, overflow: 'hidden' }}
            >
              <Text
                numberOfLines={2}
                maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
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
          ) : null}
        </View>
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
  const thumbnail = useLibraryThumbnail(asset);
  const { source, status } = useGeneratedImageSource(thumbnail.uri, false);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const pictureFailed = failedUri === thumbnail.uri;
  const { fallBackToFullFile } = thumbnail;
  const handlePictureError = useCallback(() => {
    if (thumbnail.uri === asset.uri) setFailedUri(asset.uri);
    else fallBackToFullFile();
  }, [asset.uri, fallBackToFullFile, thumbnail.uri]);
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
        {status === 'ready' && source && !pictureFailed ? (
          <Image
            source={source}
            style={{ width, height }}
            contentFit="cover"
            transition={150}
            cachePolicy="memory"
            onError={handlePictureError}
            accessibilityLabel={asset.prompt ?? asset.fileName}
          />
        ) : (
          <View
            style={{ width, height, alignItems: 'center', justifyContent: 'center', padding: 16 }}
          >
            <Text
              numberOfLines={3}
              maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
              style={{ color: c.textMuted, fontSize: typeScale.caption, textAlign: 'center' }}
            >
              {status === 'signed-out'
                ? 'Sign in to view'
                : status === 'authorizing'
                  ? 'Loading image…'
                  : 'Image unavailable'}
            </Text>
          </View>
        )}
      </View>
      <Text className="text-sm mt-2" style={{ color: c.textMuted }} numberOfLines={1}>
        {asset.prompt ?? asset.sourceLabel}
      </Text>
    </Pressable>
  );
}

function LibraryArtifactCard({
  artifact,
  width,
  style,
  onPress,
}: {
  artifact: MobileArtifact;
  width: number;
  style?: object;
  onPress: (artifact: MobileArtifact) => void;
}) {
  const c = useThemeColors();
  const previewHeight = Math.max(120, Math.round(width * 0.72));
  return (
    <Pressable
      testID={`library-artifact-card-${artifact.id}`}
      onPress={() => onPress(artifact)}
      className="active:opacity-80"
      style={[{ width, marginBottom: 20 }, style]}
      accessibilityLabel={`Open artifact ${artifact.title}, ${artifact.ageLabel}`}
      accessibilityRole="button"
    >
      <View
        testID={`library-artifact-tile-${artifact.id}`}
        className="rounded-2xl border overflow-hidden"
        style={{ height: previewHeight, backgroundColor: c.surfaceHover, borderColor: c.border }}
      >
        <View
          testID={`library-artifact-kind-row-${artifact.id}`}
          className="flex-row items-center gap-1.5 px-3 pt-3"
        >
          <Sparkles size={12} color={artifact.accentColor} />
          <Text
            testID={`library-artifact-kind-${artifact.id}`}
            numberOfLines={1}
            maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
            style={{
              flexShrink: 1,
              fontSize: typeScale.caption,
              color: c.textSecondary,
              textTransform: 'uppercase',
            }}
          >
            {artifact.language ?? artifact.kind}
          </Text>
        </View>
        <View
          testID={`library-artifact-preview-${artifact.id}`}
          className="flex-1 justify-end px-3 pb-3 mt-2 overflow-hidden"
        >
          {artifact.previewLines.slice(0, TILE_PREVIEW_LINES).map((line, index) => (
            <Text
              key={`${artifact.id}-${index}`}
              className="text-sm leading-[18px]"
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
      </View>
      <Text
        className="text-[15px] leading-[20px] mt-2.5 font-semibold"
        style={{ color: c.textPrimary }}
        numberOfLines={2}
      >
        {artifact.title}
      </Text>
      <Text className="text-sm mt-1" style={{ color: c.textMuted }} numberOfLines={1}>
        {artifact.ageLabel}
      </Text>
    </Pressable>
  );
}

export default LibraryScreen;
