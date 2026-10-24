const mockBack = jest.fn();
const mockNavigate = jest.fn();
const mockCanGoBack = jest.fn<boolean, []>();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, navigate: mockNavigate, canGoBack: mockCanGoBack }),
}));

import { render } from '@testing-library/react-native';
import { Pressable } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { useGoBack } from '../useGoBack';

function Harness({ fallbackHref }: { fallbackHref: string }) {
  const goBack = useGoBack(fallbackHref);
  return <Pressable accessibilityLabel="Go back" accessibilityRole="button" onPress={goBack} />;
}

beforeEach(() => {
  mockBack.mockClear();
  mockNavigate.mockClear();
  mockCanGoBack.mockReset();
});

describe('useGoBack', () => {
  it('pops the screen the user came from rather than a named parent', () => {
    mockCanGoBack.mockReturnValue(true);
    const { getByLabelText } = render(<Harness fallbackHref="/(app)/(tabs)/settings" />);

    fireEvent.press(getByLabelText('Go back'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('uses the named parent only for a deep link with nothing behind it', () => {
    mockCanGoBack.mockReturnValue(false);
    const { getByLabelText } = render(<Harness fallbackHref="/(app)/settings/memory" />);

    fireEvent.press(getByLabelText('Go back'));

    expect(mockNavigate).toHaveBeenCalledWith('/(app)/settings/memory');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('asks again on every press, so history added since mount counts', () => {
    mockCanGoBack.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { getByLabelText } = render(<Harness fallbackHref="/(app)/(tabs)/chat" />);

    fireEvent.press(getByLabelText('Go back'));
    fireEvent.press(getByLabelText('Go back'));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
