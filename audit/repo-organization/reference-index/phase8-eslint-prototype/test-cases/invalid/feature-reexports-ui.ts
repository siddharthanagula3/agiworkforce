// FILE: apps/mobile/src/features/waitlist/index.ts
// FAILS: This feature barrel re-exports a UI primitive. UI is a leaf — callers
// must reach UI primitives directly, not launder them through a feature's
// public surface.

import { Button } from '@/src/ui/button';

export { CloudWaitlistSheet } from './CloudWaitlistSheet';
export { joinWaitlist } from './service';
export { Button }; // ← reported (transit re-export)

// And the more direct form is also reported:
export { BottomSheet } from '@/src/ui/bottom-sheet'; // ← reported

// And the wildcard form:
export * from '@/src/ui/card'; // ← reported

// Expected diagnostics: three "uiTransit" reports.
