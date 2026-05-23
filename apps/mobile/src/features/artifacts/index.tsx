import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  View,
  useWindowDimensions,
} from 'react-native';
import { DrawerActions } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BarChart3,
  BookOpen,
  Check,
  Code2,
  Copy,
  FileText,
  Lightbulb,
  Menu,
  Share2,
  Sparkles,
  X,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { copyToClipboard } from '@/lib/clipboard';
import { useThemeColors } from '@/src/ui/theme';
import { RECEIVED_ARTIFACTS } from './data';
import type { MobileArtifact, MobileArtifactKind } from './types';

interface ArtifactsGalleryScreenProps {
  artifacts?: MobileArtifact[];
  initialLoading?: boolean;
}

const NUM_COLUMNS = 2;
const CARD_GAP = 14;
const HORIZONTAL_PADDING = 16;

// ---------------------------------------------------------------------------
// Kind → badge config
// ---------------------------------------------------------------------------

type BadgeColor = 'teal' | 'terra-cotta' | 'green' | 'red' | 'yellow' | 'purple' | 'blue' | 'gray';

const KIND_BADGE: Record<MobileArtifactKind, BadgeColor> = {
  code: 'teal',
  chart: 'yellow',
  research: 'purple',
  document: 'gray',
};

const KIND_ICON: Record<MobileArtifactKind, typeof FileText> = {
  code: Code2,
  chart: BarChart3,
  research: BookOpen,
  document: FileText,
};

function badgeLabel(artifact: MobileArtifact): string {
  if (artifact.language) return artifact.language;
  return artifact.kind.charAt(0).toUpperCase() + artifact.kind.slice(1);
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function ArtifactsGalleryScreen({
  artifacts = RECEIVED_ARTIFACTS,
  initialLoading = false,
}: ArtifactsGalleryScreenProps) {
  const c = useThemeColors();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const [selectedArtifact, setSelectedArtifact] = useState<MobileArtifact | null>(null);
  const [isLoading] = useState(initialLoading);

  const openDrawer = useCallback(() => {
    const parent = navigation.getParent?.();
    if (parent) {
      parent.dispatch(DrawerActions.openDrawer());
      return;
    }
    navigation.dispatch(DrawerActions.openDrawer());
  }, [navigation]);

  const gridWidth = Math.min(width, 920) - HORIZONTAL_PADDING * 2;
  const cardWidth = Math.floor((gridWidth - CARD_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS);

  const listContentStyle = useMemo(
    () => ({
      paddingHorizontal: HORIZONTAL_PADDING,
      paddingTop: 18,
      paddingBottom: 56,
      alignSelf: 'center' as const,
      width: Math.min(width, 920),
    }),
    [width],
  );

  const keyExtractor = useCallback((item: MobileArtifact) => item.id, []);

  const renderItem = useCallback(
    ({ item, index }: { item: MobileArtifact; index: number }) => (
      <ArtifactCard
        artifact={item}
        width={cardWidth}
        onPress={setSelectedArtifact}
        // Right-column cards get left margin to match the gap
        style={index % NUM_COLUMNS !== 0 ? { marginLeft: CARD_GAP } : undefined}
      />
    ),
    [cardWidth],
  );

  const ListHeader = useMemo(() => <GetInspiredCard />, []);

  const ListEmpty = useMemo(
    () => (isLoading ? <ArtifactsSkeletonGrid cardWidth={cardWidth} /> : <ArtifactsEmptyState />),
    [isLoading, cardWidth],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }} edges={['top']}>
      {/* Header bar */}
      <View className="h-16 justify-center px-4">
        <Pressable
          testID="artifacts-open-drawer"
          onPress={openDrawer}
          className="absolute left-4 w-12 h-12 rounded-full items-center justify-center border active:opacity-80"
          style={{ backgroundColor: c.surfaceElevated, borderColor: c.border }}
          accessibilityLabel="Open navigation drawer"
          accessibilityRole="button"
        >
          <Menu size={24} color={c.textSecondary} />
          <View
            className="absolute w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: c.terraCotta, right: 13, top: 12 }}
          />
        </Pressable>

        <Text className="text-center text-[20px] font-semibold" style={{ color: c.textPrimary }}>
          Artifacts
        </Text>
      </View>

      <FlatList
        data={isLoading ? [] : artifacts}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={NUM_COLUMNS}
        testID="artifacts-grid"
        contentContainerStyle={listContentStyle}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        showsVerticalScrollIndicator={false}
      />

      <ArtifactPreviewModal artifact={selectedArtifact} onClose={() => setSelectedArtifact(null)} />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// GetInspiredCard (unchanged visual, extracted as pure component)
// ---------------------------------------------------------------------------

function GetInspiredCard() {
  const c = useThemeColors();

  return (
    <Pressable
      className="h-[72px] rounded-2xl border flex-row items-center justify-between px-6 mb-7 active:opacity-85"
      style={{ backgroundColor: c.surfaceElevated, borderColor: c.border }}
      accessibilityLabel="Get inspired"
      accessibilityRole="button"
    >
      <View className="flex-row items-center gap-4">
        <Lightbulb size={27} color={c.textPrimary} />
        <Text className="text-[20px] font-semibold" style={{ color: c.textPrimary }}>
          Get inspired
        </Text>
      </View>

      <View className="w-[132px] h-[42px] items-center justify-center">
        <View
          className="absolute w-16 h-9 rounded-md -rotate-6"
          style={{ backgroundColor: '#8eb8e8', left: 8 }}
        >
          <Text className="text-[7px] mt-2 ml-2" style={{ color: c.black }}>
            Hi
          </Text>
        </View>
        <View
          className="absolute w-16 h-9 rounded-md border"
          style={{ backgroundColor: '#f8f8f3', borderColor: '#e2ded4', left: 42 }}
        >
          <View className="flex-row gap-0.5 mt-4 ml-3">
            {[4, 8, 12, 7, 10].map((height, index) => (
              <View
                key={index}
                className="w-1 rounded-sm"
                style={{ height, backgroundColor: c.terraCotta }}
              />
            ))}
          </View>
        </View>
        <View
          className="absolute w-16 h-9 rounded-md rotate-6 items-center justify-center"
          style={{ backgroundColor: '#ffc979', right: 4 }}
        >
          <Text className="text-[6px] font-semibold" style={{ color: c.black }}>
            How petty are you?
          </Text>
          <Text className="text-[9px] font-bold mt-0.5" style={{ color: c.black }}>
            53%
          </Text>
        </View>
      </View>
    </Pressable>
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

function ArtifactCard({ artifact, width, onPress, style }: ArtifactCardProps) {
  const c = useThemeColors();
  const previewHeight = Math.max(120, Math.round(width * 0.72));
  const isCode = artifact.kind === 'code';
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
// Skeleton (2-column, fixed)
// ---------------------------------------------------------------------------

function ArtifactsSkeletonGrid({ cardWidth }: { cardWidth: number }) {
  const c = useThemeColors();
  const placeholders = useMemo(
    () => Array.from({ length: NUM_COLUMNS * 3 }, (_, index) => index),
    [],
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
                Received artifact
              </Text>
            </View>
            <Text className="text-[12px] leading-[18px]" style={{ color: c.textMuted }}>
              Mobile only previews, copies, and shares this artifact. Regeneration and execution
              stay on Desktop or Cloud Managed environments.
            </Text>
          </View>

          <Text
            testID="artifact-preview-content"
            className="text-[18px] leading-[30px]"
            style={{ color: c.textPrimary }}
          >
            {artifact.content}
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default ArtifactsGalleryScreen;
