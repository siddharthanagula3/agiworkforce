import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Check } from 'lucide-react-native';
import {
  CLARIFY_OTHER_MAX_LENGTH,
  type ClarifyAnswer,
  type ClarifyCardBody,
  type ClarifyQuestion,
  type InteractiveCard,
  type InteractiveCardResponsePayload,
} from '@agiworkforce/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { radii, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  clarifyCardAcceptsResponse,
  clarifyResponseDeadlineMs,
} from '@/src/features/chat/utils/clarifyCard';

const SUBMISSION_FAILURE_MESSAGE =
  "Couldn't send that answer, the questions are still waiting for you.";

type Draft = Record<string, { optionIds: string[]; otherText: string }>;

function emptyDraft(questions: readonly ClarifyQuestion[]): Draft {
  return Object.fromEntries(questions.map((q) => [q.id, { optionIds: [], otherText: '' }]));
}

function describeAnswer(answer: ClarifyAnswer | undefined): string {
  if (!answer) return 'No answer';
  if (answer.kind === 'skipped') return 'Skipped';
  if (answer.kind === 'other') return answer.text;
  return answer.labels.length > 0 ? answer.labels.join(', ') : answer.optionIds.join(', ');
}

function expiredReason(reason: 'checkpoint_gone' | 'turn_failed' | 'superseded'): string {
  if (reason === 'checkpoint_gone') return ': the turn that asked them has ended.';
  if (reason === 'turn_failed') return ': that turn failed.';
  return ': they were superseded by a newer message.';
}

export function ClarifyCard({
  card,
  body,
  canRespond,
  onRespond,
}: {
  card: InteractiveCard;
  body: ClarifyCardBody;
  canRespond: boolean;
  onRespond?: (cardId: string, payload: InteractiveCardResponsePayload) => Promise<boolean>;
}) {
  const colors = useThemeColors();
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(body.questions));
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [, setElapsedDeadlines] = useState(0);
  const deadlineMs = clarifyResponseDeadlineMs(card);

  useEffect(() => {
    if (deadlineMs === null) return;
    const delay = deadlineMs - Date.now();
    if (delay <= 0) return;
    const timer = setTimeout(() => setElapsedDeadlines((count) => count + 1), delay);
    return () => clearTimeout(timer);
  }, [deadlineMs]);

  const interactive = canRespond && Boolean(onRespond) && clarifyCardAcceptsResponse(card);

  const answersById = useMemo(() => {
    if (body.state.status !== 'answered') return new Map<string, ClarifyAnswer>();
    return new Map(body.state.answers.map((a) => [a.questionId, a]));
  }, [body.state]);

  const toggleOption = useCallback((question: ClarifyQuestion, optionId: string) => {
    setDraft((prev) => {
      const current = prev[question.id] ?? { optionIds: [], otherText: '' };
      const selected = current.optionIds.includes(optionId);
      const optionIds = question.multiSelect
        ? selected
          ? current.optionIds.filter((id) => id !== optionId)
          : [...current.optionIds, optionId]
        : selected
          ? []
          : [optionId];
      return { ...prev, [question.id]: { optionIds, otherText: '' } };
    });
  }, []);

  const setOtherText = useCallback((questionId: string, text: string) => {
    setDraft((prev) => ({
      ...prev,
      [questionId]: { optionIds: [], otherText: text.slice(0, CLARIFY_OTHER_MAX_LENGTH) },
    }));
  }, []);

  const canSubmit =
    interactive &&
    body.questions.some((q) => {
      const entry = draft[q.id];
      return (entry?.optionIds.length ?? 0) > 0 || (entry?.otherText.trim().length ?? 0) > 0;
    });

  const send = useCallback(
    (payload: InteractiveCardResponsePayload) => {
      if (!onRespond || submitting) return;
      setSubmitting(true);
      setSubmissionError(null);
      void onRespond(card.cardId, payload)
        .then((ok) => {
          if (!ok) setSubmissionError(SUBMISSION_FAILURE_MESSAGE);
        })
        .finally(() => setSubmitting(false));
    },
    [card.cardId, onRespond, submitting],
  );

  const submit = useCallback(() => {
    send({
      kind: 'answers',
      answers: body.questions.map((q) => {
        const entry = draft[q.id] ?? { optionIds: [], otherText: '' };
        if (entry.otherText.trim().length > 0) {
          return { question_id: q.id, text: entry.otherText.trim() };
        }
        if (entry.optionIds.length > 0) {
          return { question_id: q.id, option_ids: entry.optionIds };
        }
        return { question_id: q.id, skipped: true };
      }),
    });
  }, [body.questions, draft, send]);

  return (
    <View
      testID="interactive-card-clarify"
      accessibilityLabel={card.fallback.headline}
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: radii.lg,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceElevated,
        gap: 12,
      }}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: typeScale.subhead, fontWeight: '600', color: colors.textPrimary }}>
          {body.prompt ?? card.fallback.headline}
        </Text>
        {body.state.status === 'expired' ? (
          <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
            These questions are no longer answerable{expiredReason(body.state.reason)}
          </Text>
        ) : null}
        {body.state.status === 'dismissed' ? (
          <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
            You answered in your own words instead.
          </Text>
        ) : null}
      </View>

      {body.questions.map((question) => {
        const entry = draft[question.id] ?? { optionIds: [], otherText: '' };
        return (
          <View key={question.id} style={{ gap: 6 }}>
            <View style={{ gap: 2 }}>
              <Text
                style={{
                  fontSize: typeScale.caption,
                  fontWeight: '600',
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  color: colors.textMuted,
                }}
              >
                {question.header}
              </Text>
              <Text style={{ fontSize: typeScale.subhead, color: colors.textPrimary }}>
                {question.question}
              </Text>
            </View>

            {body.state.status === 'answered' ? (
              <Text style={{ fontSize: typeScale.subhead, color: colors.textSecondary }}>
                {describeAnswer(answersById.get(question.id))}
              </Text>
            ) : (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {question.options.map((option) => {
                    const selected = entry.optionIds.includes(option.id);
                    return (
                      <PressableBox
                        key={option.id}
                        disabled={!interactive || submitting}
                        onPress={() => toggleOption(question, option.id)}
                        accessibilityRole={question.multiSelect ? 'checkbox' : 'radio'}
                        accessibilityState={{
                          checked: selected,
                          disabled: !interactive || submitting,
                        }}
                        accessibilityLabel={option.label}
                        accessibilityHint={option.description || undefined}
                        style={({ pressed }) => ({
                          minHeight: 36,
                          paddingHorizontal: 12,
                          borderRadius: radii.full,
                          borderWidth: 1,
                          borderColor: selected ? colors.teal : colors.border,
                          backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          opacity: interactive ? 1 : 0.7,
                        })}
                      >
                        {selected ? <Check size={12} color={colors.teal} /> : null}
                        <Text
                          style={{
                            fontSize: typeScale.footnote,
                            color: selected ? colors.textPrimary : colors.textSecondary,
                          }}
                        >
                          {option.label}
                        </Text>
                      </PressableBox>
                    );
                  })}
                </View>
                {question.isOther ? (
                  <Input
                    value={entry.otherText}
                    editable={interactive && !submitting}
                    maxLength={CLARIFY_OTHER_MAX_LENGTH}
                    onChangeText={(text) => setOtherText(question.id, text)}
                    placeholder="Something else…"
                    accessibilityLabel={`Other answer for ${question.header}`}
                  />
                ) : null}
              </>
            )}
          </View>
        );
      })}

      {interactive ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Button
            title={submitting ? 'Sending' : 'Send answers'}
            size="sm"
            disabled={!canSubmit || submitting}
            onPress={submit}
            testID="clarify-send-answers"
          />
          <Button
            title="I'll just type it"
            size="sm"
            variant="ghost"
            disabled={submitting}
            onPress={() => send({ kind: 'dismiss' })}
            testID="clarify-dismiss"
          />
        </View>
      ) : null}

      {interactive && submissionError ? (
        <Text
          accessibilityRole="alert"
          style={{ fontSize: typeScale.caption, color: colors.agentError }}
        >
          {submissionError}
        </Text>
      ) : null}
    </View>
  );
}
