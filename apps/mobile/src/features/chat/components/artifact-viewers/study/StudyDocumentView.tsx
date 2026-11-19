import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { parseFlashcards, parseQuiz, studySegments } from '@agiworkforce/unified-chat/study-set';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { StudyFlashcardsView } from './StudyFlashcardsView';
import { StudyQuizView } from './StudyQuizView';

export interface StudyDocumentViewProps {
  content: string;
  renderMarkdown: (text: string) => ReactNode;
  streaming?: boolean;
  onAsk?: (prompt: string) => void;
}

/**
 * A study document: its prose through the caller's Markdown renderer, and each
 * quiz or flashcard set as the interactive control. The set's source is never
 * shown, so no answer appears before the person gives one.
 */
export function StudyDocumentView({
  content,
  renderMarkdown,
  streaming = false,
  onAsk,
}: StudyDocumentViewProps) {
  const colors = useThemeColors();
  const segments = useMemo(() => studySegments(content), [content]);
  const lastStudySegment = segments.reduce(
    (last, segment, position) => (segment.kind === 'markdown' ? last : position),
    -1,
  );

  return (
    <View testID="study-document" style={{ gap: spacing.lg, marginVertical: spacing.sm }}>
      {segments.map((segment, position) => {
        if (segment.kind === 'markdown') {
          return <View key={position}>{renderMarkdown(segment.text)}</View>;
        }
        const quiz = segment.kind === 'quiz' ? parseQuiz(segment.source) : null;
        const cards = segment.kind === 'flashcards' ? parseFlashcards(segment.source) : null;
        const noun = segment.kind === 'quiz' ? 'quiz' : 'flashcard set';
        if (quiz) {
          return <StudyQuizView key={segment.source} quiz={quiz} {...(onAsk ? { onAsk } : {})} />;
        }
        if (cards) {
          return <StudyFlashcardsView key={segment.source} set={cards} />;
        }
        const writing = streaming && position === lastStudySegment;
        return (
          <Text
            key={position}
            testID={writing ? 'study-segment-writing' : 'study-segment-unreadable'}
            accessibilityLiveRegion="polite"
            style={{ fontSize: typeScale.body, color: colors.textSecondary }}
          >
            {writing ? `Writing the ${noun}` : `This ${noun} could not be read.`}
          </Text>
        );
      })}
    </View>
  );
}
