import { useMemo, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { CircleCheck, CircleX, Lightbulb } from 'lucide-react-native';
import {
  buildQuizFollowUp,
  gradeShortAnswer,
  shortAnswerRecheckPrompt,
  type Quiz,
  type QuizQuestion,
} from '@agiworkforce/unified-chat/study-set';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { radii, spacing, typeScale } from '@/src/ui/theme/tokens';
import { FULL_SCREEN_TOUCH_TARGET } from '@/src/features/chat/chrome/fullScreenChrome';

interface AnswerState {
  choice: number | null;
  typed: string;
  submitted: boolean;
  correct: boolean;
  hints: number;
}

const EMPTY: AnswerState = { choice: null, typed: '', submitted: false, correct: false, hints: 0 };

type OptionLook = 'idle' | 'chosen' | 'correct' | 'wrong';

function correctAnswerText(question: QuizQuestion): string {
  return question.kind === 'multiple_choice'
    ? (question.options[question.answer] ?? '')
    : question.answer;
}

export interface StudyQuizViewProps {
  quiz: Quiz;
  onAsk?: (prompt: string) => void;
}

export function StudyQuizView({ quiz, onAsk }: StudyQuizViewProps) {
  const colors = useThemeColors();
  const [answers, setAnswers] = useState<AnswerState[]>(() => quiz.questions.map(() => EMPTY));
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const total = quiz.questions.length;
  const question = quiz.questions[Math.min(index, total - 1)]!;
  const state = answers[index] ?? EMPTY;
  const score = useMemo(() => answers.filter((answer) => answer.correct).length, [answers]);
  const title = quiz.title || 'Quiz';

  const patch = (next: Partial<AnswerState>) =>
    setAnswers((current) =>
      current.map((answer, position) => (position === index ? { ...answer, ...next } : answer)),
    );

  const canCheck =
    question.kind === 'multiple_choice' ? state.choice !== null : state.typed.trim().length > 0;

  const check = () => {
    if (state.submitted || !canCheck) return;
    const correct =
      question.kind === 'multiple_choice'
        ? state.choice === question.answer
        : gradeShortAnswer(question, state.typed);
    patch({ submitted: true, correct });
    AccessibilityInfo.announceForAccessibility(
      correct ? 'Correct.' : `Not quite. The answer is ${correctAnswerText(question)}.`,
    );
  };

  const restart = () => {
    setAnswers(quiz.questions.map(() => EMPTY));
    setIndex(0);
    setFinished(false);
  };

  const cardStyle = {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  } as const;

  if (finished) {
    const missed = quiz.questions
      .map((entry, position) => ({ entry, position }))
      .filter(({ position }) => !answers[position]?.correct);
    return (
      <View style={cardStyle} testID="quiz-results" accessibilityLabel={`${title} results`}>
        <Text
          accessibilityRole="header"
          style={{ fontSize: typeScale.headline, fontWeight: '600', color: colors.textPrimary }}
        >
          You scored {score} of {total}
        </Text>
        {missed.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            {missed.map(({ entry, position }) => (
              <View key={position} style={{ gap: spacing.xs }}>
                <Text
                  style={{ fontSize: typeScale.body, fontWeight: '600', color: colors.textPrimary }}
                >
                  {position + 1}. {entry.question}
                </Text>
                <Text style={{ fontSize: typeScale.body, color: colors.textSecondary }}>
                  Answer: {correctAnswerText(entry)}
                </Text>
                {entry.explanation ? (
                  <Text style={{ fontSize: typeScale.body, color: colors.textSecondary }}>
                    {entry.explanation}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ fontSize: typeScale.body, color: colors.textSecondary }}>
            Every answer was right.
          </Text>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Button title="Retake" variant="outline" onPress={restart} testID="quiz-retake" />
          {onAsk ? (
            <Button
              title={missed.length > 0 ? 'Explain what I missed' : 'What should I study next?'}
              variant="outline"
              onPress={() => onAsk(buildQuizFollowUp({ ...quiz, title }, answers))}
              testID="quiz-follow-up"
            />
          ) : null}
        </View>
      </View>
    );
  }

  const optionLook = (option: number): OptionLook => {
    if (!state.submitted) return state.choice === option ? 'chosen' : 'idle';
    if (question.kind === 'multiple_choice' && option === question.answer) return 'correct';
    return state.choice === option ? 'wrong' : 'idle';
  };

  const optionColors = (look: OptionLook) => {
    switch (look) {
      case 'chosen':
        return { borderColor: colors.textPrimary, backgroundColor: colors.surfaceHover };
      case 'correct':
        return { borderColor: colors.successBorder, backgroundColor: colors.successSurface };
      case 'wrong':
        return { borderColor: colors.dangerBorder, backgroundColor: colors.dangerSurface };
      case 'idle':
        return { borderColor: colors.border, backgroundColor: colors.transparent };
    }
  };

  const optionLabel = (option: string, look: OptionLook) =>
    look === 'correct'
      ? `${option}, correct answer`
      : look === 'wrong'
        ? `${option}, your answer`
        : option;

  return (
    <View style={cardStyle} testID="quiz-view" accessibilityLabel={title}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
        <Text
          style={{ flex: 1, fontSize: typeScale.caption, color: colors.textMuted }}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
          Question {index + 1} of {total}
        </Text>
      </View>

      <Text
        accessibilityRole="header"
        style={{ fontSize: typeScale.callout, fontWeight: '600', color: colors.textPrimary }}
      >
        {question.question}
      </Text>

      {question.kind === 'multiple_choice' ? (
        <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
          {question.options.map((option, optionIndex) => {
            const look = optionLook(optionIndex);
            return (
              <PressableBox
                key={optionIndex}
                testID={`quiz-option-${optionIndex}`}
                accessibilityRole="radio"
                accessibilityLabel={optionLabel(option, look)}
                accessibilityState={{
                  checked: state.choice === optionIndex,
                  disabled: state.submitted,
                }}
                disabled={state.submitted}
                onPress={() => patch({ choice: optionIndex })}
                style={{
                  minHeight: FULL_SCREEN_TOUCH_TARGET,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderRadius: radii.lg,
                  borderWidth: 1,
                  ...optionColors(look),
                }}
              >
                <Text style={{ flex: 1, fontSize: typeScale.body, color: colors.textPrimary }}>
                  {option}
                </Text>
                {look === 'correct' ? (
                  <CircleCheck size={18} color={colors.agentSuccess} />
                ) : look === 'wrong' ? (
                  <CircleX size={18} color={colors.agentError} />
                ) : null}
              </PressableBox>
            );
          })}
        </View>
      ) : (
        <Input
          testID="quiz-answer-input"
          accessibilityLabel="Your answer"
          placeholder="Type your answer"
          value={state.typed}
          editable={!state.submitted}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
          onChangeText={(typed) => patch({ typed })}
          onSubmitEditing={check}
        />
      )}

      {question.hints.length > 0 && !state.submitted ? (
        <View style={{ gap: spacing.xs }}>
          {question.hints.slice(0, state.hints).map((hint, hintIndex) => (
            <View
              key={hintIndex}
              accessible
              accessibilityLabel={`Hint ${hintIndex + 1}: ${hint}`}
              style={{
                flexDirection: 'row',
                gap: spacing.sm,
                padding: spacing.md,
                borderRadius: radii.lg,
                backgroundColor: colors.surfaceHover,
              }}
            >
              <Lightbulb size={16} color={colors.textMuted} />
              <Text style={{ flex: 1, fontSize: typeScale.body, color: colors.textPrimary }}>
                {hint}
              </Text>
            </View>
          ))}
          {state.hints < question.hints.length ? (
            <Button
              title={`${state.hints === 0 ? 'Show a hint' : 'Show another hint'} (${state.hints}/${question.hints.length})`}
              variant="ghost"
              onPress={() => patch({ hints: state.hints + 1 })}
              testID="quiz-hint"
              style={{ alignSelf: 'flex-start' }}
            />
          ) : null}
        </View>
      ) : null}

      {state.submitted ? (
        <View
          testID="quiz-feedback"
          accessibilityLiveRegion="polite"
          style={{
            gap: spacing.xs,
            padding: spacing.md,
            borderRadius: radii.lg,
            borderWidth: 1,
            borderColor: state.correct ? colors.successBorder : colors.dangerBorder,
          }}
        >
          <Text
            style={{
              fontSize: typeScale.body,
              fontWeight: '600',
              color: state.correct ? colors.agentSuccess : colors.agentError,
            }}
          >
            {state.correct
              ? 'Correct.'
              : `Not quite. The answer is ${correctAnswerText(question)}.`}
          </Text>
          {question.explanation ? (
            <Text style={{ fontSize: typeScale.body, color: colors.textPrimary }}>
              {question.explanation}
            </Text>
          ) : null}
          {!state.correct && question.kind === 'short_answer' && onAsk ? (
            <Button
              title="Ask whether my wording also counts"
              variant="ghost"
              testID="quiz-ask-wording"
              style={{ alignSelf: 'flex-start' }}
              onPress={() => onAsk(shortAnswerRecheckPrompt(question, state.typed))}
            />
          ) : null}
        </View>
      ) : null}

      <View
        style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md }}
      >
        {!state.submitted ? (
          <Button title="Check answer" onPress={check} disabled={!canCheck} testID="quiz-check" />
        ) : index < total - 1 ? (
          <Button title="Next question" onPress={() => setIndex(index + 1)} testID="quiz-next" />
        ) : (
          <Button title="See results" onPress={() => setFinished(true)} testID="quiz-finish" />
        )}
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
          {score} correct so far
        </Text>
      </View>
    </View>
  );
}
