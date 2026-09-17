import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Code2, RefreshCw } from 'lucide-react-native';
import type { RemoteCodeSessionStatus } from '@agiworkforce/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { listCodeSessions } from '../remote-code/service';
import { useRemoteCodeStore } from '../remote-code/store';

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

export function CodeSessionsCard() {
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
          <Pressable
            onPress={() => void listCodeSessions()}
            className="p-2 rounded-lg active:bg-white/5"
            accessibilityRole="button"
            accessibilityLabel="Refresh AGI Code sessions"
          >
            <RefreshCw size={14} color={colors.textSecondary} />
          </Pressable>
        </View>

        {syncedAt === null ? (
          <Text className="text-xs text-white/40">Asking Desktop for its sessions…</Text>
        ) : sessions.length === 0 ? (
          <Text className="text-xs text-white/40">
            No AGI Code sessions on this computer yet. Start one in the desktop app.
          </Text>
        ) : (
          <View className="gap-2">
            {sessions.map((session) => (
              <Pressable
                key={`${session.rootId}:${session.threadId}`}
                onPress={() =>
                  router.push(
                    `/(app)/companion/code/${encodeURIComponent(session.threadId)}?rootId=${encodeURIComponent(session.rootId)}` as Parameters<
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
                  <Text className="text-[10px] text-white/45" numberOfLines={1}>
                    {session.branch ? `${session.folder} · ${session.branch}` : session.folder}
                  </Text>
                </View>
                <Badge
                  label={STATUS_LABELS[session.status]}
                  color={STATUS_COLORS[session.status]}
                />
                <ChevronRight size={14} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        )}

        {unavailable.map((folder) => (
          <Text key={folder.folder} className="mt-2 text-[10px] text-white/40">
            {`${folder.folder}: ${folder.message}`}
          </Text>
        ))}
      </Card>
    </View>
  );
}
