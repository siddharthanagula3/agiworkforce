// FILE: apps/mobile/src/features/waitlist/CloudWaitlistSheet.tsx
// PASSES: features/ → ui/ is allowed AS LONG AS the UI primitive is not
// re-exported from the feature's barrel (which would launder it). Here we
// simply consume the primitive locally.

import { BottomSheet } from '@/src/ui/bottom-sheet';
import { Button } from '@/src/ui/button';

export function CloudWaitlistSheet() {
  return (
    <BottomSheet>
      <Button label="Join" />
    </BottomSheet>
  );
}
