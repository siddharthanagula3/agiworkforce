import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { renderMarkdownContent } from '../MessageContentRenderer';
import {
  MIXED_ASSISTANT_REPLY,
  MIXED_REPLY_THROUGH_EMAIL,
} from '@agiworkforce/unified-chat/assistant-fence';

function renderReply(content: string, onFollowUp?: (text: string) => void) {
  return render(<>{renderMarkdownContent(content, undefined, onFollowUp ? { onFollowUp } : {})}</>);
}

function joinedText(view: { toJSON: () => unknown }): string {
  const tree = view.toJSON();
  return tree ? JSON.stringify(tree) : '';
}

describe('mobile mixed assistant reply', () => {
  it('renders one mixed reply in order, with chart values, fallbacks, copy, follow-up, and one email after growth', async () => {
    const partial = renderReply(MIXED_REPLY_THROUGH_EMAIL);
    expect(partial.getAllByTestId('answer-surface-email')).toHaveLength(1);
    partial.unmount();

    const onFollowUp = jest.fn();
    const view = renderReply(`${MIXED_ASSISTANT_REPLY}\n\nMore prose.`, onFollowUp);
    const text = joinedText(view);
    let at = -1;
    for (const part of [
      'Here is the plan in ordinary prose.',
      'ada@example.com',
      'ready',
      'Inspect the application.',
      'pnpm test',
      'Passed',
      'Jan',
      '10',
      'Feb',
      '30',
      '1 of 2',
      'Writing blocks',
      '2 assertions failed',
      'Show the document',
      'title: Missing the address',
      'A widget this client does not draw.',
      'Open the application.',
      'More prose.',
    ]) {
      const next = text.indexOf(part, at + 1);
      expect(next).toBeGreaterThan(at);
      at = next;
    }

    expect(screen.getAllByTestId('answer-surface-email')).toHaveLength(1);
    expect(screen.getByLabelText('Jan 10')).toBeTruthy();
    expect(screen.getByLabelText('Feb 30')).toBeTruthy();
    const fallbacks = screen.getAllByTestId('answer-fallback');
    expect(fallbacks).toHaveLength(2);
    expect(screen.getByText('title: Missing the address')).toBeTruthy();
    expect(screen.getByText('A widget this client does not draw.')).toBeTruthy();
    expect(text).not.toContain('javascript:');
    expect(screen.queryByText('Send')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
    expect(screen.getByText(/have not been executed/)).toBeTruthy();
    expect(screen.getByText(/Passed/)).toBeTruthy();
    expect(screen.getByText(/Pending/)).toBeTruthy();
    expect(screen.getAllByText(/Failed/).length).toBeGreaterThan(0);
    expect(screen.getByTestId('answer-surface-tool')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copy full prompt' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Inspect the application.');
    const copied = (Clipboard.setStringAsync as jest.Mock).mock.calls.at(-1)?.[0] as string;
    expect(copied).not.toContain('Copy full prompt');
    expect(copied).not.toContain('Prompt');

    fireEvent.press(screen.getByRole('checkbox', { name: 'Verify chat rendering' }));
    expect(screen.getByText('2 of 2')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Show the document' }));
    expect(onFollowUp).toHaveBeenCalledWith('Show the document');
  });
});
