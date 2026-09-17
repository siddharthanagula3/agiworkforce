import { Spinner } from '@agiworkforce/ui';

export interface RouteLoadingProps {
  /** What is loading, read out by a screen reader and shown under the spinner. */
  label: string;
}

/**
 * The loading boundary a route segment renders while its server work is in
 * flight. One component so every segment announces the wait the same way and
 * none of them hand-rolls a spinning div that says nothing to a screen reader
 * and ignores a reduced-motion preference.
 */
export function RouteLoading({ label }: RouteLoadingProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 py-12">
      <Spinner size="lg" className="text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        {label}
      </p>
    </div>
  );
}
