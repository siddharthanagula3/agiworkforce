import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('@/src/features/chat/components/MathBlock', () => ({ MathBlock: () => null }));
jest.mock('@/services/fileCreation', () => ({
  exportSourceFile: jest.fn(),
  shareFile: jest.fn(),
}));
jest.mock('@/src/features/chat/components/SafeArtifactPreview', () => ({
  SafeArtifactPreview: () => null,
}));
jest.mock('@/src/lib/Capabilities', () => ({ useCapability: () => false }));

import { TranscriptFontContext } from '@/components/ui/transcriptFont';
import { renderMarkdownContent } from '@/src/features/chat/components/MessageContentRenderer';
import { AssistantDraftScope } from '@/src/features/chat/components/AssistantDraftScope';
import { CloudCodeComposer } from '@/src/features/cloud-code/components/CloudCodeComposer';
import {
  resolveCodeFontFamily,
  resolveTranscriptFontFamily,
} from '@/src/features/settings/code/codeAppearance';
import { useCodePreferences } from '@/src/features/settings/code/store';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderFence(content: string) {
  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA}>
      <AssistantDraftScope messageId="message-1">
        {renderMarkdownContent(content, undefined, { capCodeBlocks: true })}
      </AssistantDraftScope>
    </SafeAreaProvider>,
  );
}

function familyOf(node: { props: { style?: unknown } }): unknown {
  return StyleSheet.flatten(node.props.style as never)?.fontFamily;
}

const DIFF = '```diff\n-old line\n+new line\n context line\n```';

beforeEach(() => {
  useCodePreferences.setState({
    codeFont: 'default',
    transcriptFont: 'system',
    showDiffSigns: true,
  });
});

describe('chat code blocks follow the code font', () => {
  it('draws a fenced block in the saved code font and follows a change made while it is open', () => {
    const screen = renderFence('```python\nprint(1)\n```');
    expect(familyOf(screen.getByLabelText('python code block'))).toBe(
      resolveCodeFontFamily('default'),
    );

    act(() => useCodePreferences.getState().setCodeFont('courier'));
    expect(familyOf(screen.getByLabelText('python code block'))).toBe(
      resolveCodeFontFamily('courier'),
    );
  });

  it('draws the lines of a diff fence in the saved code font', () => {
    useCodePreferences.setState({ codeFont: 'courier' });
    const screen = renderFence(DIFF);

    expect(
      familyOf(screen.getByTestId('markdown-diff-line-added').findByType('Text' as never)),
    ).toBe(resolveCodeFontFamily('courier'));
  });
});

describe('chat diff fences follow the diff signs switch', () => {
  it('keeps the plus and minus signs by default', () => {
    const screen = renderFence(DIFF);

    expect(screen.getByTestId('markdown-diff-line-added')).toHaveTextContent('+new line');
    expect(screen.getByTestId('markdown-diff-line-removed')).toHaveTextContent('-old line');
    expect(screen.getByLabelText('Added line: +new line')).toBeTruthy();
  });

  it('drops the signs from added and removed lines, keeps the column and the context line', () => {
    useCodePreferences.setState({ showDiffSigns: false });
    const screen = renderFence(DIFF);

    const added = screen.getByTestId('markdown-diff-line-added');
    const removed = screen.getByTestId('markdown-diff-line-removed');
    expect(added).toHaveTextContent(' new line', { normalizer: (text: string) => text });
    expect(removed).toHaveTextContent(' old line', { normalizer: (text: string) => text });
    expect(screen.getByLabelText('Added line: new line')).toBeTruthy();
    expect(screen.getByLabelText('Removed line: old line')).toBeTruthy();
    expect(screen.getByTestId('markdown-diff-line-context')).toHaveTextContent(' context line', {
      normalizer: (text: string) => text,
    });
  });

  it('follows the switch while the diff is on screen', () => {
    const screen = renderFence(DIFF);
    expect(screen.getByTestId('markdown-diff-line-added')).toHaveTextContent('+new line');

    act(() => useCodePreferences.getState().setShowDiffSigns(false));

    expect(screen.getByTestId('markdown-diff-line-added')).not.toHaveTextContent('+new line');
  });
});

describe('expanded code under a transcript font', () => {
  it('keeps the app face for the chrome and the code font for the code', () => {
    const screen = render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <TranscriptFontContext.Provider value="Georgia">
          <AssistantDraftScope messageId="message-1">
            {renderMarkdownContent('```python\nprint(1)\n```', undefined, { capCodeBlocks: true })}
          </AssistantDraftScope>
        </TranscriptFontContext.Provider>
      </SafeAreaProvider>,
    );
    fireEvent.press(screen.getByLabelText('Expand code'));

    const sheet = screen.getByTestId('code-full-screen');
    expect(familyOf(within(sheet).getByText('python'))).toBeUndefined();
    expect(familyOf(within(sheet).getByLabelText('python code block'))).toBe(
      resolveCodeFontFamily('default'),
    );
  });
});

describe('HTML preview under a transcript font', () => {
  it('keeps the app face for the sheet title and the code font for the source', () => {
    const screen = render(
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <TranscriptFontContext.Provider value="Georgia">
          <AssistantDraftScope messageId="message-1">
            {renderMarkdownContent('```html\n<p>hi</p>\n```', undefined, { capCodeBlocks: true })}
          </AssistantDraftScope>
        </TranscriptFontContext.Provider>
      </SafeAreaProvider>,
    );
    fireEvent.press(screen.getByLabelText('Preview HTML'));

    const sheet = screen.getByTestId('html-preview-sheet');
    expect(familyOf(within(sheet).getByText('HTML preview'))).toBeUndefined();
    expect(familyOf(within(sheet).getByText('Source'))).toBeUndefined();
  });
});

describe('AGI Code composer field', () => {
  const props = {
    value: 'run the tests',
    working: false,
    stopping: false,
    detail: 'Auto',
    optionsLabel: 'Session options',
    onChangeText: jest.fn(),
    onSend: jest.fn(),
    onStop: jest.fn(),
    onOpenOptions: jest.fn(),
  };

  it('keeps the app face for the default transcript font', () => {
    const screen = render(<CloudCodeComposer {...props} />);

    expect(familyOf(screen.getByLabelText('Message for this session'))).toBeUndefined();
  });

  it('takes the chosen code font when the transcript font is Mono', () => {
    useCodePreferences.setState({ transcriptFont: 'mono', codeFont: 'courier' });
    const screen = render(<CloudCodeComposer {...props} />);

    expect(familyOf(screen.getByLabelText('Message for this session'))).toBe(
      resolveCodeFontFamily('courier'),
    );
  });

  it('takes the serif face when the transcript font is Serif', () => {
    useCodePreferences.setState({ transcriptFont: 'serif' });
    const screen = render(<CloudCodeComposer {...props} />);

    expect(familyOf(screen.getByLabelText('Message for this session'))).toBe(
      resolveTranscriptFontFamily('serif', 'default'),
    );
  });
});
