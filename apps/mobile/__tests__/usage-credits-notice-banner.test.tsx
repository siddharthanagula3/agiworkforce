import { fireEvent, render, screen } from '@testing-library/react-native';
import { UsageLimitBanner } from '../src/features/chat/components/UsageLimitBanner';
import { USAGE_CREDITS_NOTICE } from '../src/features/chat/utils/usageCreditsNotice';

describe('the usage banner with the usage credits notice', () => {
  it('shows the notice with its own action when no limit warning is up', () => {
    const onAction = jest.fn();
    const onDismiss = jest.fn();
    render(
      <UsageLimitBanner
        warning={null}
        actionLabel="Add credits"
        onAction={jest.fn()}
        onDismiss={jest.fn()}
        notice={{ message: USAGE_CREDITS_NOTICE, actionLabel: 'View usage', onAction, onDismiss }}
      />,
    );

    expect(screen.getByText(USAGE_CREDITS_NOTICE)).toBeTruthy();
    fireEvent.press(screen.getByTestId('chat.usage-limit.action'));
    expect(onAction).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('Dismiss usage warning'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders nothing with neither a warning nor a notice', () => {
    render(
      <UsageLimitBanner
        warning={null}
        actionLabel={null}
        onAction={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('chat.usage-limit')).toBeNull();
  });
});
