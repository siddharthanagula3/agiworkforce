import { useCallback } from 'react';
import { View, ScrollView, Platform } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Smartphone,
  Mic,
  Camera,
  MessageSquare,
  Zap,
  Share2,
  Link2,
  HelpCircle,
  FileText,
  Languages,
  ScanLine,
  Bell,
  TextCursorInput,
  LayoutGrid,
} from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Separator } from '@/components/ui/Separator';
import { useThemeColors } from '@/src/ui/theme';

const SIRI_ACTIONS: Array<{ icon: typeof MessageSquare; label: string; description: string }> = [
  {
    icon: MessageSquare,
    label: 'Start Chat',
    description: 'Open AGI Mobile and start a new conversation',
  },
  {
    icon: HelpCircle,
    label: 'Ask AGI',
    description: 'Dictate a question, review it in chat before sending',
  },
  {
    icon: FileText,
    label: 'Summarize',
    description: 'Summarize text, review it in chat before sending',
  },
  {
    icon: Camera,
    label: 'Analyze Image',
    description: 'Open the camera flow for image analysis',
  },
  {
    icon: Mic,
    label: 'Transcribe',
    description: 'Open the voice flow to transcribe speech',
  },
  {
    icon: Languages,
    label: 'Translate',
    description: 'Open the translator, optionally pre-filled with text',
  },
  {
    icon: ScanLine,
    label: 'Scan',
    description: 'Open the document scanner',
  },
  {
    icon: Bell,
    label: 'Set Reminder',
    description: 'Review and create a real Apple Reminder',
  },
];

const SIRI_EXAMPLES: string[] = [
  '"Hey Siri, start chat with AGI Mobile"',
  '"Hey Siri, summarize this with AGI Mobile"',
  '"Hey Siri, translate with AGI Mobile"',
  '"Hey Siri, set reminder via AGI Mobile"',
];

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
        <Text className="text-sm font-bold" style={{ color: colors.teal }}>
          {step}
        </Text>
      </View>
      <Icon size={18} color={colors.teal} />
      <Text className="text-sm font-semibold text-white">{title}</Text>
    </View>
  );
}

function ActionRow({
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
        <Text className="text-sm text-fg-muted mt-0.5">{description}</Text>
      </View>
    </View>
  );
}

export default function WidgetSetupScreen() {
  const colors = useThemeColors();
  const router = useRouter();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/settings' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const isIOS = Platform.OS === 'ios';

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      <View
        className="flex-row items-center px-3 h-12"
        style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
      >
        <PressableBox
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </PressableBox>
        <Text variant="subheading" className="ml-2">
          Quick Access
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerClassName="pb-10 gap-5"
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center pt-5 pb-2 gap-3">
          <View
            className="w-16 h-16 rounded-2xl items-center justify-center"
            style={{ backgroundColor: `${colors.teal}22` }}
          >
            <Zap size={32} color={colors.teal} />
          </View>
          <Text className="text-base font-semibold text-white text-center">
            Reach AGI Mobile from anywhere
          </Text>
          <Text className="text-sm text-fg-muted text-center px-4">
            {isIOS
              ? 'Use AGI Mobile from Siri, widgets and other apps.'
              : 'Use AGI Mobile from widgets, shortcuts and other apps.'}
          </Text>
        </View>

        {isIOS ? (
          <>
            <Card>
              <SectionHeader icon={Mic} title="Siri & Shortcuts" step={1} />
              <Text className="text-sm text-fg-muted mb-3">
                These actions register automatically in the{' '}
                <Text className="text-sm text-fg-secondary font-medium">Shortcuts</Text> app under
                AGI Mobile, no setup needed.
              </Text>
              <View
                className="rounded-xl p-3 gap-2 mb-3"
                style={{ backgroundColor: colors.surfaceElevated }}
              >
                <Text className="text-sm text-fg-muted uppercase tracking-wider mb-1">
                  Example phrases
                </Text>
                {SIRI_EXAMPLES.map((example) => (
                  <View key={example} className="flex-row items-start gap-2">
                    <Text className="text-fg-muted text-sm mt-0.5">•</Text>
                    <Text className="text-sm text-fg-secondary flex-1 italic">{example}</Text>
                  </View>
                ))}
              </View>
              {SIRI_ACTIONS.map((action, index) => (
                <View key={action.label}>
                  {index > 0 && <Separator />}
                  <ActionRow
                    icon={action.icon}
                    label={action.label}
                    description={action.description}
                  />
                </View>
              ))}
            </Card>

            <Card>
              <SectionHeader icon={Share2} title="Share Sheet" step={2} />
              <Text className="text-sm text-fg-muted mb-3">
                Share text or a web link from another app, choose{' '}
                <Text className="text-sm text-fg-secondary font-medium">Share to AGI</Text>, and
                review the content twice: once while saving and once after you open AGI Mobile.
              </Text>
              <View
                className="rounded-xl p-3 gap-2"
                style={{ backgroundColor: colors.surfaceElevated }}
              >
                <Text className="text-sm text-fg-muted uppercase tracking-wider mb-1">
                  How to share
                </Text>
                <Text className="text-sm text-fg-muted">
                  1. In Safari, Notes, or another app, tap{' '}
                  <Text className="text-sm text-fg-secondary font-medium">Share</Text>
                </Text>
                <Text className="text-sm text-fg-muted">
                  2. Choose{' '}
                  <Text className="text-sm text-fg-secondary font-medium">Share to AGI</Text>
                </Text>
                <Text className="text-sm text-fg-muted">
                  3. Preview it, tap{' '}
                  <Text className="text-sm text-fg-secondary font-medium">Save for AGI Review</Text>
                  , then open AGI Mobile and decide whether to send it
                </Text>
              </View>
            </Card>

            <Card>
              <SectionHeader icon={LayoutGrid} title="Home Screen Widget" step={3} />
              <Text className="text-sm text-fg-muted">
                Touch and hold the Home Screen, tap{' '}
                <Text className="text-sm text-fg-secondary font-medium">Edit</Text>, then{' '}
                <Text className="text-sm text-fg-secondary font-medium">Add Widget</Text> and choose
                AGI Mobile, or add Open AGI Mobile to Control Center or the Lock Screen.
              </Text>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <SectionHeader icon={Share2} title="Share From Any App" step={1} />
              <Text className="text-sm text-fg-muted mb-3">
                Share text or links to AGI Mobile, and review them before sending.
              </Text>
              <View
                className="rounded-xl p-3 gap-2"
                style={{ backgroundColor: colors.surfaceElevated }}
              >
                <Text className="text-sm text-fg-muted uppercase tracking-wider mb-1">
                  How to share
                </Text>
                <Text className="text-sm text-fg-muted">
                  1. In any app, tap{' '}
                  <Text className="text-sm text-fg-secondary font-medium">Share</Text> on text or a
                  link
                </Text>
                <Text className="text-sm text-fg-muted">
                  2. Choose{' '}
                  <Text className="text-sm text-fg-secondary font-medium">AGI Mobile</Text> from the
                  share sheet
                </Text>
                <Text className="text-sm text-fg-muted">
                  3. Review the preview, then tap{' '}
                  <Text className="text-sm text-fg-secondary font-medium">Send to Chat</Text>
                </Text>
              </View>
            </Card>

            <Card>
              <SectionHeader icon={TextCursorInput} title="Act On Selected Text" step={2} />
              <Text className="text-sm text-fg-muted mb-3">
                Select text anywhere, then pick{' '}
                <Text className="text-sm text-fg-secondary font-medium">AGI Mobile</Text> from the
                text-selection menu (it may be under the{' '}
                <Text className="text-sm text-fg-secondary font-medium">⋮ More</Text> overflow). The
                selection opens in the same review screen as a share.
              </Text>
            </Card>

            <Card>
              <SectionHeader icon={LayoutGrid} title="Home Screen Widget" step={3} />
              <Text className="text-sm text-fg-muted">
                Touch and hold your home screen, tap{' '}
                <Text className="text-sm text-fg-secondary font-medium">Widgets</Text> and drag AGI
                Workforce onto it.
              </Text>
            </Card>

            <Card>
              <SectionHeader icon={Zap} title="App Shortcuts" step={4} />
              <Text className="text-sm text-fg-muted">
                Touch and hold the AGI Mobile icon for{' '}
                <Text className="text-sm text-fg-secondary font-medium">New chat</Text>,{' '}
                <Text className="text-sm text-fg-secondary font-medium">Voice</Text> and{' '}
                <Text className="text-sm text-fg-secondary font-medium">Camera</Text>. Drag one to
                your home screen to keep it there.
              </Text>
            </Card>
          </>
        )}

        <Card>
          <SectionHeader icon={Link2} title="Links Open In The App" step={isIOS ? 4 : 5} />
          <Text className="text-sm text-fg-muted">
            Links to <Text className="text-sm text-fg-secondary font-medium">agiworkforce.com</Text>{' '}
            open directly in the app when it is installed
            {isIOS ? ' (universal links)' : ' (verified app links)'}, and{' '}
            <Text className="text-sm text-fg-secondary font-medium">agiworkforce://</Text> deep
            links work from any app that can open URLs.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
