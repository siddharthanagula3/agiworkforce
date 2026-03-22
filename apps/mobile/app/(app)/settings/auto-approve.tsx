/**
 * Auto-Approve Settings Screen
 *
 * 3-option radio selector: Ask Always, Smart Auto, Full Auto.
 * Controls how agent tool calls are approved.
 */
import { useCallback } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Shield, ShieldCheck, ShieldAlert } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors } from '@/lib/theme';
import type { AutoApproveMode } from '@/types/chat';

// ---------------------------------------------------------------------------
// Option metadata
// ---------------------------------------------------------------------------

interface ApproveOption {
  mode: AutoApproveMode;
  icon: LucideIcon;
  label: string;
  description: string;
  tag?: string;
}

const OPTIONS: ApproveOption[] = [
  {
    mode: 'ask',
    icon: Shield,
    label: 'Ask Always',
    description: 'Confirm every action before it runs. This is the safest option.',
    tag: 'Safest',
  },
  {
    mode: 'smart',
    icon: ShieldCheck,
    label: 'Smart Auto',
    description:
      'Auto-approve low-risk actions (web search, reading files). Ask for high-risk actions (system changes, purchases).',
  },
  {
    mode: 'full',
    icon: ShieldAlert,
    label: 'Full Auto',
    description: 'Approve everything automatically. The AI executes all actions without asking.',
  },
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AutoApproveScreen() {
  const router = useRouter();
  const autoApproveMode = useSettingsStore((s) => s.autoApproveMode);
  const setAutoApproveMode = useSettingsStore((s) => s.setAutoApproveMode);

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
          Auto-Approve
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-white/40 text-sm leading-5 mb-4 mt-2">
          Choose how agent actions are approved. This affects all tool calls and system operations.
        </Text>

        <Card className="gap-2">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = autoApproveMode === opt.mode;
            return (
              <Pressable
                key={opt.mode}
                onPress={() => setAutoApproveMode(opt.mode)}
                className="flex-row items-start gap-3 p-3 rounded-xl"
                style={{
                  backgroundColor: selected ? 'rgba(33,128,141,0.12)' : 'transparent',
                  borderWidth: selected ? 1 : 0,
                  borderColor: selected ? 'rgba(33,128,141,0.3)' : 'transparent',
                }}
                accessibilityLabel={opt.label}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                {/* Radio circle */}
                <View
                  className="w-[22px] h-[22px] rounded-full border-2 items-center justify-center mt-0.5"
                  style={{
                    borderColor: selected ? colors.teal : colors.textMuted,
                  }}
                >
                  {selected && <View className="w-3 h-3 rounded-full bg-teal-500" />}
                </View>

                {/* Content */}
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Icon size={16} color={selected ? colors.teal : colors.textSecondary} />
                    <Text
                      className="text-[14px] font-medium"
                      style={{ color: selected ? colors.teal : colors.textPrimary }}
                    >
                      {opt.label}
                    </Text>
                    {opt.tag && (
                      <View
                        className="px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: `${colors.agentSuccess}20` }}
                      >
                        <Text
                          className="text-[10px] font-medium"
                          style={{ color: colors.agentSuccess }}
                        >
                          {opt.tag}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-[12px] text-white/40 mt-1 leading-4">
                    {opt.description}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </Card>

        {/* Warning note for Full Auto */}
        <View
          className="mx-1 mt-4 px-3 py-2.5 rounded-lg"
          style={{ backgroundColor: 'rgba(245,158,11,0.08)' }}
        >
          <Text className="text-[11px] leading-4" style={{ color: colors.agentWarning }}>
            Full Auto mode lets the AI execute actions without your approval. Use with caution --
            some actions may modify files, make purchases, or change system settings.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
