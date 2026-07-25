'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClerk, useSession } from '@clerk/nextjs';
import { Copy, Check, LogOut, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@agiworkforce/ui';
import { useAuthStore } from '@shared/stores/authentication-store';
import { addCsrfHeaders } from '@/lib/client/csrf';

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return '—';
  return value.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function AccountSection() {
  // Reads the Clerk-backed auth store. PER-3: `useBillingStore.user` used to be
  // structurally null (its only writer, `_setUser`, had zero call sites); that
  // is fixed and `_setUser` is gone, but this section wants the auth store's
  // `logout()` anyway, so it keeps reading the user from the same store.
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { signOut: clerkSignOut } = useClerk();
  // Live Clerk session — the source for the current device's real timestamps.
  const { session } = useSession();
  const router = useRouter();

  const orgId = user?.id ?? null;
  const [copied, setCopied] = useState(false);

  const handleCopyOrgId = useCallback(async () => {
    if (!orgId) return;
    try {
      await navigator.clipboard.writeText(orgId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable in some contexts; fail silently.
    }
  }, [orgId]);

  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogOutAll = useCallback(async () => {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      // Use the SAME sign-out path as the sidebar's "Log out" (useAuthStore.logout()
      // followed by Clerk's signOut). useAuthStore.logout() calls cleanupAllStores(),
      // which clears the per-user localStorage-backed stores. Clerk's signOut with no
      // sessionId ends all sessions for this browser.
      await logout();
      await clerkSignOut({ redirectUrl: '/login' });
    } catch (err) {
      setLogoutError(err instanceof Error ? err.message : 'Sign out failed.');
      setLoggingOut(false);
    }
  }, [logout, clerkSignOut]);

  // ── Delete account (canonical, working flow on this surface) ───────────────
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSucceeded, setDeleteSucceeded] = useState(false);
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState<string | null>(null);

  const handleDeleteAccount = useCallback(async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const headers = await addCsrfHeaders({ 'Content-Type': 'application/json' });
      const res = await fetch('/api/user/delete-account', { method: 'DELETE', headers });
      const data: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data !== null && typeof data === 'object' && 'error' in data
            ? String((data as { error?: unknown }).error)
            : 'Account deletion failed.';
        throw new Error(msg);
      }
      const serverMessage =
        data !== null && typeof data === 'object' && 'message' in data
          ? String((data as { message?: unknown }).message)
          : null;
      setDeleteSuccessMessage(
        serverMessage ?? 'Your account deletion has been scheduled. You will be signed out now.',
      );
      setIsDeleting(false);
      setDeleteSucceeded(true);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Account deletion failed.');
      setIsDeleting(false);
    }
  }, []);

  const handleDeleteSuccessContinue = useCallback(() => {
    setShowDeleteDialog(false);
    void (async () => {
      try {
        await logout();
        await clerkSignOut({ redirectUrl: '/' });
      } catch (err) {
        // The account is already deleted server-side at this point (this
        // handler only runs after handleDeleteAccount succeeded) — if
        // logout()/clerkSignOut() fail here (e.g. a network blip), fall back
        // to a hard navigation instead of leaving the user stuck on a dead
        // settings screen with no feedback and no way to reach '/'.
        console.warn('[Account] Post-deletion sign-out failed, forcing navigation:', err);
      } finally {
        router.replace('/');
      }
    })();
  }, [logout, clerkSignOut, router]);

  // Current-session row derived from the live Clerk session. We do NOT invent
  // extra device rows: Clerk's client SDK only exposes the active session, so
  // showing more would be fabricated. Location is intentionally omitted (no
  // geo-IP signal on the client) rather than filled with a fake value.
  const sessionRows: Array<{
    device: string;
    created: string;
    updated: string;
    isCurrent: boolean;
  }> = session
    ? [
        {
          device: getDeviceLabel(),
          created: formatDateTime(session.createdAt),
          updated: formatDateTime(session.lastActiveAt),
          isCurrent: true,
        },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <div>
        <h1
          style={{
            fontFamily: 'var(--serif)',
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

      {/* Log out of all devices */}
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
            onClick={() => void handleLogOutAll()}
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
            style={{ padding: '0 20px 16px', fontSize: 12, color: 'var(--settings-destructive)' }}
          >
            {logoutError}
          </div>
        )}
      </section>

      {/* Delete account — real, working flow (confirm dialog -> DELETE /api/user/delete-account) */}
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
            color: 'var(--settings-destructive)',
          }}
        >
          Danger Zone
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
              Delete account
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
              To delete your account and all associated data, confirm below. This cannot be undone.
            </p>
          </div>
          <button
            type="button"
            data-testid="delete-account-trigger"
            onClick={() => {
              setDeleteConfirmInput('');
              setDeleteError(null);
              setDeleteSucceeded(false);
              setDeleteSuccessMessage(null);
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
      </section>

      {/* Organization / User ID */}
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
          Organization
        </div>
        <div style={{ padding: '20px' }}>
          <label
            htmlFor="org-id-field"
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-2)',
              marginBottom: 8,
            }}
          >
            Organization ID
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              id="org-id-field"
              type="text"
              readOnly
              value={orgId ?? 'Not available'}
              style={{
                flex: 1,
                fontSize: 13,
                fontFamily: 'var(--mono)',
                padding: '8px 12px',
                background: 'var(--bg-base, #09090b)',
                color: 'var(--text-3)',
                border: '1px solid var(--settings-border)',
                borderRadius: 'var(--radius-md)',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            />
            <button
              type="button"
              onClick={() => void handleCopyOrgId()}
              disabled={!orgId}
              aria-label="Copy organization ID"
              title="Copy"
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 34,
                height: 34,
                padding: 0,
                background: 'transparent',
                border: '1px solid var(--settings-border)',
                borderRadius: 'var(--radius-md)',
                color: copied ? 'var(--teal, #21808d)' : 'var(--text-3)',
                cursor: orgId ? 'pointer' : 'not-allowed',
                opacity: orgId ? 1 : 0.4,
                transition: 'color 0.15s',
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '8px 0 0' }}>
            Your account identifier. Share with support when reporting issues.
          </p>
        </div>
      </section>

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

        {sessionRows.length === 0 ? (
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
                  {['Device', 'Created', 'Last active'].map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: 'var(--text-3)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessionRows.map((row, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom:
                        idx < sessionRows.length - 1 ? '1px solid var(--settings-border)' : 'none',
                    }}
                  >
                    <td style={{ padding: '12px 16px', color: 'var(--text-1)', fontWeight: 500 }}>
                      {row.device}
                      {row.isCurrent && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            color: 'var(--teal, #21808d)',
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
                      {row.created}
                    </td>
                    <td
                      style={{ padding: '12px 16px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}
                    >
                      {row.updated}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ padding: '12px 20px 16px', fontSize: 11, color: 'var(--text-3)', margin: 0 }}>
          Showing the session for this device. Use &ldquo;Log out of all devices&rdquo; above to end
          every active session.
        </p>
      </section>

      {/* Deletion confirmation dialog */}
      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (!isDeleting && !deleteSucceeded) setShowDeleteDialog(open);
        }}
      >
        <AlertDialogContent>
          {deleteSucceeded ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle data-testid="delete-account-success-title">
                  Account deletion scheduled
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteSuccessMessage ??
                    'Your account deletion has been scheduled. You will be signed out now.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
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
                  This will permanently delete your account and all associated data. There is a
                  24-hour grace window before deletion completes. After that, this action cannot be
                  reversed.
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
                {deleteError !== null && (
                  <p className="mt-2 text-xs text-destructive">{deleteError}</p>
                )}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  data-testid="delete-account-confirm"
                  onClick={(e) => {
                    e.preventDefault();
                    void handleDeleteAccount();
                  }}
                  disabled={deleteConfirmInput !== 'DELETE' || isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Delete account'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Browser';
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Browser';
}
