/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render, fireEvent, within } from '@testing-library/react-native';
import { Dimensions, StyleSheet, View } from 'react-native';
import { summarizeSendPreview, type SendPreviewPresentation } from '@agiworkforce/types';
import { TextScaleContext } from '@/components/ui/textScale';
import { STACKED_ROW_TEXT_SCALE } from '@/src/ui/theme/tokens';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return {
    ...actual,
    useThemeColors: () => actual.colors,
  };
});

jest.mock('@/src/features/settings/code/useCodeAppearance', () => ({
  useCodeFontFamily: () => undefined,
}));

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
import { HEADER_TEXT_SCALE_LIMIT } from '@/src/features/chat/components/WorkModeSwitch';

const FIXTURE_LOCAL_MODEL_LABEL = 'Fixture Local Model';

function localPresentation(): SendPreviewPresentation {
  return summarizeSendPreview({
    providerMode: 'Local',
    modelLabel: FIXTURE_LOCAL_MODEL_LABEL,
    messageBody: 'hi',
  });
}

describe('Mobile SendPreview', () => {
  it('caps the compact label at the header text scale so the action row stays on screen', () => {
    const { getByText } = render(
      <SendPreview presentation={localPresentation()} variant="compact" />,
    );

    expect(getByText('Stays on device').props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
  });

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

  it('renders Cloud gateway + cloud icon for ManagedNative', () => {
    const presentation = summarizeSendPreview({ providerMode: 'ManagedNative' });
    const { getByText, queryAllByText, queryByTestId } = render(
      <SendPreview presentation={presentation} />,
    );
    expect(getByText('Sent through Cloud gateway')).toBeTruthy();
    expect(queryAllByText('Cloud').length).toBeGreaterThanOrEqual(1);
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

  it.each(['card', 'compact'] as const)(
    'keeps the destination and details readable at large text sizes in the %s preview',
    (variant) => {
      const sourceSessionLabel = 'A source conversation with a title that needs room to wrap';
      const { getByText, getByTestId } = render(
        <TextScaleContext.Provider value={STACKED_ROW_TEXT_SCALE}>
          <SendPreview
            defaultExpanded
            variant={variant}
            presentation={{ ...localPresentation(), sourceSessionLabel }}
          />
        </TextScaleContext.Provider>,
      );

      expect(getByText('Stays on this device').props.numberOfLines).toBeUndefined();
      if (variant === 'compact') {
        const viewport = StyleSheet.flatten(getByTestId('send-preview-scroll').props.style);
        expect(viewport.maxHeight).toBeLessThan(Dimensions.get('window').height / 2);
      }
      const details = getByTestId('send-preview-details');
      expect(getByText(sourceSessionLabel).props.numberOfLines).toBeUndefined();
      const sourceRow = within(details)
        .UNSAFE_getAllByType(View)
        .find(
          (row) =>
            StyleSheet.flatten(row.props.style)?.flexDirection === 'column' &&
            within(row).queryByText(sourceSessionLabel) !== null,
        );
      expect(sourceRow).toBeDefined();

      const disclaimer = StyleSheet.flatten(getByText(/nothing is uploaded/i).props.style);
      expect(disclaimer.lineHeight).toBeGreaterThan(disclaimer.fontSize * 1.2);
    },
  );

  it('omits the expand toggle when no extra details exist', () => {
    const presentation = summarizeSendPreview({ providerMode: 'Local' });
    const { queryByText, queryByTestId } = render(<SendPreview presentation={presentation} />);
    expect(queryByText(/Show details/i)).toBeNull();
    expect(queryByTestId('send-preview-details')).toBeNull();
  });
});
