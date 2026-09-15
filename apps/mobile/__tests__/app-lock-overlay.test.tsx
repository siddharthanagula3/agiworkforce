import { render, fireEvent } from '@testing-library/react-native';
import { AppLockOverlay } from '../src/features/auth/components/AppLockOverlay';
import { SecureStorageUnavailable } from '../src/features/auth/components/SecureStorageUnavailable';

describe('AppLockOverlay', () => {
  it('covers the whole surface so the app behind it cannot be seen or touched', () => {
    const { getByTestId } = render(<AppLockOverlay onUnlock={jest.fn()} />);
    const overlay = getByTestId('app-lock-overlay');
    const style = Object.assign({}, ...[overlay.props.style].flat(Infinity).filter(Boolean));

    expect(style.position).toBe('absolute');
    expect(style.top).toBe(0);
    expect(style.left).toBe(0);
    expect(style.right).toBe(0);
    expect(style.bottom).toBe(0);
    expect(style.backgroundColor).toBeTruthy();
    expect(overlay.props.accessibilityViewIsModal).toBe(true);
  });

  it('runs the unlock action from the button', () => {
    const onUnlock = jest.fn();
    const { getByTestId } = render(<AppLockOverlay onUnlock={onUnlock} />);
    fireEvent.press(getByTestId('app-lock-unlock'));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('offers a way out for a gate that can no longer be satisfied', () => {
    const onReset = jest.fn();
    const { getByTestId } = render(<AppLockOverlay onUnlock={jest.fn()} onReset={onReset} />);
    fireEvent.press(getByTestId('app-lock-reset'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('shows no reset action on the background cover', () => {
    const { queryByTestId } = render(
      <AppLockOverlay onUnlock={jest.fn()} onReset={jest.fn()} variant="cover" />,
    );
    expect(queryByTestId('app-lock-reset')).toBeNull();
  });
});

describe('SecureStorageUnavailable', () => {
  it('states that nothing was deleted, leaks no exception text, and offers a retry', () => {
    const onRetry = jest.fn();
    const { getByText, getByTestId, queryByText } = render(
      <SecureStorageUnavailable onRetry={onRetry} />,
    );

    expect(getByText(/Nothing has been deleted/)).toBeTruthy();
    expect(queryByText(/Exception|Error|\.swift/)).toBeNull();
    fireEvent.press(getByTestId('secure-storage-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
