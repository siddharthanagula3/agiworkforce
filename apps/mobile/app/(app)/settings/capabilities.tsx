/**
 * Capabilities Settings Screen
 *
 * 4 toggleable AI capabilities: web search, image generation,
 * memory, and desktop control. All ON by default.
 */
import { useCallback } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Globe, Paintbrush, Brain, Monitor } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';

// ---------------------------------------------------------------------------
// Capability metadata
// ---------------------------------------------------------------------------

interface CapabilityMeta {
  key: 'webSearch' | 'imageGen' | 'memory' | 'desktopControl';
  icon: LucideIcon;
  iconColor: string;
  label: string;
  description: string;
}

const CAPABILITIES: CapabilityMeta[] = [
  {
    key: 'webSearch',
    icon: Globe,
    iconColor: colors.agentActive,
    label: 'Web Search',
    description: 'AI searches the web when it needs current info',
  },
  {
    key: 'imageGen',
    icon: Paintbrush,
    iconColor: colors.agentWarning,
    label: 'Image Generation',
    description: 'Generate images inline in conversations',
  },
  {
    key: 'memory',
    icon: Brain,
    iconColor: colors.agentThinking,
    label: 'Memory',
    description: 'Remember context from past conversations',
  },
  {
    key: 'desktopControl',
    icon: Monitor,
    iconColor: colors.agentSuccess,
    label: 'Desktop Control',
    description: 'Remote control desktop via Dispatch (requires paired desktop)',
  },
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CapabilitiesScreen() {
  const router = useRouter();
  const capabilities = useSettingsStore((s) => s.capabilities);
  const setCapability = useSettingsStore((s) => s.setCapability);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="flex-row items-center px-3 h-12">
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2">
          Capabilities
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-white/40 text-sm leading-5 mb-4 mt-2">
          Toggle AI capabilities on or off. Changes apply to all new conversations.
        </Text>

        <Card>
          {CAPABILITIES.map((cap, idx) => {
            const Icon = cap.icon;
            return (
              <View key={cap.key}>
                {idx > 0 && <Separator />}
                <View className="flex-row items-start justify-between py-3.5 px-1">
                  <View className="flex-row items-start gap-3 flex-1 mr-3">
                    <View
                      className="w-8 h-8 rounded-lg items-center justify-center mt-0.5"
                      style={{ backgroundColor: `${cap.iconColor}15` }}
                    >
                      <Icon size={16} color={cap.iconColor} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[15px] text-white font-medium">{cap.label}</Text>
                      <Text className="text-[12px] text-white/40 mt-1 leading-4">
                        {cap.description}
                      </Text>
                    </View>
                  </View>
                  <View className="mt-0.5">
                    <Switch
                      value={capabilities[cap.key]}
                      onValueChange={(v) => setCapability(cap.key, v)}
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
