import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, View, useWindowDimensions } from 'react-native';
import { DrawerActions } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Copy, FileText, Lightbulb, Menu, Share2, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { copyToClipboard } from '@/lib/clipboard';
import { useThemeColors } from '@/src/ui/theme';
import { RECEIVED_ARTIFACTS } from './data';
import type { MobileArtifact } from './types';

interface ArtifactsGalleryScreenProps {
  artifacts?: MobileArtifact[];
  initialLoading?: boolean;
}

const CARD_GAP = 14;
const HORIZONTAL_PADDING = 16;

function truncatePreview(line: string): string {
  return line.length > 92 ? `${line.slice(0, 92).trim()}...` : line;
}

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

  const columns = width >= 760 ? 3 : 2;
  const gridWidth = Math.min(width, 920) - HORIZONTAL_PADDING * 2;
  const cardWidth = Math.floor((gridWidth - CARD_GAP * (columns - 1)) / columns);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }} edges={['top']}>
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

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: HORIZONTAL_PADDING,
          paddingTop: 18,
          paddingBottom: 56,
          alignSelf: 'center',
          width: Math.min(width, 920),
        }}
        showsVerticalScrollIndicator={false}
      >
        <GetInspiredCard />

        {isLoading ? (
          <ArtifactsSkeletonGrid columns={columns} cardWidth={cardWidth} />
        ) : (
          <View testID="artifacts-grid" className="flex-row flex-wrap" style={{ gap: CARD_GAP }}>
            {artifacts.map((artifact) => (
              <ArtifactCard
                key={artifact.id}
                artifact={artifact}
                width={cardWidth}
                onPress={setSelectedArtifact}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <ArtifactPreviewModal artifact={selectedArtifact} onClose={() => setSelectedArtifact(null)} />
    </SafeAreaView>
  );
}

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

interface ArtifactCardProps {
  artifact: MobileArtifact;
  width: number;
  onPress: (artifact: MobileArtifact) => void;
}

function ArtifactCard({ artifact, width, onPress }: ArtifactCardProps) {
  const c = useThemeColors();
  const previewHeight = Math.max(120, Math.round(width * 0.72));

  return (
    <Pressable
      testID={`artifact-card-${artifact.id}`}
      onPress={() => onPress(artifact)}
      className="active:opacity-80"
      style={{ width, marginBottom: 20 }}
      accessibilityLabel={`Open artifact ${artifact.title}`}
      accessibilityRole="button"
    >
      <View
        className="rounded-2xl border overflow-hidden justify-center"
        style={{
          height: previewHeight,
          backgroundColor: c.surfaceElevated,
          borderColor: c.border,
        }}
      >
        <View
          className="self-center rounded-2xl border px-4 py-4"
          style={{
            width: width * 0.79,
            height: previewHeight * 0.78,
            backgroundColor: c.surfaceHover,
            borderColor: c.borderLight,
          }}
        >
          {artifact.previewLines.slice(0, 4).map((line, index) => (
            <Text
              key={`${artifact.id}-${index}`}
              className="text-[11px] leading-[14px]"
              style={{ color: index === 0 ? artifact.accentColor : c.textSecondary }}
              numberOfLines={index === 0 ? 2 : 3}
            >
              {truncatePreview(line)}
            </Text>
          ))}
        </View>
      </View>

      <Text
        className="text-[17px] leading-[21px] mt-3 font-medium"
        style={{ color: c.textPrimary }}
        numberOfLines={1}
      >
        {artifact.title}
      </Text>
      <Text className="text-[16px] mt-1" style={{ color: c.textMuted }} numberOfLines={1}>
        {artifact.ageLabel}
      </Text>
    </Pressable>
  );
}

function ArtifactsSkeletonGrid({ columns, cardWidth }: { columns: number; cardWidth: number }) {
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
              backgroundColor: c.black,
              borderColor: c.border,
              opacity: 0.64,
            }}
          />
          <View
            className="h-4 rounded-md mt-3"
            style={{ width: cardWidth * 0.66, backgroundColor: c.black, opacity: 0.8 }}
          />
          <View
            className="h-3.5 rounded-md mt-2"
            style={{ width: cardWidth * 0.43, backgroundColor: c.black, opacity: 0.8 }}
          />
        </View>
      ))}
    </View>
  );
}

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
