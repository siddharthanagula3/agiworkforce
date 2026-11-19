import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { MessagesSquare } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { radii, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  PAST_CHAT_HIGHLIGHT_PARAM,
  pastChatCitationDate,
  type PastChatCitation,
} from '@/src/features/chat/utils/referenceCitations';

const CHIP_HEIGHT = 28;
const CHIP_HIT_SLOP = { top: 8, bottom: 8, left: 2, right: 2 };

function PastChatChip({ citation }: { citation: PastChatCitation }) {
  const colors = useThemeColors();
  const router = useRouter();
  const date = pastChatCitationDate(citation.createdAt);
  return (
    <PressableBox
      onPress={() =>
        router.push({
          pathname: '/(app)/chat/[id]',
          params: {
            id: citation.conversationId,
            [PAST_CHAT_HIGHLIGHT_PARAM]: citation.messageId,
          },
        })
      }
      hitSlop={CHIP_HIT_SLOP}
      accessibilityRole="link"
      accessibilityLabel={
        date
          ? `Open the source conversation ${citation.title}, ${date}`
          : `Open the source conversation ${citation.title}`
      }
      accessibilityHint="Opens that chat at the message this answer used"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        maxWidth: '100%',
        minHeight: CHIP_HEIGHT,
        paddingHorizontal: 10,
        borderRadius: radii.full,
        backgroundColor: pressed ? colors.surfaceHover : colors.inputSurface,
      })}
    >
      <MessagesSquare size={14} color={colors.textMuted} />
      <Text
        numberOfLines={1}
        style={{ flexShrink: 1, fontSize: typeScale.footnote, color: colors.textSecondary }}
      >
        {citation.title}
      </Text>
      {date ? (
        <Text numberOfLines={1} style={{ fontSize: typeScale.footnote, color: colors.textMuted }}>
          {`· ${date}`}
        </Text>
      ) : null}
    </PressableBox>
  );
}

export function PastChatCitations({ citations }: { citations: readonly PastChatCitation[] }) {
  if (citations.length === 0) return null;
  return (
    <View
      accessibilityLabel="Previous chats this answer used"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}
    >
      {citations.map((citation) => (
        <PastChatChip key={citation.id} citation={citation} />
      ))}
    </View>
  );
}
