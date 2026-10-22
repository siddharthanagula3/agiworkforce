import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Message } from '@shared/stores/web-chat-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useArtifactsStore, type Artifact } from '../../stores/artifacts-store';
import { WorkSessionPanel } from './WorkSessionPanel';
import { buildTaskDockSummary } from './taskDockSummary';
import { downloadGeneratedFile } from '../../utils/downloadArtifacts';
import { CapabilityProvider } from '@agiworkforce/unified-chat';
import { useCoworkFolderStore } from '@shared/stores/cowork-folder-store';
import { onLocalFolderAttachRequest } from '../Composer/ComposerPlusMenu';

const desktopHost = vi.hoisted(() => ({ value: null as object | null }));
vi.mock('@/features/desktop-host/lib/host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/desktop-host/lib/host')>()),
  useDesktopHost: () => desktopHost.value,
}));

vi.mock('../../utils/downloadArtifacts', () => ({
  downloadAllArtifacts: vi.fn().mockResolvedValue(undefined),
  downloadGeneratedFile: vi.fn().mockResolvedValue(undefined),
  downloadArtifactFile: vi.fn().mockResolvedValue(undefined),
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

    expect(screen.getByRole('complementary', { name: 'AGI Work session dock' })).toBeVisible();
    expect(screen.getByText('Sources')).toBeVisible();
    expect(screen.getByText('Outputs')).toBeVisible();
    expect(screen.getByText('Context')).toBeVisible();
    expect(screen.getByText('Pricing page')).not.toBeVisible();
    const sources = screen.getByTestId('task-dock-sources');
    expect(sources).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Sources'));
    expect(sources).toHaveAttribute('open');
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

  it('names the progress section and lists the plan steps under the activity line', () => {
    render(<WorkSessionPanel messages={workMessages()} open onClose={vi.fn()} agiWork />);

    expect(screen.getByText('Progress')).toBeVisible();
    expect(screen.getByText(/Worked for/)).toBeVisible();
    const steps = screen.getByRole('list', { name: 'session steps' });
    expect(steps).toBeVisible();
    expect(screen.getByText('Plan the report')).toBeVisible();
  });

  it('shows only progress for a run that has produced nothing yet', () => {
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

    expect(screen.queryByText('Outputs')).toBeNull();
    expect(screen.queryByText('Context')).toBeNull();
    expect(screen.queryByText('Sources')).toBeNull();
    expect(screen.getByText(/Working for/)).toBeVisible();
    expect(screen.getByText('Steps appear here once the session plans its work')).toBeVisible();
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
    expect(screen.getByRole('button', { name: 'Close AGI Work session dock' })).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();

    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});

describe('WorkSessionPanel · section disclosure and context actions', () => {
  beforeEach(() => {
    useArtifactsStore.getState().clearArtifacts();
    useChatStore.getState().setActiveConversation('conv-1');
    desktopHost.value = null;
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
  });

  it('collapses and reopens Outputs from its header', () => {
    render(<WorkSessionPanel messages={workMessages()} open onClose={vi.fn()} agiWork />);

    const outputsHeader = screen.getByText('Outputs');
    const outputs = outputsHeader.closest('details');
    expect(outputs).toHaveAttribute('open');
    expect(screen.getByText('report.pdf')).toBeVisible();

    fireEvent.click(outputsHeader);
    expect(outputs).not.toHaveAttribute('open');
    expect(screen.getByText('report.pdf')).not.toBeVisible();

    fireEvent.click(outputsHeader);
    expect(outputs).toHaveAttribute('open');
  });

  it('gives Progress and Context the same disclosure header', () => {
    render(<WorkSessionPanel messages={workMessages()} open onClose={vi.fn()} agiWork />);

    expect(screen.getByText('Progress').closest('summary')).not.toBeNull();
    expect(screen.getByText('Context').closest('summary')).not.toBeNull();
  });

  it('offers no context actions where neither folder route exists', () => {
    render(<WorkSessionPanel messages={workMessages()} open onClose={vi.fn()} agiWork />);

    expect(screen.queryByRole('button', { name: 'Add working folder' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Attach from local folder' })).toBeNull();
  });

  it('picks a working folder from the Context header', () => {
    (window as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi.fn();
    const pickFolder = vi.fn().mockResolvedValue(undefined);
    const original = useCoworkFolderStore.getState().pickFolder;
    useCoworkFolderStore.setState({ pickFolder });

    render(
      <CapabilityProvider platform="desktop">
        <WorkSessionPanel messages={workMessages()} open onClose={vi.fn()} agiWork />
      </CapabilityProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add working folder' }));

    expect(pickFolder).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Context').closest('details')).toHaveAttribute('open');
    useCoworkFolderStore.setState({ pickFolder: original });
  });

  it('asks the composer to attach from a local folder in the desktop shell', () => {
    desktopHost.value = {};
    const handler = vi.fn();
    const stop = onLocalFolderAttachRequest(handler);

    render(<WorkSessionPanel messages={workMessages()} open onClose={vi.fn()} agiWork />);
    fireEvent.click(screen.getByRole('button', { name: 'Attach from local folder' }));

    expect(handler).toHaveBeenCalledTimes(1);
    stop();
  });
});
