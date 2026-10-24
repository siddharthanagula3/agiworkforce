import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { useRouter } from 'expo-router';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Folder,
  FolderOpen,
  ListFilter,
  Play,
  RefreshCw,
} from 'lucide-react-native';
import {
  REMOTE_CODE_LIMITS,
  type RemoteCodeRoot,
  type RemoteCodeSessionStatus,
  type RemoteCodeSessionSummary,
} from '@agiworkforce/types';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { formatRelativeTime } from '@/src/lib/time';
import { useThemeColors } from '@/src/ui/theme';
import { listCodeSessions, startCodeSession } from '../remote-code/service';
import { forgetCodeSessionStart, useRemoteCodeStore } from '../remote-code/store';

function codeSessionHref(rootId: string, threadId: string) {
  return `/(app)/companion/code/${encodeURIComponent(threadId)}?rootId=${encodeURIComponent(rootId)}`;
}

export function NewCodeSession({ onStarted }: { onStarted?: () => void }) {
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
      onStarted?.();
      router.push(
        codeSessionHref(start.rootId, start.threadId) as Parameters<typeof router.push>[0],
      );
    } else if (start.error) {
      forgetCodeSessionStart(pending);
      setPending(null);
      setError(start.error);
    }
  }, [onStarted, pending, router, start]);

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
          className="text-sm font-semibold"
          style={{ color: canStart ? colors.accentText : colors.textMuted }}
        >
          {pending ? 'Starting…' : 'Start session'}
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

export type CodeSessionFilter = 'all' | Exclude<RemoteCodeSessionStatus, 'unknown'>;

const SESSION_FILTERS: readonly { value: CodeSessionFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'running', label: STATUS_LABELS.running },
  { value: 'awaiting_approval', label: STATUS_LABELS.awaiting_approval },
  { value: 'idle', label: STATUS_LABELS.idle },
  { value: 'failed', label: STATUS_LABELS.failed },
];

export function filterSessionsByStatus(
  sessions: readonly RemoteCodeSessionSummary[],
  filter: CodeSessionFilter,
): RemoteCodeSessionSummary[] {
  return filter === 'all' ? [...sessions] : sessions.filter((session) => session.status === filter);
}

export function codeSessionStatusLabel(status: RemoteCodeSessionStatus): string {
  return STATUS_LABELS[status];
}

export function codeSessionStatusColor(
  status: RemoteCodeSessionStatus,
): 'gray' | 'blue' | 'yellow' | 'red' {
  return STATUS_COLORS[status];
}

export interface CodeProject {
  rootId: string;
  name: string;
  sessions: RemoteCodeSessionSummary[];
}

export function groupSessionsByProject(
  sessions: readonly RemoteCodeSessionSummary[],
  roots: readonly RemoteCodeRoot[],
): CodeProject[] {
  const projects = new Map<string, CodeProject>(
    roots.map((root) => [root.rootId, { rootId: root.rootId, name: root.name, sessions: [] }]),
  );
  for (const session of sessions) {
    const project = projects.get(session.rootId) ?? {
      rootId: session.rootId,
      name: session.folder,
      sessions: [],
    };
    project.sessions.push(session);
    projects.set(session.rootId, project);
  }
  return [...projects.values()];
}

function sessionAge(updatedAt: string): string | null {
  return Number.isNaN(Date.parse(updatedAt)) ? null : formatRelativeTime(updatedAt);
}

function SessionRow({ session }: { session: RemoteCodeSessionSummary }) {
  const colors = useThemeColors();
  const router = useRouter();
  return (
    <PressableBox
      onPress={() =>
        router.push(
          codeSessionHref(session.rootId, session.threadId) as Parameters<typeof router.push>[0],
        )
      }
      className="flex-row items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 active:bg-white/5"
      accessibilityRole="button"
      accessibilityLabel={`Open ${session.title}`}
    >
      <View className="flex-1">
        <Text className="text-sm font-medium text-white" numberOfLines={1}>
          {session.title}
        </Text>
        <Text className="text-sm text-white/45" numberOfLines={1}>
          {[
            sessionAge(session.updatedAt),
            session.location === 'cloud' ? CLOUD_SESSION_LABEL : null,
            session.origin ? REMOTE_SESSION_ORIGIN_LABELS[session.origin] : null,
            session.folder,
            session.branch,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <Badge label={STATUS_LABELS[session.status]} color={STATUS_COLORS[session.status]} />
      <ChevronRight size={14} color={colors.textMuted} />
    </PressableBox>
  );
}

function ProjectRow({
  project,
  expanded,
  onToggle,
}: {
  project: CodeProject;
  expanded: boolean;
  onToggle: () => void;
}) {
  const colors = useThemeColors();
  const FolderIcon = expanded ? FolderOpen : Folder;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const count = project.sessions.length;
  return (
    <View>
      <PressableBox
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${project.name}, ${count === 1 ? '1 session' : `${count} sessions`}`}
        className="flex-row items-center gap-3 rounded-lg px-1 active:bg-white/5"
        style={{ minHeight: 44 }}
      >
        <FolderIcon size={18} color={colors.textPrimary} />
        <Text className="flex-1 text-base text-white" numberOfLines={1}>
          {project.name}
        </Text>
        <Chevron size={16} color={colors.textMuted} />
      </PressableBox>
      {expanded ? (
        <View className="gap-2 pb-2" style={{ paddingLeft: 30 }}>
          {count === 0 ? (
            <Text className="text-sm text-white/40">No sessions in this project yet.</Text>
          ) : (
            project.sessions.map((session) => (
              <SessionRow key={`${session.rootId}:${session.threadId}`} session={session} />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

function SessionFilterButton({
  value,
  open,
  onToggle,
}: {
  value: CodeSessionFilter;
  open: boolean;
  onToggle: () => void;
}) {
  const colors = useThemeColors();
  const current = SESSION_FILTERS.find((filter) => filter.value === value) ?? SESSION_FILTERS[0];
  return (
    <PressableBox
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`Filter sessions: ${current?.label}`}
      style={{ minHeight: 44 }}
      className="flex-row items-center gap-1 rounded-full px-2 active:bg-white/5"
    >
      <Text className="text-sm text-white/70">{current?.label}</Text>
      <ListFilter size={14} color={colors.textMuted} />
    </PressableBox>
  );
}

function SessionFilterOptions({
  value,
  onChange,
}: {
  value: CodeSessionFilter;
  onChange: (value: CodeSessionFilter) => void;
}) {
  const colors = useThemeColors();
  return (
    <View accessibilityRole="radiogroup" className="mb-2 rounded-xl border border-white/10 py-1">
      {SESSION_FILTERS.map((filter) => {
        const selected = filter.value === value;
        return (
          <PressableBox
            key={filter.value}
            onPress={() => onChange(filter.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={filter.label}
            style={{ minHeight: 44 }}
            className="flex-row items-center gap-2 px-3 active:bg-white/5"
          >
            <Text className="flex-1 text-sm text-white">{filter.label}</Text>
            {selected ? <Check size={14} color={colors.textPrimary} /> : null}
          </PressableBox>
        );
      })}
    </View>
  );
}

export function CodeSessionsCard({ canStart }: { canStart: boolean }) {
  const colors = useThemeColors();
  const sessions = useRemoteCodeStore((state) => state.sessions);
  const roots = useRemoteCodeStore((state) => state.roots);
  const unavailable = useRemoteCodeStore((state) => state.unavailable);
  const syncedAt = useRemoteCodeStore((state) => state.sessionsSyncedAt);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [filter, setFilter] = useState<CodeSessionFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const filtered = filter !== 'all';
  const visibleSessions = filterSessionsByStatus(sessions, filter);
  const grouped = groupSessionsByProject(sessions, roots).length > 1;
  const projects = groupSessionsByProject(visibleSessions, roots).filter(
    (project) => !filtered || project.sessions.length > 0,
  );

  useEffect(() => {
    void listCodeSessions();
  }, []);

  const toggleProject = (rootId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });

  return (
    <View className="px-4 mb-3">
      <Card variant="elevated">
        <View className="flex-row items-center gap-2 mb-2">
          <Code2 size={15} color={colors.teal} />
          <Text
            className={`flex-1 text-white ${grouped ? 'text-base font-semibold' : 'text-sm font-medium'}`}
            accessibilityRole="header"
          >
            {grouped ? 'Projects' : 'Sessions'}
          </Text>
          {sessions.length > 0 ? (
            <SessionFilterButton
              value={filter}
              open={filterOpen}
              onToggle={() => setFilterOpen((isOpen) => !isOpen)}
            />
          ) : null}
          <PressableBox
            onPress={() => void listCodeSessions()}
            className="items-center justify-center rounded-lg active:bg-white/5"
            style={{ width: 44, height: 44 }}
            accessibilityRole="button"
            accessibilityLabel="Refresh AGI Code sessions"
          >
            <RefreshCw size={14} color={colors.textSecondary} />
          </PressableBox>
        </View>

        {filterOpen && sessions.length > 0 ? (
          <SessionFilterOptions
            value={filter}
            onChange={(next) => {
              setFilter(next);
              setFilterOpen(false);
            }}
          />
        ) : null}

        {syncedAt === null ? (
          <Text className="text-sm text-white/40">Asking Desktop for its sessions…</Text>
        ) : filtered && sessions.length > 0 && visibleSessions.length === 0 ? (
          <Text className="text-sm text-white/40">No sessions match this filter.</Text>
        ) : grouped ? (
          <View>
            {projects.map((project) => (
              <ProjectRow
                key={project.rootId}
                project={project}
                expanded={expanded.has(project.rootId)}
                onToggle={() => toggleProject(project.rootId)}
              />
            ))}
          </View>
        ) : sessions.length === 0 ? (
          <Text className="text-sm text-white/40">
            {canStart
              ? 'No AGI Code sessions on this computer yet.'
              : 'No AGI Code sessions on this computer yet. Start one in the desktop app.'}
          </Text>
        ) : (
          <View className="gap-2">
            {visibleSessions.map((session) => (
              <SessionRow key={`${session.rootId}:${session.threadId}`} session={session} />
            ))}
          </View>
        )}

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
