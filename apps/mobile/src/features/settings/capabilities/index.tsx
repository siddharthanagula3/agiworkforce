import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
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
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { SettingsGroup, SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { FEATURES } from '@/lib/v1FeatureFlags';

type CapabilityTone = 'active' | 'local' | 'device' | 'cloud' | 'desktop' | 'review';

interface CapabilityRowMeta {
  key: string;
  icon: LucideIcon;
  tone: CapabilityTone;
  label: string;
  description: string;
  value: string;
  href?: string;
}

interface CapabilitySection {
  title: string;
  rows: CapabilityRowMeta[];
}

function makeSections(cloudUnlocked: boolean): CapabilitySection[] {
  const cloudValue = cloudUnlocked ? 'Cloud' : 'Sign in';
  const codeSessionsEnabled = FEATURES.companion || FEATURES.cloudChat;

  return [
    {
      title: 'On this device',
      rows: [
        {
          key: 'local-mode',
          icon: Brain,
          tone: 'active',
          label: 'Local Mode',
          description: 'Private chat runs on this device.',
          value: 'Active',
        },
        {
          key: 'memory',
          icon: Brain,
          tone: 'local',
          label: 'Memory',
          description: 'View and manage local memory saved on this device.',
          value: 'Local',
          href: '/(app)/settings/memory',
        },
        {
          key: 'voice',
          icon: Mic,
          tone: 'device',
          label: 'Voice',
          description: 'Adjust local voice input and speech output.',
          value: 'Device',
          href: '/(app)/settings/voice',
        },
        {
          key: 'permissions',
          icon: Camera,
          tone: 'device',
          label: 'Camera and files',
          description: 'Review camera, microphone, photo, and file access.',
          value: 'Device',
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
          value: 'Available',
          href: '/(app)/artifacts',
        },
        {
          key: 'code',
          icon: FileCode,
          tone: 'desktop',
          label: 'AGI Code',
          description: codeSessionsEnabled
            ? 'Review mobile code sessions and Desktop handoff.'
            : 'AGI Code runs from Desktop or Cloud access.',
          value: codeSessionsEnabled ? 'Desktop' : 'Off',
          href: codeSessionsEnabled ? '/(app)/code' : undefined,
        },
        {
          key: 'approvals',
          icon: ShieldCheck,
          tone: 'review',
          label: 'Action approvals',
          description: 'Choose how AGI asks before tool actions.',
          value: 'Ask',
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
          description: 'Search current web information in Cloud sessions.',
          value: cloudValue,
        },
        {
          key: 'image-generation',
          icon: Cloud,
          tone: 'cloud',
          label: 'Image generation',
          description: 'Create images in AGI Cloud when enabled.',
          value: cloudValue,
        },
        {
          key: 'desktop-control',
          icon: LockKeyhole,
          tone: 'desktop',
          label: 'Desktop control',
          description: 'Run desktop workflows through paired Desktop sessions.',
          value: 'Desktop',
        },
      ],
    },
  ];
}

export default function CapabilitiesScreen() {
  const router = useRouter();
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const sections = makeSections(cloudUnlocked);

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
        body="Local and Cloud stay separate. This page shows what is active on this device and where each control lives."
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
  return `${row.label}. ${description}. ${row.value}`;
}

function CapabilityRow({
  row,
  isLast,
  onPress,
}: {
  row: CapabilityRowMeta;
  isLast: boolean;
  onPress?: () => void;
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
        {onPress ? <ChevronRight size={17} color={colors.textMuted} /> : null}
      </View>
    </View>
  );

  if (!onPress) {
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
