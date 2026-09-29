import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { useRouter } from 'expo-router';
import { Check, ChevronRight, Code2, Play, RefreshCw } from 'lucide-react-native';
import { REMOTE_CODE_LIMITS, type RemoteCodeSessionStatus } from '@agiworkforce/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { listCodeSessions, startCodeSession } from '../remote-code/service';
import { forgetCodeSessionStart, useRemoteCodeStore } from '../remote-code/store';

function codeSessionHref(rootId: string, threadId: string) {
  return `/(app)/companion/code/${encodeURIComponent(threadId)}?rootId=${encodeURIComponent(rootId)}`;
}

function NewCodeSession() {
  const colors = useThemeColors();
  const router = useRouter();
  const roots = useRemoteCodeStore((state) => state.roots);
  const starts = useRemoteCodeStore((state) => state.starts);
  const [rootId, setRootId] = useState<string | null>(null);
  const [task, setTask] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const available = roots.filter((root) => root.available);
  const chosen = available.find((root) => root.rootId === rootId) ?? available[0] ?? null;
  const start = pending ? starts[pending] : undefined;
  const trimmed = task.trim();
  const canStart =
    chosen !== null &&
    pending === null &&
    trimmed.length > 0 &&
    trimmed.length <= REMOTE_CODE_LIMITS.taskLength;

  useEffect(() => {
    if (!pending || !start) return;
    if (start.threadId) {
      forgetCodeSessionStart(pending);
      setPending(null);
      setTask('');
      router.push(
        codeSessionHref(start.rootId, start.threadId) as Parameters<typeof router.push>[0],
      );
    } else if (start.error) {
      forgetCodeSessionStart(pending);
      setPending(null);
      setError(start.error);
    }
  }, [pending, router, start]);

  if (roots.length === 0) return null;

  const handleStart = async () => {
    if (!canStart || !chosen) return;
    setError(null);
    const id = await startCodeSession(chosen.rootId, trimmed);
    if (id) setPending(id);
    else setError('The session was not started. Check the Desktop connection and try again.');
  };

  return (
    <View className="mt-3 gap-2 border-t border-white/8 pt-3">
      <Text className="text-xs font-medium text-white">New session on this computer</Text>
      {available.length === 0 ? (
        <Text className="text-xs text-white/50">
          No approved folder can run a session right now.
        </Text>
      ) : (
        <View accessibilityRole="radiogroup" className="gap-1">
          {available.map((root) => {
            const selected = root.rootId === chosen?.rootId;
            return (
              <PressableBox
                key={root.rootId}
                onPress={() => setRootId(root.rootId)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={root.branch ? `${root.name}, ${root.branch}` : root.name}
                style={{ minHeight: 44 }}
                className="flex-row items-center gap-2 rounded-lg px-2"
              >
                <View className="flex-1">
                  <Text className="text-xs text-white" numberOfLines={1}>
                    {root.name}
                  </Text>
                  {root.branch ? (
                    <Text className="text-xs text-white/45" numberOfLines={1}>
                      {root.branch}
                    </Text>
                  ) : null}
                </View>
                {selected ? <Check size={14} color={colors.textPrimary} /> : null}
              </PressableBox>
            );
          })}
        </View>
      )}
      <View className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
        <TextInput
          value={task}
          onChangeText={setTask}
          placeholder="Describe a task for AGI Code"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={REMOTE_CODE_LIMITS.taskLength}
          editable={pending === null}
          className="min-h-[64px] text-sm text-white"
          style={{ textAlignVertical: 'top' }}
          accessibilityLabel="Task for a new AGI Code session"
        />
      </View>
      <PressableBox
        onPress={() => void handleStart()}
        disabled={!canStart}
        accessibilityRole="button"
        accessibilityLabel="Start the session"
        accessibilityState={{ disabled: !canStart, busy: pending !== null }}
        style={({ pressed }) => ({
          minHeight: 44,
          backgroundColor: canStart
            ? pressed
              ? colors.textPrimary
              : colors.teal
            : colors.surfaceHover,
        })}
        className="flex-row items-center justify-center gap-1.5 rounded-lg px-3"
      >
        <Play size={13} color={canStart ? colors.accentText : colors.textMuted} />
        <Text
          className="text-xs font-semibold"
          style={{ color: canStart ? colors.accentText : colors.textMuted }}
        >
          {pending ? 'Starting…' : 'Start session'}
        </Text>
      </PressableBox>
      {error ? (
        <Text className="text-xs" style={{ color: colors.agentError }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const CLOUD_SESSION_LABEL = 'Cloud, read-only';

const REMOTE_SESSION_ORIGIN_LABELS = {
  cli: 'CLI',
  vscode: 'VS Code',
  desktop: 'Desktop',
} as const;

const STATUS_LABELS: Record<RemoteCodeSessionStatus, string> = {
  idle: 'Idle',
  running: 'Running',
  awaiting_approval: 'Needs approval',
  failed: 'Failed',
  unknown: 'Unknown',
};

const STATUS_COLORS: Record<RemoteCodeSessionStatus, 'gray' | 'blue' | 'yellow' | 'red'> = {
  idle: 'gray',
  running: 'blue',
  awaiting_approval: 'yellow',
  failed: 'red',
  unknown: 'gray',
};

export function codeSessionStatusLabel(status: RemoteCodeSessionStatus): string {
  return STATUS_LABELS[status];
}

export function codeSessionStatusColor(
  status: RemoteCodeSessionStatus,
): 'gray' | 'blue' | 'yellow' | 'red' {
  return STATUS_COLORS[status];
}

export function CodeSessionsCard({ canStart }: { canStart: boolean }) {
  const colors = useThemeColors();
  const router = useRouter();
  const sessions = useRemoteCodeStore((state) => state.sessions);
  const unavailable = useRemoteCodeStore((state) => state.unavailable);
  const syncedAt = useRemoteCodeStore((state) => state.sessionsSyncedAt);

  useEffect(() => {
    void listCodeSessions();
  }, []);

  return (
    <View className="px-4 mb-3">
      <Card variant="elevated">
        <View className="flex-row items-center gap-2 mb-2">
          <Code2 size={15} color={colors.teal} />
          <Text className="flex-1 text-sm font-medium text-white">AGI Code sessions</Text>
          <PressableBox
            onPress={() => void listCodeSessions()}
            className="p-2 rounded-lg active:bg-white/5"
            accessibilityRole="button"
            accessibilityLabel="Refresh AGI Code sessions"
          >
            <RefreshCw size={14} color={colors.textSecondary} />
          </PressableBox>
        </View>

        {syncedAt === null ? (
          <Text className="text-xs text-white/40">Asking Desktop for its sessions…</Text>
        ) : sessions.length === 0 ? (
          <Text className="text-xs text-white/40">
            {canStart
              ? 'No AGI Code sessions on this computer yet.'
              : 'No AGI Code sessions on this computer yet. Start one in the desktop app.'}
          </Text>
        ) : (
          <View className="gap-2">
            {sessions.map((session) => (
              <PressableBox
                key={`${session.rootId}:${session.threadId}`}
                onPress={() =>
                  router.push(
                    codeSessionHref(session.rootId, session.threadId) as Parameters<
                      typeof router.push
                    >[0],
                  )
                }
                className="flex-row items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 active:bg-white/5"
                accessibilityRole="button"
                accessibilityLabel={`Open ${session.title}`}
              >
                <View className="flex-1">
                  <Text className="text-xs font-medium text-white" numberOfLines={1}>
                    {session.title}
                  </Text>
                  <Text className="text-xs text-white/45" numberOfLines={1}>
                    {[
                      session.location === 'cloud' ? CLOUD_SESSION_LABEL : null,
                      session.origin ? REMOTE_SESSION_ORIGIN_LABELS[session.origin] : null,
                      session.folder,
                      session.branch,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Badge
                  label={STATUS_LABELS[session.status]}
                  color={STATUS_COLORS[session.status]}
                />
                <ChevronRight size={14} color={colors.textMuted} />
              </PressableBox>
            ))}
          </View>
        )}

        {unavailable.map((folder) => (
          <Text key={folder.folder} className="mt-2 text-xs text-white/40">
            {`${folder.folder}: ${folder.message}`}
          </Text>
        ))}

        {canStart ? <NewCodeSession /> : null}
      </Card>
    </View>
  );
}
