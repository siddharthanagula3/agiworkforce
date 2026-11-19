import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { useRouter } from 'expo-router';
import { Check, ChevronRight, Code2, Play } from 'lucide-react-native';
import { REMOTE_CODE_LIMITS, type RemoteCodeSessionStatus } from '@agiworkforce/types';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { CLOUD_CODE_SCREEN_TITLE } from '@/src/features/cloud-code/presentation';
import { useThemeColors } from '@/src/ui/theme';
import { listCodeSessions } from '../remote-code/service';
import { useRemoteCodeStore } from '../remote-code/store';
import { useCodeSessionStart } from '../remote-code/useCodeSessionStart';

export function codeSessionHref(rootId: string, threadId: string) {
  return `/(app)/companion/code/${encodeURIComponent(threadId)}?rootId=${encodeURIComponent(rootId)}`;
}

export function NewCodeSession({ onStarted }: { onStarted?: () => void }) {
  const colors = useThemeColors();
  const router = useRouter();
  const roots = useRemoteCodeStore((state) => state.roots);
  const [rootId, setRootId] = useState<string | null>(null);
  const [task, setTask] = useState('');
  const { starting, error, start } = useCodeSessionStart((startedRootId, threadId) => {
    setTask('');
    onStarted?.();
    router.push(codeSessionHref(startedRootId, threadId) as Parameters<typeof router.push>[0]);
  });
  const available = roots.filter((root) => root.available);
  const chosen = available.find((root) => root.rootId === rootId) ?? available[0] ?? null;
  const trimmed = task.trim();
  const canStart =
    chosen !== null &&
    !starting &&
    trimmed.length > 0 &&
    trimmed.length <= REMOTE_CODE_LIMITS.taskLength;

  if (roots.length === 0) return null;

  const handleStart = () => {
    if (canStart && chosen) void start(chosen.rootId, trimmed);
  };

  return (
    <View className="mt-3 gap-2 border-t border-white/8 pt-3">
      <Text className="text-sm font-medium text-white">New session on this computer</Text>
      {available.length === 0 ? (
        <Text className="text-sm text-white/50">
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
                  <Text className="text-sm text-white" numberOfLines={1}>
                    {root.name}
                  </Text>
                  {root.branch ? (
                    <Text className="text-sm text-white/45" numberOfLines={1}>
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
          editable={!starting}
          className="min-h-[64px] text-sm text-white"
          style={{ textAlignVertical: 'top' }}
          accessibilityLabel="Task for a new AGI Code session"
        />
      </View>
      <PressableBox
        onPress={handleStart}
        disabled={!canStart}
        accessibilityRole="button"
        accessibilityLabel="Start the session"
        accessibilityState={{ disabled: !canStart, busy: starting }}
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
          className="text-sm font-semibold"
          style={{ color: canStart ? colors.accentText : colors.textMuted }}
        >
          {starting ? 'Starting…' : 'Start session'}
        </Text>
      </PressableBox>
      {error ? (
        <Text className="text-sm" style={{ color: colors.agentError }} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export const CLOUD_SESSION_LABEL = 'Cloud, read-only';

export const REMOTE_SESSION_ORIGIN_LABELS = {
  cli: 'CLI',
  vscode: 'VS Code',
  desktop: 'Desktop',
} as const;

export const COMPUTER_SESSIONS_LINK_LABEL = `This computer's sessions are in ${CLOUD_CODE_SCREEN_TITLE}`;

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
  const unavailable = useRemoteCodeStore((state) => state.unavailable);

  useEffect(() => {
    void listCodeSessions();
  }, []);

  return (
    <View className="px-4 mb-3">
      <Card variant="elevated">
        <PressableBox
          onPress={() =>
            router.navigate('/(app)/cloud-code' as Parameters<typeof router.navigate>[0])
          }
          accessibilityRole="button"
          accessibilityLabel={COMPUTER_SESSIONS_LINK_LABEL}
          className="flex-row items-center gap-2 rounded-lg active:bg-white/5"
          style={{ minHeight: 44 }}
        >
          <Code2 size={15} color={colors.teal} />
          <Text className="flex-1 text-sm font-medium text-white" numberOfLines={2}>
            {COMPUTER_SESSIONS_LINK_LABEL}
          </Text>
          <ChevronRight size={14} color={colors.textMuted} />
        </PressableBox>

        {unavailable.map((folder) => (
          <Text key={folder.folder} className="mt-2 text-sm text-white/40">
            {`${folder.folder}: ${folder.message}`}
          </Text>
        ))}

        {canStart ? <NewCodeSession /> : null}
      </Card>
    </View>
  );
}
