import { useCallback, forwardRef, useMemo } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
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
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { canUseBillingPlanCapability, getModelMetadataById } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { useChatStore } from '@/stores/chatStore';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import {
  enterMediaMode,
  exitMediaMode,
  listMediaModels,
  resolveMediaModelId,
} from '@/src/features/chat/actions/mediaMode';
import { useSettingsStore } from '@/stores/settingsStore';
import { useProjectStore } from '@/src/features/projects/store';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useModelStore } from '@/src/features/model-picker/store';
import { getShortDisplayName } from '@/src/features/model-picker/service';
import { useTierStore } from '@/src/features/billing/store';
import { useTheme, useThemeColors, sheetRadius } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { executionModeForConversation } from '@/src/features/chat/utils/conversationMode';
import { collectSearchableMobileFiles } from '@/src/features/search/mobileGlobalSearch';
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
}

const SNAP_POINTS = ['75%'];

/**
 * "Add to Chat" bottom sheet.
 * Opened by the [+] button in ChatInput.
 *
 * Sections:
 * 1. Attachment row (Camera, Photos, File)
 * 2. Session toggles (AGI Work)
 * 3. Tool availability (cloud-gated tools + desktop handoff)
 * 4. Config links (Project, Style, Connectors)
 */
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
  },
  ref,
) {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const chatStyle = useChatStore((s) => s.chatStyle);
  const localConversations = useChatStore((s) => s.conversations);
  const localMessages = useChatStore((s) => s.messages);
  const cloudConversations = useChatCloudMessageStore((s) => s.conversations);
  const cloudMessages = useChatCloudMessageStore((s) => s.messages);
  const features = useChatStore((s) => s.features);
  const setFeature = useChatStore((s) => s.setFeature);
  const mediaMode = useChatViewStore((s) => s.mediaMode);
  const setMediaModel = useChatViewStore((s) => s.setMediaModel);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const tier = useTierStore((s) => s.tier);
  const grantedCapabilities = useTierStore((s) => s.grantedCapabilities);
  const selectedModel = useModelStore((s) => s.selectedModel);
  const selectedModelMetadata = getModelMetadataById(selectedModel);
  // Code execution has NO row here. It is a standing capability, not a
  // per-message attachment, and it already has a switch in
  // Settings > Capabilities bound to the same `features.codeExecution` flag —
  // this sheet's copy was a duplicate control for one preference. Both
  // reference apps agree: Claude puts "Code execution and file creation" in
  // Settings > Capabilities, not the composer's + menu (founder 2026-08-06).
  // The send path still re-verifies model capability and deployment
  // availability per turn in chatExecutionStore, so nothing is loosened.
  // Deep Research: cloud-only, paid, and only for a model that declares BOTH the
  // `research` capability AND native `search` (the server's research loop needs
  // web search). Same "never a cosmetic toggle" reasoning as web search / code
  // execution — gated on the SELECTED model + tier so switching models hides it.
  const showResearchToggle =
    FEATURES.research &&
    appMode === 'cloud' &&
    selectedModelMetadata?.capabilities?.research === true &&
    selectedModelMetadata?.capabilities?.search === true &&
    grantedCapabilities.includes('canUseDeepResearch');
  const showToolSection = showResearchToggle || FEATURES.computerUse;
  // Media generation runs only through the Managed Cloud media routes, so both
  // options are Cloud-only. Each is additionally hidden when the canonical
  // registry slot has no capable model, so the sheet never offers an output kind
  // that would fail at send time.
  const imageModelId = resolveMediaModelId('image');
  const videoModelId = resolveMediaModelId('video');
  const showImageOption =
    FEATURES.imageGen &&
    appMode === 'cloud' &&
    imageModelId !== null &&
    grantedCapabilities.includes('canUseImages') &&
    canUseBillingPlanCapability(tier, 'image_generation');
  // Video is Max 15x / Enterprise only — `video_generation` in the billing
  // catalog. The server enforces it too; this just avoids showing a control that
  // can only produce a paywall.
  const showVideoOption =
    appMode === 'cloud' &&
    videoModelId !== null &&
    grantedCapabilities.includes('canUseImages') &&
    canUseBillingPlanCapability(tier, 'video_generation');
  // Catalog name, NOT `getShortDisplayName`: that helper only knows models the
  // picker can select, and media slot models are not selectable — it returned
  // UNKNOWN_MODEL_LABEL, so both rows read "Switches to Not set".
  const imageModelName = imageModelId ? (getModelMetadataById(imageModelId)?.name ?? null) : null;
  const videoModelName = videoModelId ? (getModelMetadataById(videoModelId)?.name ?? null) : null;
  const canUseConnectors = grantedCapabilities.includes('canUseConnectors');

  // Local and cloud projects live in physically separate stores; read the one
  // matching the active mode so the row never shows a local project name while
  // the chat is running in Cloud (or vice versa).
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
  const libraryDocuments = useMemo(() => {
    const conversations =
      appMode === 'cloud'
        ? cloudConversations
        : localConversations.filter(
            (conversation) => executionModeForConversation(conversation) === 'local',
          );
    const messages = appMode === 'cloud' ? cloudMessages : localMessages;
    return collectSearchableMobileFiles(conversations, messages).filter(
      (file) => !file.mimeType.startsWith('image/'),
    );
  }, [appMode, cloudConversations, cloudMessages, localConversations, localMessages]);

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
    (document: (typeof libraryDocuments)[number]) => {
      haptic();
      closeSheet();
      onAttachFromLibrary({
        id: `library-${document.id}`,
        uri: document.uri,
        mimeType: document.mimeType,
        fileName: document.fileName,
        ...(document.fileSize != null ? { fileSize: document.fileSize } : {}),
        ...(document.assetId ? { assetId: document.assetId } : {}),
      });
    },
    [closeSheet, haptic, onAttachFromLibrary],
  );

  const handleOpenStyleSelector = useCallback(() => {
    haptic();
    onOpenStyleSelector();
  }, [haptic, onOpenStyleSelector]);

  const handleOpenModelPicker = useCallback(() => {
    haptic();
    onOpenModelPicker();
  }, [haptic, onOpenModelPicker]);

  const handleOpenProjectPicker = useCallback(() => {
    haptic();
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

  // Selecting a media mode swaps the composer's model; selecting the one that
  // is already active is a no-op rather than a toggle-off, so a double tap
  // cannot silently drop the user back to text mid-thought. "Back to text chat"
  // is the explicit way out, mirrored by the composer's MediaModeChip.
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
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      // Belt-and-braces for the keyboard-over-sheet bug fixed at the tap site in
      // ChatInput: if anything ever raises the keyboard while this sheet is up,
      // the sheet resizes around it instead of being covered by it, and a blur
      // restores the previous position rather than leaving a gap.
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
              fontSize: 16,
              fontWeight: '600',
              color: themeColors.textPrimary,
            }}
          >
            Add to Chat
          </Text>
          <Pressable
            onPress={closeSheet}
            testID="add-to-chat-close"
            accessible
            style={{ padding: 4 }}
            accessibilityLabel="Close Add to Chat"
            accessibilityRole="button"
            hitSlop={8}
          >
            <X size={20} color={themeColors.textMuted} />
          </Pressable>
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
          <AttachmentCard
            icon={<Camera size={22} color={themeColors.teal} />}
            label="Camera"
            onPress={handleCamera}
            bg={cardBg}
            textColor={themeColors.textPrimary}
          />
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

        {libraryDocuments.length > 0 ? (
          <View style={{ paddingBottom: 20 }}>
            <Text
              style={{
                paddingHorizontal: 20,
                paddingBottom: 9,
                fontSize: 11,
                fontWeight: '600',
                color: themeColors.textMuted,
                textTransform: 'uppercase',
              }}
            >
              Attach from Library
            </Text>
            <ScrollView
              horizontal
              contentInsetAdjustmentBehavior="automatic"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
            >
              {libraryDocuments.map((document) => (
                <Pressable
                  key={document.id}
                  onPress={() => handleAttachFromLibrary(document)}
                  accessibilityRole="button"
                  accessibilityLabel={`Attach ${document.fileName} from Library`}
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
                    <FileText size={18} color={themeColors.teal} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={2}
                      style={{ color: themeColors.textPrimary, fontSize: 13, fontWeight: '600' }}
                    >
                      {document.fileName}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ color: themeColors.textMuted, fontSize: 11, marginTop: 3 }}
                    >
                      {document.conversationTitle}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: dividerColor, marginHorizontal: 20 }} />

        {/* Model sits directly under the attachment cards and ABOVE Create:
            it is the most-tapped row in this sheet, so it gets the shortest
            thumb travel rather than sitting at the bottom with the rarely
            touched config links (founder 2026-08-07). In a media mode the
            Create section below owns the model choice, so this row would be a
            second, conflicting control — it is hidden there. */}
        {mediaMode === 'text' ? (
          <>
            <View style={{ paddingHorizontal: 20, paddingVertical: 4 }}>
              <ConfigLink
                icon={<Bot size={18} color={themeColors.textMuted} />}
                label="Model"
                value={getShortDisplayName(selectedModel, tier)}
                textColor={themeColors.textPrimary}
                mutedColor={themeColors.textMuted}
                onPress={handleOpenModelPicker}
              />
            </View>
            <View style={{ height: 1, backgroundColor: dividerColor, marginHorizontal: 20 }} />
          </>
        ) : null}

        {/* Section 2: Create — output kind.
            Image and video are MODES, not flags: picking one switches the
            selected model to the registry's media model for that slot (founder
            2026-08-06), replacing the old boolean toggles that sat on top of a
            text model the send path never actually used. AGI Work moved out of
            this sheet to the drawer in the same pass — it is a session-wide
            stance, not a per-message attachment. */}
        {showImageOption || showVideoOption ? (
          <>
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
              <Text
                style={{
                  fontSize: 11,
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
                  description={
                    imageModelName
                      ? `Switches to ${imageModelName}`
                      : 'Generate images in this chat'
                  }
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
                  description={
                    videoModelName ? `Switches to ${videoModelName}` : 'Generate video in this chat'
                  }
                  active={mediaMode === 'video'}
                  onPress={handleSelectVideoMode}
                  textColor={themeColors.textPrimary}
                  mutedColor={themeColors.textMuted}
                  activeColor={themeColors.teal}
                />
              ) : null}
              {/* Model catalog for the ACTIVE kind. Picking Image or Video is
                  only half the decision — the catalog carries several models
                  per kind at very different prices (Veo 3.1 at $0.40/s vs Veo
                  3.1 Lite at $0.05/s), so the choice belongs to the user. */}
              {mediaMode !== 'text' ? (
                <View style={{ paddingTop: 4, paddingBottom: 2 }}>
                  <Text
                    style={{
                      fontSize: 11,
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
                </View>
              ) : null}

              {mediaMode !== 'text' ? (
                <Pressable
                  onPress={handleBackToText}
                  accessibilityRole="button"
                  accessibilityLabel="Back to text chat"
                  style={{ paddingVertical: 10, paddingHorizontal: 4 }}
                >
                  <Text style={{ fontSize: 13, color: themeColors.teal }}>Back to text chat</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Divider */}
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
            {FEATURES.computerUse ? (
              <CapabilityRow
                icon={<Lock size={18} color={themeColors.textMuted} />}
                label="Computer use"
                description="Use a connected desktop environment"
                enabled={false}
                status="Desktop"
                statusTone="desktop"
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
            onPress={handleOpenProjectPicker}
          />
          <ConfigLink
            icon={<Palette size={18} color={themeColors.textMuted} />}
            label="Choose style"
            value={chatStyle.charAt(0).toUpperCase() + chatStyle.slice(1)}
            textColor={themeColors.textPrimary}
            mutedColor={themeColors.textMuted}
            onPress={handleOpenStyleSelector}
          />
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
    <Pressable
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
      <Text style={{ fontSize: 12, fontWeight: '500', color: textColor }}>{label}</Text>
    </Pressable>
  );
}

/**
 * A selectable output-kind row (Image / Video).
 *
 * Deliberately NOT a Switch: these are mutually exclusive modes that change the
 * selected model, and a switch would imply they stack on top of the current
 * model — which is exactly the misconception the old toggles created.
 */
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
    <Pressable
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
          <Text style={{ fontSize: 15, color: active ? activeColor : textColor }}>{label}</Text>
          <Text style={{ fontSize: 12, color: mutedColor, marginTop: 1 }} numberOfLines={2}>
            {description}
          </Text>
        </View>
      </View>
      {active ? <Check size={18} color={activeColor} /> : null}
    </Pressable>
  );
}

/** One choosable media model. Subtitle carries the price so the cost of the
 *  choice is visible at the point of choosing, not buried in billing. */
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
  const perSecond = meta?.videoPerSecondCost;
  const perImage = meta?.imagePerImageCost;
  const price =
    perSecond !== undefined
      ? `$${perSecond}/sec`
      : perImage !== undefined
        ? `$${perImage}/image`
        : (meta?.provider ?? '');

  return (
    <Pressable
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
        <Text style={{ fontSize: 14, color: selected ? activeColor : textColor }}>
          {meta?.name ?? modelId}
        </Text>
        {price ? (
          <Text style={{ fontSize: 11, color: mutedColor, marginTop: 1 }}>{price}</Text>
        ) : null}
      </View>
      {selected ? <Check size={16} color={activeColor} /> : null}
    </Pressable>
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
          <Text style={{ fontSize: 15, color: textColor }}>{label}</Text>
          {badge && <StatusPill label={badge} tone="danger" />}
        </View>
        <Text style={{ fontSize: 12, color: mutedColor, marginTop: 1 }} numberOfLines={2}>
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
      <Pressable
        onPress={props.onStatusPress}
        disabled={!props.onStatusPress}
        accessible
        style={rowStyle}
        accessibilityLabel={`${label}, ${props.status}`}
        accessibilityRole={props.onStatusPress ? 'button' : 'text'}
        accessibilityHint={props.onStatusPress ? 'Opens availability details' : undefined}
      >
        {rowContent}
      </Pressable>
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
      <Text style={{ fontSize: 10, fontWeight: '600', color: palette.fg }}>{label}</Text>
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
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  statusTone?: 'waitlist' | 'desktop' | 'neutral';
  textColor: string;
  mutedColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
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
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {icon}
        <Text style={{ fontSize: 15, color: textColor }}>{label}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {value &&
          (statusTone === 'neutral' ? (
            <Text style={{ fontSize: 13, color: mutedColor }}>{value}</Text>
          ) : (
            <StatusPill label={value} tone={statusTone} />
          ))}
        <ChevronRight size={16} color={mutedColor} />
      </View>
    </Pressable>
  );
}
