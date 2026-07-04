'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { Copy, Check, LogOut, Trash2 } from 'lucide-react';
import { useAuthStore } from '@shared/stores/authentication-store';

export function AccountSection() {
  // Read from the real, populated auth store (the one the sidebar/header use)
  // rather than useBillingStore's `user` field, which is only ever written by
  // a dead `_setUser` action with zero callers and is therefore always null.
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { signOut: clerkSignOut } = useClerk();
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
      // which clears the per-user localStorage-backed stores (workforce, mission,
      // notifications, chat, multi-agent chat, usage warnings, artifacts, layout,
      // settings, user profile). The old useBillingStore.signOut() path only reset
      // useChatStore, leaving the rest of those stores populated with the previous
      // user's data for the next signed-in session.
      await logout();
      await clerkSignOut({ redirectUrl: '/login' });
    } catch (err) {
      setLogoutError(err instanceof Error ? err.message : 'Sign out failed.');
      setLoggingOut(false);
    }
  }, [logout, clerkSignOut]);

  const sessionRows: Array<{
    device: string;
    location: string;
    created: string;
    updated: string;
    isCurrent: boolean;
  }> = user
    ? [
        {
          device: getDeviceLabel(),
          location: 'Unknown',
          created: 'Unknown',
          updated: 'Now',
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

      {/* Delete account */}
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
              Deleting your account is handled from the General section&apos;s Danger Zone.
            </p>
          </div>
          {/*
            This surface intentionally has no delete-account implementation of its
            own. GeneralSection's Danger Zone (data-testid="danger-zone") is the one
            canonical, working delete flow (confirm-text dialog -> DELETE
            /api/user/delete-account); PrivacySection has its own separate working
            copy. Rather than adding a third drifted implementation here, this just
            routes to the canonical section via the modal's own client-side router
            (same mechanism WebSettingsModal's rail uses for section switching), so
            it stays inside the Settings modal instead of doing a full page nav.
          */}
          <button
            type="button"
            onClick={() => router.push('/settings/general')}
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
                  {['Device', 'Location', 'Created', 'Updated'].map((col) => (
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
                    <td style={{ padding: '12px 16px', color: 'var(--text-3)' }}>{row.location}</td>
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
      </section>
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
