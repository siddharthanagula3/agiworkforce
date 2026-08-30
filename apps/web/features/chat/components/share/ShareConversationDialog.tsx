'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  useConfirmAction,
} from '@agiworkforce/ui';
import { Check, Copy, Globe2, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useShareConversation, type ShareExpiryDays } from '../../hooks/use-share-conversation';

const EXPIRY_OPTIONS: ReadonlyArray<{ days: ShareExpiryDays; label: string; detail: string }> = [
  { days: 1, label: '1 day', detail: 'Best for a quick review' },
  { days: 7, label: '7 days', detail: 'Recommended' },
  { days: 30, label: '30 days', detail: 'For longer collaboration' },
];

export interface ShareConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationTitle?: string;
  modelId?: string;
}

function formatExpiry(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'the selected date';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ShareConversationDialog({
  open,
  onOpenChange,
  conversationTitle,
  modelId,
}: ShareConversationDialogProps) {
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [expiryDays, setExpiryDays] = useState<ShareExpiryDays>(7);
  const [copied, setCopied] = useState(false);
  const { share, revoke, isSharing, activeShare, error, clearError } = useShareConversation(
    conversationTitle,
    modelId,
  );
  const expiryLabel = useMemo(
    () => EXPIRY_OPTIONS.find((option) => option.days === expiryDays)?.label ?? '7 days',
    [expiryDays],
  );

  const handleCopy = async () => {
    if (!activeShare) return;
    try {
      await navigator.clipboard.writeText(activeShare.url);
      setCopied(true);
      toast.success('Link copied');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the link. Select it and copy manually.');
    }
  };

  return (
    <>
      {confirmDialog}
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!isSharing) onOpenChange(nextOpen);
          if (nextOpen) clearError();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {activeShare ? (
                <Check className="h-5 w-5 text-emerald-500" />
              ) : (
                <Globe2 className="h-5 w-5" />
              )}
              {activeShare ? 'Public link ready' : 'Share conversation'}
            </DialogTitle>
            <DialogDescription>
              {activeShare
                ? `Anyone with this link can read this ${activeShare.messageCount}-message snapshot until ${formatExpiry(activeShare.expiresAt)}.`
                : 'Create a read-only snapshot. New messages and future edits will not be added to it.'}
            </DialogDescription>
          </DialogHeader>

          {activeShare ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input aria-label="Public conversation link" readOnly value={activeShare.url} />
                <Button variant="outline" onClick={() => void handleCopy()} disabled={isSharing}>
                  {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-muted-foreground">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p>
                  The link does not require sign-in. Remove secrets, personal data, and private
                  files before sharing it.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium text-foreground">
                  Link expires after
                </legend>
                {EXPIRY_OPTIONS.map((option) => (
                  <label
                    key={option.days}
                    className="flex cursor-pointer items-center justify-between rounded-lg border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  >
                    <span>
                      <span className="block text-sm font-medium text-foreground">
                        {option.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">{option.detail}</span>
                    </span>
                    <input
                      type="radio"
                      name="share-expiry"
                      value={option.days}
                      checked={expiryDays === option.days}
                      onChange={() => setExpiryDays(option.days)}
                      className="h-4 w-4 accent-[hsl(var(--primary))]"
                    />
                  </label>
                ))}
              </fieldset>
              <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-muted-foreground">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p>Anyone with the link can read the snapshot without signing in.</p>
              </div>
            </div>
          )}

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            {activeShare ? (
              <>
                <Button
                  variant="destructive"
                  onClick={() =>
                    confirm({
                      title: 'Revoke this share link?',
                      description:
                        'Anyone holding the link loses access immediately. A new link can be created, but it will be a different URL — the old one stays dead.',
                      confirmLabel: 'Revoke link',
                      onConfirm: () => revoke(),
                    })
                  }
                  disabled={isSharing}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {isSharing ? 'Revoking…' : 'Revoke link'}
                </Button>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSharing}>
                  Done
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSharing}>
                  Cancel
                </Button>
                <Button onClick={() => void share(expiryDays)} disabled={isSharing}>
                  {isSharing ? 'Creating…' : `Create public link · ${expiryLabel}`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
