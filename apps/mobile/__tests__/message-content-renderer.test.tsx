import { Linking, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../src/features/chat/components/MathBlock', () => ({
  MathBlock: () => null,
}));

import { renderMarkdownContent } from '../src/features/chat/components/MessageContentRenderer';
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
    const { getByText } = render(
      <View>{renderMarkdownContent('[Bad](javascript:alert(1))', lightColors)}</View>,
    );

    fireEvent.press(getByText('Bad'));

    expect(openUrlSpy).not.toHaveBeenCalled();
  });

  it('handles failed browser opens without throwing from the press handler', () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No handler'));
    const { getByText } = render(
      <View>{renderMarkdownContent('[Source](https://docs.example.com)', lightColors)}</View>,
    );

    expect(() => fireEvent.press(getByText('Source'))).not.toThrow();
  });
});
