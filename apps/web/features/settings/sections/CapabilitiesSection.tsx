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
import {
  TOOL_ACCESS_MODES,
  TOOL_ACCESS_SETTING_KEY,
  type ToolAccessMode,
} from '@agiworkforce/cloud-contracts';

const TOOL_ACCESS_COPY: Record<ToolAccessMode, { label: string; description: string }> = {
  auto: { label: 'Auto', description: 'AGI chooses for you' },
  on_demand: {
    label: 'On demand',
    description: 'Load tools when needed. More steps, lower accuracy',
  },
  always: {
    label: 'Always available',
    description: 'Ready from the start. Fewer messages, better accuracy',
  },
};

const TOOL_ACCESS_OPTIONS = TOOL_ACCESS_MODES.map((mode) => ({ mode, ...TOOL_ACCESS_COPY[mode] }));

export function CapabilitiesSection() {
  const {
    settings,
    loaded,
    availableSwitches,
    saving,
    saveError,
    savedAt,
    loadError,
    retry,
    retrySave,
    setBoolean,
    setToolAccess,
  } = useCapabilitiesPreferences();
  const switchesLocked = !loaded || loadError !== null;
  const artifactsRequired = settings.cloudCodeExecution;

  const row = (title: string, description: string, control: ReactNode, note?: ReactNode) => (
    <li className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0 max-w-xl">
        <p className="text-base text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        {note}
      </div>
      {control}
    </li>
  );

  return (
    <div className="space-y-8">
      <div>
        <PaneTitle className="max-md:font-medium">Capabilities</PaneTitle>
        <p className="mt-1 text-xs text-muted-foreground">
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
            'Run code and create files in a sandbox that can reach only GitHub, npm and PyPI.',
            <Switch
              aria-label="Cloud code execution and file creation"
              checked={settings.cloudCodeExecution}
              disabled={switchesLocked}
              onCheckedChange={(value) => setBoolean('cloudCodeExecution', value)}
            />,
          )}
        </ul>
      </section>

      {availableSwitches.includes('artifacts') ||
      availableSwitches.includes('inlineVisualizations') ? (
        <section aria-labelledby="capabilities-visuals-heading" className="flex flex-col">
          <h2 id="capabilities-visuals-heading" className="text-h3 text-foreground">
            Artifacts and visualizations
          </h2>
          <ul className="divide-y divide-border">
            {availableSwitches.includes('artifacts')
              ? row(
                  'Artifacts',
                  'Create apps, documents and diagrams in a side preview.',
                  <Switch
                    aria-label="Artifacts"
                    aria-describedby={
                      artifactsRequired ? 'capabilities-artifacts-required' : undefined
                    }
                    checked={artifactsRequired || settings.artifacts}
                    disabled={switchesLocked || artifactsRequired}
                    onCheckedChange={(value) => setBoolean('artifacts', value)}
                  />,
                  artifactsRequired ? (
                    <p
                      id="capabilities-artifacts-required"
                      className="mt-1 text-xs text-muted-foreground"
                    >
                      Required by code execution
                    </p>
                  ) : null,
                )
              : null}
            {availableSwitches.includes('inlineVisualizations')
              ? row(
                  'Inline visualizations',
                  'Show charts and diagrams right in the chat.',
                  <Switch
                    aria-label="Inline visualizations"
                    checked={settings.inlineVisualizations}
                    disabled={switchesLocked}
                    onCheckedChange={(value) => setBoolean('inlineVisualizations', value)}
                  />,
                )
              : null}
          </ul>
        </section>
      ) : null}

      {availableSwitches.includes(TOOL_ACCESS_SETTING_KEY) ? (
        <section aria-labelledby="capabilities-tool-access-heading" className="flex flex-col">
          <h2 id="capabilities-tool-access-heading" className="text-h3 text-foreground">
            Tool access
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose when tools from your connected apps load in a chat.
          </p>
          <div
            role="radiogroup"
            aria-labelledby="capabilities-tool-access-heading"
            className="divide-y divide-border"
          >
            {TOOL_ACCESS_OPTIONS.map((option) => (
              <label
                key={option.mode}
                className={`flex items-start gap-3 py-4 ${
                  switchesLocked ? 'cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                <input
                  type="radio"
                  name="capabilities-tool-access"
                  value={option.mode}
                  checked={settings.toolAccess === option.mode}
                  disabled={switchesLocked}
                  onChange={() => setToolAccess(option.mode)}
                  className="mt-1"
                />
                <span className="min-w-0 max-w-xl">
                  <span className="block text-base text-foreground">{option.label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <LocalAccessSection />
      <BrowserPairingSection />
      <RemoteControlSection />

      <ToolApprovalDefaultsPanel />

      <ApprovalHistoryPanel />

      <LockdownModePanel />

      <p className="text-xs text-muted-foreground">
        {`Running models on your own provider keys belongs to the ${BYOK_SURFACES.label}. ${BYOK_SURFACES.availability} Hosted Web and Desktop chat are Cloud only and never store a provider key of yours.`}
      </p>
    </div>
  );
}
