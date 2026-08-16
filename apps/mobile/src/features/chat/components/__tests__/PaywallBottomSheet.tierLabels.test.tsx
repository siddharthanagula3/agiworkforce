import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const { View } = jest.requireActual('react-native');
  const { forwardRef } = jest.requireActual('react');
  const Passthrough = forwardRef(
    ({ children }: { children?: React.ReactNode }, ref: React.Ref<unknown>) => {
      void ref;
      return <View>{children}</View>;
    },
  );
  return {
    __esModule: true,
    default: Passthrough,
    BottomSheetView: Passthrough,
    BottomSheetBackdrop: Passthrough,
  };
});

import { PaywallBottomSheet } from '../PaywallBottomSheet';
import type { PaywallRecoveryAction } from '@/src/features/chat/utils/paywallRecovery';

function renderSheet(
  requiredTier: string,
  feature = 'video_generation',
  recoveryAction: PaywallRecoveryAction = 'upgrade',
  reason?: string,
) {
  return render(
    <PaywallBottomSheet
      feature={feature}
      requiredTier={requiredTier}
      recoveryAction={recoveryAction}
      reason={reason}
      onDismiss={() => {
        /* not exercised here */
      }}
    />,
  );
}

describe('PaywallBottomSheet tier labels', () => {
  beforeEach(() => mockPush.mockClear());

  it('names Max 15x when the server gates a feature to it', () => {
    const { getByText } = renderSheet('max_15x');

    expect(getByText('Upgrade to Max 15x')).toBeTruthy();
    expect(getByText('Video generation requires the Max 15x plan.')).toBeTruthy();
  });

  it('uses the plan name checkout sells for max', () => {
    const { getByText } = renderSheet('max');

    expect(getByText('Upgrade to Max 5x')).toBeTruthy();
  });

  it('still falls back to the vague label for a tier we do not sell', () => {
    const { getByText } = renderSheet('platinum');

    expect(getByText('Upgrade to a higher')).toBeTruthy();
  });

  it('renders billing recovery without falsely telling an inactive subscriber to upgrade', () => {
    const { getByText, queryByText } = renderSheet(
      'pro',
      'image_generation',
      'manage_billing',
      'Your subscription is past_due. Please update your payment method.',
    );

    expect(getByText('Update billing')).toBeTruthy();
    expect(
      getByText('AI image generation is unavailable until your subscription is active.'),
    ).toBeTruthy();
    expect(getByText('Manage billing')).toBeTruthy();
    expect(queryByText('Upgrade to Pro')).toBeNull();
    expect(queryByText('AI image generation requires the Pro plan.')).toBeNull();

    fireEvent.press(getByText('Manage billing'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/settings/cloud-billing');
  });

  it('asks a user without a subscription to choose a plan instead of update billing', () => {
    const { getByText, queryByText } = renderSheet(
      'pro',
      'image_generation',
      'subscribe',
      'No active subscription found.',
    );

    expect(getByText('Choose a plan')).toBeTruthy();
    expect(getByText('AI image generation requires an active subscription.')).toBeTruthy();
    expect(getByText('View plans')).toBeTruthy();
    expect(queryByText('Update billing')).toBeNull();
  });
});
