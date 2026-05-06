import { useCallback, useRef, forwardRef } from 'react';
import { View, Pressable, Switch, Alert, Platform } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import {
  X,
  Camera,
  Image as ImageIcon,
  FileText,
  Zap,
  Globe,
  Paintbrush,
  Heart,
  FolderPlus,
  Palette,
  Wrench,
  Link,
  ChevronRight,
  Check,
  EyeOff,
  Shield,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { useChatStore, type ChatMode } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useProjectStore } from '@/stores/projectStore';
import { useAgentControlStore } from '@/stores/agentControlStore';
import { useModelStore } from '@/stores/modelStore';
import { useTheme } from '@/hooks/useTheme';
import { colors } from '@/lib/theme';
import { StyleSelector } from './StyleSelector';
import { ToolAccessSelector } from './ToolAccessSelector';
import { isHealthAvailable, requestHealthPermission } from '@/services/healthData';
import { getModelById } from '@/lib/models';
import {
  AGENT_MODE_LABEL,
  AGENT_MODE_DESCRIPTION,
  EFFORT_LABEL,
  PROVIDER_DISPLAY,
  type AgentMode,
  type Effort,
} from '@agiworkforce/types';

interface AddToChatSheetProps {
  onCamera: () => void;
  onPhotos: () => void;
  onFile: () => void;
  /** Current conversation ID — used to resolve per-conversation agent control state. */
  conversationId?: string | null;
}

const SNAP_POINTS = ['75%'];

const TOOL_ACCESS_LABELS: Record<string, string> = {
  auto: 'Auto',
  'on-demand': 'On demand',
  always: 'Always available',
};

const MODE_OPTIONS: Array<{
  id: ChatMode;
  label: string;
  description: string;
}> = [
  { id: 'chat', label: 'Chat', description: 'Standard conversation' },
  { id: 'research', label: 'Research', description: 'In-depth reports & analysis' },
  { id: 'create', label: 'Create', description: 'Generate docs, slides & apps' },
];

const AGENT_MODES: AgentMode[] = ['ask', 'auto', 'plan', 'bypass'];
const EFFORT_LEVELS: Effort[] = ['low', 'medium', 'high', 'max'];

/** Auto-approve icon + color config keyed by mode from settingsStore. */
const AUTO_APPROVE_CONFIG: Record<
  string,
  { icon: typeof Shield; color: string; label: string; sub: string }
> = {
  ask: {
    icon: ShieldCheck,
    color: '#10b981',
    label: 'Ask always',
    sub: 'Confirm every tool action',
  },
  smart: { icon: Shield, color: '#f59e0b', label: 'Smart auto', sub: 'Auto-approve safe actions' },
  full: { icon: ShieldAlert, color: '#ef4444', label: 'Full auto', sub: 'Skip all approvals' },
};

/**
 * "Add to Chat" bottom sheet.
 * Opened by the [+] button in ChatInput.
 *
 * Sections:
 * 1. Attachment row (Camera, Photos, File, Skills)
 * 2. Chat mode selector (Chat, Research, Create)
 * 3. Agent mode (Ask / Auto / Plan / Bypass)
 * 4. Effort (Low / Medium / High / Max — shown only when provider supports it)
 * 5. Session toggles (Auto-approve, Temporary chat)
 * 6. Feature toggles (Web search, Image generation, Health)
 * 7. Config links (Project, Style, Tool access, Connectors)
 */
export const AddToChatSheet = forwardRef<BottomSheet, AddToChatSheetProps>(function AddToChatSheet(
  { onCamera, onPhotos, onFile, conversationId },
  ref,
) {
  const router = useRouter();
  const { colors: themeColors, isDark } = useTheme();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const chatMode = useChatStore((s) => s.chatMode);
  const chatStyle = useChatStore((s) => s.chatStyle);
  const toolAccess = useChatStore((s) => s.toolAccess);
  const features = useChatStore((s) => s.features);
  const setChatMode = useChatStore((s) => s.setChatMode);
  const setFeature = useChatStore((s) => s.setFeature);

  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const projects = useProjectStore((s) => s.projects);
  const activeProject = activeProjectId ? projects.find((p) => p.id === activeProjectId) : null;

  const resolveAgentControl = useAgentControlStore((s) => s.resolve);
  const storeSetMode = useAgentControlStore((s) => s.setMode);
  const storeSetEffort = useAgentControlStore((s) => s.setEffort);

  // Resolve effective state for this conversation (falls back to project/global default)
  const effectiveConversationId = conversationId ?? '__new__';
  const resolved = resolveAgentControl(effectiveConversationId, activeProjectId);
  const agentMode = resolved.mode;
  const effort = resolved.effort;
  const isOverridingProjectDefault = resolved.source === 'conversation-override';

  const autoApproveMode = useSettingsStore((s) => s.autoApproveMode);
  const setAutoApproveMode = useSettingsStore((s) => s.setAutoApproveMode);
  const isTemporaryChat = useSettingsStore((s) => s.isTemporaryChat);
  const setTemporaryChat = useSettingsStore((s) => s.setTemporaryChat);

  const selectedModel = useModelStore((s) => s.selectedModel);

  // Determine if current model's provider supports effort axis.
  const modelDef = getModelById(selectedModel);
  const providerDisplay = modelDef?.provider
    ? PROVIDER_DISPLAY[modelDef.provider as keyof typeof PROVIDER_DISPLAY]
    : undefined;
  const supportsEffort = providerDisplay?.supportsEffort ?? false;

  const styleSelectorRef = useRef<BottomSheet>(null);
  const toolAccessSelectorRef = useRef<BottomSheet>(null);

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

  const handleSkills = useCallback(() => {
    haptic();
    closeSheet();
    router.push('/(app)/skills' as Parameters<typeof router.push>[0]);
  }, [haptic, closeSheet, router]);

  const handleModeChange = useCallback(
    (mode: ChatMode) => {
      haptic();
      setChatMode(mode);
    },
    [haptic, setChatMode],
  );

  const handleAgentModeChange = useCallback(
    (mode: AgentMode) => {
      haptic();
      storeSetMode(effectiveConversationId, mode);
    },
    [haptic, storeSetMode, effectiveConversationId],
  );

  const handleEffortChange = useCallback(
    (level: Effort) => {
      haptic();
      storeSetEffort(effectiveConversationId, level);
    },
    [haptic, storeSetEffort, effectiveConversationId],
  );

  const autoApproveModes = ['ask', 'smart', 'full'] as const;
  const cycleAutoApprove = useCallback(() => {
    haptic();
    const idx = autoApproveModes.indexOf(autoApproveMode);
    const next = autoApproveModes[(idx + 1) % autoApproveModes.length];
    setAutoApproveMode(next);
  }, [haptic, autoApproveMode, setAutoApproveMode]);

  const handleOpenStyleSelector = useCallback(() => {
    haptic();
    styleSelectorRef.current?.snapToIndex(0);
  }, [haptic]);

  const handleOpenToolAccessSelector = useCallback(() => {
    haptic();
    toolAccessSelectorRef.current?.snapToIndex(0);
  }, [haptic]);

  const handleHealthToggle = useCallback(
    async (enabled: boolean) => {
      haptic();
      if (enabled) {
        if (Platform.OS !== 'ios' || !isHealthAvailable()) {
          Alert.alert(
            'Health Not Available',
            'Health data integration is currently available on iOS only, via the HxF companion app.',
            [{ text: 'OK' }],
          );
          return;
        }
        const hasAccess = await requestHealthPermission();
        if (!hasAccess) {
          Alert.alert(
            'Health Data Unavailable',
            'No health data found. Make sure the HxF app is installed and has synced your HealthKit data.',
            [{ text: 'OK' }],
          );
          return;
        }
      }
      setFeature('health', enabled);
    },
    [setFeature, haptic],
  );

  const handleConnectors = useCallback(() => {
    haptic();
    closeSheet();
    router.push('/(app)/connectors' as Parameters<typeof router.push>[0]);
  }, [haptic, closeSheet, router]);

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    [],
  );

  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
  const dividerColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

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
              style={{ padding: 4 }}
              accessibilityLabel="Close"
              accessibilityRole="button"
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
              icon={<Camera size={22} color={colors.teal} />}
              label="Camera"
              onPress={handleCamera}
              bg={cardBg}
              textColor={themeColors.textPrimary}
            />
            <AttachmentCard
              icon={<ImageIcon size={22} color={colors.teal} />}
              label="Photos"
              onPress={handlePhotos}
              bg={cardBg}
              textColor={themeColors.textPrimary}
            />
            <AttachmentCard
              icon={<FileText size={22} color={colors.teal} />}
              label="File"
              onPress={handleFile}
              bg={cardBg}
              textColor={themeColors.textPrimary}
            />
            <AttachmentCard
              icon={<Zap size={22} color={colors.teal} />}
              label="Skills"
              onPress={handleSkills}
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
                      borderColor: isSelected ? colors.teal : themeColors.textMuted,
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
                          backgroundColor: colors.teal,
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

          {/* Section 3: Agent mode */}
          <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 4,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: themeColors.textMuted,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                }}
              >
                Agent mode
              </Text>
              {isOverridingProjectDefault && (
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '500',
                    color: colors.teal,
                    letterSpacing: 0.2,
                  }}
                  accessibilityLabel="Overriding project default"
                >
                  Overriding project default
                </Text>
              )}
            </View>
            {AGENT_MODES.map((mode) => {
              const isSelected = agentMode === mode;
              return (
                <Pressable
                  key={mode}
                  onPress={() => handleAgentModeChange(mode)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                    paddingHorizontal: 4,
                    minHeight: 44,
                  }}
                  accessibilityLabel={`${AGENT_MODE_LABEL[mode]}${isSelected ? ', selected' : ''}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: '500',
                        color: isSelected ? colors.teal : themeColors.textPrimary,
                      }}
                    >
                      {AGENT_MODE_LABEL[mode]}
                    </Text>
                    <Text style={{ fontSize: 12, color: themeColors.textMuted, marginTop: 2 }}>
                      {AGENT_MODE_DESCRIPTION[mode]}
                    </Text>
                  </View>
                  {isSelected && <Check size={18} color={colors.teal} style={{ marginTop: 2 }} />}
                </Pressable>
              );
            })}
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: dividerColor, marginHorizontal: 20 }} />

          {/* Section 4: Effort (gated by supportsEffort) */}
          {supportsEffort && (
            <>
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
                  Effort
                </Text>
                {EFFORT_LEVELS.map((level) => {
                  const isSelected = effort === level;
                  return (
                    <Pressable
                      key={level}
                      onPress={() => handleEffortChange(level)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 12,
                        paddingHorizontal: 4,
                        minHeight: 44,
                      }}
                      accessibilityLabel={`${EFFORT_LABEL[level]} effort${isSelected ? ', selected' : ''}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: '500',
                          color: isSelected ? colors.teal : themeColors.textPrimary,
                        }}
                      >
                        {EFFORT_LABEL[level]}
                      </Text>
                      {isSelected && <Check size={18} color={colors.teal} />}
                    </Pressable>
                  );
                })}
              </View>

              {/* Divider */}
              <View style={{ height: 1, backgroundColor: dividerColor, marginHorizontal: 20 }} />
            </>
          )}

          {/* Section 5: AutoApprove + TempChat toggles */}
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

            {/* Auto-approve row — cycles through ask / smart / full */}
            {(() => {
              const cfg = AUTO_APPROVE_CONFIG[autoApproveMode] ?? AUTO_APPROVE_CONFIG['ask'];
              const Icon = cfg.icon;
              return (
                <Pressable
                  onPress={cycleAutoApprove}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                    paddingHorizontal: 4,
                    minHeight: 44,
                  }}
                  accessibilityLabel={`Auto-approve: ${cfg.label}. Tap to cycle.`}
                  accessibilityRole="button"
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Icon size={18} color={cfg.color} />
                    <View>
                      <Text style={{ fontSize: 15, color: themeColors.textPrimary }}>
                        Auto-approve
                      </Text>
                      <Text style={{ fontSize: 12, color: themeColors.textMuted, marginTop: 1 }}>
                        {cfg.label} — {cfg.sub}
                      </Text>
                    </View>
                  </View>
                  <ChevronRight size={16} color={themeColors.textMuted} />
                </Pressable>
              );
            })()}

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
                <EyeOff size={18} color={isTemporaryChat ? '#a855f7' : themeColors.textMuted} />
                <View>
                  <Text style={{ fontSize: 15, color: themeColors.textPrimary }}>
                    Temporary chat
                  </Text>
                  <Text style={{ fontSize: 12, color: themeColors.textMuted, marginTop: 1 }}>
                    This conversation won't be saved
                  </Text>
                </View>
              </View>
              <Switch
                value={isTemporaryChat}
                onValueChange={(v) => {
                  haptic();
                  setTemporaryChat(v);
                }}
                trackColor={{ false: 'rgba(255,255,255,0.1)', true: '#a855f7' }}
                thumbColor="#ffffff"
                ios_backgroundColor="rgba(255,255,255,0.1)"
                accessibilityLabel={`Temporary chat ${isTemporaryChat ? 'on' : 'off'}`}
              />
            </View>
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: dividerColor, marginHorizontal: 20 }} />

          {/* Section 7: Feature Toggles */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 16, gap: 4 }}>
            <FeatureToggle
              icon={<Globe size={18} color={colors.teal} />}
              label="Web search"
              enabled={features.webSearch}
              onToggle={(v) => setFeature('webSearch', v)}
              textColor={themeColors.textPrimary}
            />
            <FeatureToggle
              icon={<Paintbrush size={18} color={colors.teal} />}
              label="Image generation"
              enabled={features.imageGen}
              onToggle={(v) => setFeature('imageGen', v)}
              textColor={themeColors.textPrimary}
            />
            <FeatureToggle
              icon={<Heart size={18} color="#ef4444" />}
              label="Health"
              badge="Beta"
              enabled={features.health}
              onToggle={handleHealthToggle}
              textColor={themeColors.textPrimary}
            />
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: dividerColor, marginHorizontal: 20 }} />

          {/* Section 8: Config Links */}
          <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
            <ConfigLink
              icon={<FolderPlus size={18} color={themeColors.textMuted} />}
              label="Add to project"
              value={activeProject?.name ?? 'None'}
              textColor={themeColors.textPrimary}
              mutedColor={themeColors.textMuted}
              onPress={() => {
                haptic();
                // Placeholder — Phase G will add project picker
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
              icon={<Wrench size={18} color={themeColors.textMuted} />}
              label="Tool access"
              value={TOOL_ACCESS_LABELS[toolAccess]}
              textColor={themeColors.textPrimary}
              mutedColor={themeColors.textMuted}
              onPress={handleOpenToolAccessSelector}
            />
            <ConfigLink
              icon={<Link size={18} color={themeColors.textMuted} />}
              label="Manage Connectors"
              textColor={themeColors.textPrimary}
              mutedColor={themeColors.textMuted}
              onPress={handleConnectors}
            />
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Sub-sheets for style and tool access selection */}
      <StyleSelector ref={styleSelectorRef} />
      <ToolAccessSelector ref={toolAccessSelectorRef} />
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

function FeatureToggle({
  icon,
  label,
  badge,
  enabled,
  onToggle,
  textColor,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  enabled: boolean;
  onToggle: (value: boolean) => void | Promise<void>;
  textColor: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 4,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {icon}
        <Text style={{ fontSize: 15, color: textColor }}>{label}</Text>
        {badge && (
          <View
            style={{
              backgroundColor: 'rgba(239,68,68,0.15)',
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: '600', color: '#ef4444' }}>{badge}</Text>
          </View>
        )}
      </View>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        trackColor={{ false: 'rgba(255,255,255,0.1)', true: colors.teal }}
        thumbColor="#ffffff"
        ios_backgroundColor="rgba(255,255,255,0.1)"
        accessibilityLabel={`${label} ${enabled ? 'on' : 'off'}`}
      />
    </View>
  );
}

function ConfigLink({
  icon,
  label,
  value,
  textColor,
  mutedColor,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  textColor: string;
  mutedColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
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
        {value && <Text style={{ fontSize: 13, color: mutedColor }}>{value}</Text>}
        <ChevronRight size={16} color={mutedColor} />
      </View>
    </Pressable>
  );
}
