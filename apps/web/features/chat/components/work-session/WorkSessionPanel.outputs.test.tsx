import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Message } from '@shared/stores/web-chat-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { WorkSessionPanel } from './WorkSessionPanel';

vi.mock('../../utils/downloadArtifacts', () => ({
  downloadAllArtifacts: vi.fn().mockResolvedValue(undefined),
  downloadGeneratedFile: vi.fn().mockResolvedValue(undefined),
}));

const NOW = 1_700_000_000_000;

function run(
  status: 'running' | 'completed',
  entries: unknown[],
  generatedFiles: unknown[] = [],
): Message[] {
  return [
    {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      createdAt: '2026-09-13T12:00:00.000Z',
      metadata: {
        ...(generatedFiles.length > 0 ? { generatedFiles } : {}),
        agentActivity: {
          schemaVersion: 1,
          sessionId: 'conv-outputs',
          turnId: 'assistant-1',
          lastSequence: entries.length,
          status,
          startedAtMs: NOW - 20_000,
          updatedAtMs: NOW,
          ...(status === 'completed' ? { completedAtMs: NOW } : {}),
          entries,
        },
      },
    },
  ] as unknown as Message[];
}

const planStep = (id: string, summary: string, status: string) => ({
  kind: 'progress',
  id,
  progressId: id,
  summary,
  status,
  startedAtMs: NOW - 10_000,
  ...(status === 'completed' ? { completedAtMs: NOW - 5_000 } : {}),
});

describe('WorkSessionPanel outputs rail', () => {
  beforeEach(() => {
    useArtifactsStore.getState().clearArtifacts();
    useChatStore.getState().setActiveConversation('conv-outputs');
    vi.setSystemTime(NOW);
  });

  it('states the empty copy for every section before the run has produced anything', () => {
    render(<WorkSessionPanel messages={run('running', [])} open onClose={vi.fn()} agiWork />);

    expect(screen.getByText('Progress')).toBeVisible();
    expect(screen.getByText('Steps appear here once the session plans its work')).toBeVisible();
    expect(screen.getByText('Files created during this session appear here')).toBeVisible();
    expect(screen.getByText('No connectors used yet')).toBeVisible();
    expect(screen.getByText('Pages the session reads appear here as it searches.')).toBeVisible();
  });

  it('counts the finished steps while the run is still working', () => {
    render(
      <WorkSessionPanel
        messages={run('running', [
          planStep('plan-1', 'Read the brief', 'completed'),
          planStep('plan-2', 'Draft the summary', 'running'),
        ])}
        open
        onClose={vi.fn()}
        agiWork
      />,
    );

    expect(screen.getByText('1/2')).toBeVisible();
    expect(screen.getByText('Read the brief')).toBeVisible();
    expect(screen.getByText('Draft the summary')).toBeVisible();
    expect(screen.getByText('Files created during this session appear here')).toBeVisible();
  });

  it('lists each finished deliverable with its type line and a download control', () => {
    render(
      <WorkSessionPanel
        messages={run(
          'completed',
          [planStep('plan-1', 'Write the brief', 'completed')],
          [
            {
              id: 'file-brief',
              fileName: 'brief.md',
              mimeType: 'text/markdown',
              uri: '/api/files/file-brief',
              byteCount: 2048,
              kind: 'markdown',
            },
          ],
        )}
        open
        onClose={vi.fn()}
        agiWork
      />,
    );

    expect(screen.getByText('brief.md')).toBeVisible();
    expect(screen.getByText('Document, MD · 2.0 KB')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Download brief.md' })).toBeVisible();
    expect(screen.getByText('1/1')).toBeVisible();
  });
});
