import { useCallback, useRef, forwardRef } from 'react';
import { View, Pressable, Alert } from 'react-native';
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
  Monitor,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { useChatStore, type ChatMode } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useProjectStore } from '@/src/features/projects/store';
import { useTheme, useThemeColors } from '@/src/ui/theme';
import { StyleSelector } from './StyleSelector';
import { useWaitlistStore } from '@/src/features/waitlist';
import { FEATURES } from '@/lib/v1FeatureFlags';

interface AddToChatSheetProps {
  onCamera: () => void;
  onPhotos: () => void;
  onFile: () => void;
  onOpenCloudAccess: () => void;
}

const SNAP_POINTS = ['75%'];

const MODE_OPTIONS: Array<{
  id: ChatMode;
  label: string;
  description: string;
}> = [
  { id: 'chat', label: 'Chat', description: 'Standard conversation' },
  { id: 'research', label: 'Research', description: 'Structure notes and longer answers' },
  { id: 'create', label: 'Create', description: 'Draft and shape local text outputs' },
];

/**
 * "Add to Chat" bottom sheet.
 * Opened by the [+] button in ChatInput.
 *
 * Sections:
 * 1. Attachment row (Camera, Photos, File)
 * 2. Chat mode selector (Chat, Research, Create)
 * 3. Session toggles (Temporary chat)
 * 4. Tool availability (cloud-gated tools + desktop handoff)
 * 5. Config links (Project, Style, Connectors)
 */
export const AddToChatSheet = forwardRef<BottomSheet, AddToChatSheetProps>(function AddToChatSheet(
  { onCamera, onPhotos, onFile, onOpenCloudAccess },
  ref,
) {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const chatMode = useChatStore((s) => s.chatMode);
  const chatStyle = useChatStore((s) => s.chatStyle);
  const features = useChatStore((s) => s.features);
  const setChatMode = useChatStore((s) => s.setChatMode);
  const setFeature = useChatStore((s) => s.setFeature);

  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const projects = useProjectStore((s) => s.projects);
  const activeProject = activeProjectId ? projects.find((p) => p.id === activeProjectId) : null;

  const isTemporaryChat = useSettingsStore((s) => s.isTemporaryChat);
  const setTemporaryChat = useSettingsStore((s) => s.setTemporaryChat);

  const styleSelectorRef = useRef<BottomSheet>(null);
  const waitlistJoined = useWaitlistStore((s) => s.joined);
  const waitlistRank = useWaitlistStore((s) => s.rank);

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

  const openWaitlistAfterSheetClose = useCallback(() => {
    closeSheet();
    onOpenCloudAccess();
  }, [closeSheet, onOpenCloudAccess]);

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

  const handleModeChange = useCallback(
    (mode: ChatMode) => {
      haptic();
      setChatMode(mode);
    },
    [haptic, setChatMode],
  );

  const handleOpenStyleSelector = useCallback(() => {
    haptic();
    styleSelectorRef.current?.snapToIndex(0);
  }, [haptic]);

  const handleWebSearchToggle = useCallback(
    (enabled: boolean) => {
      if (!FEATURES.webSearch) return;
      haptic();
      setFeature('webSearch', enabled);
    },
    [haptic, setFeature],
  );

  const handleImageGenerationToggle = useCallback(
    (enabled: boolean) => {
      if (!FEATURES.imageGen) return;
      haptic();
      setFeature('imageGen', enabled);
    },
    [haptic, setFeature],
  );

  const handleOpenCloudWaitlist = useCallback(() => {
    haptic();
    if (waitlistJoined) {
      const position =
        typeof waitlistRank === 'number' ? ` You're #${(waitlistRank + 1).toLocaleString()}.` : '';
      Alert.alert('Already on the waitlist', `Cloud access is not active yet.${position}`);
      return;
    }
    openWaitlistAfterSheetClose();
  }, [haptic, waitlistJoined, waitlistRank, openWaitlistAfterSheetClose]);

  const handleComputerUseInfo = useCallback(() => {
    haptic();
    Alert.alert('Desktop required', 'Computer use is available from paired AGI Desktop sessions.');
  }, [haptic]);

  const handleConnectors = useCallback(() => {
    haptic();
    if (!FEATURES.connectors) {
      if (waitlistJoined) {
        Alert.alert('Already on the waitlist', 'Cloud connectors are not active yet.');
        return;
      }
      openWaitlistAfterSheetClose();
      return;
    }
    closeSheet();
    router.push('/(app)/connectors' as Parameters<typeof router.push>[0]);
  }, [haptic, waitlistJoined, openWaitlistAfterSheetClose, closeSheet, router]);

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    [],
  );

  const cardBg = themeColors.neutralSurface;
  const dividerColor = themeColors.borderLight;
  const waitlistLabel =
    waitlistJoined && typeof waitlistRank === 'number'
      ? `#${(waitlistRank + 1).toLocaleString()}`
      : waitlistJoined
        ? 'Joined'
        : 'Waitlist';

  return (
    <>
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={SNAP_POINTS}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: themeColors.surfaceElevated }}
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
            <Text
              style={{
                fontSize: 16,
                fontWeight: '600',
                color: themeColors.textPrimary,
              }}
            >
              Add to Chat
            </Text>
            <View style={{ width: 28 }} />
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
            <AttachmentCard
              icon={<FileText size={22} color={themeColors.teal} />}
              label="File"
              onPress={handleFile}
              bg={cardBg}
              textColor={themeColors.textPrimary}
            />
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: dividerColor, marginHorizontal: 20 }} />

          {/* Section 2: Mode Selector */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
            {MODE_OPTIONS.map((mode) => {
              const isSelected = chatMode === mode.id;
              return (
                <Pressable
                  key={mode.id}
                  onPress={() => handleModeChange(mode.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 4,
                  }}
                  accessibilityLabel={`${mode.label} mode${isSelected ? ', selected' : ''}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  {/* Radio circle */}
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      borderWidth: 2,
                      borderColor: isSelected ? themeColors.teal : themeColors.textMuted,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 2,
                    }}
                  >
                    {isSelected && (
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: themeColors.teal,
                        }}
                      />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: '500',
                        color: themeColors.textPrimary,
                      }}
                    >
                      {mode.label}
                      {mode.id === 'chat' ? ' (default)' : ''}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        color: themeColors.textMuted,
                        marginTop: 2,
                      }}
                    >
                      {mode.description}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: dividerColor, marginHorizontal: 20 }} />

          {/* Section 3: Session controls */}
          <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: themeColors.textMuted,
                letterSpacing: 0.6,
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
                  <Text style={{ fontSize: 15, color: themeColors.textPrimary }}>
                    Temporary chat
                  </Text>
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
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: dividerColor, marginHorizontal: 20 }} />

          {/* Section 4: Tool availability */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 4 }}>
            {FEATURES.webSearch ? (
              <CapabilityRow
                icon={<Globe size={18} color={themeColors.teal} />}
                label="Web search"
                description="Search current web results when needed"
                enabled={features.webSearch}
                onToggle={handleWebSearchToggle}
                textColor={themeColors.textPrimary}
                mutedColor={themeColors.textMuted}
              />
            ) : (
              <CapabilityRow
                icon={<Globe size={18} color={themeColors.textMuted} />}
                label="Web search"
                description="Available with Cloud access"
                enabled={false}
                status={waitlistLabel}
                statusTone="waitlist"
                onStatusPress={handleOpenCloudWaitlist}
                textColor={themeColors.textPrimary}
                mutedColor={themeColors.textMuted}
              />
            )}
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
            ) : (
              <CapabilityRow
                icon={<Paintbrush size={18} color={themeColors.textMuted} />}
                label="Image generation"
                description="Available with Cloud access"
                enabled={false}
                status={waitlistLabel}
                statusTone="waitlist"
                onStatusPress={handleOpenCloudWaitlist}
                textColor={themeColors.textPrimary}
                mutedColor={themeColors.textMuted}
              />
            )}
            <CapabilityRow
              icon={<Monitor size={18} color={themeColors.textMuted} />}
              label="Computer use"
              description="Requires paired AGI Workforce Desktop"
              enabled={false}
              status="Desktop required"
              statusTone="desktop"
              onStatusPress={handleComputerUseInfo}
              textColor={themeColors.textPrimary}
              mutedColor={themeColors.textMuted}
            />
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: dividerColor, marginHorizontal: 20 }} />

          {/* Section 5: Config Links */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
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
            <ConfigLink
              icon={<Palette size={18} color={themeColors.textMuted} />}
              label="Choose style"
              value={chatStyle.charAt(0).toUpperCase() + chatStyle.slice(1)}
              textColor={themeColors.textPrimary}
              mutedColor={themeColors.textMuted}
              onPress={handleOpenStyleSelector}
            />
            <ConfigLink
              icon={<Link size={18} color={themeColors.textMuted} />}
              label="Connectors"
              value={FEATURES.connectors ? undefined : waitlistLabel}
              statusTone="waitlist"
              textColor={themeColors.textPrimary}
              mutedColor={themeColors.textMuted}
              onPress={handleConnectors}
            />
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Sub-sheet for style selection */}
      <StyleSelector ref={styleSelectorRef} />
    </>
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
