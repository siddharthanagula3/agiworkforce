import type { ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { TextScaleContext } from '@/components/ui/textScale';

export function TextScaleBoundary({ children }: { children: ReactNode }) {
  const { fontScale } = useWindowDimensions();
  return <TextScaleContext.Provider value={fontScale}>{children}</TextScaleContext.Provider>;
}
