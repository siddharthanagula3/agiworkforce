import { render } from '@testing-library/react-native';
import { Dimensions, StyleSheet, Text } from 'react-native';
import { ModeToggle } from '../src/features/chat/components/ModeToggle';
import { HEADER_TEXT_SCALE_LIMIT } from '../src/features/chat/components/WorkModeSwitch';
import { LARGEST_IOS_TEXT_SCALE, setTextScale } from '../test-utils/textScale';

const SEGMENTS = [
  { testID: 'chat.mode-toggle.local', label: 'Local' },
  { testID: 'chat.mode-toggle.cloud', label: 'Cloud' },
];

describe('Local and Cloud toggle at large text sizes', () => {
  describe('at the largest system text size', () => {
    const startingScale = Dimensions.get('window').fontScale;

    beforeEach(() => setTextScale(LARGEST_IOS_TEXT_SCALE));
    afterEach(() => setTextScale(startingScale));

    it.each(SEGMENTS)(
      'caps the $label label like header text and shrinks it on one line instead of cutting it',
      ({ testID }) => {
        const { getByTestId } = render(
          <ModeToggle mode="local" onTapLocal={jest.fn()} onTapCloud={jest.fn()} />,
        );
        const label = getByTestId(testID).findByType(Text);

        expect(label.props.maxFontSizeMultiplier).toBe(HEADER_TEXT_SCALE_LIMIT);
        expect(label.props.numberOfLines).toBe(1);
        expect(label.props.adjustsFontSizeToFit).toBe(true);
        expect(label.props.minimumFontScale).toBe(0.7);
        expect(label.props.allowFontScaling).not.toBe(false);
      },
    );
  });

  it.each(SEGMENTS)('grows the $label segment with its label', ({ testID }) => {
    const { getByTestId } = render(
      <ModeToggle mode="local" onTapLocal={jest.fn()} onTapCloud={jest.fn()} />,
    );
    const style = StyleSheet.flatten(getByTestId(testID).props.style);

    expect(style.height).toBeUndefined();
    expect(style.minHeight).toBeGreaterThan(0);
  });

  it.each(SEGMENTS)(
    'shows the $label label in the large content viewer when the segment runs out of width',
    ({ testID, label }) => {
      const { getByTestId } = render(
        <ModeToggle mode="local" onTapLocal={jest.fn()} onTapCloud={jest.fn()} />,
      );
      const segment = getByTestId(testID);

      expect(segment.props.accessibilityShowsLargeContentViewer).toBe(true);
      expect(segment.props.accessibilityLargeContentTitle).toBe(label);
    },
  );
});
