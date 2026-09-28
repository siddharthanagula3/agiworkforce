'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';
import {
  parseManagedMemoryConflictsResponse,
  parseManagedMemoryRestoreResponse,
  type ManagedMemoryConflict,
} from '@agiworkforce/types';
import { useMemoryStore } from '@agiworkforce/unified-chat';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

const CONFLICTS_PATH = '/api/memory/conflicts';
const CONTROL_HEIGHT = 30;
const CONFLICT_RULE =
  'When two memories disagree, a pinned memory wins, then one you added over one learned from a chat, then the newer one. The replaced one is kept here so you can switch back.';
const LOAD_FAILED_MESSAGE = 'Could not load replaced memories. Try again later.';
const RESTORE_FAILED_MESSAGE = 'Could not switch back to that memory. Try again.';

async function readContract<T>(
  response: Response,
  parse: (value: unknown) => T | null,
  fallback: string,
): Promise<T> {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === 'object'
        ? (data as { error?: { message?: unknown } }).error?.message
        : undefined;
    throw new Error(typeof message === 'string' && message ? message : fallback);
  }
  const parsed = parse(data);
  if (parsed === null) throw new Error(fallback);
  return parsed;
}

export function MemoryConflicts() {
  const factCount = useMemoryStore((s) => s.facts.length);
  const hydrateMemories = useMemoryStore((s) => s.hydrateFromServer);
  const [conflicts, setConflicts] = useState<ManagedMemoryConflict[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await readContract(
        await fetch(CONFLICTS_PATH),
        parseManagedMemoryConflictsResponse,
        LOAD_FAILED_MESSAGE,
      );
      setConflicts(data.conflicts);
      setError(null);
    } catch (caught) {
      setConflicts([]);
      setError(toUserMessage(caught, LOAD_FAILED_MESSAGE));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, factCount]);

  const restore = async (conflict: ManagedMemoryConflict) => {
    setRestoringId(conflict.id);
    setError(null);
    try {
      await readContract(
        await fetch(`/api/memory/${encodeURIComponent(conflict.id)}/restore`, {
          method: 'POST',
          headers: await addCsrfHeaders({}),
        }),
        parseManagedMemoryRestoreResponse,
        RESTORE_FAILED_MESSAGE,
      );
      await Promise.all([load(), hydrateMemories()]);
    } catch (caught) {
      setError(toUserMessage(caught, RESTORE_FAILED_MESSAGE));
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', margin: 0 }}>
        When memories disagree
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>{CONFLICT_RULE}</p>
      {error ? (
        <p
          role="alert"
          style={{ margin: 0, fontSize: 13, color: 'var(--settings-destructive-text)' }}
        >
          {error}
        </p>
      ) : null}
      {conflicts === null ? (
        <Spinner size="sm" />
      ) : conflicts.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
          No memory has replaced another.
        </p>
      ) : (
        <ul
          aria-label="Replaced memories"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            margin: 0,
            padding: 0,
            listStyle: 'none',
          }}
        >
          {conflicts.map((conflict) => (
            <li
              key={conflict.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-1)',
                padding: 'var(--space-3) var(--space-4)',
                border: '1px solid var(--settings-border)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--text-1)' }}>
                {`Using: ${conflict.kept.content}`}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {`Replaced: ${conflict.content}`}
              </span>
              <button
                type="button"
                onClick={() => void restore(conflict)}
                disabled={restoringId !== null}
                style={{
                  alignSelf: 'flex-start',
                  height: CONTROL_HEIGHT,
                  padding: '0 var(--space-3)',
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--text-1)',
                  background: 'transparent',
                  border: '1px solid var(--settings-border)',
                  borderRadius: 'var(--radius-md)',
                  cursor: restoringId !== null ? 'default' : 'pointer',
                }}
              >
                {restoringId === conflict.id ? 'Switching…' : 'Use the replaced one instead'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
