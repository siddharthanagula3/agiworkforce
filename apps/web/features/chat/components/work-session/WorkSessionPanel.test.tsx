import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Message } from '@shared/stores/web-chat-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useArtifactsStore, type Artifact } from '../../stores/artifacts-store';
import { buildWorkSessionSummary, hasWorkSession, WorkSessionPanel } from './WorkSessionPanel';
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
              kind: 'artifact',
              id: 'artifact-report',
              artifactId: 'artifact-report',
              name: 'report.pdf',
              mimeType: 'application/pdf',
              uri: '/api/files/file-report',
              sizeBytes: 4096,
              emittedAtMs: 4,
            },
            {
              kind: 'context',
              id: 'context-compressed',
              summary: 'Condensed the source brief',
              beforeTokens: 2400,
              afterTokens: 900,
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
  ];
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
  };
}

describe('WorkSessionPanel', () => {
  beforeEach(() => {
    useArtifactsStore.getState().clearArtifacts();
    useChatStore.setState({ activeConversationId: 'conv-1' });
    vi.clearAllMocks();
  });

  it('recognizes persisted AGI Work turns after composer state resets', () => {
    expect(hasWorkSession(workMessages(), 'chat')).toBe(true);
    expect(
      hasWorkSession(
        [
          {
            id: 'plain',
            role: 'user',
            content: 'Hello',
            createdAt: '2026-07-30T12:00:00.000Z',
          },
        ],
        'chat',
      ),
    ).toBe(false);
  });

  it('aggregates progress, deduplicated outputs, and task context', () => {
    const summary = buildWorkSessionSummary(workMessages(), [reportArtifact()]);

    expect(summary.status).toBe('completed');
    expect(summary.progress.map((item) => item.label)).toEqual([
      'Plan the report',
      'Read the benchmark data',
    ]);
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
        expect.objectContaining({ label: 'Condensed the source brief', kind: 'context' }),
      ]),
    );
  });

  it('renders all three persistent sections and downloads a generated output', async () => {
    useArtifactsStore.getState().upsertArtifact(reportArtifact());

    render(<WorkSessionPanel messages={workMessages()} open onClose={vi.fn()} />);

    expect(screen.getByRole('complementary', { name: 'AGI Work session panel' })).toBeVisible();
    expect(screen.getByText('2/2 complete')).toBeVisible();
    expect(screen.getByText('Progress')).toBeVisible();
    expect(screen.getByText('Outputs')).toBeVisible();
    expect(screen.getByText('Context')).toBeVisible();
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

  it('opens the generated-file URI while its artifact record is still hydrating', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<WorkSessionPanel messages={workMessages()} open onClose={vi.fn()} />);
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
      <WorkSessionPanel messages={workMessages()} open onClose={onClose} />,
    );
    expect(screen.getByRole('button', { name: 'Close AGI Work session panel' })).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
