'use client';

import { useState } from 'react';
import { getCsrfToken } from '@/lib/client/csrf';

/**
 * /settings/privacy — local-first privacy controls. Round-2 audit P0 #7 (web
 * settings depth). Toggles persist in localStorage in v1; Cloud Managed
 * replaces persistence with a Supabase row. Round-20 adds delete account and
 * data export with confirmation flow.
 */

const PRIVACY_KEYS = {
  improveModelTraining: 'agi.privacy.improveModelTraining',
  shareTelemetry: 'agi.privacy.shareTelemetry',
  rememberChats: 'agi.privacy.rememberChats',
} as const;

type ToggleKey = keyof typeof PRIVACY_KEYS;

interface ToggleSpec {
  id: ToggleKey;
  label: string;
  description: string;
  defaultValue: boolean;
  managedOnly?: boolean;
}

const TOGGLES: ReadonlyArray<ToggleSpec> = [
  {
    id: 'rememberChats',
    label: 'Remember chats',
    description:
      'When enabled, conversations are saved on this device and synced to Web, Desktop, and Mobile (never CLI / VS Code / Chrome extension). Turn off to use chat in ephemeral mode only.',
    defaultValue: true,
  },
  {
    id: 'improveModelTraining',
    label: 'Help improve AGI models',
    description:
      'Cloud Managed only: share anonymized conversations to improve future models. Off by default. Local Mode and BYOK conversations are never used regardless of this setting.',
    defaultValue: false,
    managedOnly: true,
  },
  {
    id: 'shareTelemetry',
    label: 'Share crash and usage telemetry',
    description:
      'Send anonymized error reports and usage counts (no message content) so we can fix bugs faster. Stripped before send via the Sentry beforeSend hook.',
    defaultValue: false,
  },
];

function readToggle(key: ToggleKey, defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue;
  const stored = window.localStorage.getItem(PRIVACY_KEYS[key]);
  if (stored === '1') return true;
  if (stored === '0') return false;
  return defaultValue;
}

function writeToggle(key: ToggleKey, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PRIVACY_KEYS[key], value ? '1' : '0');
  } catch {
    // Private-window / quota errors are non-fatal.
  }
}

export default function PrivacySettingsPage() {
  const [state, setState] = useState<Record<ToggleKey, boolean>>(() =>
    TOGGLES.reduce(
      (acc, t) => ({ ...acc, [t.id]: readToggle(t.id, t.defaultValue) }),
      {} as Record<ToggleKey, boolean>,
    ),
  );

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  function toggle(key: ToggleKey) {
    setState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      writeToggle(key, next[key]);
      return next;
    });
  }

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch('/api/user/data', { method: 'GET' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agi-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleteInput !== 'DELETE') return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch('/api/user/delete-account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Deletion failed');
      }
      setDeleteSuccess(true);
      setShowDeleteConfirm(false);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Account deletion failed.');
    } finally {
      setDeleting(false);
    }
  }

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
          Privacy & data controls
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          AGI is local-first. These toggles override defaults for this device.
        </p>
      </div>

      {/* Toggles */}
      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        {TOGGLES.map((spec, idx) => (
          <label
            key={spec.id}
            style={{
              padding: '16px 20px',
              borderTop: idx === 0 ? 'none' : '1px solid var(--border)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
              cursor: spec.managedOnly ? 'not-allowed' : 'pointer',
              opacity: spec.managedOnly ? 0.65 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={state[spec.id]}
              disabled={spec.managedOnly}
              onChange={() => toggle(spec.id)}
              style={{ marginTop: 3 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
                {spec.label}
                {spec.managedOnly ? (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--text-3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Cloud Managed
                  </span>
                ) : null}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                {spec.description}
              </span>
            </div>
          </label>
        ))}
      </section>

      {/* Export data */}
      <section
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          padding: '18px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>
          Export your data
        </h2>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>
          Download all your conversations as JSON. Cloud Managed adds server-side archive export.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              color: exporting ? 'var(--text-3)' : 'var(--text-1)',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              cursor: exporting ? 'not-allowed' : 'pointer',
              opacity: exporting ? 0.6 : 1,
            }}
          >
            {exporting ? 'Preparing...' : 'Export all data'}
          </button>
          {exportError && (
            <span style={{ fontSize: 12, color: 'var(--chat-accent-primary, #c8892a)' }}>
              {exportError}
            </span>
          )}
        </div>
      </section>

      {/* Delete account */}
      <section
        style={{
          border: '1px solid rgba(218,119,86,0.35)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-elev)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid rgba(218,119,86,0.25)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--chat-accent-primary, #c8892a)',
          }}
        >
          Danger zone
        </div>
        <div
          style={{
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {deleteSuccess ? (
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
              Account deletion scheduled. You will receive a confirmation email with a 24-hour
              cancellation window.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
                Permanently delete your account and all associated data. This cannot be undone.
              </p>
              {!showDeleteConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '7px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--chat-accent-primary, #c8892a)',
                    background: 'transparent',
                    border: '1px solid rgba(218,119,86,0.5)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                  }}
                >
                  Delete account
                </button>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    padding: '14px 16px',
                    background: 'rgba(218,119,86,0.06)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(218,119,86,0.2)',
                  }}
                >
                  <p style={{ fontSize: 12, color: 'var(--text-2)', margin: 0 }}>
                    This will permanently delete all conversations, settings, and billing history.
                    Type <strong>DELETE</strong> to confirm.
                  </p>
                  <input
                    type="text"
                    value={deleteInput}
                    onChange={(e) => setDeleteInput(e.target.value)}
                    placeholder="Type DELETE to confirm"
                    style={{
                      fontSize: 13,
                      padding: '7px 10px',
                      background: 'var(--bg-base)',
                      color: 'var(--text-1)',
                      border: '1px solid rgba(218,119,86,0.4)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={deleteInput !== 'DELETE' || deleting}
                      style={{
                        padding: '7px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#fff',
                        background:
                          deleteInput !== 'DELETE' || deleting
                            ? 'rgba(218,119,86,0.4)'
                            : 'var(--chat-accent-primary, #c8892a)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        cursor: deleteInput !== 'DELETE' || deleting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {deleting ? 'Deleting...' : 'Confirm deletion'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setDeleteInput('');
                        setDeleteError(null);
                      }}
                      style={{
                        padding: '7px 14px',
                        fontSize: 12,
                        color: 'var(--text-2)',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  {deleteError && (
                    <span style={{ fontSize: 12, color: 'var(--chat-accent-primary, #c8892a)' }}>
                      {deleteError}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
