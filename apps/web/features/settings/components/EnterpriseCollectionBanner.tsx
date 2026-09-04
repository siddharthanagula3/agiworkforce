'use client';

import { useEffect, useState } from 'react';
import type { CollectionState, CollectionStage } from '@/lib/services/enterprise-collection-state';

type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

interface OrganizationCollectionResponse {
  organization: { currentUserRole: WorkspaceRole } | null;
  collectionState: CollectionState | null;
}

type BannerTone = 'warning' | 'destructive';

const STAGE_TONE: Partial<Record<CollectionStage, BannerTone>> = {
  past_due_30: 'warning',
  past_due_60: 'warning',
  past_due_90: 'destructive',
  read_only: 'destructive',
};

const WARNING_STYLE: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--chat-warning-border)',
  background: 'var(--chat-warning-bg)',
  color: 'var(--chat-warning-fg)',
  fontSize: 13,
  lineHeight: 1.5,
};

const DESTRUCTIVE_STYLE: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--settings-destructive-text)',
  color: 'var(--settings-destructive-text)',
  fontSize: 13,
  lineHeight: 1.5,
};

function daysPastDueLabel(daysPastDue: number): string {
  return `${daysPastDue} day${daysPastDue === 1 ? '' : 's'}`;
}

function adminCopy(collectionState: CollectionState): string {
  const days = daysPastDueLabel(collectionState.daysPastDue);
  switch (collectionState.stage) {
    case 'past_due_30':
      return `Payment on this workspace is ${days} past due. Resolve the outstanding invoice to avoid further restrictions. Contact your billing owner.`;
    case 'past_due_60':
      return `Payment on this workspace is ${days} past due. This balance is significantly overdue: resolve it soon to keep seat expansion and new paid usage available. Contact your billing owner.`;
    case 'past_due_90':
      return `Payment on this workspace is ${days} past due. New seats and new paid usage commitments are on hold until the outstanding invoice is resolved. Contact your billing owner.`;
    case 'read_only':
      return `Payment on this workspace is ${days} past due. The workspace is read-only: no new managed-cloud work can be created until the outstanding invoice is resolved. Contact your billing owner.`;
    default:
      return '';
  }
}

const MEMBER_READ_ONLY_COPY =
  'This workspace is temporarily read-only because of an unpaid invoice. Contact your workspace owner to restore access.';

export function EnterpriseCollectionBanner() {
  const [data, setData] = useState<OrganizationCollectionResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/settings/organization', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: OrganizationCollectionResponse | null) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {
        // A billing-hold banner that fails to load must not block the page;
        // staying unset renders nothing, which is the fail-open default.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const collectionState = data?.collectionState ?? null;
  if (!collectionState || collectionState.stage === 'current') return null;

  const role = data?.organization?.currentUserRole ?? 'member';
  const isAdmin = role === 'owner' || role === 'admin';
  if (!isAdmin && collectionState.stage !== 'read_only') return null;

  const tone = STAGE_TONE[collectionState.stage] ?? 'warning';
  const copy = isAdmin ? adminCopy(collectionState) : MEMBER_READ_ONLY_COPY;

  return (
    <div role="alert" style={tone === 'destructive' ? DESTRUCTIVE_STYLE : WARNING_STYLE}>
      {copy}
    </div>
  );
}
