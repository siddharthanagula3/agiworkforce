/**
 * Shared chrome for the Desktop Cloud settings sections that render inline.
 *
 * Kept tiny and local: these sections are lazily loaded from
 * `DesktopCloudSettingsModal`, so importing its helpers back would pull the
 * whole modal into every section chunk.
 */

export const SETTINGS_FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export const PRIMARY_BUTTON = `rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:opacity-50 ${SETTINGS_FOCUS_RING}`;

export const SECONDARY_BUTTON = `rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 ${SETTINGS_FOCUS_RING}`;

export const SMALL_BUTTON = `rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 ${SETTINGS_FOCUS_RING}`;

export function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

export function SectionError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm text-destructive">{message}</p>
      {onRetry ? (
        <button
          type="button"
          className={`mt-3 text-xs font-medium text-foreground underline underline-offset-2 ${SETTINGS_FOCUS_RING}`}
          onClick={onRetry}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function SectionLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="h-28 rounded-lg bg-muted/40 motion-safe:animate-pulse"
    >
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function SectionEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-5">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

export function formatSettingsDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
