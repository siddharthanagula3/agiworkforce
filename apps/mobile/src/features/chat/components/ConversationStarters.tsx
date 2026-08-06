import { useCallback } from 'react';
import { View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Code, PenLine, Search, Image as ImageIcon, Film, Monitor } from 'lucide-react-native';
import {
  QUICK_START_INTENTS,
  QUICK_START_INTENT_COPY,
  type QuickStartIntent,
} from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { type ColorScheme, useThemeColors } from '@/src/ui/theme';

interface Starter {
  icon: React.ComponentType<{ size: number; color: string }>;
  title: string;
  /** What the card does, in a phrase. */
  description: string;
  /** Composer stem the user continues typing after. */
  prompt: string;
}

/**
 * The same six intents web and desktop offer, in the same order and under the
 * same names — see QUICK_START_INTENT_COPY in @agiworkforce/types.
 *
 * These cards previously advertised six unrelated canned demos ("SwiftUI Auth",
 * "Tokyo Itinerary", "Debug This Error"). They read as a feature tour of a
 * different product than the one web and desktop introduce, and each card
 * committed the user to a long, oddly specific prompt they then had to delete.
 * Mobile keeps the richer card layout — it has the vertical space that a chip
 * row does not — but the words and the prefill stem now match every other
 * surface.
 */
const STARTER_ICONS: Record<
  QuickStartIntent,
  React.ComponentType<{ size: number; color: string }>
> = {
  code: Code,
  write: PenLine,
  research: Search,
  image: ImageIcon,
  video: Film,
  computer: Monitor,
};

const STARTERS: Starter[] = QUICK_START_INTENTS.map((intent) => ({
  icon: STARTER_ICONS[intent],
  title: QUICK_START_INTENT_COPY[intent].label,
  description: QUICK_START_INTENT_COPY[intent].accessibleLabel,
  prompt: QUICK_START_INTENT_COPY[intent].prompt,
}));

/**
 * One surface treatment for every card.
 *
 * Each starter previously carried its own tone — red, purple, amber, teal,
 * green, blue — so the first screen of the app was a six-colour grid. Colour
 * that does not encode anything is noise, and none of the reference products do
 * it. The icon carries the accent; the card stays quiet.
 */
function getStarterTone(colors: ColorScheme) {
  return {
    icon: colors.textPrimary,
    // The icon well needs its own fill, or the 32px square is invisible against
    // the card it sits on.
    iconBackground: colors.accentSurface,
    background: colors.surfaceElevated,
    border: colors.border,
    pressed: colors.surfaceHover,
  };
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
  const tone = getStarterTone(colors);

  // Stagger delay: 40ms per card
  const delay = index * 40;

  return (
    <Animated.View entering={FadeInDown.duration(280).delay(delay)} style={{ width: '47.5%' }}>
      <Pressable
        onPress={() => onPress(starter)}
        accessible
        accessibilityLabel={starter.description}
        accessibilityRole="button"
        accessibilityHint="Starts a new chat with this prompt ready to edit"
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
            backgroundColor: tone.iconBackground,
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

        {/* What the card does — not the raw stem, which reads as a truncated sentence. */}
        <Text style={{ fontSize: 11, color: colors.textMuted, lineHeight: 16 }} numberOfLines={2}>
          {starter.description}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
