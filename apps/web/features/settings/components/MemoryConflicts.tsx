'use client';

import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';
import {
  parseManagedMemoryConflictsResponse,
  parseManagedMemoryRestoreResponse,
  type ManagedMemoryConflict,
} from '@agiworkforce/types';
import {
  useCloudMemory,
  useCloudMemorySnapshot,
  useMemoryView,
} from '@/features/memory/use-cloud-memory';
import type { CloudMemoryController } from '@/features/memory/cloud-memory-controller';
import { toUserMessage } from '@/lib/user-error-message';

const CONFLICTS_PATH = '/api/memory/conflicts';
const CONTROL_HEIGHT = 30;
const CONFLICT_RULE =
  'Pinned wins, then ones you added, then the newest. Replaced memories stay here.';
const LOAD_FAILED_MESSAGE = 'Could not load replaced memories. Try again later.';
const RESTORE_FAILED_MESSAGE = 'Could not switch back to that memory. Try again.';

export function MemoryConflicts() {
  const controller = useCloudMemory();
  return controller ? <OwnedMemoryConflicts key={controller.key} controller={controller} /> : null;
}

function OwnedMemoryConflicts({ controller }: { controller: CloudMemoryController }) {
  const { revision } = useCloudMemorySnapshot(controller);
  const capture = useMemoryView(controller);
  const [conflicts, setConflicts] = useState<ManagedMemoryConflict[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const current = capture();
    if (!current()) return;
    try {
      const data = await controller.request(
        CONFLICTS_PATH,
        {},
        parseManagedMemoryConflictsResponse,
        { current },
      );
      if (!current()) return;
      setConflicts(data.conflicts);
      setError(null);
    } catch (caught) {
      if (!current()) return;
      setConflicts([]);
      setError(toUserMessage(caught, LOAD_FAILED_MESSAGE));
    }
  }, [controller, capture]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const restore = async (conflict: ManagedMemoryConflict) => {
    const current = capture();
    if (!current()) return;
    setRestoringId(conflict.id);
    setError(null);
    try {
      await controller.request(
        `/api/memory/${encodeURIComponent(conflict.id)}/restore`,
        { method: 'POST' },
        parseManagedMemoryRestoreResponse,
        {
          current,
          mutation: true,
          changesFacts: true,
          acknowledgedFacts: (result, facts) =>
            facts.filter((fact) => fact.id !== result.replacedId),
        },
      );
    } catch (caught) {
      if (current()) setError(toUserMessage(caught, RESTORE_FAILED_MESSAGE));
    } finally {
      if (current()) setRestoringId(null);
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
        error ? null : (
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
            No memory has replaced another.
          </p>
        )
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
