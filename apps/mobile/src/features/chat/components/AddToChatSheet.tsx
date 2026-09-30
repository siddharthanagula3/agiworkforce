import { useCallback, forwardRef, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View, ScrollView } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import {
  X,
  Camera,
  Image as ImageIcon,
  FileText,
  Paintbrush,
  Telescope,
  FolderPlus,
  Palette,
  Link,
  ChevronRight,
  Lock,
  Terminal,
  Bot,
  Film,
  Check,
  Sparkles,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  MICROUSD_PER_USD,
  canUseBillingPlanCapability,
  chargeCreditsForMicrousd,
  formatCredits,
  getImageAspectOptionsForModel,
  getModelMetadataById,
  getVideoAspectOptionsForModel,
  getVideoQualityOptionsForModel,
  providerLabels,
  videoGenerationCostMicrousd,
  type ModelMetadata,
} from '@agiworkforce/types';
import {
  CHAT_OUTPUT_FORMATS,
  CHAT_OUTPUT_FORMAT_LABEL,
  ManagedMediaVideoGenerationRequestSchema,
  supportsManagedMediaImageEdit,
} from '@agiworkforce/cloud-contracts';
import { supportedVideoDurationSecs } from '@/src/features/video/services/videogen';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { useChatStore } from '@/stores/chatStore';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import {
  enterMediaMode,
  exitMediaMode,
  clearInvalidMediaModelSelections,
  listMediaModels,
  resolveMediaModelId,
  resolveVideoOutputSelection,
} from '@/src/features/chat/actions/mediaMode';
import { useSettingsStore } from '@/stores/settingsStore';
import { useProjectStore } from '@/src/features/projects/store';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useModelStore } from '@/src/features/model-picker/store';
import { getShortDisplayName } from '@/src/features/model-picker/service';
import { useTierStore } from '@/src/features/billing/store';
import { useTheme, useThemeColors, sheetRadius } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { executionModeForConversation } from '@/src/features/chat/utils/conversationMode';
import { recentMobileFiles } from '@/src/features/search/mobileGlobalSearch';
import { fetchLibraryPage } from '@/src/features/library/libraryClient';
import { useCapability } from '@/src/lib/capabilities';
import { useMobileSkillSelectionStore } from '@/src/features/skills/selectionStore';
import { useOutputFormatStore } from '@/src/features/chat/store/outputFormatStore';
import type { Attachment } from './AttachmentPreview';

interface AddToChatSheetProps {
  onCamera: () => void;
  onPhotos: () => void;
  onFile: () => void;
  onOpenCloudAccess: () => void;
  onOpenStyleSelector: () => void;
  onOpenModelPicker: () => void;
  onOpenProjectPicker: () => void;
  onAttachFromLibrary: (attachment: Attachment) => void;
  onOpenSkills?: () => void;
  offersOutputFormat?: boolean;
}

const SNAP_POINTS = ['75%'];
const LIBRARY_PICKER_SIZE = 12;
const CLOUD_ATTACH_RETENTION_NOTE =
  'Files you attach are uploaded to AGI Cloud and kept in your Library until you delete them.';
const TEMPORARY_ATTACH_RETENTION_NOTE =
  'Files you attach to a temporary chat stay out of your Library and are deleted with the chat.';

interface LibraryPick {
  id: string;
  fileName: string;
  subtitle: string;
  isImage: boolean;
  attachment: Attachment;
}

type CloudLibraryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; picks: LibraryPick[] }
  | { status: 'error' };

export const AddToChatSheet = forwardRef<BottomSheet, AddToChatSheetProps>(function AddToChatSheet(
  {
    onCamera,
    onPhotos,
    onFile,
    onOpenCloudAccess,
    onOpenStyleSelector,
    onOpenModelPicker,
    onOpenProjectPicker,
    onAttachFromLibrary,
    onOpenSkills,
    offersOutputFormat = false,
  },
  ref,
) {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const cameraAllowed = useCapability('canUseCamera');
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const isTemporaryChat = useSettingsStore((s) => s.isTemporaryChat);

  const chatStyle = useChatStore((s) => s.chatStyle);
  const localConversations = useChatStore((s) => s.conversations);
  const localMessages = useChatStore((s) => s.messages);
  const features = useChatStore((s) => s.features);
  const setFeature = useChatStore((s) => s.setFeature);
  const mediaMode = useChatViewStore((s) => s.mediaMode);
  const selectedMediaModel = useChatViewStore((s) => s.selectedMediaModel);
  const setMediaModel = useChatViewStore((s) => s.setMediaModel);
  const videoAspectRatio = useChatViewStore((s) => s.videoAspectRatio);
  const videoResolution = useChatViewStore((s) => s.videoResolution);
  const setVideoAspectRatio = useChatViewStore((s) => s.setVideoAspectRatio);
  const setVideoResolution = useChatViewStore((s) => s.setVideoResolution);
  const videoDurationSecs = useChatViewStore((s) => s.videoDurationSecs);
  const setVideoDurationSecs = useChatViewStore((s) => s.setVideoDurationSecs);
  const imageAspectRatio = useChatViewStore((s) => s.imageAspectRatio);
  const setImageAspectRatio = useChatViewStore((s) => s.setImageAspectRatio);
  const imageTransparentBackground = useChatViewStore((s) => s.imageTransparentBackground);
  const setImageTransparentBackground = useChatViewStore((s) => s.setImageTransparentBackground);

  const appMode = useChatAppModeStore((s) => s.appMode);
  const tier = useTierStore((s) => s.tier);
  const grantedCapabilities = useTierStore((s) => s.grantedCapabilities);
  const selectedModel = useModelStore((s) => s.selectedModel);
  const selectedModelMetadata = getModelMetadataById(selectedModel);
  const showResearchToggle =
    FEATURES.research &&
    appMode === 'cloud' &&
    selectedModelMetadata?.capabilities?.research === true &&
    selectedModelMetadata?.capabilities?.search === true &&
    grantedCapabilities.includes('canUseDeepResearch');
  const showToolSection = showResearchToggle;
  const imageModelId = resolveMediaModelId('image', selectedMediaModel);
  const videoModelId = resolveMediaModelId('video', selectedMediaModel);
  const imageModelSupportsReference = supportsManagedMediaImageEdit(
    imageModelId ? getModelMetadataById(imageModelId)?.provider : null,
  );
  const videoAspectOptions = useMemo(
    () => getVideoAspectOptionsForModel(videoModelId ?? undefined),
    [videoModelId],
  );
  const videoOutputSelection = useMemo(
    () =>
      resolveVideoOutputSelection(
        videoModelId,
        videoAspectRatio,
        videoResolution,
        videoDurationSecs,
      ),
    [videoModelId, videoAspectRatio, videoResolution, videoDurationSecs],
  );
  const videoDurationOptions = videoOutputSelection.durationOptions;
  const effectiveVideoAspectRatio = videoOutputSelection.aspectRatio;
  const effectiveVideoResolution = videoOutputSelection.resolution;
  const imageAspectOptions = useMemo(
    () => getImageAspectOptionsForModel(imageModelId ?? undefined),
    [imageModelId],
  );
  const effectiveImageAspectRatio =
    imageAspectOptions.find((option) => option.id === imageAspectRatio)?.id ??
    imageAspectOptions[0]?.id ??
    '1:1';
  const videoQualityOptions = useMemo(
    () => getVideoQualityOptionsForModel(videoModelId ?? undefined, effectiveVideoAspectRatio),
    [videoModelId, effectiveVideoAspectRatio],
  );
  const videoEstimate = useMemo(() => {
    const model = videoModelId ? getModelMetadataById(videoModelId) : undefined;
    if (!videoModelId || !model) return null;
    const durationSecs =
      videoOutputSelection.durationSecs ??
      supportedVideoDurationSecs(
        videoModelId,
        effectiveVideoAspectRatio,
        effectiveVideoResolution,
      ) ??
      ManagedMediaVideoGenerationRequestSchema.shape.duration_secs.parse(undefined);
    const microusd = videoGenerationCostMicrousd({
      model,
      resolution: effectiveVideoResolution,
      aspectRatio: effectiveVideoAspectRatio,
      durationSecs,
      generateAudio: model.videoGeneration?.supportsAudio ?? false,
    });
    return microusd === null ? null : { credits: chargeCreditsForMicrousd(microusd), durationSecs };
  }, [
    videoModelId,
    effectiveVideoAspectRatio,
    effectiveVideoResolution,
    videoOutputSelection.durationSecs,
  ]);
  useEffect(() => {
    clearInvalidMediaModelSelections();
  }, [selectedMediaModel]);
  const showImageOption =
    FEATURES.imageGen &&
    appMode === 'cloud' &&
    imageModelId !== null &&
    grantedCapabilities.includes('canUseImages') &&
    canUseBillingPlanCapability(tier, 'image_generation');
  const showVideoOption =
    appMode === 'cloud' &&
    videoModelId !== null &&
    grantedCapabilities.includes('canUseVideoGeneration') &&
    canUseBillingPlanCapability(tier, 'video_generation');
  const canUseConnectors = grantedCapabilities.includes('canUseConnectors');
  const codeExecutionAvailable = useTierStore((s) => s.codeExecutionAvailable);
  const outputFormat = useOutputFormatStore((s) => s.format);
  const setOutputFormat = useOutputFormatStore((s) => s.setFormat);
  const showOutputSection =
    offersOutputFormat &&
    appMode === 'cloud' &&
    mediaMode === 'text' &&
    FEATURES.codeExecution &&
    selectedModelMetadata?.capabilities?.tools === true &&
    codeExecutionAvailable &&
    grantedCapabilities.includes('canUseCloudExecution');
  const selectedSkillName = useMobileSkillSelectionStore((s) => s.selection?.name ?? null);

  const localActiveProjectId = useProjectStore((s) => s.activeProjectId);
  const localProjects = useProjectStore((s) => s.projects);
  const cloudActiveProjectId = useCloudProjectStore((s) => s.activeProjectId);
  const cloudProjects = useCloudProjectStore((s) => s.projects);
  const activeProjectId = appMode === 'cloud' ? cloudActiveProjectId : localActiveProjectId;
  const activeProject = activeProjectId
    ? ((appMode === 'cloud' ? cloudProjects : localProjects).find(
        (p) => p.id === activeProjectId,
      ) ?? null)
    : null;
  const localLibraryPicks = useMemo((): LibraryPick[] => {
    if (appMode === 'cloud') return [];
    const conversations = localConversations.filter(
      (conversation) => executionModeForConversation(conversation) === 'local',
    );
    return recentMobileFiles(conversations, localMessages)
      .filter((file) => !file.mimeType.startsWith('image/'))
      .map((file) => ({
        id: file.id,
        fileName: file.fileName,
        subtitle: file.conversationTitle,
        isImage: false,
        attachment: {
          id: `library-${file.id}`,
          uri: file.uri,
          mimeType: file.mimeType,
          fileName: file.fileName,
          ...(file.fileSize != null ? { fileSize: file.fileSize } : {}),
          ...(file.assetId ? { assetId: file.assetId } : {}),
        },
      }));
  }, [appMode, localConversations, localMessages]);

  const [cloudLibrary, setCloudLibrary] = useState<CloudLibraryState>({ status: 'idle' });
  const loadCloudLibrary = useCallback(() => {
    setCloudLibrary({ status: 'loading' });
    fetchLibraryPage({ limit: LIBRARY_PICKER_SIZE })
      .then((page) =>
        setCloudLibrary({
          status: 'ready',
          picks: page.assets
            .filter((asset) => asset.kind !== 'video')
            .map((asset) => ({
              id: asset.id,
              fileName: asset.fileName,
              subtitle: asset.sourceLabel,
              isImage: asset.kind === 'image',
              attachment: {
                id: `library-${asset.id}`,
                uri: asset.uri,
                mimeType: asset.mimeType,
                fileName: asset.fileName,
                ...(asset.byteCount != null ? { fileSize: asset.byteCount } : {}),
                assetId: asset.id,
              },
            })),
        }),
      )
      .catch(() => setCloudLibrary({ status: 'error' }));
  }, []);
  const libraryPicks =
    appMode === 'cloud'
      ? cloudLibrary.status === 'ready'
        ? cloudLibrary.picks
        : []
      : localLibraryPicks;

  const haptic = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [hapticsEnabled]);

  const closeSheet = useCallback(() => {
    if (ref && 'current' in ref && ref.current) {
      ref.current.close();
    }
  }, [ref]);

  const handleCamera = useCallback(() => {
    haptic();
    closeSheet();
    onCamera();
  }, [haptic, closeSheet, onCamera]);

  const handlePhotos = useCallback(() => {
    haptic();
    closeSheet();
    onPhotos();
  }, [haptic, closeSheet, onPhotos]);

  const handleFile = useCallback(() => {
    haptic();
    closeSheet();
    onFile();
  }, [haptic, closeSheet, onFile]);

  const handleAttachFromLibrary = useCallback(
    (pick: LibraryPick) => {
      haptic();
      closeSheet();
      onAttachFromLibrary(pick.attachment);
    },
    [closeSheet, haptic, onAttachFromLibrary],
  );

  // Handing off to another sheet keeps this one on screen while it animates
  // out, so without this the tapped row sat inert for the whole handoff and
  // read as a dead control.
  const [handoff, setHandoff] = useState<'style' | 'model' | 'project' | null>(null);

  const handleOpenStyleSelector = useCallback(() => {
    haptic();
    setHandoff('style');
    onOpenStyleSelector();
  }, [haptic, onOpenStyleSelector]);

  const handleOpenModelPicker = useCallback(() => {
    haptic();
    setHandoff('model');
    onOpenModelPicker();
  }, [haptic, onOpenModelPicker]);

  const handleOpenProjectPicker = useCallback(() => {
    haptic();
    setHandoff('project');
    onOpenProjectPicker();
  }, [haptic, onOpenProjectPicker]);

  const handleResearchToggle = useCallback(
    (enabled: boolean) => {
      if (!FEATURES.research) return;
      haptic();
      setFeature('research', enabled);
    },
    [haptic, setFeature],
  );

  const handleSelectImageMode = useCallback(() => {
    haptic();
    if (mediaMode === 'image') return;
    enterMediaMode('image');
  }, [haptic, mediaMode]);

  const handleSelectVideoMode = useCallback(() => {
    haptic();
    if (mediaMode === 'video') return;
    enterMediaMode('video');
  }, [haptic, mediaMode]);

  const handleBackToText = useCallback(() => {
    haptic();
    exitMediaMode();
  }, [haptic]);

  const handleOpenSkills = useCallback(() => {
    if (!onOpenSkills) return;
    haptic();
    closeSheet();
    onOpenSkills();
  }, [closeSheet, haptic, onOpenSkills]);

  const handleConnectors = useCallback(() => {
    haptic();
    if (!FEATURES.connectors) {
      onOpenCloudAccess();
      return;
    }
    closeSheet();
    router.push('/(app)/connectors' as Parameters<typeof router.push>[0]);
  }, [haptic, onOpenCloudAccess, closeSheet, router]);

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    [],
  );

  const cardBg = themeColors.neutralSurface;
  const dividerColor = themeColors.borderLight;
  return (
    <BottomSheet
      ref={ref}
      index={-1}
      accessible={false}
      onChange={(index) => {
        if (index < 0) {
          setHandoff(null);
          return;
        }
        if (appMode === 'cloud' && cloudLibrary.status !== 'loading') loadCloudLibrary();
      }}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      enableDynamicSizing={false}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backdropComponent={renderBackdrop}
      backgroundStyle={{
        backgroundColor: themeColors.surfaceElevated,
        borderTopLeftRadius: sheetRadius,
        borderTopRightRadius: sheetRadius,
      }}
      handleIndicatorStyle={{ backgroundColor: themeColors.textMuted }}
    >
      <BottomSheetScrollView
        testID="add-to-chat-sheet"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingBottom: 16,
          }}
        >
          <View style={{ width: 28 }} />
          <Text
            style={{
              fontSize: typeScale.callout,
              fontWeight: '600',
              color: themeColors.textPrimary,
            }}
          >
            Add to Chat
          </Text>
          <PressableBox
            onPress={closeSheet}
            testID="add-to-chat-close"
            accessible
            style={{ padding: 4 }}
            accessibilityLabel="Close Add to Chat"
            accessibilityRole="button"
            hitSlop={8}
          >
            <X size={20} color={themeColors.textMuted} />
          </PressableBox>
        </View>

        {/* Section 1: Attachment Row */}
        <View
          style={{
            flexDirection: 'row',
            gap: 12,
            paddingHorizontal: 20,
            paddingBottom: 20,
          }}
        >
          {cameraAllowed ? (
            <AttachmentCard
              icon={<Camera size={22} color={themeColors.teal} />}
              label="Camera"
              onPress={handleCamera}
              bg={cardBg}
              textColor={themeColors.textPrimary}
            />
          ) : null}
          <AttachmentCard
            icon={<ImageIcon size={22} color={themeColors.teal} />}
            label="Photos"
            onPress={handlePhotos}
            bg={cardBg}
            textColor={themeColors.textPrimary}
          />
          {appMode === 'cloud' ? (
            <AttachmentCard
              icon={<FileText size={22} color={themeColors.teal} />}
              label="File"
              onPress={handleFile}
              bg={cardBg}
              textColor={themeColors.textPrimary}
            />
          ) : null}
        </View>

        {appMode === 'cloud' ? (
          <Text
            style={{
              paddingHorizontal: 20,
              marginTop: -8,
              paddingBottom: 16,
              fontSize: typeScale.caption,
              lineHeight: 17,
              color: themeColors.textMuted,
            }}
          >
            {isTemporaryChat ? TEMPORARY_ATTACH_RETENTION_NOTE : CLOUD_ATTACH_RETENTION_NOTE}
          </Text>
        ) : null}

        {libraryPicks.length > 0 ||
        (appMode === 'cloud' &&
          (cloudLibrary.status === 'loading' || cloudLibrary.status === 'error')) ? (
          <View style={{ paddingBottom: 20 }}>
            <Text
              style={{
                paddingHorizontal: 20,
                paddingBottom: 9,
                fontSize: typeScale.caption,
                fontWeight: '600',
                color: themeColors.textMuted,
                textTransform: 'uppercase',
              }}
            >
              Attach from Library
            </Text>
            {appMode === 'cloud' && cloudLibrary.status === 'loading' ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 20,
                }}
                accessibilityLiveRegion="polite"
              >
                <ActivityIndicator size="small" color={themeColors.textMuted} />
                <Text style={{ fontSize: typeScale.footnote, color: themeColors.textMuted }}>
                  Loading your Library
                </Text>
              </View>
            ) : appMode === 'cloud' && cloudLibrary.status === 'error' ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 20,
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    fontSize: typeScale.footnote,
                    color: themeColors.textSecondary,
                  }}
                >
                  Your Library could not load.
                </Text>
                <PressableBox
                  onPress={loadCloudLibrary}
                  accessibilityRole="button"
                  accessibilityLabel="Try loading your Library again"
                  style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
                >
                  <Text
                    style={{
                      fontSize: typeScale.footnote,
                      fontWeight: '600',
                      color: themeColors.teal,
                    }}
                  >
                    Try again
                  </Text>
                </PressableBox>
              </View>
            ) : (
              <ScrollView
                horizontal
                contentInsetAdjustmentBehavior="automatic"
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
              >
                {libraryPicks.map((pick) => (
                  <PressableBox
                    key={pick.id}
                    onPress={() => handleAttachFromLibrary(pick)}
                    accessibilityRole="button"
                    accessibilityLabel={`Attach ${pick.fileName} from Library`}
                    style={{
                      width: 176,
                      minHeight: 70,
                      padding: 12,
                      borderRadius: 14,
                      backgroundColor: cardBg,
                      borderWidth: 1,
                      borderColor: dividerColor,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 11,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: themeColors.accentSurface,
                      }}
                    >
                      {pick.isImage ? (
                        <ImageIcon size={18} color={themeColors.teal} />
                      ) : (
                        <FileText size={18} color={themeColors.teal} />
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={2}
                        style={{
                          color: themeColors.textPrimary,
                          fontSize: typeScale.footnote,
                          fontWeight: '600',
                        }}
                      >
                        {pick.fileName}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: themeColors.textMuted,
                          fontSize: typeScale.caption,
                          marginTop: 3,
                        }}
                      >
                        {pick.subtitle}
                      </Text>
                    </View>
                  </PressableBox>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: dividerColor, marginHorizontal: 20 }} />

        {/* Model sits directly under the attachment cards and ABOVE Create:
            it is the most-tapped row in this sheet, so it gets the shortest
            thumb travel rather than sitting at the bottom with the rarely
            touched config links (founder 2026-08-07). In a media mode the
            Create section below owns the model choice, so this row would be a
            second, conflicting control, it is hidden there. */}
        {mediaMode === 'text' ? (
          <>
            <View style={{ paddingHorizontal: 20, paddingVertical: 4 }}>
              <ConfigLink
                icon={<Bot size={18} color={themeColors.textMuted} />}
                label="Model"
                value={getShortDisplayName(selectedModel, tier)}
                textColor={themeColors.textPrimary}
                mutedColor={themeColors.textMuted}
                pending={handoff === 'model'}
                onPress={handleOpenModelPicker}
              />
            </View>
            <View style={{ height: 1, backgroundColor: dividerColor, marginHorizontal: 20 }} />
          </>
        ) : null}

        {/* Section 2: Create, output kind.
            Image and video are MODES, not flags: picking one switches the
            selected model to the registry's media model for that slot (founder
            2026-08-06), replacing the old boolean toggles that sat on top of a
            text model the send path never actually used. AGI Work moved out of
            this sheet to the drawer in the same pass, it is a session-wide
            stance, not a per-message attachment. */}
        {showImageOption || showVideoOption ? (
          <>
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
              <Text
                style={{
                  fontSize: typeScale.caption,
                  fontWeight: '600',
                  color: themeColors.textMuted,
                  letterSpacing: 0,
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Create
              </Text>

              {showImageOption ? (
                <MediaModeRow
                  icon={
                    <Paintbrush
                      size={18}
                      color={mediaMode === 'image' ? themeColors.teal : themeColors.textMuted}
                    />
                  }
                  label="Image"
                  description="Generate images in this chat"
                  active={mediaMode === 'image'}
                  onPress={handleSelectImageMode}
                  textColor={themeColors.textPrimary}
                  mutedColor={themeColors.textMuted}
                  activeColor={themeColors.teal}
                />
              ) : null}
              {showVideoOption ? (
                <MediaModeRow
                  icon={
                    <Film
                      size={18}
                      color={mediaMode === 'video' ? themeColors.teal : themeColors.textMuted}
                    />
                  }
                  label="Video"
                  description={'Generate video in this chat'}
                  active={mediaMode === 'video'}
                  onPress={handleSelectVideoMode}
                  textColor={themeColors.textPrimary}
                  mutedColor={themeColors.textMuted}
                  activeColor={themeColors.teal}
                />
              ) : null}
              {/* Model catalog for the ACTIVE kind. Picking Image or Video is
                  only half the decision, the catalog carries several models
                  per kind at very different prices, so the choice belongs to
                  the user. */}
              {mediaMode !== 'text' ? (
                <View style={{ paddingTop: 4, paddingBottom: 2 }}>
                  <Text
                    style={{
                      fontSize: typeScale.caption,
                      fontWeight: '600',
                      color: themeColors.textMuted,
                      textTransform: 'uppercase',
                      paddingHorizontal: 4,
                      marginBottom: 2,
                    }}
                  >
                    {mediaMode === 'video' ? 'Video model' : 'Image model'}
                  </Text>
                  {listMediaModels(mediaMode).map((candidateId) => (
                    <MediaModelRow
                      key={candidateId}
                      modelId={candidateId}
                      selected={
                        candidateId === (mediaMode === 'video' ? videoModelId : imageModelId)
                      }
                      onPress={() => {
                        haptic();
                        setMediaModel(mediaMode, candidateId);
                      }}
                      textColor={themeColors.textPrimary}
                      mutedColor={themeColors.textMuted}
                      activeColor={themeColors.teal}
                    />
                  ))}

                  {mediaMode === 'image' ? (
                    <Text
                      testID="image-reference-hint"
                      style={{
                        fontSize: typeScale.caption,
                        color: themeColors.textMuted,
                        paddingHorizontal: 4,
                        marginTop: 6,
                      }}
                    >
                      {imageModelSupportsReference
                        ? 'Attach up to 4 photos above: the first is edited with your prompt and the others guide it.'
                        : 'This model generates from text only. Attach a photo and pick an editing model to edit it.'}
                    </Text>
                  ) : null}

                  {/* Image output shape. Same treatment as video: the managed
                      image route has always accepted and validated
                      `aspect_ratio`, but no surface offered one, so every
                      generated image took the route's legacy square default. */}
                  {mediaMode === 'image' && imageAspectOptions.length > 1 ? (
                    <>
                      <Text
                        style={{
                          fontSize: typeScale.caption,
                          fontWeight: '600',
                          color: themeColors.textMuted,
                          textTransform: 'uppercase',
                          paddingHorizontal: 4,
                          marginTop: 10,
                          marginBottom: 2,
                        }}
                      >
                        Aspect ratio
                      </Text>
                      {imageAspectOptions.map((option) => (
                        <MediaOptionRow
                          key={option.id}
                          label={option.label}
                          selected={option.id === effectiveImageAspectRatio}
                          onPress={() => {
                            haptic();
                            setImageAspectRatio(option.id);
                          }}
                          textColor={themeColors.textPrimary}
                          mutedColor={themeColors.textMuted}
                          activeColor={themeColors.teal}
                        />
                      ))}
                    </>
                  ) : null}

                  {mediaMode === 'image' && imageModelSupportsReference ? (
                    <MediaOptionRow
                      label="Transparent background"
                      hint="Return the image without a background"
                      selected={imageTransparentBackground}
                      onPress={() => {
                        haptic();
                        setImageTransparentBackground(!imageTransparentBackground);
                      }}
                      textColor={themeColors.textPrimary}
                      mutedColor={themeColors.textMuted}
                      activeColor={themeColors.teal}
                    />
                  ) : null}

                  {/* Video output shape. Options come from the shared model
                      catalog, so a model without a published 4k tuple never
                      offers 4k here, and quality is scoped BY aspect because
                      the two are not independent, a resolution can exist in
                      landscape and not in portrait. */}
                  {mediaMode === 'video' && videoAspectOptions.length > 1 ? (
                    <>
                      <Text
                        style={{
                          fontSize: typeScale.caption,
                          fontWeight: '600',
                          color: themeColors.textMuted,
                          textTransform: 'uppercase',
                          paddingHorizontal: 4,
                          marginTop: 10,
                          marginBottom: 2,
                        }}
                      >
                        Aspect ratio
                      </Text>
                      {videoAspectOptions.map((option) => (
                        <MediaOptionRow
                          key={option.id}
                          label={option.label}
                          selected={option.id === effectiveVideoAspectRatio}
                          onPress={() => {
                            haptic();
                            setVideoAspectRatio(option.id);
                          }}
                          textColor={themeColors.textPrimary}
                          mutedColor={themeColors.textMuted}
                          activeColor={themeColors.teal}
                        />
                      ))}
                    </>
                  ) : null}

                  {mediaMode === 'video' && videoQualityOptions.length > 1 ? (
                    <>
                      <Text
                        style={{
                          fontSize: typeScale.caption,
                          fontWeight: '600',
                          color: themeColors.textMuted,
                          textTransform: 'uppercase',
                          paddingHorizontal: 4,
                          marginTop: 10,
                          marginBottom: 2,
                        }}
                      >
                        Quality
                      </Text>
                      {videoQualityOptions.map((option) => (
                        <MediaOptionRow
                          key={option.id}
                          label={option.label}
                          hint={
                            option.durationSecs
                              ? `${option.durationSecs.join('/')}s only`
                              : undefined
                          }
                          selected={option.id === effectiveVideoResolution}
                          onPress={() => {
                            haptic();
                            setVideoResolution(option.id);
                          }}
                          textColor={themeColors.textPrimary}
                          mutedColor={themeColors.textMuted}
                          activeColor={themeColors.teal}
                        />
                      ))}
                    </>
                  ) : null}

                  {mediaMode === 'video' && videoDurationOptions.length > 1 ? (
                    <>
                      <Text
                        style={{
                          fontSize: typeScale.caption,
                          fontWeight: '600',
                          color: themeColors.textMuted,
                          textTransform: 'uppercase',
                          paddingHorizontal: 4,
                          marginTop: 10,
                          marginBottom: 2,
                        }}
                      >
                        Length
                      </Text>
                      {videoDurationOptions.map((secs) => (
                        <MediaOptionRow
                          key={secs}
                          label={`${secs} seconds`}
                          selected={secs === videoOutputSelection.durationSecs}
                          onPress={() => {
                            haptic();
                            setVideoDurationSecs(secs);
                          }}
                          textColor={themeColors.textPrimary}
                          mutedColor={themeColors.textMuted}
                          activeColor={themeColors.teal}
                        />
                      ))}
                    </>
                  ) : null}

                  {mediaMode === 'video' && videoEstimate ? (
                    <Text
                      testID="video-cost-estimate"
                      accessibilityRole="text"
                      style={{
                        fontSize: typeScale.caption,
                        color: themeColors.textMuted,
                        paddingHorizontal: 4,
                        marginTop: 8,
                      }}
                    >
                      {`About ${formatCredits(videoEstimate.credits, {
                        maximumFractionDigits: videoEstimate.credits < 10 ? 1 : 0,
                      })} for a ${videoEstimate.durationSecs}-second clip. The final cost settles when it is delivered, and a failed video costs nothing.`}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {mediaMode !== 'text' ? (
                <PressableBox
                  onPress={handleBackToText}
                  accessibilityRole="button"
                  accessibilityLabel="Back to text chat"
                  style={{ paddingVertical: 10, paddingHorizontal: 4 }}
                >
                  <Text style={{ fontSize: typeScale.footnote, color: themeColors.teal }}>
                    Back to text chat
                  </Text>
                </PressableBox>
              ) : null}
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: dividerColor, marginHorizontal: 20 }} />
          </>
        ) : null}

        {showOutputSection ? (
          <>
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
              <Text
                style={{
                  fontSize: typeScale.caption,
                  fontWeight: '600',
                  color: themeColors.textMuted,
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                Output
              </Text>
              {CHAT_OUTPUT_FORMATS.map((format) => (
                <MediaOptionRow
                  key={format}
                  label={CHAT_OUTPUT_FORMAT_LABEL[format]}
                  selected={outputFormat === format}
                  onPress={() => {
                    haptic();
                    setOutputFormat(outputFormat === format ? null : format);
                  }}
                  textColor={themeColors.textPrimary}
                  mutedColor={themeColors.textMuted}
                  activeColor={themeColors.teal}
                />
              ))}
            </View>
            <View style={{ height: 1, backgroundColor: dividerColor, marginHorizontal: 20 }} />
          </>
        ) : null}

        {/* Section 3: Tool availability */}
        {showToolSection ? (
          <View style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 4 }}>
            {showResearchToggle ? (
              <CapabilityRow
                icon={<Telescope size={18} color={themeColors.teal} />}
                label="Deep research"
                description="Multi-step research with cited sources"
                enabled={features.research}
                onToggle={handleResearchToggle}
                textColor={themeColors.textPrimary}
                mutedColor={themeColors.textMuted}
              />
            ) : null}
          </View>
        ) : null}

        {/* Divider */}
        {showToolSection ? (
          <View style={{ height: 1, backgroundColor: dividerColor, marginHorizontal: 20 }} />
        ) : null}

        {/* Section 4: Config Links */}
        <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
          {/* Project assignment for the current chat -- both modes. The picker
              itself is ProjectSelectorBar's modal, opened by the host screen;
              it reads the local or cloud project store per active mode. */}
          <ConfigLink
            icon={<FolderPlus size={18} color={themeColors.textMuted} />}
            label="Project"
            value={activeProject?.name ?? 'Choose'}
            textColor={themeColors.textPrimary}
            mutedColor={themeColors.textMuted}
            pending={handoff === 'project'}
            onPress={handleOpenProjectPicker}
          />
          <ConfigLink
            icon={<Palette size={18} color={themeColors.textMuted} />}
            label="Choose style"
            value={chatStyle.charAt(0).toUpperCase() + chatStyle.slice(1)}
            textColor={themeColors.textPrimary}
            mutedColor={themeColors.textMuted}
            pending={handoff === 'style'}
            onPress={handleOpenStyleSelector}
          />
          {appMode === 'cloud' && FEATURES.skills && onOpenSkills ? (
            <ConfigLink
              icon={<Sparkles size={18} color={themeColors.textMuted} />}
              label="Skills"
              value={selectedSkillName ?? 'Choose'}
              textColor={themeColors.textPrimary}
              mutedColor={themeColors.textMuted}
              onPress={handleOpenSkills}
            />
          ) : null}
          {appMode === 'cloud' && FEATURES.connectors && canUseConnectors ? (
            <ConfigLink
              icon={<Link size={18} color={themeColors.textMuted} />}
              label="Connectors"
              textColor={themeColors.textPrimary}
              mutedColor={themeColors.textMuted}
              onPress={handleConnectors}
            />
          ) : null}
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
});

function AttachmentCard({
  icon,
  label,
  onPress,
  bg,
  textColor,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  bg: string;
  textColor: string;
}) {
  return (
    <PressableBox
      onPress={onPress}
      accessible
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 14,
        backgroundColor: bg,
        gap: 6,
      }}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      {icon}
      <Text style={{ fontSize: typeScale.caption, fontWeight: '500', color: textColor }}>
        {label}
      </Text>
    </PressableBox>
  );
}

function MediaModeRow({
  icon,
  label,
  description,
  active,
  onPress,
  textColor,
  mutedColor,
  activeColor,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  active: boolean;
  onPress: () => void;
  textColor: string;
  mutedColor: string;
  activeColor: string;
}) {
  return (
    <PressableBox
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}${active ? ', selected' : ''}`}
      accessibilityHint={active ? undefined : `Switches this chat to ${label.toLowerCase()}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 4,
        minHeight: 52,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        {icon}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: typeScale.body, color: active ? activeColor : textColor }}>
            {label}
          </Text>
          <Text
            style={{ fontSize: typeScale.caption, color: mutedColor, marginTop: 1 }}
            numberOfLines={2}
          >
            {description}
          </Text>
        </View>
      </View>
      {active ? <Check size={18} color={activeColor} /> : null}
    </PressableBox>
  );
}

function unitCredits(usd: number): string {
  const credits = chargeCreditsForMicrousd(Math.ceil(usd * MICROUSD_PER_USD));
  return formatCredits(credits, { maximumFractionDigits: credits < 10 ? 1 : 0 });
}

function mediaCreditPrice(meta: ModelMetadata): string | null {
  const byResolution = Object.values(meta.videoPerSecondCostByResolution ?? {}).filter(
    (rate): rate is number => typeof rate === 'number' && Number.isFinite(rate),
  );
  const perSecond = byResolution.length > 0 ? Math.min(...byResolution) : meta.videoPerSecondCost;
  if (perSecond !== undefined) {
    const from = new Set(byResolution).size > 1 ? 'From ' : '';
    return `${from}${unitCredits(perSecond)} per second`;
  }
  if (meta.imagePerImageCost !== undefined) {
    return `${unitCredits(meta.imagePerImageCost)} per image`;
  }
  return null;
}

function MediaModelRow({
  modelId,
  selected,
  onPress,
  textColor,
  mutedColor,
  activeColor,
}: {
  modelId: string;
  selected: boolean;
  onPress: () => void;
  textColor: string;
  mutedColor: string;
  activeColor: string;
}) {
  const meta = getModelMetadataById(modelId);
  const price = meta
    ? (mediaCreditPrice(meta) ?? providerLabels[meta.provider] ?? meta.provider)
    : '';

  return (
    <PressableBox
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${meta?.name ?? modelId}${price ? `, ${price}` : ''}${selected ? ', selected' : ''}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        paddingHorizontal: 4,
        paddingLeft: 28,
        minHeight: 44,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: typeScale.subhead, color: selected ? activeColor : textColor }}>
          {meta?.name ?? modelId}
        </Text>
        {price ? (
          <Text style={{ fontSize: typeScale.caption, color: mutedColor, marginTop: 1 }}>
            {price}
          </Text>
        ) : null}
      </View>
      {selected ? <Check size={16} color={activeColor} /> : null}
    </PressableBox>
  );
}

type CapabilityRowBaseProps = {
  icon: React.ReactNode;
  label: string;
  description: string;
  badge?: string;
  enabled: boolean;
  statusTone?: 'waitlist' | 'desktop' | 'neutral';
  textColor: string;
  mutedColor: string;
};

type CapabilityRowProps =
  | (CapabilityRowBaseProps & {
      status: string;
      onStatusPress?: () => void;
      onToggle?: never;
    })
  | (CapabilityRowBaseProps & {
      status?: undefined;
      onStatusPress?: never;
      onToggle: (value: boolean) => void | Promise<void>;
    });

function CapabilityRow(props: CapabilityRowProps) {
  const {
    icon,
    label,
    description,
    badge,
    enabled,
    statusTone = 'neutral',
    textColor,
    mutedColor,
  } = props;

  const leadingContent = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
      {icon}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: typeScale.body, color: textColor }}>{label}</Text>
          {badge && <StatusPill label={badge} tone="danger" />}
        </View>
        <Text
          style={{ fontSize: typeScale.caption, color: mutedColor, marginTop: 1 }}
          numberOfLines={2}
        >
          {description}
        </Text>
      </View>
    </View>
  );

  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 10,
    paddingHorizontal: 4,
    minHeight: 52,
  };

  if ('status' in props && props.status !== undefined) {
    const rowContent = (
      <>
        {leadingContent}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 10 }}>
          <StatusPill label={props.status} tone={statusTone} />
          {props.onStatusPress ? (
            <ChevronRight size={16} color={mutedColor} />
          ) : (
            <Lock size={14} color={mutedColor} />
          )}
        </View>
      </>
    );

    return (
      <PressableBox
        onPress={props.onStatusPress}
        disabled={!props.onStatusPress}
        accessible
        style={rowStyle}
        accessibilityLabel={`${label}, ${props.status}`}
        accessibilityRole={props.onStatusPress ? 'button' : 'text'}
        accessibilityHint={props.onStatusPress ? 'Opens availability details' : undefined}
      >
        {rowContent}
      </PressableBox>
    );
  }

  const rowContent = (
    <>
      {leadingContent}
      <Switch
        value={enabled}
        onValueChange={(next) => {
          void props.onToggle(next);
        }}
        accessibilityLabel={`${label} ${enabled ? 'on' : 'off'}`}
      />
    </>
  );

  return <View style={rowStyle}>{rowContent}</View>;
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: 'waitlist' | 'desktop' | 'neutral' | 'danger';
}) {
  const colors = useThemeColors();
  const palette = {
    waitlist: { bg: colors.warningSurface, fg: colors.agentWarning },
    desktop: { bg: colors.neutralSurface, fg: colors.textSecondary },
    neutral: { bg: colors.neutralSurface, fg: colors.textSecondary },
    danger: { bg: colors.dangerSurface, fg: colors.agentError },
  }[tone];

  return (
    <View
      style={{
        backgroundColor: palette.bg,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 5,
      }}
    >
      <Text style={{ fontSize: typeScale.caption, fontWeight: '600', color: palette.fg }}>
        {label}
      </Text>
    </View>
  );
}

function ConfigLink({
  icon,
  label,
  value,
  statusTone = 'neutral',
  textColor,
  mutedColor,
  pending = false,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  statusTone?: 'waitlist' | 'desktop' | 'neutral';
  textColor: string;
  mutedColor: string;
  pending?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableBox
      onPress={onPress}
      accessible
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 4,
      }}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: pending }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {icon}
        <Text style={{ fontSize: typeScale.body, color: textColor }}>{label}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {pending ? (
          <ActivityIndicator
            testID={`config-link-pending-${label}`}
            size="small"
            color={mutedColor}
          />
        ) : (
          <>
            {value &&
              (statusTone === 'neutral' ? (
                <Text style={{ fontSize: typeScale.footnote, color: mutedColor }}>{value}</Text>
              ) : (
                <StatusPill label={value} tone={statusTone} />
              ))}
            <ChevronRight size={16} color={mutedColor} />
          </>
        )}
      </View>
    </PressableBox>
  );
}

function MediaOptionRow({
  label,
  hint,
  selected,
  onPress,
  textColor,
  mutedColor,
  activeColor,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  textColor: string;
  mutedColor: string;
  activeColor: string;
}) {
  return (
    <PressableBox
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}${hint ? `, ${hint}` : ''}${selected ? ', selected' : ''}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        paddingHorizontal: 4,
        paddingLeft: 28,
        minHeight: 44,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: typeScale.subhead, color: selected ? activeColor : textColor }}>
          {label}
        </Text>
        {hint ? (
          <Text style={{ fontSize: typeScale.caption, color: mutedColor, marginTop: 1 }}>
            {hint}
          </Text>
        ) : null}
      </View>
      {selected ? <Check size={16} color={activeColor} /> : null}
    </PressableBox>
  );
}
