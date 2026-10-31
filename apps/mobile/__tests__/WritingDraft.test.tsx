import { View, Share } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { renderMarkdownContent } from '@/src/features/chat/components/MessageContentRenderer';
import { lightColors } from '@/src/ui/theme/tokens';

const ORIGINAL = 'A draft that remains editable.';
const EDITED = '  A revised draft.\nKeep these  spaces.\n';
const writing = (text: string) => `\`\`\`writing\n${text}\n\`\`\``;

function Reply({ content, identity = 'turn-1' }: { content: string; identity?: string }) {
  return <View key={identity}>{renderMarkdownContent(content, lightColors)}</View>;
}

describe('native writing preview edits', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('copies and shares the exact visible edit', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    render(<Reply content={writing(ORIGINAL)} />);
    fireEvent.changeText(screen.getByDisplayValue(ORIGINAL), EDITED);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copy draft' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(EDITED);
    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledWith({ message: EDITED });
    expect(screen.getByDisplayValue(EDITED)).toBeOnTheScreen();
  });

  it('retains a local edit when prose after the same source grows', () => {
    const view = render(<Reply content={writing(ORIGINAL)} />);
    fireEvent.changeText(screen.getByDisplayValue(ORIGINAL), EDITED);
    view.rerender(<Reply content={`${writing(ORIGINAL)}\n\nMore prose.`} />);

    expect(screen.getByDisplayValue(EDITED)).toBeOnTheScreen();
  });

  it('starts from a changed source instead of copying a stale local edit', async () => {
    const view = render(<Reply content={writing(ORIGINAL)} />);
    fireEvent.changeText(screen.getByDisplayValue(ORIGINAL), EDITED);
    view.rerender(<Reply content={writing('A replacement draft.')} />);

    expect(screen.getByDisplayValue('A replacement draft.')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copy draft' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith('A replacement draft.');
  });

  it('keeps identical source blocks independent', async () => {
    render(<Reply content={`${writing(ORIGINAL)}\n\n${writing(ORIGINAL)}`} />);
    const drafts = screen.getAllByTestId('answer-surface-writing');
    fireEvent.changeText(within(drafts[0]!).getByDisplayValue(ORIGINAL), EDITED);
    expect(within(drafts[1]!).getByDisplayValue(ORIGINAL)).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(within(drafts[0]!).getByRole('button', { name: 'Copy draft' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(EDITED);
    await act(async () => {
      fireEvent.press(within(drafts[1]!).getByRole('button', { name: 'Copy draft' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(ORIGINAL);
  });

  it('states the preview-only boundary and reopens from the original source', () => {
    const view = render(<Reply content={writing(ORIGINAL)} />);
    fireEvent.changeText(screen.getByDisplayValue(ORIGINAL), EDITED);
    expect(
      screen.getByText('Edits stay in this preview. Copy or share to keep them.'),
    ).toBeOnTheScreen();
    view.unmount();
    render(<Reply content={writing(ORIGINAL)} />);
    expect(screen.getByDisplayValue(ORIGINAL)).toBeOnTheScreen();
  });

  it('isolates a reused message container from another message with identical source', () => {
    const view = render(<Reply content={writing(ORIGINAL)} identity="turn-1" />);
    fireEvent.changeText(screen.getByDisplayValue(ORIGINAL), EDITED);
    view.rerender(<Reply content={writing(ORIGINAL)} identity="turn-2" />);

    expect(screen.getByDisplayValue(ORIGINAL)).toBeOnTheScreen();
  });

  it('preserves visible Cc/Bcc while copying and sharing edited email fields', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    const content =
      '```email\nTo: reader@example.com\nCc: reviewer@example.com\nBcc: archive@example.com\nSubject: Review\n\nReady for review.\n```';
    render(<Reply content={content} />);
    fireEvent.changeText(screen.getByLabelText('To'), 'edited-reader@example.com');
    fireEvent.changeText(screen.getByLabelText('Subject'), 'Updated review');
    fireEvent.changeText(screen.getByLabelText('Message'), EDITED);
    for (const text of ['Cc: reviewer@example.com', 'Bcc: archive@example.com']) {
      const recipient = screen.getByText(text);
      expect(recipient.props.selectable).toBe(true);
      expect(recipient.props.numberOfLines).toBe(3);
      expect(recipient).toHaveStyle({ maxWidth: '100%' });
    }
    const expected =
      'To: edited-reader@example.com\nCc: reviewer@example.com\nBcc: archive@example.com\nSubject: Updated review\n\n' +
      EDITED;
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copy email' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(expected);
    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledWith({ message: expected });
  });

  it('reinitializes email preview fields when their canonical source changes', () => {
    const email = (body: string) =>
      `\`\`\`email\nTo: reader@example.com\nSubject: Review\n\n${body}\n\`\`\``;
    const view = render(<Reply content={email(ORIGINAL)} />);
    fireEvent.changeText(screen.getByLabelText('Message'), EDITED);
    view.rerender(<Reply content={email('A replacement email.')} />);

    expect(screen.getByLabelText('Message')).toHaveDisplayValue('A replacement email.');
  });

  it('copies the body without a synthetic newline after every header is cleared', async () => {
    render(
      <Reply content={'```email\nTo: reader@example.com\nSubject: Review\n\nThe body.\n```'} />,
    );
    fireEvent.changeText(screen.getByLabelText('To'), '');
    fireEvent.changeText(screen.getByLabelText('Subject'), '');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copy email' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith('The body.');
  });
});
