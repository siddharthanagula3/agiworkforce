import { useCallback, useEffect, useMemo, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';
import type { ManagedCloudScheduleSources } from '@agiworkforce/cloud-contracts';
import { listConnectors, type CloudConnectorEntry } from '../../api/cloudConnectors';
import { CONNECTORS } from '../connectors/connectorDefinitions';

interface DesktopScheduleAccessFieldsProps {
  hasProject: boolean;
  sources: ManagedCloudScheduleSources;
  connectors: string[] | null;
  onChange: (patch: {
    sources?: ManagedCloudScheduleSources;
    connectors?: string[] | null;
  }) => void;
  loadConnectors?: () => Promise<{ connectors: CloudConnectorEntry[] }>;
}

interface ConnectedConnector {
  key: string;
  serverId: string;
  name: string;
}

const SOURCE_OPTIONS: ReadonlyArray<{
  key: keyof ManagedCloudScheduleSources;
  label: string;
  helper: string;
}> = [
  {
    key: 'project',
    label: 'Project instructions and files',
    helper: 'From the project this schedule belongs to.',
  },
  { key: 'memory', label: 'Saved memories', helper: 'Read only while memory is on in Settings.' },
  { key: 'web', label: 'The web', helper: 'Web search and reading pages.' },
];

const CHECKBOX_CLASS = 'mt-0.5 accent-[var(--chat-accent-primary)]';

function connectorName(entry: CloudConnectorEntry): string {
  if (entry.name) return entry.name;
  const catalogId = entry.connectorId.replace(/-/g, '_');
  const known = CONNECTORS.find((connector) => connector.id === catalogId);
  if (known) return known.name;
  return entry.connectorId
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function DesktopScheduleAccessFields({
  hasProject,
  sources,
  connectors,
  onChange,
  loadConnectors = listConnectors,
}: DesktopScheduleAccessFieldsProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [entries, setEntries] = useState<CloudConnectorEntry[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    loadConnectors().then(
      (result) => {
        if (cancelled) return;
        setEntries(result.connectors);
        setStatus('ready');
      },
      () => {
        if (!cancelled) setStatus('error');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt, loadConnectors]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const connected = useMemo<ConnectedConnector[]>(
    () =>
      entries
        .map((entry) => ({
          key: entry.id,
          serverId: entry.toolConnectorId ?? entry.connectorId,
          name: connectorName(entry),
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [entries],
  );

  const toggleConnector = (serverId: string, included: boolean) => {
    const base = connectors ?? connected.map((entry) => entry.serverId);
    const next = included
      ? base.includes(serverId)
        ? base
        : [...base, serverId]
      : base.filter((id) => id !== serverId);
    onChange({ connectors: next });
  };

  return (
    <section
      aria-labelledby="desktop-schedule-access-heading"
      className="mt-5 space-y-4 rounded-lg border border-[var(--chat-border)] p-4"
    >
      <h3
        id="desktop-schedule-access-heading"
        className="text-sm font-medium text-[var(--chat-text-primary)]"
      >
        What each run can use
      </h3>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-medium text-[var(--chat-text-secondary)]">
          Sources
        </legend>
        {SOURCE_OPTIONS.filter((option) => option.key !== 'project' || hasProject).map((option) => (
          <label key={option.key} className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={sources[option.key]}
              onChange={(event) =>
                onChange({ sources: { ...sources, [option.key]: event.target.checked } })
              }
              className={CHECKBOX_CLASS}
            />
            <span className="min-w-0">
              <span className="block text-sm text-[var(--chat-text-primary)]">{option.label}</span>
              <span className="block text-xs text-[var(--chat-text-muted)]">{option.helper}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-medium text-[var(--chat-text-secondary)]">
          Connectors
        </legend>
        <p className="text-xs text-[var(--chat-text-muted)]">
          A run can use tools only from the connectors checked here. A tool that needs your approval
          still pauses the run until you approve or deny it.
        </p>
        {status === 'loading' ? (
          <p className="flex items-center gap-2 text-sm text-[var(--chat-text-muted)]">
            <Spinner size="sm" />
            Reading your connectors…
          </p>
        ) : status === 'error' ? (
          <div className="flex flex-wrap items-center gap-2">
            <p role="alert" className="text-sm text-[var(--chat-destructive-text)]">
              Your connectors could not be read.
            </p>
            <button
              type="button"
              onClick={retry}
              className="rounded-lg border border-[var(--chat-border)] px-3 py-1.5 text-sm font-medium text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
            >
              Try again
            </button>
          </div>
        ) : connected.length === 0 ? (
          <p className="text-sm text-[var(--chat-text-muted)]">
            No connectors are connected. Connect one in Settings to let runs use it.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {connected.map((entry) => (
              <li key={entry.key}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={connectors === null || connectors.includes(entry.serverId)}
                    onChange={(event) => toggleConnector(entry.serverId, event.target.checked)}
                    className={CHECKBOX_CLASS}
                  />
                  <span className="text-sm text-[var(--chat-text-primary)]">{entry.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {status === 'ready' && connected.length > 0 ? (
          <p className="text-xs text-[var(--chat-text-muted)]">
            {connectors === null
              ? 'Every connector is included, including ones you connect later. Uncheck one to choose exactly which the schedule uses.'
              : 'A connector you connect later is not added until you check it here.'}
          </p>
        ) : null}
      </fieldset>
    </section>
  );
}
