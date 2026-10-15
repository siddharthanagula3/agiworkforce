import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useConfirmAction } from '@agiworkforce/ui';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
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
  NOTIFICATION_TARGET_ATTRIBUTE,
  notificationTargetValue,
  useNotificationTarget,
} from '../notifications/notificationTarget';
import {
  useTriggerStore,
  webhookNeedsToken,
  type CreateTriggerInput,
  type CronConfig,
  type EventTriggerDefinition,
  type FileWatcherConfig,
  type TriggerEngineInfo,
  type TriggerActionType,
  type TriggerExecution,
  type TriggerRunOutcome,
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
} from '@/ui/AlertDialog';
import { Badge } from '@/ui/Badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/Dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/Select';
import { Switch } from '@/ui/Switch';
import { EmptyState } from '@/ui/EmptyState';

const CRON_PRESETS: { label: string; value: string }[] = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily at 9am', value: '0 9 * * *' },
  { label: 'Weekly Monday 9am', value: '0 9 * * 1' },
  { label: 'Monthly 1st 9am', value: '0 9 1 * *' },
];

const COMPUTER_TIME_ZONE = "this computer's time zone";

function systemTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function defaultCronConfig(): CronConfig {
  return { type: 'cron', expression: '0 9 * * *', timezone: systemTimeZone() };
}

const DEFAULT_WEBHOOK_CONFIG: WebhookConfig = {
  type: 'webhook',
  path: '',
};
const DEFAULT_FILE_WATCHER_CONFIG: FileWatcherConfig = {
  type: 'fileWatcher',
  watchPath: '',
  glob: '**/*',
  debounceMs: 500,
};

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

const RUN_OUTCOME_TEXT: Record<TriggerRunOutcome, string> = {
  queued: 'The run is queued.',
  running: 'The run is still going.',
  waiting: 'The run is paused, waiting for you in background agents.',
  finished: 'The run finished.',
  failed: 'The run failed.',
  cancelled: 'The run was stopped.',
  taken_over: 'The run was taken over in a chat.',
};

function firingLabel(execution: TriggerExecution, actionType: TriggerActionType): string {
  if (!execution.started) return 'Could not start';
  return actionType === 'notification' ? 'Notified' : 'Started';
}

function defaultFormState(): CreateTriggerInput {
  return {
    name: '',
    type: 'cron',
    enabled: true,
    config: defaultCronConfig(),
    action: {
      type: 'agent',
      prompt: '',
      approvalRequired: false,
    },
  };
}

function cronTimeZone(config: CronConfig): string {
  return config.timezone?.trim() || COMPUTER_TIME_ZONE;
}

function minutesOf(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

function secondsOf(seconds: number): string {
  return seconds === 1 ? '1 second' : `${seconds} seconds`;
}

function webhookExample(url: string, token: string): string {
  return [
    `curl -X POST ${url} \\`,
    `  -H "Authorization: Bearer ${token}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"ref":"main"}'`,
  ].join('\n');
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [value]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      toast.error('Could not copy. Select the text and copy it by hand.');
    }
  }, [value]);

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  );
}

function ExecutionEntry({
  execution,
  actionType,
}: {
  execution: TriggerExecution;
  actionType: TriggerActionType;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border/50 bg-surface-base px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'text-xs font-medium',
            execution.started ? 'text-foreground' : 'text-[var(--chat-destructive-text)]',
          )}
        >
          {firingLabel(execution, actionType)}
        </span>
        <span className="text-[10px] text-muted-foreground">{formatTs(execution.firedAt)}</span>
      </div>
      {execution.outcome && (
        <p className="text-[11px] text-muted-foreground">{RUN_OUTCOME_TEXT[execution.outcome]}</p>
      )}
      {execution.error && (
        <p className="text-[11px] text-[var(--chat-destructive-text)]">{execution.error}</p>
      )}
      {execution.missedStarts > 1 && (
        <p className="text-[11px] text-muted-foreground">
          Missed start {execution.missedStarts} in a row
        </p>
      )}
    </div>
  );
}

interface ExecutionLogPanelProps {
  triggerId: string;
  actionType: TriggerActionType;
  executions: TriggerExecution[];
  onLoad: (triggerId: string) => void;
}

function ExecutionLogPanel({ triggerId, actionType, executions, onLoad }: ExecutionLogPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const handleToggle = useCallback(() => {
    if (!expanded) onLoad(triggerId);
    setExpanded(!expanded);
  }, [expanded, onLoad, triggerId]);

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={expanded}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Firings since the app started
      </button>

      {expanded && (
        <div className="mt-2 flex flex-col gap-1.5 pl-1">
          {executions.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Nothing has fired since the app started.
            </p>
          ) : (
            executions
              .slice(0, 10)
              .map((ex) => <ExecutionEntry key={ex.id} execution={ex} actionType={actionType} />)
          )}
        </div>
      )}
    </div>
  );
}

interface TriggerCardProps {
  trigger: EventTriggerDefinition;
  executions: TriggerExecution[];
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (trigger: EventTriggerDefinition) => void;
  onDelete: (id: string) => void;
  onNewToken: (trigger: EventTriggerDefinition) => void;
  onLoadExecutions: (triggerId: string) => void;
  revealed: boolean;
}

function TriggerCard({
  trigger,
  executions,
  onToggle,
  onEdit,
  onDelete,
  onNewToken,
  onLoadExecutions,
  revealed,
}: TriggerCardProps) {
  const needsToken = webhookNeedsToken(trigger);

  return (
    <div
      tabIndex={-1}
      {...{ [NOTIFICATION_TARGET_ATTRIBUTE]: notificationTargetValue('trigger', trigger.id) }}
      className={cn(
        'group rounded-lg border bg-surface-raised p-4 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        revealed && 'ring-2 ring-ring',
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
              ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
              : trigger.type === 'webhook'
                ? 'bg-purple-500/10 text-purple-700 dark:text-purple-400'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
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
            {needsToken && (
              <Badge variant="outline" className="shrink-0 border-destructive/40 text-[10px]">
                Needs a token
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Last fired: {formatTs(trigger.lastTriggeredAt)} &middot; fired {trigger.triggerCount}{' '}
            {trigger.triggerCount === 1 ? 'time' : 'times'}
            {trigger.coalescedCount > 0 && (
              <> &middot; {trigger.coalescedCount} counted but not started</>
            )}
          </p>
          {trigger.runLive && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              A run of this trigger is going or waiting in background agents. Firings that arrive
              before it ends are counted, not started.
            </p>
          )}
        </div>

        {/* Enable switch */}
        <Switch
          checked={trigger.enabled && !needsToken}
          disabled={needsToken}
          onCheckedChange={(checked) => onToggle(trigger.id, checked)}
          aria-label={trigger.enabled ? 'Disable trigger' : 'Enable trigger'}
        />
      </div>

      {/* Config summary */}
      <ConfigSummary trigger={trigger} />

      {trigger.problem && (
        <p role="status" className="mt-2 text-xs text-[var(--chat-destructive-text)]">
          {trigger.problem}
        </p>
      )}

      {needsToken && (
        <p className="mt-2 text-xs text-foreground">
          This webhook is off because it has no token, so anything on this computer could have
          started it. Generate a token, then turn it back on.
        </p>
      )}

      {/* Action row */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onEdit(trigger)}
          className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Edit
        </button>

        {trigger.type === 'webhook' && (
          <button
            type="button"
            onClick={() => onNewToken(trigger)}
            className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {needsToken ? 'Generate token' : 'Regenerate token'}
          </button>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 rounded-md border border-danger-fill/30 bg-danger-fill/5 px-2.5 py-1 text-xs text-danger-text transition-colors hover:bg-danger-fill/10"
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
          {trigger.enabled && !needsToken ? (
            <Zap className="h-3 w-3 text-success-text" />
          ) : (
            <ZapOff className="h-3 w-3 text-muted-foreground" />
          )}
          <span
            className={cn(
              'text-[10px] font-medium',
              trigger.enabled && !needsToken ? 'text-success-text' : 'text-muted-foreground',
            )}
          >
            {needsToken ? 'Off until it has a token' : trigger.enabled ? 'Active' : 'Disabled'}
          </span>
        </div>
      </div>

      {/* Execution log */}
      <ExecutionLogPanel
        triggerId={trigger.id}
        actionType={trigger.action.type}
        executions={executions}
        onLoad={onLoadExecutions}
      />
    </div>
  );
}

function ConfigSummary({ trigger }: { trigger: EventTriggerDefinition }) {
  const cfg = trigger.config;
  let summary = '';

  if (trigger.type === 'cron') {
    const cron = cfg as CronConfig;
    summary = `Schedule: ${cron.expression} (${cronTimeZone(cron)})`;
  } else if (trigger.type === 'webhook') {
    const wh = cfg as WebhookConfig;
    summary = `POST ${trigger.webhookUrl ?? wh.path} · ${wh.tokenHash ? 'Token required' : 'No token'}`;
  } else if (trigger.type === 'file_watcher') {
    const fw = cfg as FileWatcherConfig;
    summary = `Watch: ${fw.watchPath || '(unset)'}, ${fw.glob || 'every file'}`;
  }

  return (
    <p
      title={summary}
      className="mt-2 truncate rounded-md bg-muted/40 px-2 py-1 font-mono text-[10px] text-muted-foreground"
    >
      {summary}
    </p>
  );
}

interface ShownWebhookToken {
  triggerName: string;
  token: string;
  url: string | null;
}

function WebhookTokenDialog({
  shown,
  engineInfo,
  onClose,
}: {
  shown: ShownWebhookToken | null;
  engineInfo: TriggerEngineInfo | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={shown !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy the webhook token now</DialogTitle>
          <DialogDescription>
            This is the only time the token for "{shown?.triggerName}" is shown. Requests must send
            it as an Authorization header, or they are refused. If you lose it, regenerate it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {shown?.url && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-foreground" htmlFor="webhook-url">
                Send a POST request to
              </label>
              <div className="flex gap-2">
                <input
                  id="webhook-url"
                  type="text"
                  readOnly
                  value={shown.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <CopyButton value={shown.url} label="Copy address" />
              </div>
              <p className="text-xs text-muted-foreground">
                This address answers only programs on this computer.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-foreground" htmlFor="webhook-token">
              Authorization: Bearer
            </label>
            <div className="flex gap-2">
              <input
                id="webhook-token"
                type="text"
                readOnly
                value={shown?.token ?? ''}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <CopyButton value={shown?.token ?? ''} label="Copy token" />
            </div>
          </div>

          {shown?.url && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-foreground">Example</p>
              <pre
                data-testid="webhook-example"
                className="overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-foreground"
              >
                {webhookExample(shown.url, shown.token)}
              </pre>
              {engineInfo && (
                <p className="text-xs text-muted-foreground">
                  The body can be up to {Math.floor(engineInfo.maxWebhookBodyBytes / 1024)} KB and
                  must come with a Content-Length header. To make a retry safe, add an
                  Idempotency-Key header: a repeat of the same key within{' '}
                  {minutesOf(engineInfo.idempotencyWindowSecs)} is answered without starting another
                  run. A request that arrives while a run is going, or within{' '}
                  {secondsOf(engineInfo.minStartIntervalSecs)} of the last start, is answered 429
                  with a Retry-After header and does not run: send it again after that time.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Done
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TriggerFormProps {
  open: boolean;
  initial: CreateTriggerInput | null;
  editId: string | null;
  engineInfo: TriggerEngineInfo | null;
  onPickFolder: () => Promise<string | null>;
  onClose: () => void;
  onSubmit: (data: CreateTriggerInput, editId: string | null) => Promise<void>;
}

function TriggerForm({
  open,
  initial,
  editId,
  engineInfo,
  onPickFolder,
  onClose,
  onSubmit,
}: TriggerFormProps) {
  const [form, setForm] = useState<CreateTriggerInput>(initial ?? defaultFormState());
  const [saving, setSaving] = useState(false);

  const [saveError, setSaveError] = useState<string | null>(null);

  const latestInitial = useRef(initial);
  useEffect(() => {
    latestInitial.current = initial;
  });

  useEffect(() => {
    if (open) {
      setForm(latestInitial.current ?? defaultFormState());
      setSaveError(null);
    }
  }, [open, editId]);

  const handleTypeChange = useCallback((type: TriggerType) => {
    setForm((prev) => ({
      ...prev,
      type,
      config:
        type === 'cron'
          ? defaultCronConfig()
          : type === 'webhook'
            ? { ...DEFAULT_WEBHOOK_CONFIG }
            : { ...DEFAULT_FILE_WATCHER_CONFIG },
    }));
  }, []);

  const handleCronPreset = useCallback((expression: string) => {
    setForm((prev) => ({ ...prev, config: { ...(prev.config as CronConfig), expression } }));
  }, []);

  const handleBrowseWatchDirectory = useCallback(async () => {
    try {
      const selected = await onPickFolder();
      if (!selected) return;
      setForm((prev) => ({
        ...prev,
        config: { ...(prev.config as FileWatcherConfig), watchPath: selected },
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [onPickFolder]);

  const handleSubmit = useCallback(async () => {
    if (!form.name.trim()) {
      toast.error('Trigger name is required');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSubmit(form, editId);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [form, editId, onSubmit, onClose]);

  const cfg = form.config;
  const webhookPath = form.type === 'webhook' ? (cfg as WebhookConfig).path.trim() : '';

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
            <Select
              value={form.type}
              disabled={Boolean(editId)}
              onValueChange={(v) => handleTypeChange(v as TriggerType)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cron">
                  <span className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" />
                    Cron schedule
                  </span>
                </SelectItem>
                <SelectItem value="webhook">
                  <span className="flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 text-purple-700 dark:text-purple-400" />
                    Webhook
                  </span>
                </SelectItem>
                <SelectItem value="file_watcher">
                  <span className="flex items-center gap-2">
                    <FileSearch className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                    File watcher
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {editId && (
              <p className="text-xs text-muted-foreground">
                The kind of trigger cannot be changed. Delete it and create a new one.
              </p>
            )}
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
                    config: { ...(prev.config as CronConfig), expression: e.target.value },
                  }))
                }
                placeholder="0 9 * * *"
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                minute hour day month weekday. Weekdays are 0 to 7, where 0 and 7 are Sunday, so 1-5
                is Monday to Friday and 6-7 is the weekend.
              </p>
              <label className="text-xs font-medium text-foreground" htmlFor="trigger-time-zone">
                Time zone
              </label>
              <input
                id="trigger-time-zone"
                type="text"
                value={(cfg as CronConfig).timezone ?? ''}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    config: { ...(prev.config as CronConfig), timezone: e.target.value },
                  }))
                }
                placeholder="This computer's time zone"
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                This schedule is read in {cronTimeZone(cfg as CronConfig)}. Use a zone name such as
                Europe/Berlin, or leave it blank to follow this computer's time zone.
              </p>
              <p className="text-xs text-muted-foreground">
                If the app is closed or asleep when a run is due, the trigger runs once when the app
                is back, and a notification says how many runs were missed. Turning the trigger on
                or changing its schedule never runs a time that has already passed.
              </p>
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
                  placeholder={
                    editId ? '/hooks/my-trigger' : 'Leave blank to generate a unique path'
                  }
                  maxLength={200}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Each webhook needs its own path. A path another trigger already uses is refused.
                {engineInfo && (
                  <>
                    {' '}
                    Requests go to{' '}
                    <span className="font-mono text-foreground">
                      {engineInfo.webhookBaseUrl}
                      {webhookPath || '/hooks/…'}
                    </span>
                    , which answers only programs on this computer.
                  </>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {editId
                  ? "Requests must send this webhook's token. Regenerate it from the trigger list."
                  : 'A token is generated when you create this trigger and shown once. Requests without it are refused.'}
              </p>
              {engineInfo?.webhookProblem && (
                <p role="status" className="text-xs text-[var(--chat-destructive-text)]">
                  {engineInfo.webhookProblem}
                </p>
              )}
            </div>
          )}

          {form.type === 'file_watcher' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label
                  className="text-xs font-medium text-foreground"
                  htmlFor="trigger-watch-folder"
                >
                  Watch folder
                </label>
                <div className="flex gap-2">
                  <input
                    id="trigger-watch-folder"
                    type="text"
                    readOnly
                    value={(cfg as FileWatcherConfig).watchPath}
                    placeholder="No folder chosen"
                    className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                    onClick={() => void handleBrowseWatchDirectory()}
                  >
                    <FolderOpen className="h-4 w-4" />
                    Browse
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  A trigger watches only a folder you choose with Browse, or one already granted to
                  the agent. Links that lead out of the folder are not followed, and files the app
                  writes itself never start a run.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground">Glob pattern</label>
                <input
                  type="text"
                  value={(cfg as FileWatcherConfig).glob ?? ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      config: {
                        ...(prev.config as FileWatcherConfig),
                        glob: e.target.value,
                      },
                    }))
                  }
                  placeholder="**/*.pdf"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  The pattern is matched against the path below the watched folder.{' '}
                  <span className="font-mono text-foreground">*.pdf</span> matches files in the
                  folder itself, <span className="font-mono text-foreground">**/*.pdf</span> matches
                  at every level, and a blank pattern matches every file.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground">Debounce (ms)</label>
                <input
                  type="number"
                  min={100}
                  max={30000}
                  value={(cfg as FileWatcherConfig).debounceMs ?? 500}
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

          <p className="text-xs text-muted-foreground">
            One run at a time: a firing that arrives while this trigger's run is still going is
            counted on the trigger, not started.
            {engineInfo &&
              form.type !== 'cron' &&
              ` Starts are at least ${secondsOf(engineInfo.minStartIntervalSecs)} apart, and a firing inside that time is counted the same way.`}
          </p>

          {/* Agent action config */}
          <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Agent action
            </p>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">Prompt</label>
              <textarea
                value={form.action.prompt ?? ''}
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

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-foreground">Require approval</p>
                <p className="text-xs text-muted-foreground">
                  A run starts paused and waits until you resume it from background agents. While
                  one is waiting, later firings are counted on the trigger, not started.
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
            <label className="text-xs font-medium text-foreground">
              {editId ? 'Enabled' : 'Enabled on creation'}
            </label>
            <Switch
              checked={form.enabled}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
            />
          </div>
        </div>

        {saveError && (
          <p role="alert" className="text-sm text-destructive">
            {editId ? 'Your changes were not saved' : 'The trigger was not created'}: {saveError}
          </p>
        )}

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

export function AutomationBuilder() {
  const {
    triggers,
    executions,
    engineInfo,
    loading,
    error,
    fetchTriggers,
    fetchEngineInfo,
    pickWatchFolder,
    createTrigger,
    regenerateWebhookToken,
    updateTrigger,
    deleteTrigger,
    toggleTrigger,
    fetchExecutions,
  } = useTriggerStore(
    useShallow((s) => ({
      triggers: s.triggers,
      executions: s.executions,
      engineInfo: s.engineInfo,
      loading: s.loading,
      error: s.error,
      fetchTriggers: s.fetchTriggers,
      fetchEngineInfo: s.fetchEngineInfo,
      pickWatchFolder: s.pickWatchFolder,
      createTrigger: s.createTrigger,
      regenerateWebhookToken: s.regenerateWebhookToken,
      updateTrigger: s.updateTrigger,
      deleteTrigger: s.deleteTrigger,
      toggleTrigger: s.toggleTrigger,
      fetchExecutions: s.fetchExecutions,
    })),
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EventTriggerDefinition | null>(null);
  const [shownToken, setShownToken] = useState<ShownWebhookToken | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const [listed, setListed] = useState(false);
  const revealedTriggerId = useNotificationTarget(
    'trigger',
    triggers.map((trigger) => trigger.id),
    listed,
  );

  useEffect(() => {
    let mounted = true;
    void Promise.resolve(fetchTriggers()).finally(() => {
      if (mounted) setListed(true);
    });
    return () => {
      mounted = false;
    };
  }, [fetchTriggers]);

  const refresh = useCallback(() => {
    void fetchTriggers();
    void fetchEngineInfo();
  }, [fetchEngineInfo, fetchTriggers]);

  useEffect(() => {
    void fetchEngineInfo();
  }, [fetchEngineInfo]);

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
      if (editId) {
        await updateTrigger(editId, data);
        toast.success('Trigger updated');
      } else {
        const { token, trigger } = await createTrigger(data);
        toast.success('Trigger created');
        if (token) setShownToken({ triggerName: data.name, token, url: trigger.webhookUrl });
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

  const handleNewToken = useCallback(
    (trigger: EventTriggerDefinition) => {
      const generate = async () => {
        try {
          const token = await regenerateWebhookToken(trigger.id);
          setShownToken({ triggerName: trigger.name, token, url: trigger.webhookUrl });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(`Failed to generate a token: ${msg}`);
        }
      };
      if (webhookNeedsToken(trigger)) {
        void generate();
        return;
      }
      confirm({
        title: 'Regenerate this webhook token?',
        description: `The current token for "${trigger.name}" stops working at once and cannot be recovered. Anything that calls this webhook is refused until you give it the new token.`,
        confirmLabel: 'Regenerate token',
        destructive: true,
        onConfirm: generate,
      });
    },
    [confirm, regenerateWebhookToken],
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

  const formInitial = useMemo<CreateTriggerInput | null>(
    () =>
      editTarget
        ? {
            name: editTarget.name,
            type: editTarget.type,
            enabled: editTarget.enabled,
            config: editTarget.config,
            action: editTarget.action,
          }
        : null,
    [editTarget],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-base">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <Calendar className="h-4 w-4 text-primary" />
        <h2 className="text-h5 text-foreground">Automation Triggers</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          {triggers.length}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
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
                revealed={revealedTriggerId === trigger.id}
                onToggle={handleToggle}
                onEdit={handleOpenEdit}
                onDelete={handleDelete}
                onNewToken={handleNewToken}
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
        engineInfo={engineInfo}
        onPickFolder={pickWatchFolder}
        onClose={handleCloseDialog}
        onSubmit={handleSubmit}
      />

      <WebhookTokenDialog
        shown={shownToken}
        engineInfo={engineInfo}
        onClose={() => setShownToken(null)}
      />
      {confirmDialog}
    </div>
  );
}

export default AutomationBuilder;
