import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  MAX_CLOUD_AGENT_RUN_STEER_LENGTH,
  isCloudAgentRunSteerable,
  type CloudAgentRun,
  type CloudAgentRunSteer,
} from '@agiworkforce/cloud-contracts';
import { TERMINAL_AGENT_TASK_STATES } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { handOffConversationSend } from '@/src/features/chat/conversationSendHandoff';
import { describeCloudRunSteerError, steerCloudRun, withdrawCloudRunSteer } from '../cloudRunSteer';

export function CloudRunSteerSection({ run }: { run: CloudAgentRun }) {
  const colors = useThemeColors();
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const queued = run.pendingSteers ?? [];
  const steerable = isCloudAgentRunSteerable(run);
  const finished = TERMINAL_AGENT_TASK_STATES.has(run.workState ?? run.state);
  const conversationId = run.conversationId;
  if (!steerable && queued.length === 0) return null;

  const sendAsNewMessage = async (steer: CloudAgentRunSteer) => {
    if (!conversationId || resendingId) return;
    setResendingId(steer.id);
    setError(null);
    try {
      await withdrawCloudRunSteer(run.id, steer.id);
      handOffConversationSend(conversationId, steer.text);
      router.push(`/chat/${conversationId}`);
    } catch (err) {
      setError(describeCloudRunSteerError(err));
    } finally {
      setResendingId(null);
    }
  };

  const send = async () => {
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    setSent(false);
    try {
      await steerCloudRun(run.id, message);
      setDraft('');
      setSent(true);
    } catch (err) {
      setError(describeCloudRunSteerError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: typeScale.caption,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        Message the agent
      </Text>
      {queued.map((steer) => (
        <View
          key={steer.id}
          style={{
            borderRadius: 12,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceElevated,
            padding: 10,
            gap: 4,
          }}
        >
          <Text
            selectable
            style={{ color: colors.textPrimary, fontSize: typeScale.subhead, lineHeight: 20 }}
          >
            {steer.text}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
            {finished
              ? 'Not read before the task finished'
              : 'Queued. The agent reads it at its next step.'}
          </Text>
          {finished && conversationId ? (
            <Button
              title="Send as new message"
              variant="secondary"
              accessibilityLabel="Send this message as a new message in the chat"
              loading={resendingId === steer.id}
              disabled={resendingId !== null}
              onPress={() => void sendAsNewMessage(steer)}
            />
          ) : null}
        </View>
      ))}
      {!steerable && error ? (
        <Text
          accessibilityRole="alert"
          selectable
          style={{ color: colors.agentError, fontSize: typeScale.footnote, lineHeight: 19 }}
        >
          {error}
        </Text>
      ) : null}
      {steerable ? (
        <>
          <TextInput
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              setSent(false);
            }}
            multiline
            editable={!sending}
            maxLength={MAX_CLOUD_AGENT_RUN_STEER_LENGTH}
            placeholder="Add instructions or change course"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Message for the agent"
            style={{
              backgroundColor: colors.surfaceElevated,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 14,
              borderCurve: 'continuous',
              padding: 12,
              color: colors.textPrimary,
              fontSize: typeScale.body,
              minHeight: 72,
              textAlignVertical: 'top',
            }}
          />
          <Text style={{ color: colors.textMuted, fontSize: typeScale.caption, lineHeight: 17 }}>
            {sent
              ? 'Sent. The agent reads your message at its next step.'
              : 'The agent reads your message at its next step and keeps its progress.'}
          </Text>
          {error ? (
            <Text
              accessibilityRole="alert"
              selectable
              style={{ color: colors.agentError, fontSize: typeScale.footnote, lineHeight: 19 }}
            >
              {error}
            </Text>
          ) : null}
          <Button
            title="Send to the agent"
            variant="secondary"
            accessibilityLabel="Send this message to the agent"
            loading={sending}
            disabled={sending || draft.trim().length === 0}
            onPress={() => void send()}
          />
        </>
      ) : null}
    </View>
  );
}
