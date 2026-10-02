'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  translateUiPlural,
  useConfirmAction,
} from '@agiworkforce/ui';
import { Building2, Check, Copy, Globe2, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useShareConversation,
  type ShareAudience,
  type ShareExpiryDays,
} from '../../hooks/use-share-conversation';
import { memoWhenClosed } from '@shared/lib/memo-when-closed';
import { TEMPORARY_CHAT_SHARE_REFUSAL } from '@/lib/temporary-chat-policy';

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
  conversationId?: string | null;
  conversationLoadError?: string | null;
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

function ShareConversationDialogImpl({
  open,
  onOpenChange,
  conversationTitle,
  modelId,
  conversationId,
  conversationLoadError,
}: ShareConversationDialogProps) {
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [expiryDays, setExpiryDays] = useState<ShareExpiryDays>(7);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const refocusAfterRevokeRef = useRef(false);
  const confirming = confirmDialog !== null;
  const {
    share,
    updateLink,
    revoke,
    setAudience,
    isSharing,
    isTemporary,
    activeShare,
    checkingShare,
    loadingChat,
    error,
    cancelPending,
  } = useShareConversation(conversationTitle, modelId, conversationId, open);
  const chatLoadError = loadingChat ? (conversationLoadError ?? null) : null;
  const shownError = chatLoadError ?? error;
  const pendingStatus = checkingShare
    ? 'Checking whether this chat is already shared'
    : loadingChat && !chatLoadError
      ? 'Loading this chat'
      : null;
  const expiryLabel = useMemo(
    () => EXPIRY_OPTIONS.find((option) => option.days === expiryDays)?.label ?? '7 days',
    [expiryDays],
  );

  const workspaceMembers = activeShare?.workspace?.memberCount ?? 0;
  const memberLabel = translateUiPlural('settings', 'counts.members', workspaceMembers, {
    one: '{{count}} member',
    other: '{{count}} members',
  });

  useEffect(() => {
    if (confirming || !refocusAfterRevokeRef.current) return;
    refocusAfterRevokeRef.current = false;
    contentRef.current?.focus();
  }, [confirming]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) cancelPending();
    onOpenChange(nextOpen);
  };

  const handleAudienceChange = (next: ShareAudience) => {
    if (!activeShare || next === activeShare.audience) return;
    const apply = async () => {
      const ok = await setAudience(next);
      if (!ok) return;
      toast.success(
        next === 'organization'
          ? 'Only your workspace can open this now'
          : 'Anyone with the link can open this now',
      );
    };
    const several = activeShare.linkCount > 1;
    confirm(
      next === 'organization'
        ? {
            title: several
              ? `Limit all ${activeShare.linkCount} links to your workspace?`
              : 'Limit this to your workspace?',
            description: several
              ? `All ${activeShare.linkCount} links stop opening, so anyone outside your workspace who already has one loses access. Your ${memberLabel} can open them instead. You can switch back, and the links stay the same.`
              : `The link stops opening, so anyone outside your workspace who already has it loses access. Your ${memberLabel} can open it instead. You can switch back, and the link stays the same.`,
            confirmLabel: 'Share with workspace',
            onConfirm: apply,
          }
        : {
            title: several
              ? `Make all ${activeShare.linkCount} links readable by anyone who has one?`
              : 'Make this readable by anyone with the link?',
            description: several
              ? `Anyone holding one of the ${activeShare.linkCount} links can read the transcript without signing in, including people outside your workspace and anyone they forward it to. Sharing them back cannot un-share a copy somebody has already taken.`
              : 'Anyone holding the link can read the transcript without signing in, including people outside your workspace and anyone they forward it to. Sharing it back cannot un-share a copy somebody has already taken.',
            confirmLabel: several ? 'Open all links' : 'Open the link',
            onConfirm: apply,
          },
    );
  };

  const handleUpdateLink = () => {
    if (!activeShare) return;
    const several = activeShare.linkCount > 1;
    const readers = several
      ? `This chat has ${activeShare.linkCount} live links, which may have gone to different people, and all of them change. Everyone who can open any of them`
      : activeShare.audience === 'organization'
        ? 'Everyone in your workspace'
        : 'Anyone with the link';
    const added =
      activeShare.newMessages > 0
        ? `, including ${activeShare.newMessagesVary ? 'up to ' : ''}${translateUiPlural(
            'common',
            'counts.messages',
            activeShare.newMessages,
            { one: '{{count}} message', other: '{{count}} messages' },
          )} added since ${several ? 'they were' : 'it was'} shared`
        : '';
    confirm({
      title: several ? `Update all ${activeShare.linkCount} links?` : 'Update the shared link?',
      description: `${readers} will see this chat as it is now${added}. The snapshot ${several ? 'each link shows' : 'it shows'} today is replaced and cannot be restored.`,
      confirmLabel: several ? 'Update all links' : 'Update link',
      onConfirm: async () => {
        if (await updateLink()) toast.success('Link updated');
      },
    });
  };

  const handleRevoke = () => {
    if (!activeShare) return;
    const scope = activeShare.mayHaveUnlistedLinks
      ? {
          title: 'Revoke every link to this chat?',
          description:
            'Every live link to this chat stops working, including any older ones that could not be checked. Anyone holding one loses access immediately, and any workspace grant is withdrawn. A new link can be created, but it will be a different URL, and the old ones stay dead.',
          confirmLabel: 'Revoke all links',
        }
      : activeShare.linkCount > 1
        ? {
            title: `Revoke all ${activeShare.linkCount} links?`,
            description: `This chat has ${activeShare.linkCount} live links, and all of them stop working. Anyone holding one loses access immediately, and any workspace grant is withdrawn. A new link can be created, but it will be a different URL, and the old ones stay dead.`,
            confirmLabel: 'Revoke all links',
          }
        : {
            title: 'Revoke this share?',
            description:
              activeShare.audience === 'organization'
                ? 'Everyone in your workspace loses access immediately, and the grant is withdrawn. A new share can be created, but it will be a different URL, the old one stays dead.'
                : 'Anyone holding the link loses access immediately. A new link can be created, but it will be a different URL, the old one stays dead.',
            confirmLabel: 'Revoke share',
          };
    confirm({
      ...scope,
      onConfirm: async () => {
        refocusAfterRevokeRef.current = await revoke();
      },
    });
  };

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
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent ref={contentRef} className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {activeShare ? (
                <Check className="h-5 w-5 text-success-text" />
              ) : (
                <Globe2 className="h-5 w-5" />
              )}
              {activeShare
                ? activeShare.audience === 'organization'
                  ? 'Shared with your workspace'
                  : 'Public link ready'
                : 'Share conversation'}
            </DialogTitle>
            <DialogDescription>
              {activeShare
                ? activeShare.audience === 'organization'
                  ? `Everyone in your workspace can read this ${activeShare.messageCount}-message snapshot until ${formatExpiry(activeShare.expiresAt)}. Nobody else can, link or not.`
                  : `Anyone with this link can read this ${activeShare.messageCount}-message snapshot until ${formatExpiry(activeShare.expiresAt)}.`
                : 'Create a read-only snapshot. New messages and future edits will not be added to it.'}
              {activeShare
                ? ' Messages added after it was shared stay private until you update the link, which keeps the same address.'
                : null}
            </DialogDescription>
          </DialogHeader>

          {pendingStatus ? (
            <div
              role="status"
              className="flex items-center gap-2 py-2 text-sm text-muted-foreground"
            >
              <Spinner size="sm" aria-hidden="true" />
              <span>{pendingStatus}</span>
            </div>
          ) : loadingChat ? null : activeShare ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input autoFocus aria-label="Conversation link" readOnly value={activeShare.url} />
                <Button variant="outline" onClick={() => void handleCopy()} disabled={isSharing}>
                  {copied ? <Check className="me-2 h-4 w-4" /> : <Copy className="me-2 h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>

              {activeShare.workspace ? (
                <div className="space-y-2" data-testid="share-audience">
                  <label
                    htmlFor="share-audience-select"
                    className="block text-sm font-medium text-foreground"
                  >
                    Who can open this
                  </label>
                  <select
                    id="share-audience-select"
                    value={activeShare.audience}
                    disabled={isSharing}
                    onChange={(event) =>
                      handleAudienceChange(
                        event.target.value === 'organization' ? 'organization' : 'public',
                      )
                    }
                    className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"
                  >
                    <option value="public">Anyone with the link</option>
                    <option value="organization">
                      Everyone in this workspace ({activeShare.workspace.memberCount})
                    </option>
                  </select>
                </div>
              ) : null}

              {activeShare.linkCount > 1 ? (
                <p className="text-sm text-muted-foreground" data-testid="share-link-count">
                  This chat has {activeShare.linkCount} live links. Update link and Revoke share act
                  on all of them.
                </p>
              ) : null}

              {activeShare.audience === 'organization' ? (
                <div className="flex gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    The link now refuses everyone outside your workspace. Your {memberLabel} can
                    open it while signed in, until it expires.
                  </p>
                </div>
              ) : (
                <div className="flex gap-2 rounded-lg border border-warning-fill/20 bg-warning-fill/5 p-3 text-sm text-muted-foreground">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" />
                  <p>
                    The link does not require sign-in. Remove secrets, personal data, and private
                    files before sharing it.
                  </p>
                </div>
              )}
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
                      className="h-4 w-4 accent-primary"
                    />
                  </label>
                ))}
              </fieldset>
              {isTemporary ? (
                <div
                  data-testid="share-temporary-notice"
                  className="flex gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
                >
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{TEMPORARY_CHAT_SHARE_REFUSAL}</p>
                </div>
              ) : (
                <div className="flex gap-2 rounded-lg border border-warning-fill/20 bg-warning-fill/5 p-3 text-sm text-muted-foreground">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" />
                  <p>Anyone with the link can read the snapshot without signing in.</p>
                </div>
              )}
            </div>
          )}

          {shownError ? (
            <p role="alert" className="text-sm text-danger">
              {shownError}
            </p>
          ) : null}

          <DialogFooter key={activeShare ? 'shared' : 'unshared'}>
            {activeShare ? (
              <>
                <Button variant="destructive" onClick={handleRevoke} disabled={isSharing}>
                  <Trash2 className="me-2 h-4 w-4" />
                  Revoke share
                </Button>
                <Button variant="outline" onClick={handleUpdateLink} disabled={isSharing}>
                  <RefreshCw className="me-2 h-4 w-4" />
                  Update link
                </Button>
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  Done
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void share(expiryDays)}
                  disabled={isSharing || isTemporary || checkingShare || loadingChat}
                >
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

export const ShareConversationDialog = memoWhenClosed(ShareConversationDialogImpl);
