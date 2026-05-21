import { useCallback } from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Code, PenLine, Search, Brain, FileText, Lightbulb } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { colors } from '@/lib/theme';

interface Starter {
  icon: React.ComponentType<{ size: number; color: string }>;
  title: string;
  prompt: string;
  color: string;
}

const STARTERS: Starter[] = [
  { icon: Code, title: 'Write Code', prompt: 'Help me write a function that...', color: '#3b82f6' },
  {
    icon: PenLine,
    title: 'Write Content',
    prompt: 'Write a professional email about...',
    color: '#10b981',
  },
  {
    icon: Search,
    title: 'Research',
    prompt: 'Research and summarize the latest on...',
    color: '#a855f7',
  },
  {
    icon: Brain,
    title: 'Brainstorm',
    prompt: 'Help me brainstorm ideas for...',
    color: '#f59e0b',
  },
  {
    icon: FileText,
    title: 'Analyze',
    prompt: 'Analyze this data and provide insights...',
    color: '#ef4444',
  },
  {
    icon: Lightbulb,
    title: 'Explain',
    prompt: 'Explain in simple terms how...',
    color: colors.teal,
  },
];

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
          backgroundColor: pressed ? `${starter.color}22` : `${starter.color}14`,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: `${starter.color}30`,
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
            backgroundColor: `${starter.color}20`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconComponent size={16} color={starter.color} />
        </View>

        {/* Title */}
        <Text className="text-[13px] font-semibold text-white">{starter.title}</Text>

        {/* Prompt preview */}
        <Text className="text-[11px] text-white/40 leading-4" numberOfLines={2}>
          {starter.prompt}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
