'use client';

import type { ReactNode } from 'react';
import { Switch } from '@agiworkforce/ui';
import { SettingsSectionLink } from '../components/SettingsSectionLink';
import { ToolApprovalDefaultsPanel } from '../components/ToolApprovalDefaultsPanel';
import { LockdownModePanel } from '@/features/settings/components/LockdownModePanel';
import { useCapabilitiesPreferences } from '../hooks/use-capabilities-preferences';

export function CapabilitiesSection() {
  const { settings, saving, saveError, savedAt, loadError, retry, setBoolean } =
    useCapabilitiesPreferences();

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
        <p
          className={`mt-2 text-xs ${loadError ? 'text-danger' : 'text-muted-foreground'}`}
          role="status"
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
        </p>
        {loadError && (
          <button
            type="button"
            onClick={retry}
            className="mt-2 rounded-md border border-border/60 px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted/60"
          >
            Try again
          </button>
        )}
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

      <ToolApprovalDefaultsPanel />

      <LockdownModePanel />

      <p className="text-xs text-muted-foreground">
        Memory has moved to{' '}
        <SettingsSectionLink
          section="memory"
          className="text-[var(--chat-accent-primary-text)] hover:underline"
        >
          Memory
        </SettingsSectionLink>
        .
      </p>

      <p className="text-xs text-muted-foreground">
        Skills have moved to{' '}
        <SettingsSectionLink
          section="skills"
          className="text-[var(--chat-accent-primary-text)] hover:underline"
        >
          Customize → Skills
        </SettingsSectionLink>
        .
      </p>

      <p className="text-xs text-muted-foreground">
        Running models on your own provider keys?{' '}
        <a
          href="/settings/byok"
          className="inline-block min-h-6 py-0.5 text-[var(--chat-accent-primary-text)] hover:underline"
        >
          API keys (BYOK)
        </a>
        .
      </p>
    </div>
  );
}
