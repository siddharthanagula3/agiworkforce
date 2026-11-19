import { act } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

// The multiplier React Native reports for iOS accessibility-extra-extra-extra-large
// (RCTAccessibilityManager), the largest system text size.
export const LARGEST_IOS_TEXT_SCALE = 3.571;

export function setTextScale(fontScale: number) {
  const window = { ...Dimensions.get('window'), fontScale };
  act(() => {
    Dimensions.set({ window, screen: window });
  });
}
