import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useMemoryStore, type MemoryFact } from '../stores/memoryStore';

/**
 * MemoryEditor — list / add / edit / delete cross-conversation memory facts
 * the assistant should remember about the user. Round-2 audit P0 #8.
 *
 * Surface-agnostic: uses the shared local memory store by default and accepts
 * a host-owned adapter when a surface has a different trust boundary (for
 * example, Desktop Managed Cloud account memory).
 *
 * The default store remains local-first. An external adapter owns both data
 * and mutations; this component never mirrors cloud facts into device-local
 * storage.
 */

const MAX_FACT_CHARS = 280;

export interface MemoryEditorProps {
  /** Optional title override. Set to null to hide the header. */
  title?: string | null;
  /** Optional descriptive copy shown under the title. */
  description?: string;
  /** When true, hides the "Forget everything" destructive button. */
  hideClearAll?: boolean;
  /** Optional className for the outer container. */
  className?: string;
  /**
   * Optional host-owned persistence boundary. Desktop Cloud supplies an
   * authenticated account adapter; omitting it keeps the local shared store.
   */
  adapter?: MemoryEditorDataAdapter;
}

export type MemoryEditorSyncStatus = 'unavailable' | 'idle' | 'syncing' | 'synced' | 'error';

export interface MemoryEditorDataAdapter {
  facts: MemoryFact[];
  syncStatus: MemoryEditorSyncStatus;
  hydrateFromServer: () => Promise<void>;
  add: (text: string, sourceConversationId?: string) => Promise<unknown> | unknown;
  update: (id: string, text: string) => Promise<unknown> | unknown;
  remove: (id: string) => Promise<unknown> | unknown;
  clear: () => Promise<unknown> | unknown;
}

export function MemoryEditor({
  title = 'Memory',
  description = 'Things the assistant should remember about you across conversations.',
  hideClearAll = false,
  className,
  adapter,
}: MemoryEditorProps) {
  const localFacts = useMemoryStore((s) => s.facts);
  const localAdd = useMemoryStore((s) => s.add);
  const localUpdate = useMemoryStore((s) => s.update);
  const localRemove = useMemoryStore((s) => s.remove);
  const localClear = useMemoryStore((s) => s.clear);
  const localSyncStatus = useMemoryStore((s) => s.syncStatus);
  const localHydrateFromServer = useMemoryStore((s) => s.hydrateFromServer);
  const facts = adapter?.facts ?? localFacts;
  const add = adapter?.add ?? localAdd;
  const update = adapter?.update ?? localUpdate;
  const remove = adapter?.remove ?? localRemove;
  const clear = adapter?.clear ?? localClear;
  const syncStatus = adapter?.syncStatus ?? localSyncStatus;
  const hydrateFromServer = adapter?.hydrateFromServer ?? localHydrateFromServer;

  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);

  // Pull the account-scoped copy on mount so facts saved from another
  // device show up here too. No-op where sync isn't available (Desktop
  // Tauri webview, Mobile) — see memoryStore.ts's `canSyncToServer` guard.
  useEffect(() => {
    void hydrateFromServer().catch(() => undefined);
  }, [hydrateFromServer]);

  const runMutation = useCallback(async (action: () => Promise<unknown> | unknown) => {
    setMutating(true);
    setMutationError(null);
    try {
      await action();
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Could not update memory.');
    } finally {
      setMutating(false);
    }
  }, []);

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const next = draft.trim();
      if (!next) return;
      void runMutation(async () => {
        await add(next);
        setDraft('');
      });
    },
    [draft, add, runMutation],
  );

  const onBeginEdit = useCallback((fact: MemoryFact) => {
    setEditingId(fact.id);
    setEditDraft(fact.text);
  }, []);

  const onSaveEdit = useCallback(
    (id: string) => {
      const next = editDraft.trim();
      void runMutation(async () => {
        if (!next) {
          // Empty value deletes the fact — matches Claude's confirm-then-erase pattern.
          await remove(id);
        } else {
          await update(id, next);
        }
        setEditingId(null);
        setEditDraft('');
      });
    },
    [editDraft, remove, update, runMutation],
  );

  const onCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft('');
  }, []);

  const onClearAll = useCallback(() => {
    if (facts.length === 0) return;
    // Lightweight confirm — host apps can wrap with their own modal if needed.
    const ok =
      typeof globalThis.confirm === 'function'
        ? globalThis.confirm(
            `Delete all ${facts.length} memory ${facts.length === 1 ? 'fact' : 'facts'}? This cannot be undone.`,
          )
        : true;
    if (!ok) return;
    void runMutation(() => clear());
  }, [facts.length, clear, runMutation]);

  return (
    <div className={cn('flex h-full flex-col gap-4 p-6', className)}>
      {title ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold text-[var(--chat-text-primary)]">{title}</h3>
          {description ? (
            <p className="max-w-prose text-sm text-[var(--chat-text-secondary)]">{description}</p>
          ) : null}
          <p className="text-xs text-[var(--chat-text-muted)]">
            {syncStatusLabel(syncStatus, Boolean(adapter))}
          </p>
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
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_FACT_CHARS))}
            placeholder="Example: I prefer Python over JavaScript for data work."
            rows={2}
            className="flex-1 resize-none rounded-md border bg-[var(--chat-surface-base)] px-3 py-2 text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--chat-accent-secondary)]"
            style={{ borderColor: 'var(--chat-border)' }}
          />
          <button
            type="submit"
            disabled={draft.trim().length === 0 || mutating}
            className={cn(
              'shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              draft.trim().length === 0
                ? 'cursor-not-allowed bg-[var(--chat-surface-hover)] text-[var(--chat-text-muted)]'
                : 'bg-[var(--chat-accent-primary)] text-white hover:opacity-90',
            )}
          >
            Add
          </button>
        </div>
        <div className="text-[10px] text-[var(--chat-text-muted)]">
          {draft.length} / {MAX_FACT_CHARS}
        </div>
      </form>
      {mutationError ? (
        <p role="alert" className="text-xs text-[var(--chat-destructive)]">
          {mutationError}
        </p>
      ) : null}

      {/* Existing facts */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {facts.length === 0 ? (
          <p
            className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-[var(--chat-text-muted)]"
            style={{ borderColor: 'var(--chat-border)' }}
          >
            {adapter
              ? 'No cloud memory facts yet. Add one above and it will be available to your Managed Cloud conversations.'
              : 'No local memory facts yet. Add one above and it will be available to conversations on this device.'}
          </p>
        ) : (
          <ul aria-label="Memory facts" className="flex flex-col gap-2">
            {facts.map((fact) => {
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
                        onChange={(e) => setEditDraft(e.target.value.slice(0, MAX_FACT_CHARS))}
                        rows={2}
                        className="resize-none rounded-sm border-0 bg-transparent text-sm text-[var(--chat-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--chat-accent-secondary)]"
                      />
                      <div className="mt-1 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={onCancelEdit}
                          className="rounded px-2 py-1 text-xs text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void onSaveEdit(fact.id)}
                          disabled={mutating}
                          className="rounded bg-[var(--chat-accent-primary)] px-2 py-1 text-xs font-medium text-white hover:opacity-90"
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
                        className="text-left text-sm text-[var(--chat-text-primary)] focus:outline-none"
                        aria-label={`Edit memory: ${fact.text}`}
                      >
                        {fact.text}
                      </button>
                      <div className="flex items-center justify-between text-[10px] text-[var(--chat-text-muted)]">
                        <span>
                          Added {formatRelativeDate(fact.createdAt)}
                          {fact.updatedAt !== fact.createdAt
                            ? ` · edited ${formatRelativeDate(fact.updatedAt)}`
                            : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => void runMutation(() => remove(fact.id))}
                          disabled={mutating}
                          className="rounded p-1 text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-destructive)]"
                          aria-label={`Delete memory fact`}
                        >
                          <Trash2 size={13} strokeWidth={1.75} />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Destructive "forget everything" — hidden when empty or by prop */}
      {!hideClearAll && facts.length > 0 ? (
        <div
          className="flex justify-end border-t pt-3"
          style={{ borderColor: 'var(--chat-border)' }}
        >
          <button
            type="button"
            onClick={onClearAll}
            disabled={mutating}
            className="rounded px-2 py-1 text-xs font-medium text-[var(--chat-destructive)] hover:bg-[var(--chat-surface-hover)]"
          >
            Forget everything
          </button>
        </div>
      ) : null}
    </div>
  );
}

function syncStatusLabel(status: MemoryEditorSyncStatus, isAccountScoped: boolean): string {
  if (isAccountScoped) {
    switch (status) {
      case 'syncing':
        return 'Loading memory from your Managed Cloud account…';
      case 'synced':
        return 'Saved to your Managed Cloud account — available on every signed-in device.';
      case 'error':
        return 'Couldn’t reach your Managed Cloud memory. Device-local memory was not used.';
      case 'unavailable':
        return 'Managed Cloud memory is unavailable.';
      case 'idle':
      default:
        return 'Managed Cloud account memory is separate from Local Mode memory.';
    }
  }

  switch (status) {
    case 'syncing':
      return 'Syncing with your account…';
    case 'synced':
      return 'Synced to your account — available on every device you sign into.';
    case 'error':
      return 'Saved on this device. Couldn’t reach your account to sync — will retry.';
    case 'unavailable':
      return 'Saved on this device only.';
    case 'idle':
    default:
      return 'Saved on this device.';
  }
}

function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'just now';
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
