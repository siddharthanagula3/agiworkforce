import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, Shield, X } from 'lucide-react';
import { toast } from 'sonner';
import { buildLocalToByokHandoffDraft, type LocalToByokHandoffPreview } from '@agiworkforce/utils';
import { formatPrivacyModeLabel } from '@agiworkforce/types';
import { Button } from '@/components/ui/Button';
import { cn } from '../../lib/utils';
import { useSettingsStore } from '../../stores/settingsStore';
import { useChatStore } from '../../stores/chat/chatStore';

interface LocalByokHandoffDialogProps {
  conversationId: string;
  conversationTitle: string;
  onClose: () => void;
}

function formatHash(hash: string): string {
  return `${hash.slice(0, 12)}...${hash.slice(-8)}`;
}

export function LocalByokHandoffDialog({
  conversationId,
  conversationTitle,
  onClose,
}: LocalByokHandoffDialogProps) {
  const messages = useChatStore((state) => state.messagesByConversation[conversationId] ?? []);
  const forkConversationForByok = useChatStore((state) => state.forkConversationForByok);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const setProviderMode = useSettingsStore((state) => state.setProviderMode);
  const [preview, setPreview] = useState<LocalToByokHandoffPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const handoffContext = useMemo(
    () =>
      messages.slice(-20).map((message, index) => ({
        id: message.id,
        kind: 'message' as const,
        label: `${index + 1}. ${message.role}`,
        sourceUri: `desktop://conversation/${conversationId}/message/${message.id}`,
        content: message.content,
      })),
    [conversationId, messages],
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    buildLocalToByokHandoffDraft({
      sourceSessionId: conversationId,
      sourceSurface: 'desktop',
      targetSurface: 'desktop',
      selectedContext: handoffContext,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      blockOnFindings: true,
    })
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setPreview(null);
          setError(err instanceof Error ? err.message : 'Could not build handoff preview.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, handoffContext]);

  const findings = preview?.redactionReport.findings ?? [];
  const isBlocked = preview?.redactionReport.blocked ?? false;

  const handleCreateFork = () => {
    if (!preview || isBlocked) return;

    const forkId = forkConversationForByok(conversationId, {
      title: `${conversationTitle} (${formatPrivacyModeLabel('byok')} fork)`,
    });
    setProviderMode('cloud');
    selectConversation(forkId);
    toast.success('Created a BYOK fork. The original Local thread is unchanged.');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isLoading) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-5 flex items-start gap-3 pr-8">
          <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Create {formatPrivacyModeLabel('byok')} fork
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Preview the redacted context before this Local conversation is continued with your
              provider keys. The source thread stays Local.
            </p>
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{conversationTitle}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {handoffContext.length} message{handoffContext.length === 1 ? '' : 's'} selected
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
              <Shield className="h-3.5 w-3.5 text-emerald-500" />
              Local to {formatPrivacyModeLabel('byok')}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-border p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Building redacted preview...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : preview ? (
          <div className="space-y-4">
            <div
              className={cn(
                'rounded-lg border p-3',
                findings.length > 0
                  ? 'border-amber-500/30 bg-amber-500/10'
                  : 'border-emerald-500/30 bg-emerald-500/10',
              )}
            >
              <div className="flex items-center gap-2 text-xs font-medium">
                {findings.length > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                )}
                <span className={findings.length > 0 ? 'text-amber-300' : 'text-emerald-300'}>
                  {findings.length > 0
                    ? `${findings.length} possible secret finding${
                        findings.length === 1 ? '' : 's'
                      }`
                    : 'No secret-like values found'}
                </span>
              </div>
              {findings.length > 0 && (
                <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-[11px] text-amber-100/80">
                  {findings.map((finding) => (
                    <li key={finding.id}>
                      {finding.label} in {finding.location}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div className="rounded-lg border border-border bg-background/70 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Redacted payload preview
                </p>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
                  {preview.redactedPayload}
                </pre>
              </div>
              <div className="rounded-lg border border-border bg-background/70 p-3 md:w-44">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Preview hash
                </p>
                <p className="mt-2 break-all font-mono text-[11px] text-foreground">
                  {formatHash(preview.draft.previewHashSha256)}
                </p>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Expires {new Date(preview.draft.expiresAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleCreateFork}
            disabled={!preview || isBlocked || isLoading}
            className="gap-1.5"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Create BYOK fork
          </Button>
        </div>
      </div>
    </div>
  );
}
