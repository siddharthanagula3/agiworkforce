/**
 * AutomationBuilder — event-triggered agent automation UI
 *
 * Lets operators configure triggers (Cron / Webhook / File Watcher), view
 * per-trigger execution logs, enable/disable triggers, and delete them.
 *
 * All Tauri invoke() params are camelCase per IPC rules.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  FileSearch,
  FolderOpen,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Zap,
  ZapOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import {
  useTriggerStore,
  type CreateTriggerInput,
  type CronConfig,
  type EventTriggerDefinition,
  type FileWatcherConfig,
  type TriggerExecution,
  type TriggerType,
  type WebhookConfig,
} from '../../stores/triggerStore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/AlertDialog';
import { Badge } from '../ui/Badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Switch } from '../ui/Switch';
import { EmptyState } from '../ui/EmptyState';

// ── Constants ─────────────────────────────────────────────────────────────────

const CRON_PRESETS: { label: string; value: string }[] = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily at 9am', value: '0 9 * * *' },
  { label: 'Weekly Monday 9am', value: '0 9 * * 1' },
  { label: 'Monthly 1st 9am', value: '0 9 1 * *' },
];

const DEFAULT_CRON_CONFIG: CronConfig = { expression: '0 9 * * *' };
const DEFAULT_WEBHOOK_CONFIG: WebhookConfig = { path: '/webhook', authEnabled: false };
const DEFAULT_FILE_WATCHER_CONFIG: FileWatcherConfig = {
  directory: '',
  globPattern: '**/*',
  debounceMs: 500,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function triggerTypeLabel(type: TriggerType): string {
  switch (type) {
    case 'cron':
      return 'Cron';
    case 'webhook':
      return 'Webhook';
    case 'file_watcher':
      return 'File Watcher';
  }
}

function TriggerTypeIcon({ type, className }: { type: TriggerType; className?: string }) {
  switch (type) {
    case 'cron':
      return <Clock className={className} />;
    case 'webhook':
      return <Globe className={className} />;
    case 'file_watcher':
      return <FileSearch className={className} />;
  }
}

function formatTs(ts: number | null): string {
  if (!ts) return 'Never';
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Default form state ────────────────────────────────────────────────────────

function defaultFormState(): CreateTriggerInput {
  return {
    name: '',
    type: 'cron',
    enabled: true,
    config: { ...DEFAULT_CRON_CONFIG },
    action: {
      prompt: '',
      model: 'claude-opus-4-5',
      approvalRequired: false,
    },
  };
}

// ── Execution log entry ───────────────────────────────────────────────────────

function ExecutionEntry({ execution }: { execution: TriggerExecution }) {
  const statusColor =
    execution.status === 'success'
      ? 'text-green-400'
      : execution.status === 'failed'
        ? 'text-red-400'
        : 'text-amber-400';

  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border/50 bg-surface-base px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-xs font-medium capitalize', statusColor)}>
          {execution.status}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {formatDuration(execution.durationMs)}
        </span>
        <span className="text-[10px] text-muted-foreground">{formatTs(execution.startedAt)}</span>
      </div>
      {execution.resultPreview && (
        <p className="truncate text-[11px] text-muted-foreground">{execution.resultPreview}</p>
      )}
      {execution.error && (
        <p className="truncate text-[11px] text-destructive">{execution.error}</p>
      )}
    </div>
  );
}

// ── Execution log panel ───────────────────────────────────────────────────────

interface ExecutionLogPanelProps {
  triggerId: string;
  executions: TriggerExecution[];
  onLoad: (triggerId: string) => void;
}

function ExecutionLogPanel({ triggerId, executions, onLoad }: ExecutionLogPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const handleToggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      if (next && executions.length === 0) {
        onLoad(triggerId);
      }
      return next;
    });
  }, [executions.length, onLoad, triggerId]);

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Execution log
      </button>

      {expanded && (
        <div className="mt-2 flex flex-col gap-1.5 pl-1">
          {executions.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/60">No executions recorded yet.</p>
          ) : (
            executions.slice(0, 10).map((ex) => <ExecutionEntry key={ex.id} execution={ex} />)
          )}
        </div>
      )}
    </div>
  );
}

// ── Trigger card ──────────────────────────────────────────────────────────────

interface TriggerCardProps {
  trigger: EventTriggerDefinition;
  executions: TriggerExecution[];
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (trigger: EventTriggerDefinition) => void;
  onDelete: (id: string) => void;
  onLoadExecutions: (triggerId: string) => void;
}

function TriggerCard({
  trigger,
  executions,
  onToggle,
  onEdit,
  onDelete,
  onLoadExecutions,
}: TriggerCardProps) {
  return (
    <div
      className={cn(
        'group rounded-lg border bg-surface-raised p-4 transition-colors',
        trigger.enabled ? 'border-border' : 'border-border/50 opacity-70',
      )}
    >
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            trigger.type === 'cron'
              ? 'bg-blue-500/10 text-blue-400'
              : trigger.type === 'webhook'
                ? 'bg-purple-500/10 text-purple-400'
                : 'bg-amber-500/10 text-amber-400',
          )}
        >
          <TriggerTypeIcon type={trigger.type} className="h-4 w-4" />
        </div>

        {/* Name + badge */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{trigger.name}</span>
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {triggerTypeLabel(trigger.type)}
            </Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Last run: {formatTs(trigger.lastTriggeredAt)} &middot; {trigger.triggerCount} runs
          </p>
        </div>

        {/* Enable switch */}
        <Switch
          checked={trigger.enabled}
          onCheckedChange={(checked) => onToggle(trigger.id, checked)}
          aria-label={trigger.enabled ? 'Disable trigger' : 'Enable trigger'}
        />
      </div>

      {/* Config summary */}
      <ConfigSummary trigger={trigger} />

      {/* Action row */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onEdit(trigger)}
          className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Edit
        </button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/5 px-2.5 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/20"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete trigger?</AlertDialogTitle>
              <AlertDialogDescription>
                "{trigger.name}" will be permanently removed. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(trigger.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Status pill */}
        <div className="ml-auto flex items-center gap-1">
          {trigger.enabled ? (
            <Zap className="h-3 w-3 text-green-400" />
          ) : (
            <ZapOff className="h-3 w-3 text-muted-foreground" />
          )}
          <span
            className={cn(
              'text-[10px] font-medium',
              trigger.enabled ? 'text-green-400' : 'text-muted-foreground',
            )}
          >
            {trigger.enabled ? 'Active' : 'Disabled'}
          </span>
        </div>
      </div>

      {/* Execution log */}
      <ExecutionLogPanel triggerId={trigger.id} executions={executions} onLoad={onLoadExecutions} />
    </div>
  );
}

// ── Config summary (read-only) ────────────────────────────────────────────────

function ConfigSummary({ trigger }: { trigger: EventTriggerDefinition }) {
  const cfg = trigger.config;
  let summary = '';

  if (trigger.type === 'cron') {
    summary = `Schedule: ${(cfg as CronConfig).expression}`;
  } else if (trigger.type === 'webhook') {
    const wh = cfg as WebhookConfig;
    summary = `Path: ${wh.path}${wh.authEnabled ? ' · Auth enabled' : ''}`;
  } else if (trigger.type === 'file_watcher') {
    const fw = cfg as FileWatcherConfig;
    summary = `Watch: ${fw.directory || '(unset)'} — ${fw.globPattern}`;
  }

  return (
    <p className="mt-2 truncate rounded-md bg-muted/40 px-2 py-1 font-mono text-[10px] text-muted-foreground">
      {summary}
    </p>
  );
}

// ── Trigger form (create / edit) ──────────────────────────────────────────────

interface TriggerFormProps {
  open: boolean;
  initial: CreateTriggerInput | null;
  editId: string | null;
  onClose: () => void;
  onSubmit: (data: CreateTriggerInput, editId: string | null) => Promise<void>;
}

function TriggerForm({ open, initial, editId, onClose, onSubmit }: TriggerFormProps) {
  const [form, setForm] = useState<CreateTriggerInput>(initial ?? defaultFormState());
  const [saving, setSaving] = useState(false);

  // Sync when the dialog re-opens with new initial data
  useEffect(() => {
    if (open) {
      setForm(initial ?? defaultFormState());
    }
  }, [open, initial]);

  const handleTypeChange = useCallback((type: TriggerType) => {
    setForm((prev) => ({
      ...prev,
      type,
      config:
        type === 'cron'
          ? { ...DEFAULT_CRON_CONFIG }
          : type === 'webhook'
            ? { ...DEFAULT_WEBHOOK_CONFIG }
            : { ...DEFAULT_FILE_WATCHER_CONFIG },
    }));
  }, []);

  const handleCronPreset = useCallback((expression: string) => {
    setForm((prev) => ({ ...prev, config: { expression } as CronConfig }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!form.name.trim()) {
      toast.error('Trigger name is required');
      return;
    }
    setSaving(true);
    try {
      await onSubmit(form, editId);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [form, editId, onSubmit, onClose]);

  const cfg = form.config;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editId ? 'Edit Trigger' : 'New Trigger'}</DialogTitle>
          <DialogDescription>
            Configure when and how this automated agent task fires.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Daily standup summary"
              maxLength={120}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Trigger type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground">Trigger type</label>
            <Select value={form.type} onValueChange={(v) => handleTypeChange(v as TriggerType)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cron">
                  <span className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-blue-400" />
                    Cron schedule
                  </span>
                </SelectItem>
                <SelectItem value="webhook">
                  <span className="flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 text-purple-400" />
                    Webhook
                  </span>
                </SelectItem>
                <SelectItem value="file_watcher">
                  <span className="flex items-center gap-2">
                    <FileSearch className="h-3.5 w-3.5 text-amber-400" />
                    File watcher
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Type-specific config */}
          {form.type === 'cron' && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-foreground">Cron expression</label>
              <div className="flex flex-wrap gap-1.5">
                {CRON_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => handleCronPreset(preset.value)}
                    className={cn(
                      'rounded-md border px-2 py-1 text-[11px] transition-colors',
                      (cfg as CronConfig).expression === preset.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={(cfg as CronConfig).expression}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    config: { expression: e.target.value } as CronConfig,
                  }))
                }
                placeholder="0 9 * * *"
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-[10px] text-muted-foreground">min hour day month weekday (UTC)</p>
            </div>
          )}

          {form.type === 'webhook' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground">Webhook path</label>
                <input
                  type="text"
                  value={(cfg as WebhookConfig).path}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      config: { ...(prev.config as WebhookConfig), path: e.target.value },
                    }))
                  }
                  placeholder="/webhook/my-trigger"
                  maxLength={200}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">Require auth token</label>
                <Switch
                  checked={(cfg as WebhookConfig).authEnabled}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({
                      ...prev,
                      config: { ...(prev.config as WebhookConfig), authEnabled: checked },
                    }))
                  }
                />
              </div>
            </div>
          )}

          {form.type === 'file_watcher' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground">Watch directory</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={(cfg as FileWatcherConfig).directory}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        config: {
                          ...(prev.config as FileWatcherConfig),
                          directory: e.target.value,
                        },
                      }))
                    }
                    placeholder="/Users/me/Documents"
                    className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    title="Browse for directory"
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => {
                      // Directory picker not yet wired to Tauri — show info toast
                      toast.info('Directory picker will be available after Rust command is wired');
                    }}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground">Glob pattern</label>
                <input
                  type="text"
                  value={(cfg as FileWatcherConfig).globPattern}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      config: {
                        ...(prev.config as FileWatcherConfig),
                        globPattern: e.target.value,
                      },
                    }))
                  }
                  placeholder="**/*.pdf"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground">Debounce (ms)</label>
                <input
                  type="number"
                  min={100}
                  max={30000}
                  value={(cfg as FileWatcherConfig).debounceMs}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      config: {
                        ...(prev.config as FileWatcherConfig),
                        debounceMs: Number(e.target.value),
                      },
                    }))
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          )}

          {/* Agent action config */}
          <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Agent action
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">Prompt</label>
              <textarea
                value={form.action.prompt}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    action: { ...prev.action, prompt: e.target.value },
                  }))
                }
                placeholder="Summarize all emails received in the last 24 hours and send me a digest."
                rows={3}
                maxLength={2000}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">Model</label>
              <Select
                value={form.action.model}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, action: { ...prev.action, model: v } }))
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="claude-opus-4-5">Claude Opus 4.5</SelectItem>
                  <SelectItem value="claude-sonnet-4-5">Claude Sonnet 4.5</SelectItem>
                  <SelectItem value="claude-haiku-3-5">Claude Haiku 3.5</SelectItem>
                  <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                  <SelectItem value="gpt-4o-mini">GPT-4o mini</SelectItem>
                  <SelectItem value="gemini-2.0-pro">Gemini 2.0 Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-foreground">Require approval</p>
                <p className="text-[10px] text-muted-foreground">
                  Pause before executing — approve from mobile
                </p>
              </div>
              <Switch
                checked={form.action.approvalRequired}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    action: { ...prev.action, approvalRequired: checked },
                  }))
                }
              />
            </div>
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-foreground">Enabled on creation</label>
            <Switch
              checked={form.enabled}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
            />
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {editId ? 'Save changes' : 'Create trigger'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function TriggerSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border border-border bg-surface-raised p-4">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-6 w-11 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="mt-3 h-6 w-full animate-pulse rounded-md bg-muted/50" />
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AutomationBuilder() {
  const {
    triggers,
    executions,
    loading,
    error,
    fetchTriggers,
    createTrigger,
    updateTrigger,
    deleteTrigger,
    toggleTrigger,
    fetchExecutions,
  } = useTriggerStore();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EventTriggerDefinition | null>(null);

  // Fetch on mount
  useEffect(() => {
    void fetchTriggers();
  }, [fetchTriggers]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleOpenCreate = useCallback(() => {
    setEditTarget(null);
    setDialogOpen(true);
  }, []);

  const handleOpenEdit = useCallback((trigger: EventTriggerDefinition) => {
    setEditTarget(trigger);
    setDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setEditTarget(null);
  }, []);

  const handleSubmit = useCallback(
    async (data: CreateTriggerInput, editId: string | null) => {
      try {
        if (editId) {
          await updateTrigger(editId, data);
          toast.success('Trigger updated');
        } else {
          await createTrigger(data);
          toast.success('Trigger created');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Failed to ${editId ? 'update' : 'create'} trigger: ${msg}`);
        throw err;
      }
    },
    [createTrigger, updateTrigger],
  );

  const handleToggle = useCallback(
    (id: string, enabled: boolean) => {
      void toggleTrigger(id, enabled).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Failed to toggle trigger: ${msg}`);
      });
    },
    [toggleTrigger],
  );

  const handleDelete = useCallback(
    (id: string) => {
      void deleteTrigger(id)
        .then(() => toast.success('Trigger deleted'))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(`Failed to delete trigger: ${msg}`);
        });
    },
    [deleteTrigger],
  );

  const handleLoadExecutions = useCallback(
    (triggerId: string) => {
      void fetchExecutions(triggerId);
    },
    [fetchExecutions],
  );

  // ── Form initial data ──────────────────────────────────────────────────────

  const formInitial: CreateTriggerInput | null = editTarget
    ? {
        name: editTarget.name,
        type: editTarget.type,
        enabled: editTarget.enabled,
        config: editTarget.config,
        action: editTarget.action,
      }
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-base">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <Calendar className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Automation Triggers</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          {triggers.length}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchTriggers()}
            disabled={loading}
            title="Refresh triggers"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            New trigger
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Error banner */}
        {error && !loading && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
            <p className="text-sm text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => void fetchTriggers()}
              className="ml-4 shrink-0 text-xs text-destructive underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && triggers.length === 0 && <TriggerSkeleton />}

        {/* Empty state */}
        {!loading && triggers.length === 0 && !error && (
          <EmptyState
            icon={Zap}
            title="No automation triggers"
            description="Create a trigger to run agent tasks automatically on a schedule, webhook, or file change."
            action={{ label: 'Create first trigger', onClick: handleOpenCreate, icon: Plus }}
          />
        )}

        {/* Trigger list */}
        {triggers.length > 0 && (
          <div className="flex flex-col gap-3">
            {triggers.map((trigger) => (
              <TriggerCard
                key={trigger.id}
                trigger={trigger}
                executions={executions[trigger.id] ?? []}
                onToggle={handleToggle}
                onEdit={handleOpenEdit}
                onDelete={handleDelete}
                onLoadExecutions={handleLoadExecutions}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit dialog */}
      <TriggerForm
        open={dialogOpen}
        initial={formInitial}
        editId={editTarget?.id ?? null}
        onClose={handleCloseDialog}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

export default AutomationBuilder;
