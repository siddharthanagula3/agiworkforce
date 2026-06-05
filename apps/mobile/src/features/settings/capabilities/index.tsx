/**
 * Capabilities Settings Screen
 *
 * Mobile uses Local Mode plus AGI Cloud invite/waitlist. Local execution
 * is locked on and cloud capabilities are waitlisted.
 */
import { useCallback } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Globe,
  Paintbrush,
  Brain,
  Monitor,
  Lock,
  FileCode,
  Layout,
  Mic,
  Camera,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeColors } from '@/src/ui/theme';

type CapabilityState = 'active' | 'toggle' | 'waitlist' | 'locked' | 'nav';
type CapabilityKey = 'memory' | 'artifacts' | 'codeExecution' | 'voice' | 'camera';

interface CapabilityMeta {
  key: string;
  storeKey?: CapabilityKey;
  icon: LucideIcon;
  state: CapabilityState;
  label: string;
  description: string;
  stateLabel: string;
  onPress?: () => void;
}

const BASE_CAPABILITIES: Omit<CapabilityMeta, 'onPress'>[] = [
  {
    key: 'local-mode',
    icon: Brain,
    state: 'active',
    label: 'Local Mode',
    description: 'Private chat on this device is active.',
    stateLabel: 'Active',
  },
  {
    key: 'artifacts',
    storeKey: 'artifacts',
    icon: Layout,
    state: 'toggle',
    label: 'Artifacts',
    description: 'Render rich code, HTML, and React artifacts in-line.',
    stateLabel: 'On',
  },
  {
    key: 'code-execution',
    storeKey: 'codeExecution',
    icon: FileCode,
    state: 'toggle',
    label: 'Code Execution',
    description: 'Run code snippets locally in a sandboxed environment.',
    stateLabel: 'On',
  },
  {
    key: 'memory',
    storeKey: 'memory',
    icon: Brain,
    state: 'toggle',
    label: 'Memory',
    description: 'Use local memory facts stored on this device.',
    stateLabel: 'Local',
  },
  {
    key: 'view-memory',
    icon: Brain,
    state: 'nav',
    label: 'View your memory',
    description: 'Browse and manage what AGI remembers about you.',
    stateLabel: '',
  },
  {
    key: 'voice',
    storeKey: 'voice',
    icon: Mic,
    state: 'toggle',
    label: 'Voice',
    description: 'Enable voice input and text-to-speech output.',
    stateLabel: 'On',
  },
  {
    key: 'camera',
    storeKey: 'camera',
    icon: Camera,
    state: 'toggle',
    label: 'Camera',
    description: 'Allow image capture from your camera.',
    stateLabel: 'On',
  },
  {
    key: 'web-search',
    icon: Globe,
    state: 'waitlist',
    label: 'Web Search',
    description: 'Available with AGI Cloud access.',
    stateLabel: 'Waitlist',
  },
  {
    key: 'image-generation',
    icon: Paintbrush,
    state: 'waitlist',
    label: 'Image Generation',
    description: 'Available with AGI Cloud access.',
    stateLabel: 'Waitlist',
  },
  {
    key: 'desktop-control',
    icon: Monitor,
    state: 'waitlist',
    label: 'Desktop Control',
    description: 'Available from paired Desktop sessions and future AGI Cloud environments.',
    stateLabel: 'Waitlist',
  },
];

function stateColors(state: CapabilityState, c: ReturnType<typeof useThemeColors>) {
  switch (state) {
    case 'active':
    case 'toggle':
      return {
        icon: c.agentSuccess,
        text: c.agentSuccess,
        background: c.successSurface,
        border: c.successBorder,
      };
    case 'waitlist':
      return {
        icon: c.agentWarning,
        text: c.agentWarning,
        background: c.warningSurface,
        border: c.warningBorder,
      };
    case 'locked':
    case 'nav':
      return {
        icon: c.textMuted,
        text: c.textMuted,
        background: c.surfaceBase,
        border: c.border,
      };
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CapabilitiesScreen() {
  const router = useRouter();
  const c = useThemeColors();
  const capabilities = useSettingsStore((s) => s.capabilities);
  const setCapability = useSettingsStore((s) => s.setCapability);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const push = useCallback(
    (path: string) => () => router.push(path as Parameters<typeof router.push>[0]),
    [router],
  );

  const CAPABILITIES: CapabilityMeta[] = BASE_CAPABILITIES.map((cap) => {
    if (cap.key === 'view-memory') return { ...cap, onPress: push('/(app)/settings/memory') };
    return cap;
  });

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }}>
      <View className="flex-row items-center px-3 h-12">
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg"
          style={({ pressed }) => ({ backgroundColor: pressed ? c.surfaceHover : c.transparent })}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={c.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2" style={{ color: c.textPrimary }}>
          Capabilities
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            marginTop: 8,
            marginBottom: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.successBorder,
            backgroundColor: c.successSurface,
            padding: 12,
          }}
          accessible
          accessibilityLabel="Local Mode active. AGI Cloud is waitlist only."
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Lock size={14} color={c.agentSuccess} />
            <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>
              Local Mode active
            </Text>
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 17 }}>
            Chat runs on this device unless you choose to start an AGI Cloud session.
          </Text>
        </View>

        <View
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.surfaceElevated,
            overflow: 'hidden',
          }}
        >
          {CAPABILITIES.map((cap, idx) => (
            <CapabilityRow
              key={cap.key}
              cap={cap}
              isLast={idx === CAPABILITIES.length - 1}
              capabilities={capabilities}
              onToggle={(key, value) => setCapability(key, value)}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type Capabilities = {
  webSearch: boolean;
  imageGen: boolean;
  memory: boolean;
  desktopControl: boolean;
  artifacts: boolean;
  codeExecution: boolean;
  voice: boolean;
  camera: boolean;
};

function CapabilityRow({
  cap,
  isLast,
  capabilities,
  onToggle,
}: {
  cap: CapabilityMeta;
  isLast: boolean;
  capabilities: Capabilities;
  onToggle: (key: CapabilityKey, value: boolean) => void;
}) {
  const c = useThemeColors();
  const Icon = cap.icon;
  const tone = stateColors(cap.state, c);
  const disabled = cap.state === 'waitlist' || cap.state === 'locked';
  const isToggle = cap.state === 'toggle';
  const isNav = cap.state === 'nav';
  const toggleValue = cap.storeKey ? (capabilities[cap.storeKey] ?? false) : false;

  const inner = (
    <View
      style={{
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: c.border,
        paddingHorizontal: 12,
        paddingVertical: 14,
      }}
      accessible
      accessibilityRole={isToggle ? 'switch' : isNav ? 'button' : 'text'}
      accessibilityState={
        isToggle ? { checked: toggleValue } : { disabled, selected: cap.state === 'active' }
      }
      accessibilityLabel={`${cap.label}. ${cap.description}${cap.stateLabel ? `. ${cap.stateLabel}` : ''}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tone.background,
          }}
        >
          <Icon size={17} color={tone.icon} />
        </View>

        <View style={{ flex: 1, marginRight: 10 }}>
          <Text style={{ fontSize: 15, color: c.textPrimary, fontWeight: '600' }}>{cap.label}</Text>
          <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 3, lineHeight: 17 }}>
            {cap.description}
          </Text>
        </View>

        {isToggle && cap.storeKey ? (
          <Switch
            value={toggleValue}
            onValueChange={(value) => onToggle(cap.storeKey as CapabilityKey, value)}
          />
        ) : isNav ? (
          <ChevronRight size={16} color={c.textMuted} />
        ) : (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 6,
              backgroundColor: tone.background,
              borderWidth: 1,
              borderColor: tone.border,
            }}
          >
            <Text style={{ fontSize: 10, color: tone.text, fontWeight: '600' }}>
              {cap.stateLabel}
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  if (isNav && cap.onPress) {
    return (
      <Pressable
        onPress={cap.onPress}
        style={({ pressed }) => ({ backgroundColor: pressed ? c.surfaceHover : c.transparent })}
      >
        {inner}
      </Pressable>
    );
  }
  return inner;
}
