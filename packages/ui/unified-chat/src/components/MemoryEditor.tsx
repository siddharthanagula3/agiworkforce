import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Pin, PinOff, Trash2 } from 'lucide-react';
import {
  MANAGED_MEMORY_MAX_CONTENT_CHARS as MAX_FACT_CHARS,
  MEMORY_CATEGORIES,
  type MemoryCategory,
} from '@agiworkforce/types';
import { translateUiPlural, useConfirmAction, useUnsavedChangesGuard } from '@agiworkforce/ui';
import { cn } from '../lib/utils';
import { toUserMessage } from '../lib/network-error';
import { useMemoryStore, type MemoryFact } from '../stores/memoryStore';

const LEARNED_SOURCE = 'auto';
const IMPORTED_SOURCE_PREFIX = 'imported:';
const OTHER_GROUP = 'other';

const CATEGORY_LABELS = {
  preference: 'Preferences',
  fact: 'About you',
  decision: 'Decisions',
  context: 'Context',
  summary: 'Summaries',
  skill: 'Skills',
} satisfies Record<MemoryCategory, string>;

interface FactGroup {
  key: string;
  label: string;
  facts: MemoryFact[];
}

function groupFacts(facts: MemoryFact[]): FactGroup[] {
  const groups = new Map<string, MemoryFact[]>();
  for (const fact of facts) {
    const category = fact.category?.trim().toLowerCase() ?? '';
    const key = (MEMORY_CATEGORIES as readonly string[]).includes(category)
      ? category
      : OTHER_GROUP;
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  }
  return [...MEMORY_CATEGORIES, OTHER_GROUP]
    .filter((key) => groups.has(key))
    .map((key) => ({
      key,
      label: key === OTHER_GROUP ? 'Other' : CATEGORY_LABELS[key as MemoryCategory],
      facts: groups.get(key) ?? [],
    }));
}

export interface MemoryEditorProps {
  title?: string | null;
  description?: string;
  hideClearAll?: boolean;
  className?: string;
  adapter?: MemoryEditorDataAdapter;
  conversationHref?: (conversationId: string) => string;
}

export type MemoryEditorSyncStatus = 'unavailable' | 'idle' | 'syncing' | 'synced' | 'error';

export interface MemoryEditorDataAdapter {
  isCurrent?: () => boolean;
  mutationBlocked?: boolean;
  scope?: 'local' | 'cloud';
  facts: MemoryFact[];
  syncStatus: MemoryEditorSyncStatus;
  hydrateFromServer: () => Promise<void>;
  add: (text: string, sourceConversationId?: string) => Promise<unknown> | unknown;
  update: (id: string, text: string) => Promise<unknown> | unknown;
  setPinned?: (id: string, pinned: boolean) => Promise<unknown> | unknown;
  remove: (id: string) => Promise<unknown> | unknown;
  clear: () => Promise<unknown> | unknown;
}

export function MemoryEditor(props: MemoryEditorProps) {
  return props.adapter ? (
    <MemoryEditorContent {...props} adapter={props.adapter} />
  ) : (
    <LegacyMemoryEditor {...props} />
  );
}

function LegacyMemoryEditor(props: MemoryEditorProps) {
  const state = useMemoryStore();
  return <MemoryEditorContent {...props} adapter={state} />;
}

function MemoryEditorContent({
  title = 'Memory',
  description = 'Things the assistant should remember about you across conversations.',
  hideClearAll = false,
  className,
  adapter,
  conversationHref,
}: MemoryEditorProps & { adapter: MemoryEditorDataAdapter }) {
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const { facts, add, update, setPinned, remove, clear, syncStatus, hydrateFromServer } = adapter;
  const pinUnavailableDescriptionId = useId();
  const isAccountScoped = adapter?.scope === 'cloud';
  const lifetime = useRef<object | null>(null);
  useEffect(() => {
    const generation = {};
    lifetime.current = generation;
    return () => {
      lifetime.current = null;
    };
  }, []);
  const capture = useCallback(() => {
    const generation = lifetime.current;
    return () =>
      generation !== null && lifetime.current === generation && (adapter.isCurrent?.() ?? true);
  }, [adapter]);

  const [draft, setDraft] = useState('');
  const draftRevision = useRef(0);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const editRevision = useRef(0);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const cloudMutationPending = useRef(false);

  useEffect(() => {
    void hydrateFromServer().catch(() => undefined);
  }, [hydrateFromServer]);

  const query = search.trim().toLowerCase();
  const visibleFacts = useMemo(
    () =>
      (query ? facts.filter((fact) => fact.text.toLowerCase().includes(query)) : facts)
        .slice()
        .sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true)),
    [facts, query],
  );
  const groups = useMemo(() => (query ? [] : groupFacts(visibleFacts)), [query, visibleFacts]);

  const runMutation = useCallback(
    async (action: () => Promise<unknown> | unknown) => {
      const current = capture();
      if (
        !current() ||
        adapter.mutationBlocked ||
        (isAccountScoped && cloudMutationPending.current)
      )
        return;
      if (isAccountScoped) cloudMutationPending.current = true;
      setMutating(true);
      setMutationError(null);
      try {
        await action();
      } catch (error) {
        if (current())
          setMutationError(
            toUserMessage(
              error,
              'Could not confirm the memory change. Check your saved memories before trying again.',
            ),
          );
      } finally {
        cloudMutationPending.current = false;
        if (current()) setMutating(false);
      }
    },
    [capture, adapter.mutationBlocked, isAccountScoped],
  );

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const next = draft.trim();
      if (!next) return;
      const current = capture();
      if (!current()) return;
      const revision = draftRevision.current;
      if (!isAccountScoped) setDraft('');
      void runMutation(async () => {
        try {
          await add(next);
          if (current() && isAccountScoped && draftRevision.current === revision) setDraft('');
        } catch (error) {
          if (current() && !isAccountScoped && draftRevision.current === revision) setDraft(next);
          throw error;
        }
      });
    },
    [draft, add, runMutation, capture, isAccountScoped],
  );

  const onBeginEdit = useCallback((fact: MemoryFact) => {
    editRevision.current += 1;
    setEditingId(fact.id);
    setEditDraft(fact.text);
  }, []);

  const onSaveEdit = useCallback(
    (id: string) => {
      const next = editDraft.trim();
      const current = capture();
      if (!current()) return;
      const revision = editRevision.current;
      void runMutation(async () => {
        if (!next) {
          await remove(id);
        } else {
          await update(id, next);
        }
        if (current() && editRevision.current === revision) {
          setEditingId(null);
          setEditDraft('');
        }
      });
    },
    [editDraft, remove, update, runMutation, capture],
  );

  const onCancelEdit = useCallback(() => {
    editRevision.current += 1;
    setEditingId(null);
    setEditDraft('');
  }, []);

  const editingFact = editingId ? facts.find((fact) => fact.id === editingId) : undefined;
  const dirty =
    draft.trim() !== '' ||
    (editingFact !== undefined && editDraft.trim() !== editingFact.text.trim()) ||
    (isAccountScoped && editingId !== null && editingFact === undefined && editDraft.trim() !== '');
  const discardEdits = useCallback(() => {
    draftRevision.current += 1;
    editRevision.current += 1;
    setDraft('');
    setEditingId(null);
    setEditDraft('');
  }, []);
  const { dialog: discardDialog } = useUnsavedChangesGuard({
    dirty,
    description: 'A memory you were writing has not been saved. If you leave now, it will be lost.',
    onDiscard: discardEdits,
  });

  const onClearAll = useCallback(() => {
    if (facts.length === 0) return;
    confirm({
      title: 'Delete all memory facts?',
      description: translateUiPlural('chat', 'counts.deleteAllFacts', facts.length, {
        one: 'This cannot be undone. All {{count}} fact would have to be added again.',
        other: 'This cannot be undone. All {{count}} facts would have to be added again.',
      }),
      confirmLabel: 'Forget everything',
      onConfirm: () => runMutation(() => clear()),
    });
  }, [facts.length, confirm, clear, runMutation]);

  const renderFact = (fact: MemoryFact) => {
    const isEditing = editingId === fact.id;
    return (
      <li
        key={fact.id}
        className="flex flex-col gap-1 rounded-md border bg-[var(--chat-surface-base)] px-3 py-2"
        style={{ borderColor: 'var(--chat-border)' }}
      >
        {isEditing ? (
          <>
            <textarea
              value={editDraft}
              onChange={(e) => {
                editRevision.current += 1;
                setEditDraft(e.target.value.slice(0, MAX_FACT_CHARS));
              }}
              maxLength={MAX_FACT_CHARS}
              aria-label={`Editing memory: ${fact.text}`}
              rows={2}
              className="resize-none rounded-sm border-0 bg-transparent text-sm text-[var(--chat-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--chat-focus-ring)]"
            />
            <div className="mt-1 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancelEdit}
                className="rounded-compact px-2 py-1 text-xs text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onSaveEdit(fact.id)}
                disabled={fact.pending || adapter.mutationBlocked || mutating}
                className="rounded-compact bg-[var(--chat-accent-primary)] px-2 py-1 text-xs font-medium text-[var(--chat-accent-on-primary)] hover:opacity-90"
              >
                Save
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onBeginEdit(fact)}
              disabled={fact.pending || adapter.mutationBlocked || (isAccountScoped && mutating)}
              className="text-start text-sm text-[var(--chat-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] disabled:cursor-default"
              aria-label={`Edit memory: ${fact.text}`}
            >
              {fact.text}
            </button>
            {/*
                A fact confined to a project reads as applying
                everywhere unless it says otherwise. The badge is the
                only thing distinguishing it from a global memory in
                this list.
              */}
            {fact.projectId ? (
              <span
                className="self-start rounded-compact px-1.5 py-0.5 text-caption text-[var(--chat-text-secondary)]"
                style={{ background: 'var(--chat-surface-hover)' }}
              >
                Only in {fact.projectName ?? 'a project'}
              </span>
            ) : null}
            <div className="flex items-center justify-between text-caption text-[var(--chat-text-muted)]">
              <span>
                {fact.pending ? (
                  'Saving…'
                ) : fact.unsaved ? (
                  'Not saved to your account. Delete it or add it again.'
                ) : (
                  <>
                    <FactOrigin fact={fact} conversationHref={conversationHref} />
                    {updatedLabel(fact)}
                  </>
                )}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!setPinned || fact.pending) return;
                    void runMutation(() => setPinned(fact.id, !fact.pinned));
                  }}
                  disabled={
                    !setPinned ||
                    fact.pending ||
                    adapter.mutationBlocked ||
                    (isAccountScoped && mutating)
                  }
                  aria-describedby={!setPinned ? pinUnavailableDescriptionId : undefined}
                  aria-pressed={fact.pinned === true}
                  aria-label={fact.pinned ? 'Unpin memory' : 'Pin memory'}
                  className={cn(
                    'rounded-compact p-1 hover:bg-[var(--chat-surface-hover)]',
                    fact.pinned
                      ? 'text-[var(--chat-accent-primary-text)]'
                      : 'text-[var(--chat-text-muted)] hover:text-[var(--chat-text-primary)]',
                  )}
                >
                  {fact.pinned ? (
                    <PinOff size={13} strokeWidth={1.75} />
                  ) : (
                    <Pin size={13} strokeWidth={1.75} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    confirm({
                      title: 'Delete this memory?',
                      description:
                        'The assistant stops using this fact in future conversations. It cannot be restored, it would have to be saved again.',
                      confirmLabel: 'Delete memory',
                      onConfirm: () => runMutation(() => remove(fact.id)),
                    })
                  }
                  disabled={
                    fact.pending || adapter.mutationBlocked || (isAccountScoped && mutating)
                  }
                  className="rounded-compact p-1 text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-destructive-text)]"
                  aria-label={`Delete memory fact`}
                >
                  <Trash2 size={13} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          </>
        )}
      </li>
    );
  };

  return (
    <div className={cn('flex h-full flex-col gap-4 p-6', className)}>
      {confirmDialog}
      {discardDialog}
      {title ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-h4 text-[var(--chat-text-primary)]">{title}</h3>
          {description ? (
            <p className="max-w-prose text-sm text-[var(--chat-text-secondary)]">{description}</p>
          ) : null}
          {!isAccountScoped ? (
            <p className="text-xs text-[var(--chat-text-muted)]">
              {syncStatusLabel(syncStatus, isAccountScoped)}
            </p>
          ) : null}
        </div>
      ) : null}

      {isAccountScoped ? (
        <div role="status" className="text-xs text-[var(--chat-text-muted)]">
          <p>{syncStatusLabel(syncStatus, true)}</p>
          {adapter.mutationBlocked ? (
            <p>
              A change could not be confirmed. Check your saved memories and reload before making
              another change.
            </p>
          ) : null}
          {syncStatus === 'error' ? (
            <button
              type="button"
              onClick={() => {
                if (capture()()) void hydrateFromServer().catch(() => undefined);
              }}
              className="rounded-compact px-2 py-1 text-[var(--chat-text-primary)]"
            >
              Reload memories
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Add new fact */}
      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <label className="text-xs font-medium text-[var(--chat-text-secondary)]">
          Add a new fact
        </label>
        <div className="flex items-start gap-2">
          <textarea
            value={draft}
            onChange={(e) => {
              draftRevision.current += 1;
              setDraft(e.target.value.slice(0, MAX_FACT_CHARS));
            }}
            maxLength={MAX_FACT_CHARS}
            aria-label="Add a new fact"
            placeholder="Example: I prefer Python over JavaScript for data work."
            rows={2}
            className="flex-1 resize-none rounded-md border bg-[var(--chat-surface-base)] px-3 py-2 text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--chat-focus-ring)]"
            style={{ borderColor: 'var(--chat-border)' }}
          />
          <button
            type="submit"
            disabled={draft.trim().length === 0 || mutating || adapter.mutationBlocked}
            className={cn(
              'shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              draft.trim().length === 0
                ? 'cursor-not-allowed bg-[var(--chat-surface-hover)] text-[var(--chat-text-muted)]'
                : 'bg-[var(--chat-accent-primary)] text-[var(--chat-accent-on-primary)] hover:opacity-90',
            )}
          >
            Add
          </button>
        </div>
        <div className="text-caption text-[var(--chat-text-muted)]">
          {draft.length} / {MAX_FACT_CHARS}
        </div>
      </form>
      {mutationError ? (
        <p role="alert" className="text-xs text-[var(--chat-destructive-text)]">
          {mutationError}
        </p>
      ) : null}
      {!setPinned && facts.length > 0 ? (
        <p id={pinUnavailableDescriptionId} className="text-caption text-[var(--chat-text-muted)]">
          Pinning is not available for this memory source.
        </p>
      ) : null}

      {facts.length > 0 ? (
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search memory"
          placeholder="Search memory"
          className="rounded-md border bg-[var(--chat-surface-base)] px-3 py-2 text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--chat-focus-ring)]"
          style={{ borderColor: 'var(--chat-border)' }}
        />
      ) : null}

      {/* Existing facts */}
      {isAccountScoped && editingId !== null && !editingFact ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[var(--chat-text-muted)]">
            The saved fact is no longer in the loaded list. Your unsaved edit is kept here.
          </p>
          <textarea
            aria-label="Unsaved memory edit"
            value={editDraft}
            onChange={(event) => {
              editRevision.current += 1;
              setEditDraft(event.target.value.slice(0, MAX_FACT_CHARS));
            }}
            className="rounded-md border bg-[var(--chat-surface-base)] p-2 text-[var(--chat-text-primary)]"
          />
          <button type="button" onClick={onCancelEdit}>
            Discard edit
          </button>
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {facts.length === 0 ? (
          <p
            className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-[var(--chat-text-muted)]"
            style={{ borderColor: 'var(--chat-border)' }}
          >
            {isAccountScoped
              ? syncStatus === 'synced'
                ? 'No cloud memory facts yet. Add one above and it will be available to your Cloud conversations.'
                : 'Cloud memory facts are not loaded.'
              : 'No local memory facts yet. Add one above and it will be available to conversations on this device.'}
          </p>
        ) : visibleFacts.length === 0 ? (
          <p
            className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-[var(--chat-text-muted)]"
            style={{ borderColor: 'var(--chat-border)' }}
          >
            {`No memory matches “${search.trim()}”.`}
          </p>
        ) : groups.length > 1 ? (
          <div className="flex flex-col gap-4">
            {groups.map((group) => (
              <section key={group.key} className="flex flex-col gap-2">
                <h4 className="text-xs font-medium text-[var(--chat-text-secondary)]">
                  {group.label}
                </h4>
                <ul aria-label={group.label} className="flex flex-col gap-2">
                  {group.facts.map(renderFact)}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul aria-label="Memory facts" className="flex flex-col gap-2">
            {visibleFacts.map(renderFact)}
          </ul>
        )}
      </div>

      {/* Destructive "forget everything", hidden when empty or by prop */}
      {!hideClearAll && facts.length > 0 ? (
        <div
          className="flex justify-end border-t pt-3"
          style={{ borderColor: 'var(--chat-border)' }}
        >
          <button
            type="button"
            onClick={onClearAll}
            disabled={mutating || adapter.mutationBlocked}
            className="rounded-compact px-2 py-1 text-xs font-medium text-[var(--chat-destructive-text)] hover:bg-[var(--chat-surface-hover)]"
          >
            Forget everything
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FactOrigin({
  fact,
  conversationHref,
}: {
  fact: MemoryFact;
  conversationHref?: (conversationId: string) => string;
}) {
  if (fact.source === LEARNED_SOURCE) {
    const title = fact.sourceConversationTitle?.trim();
    if (fact.sourceConversationId && conversationHref) {
      return (
        <>
          Learned from{' '}
          <a
            href={conversationHref(fact.sourceConversationId)}
            className="underline hover:text-[var(--chat-text-primary)]"
          >
            {title ? `“${title}”` : 'a chat'}
          </a>
        </>
      );
    }
    return <>Learned from a chat</>;
  }
  if (fact.source?.startsWith(IMPORTED_SOURCE_PREFIX)) return <>Imported</>;
  return <>{fact.source ? 'Added by you' : 'Added'}</>;
}

function syncStatusLabel(status: MemoryEditorSyncStatus, isAccountScoped: boolean): string {
  if (isAccountScoped) {
    switch (status) {
      case 'syncing':
        return 'Loading memory from your Cloud account…';
      case 'synced':
        return 'Saved to your Cloud account, available on every signed-in device.';
      case 'error':
        return 'Couldn’t refresh your Cloud memory. The loaded list may be out of date. Device-local memory was not used.';
      case 'unavailable':
        return 'Cloud memory is unavailable.';
      case 'idle':
      default:
        return 'Cloud account memory is separate from Local Mode memory.';
    }
  }

  switch (status) {
    case 'syncing':
      return 'Syncing with your account…';
    case 'synced':
      return 'Synced to your account, available on every device you sign into.';
    case 'error':
      return 'Saved on this device. Couldn’t reach your account to sync. Will retry.';
    case 'unavailable':
      return 'Saved on this device only.';
    case 'idle':
    default:
      return 'Saved on this device.';
  }
}

function updatedLabel(fact: MemoryFact): string {
  const date = new Date(fact.updatedAt || fact.createdAt);
  if (Number.isNaN(date.getTime())) return '';
  const options: Intl.DateTimeFormatOptions =
    date.getFullYear() === new Date().getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
  return ` · Updated ${new Intl.DateTimeFormat(undefined, options).format(date)}`;
}
