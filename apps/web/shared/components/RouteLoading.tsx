import { Spinner } from '@agiworkforce/ui';

export interface RouteLoadingProps {
  /** What is loading, read out by a screen reader and shown under the spinner. */
  label: string;
  /** Set inside a shell that already paints the page, so the wait brings no surface of its own. */
  inline?: boolean;
}

const PAGE_CLASS =
  'flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-background px-4 py-12 text-foreground';
const INLINE_CLASS = 'flex items-center gap-3 py-2 text-foreground';

/**
 * The loading boundary a route segment renders while its server work is in
 * flight. One component so every segment announces the wait the same way and
 * none of them hand-rolls a spinning div that says nothing to a screen reader
 * and ignores a reduced-motion preference.
 */
export function RouteLoading({ label, inline = false }: RouteLoadingProps) {
  return (
    <div className={inline ? INLINE_CLASS : PAGE_CLASS}>
      <Spinner size={inline ? 'sm' : 'lg'} className="text-muted-foreground" aria-hidden="true" />
      <p
        className="text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
        aria-label={label}
      >
        {label}
      </p>
    </div>
  );
}
