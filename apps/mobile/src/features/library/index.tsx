import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { useNavigation } from 'expo-router';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { BookImage, FileText, ImageIcon, Sparkles } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { useThemeColors } from '@/src/ui/theme';
import { BottomSearchBar } from '@/src/shared/components/BottomSearchBar';
import { DrawerButton } from '@/src/shared/components/DrawerButton';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';
import { useChatStore } from '@/stores/chatStore';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { executionModeForConversation } from '@/src/features/chat/utils/conversationMode';
import {
  useArtifactStore,
  accentColorForKind,
  mergeMobileArtifactsForGallery,
} from '@/src/features/artifacts/store';
import type { MobileArtifact } from '@/src/features/artifacts/types';
import { ImageFullScreen } from '@/src/features/chat/components/ImageFullScreen';
import { collectGeneratedImages, type LibraryImage } from './collectGeneratedImages';
import { useGeneratedImageSource } from '@/src/features/image/hooks/useGeneratedImageSource';
import { useAuthStore } from '@/src/features/auth/store';
import {
  captureAccountScopedUiState,
  isAccountScopedUiStateOwned,
  type AccountScopedUiState,
} from '@/src/features/auth/services/accountScopedUiState';
import {
  collectSearchableMobileFiles,
  type SearchableMobileFile,
} from '@/src/features/search/mobileGlobalSearch';
import {
  MAX_GRID_CONTENT_WIDTH,
  useResponsiveLayout,
} from '@/src/shared/hooks/useResponsiveLayout';

const CARD_GAP = 14;
const HORIZONTAL_PADDING = 16;

type LibraryFilter = 'all' | 'images' | 'documents' | 'artifacts';

type LibraryItem =
  | { kind: 'image'; id: string; image: LibraryImage }
  | { kind: 'document'; id: string; document: SearchableMobileFile }
  | { kind: 'artifact'; id: string; artifact: MobileArtifact };

export function LibraryScreen({ initialImageId }: { initialImageId?: string }) {
  const c = useThemeColors();
  const navigation = useNavigation();
  const router = useRouter();
  const { contentWidth, gridColumns } = useResponsiveLayout();
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [query, setQuery] = useState('');
  const [previewImage, setPreviewImage] = useState<LibraryImage | null>(null);
  const previewImageScopeRef = useRef<AccountScopedUiState | null>(null);
  const openedInitialImageRef = useRef<string | null>(null);

  const appMode = useChatAppModeStore((s) => s.appMode);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const localConversations = useChatStore((s) => s.conversations);
  const localMessages = useChatStore((s) => s.messages);
  const cloudConversations = useChatCloudMessageStore((s) => s.conversations);
  const cloudMessages = useChatCloudMessageStore((s) => s.messages);
  const storedArtifacts = useArtifactStore((s) => s.artifacts);
  const cloudArtifacts = useArtifactStore((s) => s.cloudArtifacts);
  const cloudArtifactsOwnerId = useArtifactStore((s) => s.cloudArtifactsOwnerId);

  useLayoutEffect(() => {
    if (!previewImage) return;
    if (isAccountScopedUiStateOwned(previewImageScopeRef.current)) return;
    previewImageScopeRef.current = null;
    setPreviewImage(null);
  }, [clerkUserId, cloudMessages, previewImage]);

  const activeTranscript = useMemo(() => {
    if (appMode === 'cloud') {
      return { conversations: cloudConversations, messages: cloudMessages };
    }
    const conversations = localConversations.filter(
      (conversation) => executionModeForConversation(conversation) === 'local',
    );
    return { conversations, messages: localMessages };
  }, [appMode, localConversations, localMessages, cloudConversations, cloudMessages]);

  const generatedImages = useMemo(
    () => collectGeneratedImages(activeTranscript.conversations, activeTranscript.messages),
    [activeTranscript],
  );

  const documents = useMemo(
    () =>
      collectSearchableMobileFiles(
        activeTranscript.conversations,
        activeTranscript.messages,
      ).filter((file) => !file.mimeType.startsWith('image/')),
    [activeTranscript],
  );

  const artifacts = useMemo(
    () =>
      mergeMobileArtifactsForGallery(storedArtifacts, cloudArtifacts, c, cloudArtifactsOwnerId)
        .filter((artifact) => artifact.provenance?.scope === appMode)
        // Generated images already render as first-class image cards above.
        .filter((artifact) => artifact.kind !== 'image')
        .map((a) => ({
          ...a,
          accentColor: accentColorForKind(a.kind, c),
        })),
    [appMode, cloudArtifacts, cloudArtifactsOwnerId, storedArtifacts, c],
  );

  const items = useMemo<LibraryItem[]>(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const includesQuery = (...values: Array<string | undefined>) =>
      !normalizedQuery ||
      values.some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
    const imageItems: LibraryItem[] =
      filter === 'artifacts' || filter === 'documents'
        ? []
        : generatedImages
            .filter((image) => includesQuery(image.prompt, image.sourceLabel))
            .map((image) => ({ kind: 'image' as const, id: image.id, image }));
    const documentItems: LibraryItem[] =
      filter === 'images' || filter === 'artifacts'
        ? []
        : documents
            .filter((document) =>
              includesQuery(document.fileName, document.mimeType, document.conversationTitle),
            )
            .map((document) => ({
              kind: 'document' as const,
              id: document.id,
              document,
            }));
    const artifactItems: LibraryItem[] =
      filter === 'images' || filter === 'documents'
        ? []
        : artifacts
            .filter((artifact) =>
              includesQuery(
                artifact.title,
                artifact.content,
                artifact.kind,
                artifact.language,
                artifact.sourceLabel,
              ),
            )
            .map((artifact) => ({
              kind: 'artifact' as const,
              id: artifact.id,
              artifact,
            }));
    return [...imageItems, ...documentItems, ...artifactItems];
  }, [filter, generatedImages, documents, artifacts, query]);

  const openDrawer = useCallback(() => {
    openNearestDrawer(navigation);
  }, [navigation]);

  const gridWidth = Math.min(contentWidth, MAX_GRID_CONTENT_WIDTH) - HORIZONTAL_PADDING * 2;
  const cardWidth = Math.floor((gridWidth - CARD_GAP * (gridColumns - 1)) / gridColumns);

  const keyExtractor = useCallback((item: LibraryItem) => `${item.kind}-${item.id}`, []);

  const handleOpenImage = useCallback(
    (image: LibraryImage) => {
      const scope = captureAccountScopedUiState(appMode);
      if (!scope) return;
      previewImageScopeRef.current = scope;
      setPreviewImage(image);
    },
    [appMode],
  );

  const handleCloseImage = useCallback(() => {
    previewImageScopeRef.current = null;
    setPreviewImage(null);
  }, []);

  useEffect(() => {
    if (!initialImageId || openedInitialImageRef.current === initialImageId) return;
    const image = generatedImages.find((candidate) => candidate.id === initialImageId);
    if (!image) return;
    openedInitialImageRef.current = initialImageId;
    handleOpenImage(image);
  }, [generatedImages, handleOpenImage, initialImageId]);

  const renderItem = useCallback(
    ({ item, index }: { item: LibraryItem; index: number }) => {
      const style = index % gridColumns !== 0 ? { marginLeft: CARD_GAP } : undefined;
      if (item.kind === 'image') {
        return (
          <LibraryImageCard
            image={item.image}
            width={cardWidth}
            style={style}
            onPress={() => handleOpenImage(item.image)}
          />
        );
      }
      if (item.kind === 'document') {
        return (
          <LibraryDocumentCard
            document={item.document}
            width={cardWidth}
            style={style}
            onPress={() =>
              router.push({
                pathname: '/(app)/chat/[id]',
                params: { id: item.document.conversationId },
              })
            }
          />
        );
      }
      return <LibraryArtifactCard artifact={item.artifact} width={cardWidth} style={style} />;
    },
    [cardWidth, gridColumns, handleOpenImage, router],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }} edges={['top']}>
      <View className="h-12 flex-row items-center px-3 gap-2">
        <DrawerButton testID="library-open-drawer" onPress={openDrawer} />
        <Text style={{ flex: 1, color: c.textPrimary, fontSize: 17, fontWeight: '700' }}>
          Library
        </Text>
      </View>

      {/* Horizontally scrollable, not a fixed row. The four labels already
          total ~316pt plus gutters against a 375pt screen, so at any
          accessibility text size — or with a fifth filter — "Artifacts" was
          pushed off-screen with no way to reach it. The 16pt content padding
          keeps the same gutter as the search field below, and the 16pt bottom
          padding keeps the standard vertical rhythm between the two controls
          (12pt read as one crowded group). */}
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
        data={items}
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
        ListEmptyComponent={<LibraryEmptyState filter={filter} query={query} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />

      {/* Bottom-anchored, not between the chips and the grid. Both references
          float search as a pill under the thumb (IMG_0690, IMG_0753) and the
          chats list already shipped that treatment — sitting at the top here
          cost ~56pt of first-screen grid and made two sibling list screens
          contradict each other. */}
      <BottomSearchBar
        value={query}
        onChangeText={setQuery}
        placeholder="Search library"
        accessibilityLabel="Search library"
        clearAccessibilityLabel="Clear library search"
        testID="library-search"
      />

      <ImageFullScreen
        imageUrl={previewImage?.imageUrl ?? null}
        prompt={previewImage?.prompt}
        visible={previewImage !== null}
        onClose={handleCloseImage}
      />
    </SafeAreaView>
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

function LibraryEmptyState({ filter, query }: { filter: LibraryFilter; query: string }) {
  const c = useThemeColors();
  const copy = query.trim()
    ? `Nothing in ${filter === 'all' ? 'your Library' : filter} matches “${query.trim()}”`
    : filter === 'images'
      ? 'Images you generate in conversations will appear here'
      : filter === 'documents'
        ? 'Files you attach in conversations will appear here for reuse'
        : filter === 'artifacts'
          ? 'Artifacts you create in conversations will appear here'
          : 'Generated images, uploaded files, and artifacts from your conversations will appear here';
  return (
    <View testID="library-empty-state" className="flex-1 items-center justify-center py-20 px-8">
      <View
        className="w-16 h-16 rounded-full items-center justify-center mb-5"
        style={{ backgroundColor: c.surfaceElevated }}
      >
        <BookImage size={28} color={c.textSecondary} />
      </View>
      <Text className="text-[18px] font-semibold text-center mb-2" style={{ color: c.textPrimary }}>
        Nothing here yet
      </Text>
      <Text className="text-[14px] text-center leading-[20px]" style={{ color: c.textMuted }}>
        {copy}
      </Text>
    </View>
  );
}

function formatDocumentSize(size: number | undefined): string {
  if (size == null) return 'Stored attachment';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function LibraryDocumentCard({
  document,
  width,
  style,
  onPress,
}: {
  document: SearchableMobileFile;
  width: number;
  style?: object;
  onPress: () => void;
}) {
  const c = useThemeColors();
  const previewHeight = Math.max(120, Math.round(width * 0.72));

  return (
    <Pressable
      testID={`library-document-card-${document.id}`}
      onPress={onPress}
      style={[{ width, marginBottom: 20 }, style]}
      accessibilityRole="button"
      accessibilityLabel={`Open source chat for ${document.fileName}`}
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
          <FileText size={23} color={c.textPrimary} />
        </View>
        <Badge label="Document" color="gray" />
        <Text
          numberOfLines={2}
          style={{ color: c.textPrimary, fontSize: 13, lineHeight: 18, textAlign: 'center' }}
        >
          {document.fileName}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        style={{ color: c.textPrimary, fontSize: 14, fontWeight: '600', marginTop: 9 }}
      >
        {document.fileName}
      </Text>
      <Text numberOfLines={1} style={{ color: c.textMuted, fontSize: 12, marginTop: 3 }}>
        {formatDocumentSize(document.fileSize)} · {document.conversationTitle}
      </Text>
    </Pressable>
  );
}

function LibraryImageCard({
  image,
  width,
  style,
  onPress,
}: {
  image: LibraryImage;
  width: number;
  style?: object;
  onPress: () => void;
}) {
  const c = useThemeColors();
  const height = Math.max(120, Math.round(width * 0.9));
  const { source, status } = useGeneratedImageSource(image.imageUrl, false);
  return (
    <Pressable
      testID={`library-image-card-${image.id}`}
      onPress={onPress}
      className="active:opacity-80"
      style={[{ width, marginBottom: 20 }, style]}
      accessibilityLabel={`Open generated image ${image.prompt ?? ''}`.trim()}
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
            accessibilityLabel={image.prompt ?? 'Generated image'}
          />
        ) : (
          <View
            style={{
              width,
              height,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
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
        {image.sourceLabel}
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
        style={{
          height: previewHeight,
          backgroundColor: c.surfaceHover,
          borderColor: c.border,
        }}
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
