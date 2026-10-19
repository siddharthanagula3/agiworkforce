import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BookOpen, ChevronRight } from 'lucide-react-native';
import {
  MAX_STUDY_TOPIC_LENGTH,
  STUDY_LEVELS,
  STUDY_LEVEL_LABELS,
  STUDY_MODES,
  STUDY_MODE_DESCRIPTIONS,
  STUDY_MODE_LABELS,
  isStudySessionActive,
  normalizeStudyTopic,
  sortStudySessions,
  studyConversationTitle,
  type StudyLevel,
  type StudyMode,
  type StudySession,
} from '@agiworkforce/types';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { SettingsGroup, SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { listStudySessions, startStudySession } from '@/src/features/study/service';
import { useChatStore } from '@/stores/chatStore';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { toUserMessage } from '@/services/userMessage';

function Choice({
  label,
  hint,
  selected,
  onPress,
  testID,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      accessibilityState={{ selected }}
      style={{
        minHeight: 44,
        paddingHorizontal: 14,
        paddingVertical: hint ? 10 : 0,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: selected ? colors.textPrimary : colors.border,
        backgroundColor: selected ? colors.surfaceOverlay : colors.surfaceElevated,
        justifyContent: 'center',
        gap: 2,
      }}
    >
      <Text
        style={{
          color: colors.textPrimary,
          fontSize: typeScale.subhead,
          fontWeight: selected ? '600' : '500',
        }}
      >
        {label}
      </Text>
      {hint ? (
        <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote, lineHeight: 18 }}>
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  const colors = useThemeColors();
  return (
    <Text
      style={{
        color: colors.textMuted,
        fontSize: typeScale.caption,
        fontWeight: '700',
        letterSpacing: 0.7,
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}

export function StudyScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const createConversation = useChatStore((s) => s.createConversation);
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<StudyMode>('learn');
  const [level, setLevel] = useState<StudyLevel>('beginner');
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCloud = appMode === 'cloud';

  useEffect(() => {
    if (!isCloud) return;
    const controller = new AbortController();
    void listStudySessions(controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) setSessions(sortStudySessions(loaded));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [isCloud]);

  const normalizedTopic = normalizeStudyTopic(topic);

  const start = useCallback(async () => {
    if (!normalizedTopic || starting) return;
    setStarting(true);
    setError(null);
    try {
      const conversationId = await createConversation(
        studyConversationTitle(normalizedTopic, mode),
      );
      const session = await startStudySession({
        conversationId,
        topic: normalizedTopic,
        mode,
        level,
      });
      router.replace({ pathname: '/(app)/chat/[id]', params: { id: session.conversationId } });
    } catch (cause) {
      setError(toUserMessage(cause, 'The study session could not be started.'));
      setStarting(false);
    }
  }, [createConversation, level, mode, normalizedTopic, router, starting]);

  if (!isCloud) {
    return (
      <SettingsScreenShell title="Study and learn" backHref="/(app)/(tabs)/chat">
        <SettingsInfo
          title="Study runs in AGI Cloud"
          body="The tutor keeps a study session on your account so every reply teaches, quizzes or revises the topic you chose. Switch to Cloud mode to start one."
          icon={BookOpen}
        />
        <Pressable
          onPress={() => setAppMode('cloud')}
          accessibilityRole="button"
          accessibilityLabel="Switch to Cloud mode"
          style={{
            minHeight: 44,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
            Switch to Cloud mode
          </Text>
        </Pressable>
      </SettingsScreenShell>
    );
  }

  const canStart = normalizedTopic !== null && !starting;

  return (
    <SettingsScreenShell title="Study and learn" backHref="/(app)/(tabs)/chat">
      <SectionLabel>TOPIC</SectionLabel>
      <TextInput
        testID="study-topic"
        value={topic}
        onChangeText={(value) => {
          setTopic(value);
          if (error) setError(null);
        }}
        placeholder="e.g. Photosynthesis, or Spanish past tense"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="What do you want to study?"
        maxLength={MAX_STUDY_TOPIC_LENGTH}
        returnKeyType="done"
        style={{
          minHeight: 48,
          paddingHorizontal: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceElevated,
          color: colors.textPrimary,
          fontSize: typeScale.body,
          marginBottom: 24,
        }}
      />

      <SectionLabel>HOW</SectionLabel>
      <View accessibilityRole="radiogroup" style={{ gap: 8, marginBottom: 24 }}>
        {STUDY_MODES.map((entry) => (
          <Choice
            key={entry}
            testID={`study-mode-${entry}`}
            label={STUDY_MODE_LABELS[entry]}
            hint={STUDY_MODE_DESCRIPTIONS[entry]}
            selected={mode === entry}
            onPress={() => setMode(entry)}
          />
        ))}
      </View>

      <SectionLabel>YOUR LEVEL</SectionLabel>
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}
      >
        {STUDY_LEVELS.map((entry) => (
          <Choice
            key={entry}
            testID={`study-level-${entry}`}
            label={STUDY_LEVEL_LABELS[entry]}
            selected={level === entry}
            onPress={() => setLevel(entry)}
          />
        ))}
      </View>

      <Pressable
        testID="study-start"
        onPress={() => void start()}
        disabled={!canStart}
        accessibilityRole="button"
        accessibilityLabel="Start studying"
        accessibilityState={{ disabled: !canStart, busy: starting }}
        style={{
          minHeight: 48,
          borderRadius: 999,
          backgroundColor: colors.textPrimary,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: canStart ? 1 : 0.5,
          marginBottom: 12,
        }}
      >
        {starting ? (
          <ActivityIndicator color={colors.surfaceElevated} />
        ) : (
          <Text
            style={{ color: colors.surfaceElevated, fontSize: typeScale.body, fontWeight: '600' }}
          >
            Start studying
          </Text>
        )}
      </Pressable>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.agentError, fontSize: typeScale.footnote, marginBottom: 12 }}
        >
          {error}
        </Text>
      ) : null}

      {sessions.length > 0 ? (
        <>
          <SectionLabel>RECENT</SectionLabel>
          <SettingsGroup>
            {sessions.slice(0, 10).map((session, index, list) => (
              <Pressable
                key={session.id}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/chat/[id]',
                    params: { id: session.conversationId },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Open ${studyConversationTitle(session.topic, session.mode)}`}
                style={{
                  minHeight: 52,
                  paddingHorizontal: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  borderBottomWidth: index === list.length - 1 ? 0 : 1,
                  borderBottomColor: colors.border,
                }}
              >
                <BookOpen size={17} color={colors.textSecondary} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.textPrimary, fontSize: typeScale.body }}
                  >
                    {session.topic}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote }}>
                    {isStudySessionActive(session)
                      ? STUDY_MODE_LABELS[session.mode]
                      : `${STUDY_MODE_LABELS[session.mode]} · ended`}
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.textMuted} />
              </Pressable>
            ))}
          </SettingsGroup>
        </>
      ) : null}
    </SettingsScreenShell>
  );
}
