import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Platform, ScrollView, Share, View } from 'react-native';
import { Image } from 'expo-image';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
// From `expo-router`, not `@react-navigation/native` — see the note in
// app/(app)/(tabs)/chat.tsx: the monorepo resolves several copies of the
// navigation package, so the raw hook can land on a different context
// instance than the one expo-router's navigator provides.
import { useNavigation } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BarChart3,
  BookOpen,
  Check,
  Code2,
  Copy,
  FileText,
  ImageIcon,
  Menu,
  Share2,
  Sparkles,
  X,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { copyToClipboard } from '@/lib/clipboard';
import { useThemeColors } from '@/src/ui/theme';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';
import { useArtifactStore, accentColorForKind, mergeMobileArtifactsForGallery } from './store';
import type { MobileArtifact, MobileArtifactKind } from './types';
import { GeneratedImage } from '@/src/features/chat/components/GeneratedImage';
import { useGeneratedImageSource } from '@/src/features/image/hooks/useGeneratedImageSource';
import { renderMarkdownContent } from '@/src/features/chat/components/MessageContentRenderer';
import { useAuthStore } from '@/src/features/auth/store';
import {
  captureAccountScopedUiState,
  isAccountScopedUiStateOwned,
  type AccountScopedUiState,
} from '@/src/features/auth/services/accountScopedUiState';
import {
  MAX_GRID_CONTENT_WIDTH,
  useResponsiveLayout,
} from '@/src/shared/hooks/useResponsiveLayout';

interface ArtifactsGalleryScreenProps {
  initialLoading?: boolean;
  initialArtifactId?: string;
}

const CARD_GAP = 14;
const HORIZONTAL_PADDING = 16;

// ---------------------------------------------------------------------------
// Kind → badge config
// ---------------------------------------------------------------------------

type BadgeTone = 'teal' | 'terra-cotta' | 'green' | 'red' | 'yellow' | 'purple' | 'blue' | 'gray';

const KIND_BADGE: Record<MobileArtifactKind, BadgeTone> = {
  code: 'teal',
  chart: 'yellow',
  research: 'purple',
  document: 'gray',
  image: 'terra-cotta',
};

const KIND_ICON: Record<MobileArtifactKind, typeof FileText> = {
  code: Code2,
  chart: BarChart3,
  research: BookOpen,
  document: FileText,
  image: ImageIcon,
};

function badgeLabel(artifact: MobileArtifact): string {
  if (artifact.language) return artifact.language;
  return artifact.kind.charAt(0).toUpperCase() + artifact.kind.slice(1);
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function ArtifactsGalleryScreen({
  initialLoading = false,
  initialArtifactId,
}: ArtifactsGalleryScreenProps) {
  const c = useThemeColors();
  const navigation = useNavigation();
  const { contentWidth, gridColumns } = useResponsiveLayout();
  const [selectedArtifact, setSelectedArtifact] = useState<MobileArtifact | null>(null);
  const selectedArtifactScopeRef = useRef<AccountScopedUiState | null>(null);
  const openedInitialArtifactRef = useRef<string | null>(null);
  const [isLoading] = useState(initialLoading);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);

  // Live artifact list from the persistent store — user-created artifacts, newest first.
  const storedArtifacts = useArtifactStore((s) => s.artifacts);
  const cloudArtifacts = useArtifactStore((s) => s.cloudArtifacts);
  const cloudArtifactsOwnerId = useArtifactStore((s) => s.cloudArtifactsOwnerId);

  // The selected object outlives the store row that produced it. Close an
  // account-owned preview before paint when Clerk tears down/switches owners;
  // Local previews remain device-owned and survive Cloud account changes.
  useLayoutEffect(() => {
    if (!selectedArtifact) return;
    if (isAccountScopedUiStateOwned(selectedArtifactScopeRef.current)) return;
    selectedArtifactScopeRef.current = null;
    setSelectedArtifact(null);
  }, [clerkUserId, cloudArtifactsOwnerId, selectedArtifact]);

  // Reconcile the pulled Cloud overlay by canonical id/tombstone, then
  // re-derive colors so every card follows the active theme.
  const galleryArtifacts = useMemo(
    () =>
      mergeMobileArtifactsForGallery(storedArtifacts, cloudArtifacts, c, cloudArtifactsOwnerId).map(
        (a) => ({
          ...a,
          accentColor: accentColorForKind(a.kind, c),
        }),
      ),
    [cloudArtifacts, cloudArtifactsOwnerId, storedArtifacts, c],
  );

  const openDrawer = useCallback(() => {
    openNearestDrawer(navigation);
  }, [navigation]);

  const gridWidth = Math.min(contentWidth, MAX_GRID_CONTENT_WIDTH) - HORIZONTAL_PADDING * 2;
  const cardWidth = Math.floor((gridWidth - CARD_GAP * (gridColumns - 1)) / gridColumns);

  const listContentStyle = useMemo(
    () => ({
      paddingHorizontal: HORIZONTAL_PADDING,
      paddingTop: 18,
      paddingBottom: 56,
      alignSelf: 'center' as const,
      width: Math.min(contentWidth, MAX_GRID_CONTENT_WIDTH),
    }),
    [contentWidth],
  );

  const keyExtractor = useCallback((item: MobileArtifact) => item.id, []);

  const handleOpenArtifact = useCallback((artifact: MobileArtifact) => {
    const provenance = artifact.provenance;
    if (!provenance) return;
    const scope = captureAccountScopedUiState(provenance.scope);
    if (!scope) return;
    if (
      scope.scope === 'cloud' &&
      (provenance.scope !== 'cloud' || scope.account.ownerId !== provenance.ownerId)
    ) {
      return;
    }
    selectedArtifactScopeRef.current = scope;
    setSelectedArtifact(artifact);
  }, []);

  const handleCloseArtifact = useCallback(() => {
    selectedArtifactScopeRef.current = null;
    setSelectedArtifact(null);
  }, []);

  useEffect(() => {
    if (!initialArtifactId || openedInitialArtifactRef.current === initialArtifactId) return;
    const artifact = galleryArtifacts.find((candidate) => candidate.id === initialArtifactId);
    if (!artifact) return;
    openedInitialArtifactRef.current = initialArtifactId;
    handleOpenArtifact(artifact);
  }, [galleryArtifacts, handleOpenArtifact, initialArtifactId]);

  const renderItem = useCallback(
    ({ item, index }: { item: MobileArtifact; index: number }) => (
      <ArtifactCard
        artifact={item}
        width={cardWidth}
        onPress={handleOpenArtifact}
        style={index % gridColumns !== 0 ? { marginLeft: CARD_GAP } : undefined}
      />
    ),
    [cardWidth, gridColumns, handleOpenArtifact],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }} edges={['top']}>
      {/* Header bar */}
      <View className="h-12 flex-row items-center px-3 gap-2">
        <Pressable
          testID="artifacts-open-drawer"
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

        <Text
          style={{
            flex: 1,
            color: c.textPrimary,
            fontSize: 17,
            fontWeight: '700',
          }}
        >
          Artifacts
        </Text>
      </View>

      {isLoading ? (
        <ScrollView contentContainerStyle={listContentStyle} showsVerticalScrollIndicator={false}>
          <ArtifactsSkeletonGrid cardWidth={cardWidth} columns={gridColumns} />
        </ScrollView>
      ) : (
        <FlatList
          key={`artifacts-${gridColumns}`}
          data={galleryArtifacts}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          numColumns={gridColumns}
          testID="artifacts-grid"
          contentContainerStyle={listContentStyle}
          ListEmptyComponent={<ArtifactsEmptyState />}
          showsVerticalScrollIndicator={false}
        />
      )}

      <ArtifactPreviewModal artifact={selectedArtifact} onClose={handleCloseArtifact} />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function ArtifactsEmptyState() {
  const c = useThemeColors();
  return (
    <View testID="artifacts-empty-state" className="flex-1 items-center justify-center py-20 px-8">
      <View
        className="w-16 h-16 rounded-full items-center justify-center mb-5"
        style={{ backgroundColor: c.surfaceElevated }}
      >
        <Sparkles size={28} color={c.textSecondary} />
      </View>
      <Text className="text-[18px] font-semibold text-center mb-2" style={{ color: c.textPrimary }}>
        No artifacts yet
      </Text>
      <Text className="text-[14px] text-center leading-[20px]" style={{ color: c.textMuted }}>
        Artifacts you create in conversations will appear here
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// ArtifactCard — enhanced with code preview, type badge, timestamp
// ---------------------------------------------------------------------------

interface ArtifactCardProps {
  artifact: MobileArtifact;
  width: number;
  onPress: (artifact: MobileArtifact) => void;
  style?: object;
}

function ArtifactImagePreview({
  artifact,
  width,
  height,
}: {
  artifact: MobileArtifact;
  width: number;
  height: number;
}) {
  const c = useThemeColors();
  // The detail preview and Library already resolve the same durable image
  // through this owner-scoped source hook. The grid previously ignored the
  // URL entirely and always painted a generic icon, despite having valid data.
  const { source, status } = useGeneratedImageSource(artifact.content, false);

  if (status === 'ready' && source) {
    return (
      <Image
        testID={`artifact-image-thumbnail-${artifact.id}`}
        source={source}
        style={{ width, height }}
        contentFit="cover"
        transition={150}
        cachePolicy="memory"
        accessibilityLabel={artifact.previewLines[0] ?? artifact.title}
      />
    );
  }

  return (
    <View
      className="absolute inset-0 items-center justify-center px-3"
      style={{ backgroundColor: c.surfaceHover }}
    >
      <ImageIcon size={30} color={artifact.accentColor} />
      <Text
        className="text-[10px] leading-[14px] mt-2"
        numberOfLines={2}
        style={{ color: c.textSecondary, textAlign: 'center' }}
      >
        {status === 'authorizing'
          ? 'Loading image…'
          : status === 'signed-out'
            ? 'Sign in to view'
            : 'Image unavailable'}
      </Text>
    </View>
  );
}

function ArtifactCard({ artifact, width, onPress, style }: ArtifactCardProps) {
  const c = useThemeColors();
  const previewHeight = Math.max(120, Math.round(width * 0.72));
  const isCode = artifact.kind === 'code';
  const isImage = artifact.kind === 'image';
  const KindIcon = KIND_ICON[artifact.kind];

  return (
    <Pressable
      testID={`artifact-card-${artifact.id}`}
      onPress={() => onPress(artifact)}
      className="active:opacity-80"
      style={[{ width, marginBottom: 20 }, style]}
      accessibilityLabel={`Open artifact ${artifact.title}`}
      accessibilityRole="button"
    >
      {/* Preview thumbnail */}
      <View
        className="rounded-2xl border overflow-hidden"
        style={{
          height: previewHeight,
          backgroundColor: c.surfaceElevated,
          borderColor: c.border,
        }}
      >
        {/* Type badge — top-left overlay */}
        <View className="absolute top-3 left-3 z-10 flex-row items-center gap-1.5">
          <KindIcon size={12} color={artifact.accentColor} />
          <Badge label={badgeLabel(artifact)} color={KIND_BADGE[artifact.kind]} />
        </View>

        {/* Code / text preview area */}
        {isImage ? (
          <ArtifactImagePreview artifact={artifact} width={width} height={previewHeight} />
        ) : (
          <View
            className="absolute inset-0 justify-end px-3 pb-3 pt-10"
            style={{ backgroundColor: c.surfaceHover }}
          >
            {artifact.previewLines.slice(0, 5).map((line, index) => (
              <Text
                key={`${artifact.id}-${index}`}
                className="text-[10px] leading-[14px]"
                numberOfLines={1}
                style={{
                  color: index === 0 ? artifact.accentColor : c.textSecondary,
                  fontFamily: isCode
                    ? Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })
                    : undefined,
                  opacity: index === 0 ? 1 : Math.max(0.35, 1 - index * 0.18),
                }}
              >
                {line}
              </Text>
            ))}
          </View>
        )}
      </View>

      {/* Title */}
      <Text
        className="text-[15px] leading-[20px] mt-2.5 font-semibold"
        style={{ color: c.textPrimary }}
        numberOfLines={2}
      >
        {artifact.title}
      </Text>

      {/* Timestamp */}
      <Text className="text-[12px] mt-1" style={{ color: c.textMuted }} numberOfLines={1}>
        {artifact.ageLabel}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function ArtifactsSkeletonGrid({ cardWidth, columns }: { cardWidth: number; columns: number }) {
  const c = useThemeColors();
  const placeholders = useMemo(
    () => Array.from({ length: columns * 3 }, (_, index) => index),
    [columns],
  );

  return (
    <View testID="artifacts-skeleton-grid" className="flex-row flex-wrap" style={{ gap: CARD_GAP }}>
      {placeholders.map((item) => (
        <View key={item} style={{ width: cardWidth, marginBottom: 18 }}>
          <View
            className="rounded-2xl border"
            style={{
              height: Math.max(120, Math.round(cardWidth * 0.72)),
              backgroundColor: c.surfaceElevated,
              borderColor: c.border,
              opacity: 0.64,
            }}
          />
          <View
            className="h-4 rounded-md mt-3"
            style={{ width: cardWidth * 0.66, backgroundColor: c.surfaceElevated, opacity: 0.8 }}
          />
          <View
            className="h-3.5 rounded-md mt-2"
            style={{ width: cardWidth * 0.43, backgroundColor: c.surfaceElevated, opacity: 0.8 }}
          />
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// ArtifactPreviewModal (unchanged)
// ---------------------------------------------------------------------------

function ArtifactPreviewModal({
  artifact,
  onClose,
}: {
  artifact: MobileArtifact | null;
  onClose: () => void;
}) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!artifact) return;
    const ok = await copyToClipboard(artifact.content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  }, [artifact]);

  const handleShare = useCallback(async () => {
    if (!artifact) return;
    await Share.share({
      title: artifact.title,
      message: `${artifact.title}\n\n${artifact.content}`,
    });
  }, [artifact]);

  if (!artifact) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View className="flex-1" style={{ backgroundColor: c.surfaceBase }}>
        <View
          className="flex-row items-center gap-3 px-4 pb-3 border-b"
          style={{ paddingTop: insets.top + 10, borderBottomColor: c.border }}
        >
          <Pressable
            testID="artifact-preview-close"
            onPress={onClose}
            className="w-10 h-10 rounded-full items-center justify-center border active:opacity-80"
            style={{ backgroundColor: c.surfaceElevated, borderColor: c.border }}
            accessibilityLabel="Close artifact preview"
            accessibilityRole="button"
          >
            <X size={20} color={c.textSecondary} />
          </Pressable>

          <View className="flex-1">
            <Text
              className="text-[16px] font-semibold"
              style={{ color: c.textPrimary }}
              numberOfLines={1}
            >
              {artifact.title}
            </Text>
            <Text className="text-[12px] mt-0.5" style={{ color: c.textMuted }} numberOfLines={1}>
              {artifact.sourceLabel} - {artifact.kind}
            </Text>
          </View>

          <Pressable
            testID="artifact-copy"
            onPress={handleCopy}
            className="w-10 h-10 rounded-full items-center justify-center border active:opacity-80"
            style={{ backgroundColor: c.surfaceElevated, borderColor: c.border }}
            accessibilityLabel="Copy artifact"
            accessibilityRole="button"
          >
            {copied ? (
              <Check size={19} color={c.agentSuccess} />
            ) : (
              <Copy size={19} color={c.textSecondary} />
            )}
          </Pressable>

          <Pressable
            testID="artifact-share"
            onPress={handleShare}
            className="w-10 h-10 rounded-full items-center justify-center border active:opacity-80"
            style={{ backgroundColor: c.surfaceElevated, borderColor: c.border }}
            accessibilityLabel="Share artifact"
            accessibilityRole="button"
          >
            <Share2 size={19} color={c.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 36 }}
        >
          <View
            className="rounded-2xl border p-4 mb-5"
            style={{ borderColor: c.border, backgroundColor: c.surfaceElevated }}
          >
            <View className="flex-row items-center gap-2 mb-2">
              <FileText size={16} color={artifact.accentColor} />
              <Text className="text-[12px] font-semibold" style={{ color: artifact.accentColor }}>
                Artifact preview
              </Text>
            </View>
            <Text className="text-[12px] leading-[18px]" style={{ color: c.textMuted }}>
              Mobile previews, copies, and shares artifacts. Regeneration and execution stay on AGI
              Desktop or AGI Cloud environments.
            </Text>
          </View>

          {artifact.kind === 'image' ? (
            <GeneratedImage
              imageUrl={artifact.content}
              revisedPrompt={artifact.previewLines[0]}
              width={Math.min(420, Math.max(240, 320))}
            />
          ) : artifact.kind === 'code' ? (
            <ScrollView
              testID="artifact-preview-content"
              horizontal
              showsHorizontalScrollIndicator
              className="rounded-xl border"
              style={{ borderColor: c.border, backgroundColor: c.surfaceElevated }}
              contentContainerStyle={{ padding: 12 }}
            >
              <Text
                className="text-[13px] leading-[19px]"
                style={{
                  color: c.textPrimary,
                  fontFamily: Platform.select({
                    ios: 'Menlo',
                    android: 'monospace',
                    default: 'monospace',
                  }),
                }}
                selectable
              >
                {artifact.content}
              </Text>
            </ScrollView>
          ) : (
            /* Prose artifacts carry markdown. Dumping them into one proportional
             * Text printed heading/list/emphasis markers literally. */
            <View testID="artifact-preview-content">
              {renderMarkdownContent(artifact.content, c)}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

export default ArtifactsGalleryScreen;
