import { useState } from 'react';
import { TextInput, View } from 'react-native';
import {
  MAX_CLOUD_AGENT_RUN_STEER_LENGTH,
  isCloudAgentRunSteerable,
  type CloudAgentRun,
} from '@agiworkforce/cloud-contracts';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useThemeColors } from '@/src/ui/theme';
import { describeCloudRunSteerError, steerCloudRun } from '../cloudRunSteer';

export function CloudRunSteerSection({ run }: { run: CloudAgentRun }) {
  const colors = useThemeColors();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const queued = run.pendingSteers ?? [];
  const steerable = isCloudAgentRunSteerable(run);
  if (!steerable && queued.length === 0) return null;

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
          fontSize: 12,
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
          <Text selectable style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 20 }}>
            {steer.text}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {steerable
              ? 'Queued. The agent reads it at its next step.'
              : 'The task stopped before the agent read this.'}
          </Text>
        </View>
      ))}
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
              fontSize: 15,
              minHeight: 72,
              textAlignVertical: 'top',
            }}
          />
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>
            {sent
              ? 'Sent. The agent reads your message at its next step.'
              : 'The agent reads your message at its next step and keeps its progress.'}
          </Text>
          {error ? (
            <Text
              accessibilityRole="alert"
              selectable
              style={{ color: colors.agentError, fontSize: 13, lineHeight: 19 }}
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
