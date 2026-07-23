import { useEffect, useMemo, useState } from 'react';
import { listen } from '../../lib/tauri-mock';
import {
  AlertTriangle,
  Check,
  CircleDot,
  Clock,
  ExternalLink,
  Keyboard,
  Loader2,
  MousePointer2,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { automation, skills } from '@agiworkforce/desktop-command-client';
import type {
  AutomationPermissions,
  RecordedAction,
  Recording,
} from '@agiworkforce/desktop-command-client';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { cn } from '@/lib/utils';

interface ActionRecorderProps {
  onSkillCreated?: (skillName: string) => void;
  onClose?: () => void;
}

type PermissionKind = 'accessibility' | 'input_monitoring';

function normalizeRecordedAction(payload: unknown): RecordedAction | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;
  const actionType = (raw['actionType'] ?? raw['action_type']) as RecordedAction['actionType'];
  const timestampMs = Number(raw['timestampMs'] ?? raw['timestamp_ms'] ?? 0);
  const targetRaw = raw['target'] as Record<string, unknown> | undefined;

  if (typeof raw['id'] !== 'string' || typeof actionType !== 'string') return null;
  return {
    id: raw['id'],
    actionType,
    timestampMs,
    target: targetRaw
      ? {
          x: Number(targetRaw['x'] ?? 0),
          y: Number(targetRaw['y'] ?? 0),
          elementId: (targetRaw['elementId'] ?? targetRaw['element_id']) as string | undefined,
          elementName: (targetRaw['elementName'] ?? targetRaw['element_name']) as
            | string
            | undefined,
          elementType: (targetRaw['elementType'] ?? targetRaw['element_type']) as
            | string
            | undefined,
        }
      : undefined,
    value: typeof raw['value'] === 'string' ? raw['value'] : undefined,
    metadata:
      raw['metadata'] && typeof raw['metadata'] === 'object'
        ? (raw['metadata'] as Record<string, unknown>)
        : undefined,
  };
}

function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function actionLabel(action: RecordedAction) {
  return action.actionType.replaceAll('_', ' ');
}

export function ActionRecorder({ onSkillCreated, onClose }: ActionRecorderProps) {
  const [hasConsented, setHasConsented] = useState(false);
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(false);
  const [permissions, setPermissions] = useState<AutomationPermissions | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedActions, setRecordedActions] = useState<RecordedAction[]>([]);
  const [duration, setDuration] = useState(0);
  const [currentRecording, setCurrentRecording] = useState<Recording | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [skillName, setSkillName] = useState('');
  const [skillDescription, setSkillDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missingPermissions = useMemo(() => {
    if (!permissions) return [];
    const missing: PermissionKind[] = [];
    if (!permissions.accessibility) missing.push('accessibility');
    if (!permissions.inputMonitoring) missing.push('input_monitoring');
    return missing;
  }, [permissions]);

  useEffect(() => {
    if (!isRecording) return;
    const interval = window.setInterval(() => setDuration((previous) => previous + 1000), 1000);
    return () => window.clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;
    void listen<unknown>('automation:action_recorded', (event) => {
      const action = normalizeRecordedAction(event.payload);
      if (mounted && action) {
        setRecordedActions((previous) => [...previous, action]);
      }
    }).then((cleanup) => {
      if (mounted) unlisten = cleanup;
      else cleanup();
    });
    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  const checkPermissions = async () => {
    setIsCheckingPermissions(true);
    setError(null);
    try {
      const nextPermissions = await automation.checkAutomationPermissions();
      setPermissions(nextPermissions);
      return nextPermissions;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check automation permissions.');
      return null;
    } finally {
      setIsCheckingPermissions(false);
    }
  };

  const startRecording = async () => {
    const nextPermissions = await checkPermissions();
    if (!nextPermissions?.accessibility || !nextPermissions.inputMonitoring) return;

    try {
      await automation.automationRecordStart();
      setError(null);
      setRecordedActions([]);
      setCurrentRecording(null);
      setDuration(0);
      setIsRecording(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start recording.');
    }
  };

  const stopRecording = async () => {
    try {
      const recording = await automation.automationRecordStop();
      setIsRecording(false);
      setDuration(recording.durationMs);
      setCurrentRecording(recording);
      setRecordedActions(recording.actions);
      if (recording.actions.length === 0) {
        setError(
          'No actions were captured. Grant Input Monitoring, then record at least one click or keystroke.',
        );
        return;
      }
      setShowSaveDialog(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not finish recording.');
    }
  };

  const discardRecording = async () => {
    if (isRecording) {
      try {
        await automation.automationRecordStop();
      } catch {
        // The recorder may already have stopped. Discard remains safe and local.
      }
    }
    setIsRecording(false);
    setRecordedActions([]);
    setCurrentRecording(null);
    setDuration(0);
    setError(null);
  };

  const saveSkill = async () => {
    if (!currentRecording || recordedActions.length === 0) return;
    if (!skillName.trim() || !skillDescription.trim()) {
      setError('Add a name and description so AGI knows when to use this skill.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const result = await skills.skillCreateFromRecording(
        { ...currentRecording, actions: recordedActions },
        skillName.trim(),
        skillDescription.trim(),
      );
      toast.success(`Skill “${result.skill.name}” is ready`);
      setShowSaveDialog(false);
      setSkillName('');
      setSkillDescription('');
      setRecordedActions([]);
      setCurrentRecording(null);
      setDuration(0);
      onSkillCreated?.(result.skill.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the skill.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!hasConsented) {
    return (
      <section
        className="flex h-full min-h-0 flex-col bg-background"
        aria-labelledby="record-title"
      >
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              <h2 id="record-title" className="text-sm font-semibold">
                Record a skill
              </h2>
            </div>
            {onClose && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onClose}
                aria-label="Close skill recorder"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Demonstrate a workflow once, then reuse it from any local Desktop chat.
          </p>
        </div>

        <div className="flex flex-1 flex-col justify-center p-5">
          <div className="mx-auto max-w-md space-y-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <CircleDot className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Show AGI how you work</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                While recording, AGI captures mouse clicks and typing across your desktop. Review
                every captured step before it becomes a reusable local skill.
              </p>
            </div>
            <Alert>
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Your recording stays local</AlertTitle>
              <AlertDescription>
                Do not type passwords, payment details, API keys, health information, or other
                secrets. Nothing is uploaded automatically, and common secret patterns are redacted
                before the skill is saved.
              </AlertDescription>
            </Alert>
            <Button className="w-full" onClick={() => setHasConsented(true)}>
              I understand, continue
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-background"
      aria-labelledby="recorder-title"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isRecording ? (
              <span className="h-2 w-2 rounded-full bg-red-500 motion-safe:animate-pulse" />
            ) : (
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            )}
            <h2 id="recorder-title" className="truncate text-sm font-semibold">
              {isRecording ? 'Capturing your workflow' : 'Record a skill'}
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isRecording
              ? `${recordedActions.length} ${recordedActions.length === 1 ? 'step' : 'steps'} · ${formatDuration(duration)}`
              : 'Record, review, and save a reusable local workflow.'}
          </p>
        </div>
        {isRecording ? (
          <div className="flex shrink-0 gap-2">
            <Button variant="ghost" size="sm" onClick={() => void discardRecording()}>
              Discard
            </Button>
            <Button size="sm" onClick={() => void stopRecording()}>
              Done
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              onClick={() => void startRecording()}
              disabled={isCheckingPermissions}
            >
              {isCheckingPermissions ? (
                <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <CircleDot className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Start recording
            </Button>
            {onClose && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onClose}
                aria-label="Close skill recorder"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 p-4">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Recording needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {permissions && missingPermissions.length > 0 && !isRecording && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <h3 className="text-sm font-medium">Allow Desktop control to record and replay</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              macOS requires these permissions. After granting them, return here and check again.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {missingPermissions.map((kind) => (
                <Button
                  key={kind}
                  variant="outline"
                  size="sm"
                  onClick={() => void automation.requestAutomationPermission(kind)}
                >
                  <ExternalLink className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                  {kind === 'accessibility' ? 'Allow Accessibility' : 'Allow Input Monitoring'}
                </Button>
              ))}
              <Button variant="ghost" size="sm" onClick={() => void checkPermissions()}>
                Check again
              </Button>
            </div>
          </div>
        )}

        <ScrollArea className="h-full">
          {recordedActions.length === 0 ? (
            <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                <MousePointer2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-sm font-medium">
                {isRecording ? 'Perform the workflow now' : 'No workflow recorded'}
              </h3>
              <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
                {isRecording
                  ? 'Switch to the app you want to demonstrate. Your captured steps will appear here.'
                  : 'Start recording, complete a workflow, then return to review and save it.'}
              </p>
            </div>
          ) : (
            <ol className="space-y-2 pr-3" aria-label="Recorded workflow steps">
              {recordedActions.map((action, index) => (
                <li
                  key={action.id}
                  className="group flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
                    {index + 1}
                  </span>
                  <div
                    className={cn(
                      'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                      action.actionType === 'type' || action.actionType === 'hotkey'
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-blue-500/10 text-blue-500',
                    )}
                  >
                    {action.actionType === 'type' || action.actionType === 'hotkey' ? (
                      <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <MousePointer2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium capitalize">{actionLabel(action)}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDuration(action.timestampMs)}
                      </span>
                    </div>
                    {action.value && (
                      <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                        {action.value}
                      </p>
                    )}
                    {action.target && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Position {action.target.x}, {action.target.y}
                      </p>
                    )}
                  </div>
                  {!isRecording && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 opacity-70 hover:opacity-100"
                      aria-label={`Remove step ${index + 1}`}
                      onClick={() =>
                        setRecordedActions((previous) =>
                          previous.filter((candidate) => candidate.id !== action.id),
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </ScrollArea>
      </div>

      {!isRecording && recordedActions.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <Badge variant="secondary">
            <Check className="mr-1 h-3 w-3" aria-hidden="true" />
            Ready to save
          </Badge>
          <Button size="sm" onClick={() => setShowSaveDialog(true)}>
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            Create skill
          </Button>
        </div>
      )}

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create a reusable skill</DialogTitle>
            <DialogDescription>
              This local skill contains {recordedActions.length}{' '}
              {recordedActions.length === 1 ? 'step' : 'steps'}. Review captured text before saving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Could not create the skill</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="recorded-skill-name">Name</Label>
              <Input
                id="recorded-skill-name"
                autoFocus
                value={skillName}
                onChange={(event) => setSkillName(event.target.value)}
                placeholder="Prepare the weekly status report"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recorded-skill-description">When should AGI use it?</Label>
              <Input
                id="recorded-skill-description"
                value={skillDescription}
                onChange={(event) => setSkillDescription(event.target.value)}
                placeholder="Use when I ask for the weekly project status report."
              />
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              You can inspect or remove every step before saving. Common secret patterns are
              redacted, and existing skills are never overwritten.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void saveSkill()}
              disabled={isSaving || !skillName.trim() || !skillDescription.trim()}
            >
              {isSaving && (
                <Loader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
              )}
              Create skill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
