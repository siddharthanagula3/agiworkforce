import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { BookImage, ImageIcon, Menu, Sparkles } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { useThemeColors } from '@/src/ui/theme';
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

const NUM_COLUMNS = 2;
const CARD_GAP = 14;
const HORIZONTAL_PADDING = 16;

type LibraryFilter = 'all' | 'images' | 'artifacts';

type LibraryItem =
  | { kind: 'image'; id: string; image: LibraryImage }
  | { kind: 'artifact'; id: string; artifact: MobileArtifact };

export function LibraryScreen({ initialImageId }: { initialImageId?: string }) {
  const c = useThemeColors();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<LibraryFilter>('all');
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

  // ImageFullScreen keeps its own image object after the backing message cache
  // is cleared. Bind that object to the account epoch captured at open time so
  // account A's generated image cannot remain visible for account B.
  useLayoutEffect(() => {
    if (!previewImage) return;
    if (isAccountScopedUiStateOwned(previewImageScopeRef.current)) return;
    previewImageScopeRef.current = null;
    setPreviewImage(null);
  }, [clerkUserId, cloudMessages, previewImage]);

  const generatedImages = useMemo(() => {
    if (appMode === 'cloud') {
      return collectGeneratedImages(cloudConversations, cloudMessages);
    }
    const localOnly = localConversations.filter(
      (conversation) => executionModeForConversation(conversation) === 'local',
    );
    return collectGeneratedImages(localOnly, localMessages);
  }, [appMode, localConversations, localMessages, cloudConversations, cloudMessages]);

  // Artifacts are not currently mode-split on mobile (see useArtifactStore) —
  // Library mirrors the same set the Artifacts gallery screen shows today.
  const artifacts = useMemo(
    () =>
      mergeMobileArtifactsForGallery(storedArtifacts, cloudArtifacts, c, cloudArtifactsOwnerId)
        // Generated images already render as first-class image cards above.
        .filter((artifact) => artifact.kind !== 'image')
        .map((a) => ({
          ...a,
          accentColor: accentColorForKind(a.kind, c),
        })),
    [cloudArtifacts, cloudArtifactsOwnerId, storedArtifacts, c],
  );

  const items = useMemo<LibraryItem[]>(() => {
    const imageItems: LibraryItem[] =
      filter === 'artifacts'
        ? []
        : generatedImages.map((image) => ({ kind: 'image' as const, id: image.id, image }));
    const artifactItems: LibraryItem[] =
      filter === 'images'
        ? []
        : artifacts.map((artifact) => ({ kind: 'artifact' as const, id: artifact.id, artifact }));
    return [...imageItems, ...artifactItems];
  }, [filter, generatedImages, artifacts]);

  const openDrawer = useCallback(() => {
    openNearestDrawer(navigation);
  }, [navigation]);

  const gridWidth = Math.min(width, 920) - HORIZONTAL_PADDING * 2;
  const cardWidth = Math.floor((gridWidth - CARD_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS);

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
      const style = index % NUM_COLUMNS !== 0 ? { marginLeft: CARD_GAP } : undefined;
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
      return <LibraryArtifactCard artifact={item.artifact} width={cardWidth} style={style} />;
    },
    [cardWidth, handleOpenImage],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }} edges={['top']}>
      <View className="h-12 flex-row items-center px-3 gap-2">
        <Pressable
          testID="library-open-drawer"
          onPress={openDrawer}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? c.surfaceHover : c.transparent,
          })}
          accessibilityLabel="Open navigation drawer"
          accessibilityRole="button"
          hitSlop={8}
        >
          <Menu size={20} color={c.textSecondary} />
        </Pressable>
        <Text style={{ flex: 1, color: c.textPrimary, fontSize: 17, fontWeight: '700' }}>
          Library
        </Text>
      </View>

      <View className="flex-row px-3 pb-3 gap-2">
        <FilterChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        <FilterChip
          label="Images"
          active={filter === 'images'}
          onPress={() => setFilter('images')}
        />
        <FilterChip
          label="Artifacts"
          active={filter === 'artifacts'}
          onPress={() => setFilter('artifacts')}
        />
      </View>

      <FlatList
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={NUM_COLUMNS}
        testID="library-grid"
        contentContainerStyle={{
          paddingHorizontal: HORIZONTAL_PADDING,
          paddingTop: 4,
          paddingBottom: 56,
          alignSelf: 'center',
          width: Math.min(width, 920),
        }}
        ListEmptyComponent={<LibraryEmptyState filter={filter} />}
        showsVerticalScrollIndicator={false}
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
      className="px-3 py-1.5 rounded-full"
      style={{
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

function LibraryEmptyState({ filter }: { filter: LibraryFilter }) {
  const c = useThemeColors();
  const copy =
    filter === 'images'
      ? 'Images you generate in conversations will appear here'
      : filter === 'artifacts'
        ? 'Artifacts you create in conversations will appear here'
        : 'Generated images and artifacts from your conversations will appear here';
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
