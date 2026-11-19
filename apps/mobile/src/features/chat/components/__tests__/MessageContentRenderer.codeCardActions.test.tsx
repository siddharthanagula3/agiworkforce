import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Alert, StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

jest.mock('../MathBlock', () => ({ MathBlock: () => null }));

const mockExportSourceFile = jest.fn();
const mockShareFile = jest.fn();
jest.mock('@/services/fileCreation', () => ({
  exportSourceFile: (...args: unknown[]) => mockExportSourceFile(...args),
  shareFile: (...args: unknown[]) => mockShareFile(...args),
}));

import { renderMarkdownContent } from '../MessageContentRenderer';
import { AssistantDraftScope } from '../AssistantDraftScope';
import { clearAnswerDrafts, readAnswerDraft } from '../answerDraftStore';
import { SideScrollerRegistry } from '../SideScroller';
import { COPY_CONFIRMATION_MS } from '@/src/shared/hooks/useCopyAction';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const HIDDEN = { includeHiddenElements: true };
const SHORT = '```python\nprint(1)\n```';
const LONG = `\`\`\`python\n${Array.from({ length: 30 }, (_, i) => `x${i} = ${i}`).join('\n')}\n\`\`\``;

function renderCode(content: string, options?: Parameters<typeof renderMarkdownContent>[2]) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <AssistantDraftScope messageId="message-1">
        {renderMarkdownContent(content, undefined, { capCodeBlocks: true, ...options })}
      </AssistantDraftScope>
    </SafeAreaProvider>,
  );
}

const setString = Clipboard.setStringAsync as jest.Mock;

beforeEach(() => {
  clearAnswerDrafts();
  setString.mockReset();
  setString.mockResolvedValue(undefined);
  mockExportSourceFile.mockReset().mockResolvedValue({ uri: 'file:///exports/script' });
  mockShareFile.mockReset().mockResolvedValue(undefined);
});

describe('code card header buttons', () => {
  it.each(['Edit code', 'Download code.py', 'Copy code', 'Expand code'])(
    'makes %s a real 44 by 44 point box with no hit slop',
    (label) => {
      const button = renderCode(SHORT).getByLabelText(label);
      const style = StyleSheet.flatten(button.props.style);
      expect(style).toMatchObject({ minWidth: 44, minHeight: 44 });
      expect(button.props.hitSlop).toBeUndefined();
    },
  );

  it('keeps the header 44 tall and the buttons touching', () => {
    const screen = renderCode(SHORT);
    const header = screen.getByTestId('code-card-header');
    expect(StyleSheet.flatten(header.props.style)).toMatchObject({ minHeight: 44 });
    const buttons = within(header).getAllByRole('button');
    expect(buttons).toHaveLength(4);
    const row = screen.getByTestId('code-card-actions');
    expect(within(row).getAllByRole('button')).toHaveLength(4);
    expect(StyleSheet.flatten(row.props.style).gap).toBeUndefined();
  });

  it('shows Copied for two seconds, then Copy code again', async () => {
    jest.useFakeTimers();
    try {
      const screen = renderCode(SHORT);
      fireEvent.press(screen.getByLabelText('Copy code'));
      await waitFor(() => expect(screen.getByLabelText('Copied')).toBeTruthy());
      expect(setString).toHaveBeenCalledWith('print(1)');
      act(() => {
        jest.advanceTimersByTime(COPY_CONFIRMATION_MS);
      });
      expect(screen.getByLabelText('Copy code')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('says so when the clipboard write fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    setString.mockRejectedValueOnce(new Error('denied'));
    const screen = renderCode(SHORT);
    fireEvent.press(screen.getByLabelText('Copy code'));
    await waitFor(() => expect(screen.getByLabelText('Could not copy')).toBeTruthy());
    alert.mockRestore();
    warn.mockRestore();
  });

  it('still shares the file from Download and alerts when that fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = renderCode(SHORT);
    fireEvent.press(screen.getByLabelText('Download code.py'));
    await waitFor(() => expect(mockShareFile).toHaveBeenCalledWith('file:///exports/script'));
    mockExportSourceFile.mockRejectedValueOnce(new Error('disk'));
    fireEvent.press(screen.getByLabelText('Download code.py'));
    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith(
        'Download failed',
        'Could not save this code as a file. Try again.',
      ),
    );
    alert.mockRestore();
  });

  it('offers no Expand for an empty fence or while the answer is streaming', () => {
    expect(renderCode('```python\n\n```').queryByLabelText('Expand code')).toBeNull();
    expect(renderCode(SHORT, { highlightCode: false }).queryByLabelText('Expand code')).toBeNull();
  });
});

describe('expanded code', () => {
  it('opens full screen with the language, Copy, Download and Close, and closes again', async () => {
    const screen = renderCode(SHORT);
    fireEvent.press(screen.getByLabelText('Expand code'));
    const sheet = screen.getByTestId('code-full-screen');
    expect(within(sheet).getByText('python')).toBeTruthy();
    expect(within(sheet).getByLabelText('Copy code')).toBeTruthy();
    expect(within(sheet).getByLabelText('Download code.py')).toBeTruthy();
    expect(within(sheet).getByLabelText('python code block')).toBeTruthy();

    fireEvent.press(within(sheet).getByLabelText('Download code.py'));
    await waitFor(() => expect(mockShareFile).toHaveBeenCalledWith('file:///exports/script'));

    fireEvent.press(within(sheet).getByLabelText('Close code'));
    expect(screen.queryByTestId('code-full-screen')).toBeNull();
  });

  it('shows every line of a long block, without the cap', () => {
    const screen = renderCode(LONG);
    fireEvent.press(screen.getByLabelText('Expand code'));
    const sheet = screen.getByTestId('code-full-screen');
    expect(within(sheet).queryByTestId('code-cap')).toBeNull();
    expect(within(sheet).queryByText('Show more')).toBeNull();
    expect(
      within(sheet).getByLabelText('python code block').props.accessibilityValue.text,
    ).toContain('x29 = 29');
  });
});

describe('long code', () => {
  it('caps a finished block, fades the last line and offers Show more', () => {
    const screen = renderCode(LONG);
    expect(screen.getByTestId('code-cap')).toBeTruthy();
    expect(screen.getByTestId('code-cap-fade', HIDDEN)).toBeTruthy();
    const row = screen.getByLabelText('Show more code');
    expect(StyleSheet.flatten(row.props.style)).toMatchObject({ minHeight: 44 });
    expect(screen.getByText('Show more')).toBeTruthy();
  });

  it('shows the whole block on Show more and caps it again on Show less', () => {
    const screen = renderCode(LONG);
    fireEvent.press(screen.getByLabelText('Show more code'));
    expect(screen.queryByTestId('code-cap')).toBeNull();
    expect(screen.queryByTestId('code-cap-fade', HIDDEN)).toBeNull();
    expect(screen.getByText('Show less')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Show less code'));
    expect(screen.getByTestId('code-cap')).toBeTruthy();
    expect(screen.getByText('Show more')).toBeTruthy();
  });

  it('keeps the block open when the row is mounted again', () => {
    const first = renderCode(LONG);
    fireEvent.press(first.getByLabelText('Show more code'));
    first.unmount();

    const second = renderCode(LONG);
    expect(second.queryByTestId('code-cap')).toBeNull();
    expect(second.getByText('Show less')).toBeTruthy();
  });

  it('keeps the state per message', () => {
    const first = renderCode(LONG);
    fireEvent.press(first.getByLabelText('Show more code'));
    first.unmount();

    const other = render(
      <AssistantDraftScope messageId="message-2">
        {renderMarkdownContent(LONG, undefined, { capCodeBlocks: true })}
      </AssistantDraftScope>,
    );
    expect(other.getByTestId('code-cap')).toBeTruthy();
  });

  it('leaves a short block and a streaming block uncapped', () => {
    expect(renderCode(SHORT).queryByTestId('code-cap')).toBeNull();
    expect(renderCode(SHORT).queryByText('Show more')).toBeNull();
    const streaming = renderCode(LONG, { highlightCode: false });
    expect(streaming.queryByTestId('code-cap')).toBeNull();
    expect(streaming.queryByText('Show more')).toBeNull();
  });

  it('caps a diff block the same way', () => {
    const diff = `\`\`\`diff\n${Array.from({ length: 30 }, (_, i) => `+line ${i}`).join('\n')}\n\`\`\``;
    const screen = renderCode(diff);
    expect(screen.getByTestId('code-cap')).toBeTruthy();
    expect(screen.getByText('Show more')).toBeTruthy();
  });
});

describe('code cards outside a chat answer', () => {
  it('show the whole block with no Expand and no Show more', () => {
    const screen = renderCode(LONG, { capCodeBlocks: false });
    expect(screen.queryByTestId('code-cap')).toBeNull();
    expect(screen.queryByText('Show more')).toBeNull();
    expect(screen.queryByLabelText('Expand code')).toBeNull();
    expect(screen.getByLabelText('Copy code')).toBeTruthy();
  });
});

describe('code card state', () => {
  it('keeps no draft entry once a block is collapsed again', () => {
    const screen = renderCode(LONG);
    fireEvent.press(screen.getByLabelText('Show more code'));
    expect(readAnswerDraft('message-1\u0000code-lines\u0000md-fence-0')).toBe(true);
    fireEvent.press(screen.getByLabelText('Show less code'));
    expect(readAnswerDraft('message-1\u0000code-lines\u0000md-fence-0')).toBeUndefined();
  });

  it('keeps blocks apart when markdown is rendered inside markdown', () => {
    const screen = render(
      <AssistantDraftScope messageId="message-1">
        {renderMarkdownContent(LONG, undefined, { capCodeBlocks: true })}
        {renderMarkdownContent(LONG, undefined, { capCodeBlocks: true, keyBase: 'md-nested' })}
      </AssistantDraftScope>,
    );
    fireEvent.press(screen.getAllByLabelText('Show more code')[0]!);
    expect(screen.getAllByTestId('code-cap')).toHaveLength(1);
    expect(screen.getAllByLabelText('Show more code')).toHaveLength(1);
  });
});

describe('code full screen scrolling', () => {
  function layOutScrollers(root: ReactTestInstance) {
    const scrollers = root.findAll(
      (node) => node.props.horizontal === true && typeof node.props.onLayout === 'function',
    );
    act(() => {
      scrollers.forEach((node) => {
        node.props.onLayout({ nativeEvent: { layout: { width: 100, height: 40 } } });
        node.props.onContentSizeChange?.(600, 40);
      });
    });
    return scrollers.length;
  }

  it('does not hand the sideways scroller to the chat row swipe', () => {
    const register = jest.fn(() => () => undefined);
    const screen = render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <SideScrollerRegistry.Provider value={register}>
          <AssistantDraftScope messageId="message-1">
            {renderMarkdownContent(SHORT, undefined, { capCodeBlocks: true })}
          </AssistantDraftScope>
        </SideScrollerRegistry.Provider>
      </SafeAreaProvider>,
    );
    layOutScrollers(screen.root);
    expect(register).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('Expand code'));
    register.mockClear();
    layOutScrollers(screen.getByTestId('code-full-screen-body'));
    expect(register).not.toHaveBeenCalled();
  });
});
