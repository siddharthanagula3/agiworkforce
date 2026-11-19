'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useSignOut } from '@/lib/identity/client';
import { ChevronLeft, ChevronRight, RefreshCw, Undo2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  useConfirmAction,
} from '@agiworkforce/ui';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useBillingStore, type SubscriptionPlan } from '@shared/stores/web-auth-store';
import {
  getBillingPlanPricing,
  isBillingPlanTier,
  isFreeBillingPlanTier,
} from '@agiworkforce/types';
import {
  hasLiveBillingRelationship,
  subscriptionAccessRank,
} from '@/lib/services/subscription-access-policy';
import { formatBillingDateFromSeconds } from '@/features/billing/lib/billing-format';
import {
  STORE_BILLING_NAME,
  STORE_SUBSCRIPTION_MANAGEMENT_URL,
  isStoreBillingSource,
} from '@/lib/billing/store-subscription-management';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { TimeoutPresets } from '@shared/lib/error-utils';
import { ApiKeysManager } from '../components/Settings/ApiKeys';
import { EmailAddressChange } from '../components/EmailAddressChange';
import { isStepUpCancelled } from '@/features/auth/step-up-fetch';
import { SettingsSectionLink } from '../components/SettingsSectionLink';
import { RecentActivityPanel } from '@features/settings/components/RecentActivityPanel';
import { LinkedDevicesPanel } from '../components/LinkedDevicesPanel';
import { CopyableIdField } from '../components/CopyableIdField';
import {
  useOrganizationOverview,
  useDeleteAccount,
  useAccountDeletionStatus,
  useCancelAccountDeletion,
} from '../hooks/use-settings-queries';
import { toUserMessage } from '@/lib/user-error-message';
import type { AccountDeletionCancellationIntent } from '../hooks/use-cancel-account-deletion';
import {
  permitsAccountDeletionAction as permitsDeletionAction,
  type OwnedAccountDeletionSnapshot,
} from '../hooks/use-account-deletion-status';
import { HelpArticleLink } from '@/features/support/components/HelpArticleLink';

type DeletionStatusSnapshot = OwnedAccountDeletionSnapshot;

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return 'an unknown date';
  return value.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function livePaidPlanOf(subscription: SubscriptionPlan | null): SubscriptionPlan | null {
  if (!subscription) return null;
  const tier = String(subscription.tier ?? 'free')
    .trim()
    .toLowerCase();
  if (isFreeBillingPlanTier(tier)) return null;
  return hasLiveBillingRelationship(subscription.status) ? subscription : null;
}

function planLabelOf(subscription: SubscriptionPlan): string {
  const tier = String(subscription.tier).trim().toLowerCase();
  return isBillingPlanTier(tier) ? getBillingPlanPricing(tier).label : subscription.display_name;
}

const SESSION_TRUNCATION_HINT =
  'Use “Log out of all devices” in Security to end the ones not listed here.';

interface AccountSession {
  id: string;
  status: string;
  device: string;
  browser: string | null;
  location: string | null;
  createdAt: string | null;
  lastActiveAt: string | null;
  expiresAt: string | null;
  isCurrent: boolean;
}

function formatSessionDateTime(value: string | null): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : formatDateTime(date);
}

export function readApiError(data: unknown, fallback: string): string {
  if (data === null || typeof data !== 'object' || !('error' in data)) return fallback;
  const error = (data as { error?: unknown }).error;
  // The server's words reach the screen, so they pass the same filter the rest
  // of the product uses: a sentence a person wrote survives, a trace id does
  // not. Measured with a 500 carrying "upstream exploded: trace 0xdeadbeef".
  const raw =
    typeof error === 'string' && error.trim()
      ? error
      : error !== null &&
          typeof error === 'object' &&
          'message' in error &&
          typeof (error as { message?: unknown }).message === 'string'
        ? ((error as { message: string }).message ?? '')
        : '';
  if (!raw.trim()) return fallback;
  return toUserMessage(new Error(raw), fallback);
}

const titleStyle: CSSProperties = {
  fontFamily: 'var(--sans)',
  fontSize: 24,
  fontWeight: 500,
  color: 'var(--text-1)',
  margin: '0 0 var(--space-1)',
};

const sectionHeadingStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--text-1)',
  margin: 'var(--space-5) 0 var(--space-3)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-4)',
  padding: 'var(--space-4) 0',
  borderBottom: '1px solid var(--settings-border)',
  flexWrap: 'wrap',
};

const chevronRowStyle: CSSProperties = {
  ...rowStyle,
  width: '100%',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--settings-border)',
  textAlign: 'left',
  cursor: 'pointer',
};

const rowLabelStyle: CSSProperties = {
  fontSize: 14,
  color: 'var(--text-1)',
  margin: 0,
};

const rowHintStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--text-3)',
  margin: 'var(--space-1) 0 0',
};

const outlineButtonStyle: CSSProperties = {
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: 'var(--space-2) var(--space-4)',
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-1)',
  background: 'transparent',
  border: '1px solid var(--settings-border)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
};

const dangerButtonStyle: CSSProperties = {
  flexShrink: 0,
  padding: 'var(--space-2) var(--space-4)',
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--settings-destructive-text)',
  background: 'transparent',
  border: '1px solid var(--settings-destructive)',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
};

const blockedDangerButtonStyle: CSSProperties = {
  ...dangerButtonStyle,
  color: 'var(--text-disabled)',
  background: 'var(--bg-hover)',
  border: '1px solid var(--settings-border)',
  cursor: 'not-allowed',
};

const backRowStyle: CSSProperties = {
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: 0,
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-2)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
};

const errorTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: 'var(--settings-destructive-text)',
};

function AccountRow({
  label,
  labelTestId,
  hint,
  hintId,
  children,
}: {
  label: string;
  labelTestId?: string;
  hint?: React.ReactNode;
  hintId?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={rowStyle}>
      <div style={{ minWidth: 0 }}>
        <p data-testid={labelTestId} style={rowLabelStyle}>
          {label}
        </p>
        {hint && (
          <p id={hintId} style={rowHintStyle}>
            {hint}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

export function AccountSection({
  emailEditorActive = true,
  deletionActionsActive = true,
}: {
  emailEditorActive?: boolean;
  deletionActionsActive?: boolean;
}) {
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const identitySignOut = useSignOut();
  const router = useRouter();

  const userId = user?.id ?? null;
  const organizationId = useOrganizationOverview().data?.organization?.id ?? null;
  const currentEmail = user?.email ?? null;
  const [showEmailChange, setShowEmailChange] = useState<boolean | null>(null);

  const [showApiKeys, setShowApiKeys] = useState(false);

  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [sessionTotalCount, setSessionTotalCount] = useState<number | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionActionError, setSessionActionError] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const sessionsTruncated = sessionTotalCount !== null && sessionTotalCount > sessions.length;

  const loadSessions = useCallback(async (signal?: AbortSignal) => {
    setSessionsLoading(true);
    setSessionsError(null);
    const timeoutSignal = AbortSignal.timeout(TimeoutPresets.FAST);
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    try {
      const response = await fetch('/api/settings/sessions', {
        method: 'GET',
        cache: 'no-store',
        signal: requestSignal,
      });
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readApiError(data, 'Unable to load active sessions.'));
      const rows =
        data !== null && typeof data === 'object' && 'sessions' in data
          ? (data as { sessions?: unknown }).sessions
          : null;
      if (!Array.isArray(rows)) throw new Error('The active-session response was invalid.');
      const total = (data as { totalCount?: unknown }).totalCount;
      if (!signal?.aborted) {
        setSessions(rows as AccountSession[]);
        setSessionTotalCount(typeof total === 'number' ? total : rows.length);
      }
    } catch (error) {
      if (signal?.aborted) return;
      setSessionsError(
        timeoutSignal.aborted
          ? 'Active sessions took too long to load. Please try again.'
          : toUserMessage(error, 'Unable to load active sessions.'),
      );
    } finally {
      if (!signal?.aborted) setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadSessions(controller.signal);
    return () => controller.abort();
  }, [loadSessions]);

  const handleRevokeSession = useCallback(
    async (session: AccountSession) => {
      setRevokingSessionId(session.id);
      setSessionActionError(null);
      let sessionRevoked = false;
      try {
        const headers = await addCsrfHeaders();
        const response = await fetch(`/api/settings/sessions/${encodeURIComponent(session.id)}`, {
          method: 'DELETE',
          headers,
        });
        const data: unknown = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(readApiError(data, 'Unable to revoke this session.'));
        sessionRevoked = true;

        if (session.isCurrent) {
          await logout();
          await identitySignOut({ sessionId: session.id, redirectUrl: '/login' });
          return;
        }

        setSessions((current) => current.filter((row) => row.id !== session.id));
        setSessionTotalCount((current) => (current === null ? current : Math.max(0, current - 1)));
      } catch (error) {
        if (sessionRevoked && session.isCurrent) {
          router.replace('/login');
          return;
        }
        setSessionActionError(toUserMessage(error, 'Unable to revoke this session.'));
      } finally {
        setRevokingSessionId(null);
      }
    },
    [identitySignOut, logout, router],
  );

  // ── Delete account (canonical, working flow on this surface) ───────────────
  // CSRF, the DELETE call, response parsing, and the post-success sign-out
  // sequence all live in useDeleteAccount (features/settings/hooks/
  // use-settings-queries.ts), this is now the only account-deletion
  // implementation in the app; PrivacySection's independent copy (which never
  // signed the user out) was collapsed onto this hook.
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteStatusSnapshot, setDeleteStatusSnapshot] = useState<DeletionStatusSnapshot | null>(
    null,
  );
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const deleteAccountMutation = useDeleteAccount();

  const handleDeleteAccount = useCallback(() => {
    if (!deleteStatusSnapshot || !permitsDeletionAction(deleteStatusSnapshot, 'schedule')) return;
    deleteAccountMutation.mutate(deleteStatusSnapshot);
  }, [deleteAccountMutation, deleteStatusSnapshot]);

  const handleDeleteSuccessContinue = useCallback(() => {
    setShowDeleteDialog(false);
    void deleteAccountMutation.signOutAfterDeletion();
  }, [deleteAccountMutation]);

  // ── Cancel a pending deletion, before the erasure deadline ──────────────────
  // The account stays reachable here because scheduling a deletion does not
  // revoke the Clerk session, only the post-confirm sign-out above does, and
  // only once the user clicks Continue. Signing back in before the deadline
  // (the Clerk identity itself is not deleted until the purge cron runs)
  // lands here with deletionStatus.pending true, which is what this reads.
  const [cancelIntent, setCancelIntent] = useState<AccountDeletionCancellationIntent | null>(null);
  const deletionStatus = useAccountDeletionStatus(deletionActionsActive);
  const cancelDeletionMutation = useCancelAccountDeletion(deletionActionsActive);
  const renderedDeletionStatus = deletionStatus.snapshot;
  const canScheduleDeletion = permitsDeletionAction(renderedDeletionStatus, 'schedule');
  const canCancelDeletion = permitsDeletionAction(renderedDeletionStatus, 'cancel');

  const pendingDeletion = deletionStatus.data?.pending === true;

  const billingInitialized = useBillingStore((s) => s.initialized);
  const livePaidPlan = livePaidPlanOf(useBillingStore((s) => s.subscription));
  const livePlanLabel = livePaidPlan ? planLabelOf(livePaidPlan) : null;
  const livePlanEnds = livePaidPlan
    ? formatBillingDateFromSeconds(livePaidPlan.current_period_end ?? null)
    : null;
  const deleteBlockedByPlan =
    livePaidPlan !== null && subscriptionAccessRank(livePaidPlan.status) !== 2;
  const endingPaidPlan = !deleteBlockedByPlan && livePaidPlan?.cancel_at_period_end === true;
  const renewingPlanSource =
    livePaidPlan && !deleteBlockedByPlan && !endingPaidPlan
      ? (livePaidPlan.subscription_source ?? null)
      : null;
  const renewingStore = isStoreBillingSource(renewingPlanSource) ? renewingPlanSource : null;
  const deletedReceiptStore = deleteAccountMutation.data?.storeBilling ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {confirmDialog}

      {showApiKeys ? (
        <>
          <button type="button" onClick={() => setShowApiKeys(false)} style={backRowStyle}>
            <ChevronLeft size={16} aria-hidden="true" />
            API keys
          </button>
          <ApiKeysManager />
        </>
      ) : (
        <>
          <h1 style={titleStyle}>Account</h1>
          <HelpArticleLink docId="account-security" label="Sessions, email and API keys" />

          <div>
            <AccountRow label="Email" hint={currentEmail ?? 'No email address on this account.'}>
              <button
                type="button"
                aria-label="Change email address"
                onClick={() => setShowEmailChange(true)}
                style={outlineButtonStyle}
              >
                Change
              </button>
            </AccountRow>

            <button
              type="button"
              onClick={() => setShowApiKeys(true)}
              style={chevronRowStyle}
              aria-label="API keys"
            >
              <span style={rowLabelStyle}>API keys</span>
              <ChevronRight size={16} aria-hidden="true" color="var(--text-3)" />
            </button>

            {pendingDeletion ? (
              <AccountRow
                label="Account deletion scheduled"
                labelTestId="pending-deletion-title"
                hint={`Cancellation deadline: ${formatDateTime(
                  deletionStatus.data?.scheduledFor
                    ? new Date(deletionStatus.data.scheduledFor)
                    : null,
                )}. ${
                  deletionStatus.data?.canCancel
                    ? deletionStatus.data.cancellationPrecondition === 'schedule-pair-v1'
                      ? 'You can cancel any time before then.'
                      : 'Protected cancellation is unavailable. Check the current status again before cancelling.'
                    : 'The cancellation window has closed.'
                } Erasure is processed after the deadline and may take longer.`}
              >
                {deletionStatus.data?.canCancel && !canCancelDeletion && (
                  <button
                    type="button"
                    disabled={deletionStatus.isFetching}
                    style={outlineButtonStyle}
                    onClick={() => {
                      void deletionStatus.refetch();
                    }}
                  >
                    Check current status
                  </button>
                )}
                {deletionStatus.data?.canCancel && (
                  <button
                    type="button"
                    data-testid="cancel-deletion-trigger"
                    disabled={!canCancelDeletion || deletionStatus.isFetching}
                    onClick={() => {
                      if (!permitsDeletionAction(renderedDeletionStatus, 'cancel')) return;
                      setCancelIntent(cancelDeletionMutation.begin(renderedDeletionStatus));
                    }}
                    style={outlineButtonStyle}
                  >
                    <Undo2 size={14} />
                    Cancel deletion
                  </button>
                )}
              </AccountRow>
            ) : (
              <AccountRow
                label="Delete account"
                hintId="delete-account-hint"
                hint={
                  deleteBlockedByPlan ? (
                    <span data-testid="delete-account-plan-note">
                      {`A ${livePlanLabel} payment is still being collected. You can delete once it settles.`}
                    </span>
                  ) : endingPaidPlan ? (
                    <span data-testid="delete-account-plan-note">
                      {`Deleting ends your cancelled ${livePlanLabel} plan at erasure${livePlanEnds ? `, not ${livePlanEnds}` : ''}. Unused time is not refunded.`}
                    </span>
                  ) : renewingStore ? (
                    <span data-testid="delete-account-plan-note">
                      {`Deleting does not cancel your ${livePlanLabel} plan. ${STORE_BILLING_NAME[renewingStore]} keeps charging until you `}
                      <a
                        href={STORE_SUBSCRIPTION_MANAGEMENT_URL[renewingStore]}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--text-1)', textDecoration: 'underline' }}
                      >
                        cancel it there
                      </a>
                      .
                    </span>
                  ) : renewingPlanSource === 'stripe' ? (
                    <span data-testid="delete-account-plan-note">
                      {`Deleting stops your ${livePlanLabel} plan renewing and ends it at erasure${livePlanEnds ? `, not ${livePlanEnds}` : ''}. Unused time is not refunded.`}
                    </span>
                  ) : (
                    'Schedule permanent account deletion. You can cancel before the deadline.'
                  )
                }
              >
                <button
                  type="button"
                  data-testid="delete-account-trigger"
                  aria-describedby="delete-account-hint"
                  disabled={
                    !canScheduleDeletion ||
                    deletionStatus.isFetching ||
                    deletionStatus.isLoading ||
                    deletionStatus.isError ||
                    !billingInitialized ||
                    deleteBlockedByPlan
                  }
                  onClick={() => {
                    if (!permitsDeletionAction(renderedDeletionStatus, 'schedule')) return;
                    setDeleteStatusSnapshot(renderedDeletionStatus ?? null);
                    setDeleteConfirmInput('');
                    deleteAccountMutation.reset();
                    setShowDeleteDialog(true);
                  }}
                  style={deleteBlockedByPlan ? blockedDangerButtonStyle : dangerButtonStyle}
                >
                  Delete
                </button>
              </AccountRow>
            )}
            {(deletionStatus.isError || deletionStatus.isInvalidated) && (
              <p role="alert" style={{ ...errorTextStyle, padding: 'var(--space-3) 0 0' }}>
                {deletionStatus.isError
                  ? 'Could not check whether a deletion is already pending. '
                  : 'Deletion status needs to be checked again. '}
                <button
                  type="button"
                  onClick={() => void deletionStatus.refetch()}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'inherit',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                >
                  Retry
                </button>
              </p>
            )}

            <div
              style={{
                padding: 'var(--space-4) 0',
                borderBottom: '1px solid var(--settings-border)',
              }}
            >
              <CopyableIdField
                id="user-id-field"
                label="User ID"
                value={userId}
                copyLabel="Copy user ID"
                hint="Share this with support when reporting a problem."
              />
            </div>

            {/*
              Organization ID, matching what claude.ai shows beside the user id.
              Rendered only when the account is actually in an organization.
              "Not available" for a solo account would imply something failed to
              load rather than that there is nothing to show.
            */}
            {organizationId ? (
              <div
                style={{
                  padding: 'var(--space-4) 0',
                  borderBottom: '1px solid var(--settings-border)',
                }}
              >
                <CopyableIdField
                  id="organization-id-field"
                  label="Organization ID"
                  value={organizationId}
                  copyLabel="Copy organization ID"
                  hint="Support asks for this before workspace-wide changes."
                />
              </div>
            ) : null}
          </div>

          <LinkedDevicesPanel />

          <div>
            <h2 style={sectionHeadingStyle}>Active sessions</h2>

            {sessionsLoading ? (
              <div
                role="status"
                style={{ padding: 'var(--space-2) 0', fontSize: 14, color: 'var(--text-3)' }}
              >
                Loading active sessions…
              </div>
            ) : sessionsError ? (
              <div>
                <p role="alert" style={{ ...errorTextStyle, margin: '0 0 var(--space-3)' }}>
                  {sessionsError}
                </p>
                <button
                  type="button"
                  onClick={() => void loadSessions()}
                  style={outlineButtonStyle}
                >
                  <RefreshCw size={13} />
                  Retry
                </button>
              </div>
            ) : sessions.length === 0 ? (
              <p
                style={{
                  padding: 'var(--space-2) 0',
                  fontSize: 14,
                  color: 'var(--text-3)',
                  margin: 0,
                }}
              >
                No active sessions found.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--settings-border)' }}>
                      {[
                        { label: 'Device', className: undefined },
                        { label: 'Location', className: 'hidden sm:table-cell' },
                        { label: 'Created', className: 'hidden sm:table-cell' },
                        { label: 'Last active', className: 'hidden sm:table-cell' },
                        { label: '', className: undefined },
                      ].map(({ label, className }, index) => (
                        <th
                          key={label || `actions-${index}`}
                          scope="col"
                          className={className}
                          style={{
                            padding: '0 var(--space-4) var(--space-3) 0',
                            textAlign: 'left',
                            fontSize: 14,
                            fontWeight: 400,
                            color: 'var(--text-3)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {label || <span className="sr-only">Actions</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((row, idx) => (
                      <tr
                        key={row.id}
                        style={{
                          borderBottom:
                            idx < sessions.length - 1 ? '1px solid var(--settings-border)' : 'none',
                        }}
                      >
                        <td
                          style={{
                            padding: 'var(--space-3) var(--space-4) var(--space-3) 0',
                            color: 'var(--text-1)',
                            fontWeight: 500,
                          }}
                        >
                          <div>{row.device}</div>
                          {row.browser ? (
                            <div
                              style={{
                                marginTop: 'var(--space-1)',
                                color: 'var(--text-3)',
                                fontSize: 14,
                                fontWeight: 400,
                              }}
                            >
                              {row.browser}
                            </div>
                          ) : null}
                          {row.isCurrent && (
                            <span
                              style={{
                                marginLeft: 'var(--space-2)',
                                fontSize: 14,
                                fontWeight: 500,
                                color: 'var(--teal-text)',
                                background: 'rgba(33,128,141,0.12)',
                                borderRadius: 'var(--corner-compact)',
                                padding: 'var(--space-1) var(--space-1)',
                              }}
                            >
                              Current
                            </span>
                          )}
                          <dl
                            data-testid={`mobile-session-details-${row.id}`}
                            className="mt-2 space-y-0.5 text-sm font-normal text-muted-foreground sm:hidden"
                          >
                            <div>
                              <dt className="inline font-medium">Location</dt>
                              <dd className="inline"> {row.location ?? 'Not available'}</dd>
                            </div>
                            <div>
                              <dt className="inline font-medium">Created</dt>
                              <dd className="inline"> {formatSessionDateTime(row.createdAt)}</dd>
                            </div>
                            <div>
                              <dt className="inline font-medium">Last active</dt>
                              <dd className="inline"> {formatSessionDateTime(row.lastActiveAt)}</dd>
                            </div>
                          </dl>
                        </td>
                        <td
                          className="hidden sm:table-cell"
                          style={{
                            padding: 'var(--space-3) var(--space-4) var(--space-3) 0',
                            color: 'var(--text-3)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.location ?? 'Not available'}
                        </td>
                        <td
                          className="hidden sm:table-cell"
                          style={{
                            padding: 'var(--space-3) var(--space-4) var(--space-3) 0',
                            color: 'var(--text-3)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatSessionDateTime(row.createdAt)}
                        </td>
                        <td
                          className="hidden sm:table-cell"
                          style={{
                            padding: 'var(--space-3) var(--space-4) var(--space-3) 0',
                            color: 'var(--text-3)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatSessionDateTime(row.lastActiveAt)}
                        </td>
                        <td style={{ padding: 'var(--space-3) 0', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() =>
                              confirm({
                                title: row.isCurrent
                                  ? 'Log out this session?'
                                  : `Revoke the ${row.device} session?`,
                                description: row.isCurrent
                                  ? 'You will be signed out on this device and returned to the sign-in page.'
                                  : 'That device is signed out immediately and has to sign in again to regain access.',
                                confirmLabel: row.isCurrent ? 'Log out' : 'Revoke session',
                                onConfirm: () => handleRevokeSession(row),
                              })
                            }
                            disabled={revokingSessionId !== null}
                            aria-label={
                              row.isCurrent
                                ? 'Log out current session'
                                : `Revoke ${row.device} session`
                            }
                            style={{
                              padding: 'var(--space-2) var(--space-3)',
                              fontSize: 14,
                              fontWeight: 500,
                              // The fill value, not the text one: in dark it is
                              // 0 62.8% 30.6%, which measured 1.77:1 on the panel
                              // behind it. --settings-destructive-text is the role
                              // for a word on the page, and line 324 already uses it.
                              color: row.isCurrent
                                ? 'var(--text-2)'
                                : 'var(--settings-destructive-text)',
                              background: 'transparent',
                              border: '1px solid var(--settings-border)',
                              borderRadius: 'var(--radius-md)',
                              cursor: revokingSessionId !== null ? 'default' : 'pointer',
                              opacity:
                                revokingSessionId !== null && revokingSessionId !== row.id
                                  ? 0.5
                                  : 1,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {revokingSessionId === row.id
                              ? 'Ending…'
                              : row.isCurrent
                                ? 'Log out'
                                : 'Revoke'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {sessionActionError ? (
              <p role="alert" style={{ ...errorTextStyle, padding: 'var(--space-3) 0 0' }}>
                {sessionActionError}
              </p>
            ) : null}
            {sessionsTruncated ? (
              <p
                role="status"
                style={{
                  padding: 'var(--space-3) 0 0',
                  fontSize: 14,
                  color: 'var(--text-2)',
                  margin: 0,
                }}
              >
                {`Showing ${sessions.length} of ${sessionTotalCount} sessions.`}{' '}
                {SESSION_TRUNCATION_HINT}
              </p>
            ) : null}
            <p
              style={{
                padding: 'var(--space-3) 0 0',
                fontSize: 12,
                color: 'var(--text-3)',
                margin: 0,
              }}
            >
              Sessions are reported by your account provider across devices. Revoke anything you do
              not recognize, or log out of all devices in{' '}
              <SettingsSectionLink
                section="security"
                style={{ color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
              >
                Security
              </SettingsSectionLink>
              .
            </p>
          </div>

          <RecentActivityPanel />
        </>
      )}

      {/* Deletion confirmation dialog */}
      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (!deleteAccountMutation.isPending && !deleteAccountMutation.isSuccess) {
            setShowDeleteDialog(open);
          }
        }}
      >
        <AlertDialogContent>
          {deleteAccountMutation.isSuccess ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle data-testid="delete-account-success-title">
                  Account deletion scheduled
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteAccountMutation.data?.message ??
                    'Your account deletion has been scheduled. Choose Continue to sign out.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {deleteAccountMutation.data?.scheduledFor && (
                <p
                  style={{
                    fontSize: 14,
                    color: 'var(--text-3)',
                    margin: 'calc(var(--space-2) * -1) 0 0',
                  }}
                >
                  Cancellation deadline:{' '}
                  {formatDateTime(new Date(deleteAccountMutation.data.scheduledFor))}. Sign back in
                  and cancel from Settings &gt; Account any time before then to keep your account.
                  Erasure is processed after the deadline and may take longer. Choose Continue to
                  sign out.
                </p>
              )}
              {deletedReceiptStore && (
                <a
                  data-testid="delete-account-store-billing-link"
                  href={deletedReceiptStore.manageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 14, color: 'var(--text-1)', textDecoration: 'underline' }}
                >
                  {`Cancel your subscription in ${STORE_BILLING_NAME[deletedReceiptStore.store]}`}
                </a>
              )}
              <AlertDialogFooter>
                <AlertDialogAction
                  data-testid="delete-account-success-continue"
                  onClick={(e) => {
                    e.preventDefault();
                    handleDeleteSuccessContinue();
                  }}
                >
                  Continue
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This schedules your account and Cloud chats, projects, memory and artifacts for
                  permanent deletion. You can cancel before the deadline shown after scheduling.
                  Erasure is processed after that deadline and may take longer. Anything the law or
                  an active legal hold requires us to keep is kept. Choose Continue after scheduling
                  to sign out. If you change your mind, sign back in and cancel from Settings &gt;
                  Account before the cancellation deadline.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-1">
                <label
                  htmlFor="account-delete-confirm-input"
                  className="mb-2 block text-sm text-foreground"
                >
                  Type <strong>DELETE</strong> to confirm:
                </label>
                <input
                  id="account-delete-confirm-input"
                  type="text"
                  value={deleteConfirmInput}
                  onChange={(e) => setDeleteConfirmInput(e.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                  data-testid="delete-confirm-input"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                />
                {deleteAccountMutation.error && !isStepUpCancelled(deleteAccountMutation.error) && (
                  <p className="mt-2 text-sm text-danger">
                    {toUserMessage(deleteAccountMutation.error, 'Account deletion failed.')}
                  </p>
                )}
              </div>
              <AlertDialogFooter>
                {!deleteAccountMutation.isPending &&
                  !permitsDeletionAction(deleteStatusSnapshot, 'schedule') && (
                    <p role="alert" className="text-sm text-danger">
                      Deletion status changed. Close this dialog, check the current status, and
                      reopen the confirmation.
                    </p>
                  )}
                <AlertDialogCancel disabled={deleteAccountMutation.isPending}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  data-testid="delete-account-confirm"
                  onClick={(e) => {
                    e.preventDefault();
                    handleDeleteAccount();
                  }}
                  disabled={
                    deleteConfirmInput !== 'DELETE' ||
                    deleteAccountMutation.isPending ||
                    !permitsDeletionAction(deleteStatusSnapshot, 'schedule')
                  }
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  {deleteAccountMutation.isPending ? 'Scheduling…' : 'Schedule deletion'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {deleteAccountMutation.stepUpDialog}
      {showEmailChange !== null ? (
        <EmailAddressChange
          active={emailEditorActive && showEmailChange}
          accountId={userId}
          currentEmail={currentEmail}
          onChanged={(email, completion) => {
            if (!completion.isCurrent()) return;
            const latest = useAuthStore.getState();
            if (latest.user?.id !== completion.accountId || !completion.isCurrent()) return;
            latest.updateUser({ ...latest.user, email });
          }}
          onClose={() => setShowEmailChange(false)}
        />
      ) : null}

      {/* Cancel-deletion confirmation dialog */}
      <AlertDialog
        open={
          cancelIntent?.isCurrent() === true &&
          (!cancelDeletionMutation.isSuccess || cancelDeletionMutation.needsStatusCheck)
        }
        onOpenChange={(open) => {
          if (!open && !cancelDeletionMutation.isPending) cancelIntent?.dismiss();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel account deletion?</AlertDialogTitle>
            <AlertDialogDescription>
              Cancel the currently scheduled deletion before its cancellation deadline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancelDeletionMutation.error && (
            <p className="text-sm text-danger">
              {toUserMessage(cancelDeletionMutation.error, 'Could not cancel account deletion.')}
            </p>
          )}
          {cancelDeletionMutation.needsStatusCheck && (
            <p role="status" className="text-sm text-muted-foreground">
              {cancelDeletionMutation.data
                ? cancelDeletionMutation.data.cancelled
                  ? 'The cancellation request completed.'
                  : 'The server reported no pending deletion for this request.'
                : 'Cancellation has not been confirmed.'}{' '}
              Check the current status before taking another action. A new confirmation is required
              to try cancellation again.
            </p>
          )}
          <AlertDialogFooter>
            {!cancelDeletionMutation.isPending &&
              !cancelDeletionMutation.isSuccess &&
              !cancelIntent?.canConfirm() && (
                <p role="alert" className="text-sm text-danger">
                  A fresh confirmation is required. Close this dialog, check the current status, and
                  reopen the confirmation.
                </p>
              )}
            <AlertDialogCancel disabled={cancelDeletionMutation.isPending}>
              {cancelDeletionMutation.isSuccess || cancelDeletionMutation.error
                ? 'Close'
                : 'Keep deletion scheduled'}
            </AlertDialogCancel>
            {cancelDeletionMutation.needsStatusCheck ? (
              <AlertDialogAction
                disabled={cancelDeletionMutation.isCheckingStatus}
                onClick={(e) => {
                  e.preventDefault();
                  void cancelIntent?.checkCurrentStatus();
                }}
              >
                {cancelDeletionMutation.isCheckingStatus ? 'Checking…' : 'Check current status'}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                data-testid="cancel-deletion-confirm"
                onClick={(e) => {
                  e.preventDefault();
                  cancelIntent?.confirm();
                }}
                disabled={cancelDeletionMutation.isPending || !cancelIntent?.canConfirm()}
              >
                {cancelDeletionMutation.isPending ? 'Cancelling…' : 'Cancel deletion'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
