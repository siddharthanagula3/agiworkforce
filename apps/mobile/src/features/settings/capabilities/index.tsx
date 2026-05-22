/**
 * Capabilities Settings Screen
 *
 * Mobile v1 is local-only. Local LLM execution is locked on; Cloud Managed
 * capabilities are waitlisted, and Mobile BYOK remains locked until secure
 * device key storage ships.
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
  Key,
  Lock,
  type LucideIcon,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeColors } from '@/src/ui/theme';

type CapabilityState = 'active' | 'toggle' | 'waitlist' | 'locked';

interface CapabilityMeta {
  key: string;
  storeKey?: 'memory';
  icon: LucideIcon;
  state: CapabilityState;
  label: string;
  description: string;
  stateLabel: string;
}

const CAPABILITIES: CapabilityMeta[] = [
  {
    key: 'local-llms',
    icon: Brain,
    state: 'active',
    label: 'Local LLMs',
    description: 'On-device model execution is active for every Mobile v1 chat.',
    stateLabel: 'Active',
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
    key: 'web-search',
    icon: Globe,
    state: 'waitlist',
    label: 'Web Search',
    description: 'Requires Cloud Managed infrastructure and is waitlisted for Mobile v1.',
    stateLabel: 'Waitlist',
  },
  {
    key: 'image-generation',
    icon: Paintbrush,
    state: 'waitlist',
    label: 'Image Generation',
    description: 'Cloud image generation opens after managed quotas and cost controls ship.',
    stateLabel: 'Waitlist',
  },
  {
    key: 'desktop-control',
    icon: Monitor,
    state: 'waitlist',
    label: 'Desktop Control',
    description: 'Computer-use and browser environments are Cloud Managed waitlist features.',
    stateLabel: 'Waitlist',
  },
  {
    key: 'byok-providers',
    icon: Key,
    state: 'locked',
    label: 'BYOK Providers',
    description: 'Provider keys are disabled until secure device key storage ships.',
    stateLabel: 'Locked',
  },
];

function stateColors(state: CapabilityState, c: ReturnType<typeof useThemeColors>) {
  switch (state) {
    case 'active':
    case 'toggle':
      return {
        icon: c.teal,
        text: c.teal,
        background: `${c.teal}18`,
        border: `${c.teal}33`,
      };
    case 'waitlist':
      return {
        icon: c.agentWarning,
        text: c.agentWarning,
        background: `${c.agentWarning}14`,
        border: `${c.agentWarning}2E`,
      };
    case 'locked':
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
  const memoryEnabled = useSettingsStore((s) => s.capabilities.memory);
  const setCapability = useSettingsStore((s) => s.setCapability);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }}>
      <View className="flex-row items-center px-3 h-12">
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
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
            borderColor: `${c.teal}2E`,
            backgroundColor: `${c.teal}12`,
            padding: 12,
          }}
          accessible
          accessibilityLabel="Local Mode active. Local LLMs are active. Cloud Managed is waitlist only."
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Lock size={14} color={c.teal} />
            <Text style={{ color: c.teal, fontSize: 13, fontWeight: '600' }}>
              Local Mode active
            </Text>
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 17 }}>
            Local LLMs stay on for Mobile v1. Cloud Managed and Mobile BYOK are disabled until their
            security and launch gates are ready.
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
              memoryEnabled={memoryEnabled}
              onToggleMemory={(value) => setCapability('memory', value)}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CapabilityRow({
  cap,
  isLast,
  memoryEnabled,
  onToggleMemory,
}: {
  cap: CapabilityMeta;
  isLast: boolean;
  memoryEnabled: boolean;
  onToggleMemory: (value: boolean) => void;
}) {
  const c = useThemeColors();
  const Icon = cap.icon;
  const tone = stateColors(cap.state, c);
  const disabled = cap.state === 'waitlist' || cap.state === 'locked';

  return (
    <View
      style={{
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: c.border,
        paddingHorizontal: 12,
        paddingVertical: 14,
      }}
      accessible
      accessibilityRole={cap.state === 'toggle' ? 'switch' : 'text'}
      accessibilityState={
        cap.state === 'toggle'
          ? { checked: memoryEnabled }
          : { disabled, selected: cap.state === 'active' }
      }
      accessibilityLabel={`${cap.label}. ${cap.description}. ${cap.stateLabel}`}
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

        {cap.state === 'toggle' ? (
          <Switch value={memoryEnabled} onValueChange={onToggleMemory} />
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
}
