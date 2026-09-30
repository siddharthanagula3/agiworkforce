import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, TextInput, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import {
  Check,
  ChevronRight,
  FileEdit,
  FilePlus,
  FlaskConical,
  Send,
  ShieldAlert,
  Square,
  X,
} from 'lucide-react-native';
import {
  REMOTE_CODE_LIMITS,
  managedUsageBucketLabel,
  type RemoteCodeToolRecord,
} from '@agiworkforce/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/src/features/auth/store';
import { useCloudUsageStore } from '@/src/features/settings/cloud-usage/store';
import { useThemeColors } from '@/src/ui/theme';
import {
  answerCodeApproval,
  attachCodeSession,
  detachCodeSession,
  interruptCodeTurn,
  requestCodeTranscript,
  steerCodeSession,
} from '../remote-code/service';
import { remoteCodeThreadKey, useRemoteCodeStore } from '../remote-code/store';
import { codeSessionStatusColor, codeSessionStatusLabel } from './CodeSessionsCard';

interface CodeSessionViewProps {
  rootId: string;
  threadId: string;
  /**
   * The approval a notification sent the reader here for. It is shown first
   * and announced, so the one decision they were asked for is not somewhere
   * down a list of everything else this session is waiting on.
   */
  focusApprovalId?: string;
}

function SectionTitle({ children }: { children: string }) {
  return <Text className="mb-2 text-xs uppercase tracking-wider text-white/40">{children}</Text>;
}

const TOOL_STATE_LABELS: Record<RemoteCodeToolRecord['state'], string> = {
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
};

function ToolRow({ tool }: { tool: RemoteCodeToolRecord }) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const failed = tool.state === 'failed';

  return (
    <View>
      <PressableBox
        onPress={() => setExpanded((open) => !open)}
        disabled={!tool.output}
        accessibilityRole="button"
        accessibilityState={{ expanded, disabled: !tool.output }}
        accessibilityLabel={`${TOOL_STATE_LABELS[tool.state]}: ${tool.summary}`}
        style={{ minHeight: 44 }}
        className="flex-row items-center gap-2"
      >
        <Text
          className="text-xs"
          style={{ width: 52, color: failed ? colors.agentError : colors.textMuted }}
        >
          {TOOL_STATE_LABELS[tool.state]}
        </Text>
        <Text variant="mono" className="flex-1 text-xs text-white" numberOfLines={1}>
          {tool.summary || tool.name}
        </Text>
        {tool.output ? (
          <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
            <ChevronRight size={12} color={colors.textMuted} />
          </View>
        ) : null}
      </PressableBox>
      {expanded && tool.output ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Text
            variant="mono"
            selectable
            className="text-xs"
            style={{ color: failed ? colors.agentError : colors.textSecondary }}
          >
            {tool.output}
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

function PlanUsageLine() {
  const colors = useThemeColors();
  const router = useRouter();
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const ownerId = useCloudUsageStore((state) => state.ownerId);
  const cached = useCloudUsageStore((state) => state.snapshot);
  const refresh = useCloudUsageStore((state) => state.refresh);
  const snapshot = clerkUserId && ownerId === clerkUserId ? cached : null;

  useEffect(() => {
    if (clerkUserId) void refresh();
  }, [clerkUserId, refresh]);

  if (!snapshot) return null;
  const parts = [
    snapshot.sessionResetAt !== null
      ? `${managedUsageBucketLabel('session')} ${Math.round(snapshot.sessionUsagePercentage)}%`
      : null,
    snapshot.weeklyResetAt !== null
      ? `${managedUsageBucketLabel('weekly')} ${Math.round(snapshot.weeklyUsagePercentage)}%`
      : null,
    `${managedUsageBucketLabel('period')} ${Math.round(snapshot.usagePercentage)}%`,
  ].filter((part): part is string => part !== null);

  return (
    <PressableBox
      onPress={() =>
        router.push('/(app)/settings/cloud-usage' as Parameters<typeof router.push>[0])
      }
      accessibilityRole="link"
      accessibilityLabel={`Plan usage: ${parts.join(', ')}. See detailed usage`}
      style={{ minHeight: 32, justifyContent: 'center' }}
    >
      <Text className="text-xs" style={{ color: colors.textMuted }} numberOfLines={1}>
        {`Plan usage · ${parts.join(' · ')}`}
      </Text>
    </PressableBox>
  );
}

export function CodeSessionView({ rootId, threadId, focusApprovalId }: CodeSessionViewProps) {
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

  const transcriptLoaded = thread?.transcript != null;
  const syncedAt = thread?.syncedAt;
  useEffect(() => {
    if (transcriptLoaded && syncedAt) void requestCodeTranscript(rootId, threadId, null);
  }, [rootId, syncedAt, threadId, transcriptLoaded]);

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
  const orderedApprovals =
    focusApprovalId === undefined
      ? thread.pendingApprovals
      : [
          ...thread.pendingApprovals.filter((a) => a.requestId === focusApprovalId),
          ...thread.pendingApprovals.filter((a) => a.requestId !== focusApprovalId),
        ];
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

      <PlanUsageLine />

      {thread.hostMessage ? (
        <Text className="text-xs" style={{ color: colors.agentError }} accessibilityRole="alert">
          {thread.hostMessage}
        </Text>
      ) : null}

      {orderedApprovals.map((approval) => (
        <Card key={approval.requestId} variant="elevated">
          <View className="flex-row items-center gap-2 mb-2">
            <ShieldAlert size={15} color={colors.agentWarning} />
            <Text
              className="flex-1 text-sm font-medium text-white"
              accessibilityRole={approval.requestId === focusApprovalId ? 'alert' : undefined}
            >
              {approval.summary}
            </Text>
          </View>
          {approval.detail ? (
            <Text variant="mono" className="mb-3 text-xs text-white/60">
              {approval.detail}
            </Text>
          ) : null}
          <View className="flex-row gap-2">
            <PressableBox
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
            </PressableBox>
            <PressableBox
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
            </PressableBox>
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
              <PressableBox
                onPress={() => void interruptCodeTurn(rootId, threadId, thread.activeTurnId ?? '')}
                className="flex-row items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-2 active:bg-red-500/20"
                accessibilityRole="button"
                accessibilityLabel="Stop the current turn"
              >
                <Square size={12} color={colors.agentError} />
                <Text className="text-xs font-semibold" style={{ color: colors.agentError }}>
                  Stop
                </Text>
              </PressableBox>
            ) : null}
            <PressableBox
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
            </PressableBox>
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

      {running && thread.partialResponse ? (
        <Card variant="elevated">
          <SectionTitle>Working</SectionTitle>
          <Text className="text-sm text-white">{thread.partialResponse}</Text>
        </Card>
      ) : null}

      {thread.tools.length > 0 ? (
        <Card variant="elevated">
          <SectionTitle>Commands and tools</SectionTitle>
          {thread.tools.map((tool) => (
            <ToolRow key={tool.toolCallId} tool={tool} />
          ))}
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
                <Text className="mt-1 text-xs text-white/50">
                  {[
                    run.passed !== null ? `${run.passed} passed` : null,
                    run.failed !== null ? `${run.failed} failed` : null,
                    run.skipped !== null ? `${run.skipped} skipped` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'No counts in the output'}
                </Text>
                {run.status === 'failed' && run.output ? (
                  <Text variant="mono" className="mt-1 text-xs text-white/60">
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
              <Text className="text-xs text-white/40">New file</Text>
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
                  className="text-xs"
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
            <Text className="mt-2 text-xs text-white/40">
              The diff is longer than a phone view. Open it on Desktop to read the rest.
            </Text>
          ) : null}
        </Card>
      ))}

      {thread.messages.length > 0 || thread.transcript ? (
        <Card variant="elevated">
          <SectionTitle>Conversation</SectionTitle>
          {thread.transcript?.hasEarlier || !thread.transcript ? (
            <PressableBox
              onPress={() =>
                void requestCodeTranscript(
                  rootId,
                  threadId,
                  thread.transcript?.messages[0]?.index ?? null,
                )
              }
              accessibilityRole="button"
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Text className="text-xs font-semibold" style={{ color: colors.teal }}>
                {thread.transcript ? 'Load earlier messages' : 'Show the full conversation'}
              </Text>
            </PressableBox>
          ) : null}
          <View className="gap-2">
            {(thread.transcript?.messages ?? thread.messages).map((message, index) => (
              <View key={'index' in message ? `m${message.index}` : index}>
                <Text className="text-xs text-white/40">
                  {message.role === 'user' ? 'You' : 'AGI'}
                </Text>
                <Text selectable className="text-sm text-white">
                  {message.text}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}
