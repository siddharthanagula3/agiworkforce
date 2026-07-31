import { useCallback } from 'react';
import { View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Code, PenLine, Search, Brain, FileText, Lightbulb } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { type ColorScheme, useThemeColors } from '@/src/ui/theme';

type StarterTone = 'active' | 'success' | 'purple' | 'warning' | 'danger' | 'accent';

interface Starter {
  icon: React.ComponentType<{ size: number; color: string }>;
  title: string;
  prompt: string;
  tone: StarterTone;
}

const STARTERS: Starter[] = [
  {
    icon: Code,
    title: 'SwiftUI Auth',
    prompt:
      'Write a SwiftUI login screen with biometric unlock (Face ID / Touch ID). Include a clean two-field form, a "Sign in with Biometrics" button, LocalAuthentication integration, and error handling for failed authentication.',
    tone: 'active',
  },
  {
    icon: FileText,
    title: 'Summarize PDF',
    prompt:
      'Summarize this document and pull out the top action items. Format the summary in 3–5 bullet points followed by a numbered action-item list with owners and due dates where mentioned.',
    tone: 'danger',
  },
  {
    icon: Search,
    title: 'Tokyo Itinerary',
    prompt:
      'Plan a 3-day Tokyo itinerary with a daily budget of $150 USD per person. Include neighborhoods to explore each day, 2–3 restaurant picks per day (mix of budget and mid-range), must-see spots, and local transit tips.',
    tone: 'purple',
  },
  {
    icon: Brain,
    title: 'Startup Pitch',
    prompt:
      'Help me brainstorm a 60-second investor pitch for an AI productivity app targeting indie developers. Give me 5 opening hook options, a problem statement, and a one-line value prop I can test with users.',
    tone: 'warning',
  },
  {
    icon: PenLine,
    title: 'SQL → Explanation',
    prompt:
      'Explain what this SQL query does in plain English, then rewrite it to be more readable and add a short comment block at the top describing its purpose, inputs, and expected output.',
    tone: 'success',
  },
  {
    icon: Lightbulb,
    title: 'Debug This Error',
    prompt:
      'I am getting this error and I am not sure why. Explain what is causing it, walk me through a mental model of why it happens, and give me 3 concrete fixes ranked by simplicity — paste your error below:',
    tone: 'accent',
  },
];

function getStarterTone(colors: ColorScheme, tone: StarterTone) {
  switch (tone) {
    case 'active':
      return {
        icon: colors.agentActive,
        background: colors.accentSurface,
        border: colors.accentBorder,
        pressed: colors.surfaceHover,
      };
    case 'success':
      return {
        icon: colors.agentSuccess,
        background: colors.successSurface,
        border: colors.successBorder,
        pressed: colors.surfaceHover,
      };
    case 'purple':
      return {
        icon: colors.purple,
        background: colors.purpleSurface,
        border: colors.accentBorder,
        pressed: colors.surfaceHover,
      };
    case 'warning':
      return {
        icon: colors.agentWarning,
        background: colors.warningSurface,
        border: colors.warningBorder,
        pressed: colors.surfaceHover,
      };
    case 'danger':
      return {
        icon: colors.agentError,
        background: colors.dangerSurface,
        border: colors.dangerBorder,
        pressed: colors.surfaceHover,
      };
    case 'accent':
      return {
        icon: colors.teal,
        background: colors.accentSurface,
        border: colors.accentBorder,
        pressed: colors.surfaceHover,
      };
  }
}

interface ConversationStartersProps {
  /** Optional section title shown above the grid. Defaults to "Start a conversation". */
  title?: string;
}

/**
 * ConversationStarters — a 2-column grid of prompt suggestion cards.
 * Each card creates a new conversation, navigates to it, and pre-fills the input
 * without auto-sending (lets the user customize the prompt first).
 */
export function ConversationStarters({
  title = 'Start a conversation',
}: ConversationStartersProps) {
  const router = useRouter();
  const createConversation = useChatStore((s) => s.createConversation);

  const handlePress = useCallback(
    async (starter: Starter) => {
      try {
        const conversationId = await createConversation();
        router.push(
          `/(app)/chat/${conversationId}?prompt=${encodeURIComponent(starter.prompt)}` as Parameters<
            typeof router.push
          >[0],
        );
      } catch {
        // Conversation creation failed — no-op
      }
    },
    [createConversation, router],
  );

  return (
    <View>
      <Text variant="caption" className="uppercase tracking-wider mb-3">
        {title}
      </Text>

      {/* 2-column grid */}
      <View className="flex-row flex-wrap gap-3">
        {STARTERS.map((starter, index) => (
          <StarterCard key={starter.title} starter={starter} index={index} onPress={handlePress} />
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// StarterCard
// ---------------------------------------------------------------------------

interface StarterCardProps {
  starter: Starter;
  index: number;
  onPress: (starter: Starter) => void;
}

function StarterCard({ starter, index, onPress }: StarterCardProps) {
  const IconComponent = starter.icon;
  const colors = useThemeColors();
  const tone = getStarterTone(colors, starter.tone);

  // Stagger delay: 40ms per card
  const delay = index * 40;

  return (
    <Animated.View entering={FadeInDown.duration(280).delay(delay)} style={{ width: '47.5%' }}>
      <Pressable
        onPress={() => onPress(starter)}
        accessible
        accessibilityLabel={`${starter.title} starter`}
        accessibilityRole="button"
        accessibilityHint={`Pre-fills: ${starter.prompt}`}
        style={({ pressed }) => ({
          backgroundColor: pressed ? tone.pressed : tone.background,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: tone.border,
          padding: 14,
          gap: 8,
        })}
      >
        {/* Icon */}
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: tone.background,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconComponent size={16} color={tone.icon} />
        </View>

        {/* Title */}
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textPrimary }}>
          {starter.title}
        </Text>

        {/* Prompt preview */}
        <Text style={{ fontSize: 11, color: colors.textMuted, lineHeight: 16 }} numberOfLines={2}>
          {starter.prompt}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
