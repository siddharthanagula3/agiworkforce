'use client';

import { AlertTriangle, CheckCircle2, FileCheck2, Fingerprint, ShieldCheck } from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';
import { cn } from '@shared/lib/utils';
import {
  getProviderModeInfo,
  type WebHandoffContextCandidate,
  type WebLocalToByokPreview,
} from '../../lib/localByokHandoff';

interface LocalByokHandoffDialogProps {
  open: boolean;
  candidates: WebHandoffContextCandidate[];
  selectedContextIds: string[];
  preview: WebLocalToByokPreview | null;
  isBuilding: boolean;
  isConfirming: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onToggleContext: (contextId: string) => void;
  onConfirm: () => void;
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function shortHash(hash: string | undefined): string {
  if (!hash) return 'Pending';
  return `${hash.slice(0, 16)}...${hash.slice(-8)}`;
}

export function LocalByokHandoffDialog({
  open,
  candidates,
  selectedContextIds,
  preview,
  isBuilding,
  isConfirming,
  error,
  onOpenChange,
  onToggleContext,
  onConfirm,
}: LocalByokHandoffDialogProps) {
  const local = getProviderModeInfo('Local');
  const byok = getProviderModeInfo('DirectByok');
  const findings = preview?.redactionReport.findings ?? [];
  const blocked = Boolean(preview?.redactionReport.blocked);
  const canConfirm = Boolean(preview) && !blocked && !isBuilding && !isConfirming && !error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,58rem)] max-w-none p-0">
        <div className="grid max-h-[calc(100vh-2rem)] grid-rows-[auto,1fr,auto] overflow-hidden">
          <DialogHeader className="border-b border-border/60 px-6 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-300">
                <ShieldCheck className="h-3 w-3" />
                {local.label}
              </Badge>
              <span className="text-muted-foreground">to</span>
              <Badge variant="outline" className="gap-1 border-cyan-500/40 text-cyan-300">
                <FileCheck2 className="h-3 w-3" />
                {byok.label}
              </Badge>
            </div>
            <DialogTitle>Review BYOK fork</DialogTitle>
            <DialogDescription>
              This creates a separate {byok.privacyLabel} conversation. The original{' '}
              {local.privacyLabel} thread is left unchanged.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 gap-0 overflow-hidden md:grid-cols-[18rem,1fr]">
            <section className="min-h-0 overflow-y-auto border-b border-border/60 p-4 md:border-b-0 md:border-r">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Context</h3>
                <span className="text-xs text-muted-foreground">
                  {selectedContextIds.length}/{candidates.length}
                </span>
              </div>
              <div className="space-y-2">
                {candidates.map((candidate) => {
                  const checked = selectedContextIds.includes(candidate.id);
                  return (
                    <label
                      key={candidate.id}
                      className={cn(
                        'flex cursor-pointer gap-3 rounded-lg border border-border/60 p-3 text-sm transition-colors hover:bg-muted/50',
                        checked && 'border-primary/40 bg-primary/5',
                        candidate.required && 'cursor-default',
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={candidate.required || isBuilding || isConfirming}
                        onCheckedChange={() => onToggleContext(candidate.id)}
                        aria-label={`Include ${candidate.label}`}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{candidate.label}</span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {candidate.sourceUri ?? candidate.kind}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="min-h-0 overflow-y-auto p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border/60 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Fingerprint className="h-3.5 w-3.5" />
                    Preview hash
                  </div>
                  <div className="mt-2 break-all font-mono text-xs text-foreground">
                    {shortHash(preview?.draft.previewHashSha256)}
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <div className="text-xs text-muted-foreground">Secret findings</div>
                  <div
                    className={cn(
                      'mt-2 text-lg font-semibold',
                      findings.length > 0 ? 'text-amber-300' : 'text-emerald-300',
                    )}
                  >
                    {findings.length}
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 p-3">
                  <div className="text-xs text-muted-foreground">Redacted bytes</div>
                  <div className="mt-2 text-lg font-semibold">
                    {formatBytes(preview?.redactionReport.redactedByteCount)}
                  </div>
                </div>
              </div>

              {error && (
                <div className="mt-3 flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {blocked && (
                <div className="mt-3 flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Secret findings block this BYOK fork. Deselect the flagged context or edit the
                    outgoing prompt before continuing.
                  </span>
                </div>
              )}

              {findings.length > 0 && (
                <div className="mt-4">
                  <h3 className="mb-2 text-sm font-medium">Secret Findings</h3>
                  <div className="space-y-2">
                    {findings.map((finding) => (
                      <div
                        key={finding.id}
                        className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="border-amber-500/40 text-amber-200">
                            {finding.severity}
                          </Badge>
                          <span className="font-mono text-xs text-muted-foreground">
                            {finding.ruleId}
                          </span>
                        </div>
                        <div className="mt-2 break-all text-xs text-muted-foreground">
                          {finding.location}
                        </div>
                        <pre className="mt-2 max-h-20 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2 text-xs">
                          {finding.redactedPreview}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Redacted Payload</h3>
                  {preview && !blocked && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Ready for confirmation
                    </span>
                  )}
                </div>
                <pre className="max-h-[22rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-black/30 p-3 font-mono text-xs leading-relaxed">
                  {isBuilding ? 'Building redacted BYOK preview...' : preview?.redactedPayload}
                </pre>
              </div>
            </section>
          </div>

          <DialogFooter className="px-6 py-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isConfirming}>
              Cancel
            </Button>
            <Button onClick={onConfirm} disabled={!canConfirm}>
              {isConfirming ? 'Creating fork...' : `Create ${byok.label} fork`}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
