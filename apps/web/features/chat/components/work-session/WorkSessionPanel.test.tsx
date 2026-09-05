import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Message } from '@shared/stores/web-chat-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useArtifactsStore, type Artifact } from '../../stores/artifacts-store';
import { WorkSessionPanel } from './WorkSessionPanel';
import { buildTaskDockSummary } from './taskDockSummary';
import { downloadGeneratedFile } from '../../utils/downloadArtifacts';

vi.mock('../../utils/downloadArtifacts', () => ({
  downloadAllArtifacts: vi.fn().mockResolvedValue(undefined),
  downloadGeneratedFile: vi.fn().mockResolvedValue(undefined),
}));

const runId = '5c8e9b8e-cbad-4e76-87cf-e17e7d828c40';

function workMessages(): Message[] {
  return [
    {
      id: 'user-1',
      role: 'user',
      content: 'Read the brief and prepare a report.',
      createdAt: '2026-07-30T12:00:00.000Z',
      attachments: [
        {
          id: 'attachment-1',
          assetId: 'asset-brief',
          type: 'file',
          name: 'brief.md',
          mimeType: 'text/markdown',
        },
      ],
      metadata: { sendReplay: { workMode: 'agiwork' } },
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'The report is ready.',
      createdAt: '2026-07-30T12:00:01.000Z',
      metadata: {
        generatedFiles: [
          {
            id: 'file-report',
            fileName: 'report.pdf',
            mimeType: 'application/pdf',
            uri: '/api/files/file-report',
            byteCount: 4096,
            kind: 'pdf',
          },
        ],
        agentActivity: {
          schemaVersion: 1,
          sessionId: 'conv-1',
          turnId: 'assistant-1',
          lastSequence: 5,
          status: 'completed',
          startedAtMs: 1,
          updatedAtMs: 5,
          completedAtMs: 5,
          entries: [
            {
              kind: 'progress',
              id: 'progress-plan',
              progressId: 'plan',
              summary: 'Plan the report',
              status: 'completed',
              startedAtMs: 1,
              completedAtMs: 2,
            },
            {
              kind: 'tool',
              id: 'tool-read',
              toolCallId: 'call-read',
              name: 'file_read',
              category: 'filesystem',
              summary: 'Read the benchmark data',
              status: 'completed',
              input: { path: '/workspace/brief.md' },
              startedAtMs: 2,
              completedAtMs: 3,
            },
            {
              kind: 'tool',
              id: 'tool-search',
              toolCallId: 'call-search',
              name: 'web_search',
              category: 'web-search',
              summary: 'Searching the web',
              status: 'completed',
              query: 'benchmark pricing',
              sources: [{ url: 'https://example.com/pricing', title: 'Pricing page' }],
              startedAtMs: 3,
              completedAtMs: 4,
            },
            {
              kind: 'tool',
              id: 'tool-connector',
              toolCallId: 'call-connector',
              name: 'mcp__gmail__send',
              category: 'connector',
              summary: 'Using Gmail connector',
              status: 'completed',
              startedAtMs: 4,
              completedAtMs: 4,
            },
            {
              kind: 'artifact',
              id: 'artifact-report',
              artifactId: 'artifact-report',
              name: 'report.pdf',
              mimeType: 'application/pdf',
              uri: '/api/files/file-report',
              sizeBytes: 4096,
              emittedAtMs: 4,
            },
          ],
        },
        cloudAgentRun: {
          runId,
          runPath: `/api/llm/v1/chat/completions/runs/${runId}`,
          lastSequence: 5,
          state: 'completed',
        },
      },
    },
  ] as unknown as Message[];
}

function reportArtifact(): Artifact {
  return {
    id: 'artifact-report',
    type: 'document',
    title: 'report.pdf',
    language: 'pdf',
    content: '',
    messageId: 'assistant-1',
    conversationId: 'conv-1',
    createdAt: new Date('2026-07-30T12:00:01.000Z'),
    generatedFile: {
      id: 'file-report',
      computeSessionId: 'compute-1',
      ownerUserId: 'user-1',
      sourceSurface: 'web',
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
      kind: 'pdf',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      uri: '/api/files/file-report',
      byteCount: 4096,
      checksumSha256: 'a'.repeat(64),
      previewDerivatives: [],
      createdAt: '2026-07-30T12:00:01.000Z',
    },
  } as unknown as Artifact;
}

describe('WorkSessionPanel', () => {
  beforeEach(() => {
    useArtifactsStore.getState().clearArtifacts();
    useChatStore.setState({ activeConversationId: 'conv-1' });
    vi.clearAllMocks();
  });

  it('aggregates sources, deduplicated outputs and task context', () => {
    const summary = buildTaskDockSummary({
      messages: workMessages(),
      artifacts: [reportArtifact()],
    });

    expect(summary.status).toBe('completed');
    expect(summary.sources[0]?.label).toBe('benchmark pricing');
    expect(summary.sources[0]?.sources[0]?.host).toBe('example.com');
    expect(summary.outputs).toEqual([
      expect.objectContaining({
        id: 'file:file-report',
        name: 'report.pdf',
        artifactId: 'artifact-report',
        uri: '/api/files/file-report',
      }),
    ]);
    expect(summary.context).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'brief.md', kind: 'attachment' }),
        expect.objectContaining({ label: '/workspace/brief.md', kind: 'path' }),
        expect.objectContaining({ label: 'Gmail', kind: 'connector' }),
      ]),
    );
  });

  it('renders the three dock sections and downloads a generated output', async () => {
    useArtifactsStore.getState().upsertArtifact(reportArtifact());

    render(<WorkSessionPanel messages={workMessages()} open onClose={vi.fn()} agiWork />);

    expect(screen.getByRole('complementary', { name: 'AGI Work task dock' })).toBeVisible();
    expect(screen.getByText('Sources')).toBeVisible();
    expect(screen.getByText('Outputs')).toBeVisible();
    expect(screen.getByText('Context')).toBeVisible();
    expect(screen.getByText('Pricing page')).toBeVisible();
    expect(screen.getByText('report.pdf')).toBeVisible();
    expect(screen.getByText('/workspace/brief.md')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Download report.pdf' }));
    await waitFor(() => {
      expect(downloadGeneratedFile).toHaveBeenCalledWith(
        '/api/files/file-report',
        'report.pdf',
        'application/pdf',
      );
    });
  });

  it('mirrors the collapsed activity line and discloses the steps behind it', () => {
    render(<WorkSessionPanel messages={workMessages()} open onClose={vi.fn()} agiWork />);

    const progressLine = screen.getByRole('button', { name: /Worked for/ });
    expect(progressLine).toBeVisible();
    expect(screen.queryByRole('list', { name: 'task steps' })).toBeNull();

    fireEvent.click(progressLine);
    const steps = screen.getByRole('list', { name: 'task steps' });
    expect(steps).toBeVisible();
    expect(screen.getByText('Plan the report')).toBeVisible();
  });

  it('states the empty copy for a run that has produced nothing yet', () => {
    const idle = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        createdAt: '2026-07-30T12:00:01.000Z',
        metadata: {
          agentActivity: {
            schemaVersion: 1,
            sessionId: 'conv-1',
            turnId: 'assistant-1',
            lastSequence: 0,
            status: 'running',
            startedAtMs: Date.now(),
            updatedAtMs: Date.now(),
            entries: [],
          },
        },
      },
    ] as unknown as Message[];

    render(<WorkSessionPanel messages={idle} open onClose={vi.fn()} agiWork />);

    expect(screen.getByText('Files created during this task appear here')).toBeVisible();
    expect(screen.getByText('No connectors used yet')).toBeVisible();
    expect(screen.getByRole('button', { name: /Working for/ })).toBeVisible();
  });

  it('offers a way back to the artifacts half of the shared slot', () => {
    useArtifactsStore.getState().upsertArtifact(reportArtifact());

    render(<WorkSessionPanel messages={workMessages()} open onClose={vi.fn()} agiWork />);

    fireEvent.click(screen.getByRole('tab', { name: 'Artifacts' }));
    expect(useArtifactsStore.getState().panelOpen).toBe(true);
    expect(useArtifactsStore.getState().selectedArtifactId).toBe('artifact-report');
  });

  it('opens the generated-file URI while its artifact record is still hydrating', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<WorkSessionPanel messages={workMessages()} open onClose={vi.fn()} agiWork />);
    fireEvent.click(screen.getByRole('button', { name: 'Open report.pdf' }));

    expect(open).toHaveBeenCalledWith('/api/files/file-report', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

  it('closes on Escape and restores focus to the opener', () => {
    const onClose = vi.fn();
    const opener = document.createElement('button');
    opener.textContent = 'Open session';
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(
      <WorkSessionPanel messages={workMessages()} open onClose={onClose} agiWork />,
    );
    expect(screen.getByRole('button', { name: 'Close AGI Work task dock' })).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
