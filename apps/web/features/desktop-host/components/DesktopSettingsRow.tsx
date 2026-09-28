import type { ReactNode } from 'react';

export const DESKTOP_SETTINGS_BUTTON_CLASS =
  'h-8 shrink-0 rounded-md border border-border px-2.5 text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60';

export function DesktopSettingsHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-[var(--text-1)]">{title}</h2>
      <p className="mt-1 text-sm text-[var(--text-3)]">{hint}</p>
    </div>
  );
}

export function DesktopSettingsRow({
  label,
  hint,
  note,
  noteIsFailure = true,
  children,
}: {
  label: string;
  hint: string;
  note?: string;
  noteIsFailure?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--settings-border)] py-[14px]">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm text-[var(--text-1)]">{label}</span>
        <span className="text-xs text-[var(--text-3)]">{hint}</span>
        {note !== undefined && (
          <span
            className={
              noteIsFailure
                ? 'text-xs text-[var(--settings-destructive-text)]'
                : 'text-xs text-[var(--text-3)]'
            }
          >
            {note}
          </span>
        )}
      </span>
      {children}
    </div>
  );
}
