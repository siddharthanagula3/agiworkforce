import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { MAX_CLOUD_AGENT_RUN_STEER_LENGTH } from '@agiworkforce/cloud-contracts';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { PressableBox } from '@/components/ui/pressable-box';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { describeCloudRunSteerError, steerCloudRun } from '@/src/features/tasks/cloudRunSteer';

export function RunSteerInput({ runId }: { runId: string }) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const send = async () => {
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    setSent(false);
    try {
      await steerCloudRun(runId, message);
      setDraft('');
      setSent(true);
    } catch (err) {
      setError(describeCloudRunSteerError(err));
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <PressableBox
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityHint="Sends guidance the agent reads at its next step, without stopping it"
        style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}
      >
        <Text
          style={{ color: colors.textSecondary, fontSize: typeScale.footnote, fontWeight: '600' }}
        >
          Message the agent
        </Text>
      </PressableBox>
    );
  }

  return (
    <View style={{ gap: 8, paddingVertical: 6 }}>
      <TextInput
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          setSent(false);
        }}
        multiline
        autoFocus
        editable={!sending}
        maxLength={MAX_CLOUD_AGENT_RUN_STEER_LENGTH}
        placeholder="Add instructions or change course"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Message for the agent"
        style={{
          backgroundColor: colors.surfaceElevated,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          padding: 10,
          color: colors.textPrimary,
          fontSize: typeScale.body,
          minHeight: 56,
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
    </View>
  );
}
