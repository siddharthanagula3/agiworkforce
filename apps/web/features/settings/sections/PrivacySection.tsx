'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Switch } from '@agiworkforce/ui';
import { getCsrfToken } from '@/lib/client/csrf';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { setTelemetryConsentCache } from '@/lib/sentry-shared';
import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import {
  applyBulkConversationAction,
  type BulkConversationAction,
} from '../services/conversation-data-service';

const NAMESPACE = 'privacy';

// 'locationMetadata' and 'improveModelTraining' are intentionally absent from
// TOGGLES: both persisted correctly but had zero consumers anywhere (no
// location collection exists to gate; no training-data pipeline exists to
// gate) — a switch that saves but changes nothing is a dead control. Re-add
// once the underlying feature ships. 'rememberChats' is also absent: it
// currently promises the opposite of what happens (off does NOT stop
// cloud-saving; the conversation-save path never reads this preference).
// Fixing that means gating the save path itself, not this settings screen —
// do not re-add the switch until that read is wired, or it goes back to
// actively lying to privacy-conscious users.
type ToggleKey = 'shareTelemetry';

interface ToggleSpec {
  id: ToggleKey;
  label: string;
  description: string;
  defaultValue: boolean;
  managedOnly?: boolean;
}

const TOGGLES: ReadonlyArray<ToggleSpec> = [
  {
    id: 'shareTelemetry',
    label: 'Share crash and usage telemetry',
    description:
      'Send anonymized error reports and usage counts (no message content) so we can fix bugs faster. Stripped before send via the Sentry beforeSend hook.',
    defaultValue: false,
  },
];

function defaultPrivacyState(): Record<ToggleKey, boolean> {
  return TOGGLES.reduce(
    (acc, t) => ({ ...acc, [t.id]: t.defaultValue }),
    {} as Record<ToggleKey, boolean>,
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}
    >
      <path
        d="M2 4l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExpandableSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid var(--settings-border)' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-1)',
          fontSize: 14,
          fontWeight: 500,
          textAlign: 'left',
        }}
      >
        {title}
        <Chevron open={open} />
      </button>
      {open && (
        <div
          style={{
            padding: '0 20px 14px',
            fontSize: 13,
            color: 'var(--text-3)',
            lineHeight: 1.6,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function PrivacySection() {
  const router = useRouter();
  const subscription = useBillingStore((s) => s.subscription);
  const hasHostedCloud = subscription?.status === 'active' && subscription.tier !== 'free';
  const conversations = useChatStore((state) => state.conversations);
  const streamingConversationIds = useChatStore((state) => state.streamingConversationIds);
  const updateConversationInStore = useChatStore((state) => state.updateConversation);
  const deleteConversationFromStore = useChatStore((state) => state.deleteConversation);
  const [state, setState] = useState<Record<ToggleKey, boolean>>(() => defaultPrivacyState());
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [loadingPreferences, setLoadingPreferences] = useState(true);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<BulkConversationAction | null>(null);
  const [conversationActionError, setConversationActionError] = useState<string | null>(null);
  const [conversationActionNotice, setConversationActionNotice] = useState<string | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPreferenceNamespace<Record<ToggleKey, boolean>>(NAMESPACE, defaultPrivacyState())
      .then((value) => {
        if (!cancelled) {
          setState(value);
          setPreferenceError(null);
          // Sync the server-authoritative value to this device's synchronous
          // localStorage cache so instrumentation-client.ts's next page load
          // (which runs before this fetch could resolve) respects it.
          setTelemetryConsentCache(value.shareTelemetry);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPreferenceError(
            error instanceof Error ? error.message : 'Failed to load privacy settings',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPreferences(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(key: ToggleKey) {
    setState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      setSavingPreferences(true);
      setPreferenceError(null);
      // Mirror immediately, matching the optimistic setState above (this
      // component doesn't roll UI state back on save failure, it only shows
      // an error banner — so the cache must track what the switch displays,
      // not server-confirmed state, or the switch and the actual gate could
      // silently disagree).
      setTelemetryConsentCache(next.shareTelemetry);
      savePreferenceNamespace(NAMESPACE, next)
        .catch((error) => {
          setPreferenceError(
            error instanceof Error ? error.message : 'Failed to save privacy settings',
          );
        })
        .finally(() => setSavingPreferences(false));
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

  async function handleArchiveAllChats() {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Archive every chat? You can restore them from Archived chats.')
    ) {
      return;
    }

    setBulkAction('archive_all');
    setConversationActionError(null);
    setConversationActionNotice(null);
    try {
      const affectedCount = await applyBulkConversationAction('archive_all');
      for (const conversation of conversations) {
        if (!conversation.isArchived) {
          updateConversationInStore(conversation.id, { isArchived: true });
        }
      }
      setConversationActionNotice(
        affectedCount === 1 ? 'Archived 1 chat.' : `Archived ${affectedCount} chats.`,
      );
    } catch (caught) {
      setConversationActionError(
        caught instanceof Error ? caught.message : 'Failed to archive chats',
      );
    } finally {
      setBulkAction(null);
    }
  }

  async function handleDeleteAllChats() {
    if (streamingConversationIds.length > 0) {
      setConversationActionError('Finish or stop active replies before deleting all chats.');
      return;
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Permanently delete every chat, including archived chats? This cannot be undone.',
      )
    ) {
      return;
    }

    setBulkAction('delete_all');
    setConversationActionError(null);
    setConversationActionNotice(null);
    try {
      const affectedCount = await applyBulkConversationAction('delete_all');
      for (const conversation of conversations) {
        deleteConversationFromStore(conversation.id);
      }
      router.replace('/chat');
      setConversationActionNotice(
        affectedCount === 1 ? 'Deleted 1 chat.' : `Deleted ${affectedCount} chats.`,
      );
    } catch (caught) {
      setConversationActionError(
        caught instanceof Error ? caught.message : 'Failed to delete chats',
      );
    } finally {
      setBulkAction(null);
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
          Privacy
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: 0 }}>
          AGI is local-first. Web privacy controls are loaded from and saved to your account
          settings.
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-3)' }} role="status">
          {loadingPreferences
            ? 'Loading account settings...'
            : savingPreferences
              ? 'Saving...'
              : preferenceError
                ? `Save failed: ${preferenceError}`
                : 'Synced to your account'}
        </p>
      </div>

      {/* Informational banner */}
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
            fontSize: 13,
            color: 'var(--text-2)',
            lineHeight: 1.6,
            borderBottom: '1px solid var(--settings-border)',
          }}
        >
          AGI believes in transparent data practices. Learn how your information is protected when
          using AGI products and visit our{' '}
          <Link href="/privacy" style={{ color: 'var(--text-1)', textDecoration: 'underline' }}>
            Privacy Policy
          </Link>{' '}
          for more details.
        </div>

        <ExpandableSection title="How we protect your data">
          <p style={{ margin: '0 0 8px' }}>
            All Local Mode conversations stay on your device and are never transmitted to AGI
            servers. BYOK conversations go directly to your chosen provider using your own API key.
          </p>
          <p style={{ margin: 0 }}>
            Managed Cloud conversations are encrypted in transit and at rest. We do not sell your
            data or use it to train third-party models without your explicit opt-in.
          </p>
        </ExpandableSection>

        <ExpandableSection title="How we use your data">
          <p style={{ margin: '0 0 8px' }}>
            Crash reports and anonymized usage counts (no message content) help us fix bugs faster.
            These are disabled by default and can be turned off at any time below.
          </p>
          <p style={{ margin: 0 }}>
            If you opt into model-improvement sharing for hosted cloud, your anonymized
            conversations may be reviewed by our team to improve future models.
          </p>
        </ExpandableSection>
      </section>

      {/* Preferences (toggles) */}
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
          Preferences
        </div>
        {TOGGLES.map((spec, idx) => (
          <div
            key={spec.id}
            style={{
              padding: '16px 20px',
              borderTop: idx === 0 ? 'none' : '1px solid var(--settings-border)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
              opacity: spec.managedOnly && !hasHostedCloud ? 0.65 : 1,
            }}
          >
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
                    {hasHostedCloud ? 'Hosted cloud' : 'Upgrade'}
                  </span>
                ) : null}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                {spec.description}
              </span>
            </div>
            <Switch
              checked={state[spec.id]}
              disabled={spec.managedOnly && !hasHostedCloud}
              onCheckedChange={() => toggle(spec.id)}
              aria-label={spec.label}
            />
          </div>
        ))}
      </section>

      {/* Your data section */}
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
          Your data
        </div>

        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--settings-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
              Shared links
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Review and revoke links created from Web conversations.
            </div>
          </div>
          <Link
            href="/settings/shared-links"
            style={{
              fontSize: 13,
              color: 'var(--text-2)',
              textDecoration: 'none',
              padding: '6px 14px',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            Manage
          </Link>
        </div>

        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--settings-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
              Archived chats
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Restore archived chats or permanently delete them.
            </div>
          </div>
          <Link
            href="/settings/archived"
            style={{
              fontSize: 13,
              color: 'var(--text-2)',
              textDecoration: 'none',
              padding: '6px 14px',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            Manage
          </Link>
        </div>

        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--settings-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
              Archive all chats
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Move every chat out of the sidebar. You can restore them later.
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleArchiveAllChats()}
            disabled={bulkAction !== null}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-1)',
              background: 'transparent',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius-md)',
              cursor: bulkAction !== null ? 'not-allowed' : 'pointer',
            }}
          >
            {bulkAction === 'archive_all' ? 'Archiving…' : 'Archive all'}
          </button>
        </div>

        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--settings-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
              Delete all chats
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Permanently delete every active and archived conversation.
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleDeleteAllChats()}
            disabled={bulkAction !== null || streamingConversationIds.length > 0}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--chat-accent-primary, #c8892a)',
              background: 'transparent',
              border: '1px solid rgba(218,119,86,0.5)',
              borderRadius: 'var(--radius-md)',
              cursor:
                bulkAction !== null || streamingConversationIds.length > 0
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            {bulkAction === 'delete_all' ? 'Deleting…' : 'Delete all'}
          </button>
        </div>

        {conversationActionError || conversationActionNotice ? (
          <div
            role={conversationActionError ? 'alert' : 'status'}
            style={{
              padding: '10px 20px',
              borderBottom: '1px solid var(--settings-border)',
              color: conversationActionError
                ? 'var(--chat-accent-primary, #c8892a)'
                : 'var(--text-2)',
              fontSize: 12,
            }}
          >
            {conversationActionError ?? conversationActionNotice}
          </div>
        ) : null}

        {/* Export data row */}
        <div
          id="export-data"
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--settings-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>Export data</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Download all your conversations as JSON.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                border: '1px solid var(--settings-border)',
                borderRadius: 'var(--radius-md)',
                cursor: exporting ? 'not-allowed' : 'pointer',
                opacity: exporting ? 0.6 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {exporting ? 'Preparing...' : 'Export data'}
            </button>
            {exportError && (
              <span style={{ fontSize: 12, color: 'var(--chat-accent-primary, #c8892a)' }}>
                {exportError}
              </span>
            )}
          </div>
        </div>

        {/* Memory preferences row */}
        <div
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
            Memory preferences
          </div>
          <Link
            href="/settings/memory"
            style={{
              fontSize: 13,
              color: 'var(--text-2)',
              textDecoration: 'none',
              padding: '6px 14px',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            Manage
          </Link>
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
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                        border: '1px solid var(--settings-border)',
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
