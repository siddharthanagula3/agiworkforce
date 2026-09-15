import { Fragment, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';

// iOS repaints text at the new Dynamic Type size without re-running layout, so
// a text-size change made while the app is open left every label painted large
// inside a box measured small and clipped mid-word. Remounting on a change of
// scale forces a fresh measure. The key is stable across every other lifecycle
// event, so a resume does not disturb the tree.
export function TextScaleBoundary({ children }: { children: ReactNode }) {
  const { fontScale } = useWindowDimensions();
  return <Fragment key={`text-scale-${fontScale}`}>{children}</Fragment>;
}
