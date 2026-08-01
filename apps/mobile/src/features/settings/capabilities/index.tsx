import { useCallback } from 'react';
import { View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { useRouter } from 'expo-router';
import {
  Brain,
  Camera,
  ChevronRight,
  Cloud,
  FileCode,
  Globe,
  Layout,
  LockKeyhole,
  Mic,
  RefreshCw,
  ShieldCheck,
  Telescope,
  type LucideIcon,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { useThemeColors } from '@/src/ui/theme';
import { SettingsGroup, SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import {
  useChatAppModeStore,
  type MobileChatAppMode,
} from '@/src/features/chat/store/appModeStore';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { AutoApproveMode } from '@/types/chat';

type CapabilityTone = 'active' | 'local' | 'device' | 'cloud' | 'desktop' | 'review';
type ToggleCapability = 'imageGen' | 'codeExecution' | 'research';

interface CapabilityRowMeta {
  key: string;
  icon: LucideIcon;
  tone: CapabilityTone;
  label: string;
  description: string;
  /**
   * Status pill text. Omitted for rows that only navigate: a pill reads as
   * live state, so a row with no state to report renders a bare chevron
   * rather than a constant that can go stale against the screen it opens.
   */
  value?: string;
  href?: string;
  toggle?: ToggleCapability;
}

interface CapabilitySection {
  title: string;
  rows: CapabilityRowMeta[];
}

/**
 * Pill-sized labels for the stored approval mode. The full sentences belong to
 * the Action approvals screen; the authority for the value itself is
 * `useSettingsStore.autoApproveMode`, which is what the chat approval card
 * actually reads at run time.
 */
const APPROVAL_MODE_LABELS: Record<AutoApproveMode, string> = {
  ask: 'Ask',
  smart: 'Low-risk',
  full: 'All actions',
};

function makeSections(input: {
  cloudUnlocked: boolean;
  appMode: MobileChatAppMode;
  autoApproveMode: AutoApproveMode;
}): CapabilitySection[] {
  const { cloudUnlocked, appMode, autoApproveMode } = input;
  const cloudValue = cloudUnlocked ? 'Cloud' : 'Sign in';
  const localModeActive = appMode === 'local';

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
            : 'Chat is set to AGI Cloud, so new chats run on our servers.',
          value: localModeActive ? 'Active' : 'Off',
        },
        {
          key: 'memory',
          icon: Brain,
          tone: 'local',
          label: 'Memory',
          description: 'View and manage local memory saved on this device.',
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
        {
          key: 'artifacts',
          icon: Layout,
          tone: 'local',
          label: 'Artifacts',
          description: 'Open generated previews and files from chat.',
          href: '/(app)/artifacts',
        },
        {
          key: 'code',
          icon: FileCode,
          tone: 'cloud',
          label: 'AGI Code',
          description: FEATURES.codeExecution
            ? 'Allow supported Cloud models to execute code in a secure sandbox.'
            : 'Code execution is not available in this mobile release.',
          value: FEATURES.codeExecution ? cloudValue : 'Off',
          ...(FEATURES.codeExecution ? { toggle: 'codeExecution' as const } : {}),
        },
        {
          key: 'research',
          icon: Telescope,
          tone: 'cloud',
          label: 'Deep research',
          description: FEATURES.research
            ? 'Allow supported Cloud models to run multi-step research with citations.'
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
          value: APPROVAL_MODE_LABELS[autoApproveMode],
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
            ? 'Uses current web information automatically when the Cloud model supports it.'
            : 'Web search is not available in this mobile release.',
          value: FEATURES.webSearch ? (cloudUnlocked ? 'Automatic' : 'Sign in') : 'Off',
        },
        {
          key: 'continuity',
          icon: RefreshCw,
          tone: 'cloud',
          label: 'Cross-device continuity',
          description: 'See how Managed Cloud tasks continue across mobile, web, and desktop.',
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
        {
          key: 'desktop-control',
          icon: LockKeyhole,
          tone: 'desktop',
          label: 'Desktop control',
          description: 'Run desktop workflows through paired Desktop sessions.',
          href: '/(app)/companion',
        },
      ],
    },
  ];
}

export default function CapabilitiesScreen() {
  const router = useRouter();
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const chatFeatures = useChatStore((s) => s.features);
  const setFeature = useChatStore((s) => s.setFeature);
  // Every badge on this screen has to come from the state it claims to
  // describe: this screen's whole job is telling the user what the assistant
  // may do, so a constant rendered inside a status pill is a false statement.
  const appMode = useChatAppModeStore((s) => s.appMode);
  const autoApproveMode = useSettingsStore((s) => s.autoApproveMode);
  const sections = makeSections({ cloudUnlocked, appMode, autoApproveMode });

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
        body="Local and Cloud stay separate. Cloud preferences still require a supported model, plan, and deployment capability at send time."
        icon={ShieldCheck}
      />

      {sections.map((section) => (
        <View key={section.title}>
          <SectionTitle title={section.title} />
          <SettingsGroup>
            {section.rows.map((row, index) => (
              <CapabilityRow
                key={row.key}
                row={row}
                isLast={index === section.rows.length - 1}
                onPress={row.href ? () => navigate(row.href as string) : undefined}
                toggleValue={row.toggle ? chatFeatures[row.toggle] : undefined}
                onToggle={
                  row.toggle
                    ? (enabled) => setFeature(row.toggle as ToggleCapability, enabled)
                    : undefined
                }
                toggleDisabled={Boolean(row.toggle) && !cloudUnlocked}
              />
            ))}
          </SettingsGroup>
        </View>
      ))}
    </SettingsScreenShell>
  );
}

function SectionTitle({ title }: { title: string }) {
  const colors = useThemeColors();
  return (
    <Text
      style={{
        color: colors.textMuted,
        fontSize: 12,
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
}: {
  row: CapabilityRowMeta;
  isLast: boolean;
  onPress?: () => void;
  toggleValue?: boolean;
  onToggle?: (enabled: boolean) => void;
  toggleDisabled?: boolean;
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
        <Text
          numberOfLines={1}
          style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}
        >
          {row.label}
        </Text>
        <Text
          numberOfLines={2}
          style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 3 }}
        >
          {row.description}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {onToggle && toggleValue !== undefined ? (
          <Switch
            value={toggleValue}
            onValueChange={onToggle}
            disabled={toggleDisabled}
            accessibilityLabel={`${row.label}. ${row.description}`}
            accessibilityHint={
              toggleDisabled ? 'Sign in to change this Managed Cloud preference.' : undefined
            }
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
            <Text numberOfLines={1} style={{ color: tone.text, fontSize: 11, fontWeight: '700' }}>
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
