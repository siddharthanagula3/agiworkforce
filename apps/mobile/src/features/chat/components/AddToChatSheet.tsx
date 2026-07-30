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
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { canUseBillingPlanCapability, getModelMetadataById } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { useChatStore } from '@/stores/chatStore';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
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
  const workMode = useChatStore((s) => s.workMode);
  const setWorkMode = useChatStore((s) => s.setWorkMode);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const tier = useTierStore((s) => s.tier);
  const grantedCapabilities = useTierStore((s) => s.grantedCapabilities);
  const selectedModel = useModelStore((s) => s.selectedModel);
  const selectedModelMetadata = getModelMetadataById(selectedModel);
  // Code execution: same "don't promise a no-op" reasoning as web search,
  // plus two extra checks since running code is higher-risk than searching —
  // the toggle only appears in Cloud mode, for a model whose catalog entry
  // actually supports server-side code execution, AND when this deployment's
  // E2B execution loop is reachable (`/api/me` feature_flags.code_execution,
  // cached in useTierStore — defaults false until the first refresh, so a
  // fresh install never shows the toggle before the real capability is known).
  const selectedModelSupportsCodeExecution =
    selectedModelMetadata?.capabilities?.codeExecution ?? false;
  const codeExecutionDeploymentAvailable = useTierStore((s) => s.codeExecutionAvailable);
  const showCodeExecutionToggle =
    FEATURES.codeExecution &&
    appMode === 'cloud' &&
    selectedModelSupportsCodeExecution &&
    codeExecutionDeploymentAvailable;
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
  // Image generation runs only through the Managed Cloud media route, so the
  // toggle is Cloud-only (previously it also rendered in Local mode, where it
  // could do nothing).
  const showImageGenToggle =
    FEATURES.imageGen &&
    appMode === 'cloud' &&
    grantedCapabilities.includes('canUseImages') &&
    canUseBillingPlanCapability(tier, 'image_generation');
  const canUseAgiWork = canUseBillingPlanCapability(tier, 'agi_work');
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

  const handleCodeExecutionToggle = useCallback(
    (enabled: boolean) => {
      if (!FEATURES.codeExecution) return;
      haptic();
      setFeature('codeExecution', enabled);
    },
    [haptic, setFeature],
  );

  const handleResearchToggle = useCallback(
    (enabled: boolean) => {
      if (!FEATURES.research) return;
      haptic();
      setFeature('research', enabled);
    },
    [haptic, setFeature],
  );

  const handleWorkModeToggle = useCallback(
    (enabled: boolean) => {
      haptic();
      setWorkMode(enabled ? 'agiwork' : 'chat');
    },
    [haptic, setWorkMode],
  );

  const handleImageGenerationToggle = useCallback(
    (enabled: boolean) => {
      if (!FEATURES.imageGen) return;
      haptic();
      setFeature('imageGen', enabled);
    },
    [haptic, setFeature],
  );

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

        {/* Section 2: Session controls */}
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
            Session
          </Text>

          {/* Temporary chat lives on the chat header (TemporaryChatToggle) -- it is
              a pre-conversation decision, and a second copy here was a duplicate
              control (founder 2026-07-29). */}
          {appMode === 'cloud' && canUseAgiWork ? (
            <CapabilityRow
              icon={<Bot size={18} color={themeColors.teal} />}
              label="AGI Work"
              description="Search, run code, and use tools for longer tasks"
              enabled={workMode === 'agiwork'}
              onToggle={handleWorkModeToggle}
              textColor={themeColors.textPrimary}
              mutedColor={themeColors.textMuted}
            />
          ) : null}
        </View>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: dividerColor, marginHorizontal: 20 }} />

        {/* Section 3: Tool availability */}
        {showResearchToggle ||
        showCodeExecutionToggle ||
        showImageGenToggle ||
        FEATURES.computerUse ? (
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
            {showCodeExecutionToggle ? (
              <CapabilityRow
                icon={<Terminal size={18} color={themeColors.teal} />}
                label="Run code"
                description="Let the model execute code in a secure sandbox"
                enabled={features.codeExecution}
                onToggle={handleCodeExecutionToggle}
                textColor={themeColors.textPrimary}
                mutedColor={themeColors.textMuted}
              />
            ) : null}
            {showImageGenToggle ? (
              <CapabilityRow
                icon={<Paintbrush size={18} color={themeColors.teal} />}
                label="Image generation"
                description="Create generated images in chat"
                enabled={features.imageGen}
                onToggle={handleImageGenerationToggle}
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
        {showResearchToggle ||
        showCodeExecutionToggle ||
        showImageGenToggle ||
        FEATURES.computerUse ? (
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
            icon={<Bot size={18} color={themeColors.textMuted} />}
            label="Model"
            value={getShortDisplayName(selectedModel, tier)}
            textColor={themeColors.textPrimary}
            mutedColor={themeColors.textMuted}
            onPress={handleOpenModelPicker}
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
