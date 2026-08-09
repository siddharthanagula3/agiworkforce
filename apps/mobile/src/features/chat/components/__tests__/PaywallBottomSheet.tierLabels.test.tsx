/**
 * The paywall sheet names the plan the server refused on. Its tier table used
 * to be a local copy of the billing vocabulary, and it had drifted: `max_15x`
 * was missing entirely, so `video_generation` — gated to Max 15x by
 * BILLING_PLAN_CAPABILITY_TIERS — rendered "Upgrade to a higher" and told the
 * user their feature "requires the a higher plan". `max` was also labelled
 * "Max" while checkout sells "Max 5x".
 */
import { render } from '@testing-library/react-native';

// @gorhom/bottom-sheet drives its layout through Reanimated shared values that
// the repo-wide Reanimated mock does not implement, so the real sheet cannot
// mount under Jest. The copy under test is plain <Text>, so render the children
// directly rather than the animated container.
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

function renderSheet(requiredTier: string, feature = 'video_generation') {
  return render(
    <PaywallBottomSheet
      feature={feature}
      requiredTier={requiredTier}
      onDismiss={() => {
        /* not exercised here */
      }}
    />,
  );
}

describe('PaywallBottomSheet tier labels', () => {
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
});
