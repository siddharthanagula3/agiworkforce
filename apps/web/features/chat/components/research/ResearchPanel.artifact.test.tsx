import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ResearchReport } from '@agiworkforce/types';

import { ResearchPanel } from './ResearchPanel';
import { useResearchPanelStore } from '../../stores/research-panel-store';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { useChatStore } from '@shared/stores/web-chat-store';

const CONVERSATION_ID = 'conv-research-artifact';

const REPORT: ResearchReport = {
  id: 'report-9',
  queryId: 'req-9',
  title: 'Node.js release status',
  summary: 'Node 24 is the active LTS line.',
  content: '## Overview\n\nNode 24 is LTS.',
  citations: [],
  keyFindings: ['v24 is LTS'],
  status: 'completed',
  sourcesConsulted: 2,
  createdAt: '2026-08-05T10:00:00.000Z',
};

beforeEach(() => {
  useArtifactsStore.getState().reset();
  useChatStore.setState({ activeConversationId: CONVERSATION_ID });
  useResearchPanelStore.getState().openPanel(CONVERSATION_ID, 'msg-1', [], []);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ reports: [REPORT] }) })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ResearchPanel · report to artifact', () => {
  it('puts the report into the artifacts store and swaps the panels', async () => {
    const user = userEvent.setup();
    render(<ResearchPanel />);

    await user.click(screen.getByRole('tab', { name: 'Report' }));
    await user.click(await screen.findByTestId('research-report-create-artifact'));

    const artifacts = useArtifactsStore.getState().getConversationArtifacts(CONVERSATION_ID);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      title: 'Node.js release status',
      language: 'md',
      type: 'document',
      conversationId: CONVERSATION_ID,
    });
    expect(artifacts[0]!.content).toContain('## Key findings');

    expect(useArtifactsStore.getState().selectedArtifactId).toBe(artifacts[0]!.id);
    expect(useArtifactsStore.getState().panelOpen).toBe(true);
    expect(useResearchPanelStore.getState().panelOpen).toBe(false);
  });
});

describe('ResearchPanel · follow-up hand-off', () => {
  it("sends a reopened Library report's follow-up to the host and closes the panel", async () => {
    const user = userEvent.setup();
    const onAskFollowUp = vi.fn();
    render(<ResearchPanel onAskFollowUp={onAskFollowUp} />);

    await user.click(screen.getByRole('tab', { name: 'Library' }));
    await user.click(await screen.findByText('Node.js release status'));
    await user.type(
      await screen.findByLabelText('Ask a follow-up about this report'),
      'Which line should we pin?',
    );
    await user.click(screen.getByTestId('research-report-follow-up-send'));

    expect(onAskFollowUp).toHaveBeenCalledTimes(1);
    expect(onAskFollowUp.mock.calls[0]![0]).toContain('Which line should we pin?');
    expect(onAskFollowUp.mock.calls[0]![0]).toContain('Node 24 is LTS');
    expect(useResearchPanelStore.getState().panelOpen).toBe(false);
  });

  it('offers no composer when the host cannot send', async () => {
    const user = userEvent.setup();
    render(<ResearchPanel />);

    await user.click(screen.getByRole('tab', { name: 'Report' }));
    await screen.findByTestId('research-report-view');
    expect(screen.queryByTestId('research-report-follow-up')).toBeNull();
  });
});
