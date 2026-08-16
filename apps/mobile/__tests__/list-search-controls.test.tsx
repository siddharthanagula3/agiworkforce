/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Plus } from 'lucide-react-native';

const mockInsetBottom = 34;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: mockInsetBottom, left: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : Icon) });
});

jest.mock('../src/ui/theme', () => {
  const actual = jest.requireActual('../src/ui/theme/tokens');
  return { useThemeColors: () => actual.lightColors };
});

import {
  BottomSearchBar,
  BOTTOM_SEARCH_BAR_HEIGHT,
  BOTTOM_SEARCH_BAR_MARGIN,
} from '../src/shared/components/BottomSearchBar';
import {
  FloatingPrimaryAction,
  FLOATING_PRIMARY_ACTION_GAP,
  FLOATING_PRIMARY_ACTION_HEIGHT,
  FLOATING_PRIMARY_ACTION_LIST_PADDING,
} from '../src/shared/components/FloatingPrimaryAction';

describe('BottomSearchBar', () => {
  it('anchors above the home indicator instead of flush to the screen edge', () => {
    const screen = render(
      <BottomSearchBar
        testID="bar"
        value=""
        onChangeText={jest.fn()}
        placeholder="Search"
        accessibilityLabel="Search everything"
      />,
    );

    const style = screen.getByTestId('bar').props.style;
    expect(style.marginBottom).toBe(mockInsetBottom + BOTTOM_SEARCH_BAR_MARGIN);
    expect(style.minHeight).toBe(BOTTOM_SEARCH_BAR_HEIGHT);
    expect(style.borderRadius).toBe(BOTTOM_SEARCH_BAR_HEIGHT / 2);
  });

  it('does not steal focus unless the caller asks for it', () => {
    const screen = render(
      <BottomSearchBar
        value=""
        onChangeText={jest.fn()}
        placeholder="Search"
        accessibilityLabel="Search everything"
      />,
    );

    expect(screen.getByLabelText('Search everything').props.autoFocus).toBe(false);
  });

  it('offers a clear affordance only while a query is present', () => {
    const onChangeText = jest.fn();
    const empty = render(
      <BottomSearchBar
        value="   "
        onChangeText={onChangeText}
        placeholder="Search"
        accessibilityLabel="Search everything"
        clearAccessibilityLabel="Clear everything search"
      />,
    );
    expect(empty.queryByLabelText('Clear everything search')).toBeNull();
    empty.unmount();

    const filled = render(
      <BottomSearchBar
        value="launch"
        onChangeText={onChangeText}
        placeholder="Search"
        accessibilityLabel="Search everything"
        clearAccessibilityLabel="Clear everything search"
      />,
    );
    fireEvent.press(filled.getByLabelText('Clear everything search'));
    expect(onChangeText).toHaveBeenCalledWith('');
  });
});

describe('FloatingPrimaryAction', () => {
  it('is a labelled target above the 44pt minimum, not a small square', () => {
    const screen = render(
      <FloatingPrimaryAction testID="fab" label="New project" icon={Plus} onPress={jest.fn()} />,
    );

    const style = screen.getByTestId('fab').props.style;
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minHeight).toBe(FLOATING_PRIMARY_ACTION_HEIGHT);
    expect(screen.getByText('New project')).toBeTruthy();
  });

  it('stacks clear of the search field rather than rendering behind it', () => {
    const screen = render(
      <FloatingPrimaryAction testID="fab" label="New project" icon={Plus} onPress={jest.fn()} />,
    );

    const style = screen.getByTestId('fab').props.style;
    expect(style.position).toBe('absolute');
    expect(style.bottom).toBe(
      mockInsetBottom +
        BOTTOM_SEARCH_BAR_MARGIN +
        BOTTOM_SEARCH_BAR_HEIGHT +
        FLOATING_PRIMARY_ACTION_GAP,
    );
  });

  it('exposes a list padding that clears both controls', () => {
    expect(FLOATING_PRIMARY_ACTION_LIST_PADDING).toBeGreaterThanOrEqual(
      BOTTOM_SEARCH_BAR_MARGIN +
        BOTTOM_SEARCH_BAR_HEIGHT +
        FLOATING_PRIMARY_ACTION_GAP +
        FLOATING_PRIMARY_ACTION_HEIGHT,
    );
  });

  it('falls back to the visible label as its spoken name', () => {
    const onPress = jest.fn();
    const screen = render(<FloatingPrimaryAction label="New chat" icon={Plus} onPress={onPress} />);

    fireEvent.press(screen.getByLabelText('New chat'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
