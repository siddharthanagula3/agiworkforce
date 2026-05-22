import { Bot, Clock, FileText, Play, RefreshCw, Square, Zap } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/utils';

// --- Mock data (backend wiring deferred per plan §8 R10) ---

interface Dispatcher {
  id: string;
  name: string;
  model: string;
  status: 'idle' | 'running' | 'paused';
  tasksCompleted: number;
  lastActive: string;
}

interface LiveArtifact {
  id: string;
  name: string;
  type: 'file' | 'report' | 'code';
  dispatcherId: string;
  updatedAt: string;
  sizeKb: number;
}

interface ScheduledCoworkTask {
  id: string;
  title: string;
  cron: string;
  nextRun: string;
  dispatcherId: string;
  enabled: boolean;
}

const MOCK_DISPATCHERS: Dispatcher[] = [
  {
    id: 'd1',
    name: 'Research Agent',
    model: 'Anthropic',
    status: 'running',
    tasksCompleted: 14,
    lastActive: 'just now',
  },
  {
    id: 'd2',
    name: 'Code Review Bot',
    model: 'OpenAI',
    status: 'idle',
    tasksCompleted: 7,
    lastActive: '3 min ago',
  },
  {
    id: 'd3',
    name: 'Data Analyst',
    model: 'Google',
    status: 'paused',
    tasksCompleted: 2,
    lastActive: '1 hr ago',
  },
];

const MOCK_ARTIFACTS: LiveArtifact[] = [
  {
    id: 'a1',
    name: 'market-analysis.md',
    type: 'report',
    dispatcherId: 'd1',
    updatedAt: '2 min ago',
    sizeKb: 42,
  },
  {
    id: 'a2',
    name: 'refactor-notes.ts',
    type: 'code',
    dispatcherId: 'd2',
    updatedAt: '8 min ago',
    sizeKb: 15,
  },
  {
    id: 'a3',
    name: 'summary-report.pdf',
    type: 'file',
    dispatcherId: 'd1',
    updatedAt: '22 min ago',
    sizeKb: 210,
  },
];

const MOCK_SCHEDULED: ScheduledCoworkTask[] = [
  {
    id: 's1',
    title: 'Daily digest',
    cron: '0 8 * * *',
    nextRun: 'Tomorrow 08:00',
    dispatcherId: 'd1',
    enabled: true,
  },
  {
    id: 's2',
    title: 'Weekly code audit',
    cron: '0 9 * * 1',
    nextRun: 'Mon 09:00',
    dispatcherId: 'd2',
    enabled: false,
  },
];

// --- Sub-cards ---

function statusDot(status: Dispatcher['status']) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        status === 'running' && 'bg-green-400',
        status === 'idle' && 'bg-slate-400',
        status === 'paused' && 'bg-amber-400',
      )}
    />
  );
}

function DispatcherList({ dispatchers }: { dispatchers: Dispatcher[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <Bot className="h-3.5 w-3.5" />
        Dispatchers
      </div>
      <ul className="space-y-2">
        {dispatchers.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2">
              {statusDot(d.status)}
              <span className="font-medium text-white">{d.name}</span>
              <span className="text-xs text-slate-400">{d.model}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span>{d.tasksCompleted} done</span>
              <span className="text-slate-500">{d.lastActive}</span>
              {d.status === 'running' ? (
                <Square className="h-3.5 w-3.5 cursor-pointer hover:text-red-400" />
              ) : (
                <Play className="h-3.5 w-3.5 cursor-pointer hover:text-green-400" />
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function artifactIcon(type: LiveArtifact['type']) {
  if (type === 'code') return <Zap className="h-3.5 w-3.5 text-blue-400" />;
  if (type === 'report') return <FileText className="h-3.5 w-3.5 text-emerald-400" />;
  return <FileText className="h-3.5 w-3.5 text-slate-400" />;
}

function LiveArtifactsPanel({ artifacts }: { artifacts: LiveArtifact[] }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <RefreshCw className="h-3.5 w-3.5 animate-spin-slow" />
        Live Artifacts
      </div>
      {artifacts.length === 0 ? (
        <p className="text-xs text-slate-500">No artifacts yet.</p>
      ) : (
        <ul className="space-y-2">
          {artifacts.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                {artifactIcon(a.type)}
                <span className="font-medium text-white">{a.name}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>{a.sizeKb} KB</span>
                <span>{a.updatedAt}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScheduledTasksCard({ tasks }: { tasks: ScheduledCoworkTask[] }) {
  const [localTasks, setLocalTasks] = useState(tasks);

  function toggle(id: string) {
    setLocalTasks((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)));
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <Clock className="h-3.5 w-3.5" />
        Scheduled Tasks
      </div>
      {localTasks.length === 0 ? (
        <p className="text-xs text-slate-500">No scheduled tasks.</p>
      ) : (
        <ul className="space-y-2">
          {localTasks.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2 text-sm"
            >
              <div>
                <span className="font-medium text-white">{t.title}</span>
                <p className="mt-0.5 text-xs text-slate-400">
                  <span className="font-mono">{t.cron}</span> — next: {t.nextRun}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggle(t.id)}
                className={cn(
                  'rounded px-2 py-1 text-xs font-medium transition',
                  t.enabled
                    ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600',
                )}
              >
                {t.enabled ? 'On' : 'Off'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Main tab ---

export function CoworkTab() {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Cowork</h1>
          <p className="text-xs text-slate-400">Dispatcher agents working alongside you</p>
        </div>
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
          Mock data
        </span>
      </div>

      <DispatcherList dispatchers={MOCK_DISPATCHERS} />
      <LiveArtifactsPanel artifacts={MOCK_ARTIFACTS} />
      <ScheduledTasksCard tasks={MOCK_SCHEDULED} />
    </div>
  );
}
