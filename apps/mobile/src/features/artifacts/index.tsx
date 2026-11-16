import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
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
  MoreHorizontal,
  Share2,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useTheme, useThemeColors } from '@/src/ui/theme';
import { codeFontFamily } from '@/src/ui/theme/codeFont';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';
import { DrawerButton } from '@/src/shared/components/DrawerButton';
import {
  useArtifactStore,
  accentColorForKind,
  formatAgeLabel,
  mergeMobileArtifactsForGallery,
  viewerArtifactFor,
} from './store';
import type { MobileArtifact, MobileArtifactKind } from './types';
import { GeneratedImage } from '@/src/features/chat/components/GeneratedImage';
import { useGeneratedImageSource } from '@/src/features/image/hooks/useGeneratedImageSource';
import { ArtifactFullScreen } from '@/src/features/chat/components/ArtifactFullScreen';
import { ArtifactAudienceChip } from '@/src/features/chat/components/ArtifactAudienceChip';
import { ReportSheet, type ReportTarget } from '@/src/features/chat/components/ReportFlagButton';
import { FULL_SCREEN_TOUCH_TARGET } from '@/src/features/chat/chrome/fullScreenChrome';
import { HEADER_TEXT_SCALE_LIMIT } from '@/src/features/chat/components/WorkModeSwitch';
import { useDismissOnScreenBlur } from './useDismissOnScreenBlur';
import { resolveGeneratedImageUri } from '@/src/features/image/services/imagegen';
import {
  runViewerImageAction,
  viewerImageActions,
} from '@/src/features/image/services/viewerImageActions';
import {
  COPY_CONFIRMATION_MS,
  COPY_FAILED_LABEL,
  copyControlLabel,
  type CopyStatus,
} from '@/src/shared/hooks/useCopyAction';
import { reportAssetFor } from '@/services/contentReportAsset';
import { downloadFailureMessage, shareGeneratedImage } from '@/services/fileCreation';
import { refreshPublishedArtifactAudiences } from '@/src/features/chat/services/artifactPublishing';
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
const TILE_PREVIEW_LINES = 4;

const KIND_ICON: Record<MobileArtifactKind, typeof FileText> = {
  code: Code2,
  chart: BarChart3,
  research: BookOpen,
  document: FileText,
  image: ImageIcon,
};

function artifactAgeLabel(artifact: MobileArtifact): string {
  const madeOrEditedAt = artifact.editedAt ?? artifact.createdAt;
  return (madeOrEditedAt && formatAgeLabel(madeOrEditedAt)) || artifact.ageLabel;
}

function kindLabel(artifact: MobileArtifact): string {
  if (artifact.language) return artifact.language;
  return artifact.kind.charAt(0).toUpperCase() + artifact.kind.slice(1);
}

export function ArtifactsGalleryScreen({
  initialLoading = false,
  initialArtifactId,
}: ArtifactsGalleryScreenProps) {
  const { colors: c, isDark } = useTheme();
  const pageBackground = isDark ? c.background : c.surfaceBase;
  const navigation = useNavigation();
  const { contentWidth, gridColumns } = useResponsiveLayout();
  const [selectedArtifact, setSelectedArtifact] = useState<MobileArtifact | null>(null);
  const selectedArtifactScopeRef = useRef<AccountScopedUiState | null>(null);
  const openedInitialArtifactRef = useRef<string | null>(null);
  const [isLoading] = useState(initialLoading);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);

  const storedArtifacts = useArtifactStore((s) => s.artifacts);
  const cloudArtifacts = useArtifactStore((s) => s.cloudArtifacts);
  const cloudArtifactsOwnerId = useArtifactStore((s) => s.cloudArtifactsOwnerId);

  useLayoutEffect(() => {
    if (!selectedArtifact) return;
    if (isAccountScopedUiStateOwned(selectedArtifactScopeRef.current)) return;
    selectedArtifactScopeRef.current = null;
    setSelectedArtifact(null);
  }, [clerkUserId, cloudArtifactsOwnerId, selectedArtifact]);

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

  useEffect(() => {
    if (!clerkUserId) return;
    refreshPublishedArtifactAudiences().catch((error: unknown) => {
      console.warn('[ArtifactsGallery] publication states unavailable', error);
    });
  }, [clerkUserId]);

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
  const openedFullScreenArtifact = useMemo(
    () =>
      selectedArtifact && selectedArtifact.kind !== 'image'
        ? viewerArtifactFor(selectedArtifact)
        : null,
    [selectedArtifact],
  );

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
    <SafeAreaView className="flex-1" style={{ backgroundColor: pageBackground }} edges={['top']}>
      <View testID="artifacts-header" className="min-h-12 flex-row items-center px-3 gap-2">
        <DrawerButton testID="artifacts-open-drawer" onPress={openDrawer} />

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
          Artifacts
        </Text>
        <View style={{ width: 36, height: 36 }} />
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

      <ImageArtifactPreview
        artifact={selectedArtifact?.kind === 'image' ? selectedArtifact : null}
        onClose={handleCloseArtifact}
      />
      <ArtifactFullScreen
        artifact={openedFullScreenArtifact}
        visible={openedFullScreenArtifact !== null}
        onClose={handleCloseArtifact}
        messageId={selectedArtifact?.messageId}
        libraryArtifact={
          selectedArtifact?.kind === 'image' ? undefined : (selectedArtifact ?? undefined)
        }
      />
    </SafeAreaView>
  );
}

function ArtifactsEmptyState() {
  const c = useThemeColors();
  return (
    <View testID="artifacts-empty-state" className="flex-1 items-center justify-center py-20 px-8">
      <View
        testID="artifacts-empty-disc"
        className="w-16 h-16 rounded-full items-center justify-center mb-5"
        style={{ backgroundColor: c.surfaceHover }}
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
        className="text-sm leading-[18px] mt-2"
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
  const ageLabel = artifactAgeLabel(artifact);

  return (
    <Pressable
      testID={`artifact-card-${artifact.id}`}
      onPress={() => onPress(artifact)}
      className="active:opacity-80"
      style={[{ width, marginBottom: 20 }, style]}
      accessibilityLabel={`Open artifact ${artifact.title}, ${ageLabel}`}
      accessibilityRole="button"
    >
      <View
        testID={`artifact-tile-${artifact.id}`}
        className="rounded-2xl border overflow-hidden"
        style={{
          height: previewHeight,
          backgroundColor: isImage ? c.surfaceElevated : c.surfaceHover,
          borderColor: c.border,
        }}
      >
        <View
          testID={`artifact-kind-row-${artifact.id}`}
          className={
            isImage
              ? 'absolute top-3 left-3 z-10 flex-row items-center gap-1.5'
              : 'flex-row items-center gap-1.5 px-3 pt-3'
          }
        >
          <KindIcon size={12} color={artifact.accentColor} />
          {isImage ? null : (
            <Text
              testID={`artifact-kind-${artifact.id}`}
              numberOfLines={1}
              maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
              style={{
                flexShrink: 1,
                fontSize: typeScale.caption,
                color: c.textSecondary,
                textTransform: 'uppercase',
              }}
            >
              {kindLabel(artifact)}
            </Text>
          )}
          <ArtifactAudienceChip artifactId={artifact.id} />
        </View>

        {isImage ? (
          <ArtifactImagePreview artifact={artifact} width={width} height={previewHeight} />
        ) : (
          <View
            testID={`artifact-preview-${artifact.id}`}
            className="flex-1 justify-end px-3 pb-3 mt-2 overflow-hidden"
          >
            {artifact.previewLines.slice(0, TILE_PREVIEW_LINES).map((line, index) => (
              <Text
                key={`${artifact.id}-${index}`}
                className="text-sm leading-[18px]"
                numberOfLines={1}
                style={{
                  color: index === 0 ? artifact.accentColor : c.textSecondary,
                  fontFamily: isCode ? codeFontFamily : undefined,
                  opacity: index === 0 ? 1 : Math.max(0.35, 1 - index * 0.18),
                }}
              >
                {line}
              </Text>
            ))}
          </View>
        )}
      </View>

      <Text
        className="text-[15px] leading-[20px] mt-2.5 font-semibold"
        style={{ color: c.textPrimary }}
        numberOfLines={2}
      >
        {artifact.title}
      </Text>

      <Text className="text-sm mt-1" style={{ color: c.textMuted }} numberOfLines={1}>
        {ageLabel}
      </Text>
    </Pressable>
  );
}

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

const REPORT_THIS_IMAGE = 'Report this image';

function imageReportTarget(artifact: MobileArtifact): ReportTarget {
  const reference = `artifact:${artifact.id}`;
  const target: ReportTarget = {
    messageId: artifact.messageId ?? reference,
    conversationId: reference,
    subject: { kind: 'image', id: artifact.id },
    contentExcerpt: artifact.title,
  };
  const asset = reportAssetFor(
    'image',
    resolveGeneratedImageUri(artifact.content) ?? artifact.content,
  );
  return asset ? { ...target, asset } : target;
}

const HEADER_BUTTON_SIZE = {
  width: FULL_SCREEN_TOUCH_TARGET,
  height: FULL_SCREEN_TOUCH_TARGET,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

function ImageArtifactPreview({
  artifact,
  onClose,
}: {
  artifact: MobileArtifact | null;
  onClose: () => void;
}) {
  const c = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [copied, setCopied] = useState<{ id: string; status: CopyStatus } | null>(null);
  const copyStatus: CopyStatus = copied && copied.id === artifact?.id ? copied.status : 'idle';
  useDismissOnScreenBlur(artifact !== null, onClose);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), COPY_CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopyImage = useCallback(async () => {
    if (!artifact) return;
    const id = artifact.id;
    try {
      await runViewerImageAction('copy', artifact.content);
      setCopied({ id, status: 'copied' });
    } catch (error) {
      setCopied({ id, status: 'failed' });
      Alert.alert(
        COPY_FAILED_LABEL,
        downloadFailureMessage(error, 'This image could not be copied. Try Share instead.'),
      );
    }
  }, [artifact]);

  const handleShare = useCallback(async () => {
    if (!artifact) return;
    try {
      await shareGeneratedImage(artifact.content, artifact.title);
    } catch (error) {
      Alert.alert(
        'Share failed',
        downloadFailureMessage(error, 'This image is not available to share right now.'),
      );
    }
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
          className="flex-row items-center gap-2 px-4 pb-3 border-b"
          style={{ paddingTop: insets.top + 10, borderBottomColor: c.border }}
        >
          <Pressable
            testID="artifact-preview-close"
            onPress={onClose}
            className="active:opacity-80"
            style={HEADER_BUTTON_SIZE}
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
            <Text className="text-sm mt-0.5" style={{ color: c.textMuted }} numberOfLines={1}>
              {artifact.sourceLabel} - {artifact.kind}
            </Text>
          </View>

          {viewerImageActions(artifact.content).has('copy') ? (
            <Pressable
              testID="artifact-copy"
              onPress={() => void handleCopyImage()}
              className="active:opacity-80"
              style={HEADER_BUTTON_SIZE}
              accessibilityLabel={copyControlLabel(copyStatus, 'Copy image')}
              accessibilityRole="button"
            >
              {copyStatus === 'copied' ? (
                <Check size={19} color={c.agentSuccess} />
              ) : copyStatus === 'failed' ? (
                <TriangleAlert size={19} color={c.agentError} />
              ) : (
                <Copy size={19} color={c.textSecondary} />
              )}
            </Pressable>
          ) : null}

          <Pressable
            testID="artifact-share"
            onPress={handleShare}
            className="active:opacity-80"
            style={HEADER_BUTTON_SIZE}
            accessibilityLabel="Share artifact"
            accessibilityRole="button"
          >
            <Share2 size={19} color={c.textSecondary} />
          </Pressable>

          <Pressable
            testID="artifact-more"
            onPress={() =>
              Alert.alert(artifact.title, undefined, [
                {
                  text: REPORT_THIS_IMAGE,
                  onPress: () => setReportingId(artifact.id),
                },
                { text: 'Cancel', style: 'cancel' },
              ])
            }
            className="active:opacity-80"
            style={HEADER_BUTTON_SIZE}
            accessibilityLabel="More artifact actions"
            accessibilityHint={REPORT_THIS_IMAGE}
            accessibilityRole="button"
          >
            <MoreHorizontal size={20} color={c.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          testID="artifact-preview-scroll"
          className="flex-1"
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.xl,
            paddingBottom: insets.bottom + 36,
          }}
        >
          <View testID="artifact-preview-content" style={{ alignItems: 'center' }}>
            <GeneratedImage
              imageUrl={artifact.content}
              revisedPrompt={artifact.previewLines[0]}
              width={Math.max(0, windowWidth - 2 * spacing.xl)}
            />
          </View>
        </ScrollView>
      </View>
      {reportingId === artifact.id ? (
        <ReportSheet
          visible
          onClose={() => setReportingId(null)}
          title={REPORT_THIS_IMAGE}
          target={imageReportTarget(artifact)}
        />
      ) : null}
    </Modal>
  );
}

export default ArtifactsGalleryScreen;
