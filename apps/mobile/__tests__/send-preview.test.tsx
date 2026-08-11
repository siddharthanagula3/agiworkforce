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

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...actual,
    useThemeColors: () => actual.colors,
  };
});

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
    Lock: factory('lock'),
  };
});

import { SendPreview } from '@/src/features/chat/components/SendPreview';

const FIXTURE_LOCAL_MODEL_LABEL = 'Fixture Local Model';

function localPresentation(): SendPreviewPresentation {
  return summarizeSendPreview({
    providerMode: 'Local',
    modelLabel: FIXTURE_LOCAL_MODEL_LABEL,
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

  it('maps legacy direct-provider preview to Cloud sign-in on Mobile', () => {
    const presentation = summarizeSendPreview({
      providerMode: 'DirectByok',
      destinationHost: 'api.anthropic.com',
    });
    const { getByText, getAllByText, queryByText, queryByTestId } = render(
      <SendPreview presentation={presentation} />,
    );
    expect(getByText('Sign in for AGI Cloud')).toBeTruthy();
    expect(getAllByText('Cloud').length).toBeGreaterThan(0);
    expect(getByText(/Sign in to use AGI Cloud chat/i)).toBeTruthy();
    expect(queryByText(/byok/i)).toBeNull();
    expect(queryByTestId('icon-cloud')).toBeTruthy();
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
    expect(getByText(FIXTURE_LOCAL_MODEL_LABEL)).toBeTruthy();
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
