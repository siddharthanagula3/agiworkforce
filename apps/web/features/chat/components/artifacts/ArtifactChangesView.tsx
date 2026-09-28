import { useMemo } from 'react';
import { translateUiPlural } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import {
  artifactChanges,
  type ArtifactChangeKind,
  type ArtifactChangeRun,
  type ArtifactChangeUnit,
} from '@agiworkforce/artifacts';

export interface ArtifactChangesViewProps {
  previous: string;
  next: string;
  unit: ArtifactChangeUnit;
  fromVersion: number;
  toVersion: number;
}

type ChangedKind = Exclude<ArtifactChangeKind, 'same'>;

const MARKERS: Record<ChangedKind, { start: string; end: string }> = {
  added: { start: 'Added: ', end: ' End of addition. ' },
  removed: { start: 'Removed: ', end: ' End of removal. ' },
};

const COLOURS: Record<ChangedKind, string> = {
  added: 'bg-diff-added-fill text-diff-added-text',
  removed: 'bg-diff-removed-fill text-diff-removed-text',
};

const LINE_SIGNS: Record<ArtifactChangeKind, string> = { same: '', added: '+', removed: '-' };

function Lines({ run }: { run: ArtifactChangeRun }) {
  return run.text.split('\n').map((line, index) => (
    <div key={index} className="flex">
      <span aria-hidden="true" className="w-8 shrink-0 select-none text-center">
        {LINE_SIGNS[run.kind]}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words pe-4">{line || ' '}</span>
    </div>
  ));
}

function ChangedRun({
  kind,
  run,
  unit,
}: {
  kind: ChangedKind;
  run: ArtifactChangeRun;
  unit: ArtifactChangeUnit;
}) {
  const Tag = kind === 'added' ? 'ins' : 'del';
  const decoration =
    unit === 'line' ? 'block no-underline' : kind === 'added' ? 'underline' : 'line-through';
  return (
    <Tag className={cn(COLOURS[kind], decoration)}>
      <span className="sr-only">{MARKERS[kind].start}</span>
      {unit === 'line' ? <Lines run={run} /> : run.text}
      <span className="sr-only">{MARKERS[kind].end}</span>
    </Tag>
  );
}

export function ArtifactChangesView({
  previous,
  next,
  unit,
  fromVersion,
  toVersion,
}: ArtifactChangesViewProps) {
  const changes = useMemo(() => artifactChanges(previous, next, unit), [previous, next, unit]);
  const summary =
    changes.added === 0 && changes.removed === 0
      ? `No changes since version ${fromVersion}`
      : changes.unit === 'line'
        ? translateUiPlural(
            'chat',
            'counts.artifactLinesChangedSince',
            changes.added,
            {
              one: 'Since version {{version}}: {{count}} line added, {{removed}} removed',
              other: 'Since version {{version}}: {{count}} lines added, {{removed}} removed',
            },
            { version: fromVersion, removed: changes.removed },
          )
        : translateUiPlural(
            'chat',
            'counts.artifactWordsChangedSince',
            changes.added,
            {
              one: 'Since version {{version}}: {{count}} word added, {{removed}} removed',
              other: 'Since version {{version}}: {{count}} words added, {{removed}} removed',
            },
            { version: fromVersion, removed: changes.removed },
          );

  return (
    <div className="flex h-full w-full flex-col bg-background" data-testid="artifact-changes">
      <p className="shrink-0 border-b border-border/30 px-4 py-2 text-xs text-muted-foreground">
        {summary}
      </p>
      <div
        role="region"
        aria-label={`Changes from version ${fromVersion} to version ${toVersion}`}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div
          className={cn(
            'text-sm leading-6 text-foreground',
            changes.unit === 'line'
              ? 'py-2 font-mono'
              : 'whitespace-pre-wrap break-words px-5 py-4',
          )}
        >
          {changes.runs.map((run, index) =>
            run.kind === 'same' ? (
              changes.unit === 'line' ? (
                <Lines key={index} run={run} />
              ) : (
                <span key={index}>{run.text}</span>
              )
            ) : (
              <ChangedRun key={index} kind={run.kind} run={run} unit={changes.unit} />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
