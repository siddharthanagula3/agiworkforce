'use client';

import { useCloudSettingsSyncStatus } from '@/features/settings/lib/cloud-settings-sync-status';

export const SETTINGS_SELECT_CLASS =
  'h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground';

export function PreferenceSyncNotice() {
  const { error, retry } = useCloudSettingsSyncStatus();
  if (!error) return null;

  return (
    <p role="alert" className="flex items-center gap-2 text-xs text-danger">
      {error} This device keeps your choice.
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="rounded-md border border-border px-2 py-1 font-medium text-foreground hover:bg-muted"
        >
          Retry
        </button>
      )}
    </p>
  );
}

export function SettingsPreferenceRow({
  label,
  hint,
  hintId,
  children,
}: {
  label: string;
  hint?: string;
  hintId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-9 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className={`flex min-w-0 flex-col gap-0.5 ${hint ? '' : 'sm:shrink-0'}`}>
        <span className="text-sm text-foreground">{label}</span>
        {hint && (
          <span id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      {children}
    </div>
  );
}
