import { useContext } from 'react';
import { TextScaleContext } from '@/components/ui/textScale';
import { STACKED_ROW_TEXT_SCALE } from '@/src/ui/theme/tokens';

export function useLargeTextRows(): boolean {
  const fontScale = useContext(TextScaleContext);
  return fontScale !== null && fontScale >= STACKED_ROW_TEXT_SCALE;
}
