'use client';

import { describeCapabilityDenial, type CapabilityDenialReason } from '@agiworkforce/types';

export function CapabilityDeniedNotice({ reason }: { reason: CapabilityDenialReason }) {
  const copy = describeCapabilityDenial(reason);
  return (
    <div role="status" className="rounded-lg border border-border bg-muted/40 px-4 py-4">
      <p className="text-sm font-medium text-foreground">{copy.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{copy.message}</p>
      <p className="mt-1 text-sm text-muted-foreground">{copy.suggestion}</p>
    </div>
  );
}
