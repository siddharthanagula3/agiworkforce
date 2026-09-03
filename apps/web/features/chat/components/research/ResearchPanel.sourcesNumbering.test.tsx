import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ResearchPanel } from './ResearchPanel';
import { useResearchPanelStore } from '../../stores/research-panel-store';
import { useChatStore } from '@shared/stores/web-chat-store';

const CONVERSATION_ID = 'conv-research-numbering';

beforeEach(() => {
  useChatStore.setState({ activeConversationId: CONVERSATION_ID });
});

describe('ResearchPanel · citation numbering', () => {
  it('numbers Citations rows by the inline marker they back and leaves More rows unnumbered', async () => {
    useResearchPanelStore.getState().openPanel(
      CONVERSATION_ID,
      'msg-1',
      [
        { url: 'https://a.com/1', title: 'First', citationIndex: 1 },
        { url: 'https://a.com/2', title: 'Second', citationIndex: 2 },
      ],
      [
        { url: 'https://a.com/3', title: 'Third' },
        { url: 'https://a.com/4', title: 'Fourth' },
      ],
    );
    render(<ResearchPanel />);

    const citationsGroup = (await screen.findByText('Citations')).closest('div');
    expect(citationsGroup).not.toBeNull();
    expect(within(citationsGroup as HTMLElement).getByText('1')).toBeInTheDocument();
    expect(within(citationsGroup as HTMLElement).getByText('2')).toBeInTheDocument();

    const moreGroup = screen.getByText('More').closest('div');
    expect(moreGroup).not.toBeNull();
    expect(within(moreGroup as HTMLElement).queryByText('3')).toBeNull();
    expect(within(moreGroup as HTMLElement).queryByText('4')).toBeNull();
    expect(within(moreGroup as HTMLElement).getByText('Third')).toBeInTheDocument();
    expect(within(moreGroup as HTMLElement).getByText('Fourth')).toBeInTheDocument();
  });

  it('shows the deduped union count in the header badge', async () => {
    useResearchPanelStore
      .getState()
      .openPanel(
        CONVERSATION_ID,
        'msg-2',
        [{ url: 'https://a.com/1', title: 'First', citationIndex: 1 }],
        [{ url: 'https://a.com/2', title: 'Second' }],
      );
    render(<ResearchPanel />);

    expect(await screen.findByText('2')).toBeInTheDocument();
  });
});
