import { useCallback } from 'react';
import { View, ScrollView, Pressable, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Smartphone,
  Mic,
  QrCode,
  Camera,
  MessageSquare,
  Zap,
  Settings2,
  LayoutGrid,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useThemeColors } from '@/hooks/useTheme';

// ---------------------------------------------------------------------------
// Quick action list
// ---------------------------------------------------------------------------

const QUICK_ACTIONS: Array<{ icon: typeof MessageSquare; label: string; description: string }> = [
  {
    icon: MessageSquare,
    label: 'New Chat',
    description: 'Start a fresh conversation with any AI model',
  },
  {
    icon: Mic,
    label: 'Voice Mode',
    description: 'Jump straight into a real-time voice session',
  },
  {
    icon: QrCode,
    label: 'Scan QR Code',
    description: 'Pair with your AGI Workforce desktop app',
  },
  {
    icon: Camera,
    label: 'Camera',
    description: 'Capture and analyse an image with AI',
  },
];

// ---------------------------------------------------------------------------
// Siri shortcut examples
// ---------------------------------------------------------------------------

const SIRI_EXAMPLES: string[] = [
  '"Hey Siri, open AGI Workforce and start a chat"',
  '"Hey Siri, open AGI Workforce voice mode"',
  '"Hey Siri, pair my desktop with AGI Workforce"',
];

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({
  icon: Icon,
  title,
  step,
}: {
  icon: typeof Smartphone;
  title: string;
  step: number;
}) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center gap-3 mb-3">
      <View
        className="w-8 h-8 rounded-full items-center justify-center"
        style={{ backgroundColor: `${colors.teal}22` }}
      >
        <Text className="text-xs font-bold" style={{ color: colors.teal }}>
          {step}
        </Text>
      </View>
      <Icon size={18} color={colors.teal} />
      <Text className="text-sm font-semibold text-white">{title}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Quick action row
// ---------------------------------------------------------------------------

function QuickActionRow({
  icon: Icon,
  label,
  description,
}: {
  icon: typeof MessageSquare;
  label: string;
  description: string;
}) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-start gap-3 py-2.5 px-1">
      <View
        className="w-8 h-8 rounded-lg items-center justify-center mt-0.5"
        style={{ backgroundColor: colors.surfaceElevated }}
      >
        <Icon size={16} color={colors.textSecondary} />
      </View>
      <View className="flex-1">
        <Text className="text-sm text-white font-medium">{label}</Text>
        <Text className="text-xs text-white/50 mt-0.5">{description}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Widget Setup Screen
// ---------------------------------------------------------------------------

export default function WidgetSetupScreen() {
  const colors = useThemeColors();
  const router = useRouter();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/settings' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const isIOS = Platform.OS === 'ios';

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {/* Header */}
      <View
        className="flex-row items-center px-3 h-12"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
      >
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2">
          Home Screen Access
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerClassName="pb-10 gap-5"
        showsVerticalScrollIndicator={false}
      >
        {/* Intro */}
        <View className="items-center pt-5 pb-2 gap-3">
          <View
            className="w-16 h-16 rounded-2xl items-center justify-center"
            style={{ backgroundColor: `${colors.teal}22` }}
          >
            <LayoutGrid size={32} color={colors.teal} />
          </View>
          <Text className="text-base font-semibold text-white text-center">
            Quick access to AGI Workforce
          </Text>
          <Text className="text-sm text-white/50 text-center px-4">
            Launch key features without opening the app. Use the options below to bring AGI
            Workforce to your fingertips.
          </Text>
        </View>

        {/* Section 1: Quick Actions */}
        <Card>
          <SectionHeader icon={Zap} title="Quick Actions" step={1} />
          <Text className="text-xs text-white/50 mb-3">
            Long-press the <Text className="text-xs text-white/70 font-medium">AGI Workforce</Text>{' '}
            icon on your home screen to jump directly to:
          </Text>
          {QUICK_ACTIONS.map((action, index) => (
            <View key={action.label}>
              {index > 0 && <Separator />}
              <QuickActionRow
                icon={action.icon}
                label={action.label}
                description={action.description}
              />
            </View>
          ))}
        </Card>

        {/* Section 2: Siri Shortcuts */}
        <Card>
          <SectionHeader icon={Mic} title="Siri Shortcuts" step={2} />
          <Text className="text-xs text-white/50 mb-3">
            {isIOS
              ? 'Create Siri shortcuts in the iOS Shortcuts app to trigger AGI Workforce features by voice.'
              : 'Create voice shortcuts via Google Assistant or the Shortcuts app to open AGI Workforce features.'}
          </Text>
          <View
            className="rounded-xl p-3 gap-2"
            style={{ backgroundColor: colors.surfaceElevated }}
          >
            <Text className="text-[11px] text-white/40 uppercase tracking-wider mb-1">
              Example commands
            </Text>
            {SIRI_EXAMPLES.map((example) => (
              <View key={example} className="flex-row items-start gap-2">
                <Text className="text-white/30 text-xs mt-0.5">•</Text>
                <Text className="text-xs text-white/70 flex-1 italic">{example}</Text>
              </View>
            ))}
          </View>
          <View className="mt-3 gap-1">
            <Text className="text-xs text-white/50 font-medium">How to set up:</Text>
            {isIOS ? (
              <>
                <Text className="text-xs text-white/40">
                  1. Open the <Text className="text-xs text-white/60 font-medium">Shortcuts</Text>{' '}
                  app
                </Text>
                <Text className="text-xs text-white/40">
                  2. Tap <Text className="text-xs text-white/60 font-medium">+ New Shortcut</Text>
                </Text>
                <Text className="text-xs text-white/40">
                  3. Search for{' '}
                  <Text className="text-xs text-white/60 font-medium">AGI Workforce</Text> and
                  choose an action
                </Text>
                <Text className="text-xs text-white/40">
                  4. Add a <Text className="text-xs text-white/60 font-medium">Siri phrase</Text> to
                  trigger it
                </Text>
              </>
            ) : (
              <>
                <Text className="text-xs text-white/40">
                  1. Open{' '}
                  <Text className="text-xs text-white/60 font-medium">
                    Google Assistant settings
                  </Text>
                </Text>
                <Text className="text-xs text-white/40">
                  2. Select <Text className="text-xs text-white/60 font-medium">Shortcuts</Text> and
                  add a custom phrase
                </Text>
                <Text className="text-xs text-white/40">
                  3. Link it to{' '}
                  <Text className="text-xs text-white/60 font-medium">AGI Workforce</Text>
                </Text>
              </>
            )}
          </View>
        </Card>

        {/* Section 3: Control Center (iOS only) */}
        {isIOS && (
          <Card>
            <SectionHeader icon={Settings2} title="iOS Control Center" step={3} />
            <Text className="text-xs text-white/50 mb-3">
              Add AGI Workforce to Control Center for one-swipe access on iOS 18 and later.
            </Text>
            <View
              className="rounded-xl p-3 gap-2"
              style={{ backgroundColor: colors.surfaceElevated }}
            >
              <Text className="text-[11px] text-white/40 uppercase tracking-wider mb-1">
                How to add
              </Text>
              <Text className="text-xs text-white/40">
                1. Open <Text className="text-xs text-white/60 font-medium">Settings</Text> on your
                iPhone
              </Text>
              <Text className="text-xs text-white/40">
                2. Tap <Text className="text-xs text-white/60 font-medium">Control Center</Text>
              </Text>
              <Text className="text-xs text-white/40">
                3. Scroll to{' '}
                <Text className="text-xs text-white/60 font-medium">More Controls</Text> and tap{' '}
                <Text className="text-xs text-white/60 font-medium">+</Text> next to AGI Workforce
              </Text>
              <Text className="text-xs text-white/40">
                4. Swipe down from the top-right corner to open Control Center and tap the AGI
                Workforce tile
              </Text>
            </View>
            <View
              className="mt-3 rounded-xl p-3 flex-row items-center gap-2"
              style={{
                backgroundColor: `${colors.teal}11`,
                borderWidth: 1,
                borderColor: `${colors.teal}22`,
              }}
            >
              <Smartphone size={14} color={colors.teal} />
              <Text className="text-[11px] text-white/50 flex-1">
                Control Center support requires iOS 18 or later. On older iOS versions, use Quick
                Actions instead.
              </Text>
            </View>
          </Card>
        )}

        {/* Section 3 Android: App Shortcuts widget */}
        {!isIOS && (
          <Card>
            <SectionHeader icon={Settings2} title="Home Screen Widget" step={3} />
            <Text className="text-xs text-white/50 mb-3">
              Android supports home screen widgets. Long-press your home screen, select{' '}
              <Text className="text-xs text-white/70 font-medium">Widgets</Text>, search for AGI
              Workforce, and place the widget.
            </Text>
            <View
              className="rounded-xl p-3 gap-2"
              style={{ backgroundColor: colors.surfaceElevated }}
            >
              <Text className="text-[11px] text-white/40 uppercase tracking-wider mb-1">
                How to add
              </Text>
              <Text className="text-xs text-white/40">
                1. Long-press an empty area of your home screen
              </Text>
              <Text className="text-xs text-white/40">
                2. Tap <Text className="text-xs text-white/60 font-medium">Widgets</Text>
              </Text>
              <Text className="text-xs text-white/40">
                3. Search for{' '}
                <Text className="text-xs text-white/60 font-medium">AGI Workforce</Text>
              </Text>
              <Text className="text-xs text-white/40">4. Drag the widget to your home screen</Text>
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
