import { render, fireEvent } from '@testing-library/react-native';
import { SendErrorBanner } from '../src/features/chat/components/SendErrorBanner';

const NO_MODEL = 'Local Mode is active, but no on-device model is ready yet.';

describe('SendErrorBanner recovery action', () => {
  it('offers the named way out beside Retry', () => {
    const onPress = jest.fn();
    const { getByTestId, getByText } = render(
      <SendErrorBanner
        error={NO_MODEL}
        action={{ label: 'Use Apple Intelligence', onPress }}
        onRetry={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );

    expect(getByText('Use Apple Intelligence')).toBeTruthy();
    expect(getByText('Retry')).toBeTruthy();
    fireEvent.press(getByTestId('send-error-action'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows no action when there is none to offer', () => {
    const { queryByTestId } = render(
      <SendErrorBanner error={NO_MODEL} onRetry={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(queryByTestId('send-error-action')).toBeNull();
  });

  it('withholds the action while a free-capacity countdown is running', () => {
    const { queryByTestId } = render(
      <SendErrorBanner
        error={NO_MODEL}
        freeCapacity={{ retryAtMs: Date.now() + 60_000 }}
        action={{ label: 'Open Models', onPress: jest.fn() }}
        onDismiss={jest.fn()}
      />,
    );
    expect(queryByTestId('send-error-action')).toBeNull();
  });
});
