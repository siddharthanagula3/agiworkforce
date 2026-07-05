import { useCallback } from 'react';
import { View, ScrollView, Pressable, Platform } from 'react-native';
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
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useThemeColors } from '@/src/ui/theme';

// ---------------------------------------------------------------------------
// Siri App Shortcuts (iOS) — must stay in sync with the intents that actually
// ship in native/ios/AGIAppIntents/. Do not list an action here unless its
// AppIntent exists there; this screen previously advertised Quick Actions,
// Control Center tiles, and home-screen widgets that had no native target.
// ---------------------------------------------------------------------------

const SIRI_ACTIONS: Array<{ icon: typeof MessageSquare; label: string; description: string }> = [
  {
    icon: MessageSquare,
    label: 'Start Chat',
    description: 'Open AGI Workforce and start a new conversation',
  },
  {
    icon: HelpCircle,
    label: 'Ask AGI',
    description: 'Dictate a question — review it in chat before sending',
  },
  {
    icon: FileText,
    label: 'Summarize',
    description: 'Summarize text — review it in chat before sending',
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
    description: 'Draft a reminder request in chat for you to review',
  },
];

// Phrases mirror native/ios/AGIAppIntents/AppShortcuts.swift.
const SIRI_EXAMPLES: string[] = [
  '"Hey Siri, start chat with AGI Workforce"',
  '"Hey Siri, summarize this with AGI Workforce"',
  '"Hey Siri, translate with AGI Workforce"',
  '"Hey Siri, set reminder via AGI Workforce"',
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
// Action row
// ---------------------------------------------------------------------------

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
        <Text className="text-xs text-white/50 mt-0.5">{description}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Quick Access Screen
//
// Describes ONLY integrations that actually ship:
//   iOS      — Siri App Shortcuts (native/ios/AGIAppIntents/), universal links.
//              There is NO iOS share extension yet — say so, don't imply one.
//   Android  — share-sheet target (ACTION_SEND) and text-selection action
//              (ACTION_PROCESS_TEXT), both rewritten by MainActivity.kt onto
//              the agiworkforce://intent/share deep link; verified App Links.
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
          Quick Access
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
            <Zap size={32} color={colors.teal} />
          </View>
          <Text className="text-base font-semibold text-white text-center">
            Reach AGI Workforce from anywhere
          </Text>
          <Text className="text-sm text-white/50 text-center px-4">
            {isIOS
              ? 'Trigger AGI Workforce with Siri and open agiworkforce.com links directly in the app.'
              : 'Share text from any app, act on selected text, and open agiworkforce.com links directly in the app.'}
          </Text>
        </View>

        {isIOS ? (
          <>
            {/* iOS Section 1: Siri & Shortcuts */}
            <Card>
              <SectionHeader icon={Mic} title="Siri & Shortcuts" step={1} />
              <Text className="text-xs text-white/50 mb-3">
                These actions register automatically in the{' '}
                <Text className="text-xs text-white/70 font-medium">Shortcuts</Text> app under AGI
                Workforce — no setup needed. Trigger them by voice or combine them into your own
                shortcuts.
              </Text>
              <View
                className="rounded-xl p-3 gap-2 mb-3"
                style={{ backgroundColor: colors.surfaceElevated }}
              >
                <Text className="text-[11px] text-white/40 uppercase tracking-wider mb-1">
                  Example phrases
                </Text>
                {SIRI_EXAMPLES.map((example) => (
                  <View key={example} className="flex-row items-start gap-2">
                    <Text className="text-white/30 text-xs mt-0.5">•</Text>
                    <Text className="text-xs text-white/70 flex-1 italic">{example}</Text>
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

            {/* iOS Section 2: Share sheet — honest not-yet-available note */}
            <Card>
              <SectionHeader icon={Share2} title="Share Sheet" step={2} />
              <View
                className="rounded-xl p-3 flex-row items-center gap-2"
                style={{
                  backgroundColor: `${colors.teal}11`,
                  borderWidth: 1,
                  borderColor: `${colors.teal}22`,
                }}
              >
                <Smartphone size={14} color={colors.teal} />
                <Text className="text-[11px] text-white/50 flex-1">
                  Sharing into AGI Workforce from other apps is not yet available on iOS. Use the
                  Siri actions above instead.
                </Text>
              </View>
            </Card>
          </>
        ) : (
          <>
            {/* Android Section 1: Share sheet */}
            <Card>
              <SectionHeader icon={Share2} title="Share From Any App" step={1} />
              <Text className="text-xs text-white/50 mb-3">
                Send text or links to AGI Workforce through the Android share sheet. You always
                review the content before anything is sent to a model.
              </Text>
              <View
                className="rounded-xl p-3 gap-2"
                style={{ backgroundColor: colors.surfaceElevated }}
              >
                <Text className="text-[11px] text-white/40 uppercase tracking-wider mb-1">
                  How to share
                </Text>
                <Text className="text-xs text-white/40">
                  1. In any app, tap{' '}
                  <Text className="text-xs text-white/60 font-medium">Share</Text> on text or a link
                </Text>
                <Text className="text-xs text-white/40">
                  2. Choose <Text className="text-xs text-white/60 font-medium">AGI Workforce</Text>{' '}
                  from the share sheet
                </Text>
                <Text className="text-xs text-white/40">
                  3. Review the preview, then tap{' '}
                  <Text className="text-xs text-white/60 font-medium">Send to Chat</Text>
                </Text>
              </View>
            </Card>

            {/* Android Section 2: Selected text action */}
            <Card>
              <SectionHeader icon={TextCursorInput} title="Act On Selected Text" step={2} />
              <Text className="text-xs text-white/50 mb-3">
                Select text anywhere, then pick{' '}
                <Text className="text-xs text-white/70 font-medium">AGI Workforce</Text> from the
                text-selection menu (it may be under the{' '}
                <Text className="text-xs text-white/70 font-medium">⋮ More</Text> overflow). The
                selection opens in the same review screen as a share.
              </Text>
            </Card>
          </>
        )}

        {/* Both platforms: links open in the app */}
        <Card>
          <SectionHeader icon={Link2} title="Links Open In The App" step={3} />
          <Text className="text-xs text-white/50">
            Links to <Text className="text-xs text-white/70 font-medium">agiworkforce.com</Text>{' '}
            open directly in the app when it is installed
            {isIOS ? ' (universal links)' : ' (verified app links)'}, and{' '}
            <Text className="text-xs text-white/70 font-medium">agiworkforce://</Text> deep links
            work from any app that can open URLs.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
