import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Message } from '@shared/stores/web-chat-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { WorkSessionPanel } from './WorkSessionPanel';

vi.mock('../../utils/downloadArtifacts', () => ({
  downloadAllArtifacts: vi.fn().mockResolvedValue(undefined),
  downloadGeneratedFile: vi.fn().mockResolvedValue(undefined),
  downloadArtifactFile: vi.fn().mockResolvedValue(undefined),
}));

const NOW = 1_700_000_000_000;

function run(status: 'running' | 'completed', entries: unknown[]): Message[] {
  return [
    {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      createdAt: '2026-09-13T12:00:00.000Z',
      metadata: {
        agentActivity: {
          schemaVersion: 1,
          sessionId: 'conv-steps',
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

const planStep = (index: number, summary: string, status: string) => ({
  kind: 'progress',
  id: `progress-${index}`,
  progressId: `agiwork:plan:${index}`,
  summary,
  status,
  startedAtMs: NOW - 10_000,
  ...(status === 'completed' ? { completedAtMs: NOW - 5_000 } : {}),
});

const tool = (id: string, overrides: Record<string, unknown>) => ({
  kind: 'tool',
  id: `tool:${id}`,
  toolCallId: id,
  name: 'tool',
  category: 'other',
  summary: `Tool ${id}`,
  status: 'completed',
  startedAtMs: NOW - 9_000,
  completedAtMs: NOW - 8_000,
  ...overrides,
});

function renderPanel(messages: Message[]) {
  render(<WorkSessionPanel messages={messages} open onClose={vi.fn()} agiWork />);
}

describe('WorkSessionPanel step groups', () => {
  beforeEach(() => {
    useArtifactsStore.getState().clearArtifacts();
    useChatStore.getState().setActiveConversation('conv-steps');
    vi.setSystemTime(NOW);
  });

  it('nests the tool steps of a plan step under a collapsible header with typed chips', () => {
    renderPanel(
      run('running', [
        planStep(1, 'Set up the workspace', 'running'),
        tool('shell', {
          name: 'bash',
          category: 'shell',
          summary: 'Running a command',
          input: { command: 'mkdir -p /workspace/report' },
        }),
        tool('write', {
          name: 'write_file',
          category: 'filesystem',
          summary: 'Writing a file',
          input: { path: '/workspace/report/todo.md' },
        }),
        planStep(2, 'Draft the summary', 'pending'),
      ]),
    );

    const steps = screen.getByRole('list', { name: 'session steps' });
    const groups = within(steps).getAllByTestId('task-dock-step-group');
    expect(groups).toHaveLength(1);
    const group = groups[0]!;
    expect(group).toHaveAttribute('open');
    expect(within(group).getByText('Set up the workspace')).toBeVisible();
    expect(within(group).getByText('Running a command')).toBeVisible();
    expect(within(group).getByText('mkdir -p /workspace/report')).toBeVisible();
    expect(within(group).getByText('todo.md')).toBeVisible();
    expect(within(group).getByTitle('/workspace/report/todo.md')).toBeVisible();
    expect(within(steps).getByText('Draft the summary')).toBeVisible();
  });

  it('collapses a finished group and lets the reader reopen it', () => {
    renderPanel(
      run('completed', [
        planStep(1, 'Collect the figures', 'completed'),
        tool('read', {
          name: 'read_file',
          category: 'filesystem',
          summary: 'Reading the figures',
          input: { path: '/workspace/figures.csv' },
        }),
      ]),
    );

    const group = screen.getByTestId('task-dock-step-group');
    expect(group).not.toHaveAttribute('open');
    expect(screen.getByText('Reading the figures')).not.toBeVisible();
    fireEvent.click(within(group).getByText('Collect the figures'));
    expect(group).toHaveAttribute('open');
    expect(screen.getByText('Reading the figures')).toBeVisible();
  });

  it('keeps plain progress entries flat without a chevron', () => {
    renderPanel(
      run('running', [
        {
          kind: 'progress',
          id: 'progress-reasoning',
          progressId: 'generation',
          summary: 'Reasoning',
          status: 'running',
          startedAtMs: NOW - 1_000,
        },
      ]),
    );

    expect(screen.queryByTestId('task-dock-step-group')).toBeNull();
    expect(screen.getByText('Reasoning')).toBeVisible();
  });

  it('caps the chips on one step and counts the rest', () => {
    renderPanel(
      run('running', [
        tool('write', {
          category: 'filesystem',
          summary: 'Writing files',
          status: 'running',
          files: ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => ({
            path: `/w/${name}.md`,
            change: 'created',
          })),
        }),
      ]),
    );

    const chips = screen.getByTestId('task-dock-step-chips');
    expect(within(chips).getAllByRole('listitem')).toHaveLength(5);
    expect(within(chips).getByText('+2 more')).toBeVisible();
  });

  it('shows one connectors chip listing each connector the group used', () => {
    renderPanel(
      run('running', [
        planStep(1, 'Pull the data', 'running'),
        tool('gmail', {
          name: 'mcp__gmail__search',
          category: 'connector',
          summary: 'Using Gmail connector',
        }),
        tool('gmail-2', {
          name: 'mcp__gmail__read',
          category: 'connector',
          summary: 'Using Gmail connector',
        }),
        tool('notion', {
          name: 'mcp__notion__query',
          category: 'mcp',
          summary: 'Using Notion tool',
        }),
      ]),
    );

    const chip = screen.getByTestId('task-dock-connectors');
    expect(within(chip).getByText('Connectors')).toBeVisible();
    expect(within(chip).getByText('2')).toBeVisible();
    fireEvent.click(within(chip).getByText('Connectors'));
    expect(within(chip).getByText('Gmail')).toBeVisible();
    expect(within(chip).getByText('Notion')).toBeVisible();
  });

  it('shows no connectors chip when the run named no connector', () => {
    renderPanel(
      run('running', [
        tool('custom', {
          name: 'mcp__custom-1a2b__run',
          category: 'mcp',
          summary: 'Using MCP tool',
        }),
      ]),
    );

    expect(screen.queryByTestId('task-dock-connectors')).toBeNull();
  });
});

describe('WorkSessionPanel knowledge recalled', () => {
  beforeEach(() => {
    useArtifactsStore.getState().clearArtifacts();
    useChatStore.getState().setActiveConversation('conv-steps');
    vi.setSystemTime(NOW);
  });

  it('lists the memories a completed recall returned, once each', () => {
    renderPanel(
      run('running', [
        tool('recall-1', {
          name: 'search_memory',
          category: 'memory',
          summary: 'Retrieving project context',
          output: JSON.stringify({ memories: ['Prefers metric units', 'Works in finance'] }),
        }),
        tool('recall-2', {
          name: 'search_memory',
          category: 'memory',
          summary: 'Retrieving project context',
          output: JSON.stringify({ memories: ['Prefers metric units'] }),
        }),
      ]),
    );

    const knowledge = screen.getByTestId('task-dock-knowledge');
    expect(within(knowledge).getByText('Knowledge recalled')).toBeVisible();
    expect(within(knowledge).getByText('2')).toBeVisible();
    fireEvent.click(within(knowledge).getByText('Knowledge recalled'));
    expect(within(knowledge).getByText('Prefers metric units')).toBeVisible();
    expect(within(knowledge).getByText('Works in finance')).toBeVisible();
  });

  it('stays absent when nothing was recalled or the call only saved or is still running', () => {
    renderPanel(
      run('running', [
        tool('empty', {
          name: 'search_memory',
          category: 'memory',
          output: JSON.stringify({ memories: [], reason: 'Memory is off for this account.' }),
        }),
        tool('save', {
          name: 'save_memory',
          category: 'memory',
          output: JSON.stringify({ saved: true }),
        }),
        tool('pending', { name: 'search_memory', category: 'memory', status: 'running' }),
      ]),
    );

    expect(screen.queryByTestId('task-dock-knowledge')).toBeNull();
  });
});

describe('WorkSessionPanel active tool header', () => {
  beforeEach(() => {
    useArtifactsStore.getState().clearArtifacts();
    useChatStore.getState().setActiveConversation('conv-steps');
    vi.setSystemTime(NOW);
  });

  it('names the terminal and its command while a command runs', () => {
    renderPanel(
      run('running', [
        tool('shell', {
          name: 'bash',
          category: 'shell',
          summary: 'Running a command',
          status: 'running',
          input: { command: 'pnpm test' },
        }),
      ]),
    );

    const header = screen.getByTestId('task-dock-active-tool');
    expect(within(header).getByText('Using terminal')).toBeVisible();
    expect(within(header).getByText('pnpm test')).toBeVisible();
  });

  it('names the browser and the page while a page is fetched', () => {
    renderPanel(
      run('running', [
        tool('fetch', {
          name: 'web_fetch',
          category: 'web-fetch',
          summary: 'Reading example.com',
          status: 'running',
          input: { url: 'https://example.com/pricing' },
        }),
      ]),
    );

    const header = screen.getByTestId('task-dock-active-tool');
    expect(within(header).getByText('Using browser')).toBeVisible();
    expect(within(header).getByText('https://example.com/pricing')).toBeVisible();
  });

  it('shows no header when the running tool is neither, or the run has finished', () => {
    const { unmount } = render(
      <WorkSessionPanel
        messages={run('running', [
          tool('read', { category: 'filesystem', status: 'running', input: { path: '/a.md' } }),
        ])}
        open
        onClose={vi.fn()}
        agiWork
      />,
    );
    expect(screen.queryByTestId('task-dock-active-tool')).toBeNull();
    unmount();

    renderPanel(
      run('completed', [
        tool('shell', { category: 'shell', status: 'completed', input: { command: 'ls' } }),
      ]),
    );
    expect(screen.queryByTestId('task-dock-active-tool')).toBeNull();
  });
});
