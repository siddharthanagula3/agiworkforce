'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, X as XIcon } from 'lucide-react';
import { fetchPreferenceNamespace } from '@/app/settings/_lib/preferences-client';
import {
  DEFAULT_TOOL_APPROVAL_PREFERENCES,
  TOOL_APPROVAL_PREFERENCE_NAMESPACE,
  type ToolApprovalPreferences,
} from '@shared/types/toolApprovalPolicy';
import { useUIStore } from '@shared/stores/layout-store';
import {
  AGI_WORK_AUTONOMY_NOTICE_ACTION,
  AGI_WORK_AUTONOMY_NOTICE_BODY,
  AGI_WORK_AUTONOMY_NOTICE_DISMISS,
} from '../../lib/agi-work';

const AUTO_APPROVING_POLICY: ToolApprovalPreferences['defaultPolicy'] = 'auto_approve_read_only';

export interface AgiWorkAutonomyNoticeProps {
  active: boolean;
  onReviewApprovals: () => void;
}

export function AgiWorkAutonomyNotice({ active, onReviewApprovals }: AgiWorkAutonomyNoticeProps) {
  const dismissed = useUIStore((state) => state.agiWorkAutonomyNoticeDismissed);
  const dismiss = useUIStore((state) => state.dismissAgiWorkAutonomyNotice);
  const [autoApproves, setAutoApproves] = useState(false);

  useEffect(() => {
    if (!active || dismissed) return undefined;
    let cancelled = false;
    void fetchPreferenceNamespace<ToolApprovalPreferences>(
      TOOL_APPROVAL_PREFERENCE_NAMESPACE,
      DEFAULT_TOOL_APPROVAL_PREFERENCES,
    )
      .then((preferences) => {
        if (!cancelled) setAutoApproves(preferences.defaultPolicy === AUTO_APPROVING_POLICY);
      })
      // A policy we could not read is not a policy we may describe as automatic.
      .catch(() => {
        if (!cancelled) setAutoApproves(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, dismissed]);

  if (!active || dismissed || !autoApproves) return null;

  return (
    <div
      data-testid="agi-work-autonomy-notice"
      className="mb-2 flex items-start gap-2 rounded-[var(--chat-radius-lg)] border border-[var(--chat-border-subtle)] bg-[var(--chat-surface-elevated)] px-3 py-2 text-[13px] leading-relaxed text-[var(--chat-text-secondary)]"
    >
      <ShieldCheck
        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--chat-text-muted)]"
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1">
        {AGI_WORK_AUTONOMY_NOTICE_BODY}{' '}
        <button
          type="button"
          onClick={onReviewApprovals}
          className="rounded-sm text-[var(--chat-accent-primary-text)] underline underline-offset-2 transition-colors hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
        >
          {AGI_WORK_AUTONOMY_NOTICE_ACTION}
        </button>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={AGI_WORK_AUTONOMY_NOTICE_DISMISS}
        className="-me-1 flex h-7 w-7 shrink-0 touch-manipulation items-center justify-center rounded-md text-[var(--chat-text-muted)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] [@media(hover:none)]:h-11 [@media(hover:none)]:w-11"
      >
        <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
