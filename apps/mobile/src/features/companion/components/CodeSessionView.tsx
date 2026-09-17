import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import {
  Check,
  FileEdit,
  FilePlus,
  FlaskConical,
  Send,
  ShieldAlert,
  Square,
  X,
} from 'lucide-react-native';
import { REMOTE_CODE_LIMITS } from '@agiworkforce/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import {
  answerCodeApproval,
  attachCodeSession,
  detachCodeSession,
  interruptCodeTurn,
  steerCodeSession,
} from '../remote-code/service';
import { remoteCodeThreadKey, useRemoteCodeStore } from '../remote-code/store';
import { codeSessionStatusColor, codeSessionStatusLabel } from './CodeSessionsCard';

interface CodeSessionViewProps {
  rootId: string;
  threadId: string;
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text className="mb-2 text-[10px] uppercase tracking-wider text-white/40">{children}</Text>
  );
}

export function CodeSessionView({ rootId, threadId }: CodeSessionViewProps) {
  const colors = useThemeColors();
  const thread = useRemoteCodeStore(
    (state) => state.threads[remoteCodeThreadKey(rootId, threadId)] ?? null,
  );
  const [guidance, setGuidance] = useState('');
  const [interruptFirst, setInterruptFirst] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void attachCodeSession(rootId, threadId);
    return () => {
      void detachCodeSession(rootId, threadId);
    };
  }, [rootId, threadId]);

  if (!thread) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center text-sm text-white/50">Opening the session on Desktop…</Text>
      </View>
    );
  }

  const running = thread.activeTurnId !== null;
  const trimmed = guidance.trim();
  const canSend =
    !sending && trimmed.length > 0 && trimmed.length <= REMOTE_CODE_LIMITS.guidanceLength;
  const generated = thread.fileChanges.filter((change) => change.kind === 'created');
  const modified = thread.fileChanges.filter((change) => change.kind === 'modified');

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setSendError(null);
    const sent = await steerCodeSession(rootId, threadId, trimmed, running && interruptFirst);
    if (sent) {
      setGuidance('');
      setInterruptFirst(false);
    } else {
      setSendError('Guidance was not sent. Check the Desktop connection and try again.');
    }
    setSending(false);
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-base font-medium text-white" numberOfLines={2}>
          {thread.title}
        </Text>
        <Badge
          label={codeSessionStatusLabel(thread.status)}
          color={codeSessionStatusColor(thread.status)}
        />
      </View>

      {thread.hostMessage ? (
        <Text className="text-xs" style={{ color: colors.agentError }} accessibilityRole="alert">
          {thread.hostMessage}
        </Text>
      ) : null}

      {thread.pendingApprovals.map((approval) => (
        <Card key={approval.requestId} variant="elevated">
          <View className="flex-row items-center gap-2 mb-2">
            <ShieldAlert size={15} color={colors.agentWarning} />
            <Text className="flex-1 text-sm font-medium text-white">{approval.summary}</Text>
          </View>
          {approval.detail ? (
            <Text variant="mono" className="mb-3 text-xs text-white/60">
              {approval.detail}
            </Text>
          ) : null}
          <View className="flex-row gap-2">
            <Pressable
              onPress={() =>
                void answerCodeApproval(
                  rootId,
                  threadId,
                  approval.turnId,
                  approval.requestId,
                  false,
                )
              }
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-lg bg-red-500/10 py-2.5 active:bg-red-500/20"
              accessibilityRole="button"
              accessibilityLabel={`Deny ${approval.summary}`}
            >
              <X size={14} color={colors.agentError} />
              <Text className="text-xs font-semibold" style={{ color: colors.agentError }}>
                Deny
              </Text>
            </Pressable>
            <Pressable
              onPress={() =>
                void answerCodeApproval(rootId, threadId, approval.turnId, approval.requestId, true)
              }
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-lg py-2.5"
              style={({ pressed }) => ({
                backgroundColor: pressed ? colors.textPrimary : colors.teal,
              })}
              accessibilityRole="button"
              accessibilityLabel={`Approve ${approval.summary}`}
            >
              <Check size={14} color={colors.accentText} />
              <Text className="text-xs font-semibold" style={{ color: colors.accentText }}>
                Approve
              </Text>
            </Pressable>
          </View>
        </Card>
      ))}

      <Card variant="elevated">
        <SectionTitle>{running ? 'Steer this run' : 'Next turn'}</SectionTitle>
        <View className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <TextInput
            value={guidance}
            onChangeText={setGuidance}
            placeholder={
              running ? 'Guidance for the next turn' : 'What should this session do next?'
            }
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={REMOTE_CODE_LIMITS.guidanceLength}
            className="min-h-[64px] text-sm text-white"
            style={{ textAlignVertical: 'top' }}
            accessibilityLabel="Guidance for this session"
            editable={!sending}
          />
          {running ? (
            <View className="flex-row items-center justify-between pt-2">
              <Text className="flex-1 text-xs text-white/50">Stop the current turn first</Text>
              <Switch
                value={interruptFirst}
                onValueChange={setInterruptFirst}
                accessibilityLabel="Stop the current turn before sending guidance"
              />
            </View>
          ) : null}
          <View className="flex-row items-center justify-end gap-2 pt-2">
            {running && thread.activeTurnId ? (
              <Pressable
                onPress={() => void interruptCodeTurn(rootId, threadId, thread.activeTurnId ?? '')}
                className="flex-row items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 active:bg-red-500/20"
                accessibilityRole="button"
                accessibilityLabel="Stop the current turn"
              >
                <Square size={12} color={colors.agentError} />
                <Text className="text-xs font-semibold" style={{ color: colors.agentError }}>
                  Stop
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => void handleSend()}
              disabled={!canSend}
              className={`flex-row items-center gap-1.5 rounded-lg px-3 py-2 ${canSend ? '' : 'bg-white/10'}`}
              style={
                canSend
                  ? ({ pressed }) => ({
                      backgroundColor: pressed ? colors.textPrimary : colors.teal,
                    })
                  : undefined
              }
              accessibilityRole="button"
              accessibilityLabel="Send guidance"
            >
              <Send size={13} color={canSend ? colors.accentText : colors.textMuted} />
              <Text
                className="text-xs font-semibold"
                style={{ color: canSend ? colors.accentText : colors.textMuted }}
              >
                {sending ? 'Sending…' : 'Send'}
              </Text>
            </Pressable>
          </View>
          {sendError ? (
            <Text
              className="mt-2 text-xs"
              style={{ color: colors.agentError }}
              accessibilityRole="alert"
            >
              {sendError}
            </Text>
          ) : null}
        </View>
        {thread.queuedGuidance.length > 0 ? (
          <Text className="mt-2 text-xs text-white/50">
            {`Queued for the next turn: ${thread.queuedGuidance.join(' · ')}`}
          </Text>
        ) : null}
      </Card>

      {running && (thread.partialResponse || thread.tools.length > 0) ? (
        <Card variant="elevated">
          <SectionTitle>Working</SectionTitle>
          {thread.tools.map((tool) => (
            <Text key={tool.toolCallId} className="text-xs text-white/60" numberOfLines={1}>
              {`${tool.state === 'running' ? 'Running' : tool.state === 'failed' ? 'Failed' : 'Done'} · ${tool.summary}`}
            </Text>
          ))}
          {thread.partialResponse ? (
            <Text className="mt-2 text-sm text-white">{thread.partialResponse}</Text>
          ) : null}
        </Card>
      ) : null}

      {thread.testRuns.length > 0 ? (
        <Card variant="elevated">
          <SectionTitle>Test results</SectionTitle>
          <View className="gap-3">
            {[...thread.testRuns].reverse().map((run) => (
              <View key={run.toolCallId}>
                <View className="flex-row items-center gap-2">
                  <FlaskConical
                    size={13}
                    color={run.status === 'passed' ? colors.agentSuccess : colors.agentError}
                  />
                  <Text variant="mono" className="flex-1 text-xs text-white" numberOfLines={1}>
                    {run.command}
                  </Text>
                  <Badge
                    label={run.status === 'passed' ? 'Passed' : 'Failed'}
                    color={run.status === 'passed' ? 'green' : 'red'}
                  />
                </View>
                <Text className="mt-1 text-[10px] text-white/50">
                  {[
                    run.passed !== null ? `${run.passed} passed` : null,
                    run.failed !== null ? `${run.failed} failed` : null,
                    run.skipped !== null ? `${run.skipped} skipped` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'No counts in the output'}
                </Text>
                {run.status === 'failed' && run.output ? (
                  <Text variant="mono" className="mt-1 text-[10px] text-white/60">
                    {run.output}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {thread.fileChanges.length > 0 ? (
        <Card variant="elevated">
          <SectionTitle>Changes</SectionTitle>
          {generated.map((change) => (
            <View key={`created:${change.path}`} className="flex-row items-center gap-2 py-0.5">
              <FilePlus size={12} color={colors.agentSuccess} />
              <Text variant="mono" className="flex-1 text-xs text-white" numberOfLines={1}>
                {change.path}
              </Text>
              <Text className="text-[10px] text-white/40">New file</Text>
            </View>
          ))}
          {modified.map((change) => (
            <View key={`modified:${change.path}`} className="flex-row items-center gap-2 py-0.5">
              <FileEdit size={12} color={colors.agentActive} />
              <Text variant="mono" className="flex-1 text-xs text-white" numberOfLines={1}>
                {change.path}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {thread.diffs.map((diff) => (
        <Card key={`diff:${diff.path}`} variant="elevated">
          <SectionTitle>{`Diff · ${diff.path}`}</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              {diff.patch.split('\n').map((line, index) => (
                <Text
                  key={index}
                  variant="mono"
                  className="text-[11px]"
                  style={{
                    color: line.startsWith('+')
                      ? colors.agentSuccess
                      : line.startsWith('-')
                        ? colors.agentError
                        : colors.textSecondary,
                  }}
                >
                  {line || ' '}
                </Text>
              ))}
            </View>
          </ScrollView>
          {diff.truncated ? (
            <Text className="mt-2 text-[10px] text-white/40">
              The diff is longer than a phone view. Open it on Desktop to read the rest.
            </Text>
          ) : null}
        </Card>
      ))}

      {thread.messages.length > 0 ? (
        <Card variant="elevated">
          <SectionTitle>Conversation</SectionTitle>
          <View className="gap-2">
            {thread.messages.map((message, index) => (
              <View key={index}>
                <Text className="text-[10px] text-white/40">
                  {message.role === 'user' ? 'You' : 'AGI'}
                </Text>
                <Text className="text-sm text-white">{message.text}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}
