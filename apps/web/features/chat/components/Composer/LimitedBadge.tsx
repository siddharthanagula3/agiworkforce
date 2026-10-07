import { Clock } from '@agiworkforce/icons';
import { FREE_MEDIA_LIMITED_LABEL } from '@/features/models/lib/free-media-offer';

export function LimitedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-sm font-semibold uppercase tracking-wide text-primary">
      <Clock className="h-4 w-4" aria-hidden="true" />
      {FREE_MEDIA_LIMITED_LABEL}
    </span>
  );
}
