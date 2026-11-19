import { Alert, KeyboardAvoidingView, Linking, Share, View, type AlertButton } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { renderMarkdownContent } from '@/src/features/chat/components/MessageContentRenderer';
import {
  AssistantDraftScope,
  hasUnsavedAnswerEdits,
} from '@/src/features/chat/components/AssistantDraftScope';
import { clearAnswerDrafts } from '@/src/features/chat/components/answerDraftStore';
import { AssistantFenceEditError } from '@/src/features/chat/services/assistantFenceEditRequest';
import { lightColors } from '@/src/ui/theme/tokens';

jest.mock('react-native-webview', () => ({ WebView: () => null }));

const ORIGINAL = 'A draft that remains editable.';
const EDITED = '  A revised draft.\nKeep these  spaces.\n';
const writing = (text: string, language = 'writing') => `\`\`\`${language}\n${text}\n\`\`\``;
const email = (body: string) =>
  `\`\`\`email\nTo: reader@example.com\nSubject: Review\n\n${body}\n\`\`\``;

function Reply({
  content,
  identity = 'turn-1',
  streaming = false,
}: {
  content: string;
  identity?: string;
  streaming?: boolean;
}) {
  return (
    <View key={identity}>
      {renderMarkdownContent(content, lightColors, { highlightCode: !streaming })}
    </View>
  );
}

function ScopedReply({
  content,
  messageId = 'message-1',
  save,
}: {
  content: string;
  messageId?: string;
  save?: jest.Mock;
}) {
  return (
    <AssistantDraftScope messageId={messageId} {...(save ? { saveFenceEdit: save } : {})}>
      <View>{renderMarkdownContent(content, lightColors)}</View>
    </AssistantDraftScope>
  );
}

function lastAlertButton(text: string): AlertButton {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? [];
  const button = buttons.find((candidate) => candidate.text === text);
  if (!button) throw new Error(`No ${text} button in the last alert`);
  return button;
}

function startEditing(label = 'Writing') {
  fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
  return screen.getByLabelText(`Edit ${label}`);
}

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  act(() => clearAnswerDrafts());
});

describe('writing drafts', () => {
  it('shows the body as formatted Markdown and math until Edit is tapped', () => {
    render(
      <Reply
        content={writing('# Launch notes\n\n- **Ready** to ship\n- Area is $x^2$', 'document')}
      />,
    );
    const card = screen.getByTestId('answer-surface-writing');
    expect(within(card).getByText('Document')).toBeOnTheScreen();
    expect(within(card).getByText('Launch notes')).toBeOnTheScreen();
    expect(within(card).getByText('Ready')).toBeOnTheScreen();
    expect(within(card).getByLabelText('Inline math: x squared')).toBeOnTheScreen();
    expect(within(card).queryByText(/\*\*|^# /)).toBeNull();
    expect(screen.queryByLabelText('Edit Document')).toBeNull();

    const editor = startEditing('Document');
    expect(editor).toHaveDisplayValue('# Launch notes\n\n- **Ready** to ship\n- Area is $x^2$');
  });

  it('copies and shares the exact visible edit', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    render(<Reply content={writing(ORIGINAL)} />);
    fireEvent.changeText(startEditing(), EDITED);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copy draft' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(EDITED);
    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledWith({ message: EDITED });
    expect(screen.getByDisplayValue(EDITED)).toBeOnTheScreen();
  });

  it('retains an edit when prose after the same source grows', () => {
    const view = render(<Reply content={writing(ORIGINAL)} />);
    fireEvent.changeText(startEditing(), EDITED);
    view.rerender(<Reply content={`${writing(ORIGINAL)}\n\nMore prose.`} />);

    expect(screen.getByDisplayValue(EDITED)).toBeOnTheScreen();
  });

  it('keeps identical source blocks independent', async () => {
    render(<Reply content={`${writing(ORIGINAL)}\n\n${writing(ORIGINAL)}`} />);
    const drafts = screen.getAllByTestId('answer-surface-writing');
    fireEvent.press(within(drafts[0]!).getByRole('button', { name: 'Edit' }));
    fireEvent.changeText(within(drafts[0]!).getByLabelText('Edit Writing'), EDITED);
    expect(within(drafts[1]!).getByText(ORIGINAL)).toBeOnTheScreen();

    await act(async () => {
      fireEvent.press(within(drafts[0]!).getByRole('button', { name: 'Copy draft' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(EDITED);
    await act(async () => {
      fireEvent.press(within(drafts[1]!).getByRole('button', { name: 'Copy draft' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(ORIGINAL);
  });

  it('says edits cannot be saved here when no save path exists', () => {
    const view = render(<Reply content={writing(ORIGINAL)} />);
    fireEvent.changeText(startEditing(), EDITED);
    expect(
      screen.getByText('Edits stay in this preview. Copy or share to keep them.'),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    view.unmount();
    render(<Reply content={writing(ORIGINAL)} />);
    expect(screen.getByText(ORIGINAL)).toBeOnTheScreen();
  });

  it('leaves edit mode without asking when nothing changed', () => {
    render(<Reply content={writing(ORIGINAL)} />);
    startEditing();
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Edit Writing')).toBeNull();
    expect(screen.getByText(ORIGINAL)).toBeOnTheScreen();
  });

  it('asks before discarding an edit and restores the assistant text only on Discard', () => {
    render(<Reply content={writing(ORIGINAL)} />);
    fireEvent.changeText(startEditing(), EDITED);
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Discard unsaved changes?',
      'Your unsaved changes to this draft will be lost.',
      [
        { text: 'Keep editing', style: 'cancel' },
        expect.objectContaining({ text: 'Discard changes', style: 'destructive' }),
      ],
    );
    expect(screen.getByDisplayValue(EDITED)).toBeOnTheScreen();

    act(() => lastAlertButton('Discard changes').onPress?.());
    expect(screen.queryByDisplayValue(EDITED)).toBeNull();
    expect(screen.getByText(ORIGINAL)).toBeOnTheScreen();
  });

  it('is read-only with no actions while the reply streams', () => {
    const view = render(<Reply content={'```document\nFirst line of the'} streaming />);
    expect(screen.getByTestId('answer-surface-writing')).toBeOnTheScreen();
    for (const name of ['Edit', 'Copy draft', 'Share', 'Open larger to read and edit']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    view.rerender(<Reply content={writing('First line of the draft.', 'document')} />);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeOnTheScreen();
  });

  it('makes a prompt fence editable with Copy full prompt', async () => {
    render(<Reply content={writing('Summarise the attached notes.', 'prompt')} />);
    expect(screen.getByTestId('answer-surface-writing')).toBeOnTheScreen();
    fireEvent.changeText(startEditing('Prompt'), 'Summarise the notes in three lines.');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copy full prompt' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(
      'Summarise the notes in three lines.',
    );
  });

  it('opens a full-screen editor that shares its edits with the card', async () => {
    render(<Reply content={writing(ORIGINAL, 'message')} />);
    fireEvent.press(screen.getByRole('button', { name: 'Open larger to read and edit' }));
    const sheet = screen.getByTestId('writing-expand-sheet');
    fireEvent.changeText(within(sheet).getByLabelText('Edit Chat message'), EDITED);
    await act(async () => {
      fireEvent.press(within(sheet).getByRole('button', { name: 'Copy draft' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(EDITED);
    fireEvent.press(within(sheet).getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('writing-expand-sheet')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copy draft' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(EDITED);
  });

  it('keeps the full-screen editor above the keyboard inside the sheet', () => {
    render(<Reply content={writing(ORIGINAL, 'message')} />);
    fireEvent.press(screen.getByRole('button', { name: 'Open larger to read and edit' }));
    const sheet = screen.getByTestId('writing-expand-sheet');
    const ancestors: unknown[] = [];
    for (
      let node = within(sheet).getByLabelText('Edit Chat message').parent;
      node;
      node = node.parent
    ) {
      ancestors.push(node.type);
      if (node === sheet) break;
    }
    expect(ancestors).toContain(KeyboardAvoidingView);
    expect(ancestors[ancestors.length - 1]).toBe(sheet.type);
    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
  });
});

describe('saving writing drafts into the message', () => {
  it('saves the exact edit for this block and closes the editor', async () => {
    const save = jest.fn(async () => undefined);
    render(<ScopedReply content={writing(ORIGINAL, 'post')} save={save} />);
    startEditing('Social post');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('Edit Social post'), EDITED);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    });
    expect(save).toHaveBeenCalledWith({ language: 'post', identity: ORIGINAL, content: EDITED });
    expect(screen.queryByLabelText('Edit Social post')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });

  it('keeps the edit and says why when saving fails', async () => {
    const save = jest.fn(async () => {
      throw new AssistantFenceEditError(
        'This block changed. Reopen the chat before saving your edit.',
      );
    });
    render(<ScopedReply content={writing(ORIGINAL)} save={save} />);
    fireEvent.changeText(startEditing(), EDITED);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    });
    expect(
      screen.getByText('This block changed. Reopen the chat before saving your edit.'),
    ).toBeOnTheScreen();
    expect(screen.getByDisplayValue(EDITED)).toBeOnTheScreen();
  });

  it('shows the saved text once the message carries it', async () => {
    const save = jest.fn(async () => undefined);
    const view = render(<ScopedReply content={writing(ORIGINAL)} save={save} />);
    fireEvent.changeText(startEditing(), 'The saved draft.');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    });
    view.rerender(<ScopedReply content={writing('The saved draft.')} save={save} />);
    expect(screen.getByText('The saved draft.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    view.rerender(<ScopedReply content={writing('A later change.')} save={save} />);
    expect(screen.getByText('A later change.')).toBeOnTheScreen();
  });

  it('saves from the full-screen editor and closes it', async () => {
    const save = jest.fn(async () => undefined);
    render(<ScopedReply content={writing(ORIGINAL)} save={save} />);
    fireEvent.press(screen.getByRole('button', { name: 'Open larger to read and edit' }));
    const sheet = screen.getByTestId('writing-expand-sheet');
    fireEvent.changeText(within(sheet).getByLabelText('Edit Writing'), EDITED);
    await act(async () => {
      fireEvent.press(within(sheet).getByRole('button', { name: 'Save changes' }));
    });
    expect(save).toHaveBeenCalledWith({ language: 'writing', identity: ORIGINAL, content: EDITED });
    expect(screen.queryByTestId('writing-expand-sheet')).toBeNull();
  });

  it('keeps an unsaved edit when the row is recycled and when the source changes', () => {
    const view = render(<ScopedReply content={writing(ORIGINAL)} />);
    fireEvent.changeText(startEditing(), EDITED);
    view.unmount();

    const again = render(<ScopedReply content={writing(ORIGINAL)} />);
    expect(screen.getByDisplayValue(EDITED)).toBeOnTheScreen();
    again.rerender(<ScopedReply content={writing('A synced replacement.')} />);
    expect(screen.getByDisplayValue(EDITED)).toBeOnTheScreen();
  });

  it('does not carry an edit into another message with the same text', () => {
    const view = render(<ScopedReply content={writing(ORIGINAL)} messageId="message-1" />);
    fireEvent.changeText(startEditing(), EDITED);
    view.rerender(<ScopedReply content={writing(ORIGINAL)} messageId="message-2" />);
    expect(screen.queryByDisplayValue(EDITED)).toBeNull();
    expect(screen.getByText(ORIGINAL)).toBeOnTheScreen();
  });
});

describe('email drafts', () => {
  const FULL =
    '```email\nTo: reader@example.com\nCc: reviewer@example.com\nBcc: archive@example.com\nSubject: Review\n\nReady for review.\n```';

  it('labels every field and opens the address keyboard without capitals or correction', () => {
    render(<Reply content={FULL} />);
    const card = screen.getByTestId('answer-surface-email');
    for (const label of ['To', 'Cc', 'Bcc', 'Subject']) {
      expect(within(card).getByText(label, { includeHiddenElements: true })).toBeOnTheScreen();
    }
    for (const label of ['To', 'Cc', 'Bcc']) {
      const input = screen.getByLabelText(label);
      expect(input.props.keyboardType).toBe('email-address');
      expect(input.props.autoCapitalize).toBe('none');
      expect(input.props.autoCorrect).toBe(false);
      expect(input.props.editable).toBe(true);
    }
    const subject = screen.getByLabelText('Subject');
    expect(subject.props.multiline).toBe(true);
    expect(subject.props.submitBehavior).toBe('blurAndSubmit');
  });

  it('copies and shares every edited field, with newlines kept out of the subject', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    render(<Reply content={FULL} />);
    fireEvent.changeText(screen.getByLabelText('To'), 'edited-reader@example.com');
    fireEvent.changeText(screen.getByLabelText('Cc'), 'second-reviewer@example.com');
    fireEvent.changeText(screen.getByLabelText('Bcc'), 'records@example.com');
    fireEvent.changeText(screen.getByLabelText('Subject'), 'Updated\nreview');
    fireEvent.changeText(screen.getByLabelText('Message'), EDITED);
    const expected =
      'To: edited-reader@example.com\nCc: second-reviewer@example.com\nBcc: records@example.com\nSubject: Updatedreview\n\n' +
      EDITED;
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copy email' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(expected);
    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledWith({ message: expected });
  });

  it('reveals empty Cc and Bcc rows from Edit', () => {
    render(<Reply content={email('The body.')} />);
    expect(screen.queryByLabelText('Cc')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.changeText(screen.getByLabelText('Cc'), 'added@example.com');
    expect(screen.getByLabelText('Bcc')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Cc')).toHaveDisplayValue('added@example.com');
    expect(screen.queryByLabelText('Bcc')).toBeNull();
  });

  it('copies the body without a synthetic newline after every header is cleared', async () => {
    render(<Reply content={email('The body.')} />);
    fireEvent.changeText(screen.getByLabelText('To'), '');
    fireEvent.changeText(screen.getByLabelText('Subject'), '');
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Copy email' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith('The body.');
  });

  it('hands the addressed draft to Mail only after the mail confirmation, sending nothing', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(
      <Reply
        content={
          '```email\nTo: reader@example.com\nCc: reviewer@example.com\nSubject: Review notes\n\nReady.\nThanks\n```'
        }
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Open in Mail' }));
    const href =
      'mailto:reader%40example.com?cc=reviewer%40example.com&subject=Review%20notes&body=Ready.%0D%0AThanks';
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Open in Mail?',
      'To: reader@example.com\nCc: reviewer@example.com\nSubject: Review notes',
      expect.any(Array),
    );
    expect(open).not.toHaveBeenCalled();
    act(() => lastAlertButton('Open').onPress?.());
    expect(open).toHaveBeenCalledWith(href);
  });

  it('copies a body too long for a mail link first and says so', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const body = 'Long line. '.repeat(220).trim();
    render(<Reply content={email(body)} />);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Open in Mail' }));
    });
    expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(body);
    expect(
      screen.getByText(
        'This message is too long for a mail link, so it was copied. Paste it into the new email.',
      ),
    ).toBeOnTheScreen();
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Open in Mail?',
      'To: reader@example.com\nSubject: Review',
      expect.any(Array),
    );
    act(() => lastAlertButton('Open').onPress?.());
    expect(open).toHaveBeenCalledWith('mailto:reader%40example.com?subject=Review');
  });

  it('draws the card from the first header line and keeps it read-only while streaming', () => {
    const view = render(<Reply content={'```email\nTo: reader@example.com'} streaming />);
    expect(screen.getByTestId('answer-surface-email')).toBeOnTheScreen();
    expect(screen.queryByTestId('answer-fallback')).toBeNull();
    expect(screen.getByLabelText('To')).toHaveDisplayValue('reader@example.com');
    expect(screen.getByLabelText('To').props.editable).toBe(false);
    expect(screen.getByLabelText('Message').props.editable).toBe(false);
    for (const name of ['Copy email', 'Share', 'Edit', 'Open in Mail']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }

    view.rerender(
      <Reply content={'```email\nTo: reader@example.com\nSubject: Review\n\nHello'} streaming />,
    );
    expect(screen.getByLabelText('Subject')).toHaveDisplayValue('Review');
    expect(screen.getByLabelText('Subject').props.editable).toBe(false);

    view.rerender(<Reply content={email('Hello there.')} />);
    expect(screen.getByLabelText('Message').props.editable).toBe(true);
    expect(screen.getByRole('button', { name: 'Copy email' })).toBeOnTheScreen();
  });

  it('reinitializes unscoped preview fields when their canonical source changes', () => {
    const view = render(<Reply content={email(ORIGINAL)} />);
    fireEvent.changeText(screen.getByLabelText('Message'), EDITED);
    view.rerender(<Reply content={email('A replacement email.')} />);

    expect(screen.getByLabelText('Message')).toHaveDisplayValue('A replacement email.');
  });

  it('saves the edited email as its plain text and asks before discarding', async () => {
    const save = jest.fn(async () => undefined);
    render(<ScopedReply content={email('Hello.')} save={save} />);
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Subject'), 'Review today');
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(Alert.alert).toHaveBeenLastCalledWith(
      'Discard unsaved changes?',
      'Your unsaved changes to this draft will be lost.',
      expect.any(Array),
    );
    expect(screen.getByLabelText('Subject')).toHaveDisplayValue('Review today');

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    });
    expect(save).toHaveBeenCalledWith({
      language: 'email',
      identity: 'To: reader@example.com\nSubject: Review\n\nHello.',
      content: 'To: reader@example.com\nSubject: Review today\n\nHello.',
    });
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });

  it('restores the assistant fields after Discard changes', () => {
    render(<ScopedReply content={email('Hello.')} save={jest.fn()} />);
    fireEvent.changeText(screen.getByLabelText('Message'), EDITED);
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    act(() => lastAlertButton('Discard changes').onPress?.());
    expect(screen.getByLabelText('Message')).toHaveDisplayValue('Hello.');
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
});

describe('unsaved edits that Regenerate and Edit must ask about', () => {
  it('reports an unsaved writing edit for its own message, also after the row is recycled', () => {
    const view = render(<ScopedReply content={writing(ORIGINAL)} messageId="message-1" />);
    expect(hasUnsavedAnswerEdits('message-1')).toBe(false);
    fireEvent.changeText(startEditing(), EDITED);
    expect(hasUnsavedAnswerEdits('message-1')).toBe(true);
    expect(hasUnsavedAnswerEdits('message-2')).toBe(false);

    view.unmount();
    expect(hasUnsavedAnswerEdits('message-1')).toBe(true);

    render(<ScopedReply content={writing(ORIGINAL)} messageId="message-1" save={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    act(() => lastAlertButton('Discard changes').onPress?.());
    expect(hasUnsavedAnswerEdits('message-1')).toBe(false);
  });

  it('clears once the edit is saved', async () => {
    const save = jest.fn(async () => undefined);
    render(<ScopedReply content={writing(ORIGINAL)} save={save} />);
    fireEvent.changeText(startEditing(), EDITED);
    expect(hasUnsavedAnswerEdits('message-1')).toBe(true);
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    });
    expect(hasUnsavedAnswerEdits('message-1')).toBe(false);
  });

  it('reports an edited email field and forgets it when the drafts are cleared', () => {
    render(<ScopedReply content={email('Hello.')} save={jest.fn()} />);
    fireEvent.changeText(screen.getByLabelText('Subject'), 'Review today');
    expect(hasUnsavedAnswerEdits('message-1')).toBe(true);
    act(() => clearAnswerDrafts());
    expect(hasUnsavedAnswerEdits('message-1')).toBe(false);
  });
});
