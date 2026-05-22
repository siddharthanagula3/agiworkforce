/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Mobile SendPreview tests.
 *
 * Pin the RN-native mirror's contract: destination labelling per provider
 * mode, banner copy, model label, expand/collapse details block.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { summarizeSendPreview, type SendPreviewPresentation } from '@agiworkforce/types';

jest.mock('@/src/ui/theme', () => ({
  colors: {
    textPrimary: '#fff',
    textSecondary: '#aaa',
    textMuted: '#777',
    border: '#333',
    agentSuccess: '#10b981',
    agentError: '#ef4444',
    agentWarning: '#f59e0b',
  },
}));

jest.mock('@/components/ui/text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const factory = (name: string) => (props: Record<string, unknown>) => (
    <RN.View testID={`icon-${name}`} {...props} />
  );
  return {
    ChevronDown: factory('chevron-down'),
    ChevronUp: factory('chevron-up'),
    Cloud: factory('cloud'),
    HardDrive: factory('hard-drive'),
    KeyRound: factory('key-round'),
    Lock: factory('lock'),
  };
});

import { SendPreview } from '@/src/features/chat/components/SendPreview';

function localPresentation(): SendPreviewPresentation {
  return summarizeSendPreview({
    providerMode: 'Local',
    modelLabel: 'Llama 3.2 8B',
    messageBody: 'hi',
  });
}

describe('Mobile SendPreview', () => {
  it('renders the local destination + privacy banner', () => {
    const { getByText, queryByTestId } = render(<SendPreview presentation={localPresentation()} />);
    expect(getByText('Stays on this device')).toBeTruthy();
    expect(getByText('Local')).toBeTruthy();
    expect(getByText(/nothing is uploaded/i)).toBeTruthy();
    expect(queryByTestId('icon-hard-drive')).toBeTruthy();
  });

  it('renders BYOK destination + key icon', () => {
    const presentation = summarizeSendPreview({
      providerMode: 'DirectByok',
      destinationHost: 'api.anthropic.com',
    });
    const { getByText, queryAllByText, queryByTestId } = render(
      <SendPreview presentation={presentation} />,
    );
    expect(getByText('Sent to api.anthropic.com')).toBeTruthy();
    // 'BYOK' may appear in both the privacy chip and the default model-label fallback
    expect(queryAllByText('BYOK').length).toBeGreaterThanOrEqual(1);
    expect(queryByTestId('icon-key-round')).toBeTruthy();
  });

  it('renders Managed gateway + cloud icon for ManagedNative', () => {
    const presentation = summarizeSendPreview({ providerMode: 'ManagedNative' });
    const { getByText, queryAllByText, queryByTestId } = render(
      <SendPreview presentation={presentation} />,
    );
    expect(getByText('Sent through AGI Managed gateway')).toBeTruthy();
    expect(queryAllByText('Managed').length).toBeGreaterThanOrEqual(1);
    expect(queryByTestId('icon-cloud')).toBeTruthy();
  });

  it('shows the model label when present', () => {
    const { getByText } = render(<SendPreview presentation={localPresentation()} />);
    expect(getByText('Llama 3.2 8B')).toBeTruthy();
  });

  it('hides details by default and reveals them on tap', () => {
    const { getByText, queryByTestId } = render(<SendPreview presentation={localPresentation()} />);
    expect(queryByTestId('send-preview-details')).toBeNull();
    fireEvent.press(getByText(/Show details/i));
    expect(queryByTestId('send-preview-details')).toBeTruthy();
    expect(getByText('Message')).toBeTruthy();
    expect(getByText('2 chars')).toBeTruthy();
  });

  it('respects defaultExpanded', () => {
    const { getByText, queryByTestId } = render(
      <SendPreview presentation={localPresentation()} defaultExpanded />,
    );
    expect(queryByTestId('send-preview-details')).toBeTruthy();
    fireEvent.press(getByText(/Hide details/i));
    expect(queryByTestId('send-preview-details')).toBeNull();
  });

  it('omits the expand toggle when no extra details exist', () => {
    const presentation = summarizeSendPreview({ providerMode: 'Local' });
    const { queryByText, queryByTestId } = render(<SendPreview presentation={presentation} />);
    expect(queryByText(/Show details/i)).toBeNull();
    expect(queryByTestId('send-preview-details')).toBeNull();
  });
});
