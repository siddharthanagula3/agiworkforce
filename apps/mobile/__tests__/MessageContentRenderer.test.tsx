import { Alert, Linking, ScrollView, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../src/features/chat/components/MathBlock', () => ({
  MathBlock: () => null,
}));

jest.mock('../src/features/chat/components/GeneratedImage', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GeneratedImage: ({ imageUrl, revisedPrompt }: { imageUrl: string; revisedPrompt?: string }) => (
      <Text testID="generated-image">{`${imageUrl}|${revisedPrompt ?? ''}`}</Text>
    ),
  };
});

const mockOpenBrowserAsync = jest.fn();
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

import { renderMarkdownContent } from '../src/features/chat/components/MessageContentRenderer';
import { syntaxTokenColor } from '../src/features/chat/utils/syntaxHighlight';
import { lightColors } from '../src/ui/theme';

describe('MessageContentRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOpenBrowserAsync.mockResolvedValue({ type: 'dismiss' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows an image the free-media route returns as a markdown image, not as raw text', () => {
    const { getByTestId, queryByText } = render(
      <View>
        {renderMarkdownContent(
          '![Generated image](</api/files/1b4e28ba-2fa1-11d2-883f-0016d3cca427>)',
          lightColors,
        )}
      </View>,
    );

    expect(getByTestId('generated-image').props.children).toBe(
      '/api/files/1b4e28ba-2fa1-11d2-883f-0016d3cca427|Generated image',
    );
    expect(queryByText(/!\[Generated image\]/)).toBeNull();
  });

  it('keeps a markdown image from an outside host as text instead of loading it', () => {
    const { queryByTestId } = render(
      <View>
        {renderMarkdownContent('![tracker](https://example.com/pixel.png)', lightColors)}
      </View>,
    );

    expect(queryByTestId('generated-image')).toBeNull();
  });

  it('renders inline bold text with the active text color in light mode', () => {
    const { getByText } = render(
      <View>
        {renderMarkdownContent('**Test Sheet Controls** refer to protocols.', lightColors)}
      </View>,
    );

    expect(getByText('Test Sheet Controls')).toHaveStyle({
      color: lightColors.textPrimary,
      fontWeight: '700',
    });
  });

  it('renders ordered list item text with readable color', () => {
    const { getByText } = render(
      <View>{renderMarkdownContent('1. Restricting access to test sheets.', lightColors)}</View>,
    );

    expect(getByText('Restricting access to test sheets.')).toHaveStyle({
      color: lightColors.textPrimary,
    });
  });

  it('opens http and https markdown links in the in-app browser, not Safari', () => {
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const { getByText } = render(
      <View>{renderMarkdownContent('[Source](https://docs.example.com)', lightColors)}</View>,
    );

    fireEvent.press(getByText('Source'));

    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
      'https://docs.example.com',
      expect.objectContaining({ presentationStyle: 'pageSheet' }),
    );
    expect(openUrlSpy).not.toHaveBeenCalled();
  });

  it('does not open non-http markdown links from untrusted message content', () => {
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByText } = render(
      <View>{renderMarkdownContent('[Bad](javascript:alert(1))', lightColors)}</View>,
    );

    fireEvent.press(getByText('Bad'));

    expect(openUrlSpy).not.toHaveBeenCalled();
    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('gates mailto links behind a confirmation alert before opening', () => {
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByText } = render(
      <View>{renderMarkdownContent('[Email us](mailto:support@example.com)', lightColors)}</View>,
    );

    fireEvent.press(getByText('Email us'));

    expect(openUrlSpy).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Open in Mail?',
      'mailto:support@example.com',
      expect.arrayContaining([expect.objectContaining({ text: 'Cancel', style: 'cancel' })]),
    );

    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    const openButton = buttons.find((b) => b.text === 'Open');
    openButton?.onPress?.();
    expect(openUrlSpy).toHaveBeenCalledWith('mailto:support@example.com');
  });

  it('gates tel links behind a confirmation alert and blocks malformed ones', () => {
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByText } = render(
      <View>
        {renderMarkdownContent('[Call](tel:+15551234567) or [Weird](tel:+1 555 ext9)', lightColors)}
      </View>,
    );

    fireEvent.press(getByText('Call'));
    expect(alertSpy).toHaveBeenCalledWith('Open in Phone?', 'tel:+15551234567', expect.anything());

    fireEvent.press(getByText('Weird'));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(openUrlSpy).not.toHaveBeenCalled();
  });

  it('opens http links directly without a confirmation alert', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByText } = render(
      <View>{renderMarkdownContent('[Docs](https://docs.example.com)', lightColors)}</View>,
    );

    fireEvent.press(getByText('Docs'));

    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
      'https://docs.example.com',
      expect.anything(),
    );
  });

  it('renders fenced code blocks with syntax-highlighted spans', () => {
    const { getByText } = render(
      <View>{renderMarkdownContent('```js\nconst x = 42; // note\n```', lightColors)}</View>,
    );

    expect(getByText('const')).toHaveStyle({ color: syntaxTokenColor('keyword', lightColors) });
    expect(getByText('42')).toHaveStyle({ color: syntaxTokenColor('number', lightColors) });
    expect(getByText('// note')).toHaveStyle({ color: syntaxTokenColor('comment', lightColors) });
  });

  it('renders unknown-language code blocks as plain monospace text', () => {
    const { getByText } = render(
      <View>{renderMarkdownContent('```\nplain block content\n```', lightColors)}</View>,
    );

    expect(getByText('plain block content')).toHaveStyle({
      color: lightColors.textPrimary,
      fontFamily: 'Menlo',
    });
  });

  it('wraps long lines of a plain-text block instead of scrolling them sideways', () => {
    const longLine = `git clone https://example.com/${'a'.repeat(120)}.git`;
    const { UNSAFE_queryAllByType, getByText } = render(
      <View>{renderMarkdownContent(`\`\`\`\n${longLine}\n\`\`\``, lightColors)}</View>,
    );

    expect(getByText(longLine)).toBeTruthy();
    expect(UNSAFE_queryAllByType(ScrollView).filter((node) => node.props.horizontal)).toHaveLength(
      0,
    );
  });

  it('wraps a block fenced as text and keeps scrolling for real code', () => {
    const plain = render(
      <View>{renderMarkdownContent('```text\nsome notes\n```', lightColors)}</View>,
    );
    expect(plain.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);

    const code = render(
      <View>{renderMarkdownContent('```js\nconst x = 42;\n```', lightColors)}</View>,
    );
    expect(
      code.UNSAFE_queryAllByType(ScrollView).filter((node) => node.props.horizontal),
    ).toHaveLength(1);
  });

  it('handles failed browser opens without throwing from the press handler', () => {
    mockOpenBrowserAsync.mockRejectedValue(new Error('No browser'));
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No handler'));
    const { getByText } = render(
      <View>{renderMarkdownContent('[Source](https://docs.example.com)', lightColors)}</View>,
    );

    expect(() => fireEvent.press(getByText('Source'))).not.toThrow();
  });

  it('renders markdown table with interior empty cells correctly', () => {
    const tableContent = `| Name | Age | City |
|---|---|---|
| Alice | 30 | NYC |
| Bob | | LA |`;

    const { getByText, getAllByText } = render(
      <View>{renderMarkdownContent(tableContent, lightColors)}</View>,
    );

    expect(getByText('Name')).toHaveStyle({ fontWeight: '500' });
    expect(getByText('Age')).toHaveStyle({ fontWeight: '500' });
    expect(getByText('City')).toHaveStyle({ fontWeight: '500' });

    expect(getByText('Alice')).toHaveStyle({ color: lightColors.textSecondary });
    expect(getByText('30')).toHaveStyle({ color: lightColors.textSecondary });
    expect(getByText('NYC')).toHaveStyle({ color: lightColors.textSecondary });
    expect(getByText('Bob')).toHaveStyle({ color: lightColors.textSecondary });
    expect(getByText('LA')).toHaveStyle({ color: lightColors.textSecondary });

    const allEmptyTexts = getAllByText('');
    expect(allEmptyTexts.length).toBeGreaterThan(0);
  });
});
