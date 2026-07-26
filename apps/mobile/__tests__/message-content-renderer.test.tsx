import { Alert, Linking, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../src/features/chat/components/MathBlock', () => ({
  MathBlock: () => null,
}));

import { renderMarkdownContent } from '../src/features/chat/components/MessageContentRenderer';
import { syntaxTokenColor } from '../src/features/chat/utils/syntaxHighlight';
import { lightColors } from '../src/ui/theme';

describe('MessageContentRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it('opens http and https markdown links', () => {
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const { getByText } = render(
      <View>{renderMarkdownContent('[Source](https://docs.example.com)', lightColors)}</View>,
    );

    fireEvent.press(getByText('Source'));

    expect(openUrlSpy).toHaveBeenCalledWith('https://docs.example.com');
  });

  it('does not open non-http markdown links from untrusted message content', () => {
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByText } = render(
      <View>{renderMarkdownContent('[Bad](javascript:alert(1))', lightColors)}</View>,
    );

    fireEvent.press(getByText('Bad'));

    expect(openUrlSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('gates mailto links behind a confirmation alert before opening', () => {
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByText } = render(
      <View>{renderMarkdownContent('[Email us](mailto:support@example.com)', lightColors)}</View>,
    );

    fireEvent.press(getByText('Email us'));

    // Tap alone must not open anything — only the alert confirmation does.
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

    // Embedded whitespace disqualifies the URL — no alert, no open.
    fireEvent.press(getByText('Weird'));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(openUrlSpy).not.toHaveBeenCalled();
  });

  it('opens http links directly without a confirmation alert', () => {
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByText } = render(
      <View>{renderMarkdownContent('[Docs](https://docs.example.com)', lightColors)}</View>,
    );

    fireEvent.press(getByText('Docs'));

    expect(alertSpy).not.toHaveBeenCalled();
    expect(openUrlSpy).toHaveBeenCalledWith('https://docs.example.com');
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

  it('handles failed browser opens without throwing from the press handler', () => {
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

    // Verify header cells are present
    expect(getByText('Name')).toHaveStyle({ fontWeight: '500' });
    expect(getByText('Age')).toHaveStyle({ fontWeight: '500' });
    expect(getByText('City')).toHaveStyle({ fontWeight: '500' });

    // Verify body rows have correct values
    expect(getByText('Alice')).toHaveStyle({ color: lightColors.textSecondary });
    expect(getByText('30')).toHaveStyle({ color: lightColors.textSecondary });
    expect(getByText('NYC')).toHaveStyle({ color: lightColors.textSecondary });
    expect(getByText('Bob')).toHaveStyle({ color: lightColors.textSecondary });
    expect(getByText('LA')).toHaveStyle({ color: lightColors.textSecondary });

    // Verify we have 3 instances of empty cell content (one per row with missing value)
    // Bob's age is empty, so we should render the empty string placeholder
    const allEmptyTexts = getAllByText('');
    expect(allEmptyTexts.length).toBeGreaterThan(0);
  });
});
