'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain,
  ChartColumn,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleAlert,
  FileText,
  Files,
  FolderOpen,
  FolderPlus,
  Globe,
  Info,
  Monitor,
  PanelRight,
  Sparkles,
  SquareTerminal,
  X,
  type LucideIcon,
} from 'lucide-react';
import type {
  AgentActivityEntry,
  AgentActivityState,
  AgentActivityToolEntry,
} from '@agiworkforce/client-runtime';
import { Button } from '@agiworkforce/ui';
import {
  agiWorkPlanSentence,
  buildAgentActivitySummary,
  getManagedModelPresentationLabel,
  useCapability,
} from '@agiworkforce/unified-chat';
import {
  isAutoModeModelId,
  runStatusLabel,
  toolCallStatusLabel,
  type CloudWorkMode,
} from '@agiworkforce/types';
import type { Message } from '@shared/stores/web-chat-store';
import { cn } from '@shared/lib/utils';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useArtifactsStore } from '../../stores/artifacts-store';
import {
  SHEET_OVERLAY_QUERY,
  useOverlayDialog,
  useOverlayLayout,
} from '../../hooks/use-overlay-dialog';
import { SidePanelResizeHandle, useSidePanelWidth } from '../SidePanelResizeHandle';
import {
  PanelWindowButton,
  useDetachedWindowTitle,
} from '@/features/desktop-host/components/PanelWindow';
import type { PanelWindowControls } from '@/features/desktop-host/lib/panel-windows';
import {
  AGI_WORK_LABEL,
  CHAT_DOCK_FALLBACK_TITLE,
  CHAT_DOCK_PANEL_LABEL,
  TASK_DOCK_ARTIFACTS_LABEL,
  TASK_DOCK_BROWSER_ACTIVE,
  TASK_DOCK_CHIPS_OVERFLOW_LABEL,
  TASK_DOCK_CONNECTORS_LABEL,
  TASK_DOCK_CONTEXT_EMPTY,
  TASK_DOCK_CONTEXT_LABEL,
  TASK_DOCK_FALLBACK_TITLE,
  TASK_DOCK_KNOWLEDGE_LABEL,
  TASK_DOCK_LABEL,
  TASK_DOCK_OUTPUTS_EMPTY,
  TASK_DOCK_OUTPUTS_LABEL,
  TASK_DOCK_PANEL_LABEL,
  TASK_DOCK_PROGRESS_EMPTY,
  TASK_DOCK_PROGRESS_LABEL,
  TASK_DOCK_SOURCES_LABEL,
  TASK_DOCK_STEPS_LABEL,
  TASK_DOCK_TERMINAL_ACTIVE,
} from '../../lib/agi-work';
import { useDesktopHost } from '@/features/desktop-host/lib/host';
import { supportsDirectoryPicker, useCoworkFolderStore } from '@shared/stores/cowork-folder-store';
import {
  ROW_LABEL_FOLDER,
  ROW_LABEL_LOCAL_FOLDER,
  requestLocalFolderAttach,
} from '../Composer/ComposerPlusMenu';
import { OutputsList, useTaskDockSummary } from './OutputsList';
import {
  connectorDisplayName,
  type TaskDockContextItem,
  type TaskDockStep,
  type TaskDockStepStatus,
  type TaskDockSummary,
} from './taskDockSummary';

const AGI_WORK_MODE: CloudWorkMode = 'agiwork';
const RUN_TICK_INTERVAL_MS = 1_000;
const MAX_SOURCE_FAVICONS = 4;
const SECTION_LABEL_CLASS = 'text-xs font-medium text-muted-foreground';
const SECTION_SUMMARY_CLASS =
  'flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2.5 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden';
const SECTION_CHEVRON_CLASS =
  'ms-auto h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none';
const DOCK_CHEVRON_CLASS =
  'h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none';
const DOCK_ACTION_CLASS =
  'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none pointer-coarse:h-11 pointer-coarse:w-11';
const STEP_SUMMARY_CLASS =
  'flex min-w-0 cursor-pointer list-none items-start gap-2 rounded-md marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden';
const CHIP_CLASS =
  'inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-[var(--chat-surface-hover)] px-2.5 py-1 text-sm text-muted-foreground';
const MAX_STEP_CHIPS = 4;
const MAX_STACKED_CONNECTOR_MARKS = 3;
const PLAN_STEP_PROGRESS_ID_PREFIX = 'agiwork:plan:';
const FILE_INPUT_KEYS = ['file_path', 'path', 'notebook_path'] as const;
const FILE_EXTENSION_PATTERN = /\.[A-Za-z0-9]+$/;
const PATH_SEPARATOR_PATTERN = /[\\/]/;
const CLOSE_ACTION_VERB = 'Close';
const OPEN_ACTION_VERB = 'Open';
const PAUSED_STATUS_LABEL = 'Paused';
const PARTIAL_STATUS_LABEL = 'Finished with errors';
const IDLE_STATUS_LABEL = 'Ready';
const CHAT_DETAILS_LABEL = 'Details';
const CHAT_DETAILS_CREATED_LABEL = 'Created';
const CHAT_DETAILS_UPDATED_LABEL = 'Last updated';
const CHAT_DETAILS_MODEL_LABEL = 'Model';
const CHAT_DETAILS_MODELS_LABEL = 'Models';
const CHAT_DETAILS_MESSAGES_LABEL = 'Messages';
const CHAT_DETAILS_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
};

interface ChatDetailRow {
  label: string;
  value: string;
}

interface WorkSessionPanelProps {
  messages: Message[];
  open: boolean;
  onClose: () => void;
  agiWork?: boolean;
  windowControls?: PanelWindowControls;
}

interface WorkSessionToggleButtonProps {
  messages: Message[];
  open: boolean;
  onToggle: () => void;
  agiWork?: boolean;
}

function statusLabel(status: TaskDockSummary['status']): string {
  switch (status) {
    case 'pending':
      return runStatusLabel('queued');
    case 'running':
      return runStatusLabel('running');
    case 'awaiting-approval':
      return toolCallStatusLabel('awaiting_approval');
    case 'paused':
      return PAUSED_STATUS_LABEL;
    case 'completed':
      return runStatusLabel('completed');
    case 'partial':
      return PARTIAL_STATUS_LABEL;
    case 'failed':
      return runStatusLabel('failed');
    case 'cancelled':
      return runStatusLabel('cancelled');
    default:
      return IDLE_STATUS_LABEL;
  }
}

function StatusIcon({ status }: { status: TaskDockStepStatus }) {
  if (status === 'completed') {
    return <CheckCircle2 className="h-3.5 w-3.5 text-success-text" aria-hidden="true" />;
  }
  if (status === 'running') {
    return (
      <span
        className="block h-2.5 w-2.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
        aria-hidden="true"
      />
    );
  }
  if (status === 'failed' || status === 'cancelled') {
    return <CircleAlert className="h-3.5 w-3.5 text-danger" aria-hidden="true" />;
  }
  if (
    status === 'partial' ||
    status === 'awaiting-approval' ||
    status === 'awaiting-device' ||
    status === 'paused'
  ) {
    return <CircleAlert className="h-3.5 w-3.5 text-warning-text" aria-hidden="true" />;
  }
  return <Circle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
}

interface StepChip {
  id: string;
  kind: 'command' | 'file';
  label: string;
  title: string;
}

interface StepRow {
  step: TaskDockStep;
  chips: StepChip[];
}

interface StepGroup {
  id: string;
  header: TaskDockStep | null;
  rows: StepRow[];
  connectors: string[];
}

interface ActiveTool {
  mode: 'terminal' | 'browser';
  detail: string;
}

function inputString(input: unknown, keys: readonly string[]): string | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function pathBaseName(path: string): string {
  return path.split(PATH_SEPARATOR_PATTERN).filter(Boolean).pop() ?? path;
}

function commandOf(entry: AgentActivityToolEntry): string | undefined {
  const reported = entry.command?.trim();
  if (reported) return reported;
  return entry.category === 'shell' ? inputString(entry.input, ['command']) : undefined;
}

function filePathsOf(entry: AgentActivityToolEntry): Array<{ path: string; title: string }> {
  if (entry.files?.length) {
    return entry.files.map((file) => ({ path: file.path, title: `${file.change} ${file.path}` }));
  }
  if (entry.category !== 'filesystem') return [];
  const path = inputString(entry.input, FILE_INPUT_KEYS);
  return path ? [{ path, title: path }] : [];
}

function chipsFor(stepId: string, entry: AgentActivityEntry | undefined): StepChip[] {
  if (entry?.kind !== 'tool') return [];
  const chips: StepChip[] = [];
  const command = commandOf(entry);
  if (command) {
    chips.push({ id: `${stepId}:command`, kind: 'command', label: command, title: command });
  }
  const seen = new Set<string>();
  for (const file of filePathsOf(entry)) {
    if (seen.has(file.path)) continue;
    seen.add(file.path);
    chips.push({
      id: `${stepId}:file:${file.path}`,
      kind: 'file',
      label: pathBaseName(file.path),
      title: file.title,
    });
  }
  return chips;
}

function isPlanStepEntry(entry: AgentActivityEntry | undefined): boolean {
  return entry?.kind === 'progress' && entry.progressId.startsWith(PLAN_STEP_PROGRESS_ID_PREFIX);
}

function activityEntriesByStepId(messages: readonly Message[]): Map<string, AgentActivityEntry> {
  const entries = new Map<string, AgentActivityEntry>();
  for (const message of messages) {
    for (const entry of message.metadata?.agentActivity?.entries ?? []) {
      entries.set(`${message.id}:${entry.id}`, entry);
    }
  }
  return entries;
}

function groupSteps(steps: readonly TaskDockStep[], messages: readonly Message[]): StepGroup[] {
  const entries = activityEntriesByStepId(messages);
  const groups: StepGroup[] = [];
  let current: StepGroup = { id: 'ungrouped', header: null, rows: [], connectors: [] };
  const close = () => {
    if (current.header || current.rows.length > 0) groups.push(current);
  };
  for (const step of steps) {
    const entry = entries.get(step.id);
    if (isPlanStepEntry(entry)) {
      close();
      current = { id: step.id, header: step, rows: [], connectors: [] };
      continue;
    }
    current.rows.push({ step, chips: chipsFor(step.id, entry) });
    if (entry?.kind === 'tool' && (entry.category === 'connector' || entry.category === 'mcp')) {
      const name = connectorDisplayName(entry.name, entry.summary);
      if (name && !current.connectors.includes(name)) current.connectors.push(name);
    }
  }
  close();
  return groups;
}

function recalledMemories(output: unknown): string[] {
  let value = output;
  if (typeof output === 'string') {
    try {
      value = JSON.parse(output);
    } catch {
      return [];
    }
  }
  if (!value || typeof value !== 'object') return [];
  const memories = (value as { memories?: unknown }).memories;
  if (!Array.isArray(memories)) return [];
  return memories.filter(
    (memory): memory is string => typeof memory === 'string' && memory.trim().length > 0,
  );
}

function collectRecalledKnowledge(messages: readonly Message[]): string[] {
  const recalled = new Set<string>();
  for (const message of messages) {
    for (const entry of message.metadata?.agentActivity?.entries ?? []) {
      if (entry.kind !== 'tool' || entry.category !== 'memory' || entry.status !== 'completed') {
        continue;
      }
      for (const memory of recalledMemories(entry.output)) recalled.add(memory.trim());
    }
  }
  return Array.from(recalled);
}

function activeToolOf(activity: AgentActivityState | null): ActiveTool | null {
  if (activity?.status !== 'running') return null;
  for (let index = activity.entries.length - 1; index >= 0; index -= 1) {
    const entry = activity.entries[index];
    if (entry?.kind !== 'tool' || entry.status !== 'running') continue;
    const command = commandOf(entry);
    if (command) return { mode: 'terminal', detail: command };
    const url = entry.category === 'web-fetch' ? inputString(entry.input, ['url']) : undefined;
    return url ? { mode: 'browser', detail: url } : null;
  }
  return null;
}

function isFilePath(path: string): boolean {
  return FILE_EXTENSION_PATTERN.test(pathBaseName(path));
}

function StepChips({ chips }: { chips: readonly StepChip[] }) {
  if (chips.length === 0) return null;
  const shown = chips.slice(0, MAX_STEP_CHIPS);
  const hidden = chips.length - shown.length;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5" data-testid="task-dock-step-chips">
      {shown.map((chip) => (
        <li key={chip.id} className={CHIP_CLASS} title={chip.title}>
          {chip.kind === 'command' ? (
            <SquareTerminal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className={cn('truncate', chip.kind === 'command' && 'font-mono')}>
            {chip.label}
          </span>
        </li>
      ))}
      {hidden > 0 && (
        <li className={CHIP_CLASS}>{`+${hidden} ${TASK_DOCK_CHIPS_OVERFLOW_LABEL}`}</li>
      )}
    </ul>
  );
}

function ConnectorsChip({ names }: { names: readonly string[] }) {
  return (
    <details className="group" data-testid="task-dock-connectors">
      <summary
        className={cn(
          CHIP_CLASS,
          'cursor-pointer list-none marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden',
        )}
      >
        <span className="flex items-center -space-x-1" aria-hidden="true">
          {names.slice(0, MAX_STACKED_CONNECTOR_MARKS).map((name) => (
            <span
              key={name}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--chat-surface-elevated)] text-caption font-semibold text-muted-foreground ring-2 ring-[var(--chat-surface-hover)]"
            >
              {name.charAt(0).toUpperCase()}
            </span>
          ))}
        </span>
        <span>{TASK_DOCK_CONNECTORS_LABEL}</span>
        <span className="tabular-nums">{names.length}</span>
        <ChevronRight className={DOCK_CHEVRON_CLASS} aria-hidden="true" />
      </summary>
      <ul className="mt-1.5 space-y-1 ps-2 text-sm text-foreground">
        {names.map((name) => (
          <li key={name} className="truncate">
            {name}
          </li>
        ))}
      </ul>
    </details>
  );
}

function KnowledgeRecalled({ items }: { items: readonly string[] }) {
  return (
    <details className="group mt-2" data-testid="task-dock-knowledge">
      <summary className={cn(STEP_SUMMARY_CLASS, 'items-center')}>
        <Brain className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm text-foreground">{TASK_DOCK_KNOWLEDGE_LABEL}</span>
        <span className="text-sm tabular-nums text-muted-foreground">{items.length}</span>
        <ChevronRight className={DOCK_CHEVRON_CLASS} aria-hidden="true" />
      </summary>
      <ul className="mt-1.5 space-y-1.5 ps-5">
        {items.map((item) => (
          <li key={item} className="line-clamp-3 text-sm text-muted-foreground">
            {item}
          </li>
        ))}
      </ul>
    </details>
  );
}

function ActiveToolHeader({ tool }: { tool: ActiveTool }) {
  const Icon = tool.mode === 'terminal' ? SquareTerminal : Globe;
  return (
    <div
      className="mt-2 rounded-lg bg-[var(--chat-surface-hover)] px-3 py-2"
      data-testid="task-dock-active-tool"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {tool.mode === 'terminal' ? TASK_DOCK_TERMINAL_ACTIVE : TASK_DOCK_BROWSER_ACTIVE}
      </p>
      <p
        className={cn(
          'mt-1 truncate text-sm text-muted-foreground',
          tool.mode === 'terminal' && 'font-mono',
        )}
        title={tool.detail}
      >
        {tool.detail}
      </p>
    </div>
  );
}

function StepRowView({ row }: { row: StepRow }) {
  const { step, chips } = row;
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        <StatusIcon status={step.status} />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm leading-5',
            step.status === 'completed' ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {step.label}
        </p>
        {step.detail && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{step.detail}</p>
        )}
        <StepChips chips={chips} />
      </div>
    </li>
  );
}

function StepGroupItem({ group }: { group: StepGroup }) {
  const header = group.header;
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  if (!header) return null;
  if (group.rows.length === 0 && group.connectors.length === 0) {
    return <StepRowView row={{ step: header, chips: [] }} />;
  }
  const finished =
    header.status === 'completed' && group.rows.every((row) => row.step.status === 'completed');
  const open = userOpen ?? !finished;
  return (
    <li>
      <details
        open={open}
        onToggle={(event) => {
          if (event.currentTarget.open !== open) setUserOpen(event.currentTarget.open);
        }}
        className="group"
        data-testid="task-dock-step-group"
      >
        <summary className={STEP_SUMMARY_CLASS}>
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
            <StatusIcon status={header.status} />
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 text-sm leading-5',
              header.status === 'completed' ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {header.label}
          </span>
          <ChevronRight className={cn(DOCK_CHEVRON_CLASS, 'mt-1')} aria-hidden="true" />
        </summary>
        <ul className="mt-2 space-y-2 ps-6">
          {group.rows.map((row) => (
            <StepRowView key={row.step.id} row={row} />
          ))}
          {group.connectors.length > 0 && (
            <li>
              <ConnectorsChip names={group.connectors} />
            </li>
          )}
        </ul>
      </details>
    </li>
  );
}

function formatDetailDate(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, CHAT_DETAILS_DATE_FORMAT);
}

function answeringModelLabels(messages: readonly Message[]): string[] {
  const labels: string[] = [];
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.model || isAutoModeModelId(message.model)) {
      continue;
    }
    const label = getManagedModelPresentationLabel(message.model);
    if (!labels.includes(label)) labels.push(label);
  }
  return labels;
}

function ChatDetailsSection({ rows }: { rows: readonly ChatDetailRow[] }) {
  return (
    <details className="group border-t border-[var(--chat-border)]">
      <summary className={SECTION_SUMMARY_CLASS}>
        <Info className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className={SECTION_LABEL_CLASS}>{CHAT_DETAILS_LABEL}</span>
        <ChevronRight className={SECTION_CHEVRON_CLASS} aria-hidden="true" />
      </summary>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 px-4 pb-4 text-xs">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 break-words text-foreground">{row.value}</dd>
          </Fragment>
        ))}
      </dl>
    </details>
  );
}

function DockDisclosure({
  label,
  count,
  actions,
  className,
  children,
}: {
  label: string;
  count?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className={cn('relative', className)}>
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="group"
      >
        <summary className={SECTION_SUMMARY_CLASS}>
          <span className={SECTION_LABEL_CLASS}>{label}</span>
          {count !== undefined && (
            <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
          )}
          <ChevronRight className={DOCK_CHEVRON_CLASS} aria-hidden="true" />
        </summary>
        <div className="px-4 pb-3">{children}</div>
      </details>
      {actions ? (
        <div className="absolute end-3 top-1.5 flex items-center gap-0.5 pointer-coarse:top-0">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

interface DockSectionEmptyState {
  icon: LucideIcon;
  caption: string;
}

function DockEmptyState({ icon: Icon, caption }: DockSectionEmptyState) {
  return (
    <div className="flex flex-col items-start gap-2">
      <span
        className="flex h-10 w-16 items-center justify-center rounded-xl border border-[var(--chat-border)] text-muted-foreground"
        aria-hidden="true"
      >
        <Icon className="h-5 w-5" strokeWidth={1.5} />
      </span>
      <p className="text-sm text-muted-foreground">{caption}</p>
    </div>
  );
}

function DockSection({
  label,
  count,
  actions,
  empty,
  children,
}: {
  label: string;
  count: number;
  actions?: React.ReactNode;
  empty?: DockSectionEmptyState;
  children: React.ReactNode;
}) {
  if (count === 0 && !empty) return null;
  return (
    <DockDisclosure
      label={label}
      {...(count > 0 ? { count } : {})}
      actions={actions}
      className="border-t border-[var(--chat-border)]"
    >
      {count === 0 && empty ? <DockEmptyState {...empty} /> : children}
    </DockDisclosure>
  );
}

function ContextActions() {
  const canUseWorkingDirectory = useCapability('canUseWorkingDirectory');
  const pickFolder = useCoworkFolderStore((state) => state.pickFolder);
  const folderName = useCoworkFolderStore((state) => state.folderName);
  const desktopHost = useDesktopHost();
  const canPickFolder = canUseWorkingDirectory && supportsDirectoryPicker();
  if (!canPickFolder && desktopHost === null) return null;
  return (
    <>
      {canPickFolder && (
        <button
          type="button"
          onClick={() => void pickFolder()}
          className={DOCK_ACTION_CLASS}
          aria-label={ROW_LABEL_FOLDER}
          title={folderName ? `${ROW_LABEL_FOLDER}: ${folderName}` : ROW_LABEL_FOLDER}
        >
          <FolderPlus className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {desktopHost !== null && (
        <button
          type="button"
          onClick={requestLocalFolderAttach}
          className={DOCK_ACTION_CLASS}
          aria-label={ROW_LABEL_LOCAL_FOLDER}
          title={ROW_LABEL_LOCAL_FOLDER}
        >
          <Monitor className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </>
  );
}

/**
 * A connector has no logo we hold, so its row carries the initial of the name
 * the run reported, the way both leaders mark a connector in this list. Every
 * other kind has a real glyph.
 */
function ContextMark({ item }: { item: TaskDockContextItem }) {
  const className = 'h-3.5 w-3.5 text-muted-foreground';
  if (item.kind === 'connector') {
    return <span className="text-caption font-semibold text-muted-foreground">{item.mark}</span>;
  }
  if (item.kind === 'skill') return <Sparkles className={className} aria-hidden="true" />;
  if (item.kind === 'attachment' || (item.kind === 'path' && isFilePath(item.label))) {
    return <FileText className={className} aria-hidden="true" />;
  }
  return <FolderOpen className={className} aria-hidden="true" />;
}

function SourceFavicon({ faviconUrl, host }: { faviconUrl?: string; host: string }) {
  const [failed, setFailed] = useState(false);
  if (!faviconUrl || failed) {
    return <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
  }
  return (
    <img
      src={faviconUrl}
      alt=""
      title={host}
      className="h-4 w-4 rounded-sm"
      onError={() => setFailed(true)}
    />
  );
}

export function WorkSessionToggleButton({
  messages,
  open,
  onToggle,
  agiWork = false,
}: WorkSessionToggleButtonProps) {
  const summary = useTaskDockSummary(messages);
  const badgeCount = summary.outputs.length + summary.sources.length;
  const panelLabel = agiWork ? TASK_DOCK_PANEL_LABEL : CHAT_DOCK_PANEL_LABEL;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors motion-reduce:transition-none',
        open
          ? 'bg-primary/15 text-primary'
          : 'bg-card/60 text-muted-foreground shadow-e1 backdrop-blur-sm hover:bg-muted/60 hover:text-foreground',
      )}
      aria-label={`${open ? CLOSE_ACTION_VERB : OPEN_ACTION_VERB} ${panelLabel}`}
      title={panelLabel}
    >
      <PanelRight className="h-4 w-4" aria-hidden="true" />
      {badgeCount > 0 && !open && (
        <span className="absolute -end-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-caption font-bold text-primary-foreground">
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </button>
  );
}

function TaskDockProgressSection({
  summary,
  messages,
  agiWork,
}: {
  summary: TaskDockSummary;
  messages: readonly Message[];
  agiWork: boolean;
}) {
  const activity = summary.activity;
  const isRunning = summary.status === 'running';
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setNowMs(Date.now()), RUN_TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isRunning]);

  const workMode = summary.workMode ?? (agiWork ? AGI_WORK_MODE : undefined);
  const progressLine = activity
    ? buildAgentActivitySummary(activity, nowMs, workMode)
    : statusLabel(summary.status);
  const planSentence = activity ? agiWorkPlanSentence(activity.entries) : undefined;
  const completed = summary.steps.filter((step) => step.status === 'completed').length;

  const showEmptySteps = summary.steps.length === 0 && agiWork && isRunning;
  const groups = useMemo(() => groupSteps(summary.steps, messages), [summary.steps, messages]);
  const knowledge = useMemo(() => collectRecalledKnowledge(messages), [messages]);
  const activeTool = activeToolOf(activity);

  return (
    <DockDisclosure
      label={TASK_DOCK_PROGRESS_LABEL}
      count={summary.steps.length > 0 ? `${completed}/${summary.steps.length}` : undefined}
    >
      <p className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          <StatusIcon status={summary.status === 'idle' ? 'pending' : summary.status} />
        </span>
        <span className="min-w-0 truncate" role="status" aria-live="polite">
          {progressLine}
        </span>
      </p>

      {planSentence && (
        <p data-testid="task-dock-plan-sentence" className="mt-1.5 text-sm text-foreground">
          {planSentence}
        </p>
      )}

      {activeTool && <ActiveToolHeader tool={activeTool} />}

      {knowledge.length > 0 && <KnowledgeRecalled items={knowledge} />}

      {groups.length > 0 && (
        <ol aria-label={TASK_DOCK_STEPS_LABEL} className="mt-2.5 space-y-2">
          {groups.flatMap((group) =>
            group.header ? (
              <StepGroupItem key={group.id} group={group} />
            ) : (
              [
                ...group.rows.map((row) => <StepRowView key={row.step.id} row={row} />),
                ...(group.connectors.length > 0
                  ? [
                      <li key={`${group.id}:connectors`}>
                        <ConnectorsChip names={group.connectors} />
                      </li>,
                    ]
                  : []),
              ]
            ),
          )}
        </ol>
      )}
      {showEmptySteps && (
        <p className="mt-1.5 text-sm text-muted-foreground">{TASK_DOCK_PROGRESS_EMPTY}</p>
      )}
    </DockDisclosure>
  );
}

function SlotTabs({ onShowArtifacts }: { onShowArtifacts: () => void }) {
  return (
    <div className="flex items-center gap-1 border-b border-border/20 px-3 py-2" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected
        className="rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary"
      >
        {TASK_DOCK_LABEL}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={false}
        onClick={onShowArtifacts}
        className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground motion-reduce:transition-none"
      >
        {TASK_DOCK_ARTIFACTS_LABEL}
      </button>
    </div>
  );
}

export function WorkSessionPanel({
  messages,
  open,
  onClose,
  agiWork = false,
  windowControls,
}: WorkSessionPanelProps) {
  const detached = windowControls?.detached === true;
  const summary = useTaskDockSummary(messages);
  const selectArtifact = useArtifactsStore((state) => state.selectArtifact);
  const setArtifactPanelOpen = useArtifactsStore((state) => state.setPanelOpen);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const activeConversationTitle = useChatStore(
    (state) =>
      state.conversations.find((conversation) => conversation.id === state.activeConversationId)
        ?.title ?? null,
  );
  const conversationArtifacts = useArtifactsStore((state) =>
    activeConversationId ? state.getConversationArtifacts(activeConversationId) : [],
  );
  const conversationCreatedAt = useChatStore(
    (state) =>
      state.conversations.find((conversation) => conversation.id === state.activeConversationId)
        ?.createdAt,
  );
  const conversationUpdatedAt = useChatStore(
    (state) =>
      state.conversations.find((conversation) => conversation.id === state.activeConversationId)
        ?.updatedAt,
  );
  const modelLabels = useMemo(() => answeringModelLabels(messages), [messages]);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const layout = useOverlayLayout(SHEET_OVERLAY_QUERY);
  const isModalOverlay = !detached && layout === 'mobile' && open;

  useOverlayDialog(panelRef, isModalOverlay, onClose);
  const panelWidth = useSidePanelWidth();

  useEffect(() => {
    if (!open || isModalOverlay || detached) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [detached, isModalOverlay, onClose, open]);

  const showArtifacts = useCallback(() => {
    const first = conversationArtifacts[0];
    if (first) selectArtifact(first.id);
    setArtifactPanelOpen(true);
  }, [conversationArtifacts, selectArtifact, setArtifactPanelOpen]);

  const dockTitle = agiWork
    ? (summary.title ?? TASK_DOCK_FALLBACK_TITLE)
    : activeConversationTitle?.trim() || CHAT_DOCK_FALLBACK_TITLE;
  useDetachedWindowTitle(panelRef, dockTitle, detached);

  if (!open) return null;

  const sourceCount = summary.sources.reduce((total, group) => total + group.sources.length, 0);
  const sourceFavicons = summary.sources
    .flatMap((group) => group.sources)
    .filter((source, index, all) => all.findIndex((other) => other.host === source.host) === index)
    .slice(0, MAX_SOURCE_FAVICONS);
  const panelLabel = agiWork ? TASK_DOCK_PANEL_LABEL : CHAT_DOCK_PANEL_LABEL;
  const detailRows = [
    { label: CHAT_DETAILS_CREATED_LABEL, value: formatDetailDate(conversationCreatedAt) },
    { label: CHAT_DETAILS_UPDATED_LABEL, value: formatDetailDate(conversationUpdatedAt) },
    {
      label: modelLabels.length === 1 ? CHAT_DETAILS_MODEL_LABEL : CHAT_DETAILS_MODELS_LABEL,
      value: modelLabels.join(', '),
    },
    { label: CHAT_DETAILS_MESSAGES_LABEL, value: String(messages.length) },
  ].filter((row) => row.value);

  const sourcesSection =
    sourceCount === 0 ? null : (
      <details
        className="group border-t border-[var(--chat-border)]"
        data-testid="task-dock-sources"
      >
        <summary className={SECTION_SUMMARY_CLASS}>
          <span className={SECTION_LABEL_CLASS}>{TASK_DOCK_SOURCES_LABEL}</span>
          <span className="flex items-center -space-x-1" aria-hidden="true">
            {sourceFavicons.map((source) => (
              <span
                key={source.id}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--chat-surface-elevated)] ring-2 ring-[var(--chat-surface-elevated)]"
              >
                <SourceFavicon
                  {...(source.faviconUrl ? { faviconUrl: source.faviconUrl } : {})}
                  host={source.host}
                />
              </span>
            ))}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">{sourceCount}</span>
          <ChevronRight className={SECTION_CHEVRON_CLASS} aria-hidden="true" />
        </summary>
        <div className="space-y-3 px-2 pb-3">
          {summary.sources.map((group) => (
            <div key={group.id}>
              <p className="truncate px-2 pb-1 text-xs text-muted-foreground">{group.label}</p>
              <ul className="space-y-0.5">
                {group.sources.map((source) => (
                  <li key={source.id}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 no-underline transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                    >
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                        <SourceFavicon
                          {...(source.faviconUrl ? { faviconUrl: source.faviconUrl } : {})}
                          host={source.host}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 block text-sm leading-5 text-foreground">
                          {source.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {source.host}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    );

  const outputsSection = (
    <DockSection
      label={TASK_DOCK_OUTPUTS_LABEL}
      count={summary.outputs.length}
      {...(agiWork ? { empty: { icon: ChartColumn, caption: TASK_DOCK_OUTPUTS_EMPTY } } : {})}
    >
      <OutputsList outputs={summary.outputs} />
    </DockSection>
  );

  const contextSection = (
    <DockSection
      label={TASK_DOCK_CONTEXT_LABEL}
      count={summary.context.length}
      actions={<ContextActions />}
      {...(agiWork ? { empty: { icon: Files, caption: TASK_DOCK_CONTEXT_EMPTY } } : {})}
    >
      <ul className="space-y-2">
        {summary.context.map((item) => (
          <li key={item.id} className="flex items-center gap-2.5">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--chat-surface-hover)]"
              aria-hidden="true"
            >
              <ContextMark item={item} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground" title={item.label}>
                {item.label}
              </p>
              {item.detail && <p className="text-xs text-muted-foreground">{item.detail}</p>}
            </div>
          </li>
        ))}
      </ul>
    </DockSection>
  );

  return (
    <>
      {detached ? null : (
        <div
          className="fixed inset-0 z-[var(--z-panel-backdrop)] bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        ref={panelRef}
        role={isModalOverlay ? 'dialog' : undefined}
        aria-modal={isModalOverlay ? true : undefined}
        tabIndex={isModalOverlay ? -1 : undefined}
        className={
          detached
            ? 'flex min-h-0 flex-1 flex-col bg-card outline-none'
            : cn(
                'fixed inset-x-0 bottom-0 z-[var(--z-panel)] flex max-h-[85vh] w-full flex-col rounded-t-2xl border-t border-border/30 bg-card/95 outline-none backdrop-blur-xl',
                'animate-in slide-in-from-bottom duration-moved motion-reduce:animate-none',
                'md:relative md:inset-auto md:z-auto md:max-h-none md:w-[380px] md:min-w-[280px] md:shrink md:rounded-none md:border-s md:border-t-0',
                'md:animate-in md:slide-in-from-right',
              )
        }
        style={!detached && layout === 'desktop' ? { width: panelWidth } : undefined}
        aria-label={panelLabel}
      >
        {!detached && layout === 'desktop' && (
          <SidePanelResizeHandle label={`Resize ${panelLabel}`} />
        )}
        <div className="flex items-center gap-2 border-b border-border/30 px-4 py-3">
          <PanelRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-h5 text-foreground" title={dockTitle}>
              {dockTitle}
            </h2>
            {agiWork && <p className="text-caption text-muted-foreground">{AGI_WORK_LABEL}</p>}
          </div>
          {windowControls ? (
            <PanelWindowButton
              controls={windowControls}
              panelLabel={panelLabel}
              className="h-8 w-8 shrink-0 p-0"
            />
          ) : null}
          <Button
            ref={closeButtonRef}
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 shrink-0 p-0"
            aria-label={`${CLOSE_ACTION_VERB} ${panelLabel}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {conversationArtifacts.length > 0 && <SlotTabs onShowArtifacts={showArtifacts} />}

        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <TaskDockProgressSection summary={summary} messages={messages} agiWork={agiWork} />
          {outputsSection}
          {contextSection}
          {sourcesSection}
          {detailRows.length > 0 && <ChatDetailsSection rows={detailRows} />}
        </div>
      </aside>
    </>
  );
}
