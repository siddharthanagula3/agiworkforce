import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { ModeSwitchModal } from '../src/features/chat/components/ModeSwitchModal';
import { FORM_COLUMN_MAX_WIDTH } from '../src/shared/layout/contentColumn';

describe('ModeSwitchModal on a wide window', () => {
  it('keeps the dialog at the form column instead of spanning the window', () => {
    const { getByTestId } = render(<ModeSwitchModal visible fromMode="local" toMode="cloud" />);

    expect(StyleSheet.flatten(getByTestId('mode-switch-dialog').props.style)).toMatchObject({
      width: '100%',
      maxWidth: FORM_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
    });
  });
});
