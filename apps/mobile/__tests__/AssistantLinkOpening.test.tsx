/* eslint-disable @typescript-eslint/no-require-imports */
import { Alert, Linking, Platform } from 'react-native';

jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  return { Text: (props: Record<string, unknown>) => <RN.Text {...props} /> };
});
jest.mock('@/src/features/chat/components/MathBlock', () => ({ MathBlock: () => null }));
jest.mock('@/src/features/chat/components/CitationChip', () => ({
  canPreviewCitation: jest.fn(() => false),
  previewCitation: jest.fn(),
}));
jest.mock('@/lib/safeOpenURL', () => ({
  openUntrustedUrlInAppBrowser: jest.fn().mockResolvedValue(true),
}));

import { openAssistantLink } from '@/src/features/chat/components/MarkdownInline';

type AlertButton = { text: string; onPress?: () => void };

function confirmedOpen(): void {
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as AlertButton[];
  buttons.find((button) => button.text === 'Open')?.onPress?.();
}

describe('openAssistantLink, system links', () => {
  let alertSpy: jest.SpyInstance;
  let openURL: jest.SpyInstance;
  const originalOS = Platform.OS;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    openURL.mockClear();
    alertSpy.mockClear();
    Platform.OS = 'ios';
  });

  afterEach(() => {
    Platform.OS = originalOS;
    jest.restoreAllMocks();
  });

  it('opens a confirmed geo link in Apple Maps on iOS', () => {
    openAssistantLink('geo:37.7749,-122.4194');
    expect(alertSpy.mock.calls[0]?.[0]).toBe('Open in Maps?');

    confirmedOpen();

    expect(openURL).toHaveBeenCalledWith('https://maps.apple.com/?ll=37.7749,-122.4194');
  });

  it('hands a geo link to the system unchanged on Android', () => {
    Platform.OS = 'android';
    openAssistantLink('geo:37.7749,-122.4194');

    confirmedOpen();

    expect(openURL).toHaveBeenCalledWith('geo:37.7749,-122.4194');
  });

  it('tells the person when the system cannot open a confirmed link', async () => {
    openURL.mockRejectedValue(new Error('no handler'));
    openAssistantLink('mailto:a@b.com');

    confirmedOpen();
    await new Promise((resolve) => setImmediate(resolve));

    expect(alertSpy).toHaveBeenCalledTimes(2);
    expect(alertSpy.mock.calls[1]?.[0]).toBe('Could not open link');
  });

  it('tells the person when a geo link has no place to show', () => {
    openAssistantLink('geo:0,0');
    confirmedOpen();

    expect(openURL).not.toHaveBeenCalled();
    expect(alertSpy.mock.calls[1]?.[0]).toBe('Could not open link');
  });
});
