'use client';

import { useState } from 'react';
import { Check, Copy, TriangleAlert } from '@agiworkforce/icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  RadioGroup,
  RadioGroupItem,
  Spinner,
  useConfirmAction,
} from '@agiworkforce/ui';
import {
  cloudCodeSharedSessionPagePath,
  isCloudCodeShareVisibility,
  type CloudCodeSession,
  type CloudCodeShareVisibility,
} from '@agiworkforce/types';
import { toUserMessage } from '@/lib/user-error-message';
import { CODE_COPY } from '../code-surface';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 14;

interface AudienceOption {
  visibility: CloudCodeShareVisibility;
  label: string;
  hint: string;
}

function audienceOptions(session: CloudCodeSession): AudienceOption[] {
  const shared: AudienceOption =
    session.shareAudience === 'team'
      ? { visibility: 'team', label: CODE_COPY.shareTeam, hint: CODE_COPY.shareTeamHint }
      : { visibility: 'public', label: CODE_COPY.sharePublic, hint: CODE_COPY.sharePublicHint };
  return [
    { visibility: 'private', label: CODE_COPY.sharePrivate, hint: CODE_COPY.sharePrivateHint },
    shared,
  ];
}

export interface CodeShareDialogProps {
  session: CloudCodeSession;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChangeVisibility: (visibility: CloudCodeShareVisibility) => Promise<void>;
}

export function CodeShareDialog({
  session,
  open,
  onOpenChange,
  onChangeVisibility,
}: CodeShareDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const visibility = session.shareVisibility ?? 'private';
  const link =
    session.shareToken && typeof window !== 'undefined'
      ? `${window.location.origin}${cloudCodeSharedSessionPagePath(session.shareToken)}`
      : null;

  const apply = async (next: CloudCodeShareVisibility) => {
    setSaving(true);
    setError(null);
    setCopyState('idle');
    try {
      await onChangeVisibility(next);
    } catch (cause) {
      setError(toUserMessage(cause, CODE_COPY.shareFailed));
    } finally {
      setSaving(false);
    }
  };

  const change = (value: string) => {
    if (!isCloudCodeShareVisibility(value) || value === visibility) return;
    if (value !== 'private') {
      void apply(value);
      return;
    }
    confirm({
      title: CODE_COPY.stopSharingTitle,
      description: CODE_COPY.stopSharingDescription,
      confirmLabel: CODE_COPY.stopSharingConfirm,
      destructive: true,
      onConfirm: () => apply('private'),
    });
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
          setCopyState('idle');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{CODE_COPY.shareTitle}</DialogTitle>
          <DialogDescription>{CODE_COPY.shareSnapshotNote}</DialogDescription>
        </DialogHeader>

        <fieldset className={styles['formField']} disabled={saving}>
          <legend className={styles['formLabel']}>{CODE_COPY.shareAudience}</legend>
          <RadioGroup value={visibility} onValueChange={change}>
            {audienceOptions(session).map((option) => (
              <Label
                key={option.visibility}
                htmlFor={`code-share-${option.visibility}`}
                className={styles['shareOption']}
              >
                <RadioGroupItem id={`code-share-${option.visibility}`} value={option.visibility} />
                <span className={styles['menuRowLabel']}>
                  <span className={styles['optionLabel']}>{option.label}</span>
                  <span className={styles['optionHint']}>{option.hint}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        </fieldset>

        {saving && <Spinner size="sm" aria-label={CODE_COPY.shareSaving} />}
        {error && (
          <p className={`${styles['notice']} ${styles['noticeError']}`} role="alert">
            {error}
          </p>
        )}

        {visibility !== 'private' && link && (
          <div className={styles['formField']}>
            <label className={styles['formLabel']} htmlFor="code-share-link">
              {CODE_COPY.shareLinkLabel}
            </label>
            <div className={styles['shareLinkRow']}>
              <input
                id="code-share-link"
                className={styles['textInput']}
                value={link}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                type="button"
                className={styles['secondaryButton']}
                onClick={() => void copy()}
              >
                {copyState === 'copied' ? (
                  <Check size={GLYPH_SIZE} aria-hidden="true" />
                ) : (
                  <Copy size={GLYPH_SIZE} aria-hidden="true" />
                )}
                {copyState === 'copied'
                  ? CODE_COPY.copiedLink
                  : copyState === 'failed'
                    ? CODE_COPY.copyLinkFailed
                    : CODE_COPY.copyLink}
              </button>
            </div>
            {visibility === 'team' && session.repositoryUrl && (
              <span className={styles['formHelp']}>{CODE_COPY.shareRepositoryNote}</span>
            )}
          </div>
        )}

        <p className={styles['shareWarning']}>
          <TriangleAlert size={GLYPH_SIZE} aria-hidden="true" />
          <span>{CODE_COPY.shareWarning}</span>
        </p>

        <div className={styles['shareActions']}>
          <button
            type="button"
            className={styles['primaryButton']}
            onClick={() => onOpenChange(false)}
          >
            {CODE_COPY.shareDone}
          </button>
        </div>
        {confirmDialog}
      </DialogContent>
    </Dialog>
  );
}
