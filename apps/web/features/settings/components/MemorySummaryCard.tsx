'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  MANAGED_MEMORY_SUMMARY_PATH,
  MemorySummaryResponseSchema,
  type MemorySummaryResponse,
} from '@agiworkforce/cloud-contracts';
import { Spinner } from '@agiworkforce/ui';
import {
  useCloudMemory,
  useCloudMemorySnapshot,
  useMemoryView,
} from '@/features/memory/use-cloud-memory';
import type { CloudMemoryController } from '@/features/memory/cloud-memory-controller';
import { toUserMessage } from '@/lib/user-error-message';

const LOAD_FAILED = 'Your memory summary could not be loaded.';
const WRITE_FAILED = 'The summary could not be written right now. Try again in a few minutes.';

type CardState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: MemorySummaryResponse };

const buttonStyle = {
  height: 34,
  padding: '0 var(--space-3)',
  fontSize: 13,
  color: 'var(--text-1)',
  background: 'transparent',
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  cursor: 'pointer',
} as const;

function SummaryList({ heading, lines }: { heading: string; lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <div>
      <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', margin: 0 }}>
        {heading}
      </h3>
      <ul
        style={{
          margin: 'var(--space-1) 0 0',
          paddingInlineStart: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
        }}
      >
        {lines.map((line) => (
          <li key={line} style={{ fontSize: 14, color: 'var(--text-2)' }}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MemorySummaryCard({ memoryCount }: { memoryCount: number }) {
  const controller = useCloudMemory();
  return controller ? (
    <OwnedMemorySummaryCard
      key={controller.key}
      controller={controller}
      memoryCount={memoryCount}
    />
  ) : null;
}

function OwnedMemorySummaryCard({
  controller,
}: {
  controller: CloudMemoryController;
  memoryCount: number;
}) {
  const { revision } = useCloudMemorySnapshot(controller);
  const capture = useMemoryView(controller);
  const [state, setState] = useState<CardState>({ status: 'loading' });
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const current = capture();
    if (!current()) return;
    setState({ status: 'loading' });
    try {
      const data = await controller.request(
        MANAGED_MEMORY_SUMMARY_PATH,
        {},
        (body) => MemorySummaryResponseSchema.parse(body),
        { current },
      );
      if (current()) setState({ status: 'ready', data });
    } catch (error) {
      if (current()) setState({ status: 'error', message: toUserMessage(error, LOAD_FAILED) });
    }
  }, [controller, capture]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const write = useCallback(async () => {
    const current = capture();
    if (!current()) return;
    setWriting(true);
    setWriteError(null);
    try {
      const data = await controller.request(
        MANAGED_MEMORY_SUMMARY_PATH,
        { method: 'POST' },
        (body) => MemorySummaryResponseSchema.parse(body),
        { current, mutation: true },
      );
      if (current()) setState({ status: 'ready', data });
    } catch (error) {
      if (current()) setWriteError(toUserMessage(error, WRITE_FAILED));
    } finally {
      if (current()) setWriting(false);
    }
  }, [controller, capture]);

  const data = state.status === 'ready' ? state.data : null;
  const hasSummary =
    data !== null && (data.summary.about.length > 0 || data.summary.preferences.length > 0);

  return (
    <section
      aria-labelledby="memory-summary-heading"
      aria-busy={state.status === 'loading' || writing}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        border: '1px solid var(--settings-border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-elev)',
        padding: 'var(--space-4)',
      }}
    >
      <div>
        <h2
          id="memory-summary-heading"
          style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', margin: 0 }}
        >
          What AGI knows about you
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 'var(--space-1) 0 0' }}>
          A summary only. Edit or delete memories below to change it.
        </p>
      </div>

      {state.status === 'loading' ? (
        <Spinner size="sm" aria-label="Loading your memory summary" />
      ) : state.status === 'error' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>
            {state.message}
          </p>
          <button type="button" onClick={() => void load()} style={buttonStyle}>
            Try again
          </button>
        </div>
      ) : data && data.memoryCount === 0 ? (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)' }}>
          Nothing is saved yet, so there is nothing to summarise.
        </p>
      ) : (
        <>
          {hasSummary && data ? (
            <>
              <SummaryList heading="About you" lines={data.summary.about} />
              <SummaryList heading="Your preferences" lines={data.summary.preferences} />
            </>
          ) : data?.generatedAt ? (
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)' }}>
              Your memories do not say enough yet to summarise.
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)' }}>
              AGI has not summarised your saved memories yet.
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button
              type="button"
              onClick={() => void write()}
              disabled={writing}
              style={{ ...buttonStyle, cursor: writing ? 'default' : 'pointer' }}
            >
              {writing ? <Spinner size="sm" aria-hidden="true" /> : null}
              {data?.generatedAt ? 'Update summary' : 'Summarise my memories'}
            </button>
            {data?.generatedAt ? (
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Updated{' '}
                {new Date(data.generatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
              </span>
            ) : null}
          </div>
          {writeError ? (
            <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--text-2)' }}>
              {writeError}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
