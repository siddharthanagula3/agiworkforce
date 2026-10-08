'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Button, Checkbox, Label, Spinner } from '@agiworkforce/ui';
import type { ManagedCloudScheduleSources } from '@agiworkforce/cloud-contracts';
import { CONNECTORS_COMING_SOON_MESSAGE, connectorsReleased } from '@agiworkforce/types';
import { CONNECTORS } from '@/features/connectors/data/connectors';
import { useConnectors } from '@/features/connectors/hooks/use-connectors';

interface ScheduleAccessFieldsProps {
  hasProject: boolean;
  sources: ManagedCloudScheduleSources;
  connectors: string[] | null;
  onChange: (patch: {
    sources?: ManagedCloudScheduleSources;
    connectors?: string[] | null;
  }) => void;
}

interface ConnectedConnector {
  id: string;
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
  {
    key: 'memory',
    label: 'Saved memories',
    helper: 'Read only while memory is on in Settings.',
  },
  {
    key: 'web',
    label: 'The web',
    helper: 'Web search and reading pages.',
  },
  {
    key: 'recentChats',
    label: 'Recent chats',
    helper:
      'Your chats from the last 24 hours. Read only while Search past chats is on in Settings.',
  },
];

export function ScheduleAccessFields({
  hasProject,
  sources,
  connectors,
  onChange,
}: ScheduleAccessFieldsProps) {
  const { connectedIds, customNames, toolConnectorIds, loading, error, retry } = useConnectors();

  const connected = useMemo<ConnectedConnector[]>(
    () =>
      [...connectedIds]
        .map((id) => ({
          id,
          serverId: toolConnectorIds[id] ?? id,
          name: CONNECTORS.find((entry) => entry.id === id)?.name ?? customNames[id] ?? id,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    [connectedIds, customNames, toolConnectorIds],
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

  const visibleSources = SOURCE_OPTIONS.filter((option) => option.key !== 'project' || hasProject);

  return (
    <section
      aria-labelledby="schedule-access-heading"
      className="space-y-5 rounded-xl border border-border/70 bg-muted/20 p-4"
    >
      <h3 id="schedule-access-heading" className="text-sm font-medium text-foreground">
        What Each Run Can Use
      </h3>

      <fieldset className="space-y-3">
        <legend className="text-xs font-medium text-muted-foreground">Sources</legend>
        {visibleSources.map((option) => {
          const id = `schedule-source-${option.key}`;
          return (
            <div key={option.key} className="flex items-start gap-3">
              <Checkbox
                id={id}
                checked={sources[option.key] === true}
                onCheckedChange={(checked) =>
                  onChange({ sources: { ...sources, [option.key]: checked === true } })
                }
                aria-describedby={`${id}-helper`}
              />
              <div className="min-w-0">
                <Label htmlFor={id} className="cursor-pointer">
                  {option.label}
                </Label>
                <p id={`${id}-helper`} className="text-xs text-muted-foreground">
                  {option.helper}
                </p>
              </div>
            </div>
          );
        })}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-medium text-muted-foreground">Connectors</legend>
        {connectorsReleased() ? (
          <ConnectorChoices
            connected={connected}
            connectors={connectors}
            loading={loading}
            error={error}
            retry={retry}
            toggleConnector={toggleConnector}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{CONNECTORS_COMING_SOON_MESSAGE}</p>
        )}
      </fieldset>
    </section>
  );
}

function ConnectorChoices({
  connected,
  connectors,
  loading,
  error,
  retry,
  toggleConnector,
}: {
  connected: ConnectedConnector[];
  connectors: string[] | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  toggleConnector: (serverId: string, included: boolean) => void;
}) {
  return (
    <>
      <p className="text-xs text-muted-foreground">
        A run can use tools only from the connectors checked here. A tool that needs your approval
        still pauses the run until you approve or deny it.
      </p>
      {loading ? (
        <div className="flex items-center gap-2">
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Reading your connectors…</span>
        </div>
      ) : error ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : connected.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No connectors are connected.{' '}
          <Link
            href="/connectors"
            className="font-medium text-foreground underline underline-offset-2"
          >
            Connect one
          </Link>{' '}
          to let runs use it.
        </p>
      ) : (
        <ul className="space-y-2">
          {connected.map((entry) => {
            const id = `schedule-connector-${entry.id}`;
            return (
              <li key={entry.id} className="flex items-center gap-3">
                <Checkbox
                  id={id}
                  checked={connectors === null || connectors.includes(entry.serverId)}
                  onCheckedChange={(checked) => toggleConnector(entry.serverId, checked === true)}
                />
                <Label htmlFor={id} className="cursor-pointer">
                  {entry.name}
                </Label>
              </li>
            );
          })}
        </ul>
      )}
      {connectors === null && connected.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Every connector is included, including ones you connect later. Uncheck one to choose
          exactly which the schedule uses.
        </p>
      ) : connectors !== null && connected.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          A connector you connect later is not added until you check it here.
        </p>
      ) : null}
    </>
  );
}
