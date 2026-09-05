'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleAlert,
  Download,
  FileOutput,
  FileText,
  FolderOpen,
  Globe,
  PanelRight,
  Puzzle,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import { agiWorkPlanSentence, buildAgentActivitySummary } from '@agiworkforce/unified-chat';
import type { CloudWorkMode } from '@agiworkforce/types';
import type { Message } from '@shared/stores/web-chat-store';
import { cn } from '@shared/lib/utils';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useProjectStore } from '@features/projects';
import { useArtifactsStore } from '../../stores/artifacts-store';
import { useOverlayDialog, useOverlayLayout } from '../../hooks/use-overlay-dialog';
import { downloadAllArtifacts, downloadGeneratedFile } from '../../utils/downloadArtifacts';
import { toast } from 'sonner';
import { toUserMessage } from '@/lib/user-error-message';
import {
  AGI_WORK_LABEL,
  CHAT_DOCK_FALLBACK_TITLE,
  CHAT_DOCK_FILES_EMPTY,
  CHAT_DOCK_FILES_LABEL,
  CHAT_DOCK_PANEL_LABEL,
  TASK_DOCK_ARTIFACTS_LABEL,
  TASK_DOCK_CONTEXT_EMPTY,
  TASK_DOCK_CONTEXT_LABEL,
  TASK_DOCK_DOWNLOAD_ACTION,
  TASK_DOCK_FALLBACK_TITLE,
  TASK_DOCK_LABEL,
  TASK_DOCK_OPEN_ACTION,
  TASK_DOCK_OUTPUTS_EMPTY,
  TASK_DOCK_OUTPUTS_LABEL,
  TASK_DOCK_PANEL_LABEL,
  TASK_DOCK_SOURCES_EMPTY,
  TASK_DOCK_SOURCES_LABEL,
  TASK_DOCK_STEPS_LABEL,
} from '../../lib/agi-work';
import {
  buildTaskDockSummary,
  type TaskDockContextItem,
  type TaskDockOutput,
  type TaskDockStepStatus,
  type TaskDockSummary,
} from './taskDockSummary';

const AGI_WORK_MODE: CloudWorkMode = 'agiwork';
const RUN_TICK_INTERVAL_MS = 1_000;
const BYTES_PER_KILOBYTE = 1_024;
const BYTES_PER_MEGABYTE = 1_048_576;
const DETAIL_SEPARATOR = ' · ';
const ARTIFACT_OUTPUT_DETAIL = 'Artifact';
const CLOSE_ACTION_VERB = 'Close';
const OPEN_ACTION_VERB = 'Open';

interface WorkSessionPanelProps {
  messages: Message[];
  open: boolean;
  onClose: () => void;
  agiWork?: boolean;
}

interface WorkSessionToggleButtonProps {
  messages: Message[];
  open: boolean;
  onToggle: () => void;
  agiWork?: boolean;
}

function statusLabel(status: TaskDockSummary['status']): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'awaiting-approval':
      return 'Needs approval';
    case 'paused':
      return 'Paused';
    case 'completed':
      return 'Complete';
    case 'partial':
      return 'Finished with errors';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Ready';
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
  if (status === 'partial' || status === 'awaiting-approval' || status === 'paused') {
    return <CircleAlert className="h-3.5 w-3.5 text-warning-text" aria-hidden="true" />;
  }
  return <Circle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
}

function byteLabel(byteCount: number | undefined): string | undefined {
  if (byteCount === undefined) return undefined;
  if (byteCount < BYTES_PER_KILOBYTE) return `${byteCount} B`;
  if (byteCount < BYTES_PER_MEGABYTE) return `${(byteCount / BYTES_PER_KILOBYTE).toFixed(1)} KB`;
  return `${(byteCount / BYTES_PER_MEGABYTE).toFixed(1)} MB`;
}

function DockSection({
  icon: Icon,
  label,
  count,
  emptyCopy,
  children,
}: {
  icon: typeof FileOutput;
  label: string;
  count: number;
  emptyCopy: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group border-b border-border/20" open>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium marker:hidden">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span>{label}</span>
        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[12px] text-muted-foreground">
          {count}
        </span>
        <ChevronRight
          className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      {count === 0 ? (
        <p className="px-4 pb-4 text-xs text-muted-foreground">{emptyCopy}</p>
      ) : (
        children
      )}
    </details>
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
    return <span className="text-[12px] font-semibold text-muted-foreground">{item.mark}</span>;
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

function useTaskDockSummary(messages: Message[]): TaskDockSummary {
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const artifacts = useArtifactsStore((state) =>
    activeConversationId ? state.getConversationArtifacts(activeConversationId) : [],
  );
  const projectId = useChatStore(
    (state) =>
      state.conversations.find((conversation) => conversation.id === state.activeConversationId)
        ?.projectId ?? null,
  );
  const projectName = useProjectStore(
    (state) => state.projects.find((project) => project.id === projectId)?.name ?? null,
  );
  return useMemo(
    () => buildTaskDockSummary({ messages, artifacts, projectName }),
    [artifacts, messages, projectName],
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
          : 'bg-card/60 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted/60 hover:text-foreground',
      )}
      aria-label={`${open ? CLOSE_ACTION_VERB : OPEN_ACTION_VERB} ${panelLabel}`}
      title={panelLabel}
    >
      <PanelRight className="h-4 w-4" aria-hidden="true" />
      {badgeCount > 0 && !open && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[12px] font-bold text-primary-foreground">
          {badgeCount > 99 ? '99+' : badgeCount}
        </span>
      )}
    </button>
  );
}

function TaskDockProgressHeader({
  summary,
  agiWork,
}: {
  summary: TaskDockSummary;
  agiWork: boolean;
}) {
  const [stepsOpen, setStepsOpen] = useState(false);
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

  return (
    <div className="border-b border-border/30 px-4 py-3">
      <button
        type="button"
        onClick={() => setStepsOpen((value) => !value)}
        aria-expanded={stepsOpen}
        disabled={summary.steps.length === 0}
        className="flex w-full min-w-0 items-center gap-2 rounded-md text-left text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:text-muted-foreground motion-reduce:transition-none"
      >
        <StatusIcon status={summary.status === 'idle' ? 'pending' : summary.status} />
        <span className="min-w-0 flex-1 truncate" role="status" aria-live="polite">
          {progressLine}
        </span>
        {summary.steps.length > 0 && (
          <>
            <span className="shrink-0 text-[12px]">
              {completed}/{summary.steps.length}
            </span>
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none',
                stepsOpen && 'rotate-90',
              )}
              aria-hidden="true"
            />
          </>
        )}
      </button>

      {planSentence && (
        <p data-testid="task-dock-plan-sentence" className="mt-1 text-xs text-foreground">
          {planSentence}
        </p>
      )}

      {stepsOpen && summary.steps.length > 0 && (
        <ol aria-label={TASK_DOCK_STEPS_LABEL} className="mt-2 space-y-2">
          {summary.steps.map((step) => (
            <li key={step.id} className="flex items-start gap-2">
              <span className="mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                <StatusIcon status={step.status} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs leading-relaxed text-foreground">{step.label}</p>
                {step.detail && (
                  <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">
                    {step.detail}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
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
}: WorkSessionPanelProps) {
  const summary = useTaskDockSummary(messages);
  const selectArtifact = useArtifactsStore((state) => state.selectArtifact);
  const setArtifactPanelOpen = useArtifactsStore((state) => state.setPanelOpen);
  const knownArtifacts = useArtifactsStore((state) => state.artifacts);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const activeConversationTitle = useChatStore(
    (state) =>
      state.conversations.find((conversation) => conversation.id === state.activeConversationId)
        ?.title ?? null,
  );
  const conversationArtifacts = useArtifactsStore((state) =>
    activeConversationId ? state.getConversationArtifacts(activeConversationId) : [],
  );
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const layout = useOverlayLayout();
  const isModalOverlay = layout === 'mobile' && open;

  useOverlayDialog(panelRef, isModalOverlay, onClose);

  useEffect(() => {
    if (!open || isModalOverlay) return;
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
  }, [isModalOverlay, onClose, open]);

  const showArtifacts = useCallback(() => {
    const first = conversationArtifacts[0];
    if (first) selectArtifact(first.id);
    setArtifactPanelOpen(true);
  }, [conversationArtifacts, selectArtifact, setArtifactPanelOpen]);

  const openOutput = useCallback(
    (output: TaskDockOutput) => {
      const artifactAvailable =
        output.artifactId && knownArtifacts.some((artifact) => artifact.id === output.artifactId);
      if (output.artifactId && artifactAvailable) {
        selectArtifact(output.artifactId);
        setArtifactPanelOpen(true);
        return;
      }
      if (output.uri) window.open(output.uri, '_blank', 'noopener,noreferrer');
    },
    [knownArtifacts, selectArtifact, setArtifactPanelOpen],
  );

  const downloadOutput = useCallback(async (output: TaskDockOutput) => {
    try {
      if (output.uri) {
        await downloadGeneratedFile(output.uri, output.name, output.mimeType);
        return;
      }
      if (output.artifactContent !== undefined) {
        await downloadAllArtifacts([
          {
            title: output.name,
            content: output.artifactContent,
            language: output.artifactLanguage,
            type: output.artifactType,
          },
        ]);
      }
    } catch (error) {
      toast.error(toUserMessage(error, 'Could not download this output'));
    }
  }, []);

  if (!open) return null;

  const sourceCount = summary.sources.reduce((total, group) => total + group.sources.length, 0);
  const dockTitle = agiWork
    ? (summary.title ?? TASK_DOCK_FALLBACK_TITLE)
    : activeConversationTitle?.trim() || CHAT_DOCK_FALLBACK_TITLE;
  const panelLabel = agiWork ? TASK_DOCK_PANEL_LABEL : CHAT_DOCK_PANEL_LABEL;

  const sourcesSection = (
    <DockSection
      icon={Globe}
      label={TASK_DOCK_SOURCES_LABEL}
      count={sourceCount}
      emptyCopy={TASK_DOCK_SOURCES_EMPTY}
    >
      <div className="space-y-3 px-3 pb-4">
        {summary.sources.map((group) => (
          <div key={group.id}>
            <p className="truncate px-1 pb-1 text-[12px] text-muted-foreground">{group.label}</p>
            <ul className="space-y-1">
              {group.sources.map((source) => (
                <li key={source.id}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 rounded-lg p-2 no-underline transition-colors hover:bg-muted/40 motion-reduce:transition-none"
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                      <SourceFavicon
                        {...(source.faviconUrl ? { faviconUrl: source.faviconUrl } : {})}
                        host={source.host}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-xs font-medium leading-snug text-foreground">
                        {source.title}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
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
    </DockSection>
  );

  const filesSection = (
    <DockSection
      icon={FileOutput}
      label={agiWork ? TASK_DOCK_OUTPUTS_LABEL : CHAT_DOCK_FILES_LABEL}
      count={summary.outputs.length}
      emptyCopy={agiWork ? TASK_DOCK_OUTPUTS_EMPTY : CHAT_DOCK_FILES_EMPTY}
    >
      <ul className="space-y-2 px-3 pb-4">
        {summary.outputs.map((output) => (
          <li key={output.id} className="rounded-lg border border-border/40 bg-muted/15 p-2.5">
            <div className="flex items-start gap-2">
              <FileText
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">{output.name}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {[output.mimeType, byteLabel(output.byteCount)]
                    .filter(Boolean)
                    .join(DETAIL_SEPARATOR) || ARTIFACT_OUTPUT_DETAIL}
                </p>
              </div>
            </div>
            <div className="mt-2 flex justify-end gap-1">
              {(output.artifactId || output.uri) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[12px]"
                  onClick={() => openOutput(output)}
                  aria-label={`${TASK_DOCK_OPEN_ACTION} ${output.name}`}
                >
                  {TASK_DOCK_OPEN_ACTION}
                </Button>
              )}
              {(output.uri || output.artifactContent !== undefined) && (
                <Button
                  type="button"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[12px]"
                  onClick={() => void downloadOutput(output)}
                  aria-label={`${TASK_DOCK_DOWNLOAD_ACTION} ${output.name}`}
                >
                  <Download className="h-3 w-3" aria-hidden="true" />
                  {TASK_DOCK_DOWNLOAD_ACTION}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </DockSection>
  );

  const contextSection = (
    <DockSection
      icon={FolderOpen}
      label={TASK_DOCK_CONTEXT_LABEL}
      count={summary.context.length}
      emptyCopy={TASK_DOCK_CONTEXT_EMPTY}
    >
      <ul className="space-y-2 px-4 pb-4">
        {summary.context.map((item) => (
          <li key={item.id} className="flex items-start gap-2">
            <span
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted"
              aria-hidden="true"
            >
              <ContextMark item={item} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-xs text-foreground">{item.label}</p>
              {item.detail && <p className="text-[12px] text-muted-foreground">{item.detail}</p>}
            </div>
          </li>
        ))}
      </ul>
    </DockSection>
  );

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm sm:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        role={isModalOverlay ? 'dialog' : undefined}
        aria-modal={isModalOverlay ? true : undefined}
        tabIndex={isModalOverlay ? -1 : undefined}
        className={cn(
          'fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border/30 bg-card/95 outline-none backdrop-blur-xl',
          'animate-in slide-in-from-right duration-300 motion-reduce:animate-none',
          'sm:relative sm:inset-auto sm:z-auto sm:w-[380px] sm:min-w-[280px] sm:shrink',
        )}
        aria-label={panelLabel}
      >
        <div className="flex items-center gap-2 border-b border-border/30 px-4 py-3">
          <PanelRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-foreground" title={dockTitle}>
              {dockTitle}
            </h2>
            {agiWork && <p className="text-[12px] text-muted-foreground">{AGI_WORK_LABEL}</p>}
          </div>
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

        <TaskDockProgressHeader summary={summary} agiWork={agiWork} />

        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          {agiWork ? (
            <>
              {sourcesSection}
              {filesSection}
              {contextSection}
            </>
          ) : (
            <>
              {filesSection}
              {sourcesSection}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
