'use client';

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleAlert,
  FileText,
  FolderOpen,
  Globe,
  Info,
  PanelRight,
  Puzzle,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import {
  agiWorkPlanSentence,
  buildAgentActivitySummary,
  getManagedModelPresentationLabel,
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
  TASK_DOCK_CONTEXT_LABEL,
  TASK_DOCK_FALLBACK_TITLE,
  TASK_DOCK_LABEL,
  TASK_DOCK_OUTPUTS_LABEL,
  TASK_DOCK_PANEL_LABEL,
  TASK_DOCK_PROGRESS_EMPTY,
  TASK_DOCK_PROGRESS_LABEL,
  TASK_DOCK_SOURCES_LABEL,
  TASK_DOCK_STEPS_LABEL,
} from '../../lib/agi-work';
import { OutputsList, useTaskDockSummary } from './OutputsList';
import {
  type TaskDockContextItem,
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

function DockSection({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const headingId = useId();
  if (count === 0) return null;
  return (
    <section aria-labelledby={headingId} className="border-t border-[var(--chat-border)] px-4 py-3">
      <h3 id={headingId} className="mb-2 flex items-center gap-2">
        <span className={SECTION_LABEL_CLASS}>{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      </h3>
      {children}
    </section>
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
  if (item.kind === 'project') return <Puzzle className={className} aria-hidden="true" />;
  if (item.kind === 'attachment') return <FileText className={className} aria-hidden="true" />;
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
  agiWork,
}: {
  summary: TaskDockSummary;
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
  const headingId = useId();

  const showEmptySteps = summary.steps.length === 0 && agiWork && isRunning;

  return (
    <section aria-labelledby={headingId} className="px-4 py-3">
      <h3 id={headingId} className="mb-1.5 flex items-center gap-2">
        <span className={SECTION_LABEL_CLASS}>{TASK_DOCK_PROGRESS_LABEL}</span>
        {summary.steps.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {completed}/{summary.steps.length}
          </span>
        )}
      </h3>
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

      {summary.steps.length > 0 && (
        <ol aria-label={TASK_DOCK_STEPS_LABEL} className="mt-2.5 space-y-2">
          {summary.steps.map((step) => (
            <li key={step.id} className="flex items-start gap-2">
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
              </div>
            </li>
          ))}
        </ol>
      )}
      {showEmptySteps && (
        <p className="mt-1.5 text-xs text-muted-foreground">{TASK_DOCK_PROGRESS_EMPTY}</p>
      )}
    </section>
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
    <DockSection label={TASK_DOCK_OUTPUTS_LABEL} count={summary.outputs.length}>
      <OutputsList outputs={summary.outputs} />
    </DockSection>
  );

  const contextSection = (
    <DockSection label={TASK_DOCK_CONTEXT_LABEL} count={summary.context.length}>
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
          <TaskDockProgressSection summary={summary} agiWork={agiWork} />
          {outputsSection}
          {contextSection}
          {sourcesSection}
          {detailRows.length > 0 && <ChatDetailsSection rows={detailRows} />}
        </div>
      </aside>
    </>
  );
}
