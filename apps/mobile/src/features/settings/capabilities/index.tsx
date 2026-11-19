import { useCallback, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { useRouter } from 'expo-router';
import {
  BarChart3,
  Brain,
  Camera,
  ChevronRight,
  Cloud,
  FileCode,
  FolderOpen,
  Globe,
  Layout,
  LockKeyhole,
  Mic,
  RefreshCw,
  ShieldCheck,
  Telescope,
  type LucideIcon,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Switch } from '@/components/ui/Switch';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { SettingsGroup, SettingsInfo, SettingsScreenShell } from '@/src/features/settings/Common';
import { canUseBillingPlanCapability } from '@agiworkforce/types';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useTierStore } from '@/src/features/billing/store';
import { NATIVE_PURCHASES_AVAILABLE } from '@/src/features/billing/nativePurchaseAvailability';
import {
  useChatAppModeStore,
  type MobileChatAppMode,
} from '@/src/features/chat/store/appModeStore';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useChatStore } from '@/stores/chatStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useToolApprovalPolicySync } from '../tool-approvals/useToolApprovalPolicySync';
import { toolApprovalPolicySummary } from '../tool-approvals/toolApprovalPolicyOwner';
import { useMemoryStore } from '@/src/features/memory/store';
import { useCloudCodeExecutionPreference } from './useCloudCodeExecutionPreference';
import { useArtifactVisualPreferences } from './useArtifactVisualPreferences';
import type { ArtifactVisualSwitch } from './artifactVisualPreferencesService';
import { useToolAccessPreference } from './useToolAccessPreference';
import { TOOL_ACCESS_TITLE, ToolAccessOptions, toolAccessView } from './ToolAccessOptions';
import { describeMemoryFreshness } from '@/src/features/memory/services/consolidation';

type CapabilityTone = 'active' | 'local' | 'device' | 'cloud' | 'desktop' | 'review';
type ToggleCapability = 'webSearch' | 'imageGen' | 'codeExecution' | 'research';

interface CapabilityRowMeta {
  key: string;
  icon: LucideIcon;
  tone: CapabilityTone;
  label: string;
  description: string;
  value?: string;
  href?: string;
  toggle?: ToggleCapability;
  accountSwitch?: ArtifactVisualSwitch;
}

interface CapabilitySection {
  title: string;
  rows: CapabilityRowMeta[];
}

const DESKTOP_CONTROL_NOT_INCLUDED = NATIVE_PURCHASES_AVAILABLE
  ? 'Desktop control comes with paid plans.'
  : "Desktop control isn't included in your plan.";

function makeSections(input: {
  cloudUnlocked: boolean;
  appMode: MobileChatAppMode;
  approvalSummary: string;
  memoryFreshness: string | null;
  desktopControlIncluded: boolean;
  accountSwitches: readonly ArtifactVisualSwitch[];
}): CapabilitySection[] {
  const {
    cloudUnlocked,
    appMode,
    approvalSummary,
    memoryFreshness,
    desktopControlIncluded,
    accountSwitches,
  } = input;
  const cloudValue = cloudUnlocked ? 'Cloud' : 'Sign in';
  const localModeActive = appMode === 'local';
  const memoryDescription = localModeActive
    ? 'Saved on this device.'
    : 'Account memories used in Cloud chats.';

  return [
    {
      title: 'On this device',
      rows: [
        {
          key: 'local-mode',
          icon: Brain,
          tone: localModeActive ? 'active' : 'cloud',
          label: 'Local Mode',
          description: localModeActive
            ? 'Private chat runs on this device.'
            : 'New chats run on AGI Cloud servers.',
          value: localModeActive ? 'Active' : 'Off',
        },
        {
          key: 'memory',
          icon: Brain,
          tone: 'local',
          label: 'Memory',
          description: memoryFreshness
            ? `${memoryDescription} ${memoryFreshness}.`
            : memoryDescription,
          href: '/(app)/settings/memory',
        },
        {
          key: 'voice',
          icon: Mic,
          tone: 'device',
          label: 'Voice',
          description: 'Adjust local voice input and speech output.',
          href: '/(app)/settings/voice',
        },
        {
          key: 'permissions',
          icon: Camera,
          tone: 'device',
          label: 'Camera and files',
          description: 'Review camera, microphone, photo, and file access.',
          href: '/(app)/settings/permissions',
        },
      ],
    },
    {
      title: 'Workflows',
      rows: [
        ...(accountSwitches.includes('artifacts')
          ? [
              {
                key: 'artifacts',
                icon: Layout,
                tone: 'cloud' as const,
                label: 'Artifacts',
                description: 'Create apps, documents and diagrams in a side preview.',
                accountSwitch: 'artifacts' as const,
              },
            ]
          : []),
        ...(accountSwitches.includes('inlineVisualizations')
          ? [
              {
                key: 'inline-visualizations',
                icon: BarChart3,
                tone: 'cloud' as const,
                label: 'Inline visualizations',
                description: 'Show charts and diagrams right in the chat.',
                accountSwitch: 'inlineVisualizations' as const,
              },
            ]
          : []),
        {
          key: 'your-artifacts',
          icon: FolderOpen,
          tone: 'local',
          label: 'Your artifacts',
          description: 'Open generated previews and files from chat.',
          href: '/(app)/artifacts',
        },
        {
          key: 'code',
          icon: FileCode,
          tone: 'cloud',
          label: 'Code execution and file creation',
          description: FEATURES.codeExecution
            ? 'Run code in a sandbox and create documents, sheets, slides and PDFs.'
            : 'Code execution is not available in this mobile release.',
          value: FEATURES.codeExecution ? (localModeActive ? 'Cloud only' : cloudValue) : 'Off',
          ...(FEATURES.codeExecution && !localModeActive
            ? { toggle: 'codeExecution' as const }
            : {}),
        },
        {
          key: 'research',
          icon: Telescope,
          tone: 'cloud',
          label: 'Deep research',
          description: FEATURES.research
            ? 'Multi-step research with citations in Cloud chats.'
            : 'Deep research is not available in this mobile release.',
          value: FEATURES.research ? cloudValue : 'Off',
          ...(FEATURES.research ? { toggle: 'research' as const } : {}),
        },
        {
          key: 'approvals',
          icon: ShieldCheck,
          tone: 'review',
          label: 'Action approvals',
          description: 'Choose how AGI asks before tool actions.',
          value: approvalSummary,
          href: '/(app)/settings/auto-approve',
        },
      ],
    },
    {
      title: 'AGI Cloud',
      rows: [
        {
          key: 'web-search',
          icon: Globe,
          tone: 'cloud',
          label: 'Web search',
          description: FEATURES.webSearch
            ? 'Let Cloud models search the web for current information.'
            : 'Web search is not available in this mobile release.',
          value: FEATURES.webSearch ? cloudValue : 'Off',
          ...(FEATURES.webSearch ? { toggle: 'webSearch' as const } : {}),
        },
        {
          key: 'continuity',
          icon: RefreshCw,
          tone: 'cloud',
          label: 'Cross-device continuity',
          description: 'Managed Cloud tasks across mobile, web and desktop.',
          href: '/(app)/continuity',
        },
        {
          key: 'image-generation',
          icon: Cloud,
          tone: 'cloud',
          label: 'Image generation',
          description: FEATURES.imageGen
            ? 'Allow eligible Cloud chats to create generated images.'
            : 'Image generation is not available in this mobile release.',
          value: FEATURES.imageGen ? cloudValue : 'Off',
          ...(FEATURES.imageGen ? { toggle: 'imageGen' as const } : {}),
        },
        ...(FEATURES.companion
          ? [
              {
                key: 'desktop-control',
                icon: LockKeyhole,
                tone: 'desktop' as const,
                label: 'Desktop control',
                description: desktopControlIncluded
                  ? 'Run workflows on your paired desktop.'
                  : DESKTOP_CONTROL_NOT_INCLUDED,
                ...(desktopControlIncluded ? { href: '/(app)/companion' as const } : {}),
              },
            ]
          : []),
      ],
    },
  ];
}

const CLOUD_TOGGLE_LOCKED_REASON = 'Sign in to change this Managed Cloud preference.';
const ACCOUNT_SETTING_UNAVAILABLE_REASON =
  'Could not load this setting from your account. Check your connection and try again.';
const CLOUD_ONLY_REASON = 'Cloud only';
const REQUIRED_BY_CODE_EXECUTION_REASON = 'Required by code execution';

interface ToggleState {
  disabled: boolean;
  note?: string;
}

export default function CapabilitiesScreen() {
  const router = useRouter();
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const chatFeatures = useChatStore((s) => s.features);
  const setFeature = useChatStore((s) => s.setFeature);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const codeExecution = useCloudCodeExecutionPreference(appMode === 'cloud' && cloudUnlocked);
  const accountSwitches = useArtifactVisualPreferences(appMode === 'cloud' && cloudUnlocked);
  const toolAccess = useToolAccessPreference(appMode === 'cloud' && cloudUnlocked);
  const toolAccessShown =
    appMode === 'cloud' && cloudUnlocked
      ? toolAccessView({
          available: toolAccess.available,
          status: toolAccess.status,
          connectors: toolAccess.connectors,
        })
      : 'hidden';
  const tier = useTierStore((s) => s.tier);
  const tierKnown = useTierStore((s) => s.lastRefreshedAt !== null);
  const paired = useConnectionStore((s) => s.pairingCode !== null);
  const approval = useToolApprovalPolicySync();
  const memoryEntries = useMemoryStore((s) => s.entries);
  const fetchMemories = useMemoryStore((s) => s.fetchMemories);
  useEffect(() => {
    void fetchMemories();
  }, [fetchMemories, appMode]);
  const memoryFreshness = useMemo(() => describeMemoryFreshness(memoryEntries), [memoryEntries]);
  const sections = makeSections({
    cloudUnlocked,
    appMode,
    approvalSummary: toolApprovalPolicySummary(approval),
    memoryFreshness,
    desktopControlIncluded:
      !tierKnown || paired || canUseBillingPlanCapability(tier, 'remote_control'),
    accountSwitches: accountSwitches.available,
  });

  const toggleStateFor = (toggle: ToggleCapability): ToggleState => {
    if (!cloudUnlocked) return { disabled: true, note: CLOUD_TOGGLE_LOCKED_REASON };
    if (toggle !== 'codeExecution') return { disabled: false };
    if (codeExecution.status === 'unavailable') {
      return { disabled: true, note: ACCOUNT_SETTING_UNAVAILABLE_REASON };
    }
    return { disabled: codeExecution.status === 'loading' };
  };

  const artifactsRequired = codeExecution.status === 'ready' && codeExecution.enabled;

  const accountSwitchStateFor = (key: ArtifactVisualSwitch): ToggleState => {
    if (appMode === 'local') return { disabled: true, note: CLOUD_ONLY_REASON };
    if (!cloudUnlocked) return { disabled: true, note: CLOUD_TOGGLE_LOCKED_REASON };
    if (accountSwitches.status === 'unavailable') {
      return { disabled: true, note: ACCOUNT_SETTING_UNAVAILABLE_REASON };
    }
    if (key === 'artifacts' && artifactsRequired) {
      return { disabled: true, note: REQUIRED_BY_CODE_EXECUTION_REASON };
    }
    return { disabled: accountSwitches.status === 'loading' };
  };

  const navigate = useCallback(
    (href: string) => {
      router.push(href as Parameters<typeof router.push>[0]);
    },
    [router],
  );

  return (
    <SettingsScreenShell title="Capabilities">
      <SettingsInfo
        title="What AGI can use"
        body="Cloud options also depend on your model and plan."
        icon={ShieldCheck}
      />

      {sections.map((section) => (
        <View key={section.title}>
          <SectionTitle title={section.title} />
          <SettingsGroup>
            {section.rows.map((row, index) => {
              const toggle = row.toggle;
              const accountSwitch = row.accountSwitch;
              if (accountSwitch) {
                const switchState = accountSwitchStateFor(accountSwitch);
                return (
                  <CapabilityRow
                    key={row.key}
                    row={row}
                    isLast={index === section.rows.length - 1}
                    toggleValue={
                      (accountSwitch === 'artifacts' && artifactsRequired) ||
                      accountSwitches.values[accountSwitch]
                    }
                    onToggle={(enabled) => accountSwitches.setValue(accountSwitch, enabled)}
                    toggleDisabled={switchState.disabled}
                    toggleNote={switchState.note}
                  />
                );
              }
              const toggleState = toggle ? toggleStateFor(toggle) : undefined;
              return (
                <CapabilityRow
                  key={row.key}
                  row={row}
                  isLast={index === section.rows.length - 1}
                  onPress={row.href ? () => navigate(row.href as string) : undefined}
                  toggleValue={toggle ? chatFeatures[toggle] : undefined}
                  onToggle={
                    toggle
                      ? (enabled) =>
                          toggle === 'codeExecution'
                            ? codeExecution.setEnabled(enabled)
                            : setFeature(toggle, enabled)
                      : undefined
                  }
                  toggleDisabled={toggleState?.disabled}
                  toggleNote={toggleState?.note}
                />
              );
            })}
          </SettingsGroup>
        </View>
      ))}

      {toolAccessShown !== 'hidden' ? (
        <View>
          <SectionTitle title={TOOL_ACCESS_TITLE} />
          <ToolAccessOptions
            view={toolAccessShown}
            mode={toolAccess.mode}
            lockedNote={
              toolAccess.status === 'unavailable' ? ACCOUNT_SETTING_UNAVAILABLE_REASON : undefined
            }
            onSelect={toolAccess.setMode}
          />
        </View>
      ) : null}
    </SettingsScreenShell>
  );
}

function SectionTitle({ title }: { title: string }) {
  const colors = useThemeColors();
  return (
    <Text
      accessibilityRole="header"
      style={{
        color: colors.textMuted,
        fontSize: typeScale.caption,
        fontWeight: '700',
        letterSpacing: 0,
        marginBottom: 8,
        paddingHorizontal: 2,
        textTransform: 'uppercase',
      }}
    >
      {title}
    </Text>
  );
}

function toneColors(tone: CapabilityTone, colors: ReturnType<typeof useThemeColors>) {
  switch (tone) {
    case 'active':
      return {
        icon: colors.agentSuccess,
        background: colors.successSurface,
        border: colors.successBorder,
        text: colors.agentSuccess,
      };
    case 'cloud':
      return {
        icon: colors.textSecondary,
        background: colors.neutralSurface,
        border: colors.neutralBorder,
        text: colors.textSecondary,
      };
    case 'desktop':
      return {
        icon: colors.textSecondary,
        background: colors.neutralSurface,
        border: colors.neutralBorder,
        text: colors.textSecondary,
      };
    case 'review':
      return {
        icon: colors.agentWarning,
        background: colors.warningSurface,
        border: colors.warningBorder,
        text: colors.agentWarning,
      };
    case 'device':
    case 'local':
      return {
        icon: colors.textSecondary,
        background: colors.neutralSurface,
        border: colors.neutralBorder,
        text: colors.textSecondary,
      };
  }
}

function accessibilityLabelFor(row: CapabilityRowMeta): string {
  const description = row.description.replace(/[.。]+$/, '');
  return row.value ? `${row.label}. ${description}. ${row.value}` : `${row.label}. ${description}`;
}

function CapabilityRow({
  row,
  isLast,
  onPress,
  toggleValue,
  onToggle,
  toggleDisabled,
  toggleNote,
}: {
  row: CapabilityRowMeta;
  isLast: boolean;
  onPress?: () => void;
  toggleValue?: boolean;
  onToggle?: (enabled: boolean) => void;
  toggleDisabled?: boolean;
  toggleNote?: string;
}) {
  const colors = useThemeColors();
  const Icon = row.icon;
  const tone = toneColors(row.tone, colors);

  const content = (
    <View
      style={{
        minHeight: 76,
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tone.background,
          borderWidth: 1,
          borderColor: tone.border,
        }}
      >
        <Icon size={17} color={tone.icon} />
      </View>

      <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
          {row.label}
        </Text>
        <Text
          numberOfLines={2}
          style={{
            color: colors.textMuted,
            fontSize: typeScale.footnote,
            lineHeight: 18,
            marginTop: 3,
          }}
        >
          {row.description}
        </Text>
        {toggleNote ? (
          <Text
            testID={`capability-locked-${row.label}`}
            style={{
              color: colors.textSecondary,
              fontSize: typeScale.footnote,
              lineHeight: 18,
              marginTop: 3,
            }}
          >
            {toggleNote}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {onToggle && toggleValue !== undefined ? (
          <Switch
            value={toggleValue}
            onValueChange={onToggle}
            disabled={toggleDisabled}
            accessibilityLabel={`${row.label}. ${row.description}`}
            accessibilityHint={toggleNote}
          />
        ) : row.value ? (
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: tone.border,
              backgroundColor: tone.background,
              paddingHorizontal: 9,
              paddingVertical: 4,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ color: tone.text, fontSize: typeScale.caption, fontWeight: '700' }}
            >
              {row.value}
            </Text>
          </View>
        ) : null}
        {onPress ? <ChevronRight size={17} color={colors.textMuted} /> : null}
      </View>
    </View>
  );

  if (!onPress) {
    if (onToggle && toggleValue !== undefined) return content;
    return (
      <View accessible accessibilityRole="text" accessibilityLabel={accessibilityLabelFor(row)}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabelFor(row)}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
      })}
    >
      {content}
    </Pressable>
  );
}
