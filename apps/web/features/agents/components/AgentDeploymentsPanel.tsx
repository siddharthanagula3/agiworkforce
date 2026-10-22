'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, Skeleton, Spinner, useMenuKeyboard } from '@agiworkforce/ui';
import type { ManagedCloudAgent } from '@agiworkforce/cloud-contracts';
import { MoreHorizontal, Pause, Pencil, Play } from 'lucide-react';

import { scheduleTiming } from '@/features/schedules/components/ScheduleCard';
import { scheduleApi, type ScheduleApi } from '@/features/schedules/services/schedule-api';
import { formatDateTime, type ScheduleRun, type ScheduleTask } from '@/features/schedules/types';
import { toUserMessage } from '@/lib/user-error-message';
import { formatRelativeTime } from '@shared/utils/format';
import type { AgentsApi } from '../services/agents-client';

const RECENT_RUN_COUNT = 10;
const SECTION = 'flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5';

interface Deployment {
  schedule: ScheduleTask;
  runs: ScheduleRun[];
}

type DeploymentsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; deployments: Deployment[] };

function newScheduleHref(agentId: string): string {
  return `/chat/schedules?agent=${encodeURIComponent(agentId)}`;
}

function scheduleHref(scheduleId: string): string {
  return `/chat/schedules?schedule=${encodeURIComponent(scheduleId)}`;
}

async function loadDeployment(api: ScheduleApi, scheduleId: string): Promise<Deployment> {
  const [schedule, history] = await Promise.all([
    api.getSchedule(scheduleId),
    api.listRuns(scheduleId, { limit: RECENT_RUN_COUNT, offset: 0 }),
  ]);
  return { schedule, runs: history.runs };
}

function runSegmentClass(status: ScheduleRun['status']): string {
  if (status === 'success') return 'bg-success-fill';
  if (status === 'failed' || status === 'timeout') return 'bg-danger-fill';
  return 'bg-muted-foreground';
}

function RunActivityBar({ runs }: { runs: readonly ScheduleRun[] }) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">No runs yet</p>;
  }
  const ordered = [...runs].reverse();
  const succeeded = runs.filter((run) => run.status === 'success').length;
  const failed = runs.filter((run) => run.status === 'failed' || run.status === 'timeout').length;
  return (
    <div
      role="img"
      aria-label={`Last ${runs.length} runs: ${succeeded} succeeded, ${failed} failed`}
      className="flex h-2 w-28 items-stretch gap-0.5"
    >
      {ordered.map((run) => (
        <span key={run.id} className={`flex-1 rounded-full ${runSegmentClass(run.status)}`} />
      ))}
    </div>
  );
}

function DeploymentMenu({
  schedule,
  disabled,
  onToggleEnabled,
}: {
  schedule: ScheduleTask;
  disabled: boolean;
  onToggleEnabled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useMenuKeyboard({ open, onClose: close, panelRef, triggerRef });

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open, close]);

  const itemClass =
    'flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50';

  return (
    <div ref={containerRef} className="relative">
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="icon"
        className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        aria-label={`More actions for ${schedule.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>
      {open ? (
        <div
          ref={panelRef}
          role="menu"
          aria-label={`Actions for ${schedule.name}`}
          className="absolute end-0 top-full z-[var(--z-dropdown)] mt-1 min-w-[190px] rounded-lg border border-border bg-popover py-1 shadow-lg"
        >
          <Link
            href={scheduleHref(schedule.id)}
            role="menuitem"
            className={itemClass}
            onClick={close}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit schedule
          </Link>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            disabled={disabled}
            onClick={() => {
              close();
              onToggleEnabled();
            }}
          >
            {schedule.isEnabled ? (
              <Pause className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4" aria-hidden="true" />
            )}
            {schedule.isEnabled ? 'Pause' : 'Resume'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function DeploymentRow({
  deployment,
  version,
  busy,
  onRunNow,
  onToggleEnabled,
}: {
  deployment: Deployment;
  version: string;
  busy: boolean;
  onRunNow: () => void;
  onToggleEnabled: () => void;
}) {
  const { schedule, runs } = deployment;
  const canRun = schedule.isEnabled && schedule.status === 'active' && !busy;
  const canToggle = schedule.status !== 'completed' && schedule.status !== 'expired' && !busy;
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="min-w-0 break-words text-base font-medium text-foreground">
            {schedule.name}
          </h3>
          <Badge variant="outline">{version}</Badge>
          {!schedule.isEnabled ? <Badge variant="secondary">Paused</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">{scheduleTiming(schedule)}</p>
        {schedule.isEnabled && schedule.nextExecutionAt ? (
          <p className="text-sm text-muted-foreground">
            Next {formatRelativeTime(schedule.nextExecutionAt)}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col gap-1">
          <RunActivityBar runs={runs} />
          <p className="text-sm text-muted-foreground">
            {schedule.lastExecutedAt
              ? `Last run ${formatDateTime(schedule.lastExecutedAt, schedule.timezone)}`
              : 'Not run yet'}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
          <Link href={scheduleHref(schedule.id)}>View sessions</Link>
        </Button>
        <Button
          type="button"
          size="sm"
          className="pointer-coarse:min-h-11"
          disabled={!canRun}
          aria-busy={busy}
          aria-label={`Run ${schedule.name} now`}
          onClick={onRunNow}
        >
          {busy ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
          Run now
        </Button>
        <DeploymentMenu
          schedule={schedule}
          disabled={!canToggle}
          onToggleEnabled={onToggleEnabled}
        />
      </div>
    </li>
  );
}

export function AgentDeploymentsPanel({
  api,
  agent,
  schedules = scheduleApi,
}: {
  api: AgentsApi;
  agent: ManagedCloudAgent;
  schedules?: ScheduleApi;
}) {
  const headingId = useId();
  const [state, setState] = useState<DeploymentsState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const version = agent.publishedVersion === null ? 'Draft' : `v${agent.publishedVersion}`;

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const { routines } = await api.activity(agent.id);
        const settled = await Promise.allSettled(
          routines.map((routine) => loadDeployment(schedules, routine.id)),
        );
        if (cancelled) return;
        const deployments = settled.flatMap((result) =>
          result.status === 'fulfilled' ? [result.value] : [],
        );
        if (routines.length > 0 && deployments.length === 0) {
          throw new Error('Deployments could not be loaded.');
        }
        setState({ status: 'ready', deployments });
      } catch (reason) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: toUserMessage(reason, 'Deployments could not be loaded.'),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, schedules, agent.id, attempt]);

  const replaceDeployment = (next: Deployment) =>
    setState((current) =>
      current.status === 'ready'
        ? {
            status: 'ready',
            deployments: current.deployments.map((entry) =>
              entry.schedule.id === next.schedule.id ? next : entry,
            ),
          }
        : current,
    );

  const runNow = async (deployment: Deployment) => {
    setBusyId(deployment.schedule.id);
    try {
      await schedules.runNow(deployment.schedule.id, globalThis.crypto.randomUUID());
      toast.success(`Started ${deployment.schedule.name}.`);
      replaceDeployment(await loadDeployment(schedules, deployment.schedule.id));
    } catch (reason) {
      toast.error(toUserMessage(reason, `${deployment.schedule.name} could not be started.`));
    } finally {
      setBusyId(null);
    }
  };

  const toggleEnabled = async (deployment: Deployment) => {
    setBusyId(deployment.schedule.id);
    try {
      const schedule = await schedules.setScheduleEnabled(
        deployment.schedule.id,
        !deployment.schedule.isEnabled,
      );
      replaceDeployment({ ...deployment, schedule });
    } catch (reason) {
      toast.error(toUserMessage(reason, `${deployment.schedule.name} could not be changed.`));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-labelledby={headingId} className={SECTION}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-base font-medium text-foreground">
          Deployments
        </h2>
        {agent.isOwner ? (
          <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
            <Link href={newScheduleHref(agent.id)}>New deployment</Link>
          </Button>
        ) : null}
      </div>
      {state.status === 'loading' ? (
        <div role="status" aria-label="Loading deployments" className="flex flex-col gap-2">
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ) : state.status === 'error' ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-danger">
            {state.message}
          </p>
          <Button variant="outline" size="sm" onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </Button>
        </div>
      ) : state.deployments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No deployments yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {state.deployments.map((deployment) => (
            <DeploymentRow
              key={deployment.schedule.id}
              deployment={deployment}
              version={version}
              busy={busyId === deployment.schedule.id}
              onRunNow={() => void runNow(deployment)}
              onToggleEnabled={() => void toggleEnabled(deployment)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
