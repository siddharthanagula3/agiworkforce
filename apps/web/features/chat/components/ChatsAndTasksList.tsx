'use client';

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Archive,
  ChevronDown,
  Folder,
  ListChecks,
  MessageSquare,
  Trash2,
} from '@agiworkforce/icons';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  SearchInput,
  Spinner,
  useConfirmAction,
} from '@agiworkforce/ui';
import { formatRelativeTime } from '@shared/utils/format';
import { cn } from '@shared/lib/utils';
import { useGuardedRouter } from '@shared/hooks/use-guarded-router';
import { useUnreadConversations } from '@shared/hooks/use-unread-conversations';
import { AGI_WORK_MODE, useChatStore, type Conversation } from '@shared/stores/web-chat-store';
import { useConversations } from '@/lib/hooks/useConversations';
import { useManagedCloudProjects } from '@/features/projects';
import {
  conversationDeleteConfirm,
  conversationHref,
} from '@shared/components/layout/sidebar-session-actions';
import { AGI_WORK_LABEL } from '@/features/chat/lib/agi-work';

export const CHATS_AND_TASKS_ROUTE = '/chat/chats';

export type ChatsAndTasksFilter = 'all' | 'chats' | 'tasks';

const FILTER_LABELS: Readonly<Record<ChatsAndTasksFilter, string>> = {
  all: 'All',
  chats: 'Chats',
  tasks: 'Tasks',
};

const FILTER_ORDER: readonly ChatsAndTasksFilter[] = ['all', 'chats', 'tasks'];

const RELATIVE_TIME_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const PILL = 'h-9 rounded-full px-4';

export function formatListTime(updatedAt: string, now: number = Date.now()): string {
  const date = new Date(updatedAt);
  const time = date.getTime();
  if (Number.isNaN(time)) return '';
  if (now - time < RELATIVE_TIME_WINDOW_MS) return formatRelativeTime(date);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
}

interface ListRow {
  conversation: Conversation;
  isTask: boolean;
  isRunning: boolean;
  needsYou: boolean;
  isUnread: boolean;
}

function bulkDeleteConfirm(rows: readonly ListRow[]) {
  if (rows.length === 1) return conversationDeleteConfirm(rows[0]?.conversation.title);
  return {
    title: `Delete ${rows.length} conversations?`,
    description: `These ${rows.length} conversations and every message in them will be removed from your chats. This cannot be undone. Images and videos generated in them stay in your library.`,
    confirmLabel: 'Delete conversations',
  };
}

function isPlainClick(event: React.MouseEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function ChatsAndTasksList() {
  const router = useGuardedRouter();
  const {
    conversations,
    isLoading,
    listError,
    fetchConversations,
    hasMoreConversations,
    isLoadingMoreConversations,
    loadMoreConversations,
    updateConversation,
    deleteConversation,
  } = useConversations();
  const workModeByConversation = useChatStore((state) => state.workModeByConversation);
  const loadingConversationIds = useChatStore((state) => state.loadingConversationIds);
  const streamingConversationIds = useChatStore((state) => state.streamingConversationIds);
  const { projects } = useManagedCloudProjects();
  const { isUnread } = useUnreadConversations();
  const { confirm, dialog } = useConfirmAction();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ChatsAndTasksFilter>('all');
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const rows = useMemo<ListRow[]>(() => {
    const running = new Set([...loadingConversationIds, ...streamingConversationIds]);
    return conversations
      .filter((conversation) => !conversation.isArchived && !conversation.isTemporary)
      .map((conversation) => ({
        conversation,
        isTask:
          conversation.workMode === AGI_WORK_MODE ||
          workModeByConversation[conversation.id] === AGI_WORK_MODE,
        isRunning: running.has(conversation.id),
        needsYou: conversation.needsYou === true,
        isUnread: isUnread(conversation.id),
      }))
      .sort(
        (a, b) =>
          new Date(b.conversation.updatedAt).getTime() -
          new Date(a.conversation.updatedAt).getTime(),
      );
  }, [
    conversations,
    isUnread,
    loadingConversationIds,
    streamingConversationIds,
    workModeByConversation,
  ]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        if (filter === 'chats' && row.isTask) return false;
        if (filter === 'tasks' && !row.isTask) return false;
        if (!normalizedQuery) return true;
        return (row.conversation.title || 'Untitled chat')
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      }),
    [rows, filter, normalizedQuery],
  );

  const selectedRows = useMemo(
    () => visibleRows.filter((row) => selectedIds.has(row.conversation.id)),
    [visibleRows, selectedIds],
  );

  const exitSelection = useCallback(() => {
    setSelecting(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const runBulk = useCallback(
    async (
      targets: readonly ListRow[],
      run: (id: string) => Promise<boolean>,
      failureVerb: string,
      successMessage?: (moved: number) => string,
    ) => {
      setBulkBusy(true);
      try {
        const results = await Promise.all(targets.map((row) => run(row.conversation.id)));
        const failed = results.filter((ok) => !ok).length;
        if (failed > 0) {
          toast.error(
            failed === targets.length
              ? `Could not ${failureVerb} the selected conversations`
              : `Could not ${failureVerb} ${failed} of ${targets.length} conversations`,
          );
        }
        if (successMessage && failed < targets.length) {
          toast.success(successMessage(targets.length - failed));
        }
        exitSelection();
      } finally {
        setBulkBusy(false);
      }
    },
    [exitSelection],
  );

  const archiveSelected = useCallback(() => {
    void runBulk(selectedRows, (id) => updateConversation(id, { archived: true }), 'archive');
  }, [runBulk, selectedRows, updateConversation]);

  const moveSelected = useCallback(
    (project: { id: string; name: string }) => {
      void runBulk(
        selectedRows,
        (id) => updateConversation(id, { projectId: project.id }),
        'move',
        (moved) =>
          `Moved ${moved === 1 ? '1 conversation' : `${moved} conversations`} to ${project.name}`,
      );
    },
    [runBulk, selectedRows, updateConversation],
  );

  const deleteSelected = useCallback(() => {
    const targets = selectedRows;
    if (targets.length === 0) return;
    confirm({
      ...bulkDeleteConfirm(targets),
      onConfirm: () => runBulk(targets, deleteConversation, 'delete'),
    });
  }, [confirm, deleteConversation, runBulk, selectedRows]);

  const openConversation = useCallback((id: string) => router.push(conversationHref(id)), [router]);

  const now = Date.now();
  const showInitialLoading = rows.length === 0 && isLoading;
  const showLoadFailure = rows.length === 0 && !isLoading && Boolean(listError);
  const showEmpty = rows.length === 0 && !isLoading && !listError;
  const showNoMatch = rows.length > 0 && visibleRows.length === 0;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {dialog}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 flex-1 text-2xl font-semibold text-foreground">Chats and tasks</h1>
        <div className="flex shrink-0 items-center gap-2">
          {rows.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              className={PILL}
              aria-pressed={selecting}
              onClick={() => (selecting ? exitSelection() : setSelecting(true))}
            >
              {selecting ? 'Cancel' : 'Select'}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="secondary" className={cn(PILL, 'gap-1.5')}>
                Filter by {FILTER_LABELS[filter]}
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuRadioGroup
                value={filter}
                onValueChange={(value) => setFilter(value as ChatsAndTasksFilter)}
              >
                {FILTER_ORDER.map((option) => (
                  <DropdownMenuRadioItem key={option} value={option}>
                    {FILTER_LABELS[option]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" className={PILL} onClick={() => router.push('/chat')}>
            New
          </Button>
        </div>
      </div>

      <SearchInput
        aria-label="Search chats and tasks"
        placeholder="Search chats and tasks"
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        containerClassName="mt-6"
        className="h-11 rounded-xl bg-muted text-base"
      />

      {selecting && (
        <div
          role="toolbar"
          aria-label="Selected conversations"
          className="mt-4 flex flex-wrap items-center gap-2"
        >
          <p className="min-w-0 flex-1 text-sm text-muted-foreground" aria-live="polite">
            {selectedRows.length === 0
              ? 'Select chats and tasks'
              : `${selectedRows.length} selected`}
          </p>
          {projects.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  className={cn(PILL, 'gap-1.5')}
                  disabled={selectedRows.length === 0 || bulkBusy}
                >
                  <Folder className="h-4 w-4" aria-hidden="true" />
                  Move to project
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-64 w-56 overflow-y-auto">
                {projects.map((project) => (
                  <DropdownMenuItem key={project.id} onSelect={() => moveSelected(project)}>
                    <span className="truncate">{project.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            type="button"
            variant="secondary"
            className={cn(PILL, 'gap-1.5')}
            disabled={selectedRows.length === 0 || bulkBusy}
            onClick={archiveSelected}
          >
            <Archive className="h-4 w-4" aria-hidden="true" />
            Archive
          </Button>
          <Button
            type="button"
            variant="secondary"
            className={cn(PILL, 'gap-1.5 text-danger-text')}
            disabled={selectedRows.length === 0 || bulkBusy}
            onClick={deleteSelected}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete
          </Button>
        </div>
      )}

      <div className="mt-4">
        {showInitialLoading && (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Spinner size="sm" />
            <span>Loading chats and tasks</span>
          </div>
        )}

        {showLoadFailure && (
          <div className="py-10">
            <p className="text-sm text-foreground">Couldn&apos;t load your chats and tasks.</p>
            <Button
              type="button"
              variant="secondary"
              className={cn(PILL, 'mt-3')}
              onClick={() => void fetchConversations()}
            >
              Retry
            </Button>
          </div>
        )}

        {showEmpty && (
          <p className="py-10 text-sm text-muted-foreground">
            No chats or tasks yet. Start one with New.
          </p>
        )}

        {showNoMatch && (
          <p className="py-10 text-sm text-muted-foreground">
            {normalizedQuery
              ? `Nothing matches “${query.trim()}”.`
              : `No ${FILTER_LABELS[filter].toLocaleLowerCase()} yet.`}
          </p>
        )}

        {visibleRows.length > 0 && (
          <ul className="divide-y divide-border border-y border-border">
            {visibleRows.map((row) => (
              <li key={row.conversation.id}>
                <ChatsAndTasksRow
                  row={row}
                  now={now}
                  selecting={selecting}
                  selected={selectedIds.has(row.conversation.id)}
                  onToggleSelected={toggleSelected}
                  onOpen={openConversation}
                />
              </li>
            ))}
          </ul>
        )}

        {hasMoreConversations && rows.length > 0 && (
          <div className="mt-4 flex justify-center">
            <Button
              type="button"
              variant="ghost"
              className={cn(PILL, 'gap-1.5')}
              disabled={isLoadingMoreConversations}
              onClick={() => void loadMoreConversations()}
            >
              {isLoadingMoreConversations && <Spinner size="sm" />}
              {isLoadingMoreConversations ? 'Loading more' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatsAndTasksRow({
  row,
  now,
  selecting,
  selected,
  onToggleSelected,
  onOpen,
}: {
  row: ListRow;
  now: number;
  selecting: boolean;
  selected: boolean;
  onToggleSelected: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { conversation, isTask, isRunning, needsYou, isUnread } = row;
  const title = conversation.title || 'Untitled chat';
  const Icon = isTask ? ListChecks : MessageSquare;
  const hasActivity = isTask && (isRunning || needsYou || isUnread);
  const states = [
    isTask ? AGI_WORK_LABEL : null,
    needsYou ? 'Needs you' : null,
    isRunning ? 'Running' : null,
    isUnread ? 'Unread' : null,
  ].filter((part): part is string => Boolean(part));

  const body = (
    <>
      <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-base text-foreground',
          isUnread ? 'font-semibold' : 'font-normal',
        )}
      >
        {title}
        {states.length > 0 && <span className="sr-only">, {states.join(', ')}</span>}
      </span>
      {hasActivity && (
        <span
          data-testid={`chats-activity-${conversation.id}`}
          className="h-2 w-2 shrink-0 rounded-full bg-primary"
          aria-hidden="true"
        />
      )}
      <time
        dateTime={conversation.updatedAt}
        className="shrink-0 text-sm tabular-nums text-muted-foreground"
      >
        {formatListTime(conversation.updatedAt, now)}
      </time>
    </>
  );

  const rowClassName =
    'flex min-h-12 w-full items-center gap-3 px-3 py-3 text-start transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]';

  if (selecting) {
    return (
      <label className={cn(rowClassName, 'cursor-pointer', selected && 'bg-accent')}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelected(conversation.id)}
          className="h-4 w-4 shrink-0 accent-primary"
        />
        {body}
      </label>
    );
  }

  return (
    <a
      href={conversationHref(conversation.id)}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        onOpen(conversation.id);
      }}
      className={rowClassName}
    >
      {body}
    </a>
  );
}
