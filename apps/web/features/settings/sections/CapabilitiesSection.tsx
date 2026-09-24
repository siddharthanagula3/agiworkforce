'use client';

import type { ReactNode } from 'react';
import { Switch } from '@agiworkforce/ui';
import { SaveStatusLine } from '../components/SaveStatusLine';
import { ToolApprovalDefaultsPanel } from '../components/ToolApprovalDefaultsPanel';
import { LockdownModePanel } from '@/features/settings/components/LockdownModePanel';
import {
  BrowserPairingSection,
  RemoteControlSection,
  LocalAccessSection,
  useLocalModeHost,
} from '@/features/desktop-host';
import { useCapabilitiesPreferences } from '../hooks/use-capabilities-preferences';

export function CapabilitiesSection() {
  const { settings, saving, saveError, savedAt, loadError, retry, retrySave, setBoolean } =
    useCapabilitiesPreferences();
  const localModeHost = useLocalModeHost();

  const row = (title: string, description: string, control: ReactNode) => (
    <div className="flex items-center justify-between rounded-lg border border-border/40 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {control}
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Capabilities</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Control what AGI can do in your conversations.
        </p>
        {/* AUDIT-FIX PAR-32: report a failed load instead of falling through
          to 'Synced to your account' while the toggles show local defaults. */}
        <SaveStatusLine
          failed={saveError !== null || loadError !== null}
          className={`mt-2 text-xs ${loadError ? 'text-danger' : 'text-muted-foreground'}`}
        >
          {saving
            ? 'Saving...'
            : saveError
              ? `Save failed: ${saveError}`
              : loadError
                ? `Your saved settings could not be loaded: ${loadError}`
                : savedAt
                  ? 'Saved'
                  : 'Synced to your account'}
        </SaveStatusLine>
        {loadError && (
          <button
            type="button"
            onClick={retry}
            className="mt-2 rounded-md border border-border/60 px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted/60"
          >
            Try again
          </button>
        )}
        {saveError && retrySave ? (
          <button
            type="button"
            onClick={retrySave}
            className="mt-2 rounded-md border border-border/60 px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted/60"
          >
            Try saving again
          </button>
        ) : null}
      </div>

      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Code execution
        </h3>

        {row(
          'Cloud code execution and file creation',
          'Lets AGI run code and build files in a sandbox to answer you. Turning it off refuses those tools server-side, so a chat can no longer run code even if it asks to.',
          <Switch
            aria-label="Cloud code execution and file creation"
            checked={settings.cloudCodeExecution}
            disabled={loadError !== null}
            onCheckedChange={(value) => setBoolean('cloudCodeExecution', value)}
          />,
        )}
      </section>

      {localModeHost ? <LocalAccessSection /> : null}
      <BrowserPairingSection />
      <RemoteControlSection />

      <ToolApprovalDefaultsPanel />

      <LockdownModePanel />

      <p className="text-xs text-muted-foreground">
        Running models on your own provider keys is available in the CLI; VS Code support is coming
        soon. Hosted Web and Desktop are Managed Cloud only and never store a provider key of yours.
      </p>
    </div>
  );
}
