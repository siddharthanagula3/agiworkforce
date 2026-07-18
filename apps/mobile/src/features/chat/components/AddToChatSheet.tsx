import { useCallback, forwardRef } from 'react';
import { View, Pressable } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import {
  X,
  Camera,
  Image as ImageIcon,
  FileText,
  Globe,
  Paintbrush,
  FolderPlus,
  Palette,
  Link,
  ChevronRight,
  EyeOff,
  Lock,
  Terminal,
  Bot,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { getModelMetadataById } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useProjectStore } from '@/src/features/projects/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useModelStore } from '@/src/features/model-picker/store';
import { useTierStore } from '@/src/features/billing/store';
import { useTheme, useThemeColors, sheetRadius } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';

interface AddToChatSheetProps {
  onCamera: () => void;
  onPhotos: () => void;
  onFile: () => void;
  onOpenCloudAccess: () => void;
  onOpenStyleSelector: () => void;
}

const SNAP_POINTS = ['75%'];

/**
 * "Add to Chat" bottom sheet.
 * Opened by the [+] button in ChatInput.
 *
 * Sections:
 * 1. Attachment row (Camera, Photos, File)
 * 2. Session toggles (Temporary chat)
 * 3. Tool availability (cloud-gated tools + desktop handoff)
 * 4. Config links (Project, Style, Connectors)
 */
export const AddToChatSheet = forwardRef<BottomSheet, AddToChatSheetProps>(function AddToChatSheet(
  { onCamera, onPhotos, onFile, onOpenCloudAccess, onOpenStyleSelector },
  ref,
) {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const chatStyle = useChatStore((s) => s.chatStyle);
  const features = useChatStore((s) => s.features);
  const setFeature = useChatStore((s) => s.setFeature);
  const workMode = useChatStore((s) => s.workMode);
  const setWorkMode = useChatStore((s) => s.setWorkMode);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const tier = useTierStore((s) => s.tier);
  const selectedModel = useModelStore((s) => s.selectedModel);
  // The server silently strips the web_search tool for models whose provider
  // adapter can't wire it up yet (e.g. OpenAI models via the chat-completions
  // endpoint, which rejects the Responses-API-only web_search_preview tool
  // type) — showing the toggle there promises a working search that quietly
  // no-ops. Gate on the catalog's own capability flag so the toggle only
  // appears for a model that can actually honor it.
  const selectedModelSupportsSearch =
    getModelMetadataById(selectedModel)?.capabilities?.search ?? false;
  // Code execution: same "don't promise a no-op" reasoning as web search,
  // plus two extra checks since running code is higher-risk than searching —
  // the toggle only appears in Cloud mode, for a model whose catalog entry
  // actually supports server-side code execution, AND when this deployment's
  // E2B execution loop is reachable (`/api/me` feature_flags.code_execution,
  // cached in useTierStore — defaults false until the first refresh, so a
  // fresh install never shows the toggle before the real capability is known).
  const selectedModelSupportsCodeExecution =
    getModelMetadataById(selectedModel)?.capabilities?.codeExecution ?? false;
  const codeExecutionDeploymentAvailable = useTierStore((s) => s.codeExecutionAvailable);
  const showCodeExecutionToggle =
    FEATURES.codeExecution &&
    appMode === 'cloud' &&
    selectedModelSupportsCodeExecution &&
    codeExecutionDeploymentAvailable;
  // UI hint only; the API remains authoritative. Basic and every higher paid
  // Cloud plan may request AGI Work, while Free/Local/BYOK cannot.
  const canUseAgiWork = !['free', 'local-only', 'byok'].includes(tier);

  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const projects = useProjectStore((s) => s.projects);
  const activeProject = activeProjectId ? projects.find((p) => p.id === activeProjectId) : null;

  const isTemporaryChat = useSettingsStore((s) => s.isTemporaryChat);
  const setTemporaryChat = useSettingsStore((s) => s.setTemporaryChat);

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

  const handleOpenStyleSelector = useCallback(() => {
    haptic();
    onOpenStyleSelector();
  }, [haptic, onOpenStyleSelector]);

  const handleWebSearchToggle = useCallback(
    (enabled: boolean) => {
      if (!FEATURES.webSearch) return;
      haptic();
      setFeature('webSearch', enabled);
    },
    [haptic, setFeature],
  );

  const handleCodeExecutionToggle = useCallback(
    (enabled: boolean) => {
      if (!FEATURES.codeExecution) return;
      haptic();
      setFeature('codeExecution', enabled);
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

          {/* Temporary chat row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 10,
              paddingHorizontal: 4,
              minHeight: 44,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <EyeOff
                size={18}
                color={isTemporaryChat ? themeColors.purple : themeColors.textMuted}
              />
              <View>
                <Text style={{ fontSize: 15, color: themeColors.textPrimary }}>Temporary chat</Text>
                <Text style={{ fontSize: 12, color: themeColors.textMuted, marginTop: 1 }}>
                  Memory will not be saved from this chat
                </Text>
              </View>
            </View>
            <Switch
              value={isTemporaryChat}
              onValueChange={(v) => {
                haptic();
                setTemporaryChat(v);
              }}
              accessibilityLabel={`Temporary chat ${isTemporaryChat ? 'on' : 'off'}`}
            />
          </View>

          {appMode === 'cloud' ? (
            canUseAgiWork ? (
              <CapabilityRow
                icon={<Bot size={18} color={themeColors.teal} />}
                label="AGI Work"
                description="Search, run code, and use tools for longer tasks"
                enabled={workMode === 'agiwork'}
                onToggle={handleWorkModeToggle}
                textColor={themeColors.textPrimary}
                mutedColor={themeColors.textMuted}
              />
            ) : (
              <CapabilityRow
                icon={<Bot size={18} color={themeColors.textMuted} />}
                label="AGI Work"
                description="Search, run code, and use tools for longer tasks"
                enabled={false}
                status="Paid"
                onStatusPress={onOpenCloudAccess}
                textColor={themeColors.textPrimary}
                mutedColor={themeColors.textMuted}
              />
            )
          ) : null}
        </View>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: dividerColor, marginHorizontal: 20 }} />

        {/* Section 3: Tool availability */}
        {(FEATURES.webSearch && selectedModelSupportsSearch) ||
        showCodeExecutionToggle ||
        FEATURES.imageGen ||
        FEATURES.computerUse ? (
          <View style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 4 }}>
            {FEATURES.webSearch && selectedModelSupportsSearch ? (
              <CapabilityRow
                icon={<Globe size={18} color={themeColors.teal} />}
                label="Web search"
                description="Search current web results when needed"
                enabled={features.webSearch}
                onToggle={handleWebSearchToggle}
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
            {FEATURES.imageGen ? (
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
        {(FEATURES.webSearch && selectedModelSupportsSearch) ||
        showCodeExecutionToggle ||
        FEATURES.imageGen ||
        FEATURES.computerUse ? (
          <View style={{ height: 1, backgroundColor: dividerColor, marginHorizontal: 20 }} />
        ) : null}

        {/* Section 4: Config Links */}
        <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
          {appMode === 'local' ? (
            <ConfigLink
              icon={<FolderPlus size={18} color={themeColors.textMuted} />}
              label="Project"
              value={activeProject?.name ?? 'Choose'}
              textColor={themeColors.textPrimary}
              mutedColor={themeColors.textMuted}
              onPress={() => {
                haptic();
                closeSheet();
                router.push('/(app)/(tabs)/projects' as Parameters<typeof router.push>[0]);
              }}
            />
          ) : null}
          <ConfigLink
            icon={<Palette size={18} color={themeColors.textMuted} />}
            label="Choose style"
            value={chatStyle.charAt(0).toUpperCase() + chatStyle.slice(1)}
            textColor={themeColors.textPrimary}
            mutedColor={themeColors.textMuted}
            onPress={handleOpenStyleSelector}
          />
          {appMode === 'cloud' && FEATURES.connectors ? (
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
