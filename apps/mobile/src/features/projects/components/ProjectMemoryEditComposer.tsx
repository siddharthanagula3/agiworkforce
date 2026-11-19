import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Platform, TextInput, View } from 'react-native';
import { cleanupVoiceDictation } from '@agiworkforce/utils/voice';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import { Text } from '@/components/ui/Text';
import { SendButton } from '@/src/features/chat/components/SendButton';
import {
  COMPOSER_ACTION_CIRCLE_SIZE,
  COMPOSER_CONTROL_SIZE,
} from '@/src/features/chat/components/composerMetrics';
import { VoiceInputButton } from '@/src/features/voice/components/VoiceInputButton';
import { showVoicePermissionAlert } from '@/src/features/voice/components/voicePermissionAlert';
import {
  ProjectMemoryEditUnreadableError,
  deleteProjectMemory,
  editProjectMemory,
  type ProjectMemoryEditResult,
  type ProjectMemoryRemovalCandidate,
} from '@/src/features/projects/projectMemory';
import { useCapability } from '@/src/lib/Capabilities';
import { ApiHttpError } from '@/services/apiErrors';
import { toUserMessage } from '@/services/userMessage';
import { radii, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export const PROJECT_MEMORY_EDIT_PLACEHOLDER = 'Tell AGI what to change';
export const PROJECT_MEMORY_NOTHING_CHANGED = 'Nothing was changed.';
export const PROJECT_MEMORY_UNREACHABLE = 'Could not reach AGI. Nothing was changed.';
export const PROJECT_MEMORY_UNKNOWN_OUTCOME =
  'AGI did not answer in time, so it is not known whether anything changed.';
export const PROJECT_MEMORY_UNREADABLE =
  'AGI sent an answer this app could not read, so it is not known whether anything changed.';
export const PROJECT_MEMORY_SERVER_FAILED = 'AGI could not change memory right now. Try again.';
export const PROJECT_MEMORY_OFF = 'Memory is turned off in your settings.';
const DELETE_FAILED = 'Could not delete every memory. Try again.';
const DICTATION_FAILED_TITLE = "Didn't catch that";
const DICTATION_FAILED_BODY = "Audio isn't saved, so say it again.";
const DICTATION_UNAVAILABLE_TITLE = 'Voice input unavailable';

type Note = { text: string; tone: 'status' | 'error' };

const CHANGE_LABEL = { added: 'Added', updated: 'Updated', removed: 'Removed' } as const;

function changeSummary(
  changes: ReadonlyArray<{ action: keyof typeof CHANGE_LABEL; content: string }>,
): string {
  const [first] = changes;
  if (!first) return PROJECT_MEMORY_NOTHING_CHANGED;
  const more = changes.length > 1 ? ` and ${changes.length - 1} more` : '';
  return `${CHANGE_LABEL[first.action]}: ${first.content}${more}`;
}

function replyOrSummary(
  reply: string,
  changes: ReadonlyArray<{ action: keyof typeof CHANGE_LABEL; content: string }>,
): string {
  return reply && reply !== PROJECT_MEMORY_NOTHING_CHANGED ? reply : changeSummary(changes);
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'AbortError';
}

function editFailure(error: unknown): string {
  if (isAbortError(error)) return PROJECT_MEMORY_UNKNOWN_OUTCOME;
  if (error instanceof ProjectMemoryEditUnreadableError) return PROJECT_MEMORY_UNREADABLE;
  if (error instanceof ApiHttpError && error.status >= 500) return PROJECT_MEMORY_SERVER_FAILED;
  if (error instanceof ApiHttpError && error.status !== 404) {
    return toUserMessage(error, PROJECT_MEMORY_UNREACHABLE);
  }
  return PROJECT_MEMORY_UNREACHABLE;
}

function announceNote(note: Note): void {
  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(note.text);
}

function confirmRemovals(removals: readonly ProjectMemoryRemovalCandidate[]): Promise<boolean> {
  const single = removals.length === 1;
  const quoted = removals.map((removal) => `“${removal.content}”`).join(', ');
  return new Promise((resolve) => {
    Alert.alert(
      single ? 'Delete this project memory?' : `Delete ${removals.length} project memories?`,
      single
        ? `Chats in this project stop using ${quoted}. It cannot be restored and would have to be added again.`
        : `Chats in this project stop using ${quoted}. They cannot be restored and would have to be added again.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: single ? 'Delete memory' : 'Delete memories',
          style: 'destructive',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

async function deleteRemovals(
  removals: readonly ProjectMemoryRemovalCandidate[],
): Promise<{ deleted: ProjectMemoryRemovalCandidate[]; error: unknown }> {
  const deleted: ProjectMemoryRemovalCandidate[] = [];
  for (const removal of removals) {
    try {
      await deleteProjectMemory(removal.id);
      deleted.push(removal);
    } catch (error) {
      return { deleted, error };
    }
  }
  return { deleted, error: null };
}

export function ProjectMemoryEditComposer({
  projectId,
  maxLength,
  memoryOff,
}: {
  projectId: string;
  maxLength: number;
  memoryOff: boolean;
}) {
  const colors = useThemeColors();
  const voiceAllowed = useCapability('canUseVoice');
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const latestText = useRef(text);
  latestText.current = text;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const updateText = useCallback((value: string) => {
    latestText.current = value;
    setText(value);
  }, []);

  const handleTranscription = useCallback(
    (transcript: string) => {
      const cleaned = cleanupVoiceDictation(transcript);
      if (!cleaned) {
        Alert.alert(DICTATION_FAILED_TITLE, DICTATION_FAILED_BODY);
        return;
      }
      const current = latestText.current;
      updateText((current.trim() ? `${current} ${cleaned}` : cleaned).slice(0, maxLength));
    },
    [maxLength, updateText],
  );

  const handleVoiceError = useCallback((message: string, permissionDenied?: boolean) => {
    if (permissionDenied) showVoicePermissionAlert(message);
    else Alert.alert(DICTATION_UNAVAILABLE_TITLE, message);
  }, []);

  const handleVoiceFailure = useCallback(() => {
    Alert.alert(DICTATION_FAILED_TITLE, DICTATION_FAILED_BODY);
  }, []);

  const send = useCallback(async () => {
    const message = latestText.current.trim();
    if (!message || running) return;
    setRunning(true);
    setNote(null);
    let result: ProjectMemoryEditResult;
    try {
      result = await editProjectMemory({ projectId, message });
    } catch (error) {
      if (mounted.current) {
        const failure: Note = { text: editFailure(error), tone: 'error' };
        setNote(failure);
        announceNote(failure);
        setRunning(false);
      }
      return;
    }
    if (!mounted.current) return;

    const changes: Array<{ action: keyof typeof CHANGE_LABEL; content: string }> = [
      ...result.changed,
    ];
    let next: Note;
    if (result.removals.length > 0 && (await confirmRemovals(result.removals))) {
      const { deleted, error } = await deleteRemovals(result.removals);
      changes.push(...deleted.map((removal) => ({ action: 'removed' as const, ...removal })));
      next = error
        ? { text: toUserMessage(error, DELETE_FAILED), tone: 'error' }
        : { text: replyOrSummary(result.reply, changes), tone: 'status' };
    } else {
      next =
        result.removals.length > 0 || changes.length === 0
          ? { text: changeSummary(changes), tone: 'status' }
          : { text: replyOrSummary(result.reply, changes), tone: 'status' };
    }
    if (!mounted.current) return;
    if (changes.length > 0) updateText('');
    setNote(next);
    announceNote(next);
    setRunning(false);
  }, [projectId, running, updateText]);

  if (memoryOff) {
    return (
      <Text
        testID="project-memory-edit-off"
        style={{
          color: colors.textSecondary,
          fontSize: typeScale.footnote,
          paddingHorizontal: 16,
          paddingTop: 12,
        }}
      >
        {PROJECT_MEMORY_OFF}
      </Text>
    );
  }

  const empty = text.trim().length === 0;

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
      {note ? (
        <Text
          testID="project-memory-edit-note"
          accessibilityRole={note.tone === 'error' ? 'alert' : 'text'}
          accessibilityLiveRegion="polite"
          style={{
            color: note.tone === 'error' ? colors.agentError : colors.textSecondary,
            fontSize: typeScale.footnote,
          }}
        >
          {note.text}
        </Text>
      ) : null}
      <View
        testID="project-memory-edit-composer"
        style={{
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 8,
          borderRadius: radii['3xl'],
          borderWidth: 1,
          borderColor: colors.composerBorder,
          backgroundColor: colors.inputSurface,
          paddingLeft: 16,
          paddingRight: 10,
          paddingVertical: 8,
        }}
      >
        <TextInput
          testID="project-memory-edit-input"
          value={text}
          onChangeText={(value) => {
            updateText(value);
            if (note?.tone === 'error') setNote(null);
          }}
          placeholder={PROJECT_MEMORY_EDIT_PLACEHOLDER}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={PROJECT_MEMORY_EDIT_PLACEHOLDER}
          editable={!running}
          multiline
          maxLength={maxLength}
          style={{
            flex: 1,
            maxHeight: 140,
            paddingVertical: 6,
            color: colors.textPrimary,
            fontSize: typeScale.callout,
            lineHeight: 22,
            textAlignVertical: 'top',
          }}
        />
        {voiceAllowed ? (
          <View style={{ paddingBottom: 1 }}>
            <VoiceInputButton
              onTranscription={handleTranscription}
              onError={handleVoiceError}
              onFailure={handleVoiceFailure}
              disabled={running}
            />
          </View>
        ) : null}
        <View style={{ paddingBottom: 2 }}>
          {running ? (
            <View
              testID="project-memory-edit-running"
              accessible
              accessibilityRole="button"
              accessibilityLabel="Changing memory"
              accessibilityState={{ disabled: true, busy: true }}
              style={{
                width: COMPOSER_CONTROL_SIZE,
                height: COMPOSER_CONTROL_SIZE,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: COMPOSER_ACTION_CIRCLE_SIZE,
                  height: COMPOSER_ACTION_CIRCLE_SIZE,
                  borderRadius: radii.full,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.neutralSurface,
                }}
              >
                <LoadingIndicator accessible={false} />
              </View>
            </View>
          ) : (
            <SendButton
              state="idle"
              disabled={empty}
              onPress={() => void send()}
              accessibilityLabel="Send"
            />
          )}
        </View>
      </View>
    </View>
  );
}
