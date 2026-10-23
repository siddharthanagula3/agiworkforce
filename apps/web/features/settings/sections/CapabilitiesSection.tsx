'use client';

import type { ReactNode } from 'react';
import { Switch } from '@agiworkforce/ui';
import { SaveStatusLine } from '../components/SaveStatusLine';
import { ToolApprovalDefaultsPanel } from '../components/ToolApprovalDefaultsPanel';
import { ApprovalHistoryPanel } from '../components/ApprovalHistoryPanel';
import { LockdownModePanel } from '@/features/settings/components/LockdownModePanel';
import {
  BrowserPairingSection,
  RemoteControlSection,
  LocalAccessSection,
} from '@/features/desktop-host';
import { PaneTitle } from '@shared/components/PaneTitle';
import { BYOK_SURFACES } from '@/lib/marketing-constants';
import { useCapabilitiesPreferences } from '../hooks/use-capabilities-preferences';

export function CapabilitiesSection() {
  const { settings, saving, saveError, savedAt, loadError, retry, retrySave, setBoolean } =
    useCapabilitiesPreferences();

  const row = (title: string, description: string, control: ReactNode) => (
    <li className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0 max-w-xl">
        <p className="text-base text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {control}
    </li>
  );

  return (
    <div className="space-y-8">
      <div>
        <PaneTitle>Capabilities</PaneTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Control what AGI can do in your conversations.
        </p>
        {/* A failed load must not read 'Synced to your account' while the
          toggles show local defaults. */}
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

      <section aria-labelledby="capabilities-code-execution-heading" className="flex flex-col">
        <h2 id="capabilities-code-execution-heading" className="text-h3 text-foreground">
          Code execution and file creation
        </h2>
        <ul className="divide-y divide-border">
          {row(
            'Cloud code execution and file creation',
            'Lets AGI run code and create files in a sandbox that can reach only GitHub, npm and PyPI.',
            <Switch
              aria-label="Cloud code execution and file creation"
              checked={settings.cloudCodeExecution}
              disabled={loadError !== null}
              onCheckedChange={(value) => setBoolean('cloudCodeExecution', value)}
            />,
          )}
        </ul>
      </section>

      <LocalAccessSection />
      <BrowserPairingSection />
      <RemoteControlSection />

      <ToolApprovalDefaultsPanel />

      <ApprovalHistoryPanel />

      <LockdownModePanel />

      <p className="text-xs text-muted-foreground">
        {`Running models on your own provider keys belongs to the ${BYOK_SURFACES.label}. ${BYOK_SURFACES.availability} Hosted Web and Desktop are Managed Cloud only and never store a provider key of yours.`}
      </p>
    </div>
  );
}
