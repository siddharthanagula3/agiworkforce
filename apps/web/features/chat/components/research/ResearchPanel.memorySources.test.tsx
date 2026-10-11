import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ResearchPanel } from './ResearchPanel';
import { useResearchPanelStore } from '../../stores/research-panel-store';
import { useChatStore } from '@shared/stores/web-chat-store';

type SettingsModalModule = typeof import('@features/settings/components/SettingsModalProvider');

const openSettings = vi.fn();

vi.mock('@features/settings/components/SettingsModalProvider', async (importOriginal) => ({
  ...(await importOriginal<SettingsModalModule>()),
  useSettingsModal: () => ({ openSettings }),
}));

const CONVERSATION_ID = 'conv-memory-sources';
const MEMORIES = {
  count: 14,
  memories: [
    { id: 'mem-1', excerpt: 'You are a solo founder of AGI Workforce' },
    { id: 'mem-2', excerpt: 'Prefers short, direct answers' },
  ],
};

beforeEach(() => {
  openSettings.mockReset();
  useChatStore.setState({ activeConversationId: CONVERSATION_ID });
  useResearchPanelStore.setState({
    panelOpen: false,
    messageId: null,
    cited: [],
    more: [],
    query: undefined,
    memories: null,
    conversationId: null,
  });
});

describe('ResearchPanel · memory sources', () => {
  it('lists the memories an answer used beside its web sources', async () => {
    useResearchPanelStore
      .getState()
      .openPanel(
        CONVERSATION_ID,
        'msg-1',
        [{ url: 'https://a.com/1', title: 'First', citationIndex: 1 }],
        [],
        undefined,
        MEMORIES,
      );
    render(<ResearchPanel />);

    const memory = await screen.findByRole('region', { name: 'Memory' });
    expect(within(memory).getByText('Memory · 14')).toBeInTheDocument();
    expect(within(memory).getByText('You are a solo founder of AGI Workforce')).toBeInTheDocument();
    expect(within(memory).getByText('Prefers short, direct answers')).toBeInTheDocument();
    expect(within(memory).getByText('And 12 more')).toBeInTheDocument();
    expect(screen.getByText('Citations')).toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('shows a memory-only answer instead of the empty state', async () => {
    useResearchPanelStore.getState().openPanel(CONVERSATION_ID, 'msg-2', [], [], undefined, {
      count: 1,
      memories: [{ id: 'mem-1', excerpt: 'Lives in Austin' }],
    });
    render(<ResearchPanel />);

    expect(await screen.findByText('Lives in Austin')).toBeInTheDocument();
    expect(screen.queryByText('No sources yet')).toBeNull();
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  it('opens memory settings from the panel', async () => {
    useResearchPanelStore
      .getState()
      .openPanel(CONVERSATION_ID, 'msg-3', [], [], undefined, MEMORIES);
    render(<ResearchPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Manage memory' }));
    expect(openSettings).toHaveBeenCalledWith('memory');
  });

  it('never shows memories recorded for another conversation', () => {
    useResearchPanelStore
      .getState()
      .openPanel('conv-someone-else', 'msg-4', [], [], undefined, MEMORIES);
    render(<ResearchPanel />);

    expect(screen.queryByText('You are a solo founder of AGI Workforce')).toBeNull();
    expect(screen.getByText('No sources yet')).toBeInTheDocument();
  });
});
