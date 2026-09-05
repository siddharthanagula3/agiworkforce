'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSignOut } from '@/lib/identity/client';
import { LogOut, RefreshCw, Trash2, Undo2 } from 'lucide-react';
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
import { addCsrfHeaders } from '@/lib/client/csrf';
import { TimeoutPresets } from '@shared/lib/error-utils';
import { ApiKeysManager } from '../components/Settings/ApiKeys';
import { LinkedDevicesPanel } from '../components/LinkedDevicesPanel';
import { CopyableIdField } from '../components/CopyableIdField';
import {
  useOrganizationOverview,
  useDeleteAccount,
  useAccountDeletionStatus,
  useCancelAccountDeletion,
} from '../hooks/use-settings-queries';
import { toUserMessage } from '@/lib/user-error-message';

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return ', ';
  return value.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

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
  if (!value) return ', ';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? ', ' : formatDateTime(date);
}

function readApiError(data: unknown, fallback: string): string {
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

export function AccountSection() {
  // Reads the Clerk-backed auth store. PER-3: `useBillingStore.user` used to be
  // structurally null (its only writer, `_setUser`, had zero call sites); that
  // is fixed and `_setUser` is gone, but this section wants the auth store's
  // `logout()` anyway, so it keeps reading the user from the same store.
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const identitySignOut = useSignOut();
  const router = useRouter();

  const userId = user?.id ?? null;
  const organizationId = useOrganizationOverview().data?.organization?.id ?? null;

  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionActionError, setSessionActionError] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);

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
      if (!signal?.aborted) setSessions(rows as AccountSession[]);
    } catch (error) {
      if (signal?.aborted) return;
      setSessionsError(
        timeoutSignal.aborted
          ? 'Active sessions took too long to load. Please try again.'
          : error instanceof Error
            ? error.message
            : 'Unable to load active sessions.',
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

  const handleLogOutAll = useCallback(async () => {
    setLoggingOut(true);
    setLogoutError(null);
    let sessionsRevoked = false;
    try {
      const headers = await addCsrfHeaders();
      const response = await fetch('/api/settings/sessions', { method: 'DELETE', headers });
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readApiError(data, 'Unable to log out every device.'));
      sessionsRevoked = true;
      await logout();
      await identitySignOut({ redirectUrl: '/login' });
    } catch (err) {
      if (sessionsRevoked) {
        router.replace('/login');
        return;
      }
      setLogoutError(toUserMessage(err, 'Sign out failed.'));
      setLoggingOut(false);
    }
  }, [logout, identitySignOut, router]);

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
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const deleteAccountMutation = useDeleteAccount();

  const handleDeleteAccount = useCallback(() => {
    deleteAccountMutation.mutate();
  }, [deleteAccountMutation]);

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
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const deletionStatus = useAccountDeletionStatus();
  const cancelDeletionMutation = useCancelAccountDeletion();

  const handleCancelDeletion = useCallback(() => {
    cancelDeletionMutation.mutate(undefined, {
      onSuccess: () => setShowCancelDialog(false),
    });
  }, [cancelDeletionMutation]);

  const pendingDeletion = deletionStatus.data?.pending === true;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {confirmDialog}
      <div>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 4px',
          }}
        >
          Account
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          Session management and account security.
        </p>
      </div>

      {/* Account-wide session control */}
      <section
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--settings-border)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
          }}
        >
          Sessions
        </div>
        <div
          style={{
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', margin: '0 0 4px' }}>
              Log out of all devices
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
              This will end all active sessions including this one.
            </p>
          </div>
          <button
            type="button"
            aria-label="Log out of all devices"
            onClick={() =>
              confirm({
                title: 'Log out of all devices?',
                description:
                  'Every signed-in session on every device ends immediately, including this one. You will need to sign in again.',
                confirmLabel: 'Log out everywhere',
                onConfirm: () => handleLogOutAll(),
              })
            }
            disabled={loggingOut}
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-1)',
              background: 'transparent',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius-md)',
              cursor: loggingOut ? 'default' : 'pointer',
              opacity: loggingOut ? 0.5 : 1,
            }}
          >
            <LogOut size={14} />
            {loggingOut ? 'Signing out...' : 'Log out'}
          </button>
        </div>
        {logoutError && (
          <div
            style={{
              padding: '0 20px 16px',
              fontSize: 12,
              color: 'var(--settings-destructive-text)',
            }}
          >
            {logoutError}
          </div>
        )}
      </section>

      <ApiKeysManager />

      {/* Delete account, real, working flow (confirm dialog -> DELETE /api/user/delete-account) */}
      <section
        style={{
          border: '1px solid var(--settings-destructive)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--settings-destructive)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--settings-destructive-text)',
          }}
        >
          Danger Zone
        </div>
        {pendingDeletion ? (
          <div
            style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div>
              <p
                data-testid="pending-deletion-title"
                style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', margin: '0 0 4px' }}
              >
                Account deletion scheduled
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
                Your account and all data will be permanently erased on{' '}
                {formatDateTime(
                  deletionStatus.data?.scheduledFor
                    ? new Date(deletionStatus.data.scheduledFor)
                    : null,
                )}
                .{' '}
                {deletionStatus.data?.canCancel
                  ? 'You can cancel any time before then.'
                  : 'The cancellation window has closed and erasure is already underway.'}
              </p>
            </div>
            {deletionStatus.data?.canCancel && (
              <button
                type="button"
                data-testid="cancel-deletion-trigger"
                onClick={() => {
                  cancelDeletionMutation.reset();
                  setShowCancelDialog(true);
                }}
                style={{
                  alignSelf: 'flex-start',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-1)',
                  background: 'transparent',
                  border: '1px solid var(--settings-border)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                }}
              >
                <Undo2 size={14} />
                Cancel deletion
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <p
                style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', margin: '0 0 4px' }}
              >
                Delete account
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
                To delete your account and all associated data, confirm below. This cannot be
                undone.
              </p>
              {deletionStatus.isError && (
                <p
                  role="alert"
                  style={{
                    fontSize: 12,
                    color: 'var(--settings-destructive-text)',
                    margin: '6px 0 0',
                  }}
                >
                  Could not check whether a deletion is already pending.{' '}
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
            </div>
            <button
              type="button"
              data-testid="delete-account-trigger"
              disabled={deletionStatus.isLoading}
              onClick={() => {
                setDeleteConfirmInput('');
                deleteAccountMutation.reset();
                setShowDeleteDialog(true);
              }}
              style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--settings-destructive-foreground)',
                background: 'var(--settings-destructive)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
              }}
            >
              <Trash2 size={14} />
              Delete account
            </button>
          </div>
        )}
      </section>

      {/* Account identifier */}
      <section
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--settings-border)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
          }}
        >
          Account identifier
        </div>
        <div style={{ padding: '20px' }}>
          <CopyableIdField
            id="user-id-field"
            label="User ID"
            value={userId}
            copyLabel="Copy user ID"
            hint="Your account identifier. Share with support when reporting issues."
          />

          {/*
            Organization ID, matching what claude.ai shows beside the user id.
            Rendered only when the account is actually in an organization.
            "Not available" for a solo account would imply something failed to
            load rather than that there is nothing to show.
          */}
          {organizationId ? (
            <div style={{ marginTop: 20 }}>
              <CopyableIdField
                id="organization-id-field"
                label="Organization ID"
                value={organizationId}
                copyLabel="Copy organization ID"
                hint="Identifies your workspace. Support will ask for this before anything workspace-wide."
              />
            </div>
          ) : null}
        </div>
      </section>

      <LinkedDevicesPanel />

      {/* Active sessions table */}
      <section
        style={{
          border: '1px solid var(--settings-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--settings-border)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-2)',
          }}
        >
          Active sessions
        </div>

        {sessionsLoading ? (
          <div role="status" style={{ padding: '20px', fontSize: 13, color: 'var(--text-3)' }}>
            Loading active sessions…
          </div>
        ) : sessionsError ? (
          <div style={{ padding: '20px' }}>
            <p
              role="alert"
              style={{
                margin: '0 0 12px',
                fontSize: 13,
                color: 'var(--settings-destructive-text)',
              }}
            >
              {sessionsError}
            </p>
            <button
              type="button"
              onClick={() => void loadSessions()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 11px',
                fontSize: 12,
                color: 'var(--text-1)',
                background: 'transparent',
                border: '1px solid var(--settings-border)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={13} />
              Retry
            </button>
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: '20px', fontSize: 13, color: 'var(--text-3)' }}>
            No active sessions found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--settings-border)',
                    background: 'var(--bg-hover, rgba(255,255,255,0.03))',
                  }}
                >
                  {['Device', 'Location', 'Created', 'Last active', ''].map((col, index) => (
                    <th
                      key={col || `actions-${index}`}
                      scope="col"
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'var(--text-3)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col || <span className="sr-only">Actions</span>}
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
                    <td style={{ padding: '12px 16px', color: 'var(--text-1)', fontWeight: 500 }}>
                      <div>{row.device}</div>
                      {row.browser ? (
                        <div
                          style={{
                            marginTop: 2,
                            color: 'var(--text-3)',
                            fontSize: 12,
                            fontWeight: 400,
                          }}
                        >
                          {row.browser}
                        </div>
                      ) : null}
                      {row.isCurrent && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            color: 'var(--teal-text)',
                            background: 'rgba(33,128,141,0.12)',
                            borderRadius: 3,
                            padding: '1px 5px',
                          }}
                        >
                          Current
                        </span>
                      )}
                    </td>
                    <td
                      style={{ padding: '12px 16px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}
                    >
                      {row.location ?? 'Not available'}
                    </td>
                    <td
                      style={{ padding: '12px 16px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}
                    >
                      {formatSessionDateTime(row.createdAt)}
                    </td>
                    <td
                      style={{ padding: '12px 16px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}
                    >
                      {formatSessionDateTime(row.lastActiveAt)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
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
                        disabled={revokingSessionId !== null || loggingOut}
                        aria-label={
                          row.isCurrent ? 'Log out current session' : `Revoke ${row.device} session`
                        }
                        style={{
                          padding: '6px 10px',
                          fontSize: 12,
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
                          cursor: revokingSessionId !== null || loggingOut ? 'default' : 'pointer',
                          opacity:
                            revokingSessionId !== null && revokingSessionId !== row.id ? 0.5 : 1,
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
          <p
            role="alert"
            style={{
              padding: '0 20px 12px',
              fontSize: 12,
              color: 'var(--settings-destructive-text)',
              margin: 0,
            }}
          >
            {sessionActionError}
          </p>
        ) : null}
        <p style={{ padding: '12px 20px 16px', fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
          Sessions are reported by your account provider across devices. Revoke anything you do not
          recognize, or use &ldquo;Log out of all devices&rdquo; above.
        </p>
      </section>

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
                    'Your account deletion has been scheduled. You will be signed out now.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {deleteAccountMutation.data?.scheduledFor && (
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '-8px 0 0' }}>
                  Your data is permanently erased on{' '}
                  {formatDateTime(new Date(deleteAccountMutation.data.scheduledFor))}. Sign back in
                  and cancel from Settings &gt; Account any time before then to keep your account.
                </p>
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
                  This permanently deletes your account and all associated data. You are signed out
                  now, and erasure runs 24 hours after you confirm. If you change your mind, sign
                  back in and cancel from Settings &gt; Account any time before then.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-1">
                <label
                  htmlFor="account-delete-confirm-input"
                  className="mb-2 block text-[13px] text-foreground"
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
                {deleteAccountMutation.error && (
                  <p className="mt-2 text-xs text-danger">{deleteAccountMutation.error.message}</p>
                )}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteAccountMutation.isPending}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  data-testid="delete-account-confirm"
                  onClick={(e) => {
                    e.preventDefault();
                    handleDeleteAccount();
                  }}
                  disabled={deleteConfirmInput !== 'DELETE' || deleteAccountMutation.isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  {deleteAccountMutation.isPending ? 'Deleting...' : 'Delete account'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel-deletion confirmation dialog */}
      <AlertDialog
        open={showCancelDialog}
        onOpenChange={(open) => {
          if (!cancelDeletionMutation.isPending) setShowCancelDialog(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel account deletion?</AlertDialogTitle>
            <AlertDialogDescription>
              Your account will stay active and none of your data will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {cancelDeletionMutation.error && (
            <p className="text-xs text-danger">{cancelDeletionMutation.error.message}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelDeletionMutation.isPending}>
              Keep deletion scheduled
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="cancel-deletion-confirm"
              onClick={(e) => {
                e.preventDefault();
                handleCancelDeletion();
              }}
              disabled={cancelDeletionMutation.isPending}
            >
              {cancelDeletionMutation.isPending ? 'Cancelling…' : 'Cancel deletion'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
