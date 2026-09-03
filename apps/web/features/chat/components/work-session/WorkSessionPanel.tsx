'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleAlert,
  Download,
  FileOutput,
  FileText,
  FolderOpen,
  Loader2,
  PanelRight,
  Play,
  X,
} from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import type {
  AgentActivityEntry,
  AgentActivityRunStatus,
  AgentActivityStepStatus,
} from '@agiworkforce/client-runtime';
import type { CloudWorkMode } from '@agiworkforce/types';
import type { Message } from '@shared/stores/web-chat-store';
import { cn } from '@shared/lib/utils';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useArtifactsStore, type Artifact } from '../../stores/artifacts-store';
import { downloadAllArtifacts, downloadGeneratedFile } from '../../utils/downloadArtifacts';
import { toast } from 'sonner';
import { humanizeToolName } from '../messages/ToolTimeline';
import { toUserMessage } from '@/lib/user-error-message';

type ProgressStatus =
  | AgentActivityRunStatus
  | AgentActivityStepStatus
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'awaiting-approval';

export interface WorkSessionProgressItem {
  id: string;
  label: string;
  detail?: string;
  status: ProgressStatus;
}

export interface WorkSessionOutput {
  id: string;
  name: string;
  mimeType?: string;
  byteCount?: number;
  uri?: string;
  artifactId?: string;
  artifactContent?: string;
  artifactLanguage?: string;
  artifactType?: string;
}

export interface WorkSessionContextItem {
  id: string;
  label: string;
  detail?: string;
  kind: 'attachment' | 'path' | 'context';
}

export interface WorkSessionSummary {
  status: AgentActivityRunStatus | 'idle';
  title: string | null;
  progress: WorkSessionProgressItem[];
  outputs: WorkSessionOutput[];
  context: WorkSessionContextItem[];
}

/** Mirrors AGIWORK_GOAL_PROGRESS_ID; the constant itself lives behind `server-only`. */
const AGIWORK_GOAL_PROGRESS_ID = 'agiwork:goal';

export const WORK_SESSION_FALLBACK_TITLE = 'AGI Work session';

interface WorkSessionPanelProps {
  messages: Message[];
  open: boolean;
  onClose: () => void;
}

interface WorkSessionToggleButtonProps {
  messages: Message[];
  open: boolean;
  onToggle: () => void;
}

const PATH_KEYS = new Set(['path', 'file', 'filePath', 'filepath', 'directory', 'folder', 'cwd']);

export function hasWorkSession(
  messages: Message[],
  activeWorkMode: CloudWorkMode | undefined,
): boolean {
  return (
    activeWorkMode === 'agiwork' ||
    messages.some(
      (message) =>
        message.metadata?.sendReplay?.workMode === 'agiwork' ||
        message.metadata?.agentActivity !== undefined,
    )
  );
}

function addOutput(outputs: Map<string, WorkSessionOutput>, output: WorkSessionOutput) {
  const existingWithUri = output.uri
    ? Array.from(outputs.values()).find((candidate) => candidate.uri === output.uri)
    : undefined;
  if (existingWithUri) {
    outputs.set(existingWithUri.id, {
      ...existingWithUri,
      ...output,
      id: existingWithUri.id,
      artifactId: output.artifactId ?? existingWithUri.artifactId,
    });
    return;
  }

  const existing = outputs.get(output.id);
  outputs.set(output.id, existing ? { ...existing, ...output } : output);
}

function outputFromArtifact(artifact: Artifact): WorkSessionOutput {
  const generatedFile = artifact.generatedFile;
  return {
    id: generatedFile ? `file:${generatedFile.id}` : `artifact:${artifact.id}`,
    name: generatedFile?.fileName ?? artifact.title ?? 'Untitled artifact',
    mimeType: generatedFile?.mimeType,
    byteCount: generatedFile?.byteCount,
    uri: generatedFile?.uri,
    artifactId: artifact.id,
    artifactContent: artifact.content,
    artifactLanguage: artifact.language,
    artifactType: artifact.type,
  };
}

function statusFromLegacy(status: string): ProgressStatus {
  if (status === 'awaiting_approval') return 'awaiting-approval';
  if (
    status === 'pending' ||
    status === 'running' ||
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled'
  ) {
    return status;
  }
  return 'pending';
}

function progressFromActivity(
  messageId: string,
  entry: AgentActivityEntry,
): WorkSessionProgressItem | null {
  if (entry.kind === 'progress') {
    return {
      id: `${messageId}:${entry.id}`,
      label: entry.summary,
      detail: entry.detail,
      status: entry.status,
    };
  }
  if (entry.kind === 'tool') {
    return {
      id: `${messageId}:${entry.id}`,
      label: entry.summary || humanizeToolName(entry.name),
      detail: entry.error === entry.summary ? undefined : entry.error,
      status: entry.status,
    };
  }
  if (entry.kind === 'error') {
    return {
      id: `${messageId}:${entry.id}`,
      label: entry.message,
      detail: entry.code,
      status: 'failed',
    };
  }
  return null;
}

function extractPaths(input: unknown): string[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return [];
  const paths: string[] = [];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!PATH_KEYS.has(key) || typeof value !== 'string' || !value.trim()) continue;
    paths.push(value.trim());
  }
  return paths;
}

export function buildWorkSessionSummary(
  messages: Message[],
  artifacts: Artifact[],
): WorkSessionSummary {
  const progress: WorkSessionProgressItem[] = [];
  const outputs = new Map<string, WorkSessionOutput>();
  const context = new Map<string, WorkSessionContextItem>();
  let status: WorkSessionSummary['status'] = 'idle';
  let title: string | null = null;

  for (const artifact of artifacts) {
    addOutput(outputs, outputFromArtifact(artifact));
  }

  for (const message of messages) {
    for (const attachment of [
      ...(message.attachments ?? []),
      ...(message.metadata?.attachments ?? []),
    ]) {
      const key = attachment.assetId ?? attachment.id;
      context.set(`attachment:${key}`, {
        id: `attachment:${key}`,
        label: attachment.name,
        detail: attachment.mimeType ?? attachment.type,
        kind: 'attachment',
      });
    }

    const activity = message.metadata?.agentActivity;
    if (activity) {
      status = activity.status;
      for (const entry of activity.entries) {
        if (entry.kind === 'progress' && entry.progressId === AGIWORK_GOAL_PROGRESS_ID) {
          if (entry.summary.trim()) title = entry.summary.trim();
        }
        const progressItem = progressFromActivity(message.id, entry);
        if (progressItem) progress.push(progressItem);

        if (entry.kind === 'artifact') {
          addOutput(outputs, {
            id: `activity:${message.id}:${entry.artifactId}`,
            name: entry.name,
            mimeType: entry.mimeType,
            byteCount: entry.sizeBytes,
            uri: entry.uri,
            artifactId: entry.artifactId,
          });
        } else if (entry.kind === 'context') {
          context.set(`activity:${message.id}:${entry.id}`, {
            id: `activity:${message.id}:${entry.id}`,
            label: entry.summary,
            detail:
              entry.beforeTokens !== undefined && entry.afterTokens !== undefined
                ? `${entry.beforeTokens.toLocaleString()} → ${entry.afterTokens.toLocaleString()} tokens`
                : undefined,
            kind: 'context',
          });
        } else if (entry.kind === 'tool') {
          for (const path of extractPaths(entry.input)) {
            context.set(`path:${path}`, {
              id: `path:${path}`,
              label: path,
              detail: 'Referenced by task',
              kind: 'path',
            });
          }
        }
      }
    } else {
      for (const tool of message.metadata?.tools ?? []) {
        progress.push({
          id: `${message.id}:legacy:${tool.toolCallId ?? tool.id ?? tool.name}`,
          label: humanizeToolName(tool.name, tool.args, tool.parameters),
          detail: tool.error,
          status: statusFromLegacy(tool.status),
        });
        for (const path of extractPaths(tool.parameters ?? tool.rawArgs)) {
          context.set(`path:${path}`, {
            id: `path:${path}`,
            label: path,
            detail: 'Referenced by task',
            kind: 'path',
          });
        }
      }
    }

    for (const file of message.metadata?.generatedFiles ?? []) {
      addOutput(outputs, {
        id: `file:${file.id}`,
        name: file.fileName,
        mimeType: file.mimeType,
        byteCount: file.byteCount,
        uri: file.uri,
      });
    }

    const file = message.metadata?.generatedFile;
    if (file) {
      addOutput(outputs, {
        id: `file:${file.id}`,
        name: file.fileName,
        mimeType: file.mimeType,
        byteCount: file.byteCount,
        uri: file.uri,
      });
    }
  }

  return {
    status,
    title,
    progress,
    outputs: Array.from(outputs.values()),
    context: Array.from(context.values()),
  };
}

function statusLabel(status: WorkSessionSummary['status']): string {
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

function StatusIcon({ status }: { status: ProgressStatus }) {
  if (status === 'completed') {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />;
  }
  if (status === 'running') {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />;
  }
  if (status === 'failed' || status === 'cancelled') {
    return <CircleAlert className="h-3.5 w-3.5 text-danger" aria-hidden="true" />;
  }
  if (status === 'partial') {
    // Not a success tick: some of the work under this run did not land.
    return <CircleAlert className="h-3.5 w-3.5 text-warning-text" aria-hidden="true" />;
  }
  if (status === 'awaiting-approval' || status === 'paused') {
    return <CircleAlert className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />;
  }
  return <Circle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />;
}

function byteLabel(byteCount: number | undefined): string | undefined {
  if (byteCount === undefined) return undefined;
  if (byteCount < 1_024) return `${byteCount} B`;
  if (byteCount < 1_048_576) return `${(byteCount / 1_024).toFixed(1)} KB`;
  return `${(byteCount / 1_048_576).toFixed(1)} MB`;
}

function SectionHeader({
  icon: Icon,
  label,
  count,
}: {
  icon: typeof FileOutput;
  label: string;
  count: number;
}) {
  return (
    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium marker:hidden">
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <span>{label}</span>
      <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[12px] text-muted-foreground">
        {count}
      </span>
      <ChevronRight
        className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-90"
        aria-hidden="true"
      />
    </summary>
  );
}

function EmptySection({ children }: { children: string }) {
  return <p className="px-4 pb-4 text-xs text-muted-foreground">{children}</p>;
}

function useWorkSessionSummary(messages: Message[]): WorkSessionSummary {
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const artifacts = useArtifactsStore((state) =>
    activeConversationId ? state.getConversationArtifacts(activeConversationId) : [],
  );
  return useMemo(() => buildWorkSessionSummary(messages, artifacts), [artifacts, messages]);
}

export function WorkSessionToggleButton({
  messages,
  open,
  onToggle,
}: WorkSessionToggleButtonProps) {
  const summary = useWorkSessionSummary(messages);

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
        open
          ? 'bg-primary/15 text-primary'
          : 'bg-card/60 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted/60 hover:text-foreground',
      )}
      aria-label={open ? 'Close AGI Work session panel' : 'Open AGI Work session panel'}
      title="AGI Work session"
    >
      <PanelRight className="h-4 w-4" aria-hidden="true" />
      {summary.outputs.length > 0 && !open && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[12px] font-bold text-primary-foreground">
          {summary.outputs.length > 99 ? '99+' : summary.outputs.length}
        </span>
      )}
    </button>
  );
}

export function WorkSessionPanel({ messages, open, onClose }: WorkSessionPanelProps) {
  const summary = useWorkSessionSummary(messages);
  const selectArtifact = useArtifactsStore((state) => state.selectArtifact);
  const setArtifactPanelOpen = useArtifactsStore((state) => state.setPanelOpen);
  const knownArtifacts = useArtifactsStore((state) => state.artifacts);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [onClose, open]);

  if (!open) return null;

  const openOutput = (output: WorkSessionOutput) => {
    const artifactAvailable =
      output.artifactId && knownArtifacts.some((artifact) => artifact.id === output.artifactId);
    if (output.artifactId && artifactAvailable) {
      onClose();
      selectArtifact(output.artifactId);
      setArtifactPanelOpen(true);
      return;
    }
    if (output.uri) {
      window.open(output.uri, '_blank', 'noopener,noreferrer');
    }
  };

  const downloadOutput = async (output: WorkSessionOutput) => {
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
  };

  const completed = summary.progress.filter((item) => item.status === 'completed').length;
  const progressPercent =
    summary.progress.length === 0 ? 0 : Math.round((completed / summary.progress.length) * 100);

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm sm:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border/30 bg-card/95 backdrop-blur-xl',
          'animate-in slide-in-from-right duration-300',
          'sm:relative sm:inset-auto sm:z-auto sm:w-[380px] sm:min-w-[280px] sm:shrink',
        )}
        aria-label="AGI Work session panel"
      >
        <div className="border-b border-border/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <PanelRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2
                  className="truncate text-sm font-semibold text-foreground"
                  title={summary.title ?? undefined}
                >
                  {summary.title ?? WORK_SESSION_FALLBACK_TITLE}
                </h2>
              </div>
              <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
                {statusLabel(summary.status)}
              </p>
            </div>
            <Button
              ref={closeButtonRef}
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
              aria-label="Close AGI Work session panel"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[12px] text-muted-foreground">
              <span>Task progress</span>
              <span>
                {completed}/{summary.progress.length} complete
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Task progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          <details className="group border-b border-border/20" open>
            <SectionHeader icon={Play} label="Progress" count={summary.progress.length} />
            {summary.progress.length === 0 ? (
              <EmptySection>Task steps will appear here as the agent works.</EmptySection>
            ) : (
              <ol className="space-y-2 px-4 pb-4">
                {summary.progress.map((item) => (
                  <li key={item.id} className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">
                      <StatusIcon status={item.status} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-relaxed text-foreground">{item.label}</p>
                      {item.detail && (
                        <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">
                          {item.detail}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </details>

          <details className="group border-b border-border/20" open>
            <SectionHeader icon={FileOutput} label="Outputs" count={summary.outputs.length} />
            {summary.outputs.length === 0 ? (
              <EmptySection>Generated files and artifacts will appear here.</EmptySection>
            ) : (
              <ul className="space-y-2 px-3 pb-4">
                {summary.outputs.map((output) => (
                  <li
                    key={output.id}
                    className="rounded-lg border border-border/40 bg-muted/15 p-2.5"
                  >
                    <div className="flex items-start gap-2">
                      <FileText
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">
                          {output.name}
                        </p>
                        <p className="truncate text-[12px] text-muted-foreground">
                          {[output.mimeType, byteLabel(output.byteCount)]
                            .filter(Boolean)
                            .join(' · ') || 'Artifact'}
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
                          aria-label={`Open ${output.name}`}
                        >
                          Open
                        </Button>
                      )}
                      {(output.uri || output.artifactContent !== undefined) && (
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 gap-1 px-2 text-[12px]"
                          onClick={() => void downloadOutput(output)}
                          aria-label={`Download ${output.name}`}
                        >
                          <Download className="h-3 w-3" aria-hidden="true" />
                          Download
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </details>

          <details className="group" open>
            <SectionHeader icon={FolderOpen} label="Context" count={summary.context.length} />
            {summary.context.length === 0 ? (
              <EmptySection>
                Input files, folders, and context events will appear here.
              </EmptySection>
            ) : (
              <ul className="space-y-2 px-4 pb-4">
                {summary.context.map((item) => (
                  <li key={item.id} className="flex items-start gap-2">
                    {item.kind === 'attachment' ? (
                      <FileText
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : (
                      <FolderOpen
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-xs text-foreground">{item.label}</p>
                      {item.detail && (
                        <p className="text-[12px] text-muted-foreground">{item.detail}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </div>
      </aside>
    </>
  );
}
