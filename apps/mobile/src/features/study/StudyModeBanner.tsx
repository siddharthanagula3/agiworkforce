import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { BookOpen } from 'lucide-react-native';
import { STUDY_MODE_LABELS, isStudySessionActive, type StudySession } from '@agiworkforce/types';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import {
  endStudySession,
  startStudySession,
  studySessionForConversation,
} from '@/src/features/study/service';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { toUserMessage } from '@/services/userMessage';

export const STUDY_MODE_OFF_NOTE = 'Study mode is off. This chat and its messages stay.';

export function StudyModeBanner({ conversationId }: { conversationId: string }) {
  const colors = useThemeColors();
  const [session, setSession] = useState<StudySession | null>(null);
  const [endedHere, setEndedHere] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setSession(null);
    setEndedHere(false);
    void studySessionForConversation(conversationId, controller.signal)
      .then((found) => {
        if (!controller.signal.aborted) setSession(found);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [conversationId]);

  const toggle = useCallback(async () => {
    if (!session || pending) return;
    setPending(true);
    setError(null);
    try {
      if (isStudySessionActive(session)) {
        setSession(await endStudySession(conversationId));
        setEndedHere(true);
      } else {
        setSession(
          await startStudySession({
            conversationId,
            topic: session.topic,
            mode: session.mode,
            level: session.level,
          }),
        );
        setEndedHere(false);
      }
    } catch (cause) {
      setError(toUserMessage(cause, 'Study mode could not be changed. Try again.'));
    } finally {
      setPending(false);
    }
  }, [conversationId, pending, session]);

  if (!session) return null;
  const active = isStudySessionActive(session);
  if (!active && !endedHere) return null;

  return (
    <View testID="study-mode-banner" style={{ paddingHorizontal: 16, paddingVertical: 6, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <BookOpen size={15} color={colors.textMuted} />
        <Text
          accessibilityRole="text"
          numberOfLines={2}
          style={{ flex: 1, color: colors.textSecondary, fontSize: typeScale.footnote }}
        >
          {active
            ? `Studying: ${session.topic} · ${STUDY_MODE_LABELS[session.mode]}`
            : STUDY_MODE_OFF_NOTE}
        </Text>
        <Pressable
          onPress={() => void toggle()}
          disabled={pending}
          accessibilityRole="button"
          accessibilityLabel={active ? 'Leave study mode' : 'Turn study mode back on'}
          accessibilityHint={
            active ? 'Turns off tutoring for this chat. The chat and its messages stay.' : undefined
          }
          accessibilityState={{ disabled: pending, busy: pending }}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}
        >
          <Text
            style={{ color: colors.textPrimary, fontSize: typeScale.footnote, fontWeight: '600' }}
          >
            {active ? 'Leave study mode' : 'Turn back on'}
          </Text>
        </Pressable>
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.agentError, fontSize: typeScale.footnote }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
