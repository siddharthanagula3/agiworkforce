'use client';

import { useEffect, useState } from 'react';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { useRouter } from 'next/navigation';
import { Switch, useConfirm } from '@agiworkforce/ui';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { useChatStore } from '@shared/stores/web-chat-store';
import { setTelemetryConsentCache } from '@/lib/sentry-shared';
import { isFreeBillingPlanTier } from '@agiworkforce/types';
import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import {
  applyBulkConversationAction,
  fetchConversationHistoryStats,
  type BulkConversationAction,
} from '../services/conversation-data-service';
import { SettingsPageLink, SettingsSectionLink } from '../components/SettingsSectionLink';
import { toUserMessage } from '@/lib/user-error-message';

const NAMESPACE = 'privacy';

// 'locationMetadata' and 'improveModelTraining' are intentionally absent from
// TOGGLES: both persisted correctly but had zero consumers anywhere (no
// location collection exists to gate; no training-data pipeline exists to
// gate), a switch that saves but changes nothing is a dead control. Re-add
// once the underlying feature ships. 'rememberChats' is also absent: it
// currently promises the opposite of what happens (off does NOT stop
// cloud-saving; the conversation-save path never reads this preference).
// Fixing that means gating the save path itself, not this settings screen.
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
      'Send anonymized error reports and usage counts so we can fix bugs faster. Message content is never included.',
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
  const newChatsTemporary = useSettingsStore((state) => state.newChatsTemporary) ?? false;
  const setNewChatsTemporary = useSettingsStore((state) => state.setNewChatsTemporary);

  const router = useRouter();
  /**
   * Destructive-action confirmation (shell-nav-ia-gap-01 remainder).
   *
   * Archive-all and delete-all-chats used native `window.confirm()`, an OS
   * alert with browser chrome, not the product's own dialog, for the two
   * highest-stakes bulk actions on this page (delete-all is the single
   * highest-stakes action in the app: every active AND archived conversation,
   * irreversibly). `useConfirm` is the shared promise-based wrapper around
   * the styled AlertDialog primitive (packages/ui/ui/src/primitives/
   * ConfirmDialog.tsx) already wired into WebChatPage/WebAppShell/
   * MessageBubble for the same class of action. Same await-a-boolean shape as
   * `window.confirm`, so the guards below read the same, but the user sees a
   * dialog with a red confirm and copy naming the exact, specific
   * consequence instead of a generic browser prompt.
   */
  const { confirm: confirmDestructive, dialog: destructiveConfirmDialog } = useConfirm();
  const subscription = useBillingStore((s) => s.subscription);
  const hasHostedCloud =
    subscription?.status === 'active' && !isFreeBillingPlanTier(subscription.tier);
  const conversations = useChatStore((state) => state.conversations);
  const streamingConversationIds = useChatStore((state) => state.streamingConversationIds);
  const updateConversationInStore = useChatStore((state) => state.updateConversation);
  const deleteConversationFromStore = useChatStore((state) => state.deleteConversation);
  const [state, setState] = useState<Record<ToggleKey, boolean>>(() => defaultPrivacyState());
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [hasChanged, setHasChanged] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState<BulkConversationAction | null>(null);
  const [conversationActionError, setConversationActionError] = useState<string | null>(null);
  const [conversationActionNotice, setConversationActionNotice] = useState<string | null>(null);

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
          setPreferenceError(toUserMessage(error, 'Failed to load privacy settings'));
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
      setHasChanged(true);
      // Mirror immediately, matching the optimistic setState above (this
      // component doesn't roll UI state back on save failure, it only shows
      // an error banner, so the cache must track what the switch displays,
      // not server-confirmed state, or the switch and the actual gate could
      // silently disagree).
      setTelemetryConsentCache(next.shareTelemetry);
      savePreferenceNamespace(NAMESPACE, next)
        .catch((error) => {
          setPreferenceError(toUserMessage(error, 'Failed to save privacy settings'));
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
      setExportError(toUserMessage(err, 'Export failed. Please try again.'));
    } finally {
      setExporting(false);
    }
  }

  async function handleArchiveAllChats() {
    const confirmed = await confirmDestructive({
      title: 'Archive every chat?',
      description:
        'Every chat will move out of the sidebar. You can restore them from Archived chats at any time, this does not delete anything.',
      confirmText: 'Archive all',
      variant: 'default',
    });
    if (!confirmed) return;

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
      setConversationActionError(toUserMessage(caught, 'Failed to archive chats'));
    } finally {
      setBulkAction(null);
    }
  }

  async function handleDeleteAllChats() {
    if (streamingConversationIds.length > 0) {
      setConversationActionError('Finish or stop active replies before deleting all chats.');
      return;
    }
    // The sidebar store holds only the pages fetched so far, so its length
    // understates the scope of a delete-everything action. Ask the server for
    // the real total before naming a number in an irreversible-looking prompt.
    let chatCount: number | null = null;
    try {
      chatCount = (await fetchConversationHistoryStats()).conversationCount;
    } catch {
      chatCount = null;
    }
    const scope =
      chatCount === null
        ? 'Every chat in your account, active and archived, will be removed from your history'
        : `All ${chatCount} chat${chatCount === 1 ? '' : 's'} in your account, active and archived, will be removed from your history`;
    const confirmed = await confirmDestructive({
      title: 'Delete all chats?',
      description: `${scope}. You can restore them from Settings > Deleted chats until they are purged.`,
      confirmText: 'Delete all chats',
      variant: 'destructive',
    });
    if (!confirmed) return;

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
      setConversationActionError(toUserMessage(caught, 'Failed to delete chats'));
    } finally {
      setBulkAction(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {destructiveConfirmDialog}
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
          Privacy
        </h1>
        {loadingPreferences || savingPreferences || preferenceError || hasChanged ? (
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)' }} role="status">
            {loadingPreferences
              ? 'Loading account settings...'
              : savingPreferences
                ? 'Saving...'
                : preferenceError
                  ? `Save failed: ${preferenceError}`
                  : 'Saved'}
          </p>
        ) : null}
      </div>

      {/* Privacy Policy, and the two expandable rows explaining data handling */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '14px 0',
            borderBottom: '1px solid var(--settings-border)',
          }}
        >
          <span style={{ fontSize: 14, color: 'var(--text-1)' }}>Privacy Policy</span>
          <SettingsPageLink
            href="/privacy"
            style={{
              fontSize: 13,
              color: 'var(--text-2)',
              textDecoration: 'none',
              padding: '6px 14px',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            View
          </SettingsPageLink>
        </div>

        <ExpandableSection title="How we protect your data">
          <p style={{ margin: '0 0 8px' }}>
            {/*
              Named by surface deliberately. Read on a WEB settings screen, the
              unqualified version implied this browser could keep a conversation
              on-device or route it with your own key. Hosted Web offers
              neither, app/settings/byok says so in as many words, and the
              three trust boundaries are the one thing that must not blur.
            */}
            On Desktop, CLI and VS Code, Local Mode conversations stay on your device and are never
            transmitted to AGI servers, and BYOK conversations go directly to your chosen provider
            using your own API key. Hosted Web has neither mode: it stores no provider keys of
            yours, so everything you send here is a Managed Cloud request.
          </p>
          <p style={{ margin: 0 }}>
            Managed Cloud conversations are encrypted in transit and at rest. We do not sell your
            data, and we do not train AGI-owned models on your prompts, responses or files. There is
            no training opt-in, because that data path does not exist. Managed Cloud requests are
            routed to the hosted provider serving the model you selected, and provider-side handling
            is governed by that provider&rsquo;s terms, the current list is at{' '}
            <SettingsPageLink
              href="/subprocessors"
              style={{ color: 'var(--text-1)', textDecoration: 'underline' }}
            >
              /subprocessors
            </SettingsPageLink>
            .
          </p>
        </ExpandableSection>

        <ExpandableSection title="How we use your data">
          <p style={{ margin: '0 0 8px' }}>
            Crash reports and anonymized usage counts (no message content) help us fix bugs faster.
            These are disabled by default and can be turned off at any time below.
          </p>
          {/*
            The "opt into model-improvement sharing" paragraph that used to sit
            here described a control that does not exist: `improveModelTraining`
            was deliberately removed from TOGGLES above because nothing consumes
            it. Telling users to opt into a setting they cannot find, for a
            pipeline that was never built, is worse than saying nothing. Restore
            copy here only when the toggle and its consumer both ship.
          */}
        </ExpandableSection>

        {/* Telemetry toggle */}
        {TOGGLES.map((spec) => (
          <div
            key={spec.id}
            style={{
              padding: '14px 0',
              borderBottom: '1px solid var(--settings-border)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
              opacity: spec.managedOnly && !hasHostedCloud ? 0.65 : 1,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <span style={{ fontSize: 14, color: 'var(--text-1)' }}>
                {spec.label}
                {spec.managedOnly ? (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 12,
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
      </div>

      {/* Your data */}
      <div>
        <div
          style={{
            padding: '14px 0',
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
          <SettingsSectionLink
            section="shared-links"
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
          </SettingsSectionLink>
        </div>

        <div
          style={{
            padding: '14px 0',
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
          <SettingsSectionLink
            section="archived"
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
          </SettingsSectionLink>
        </div>

        <div
          style={{
            padding: '14px 0',
            borderTop: '1px solid var(--settings-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
              Recently deleted
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Put back a chat you deleted by mistake.
            </div>
          </div>
          <SettingsSectionLink
            section="deleted-chats"
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
          </SettingsSectionLink>
        </div>

        <div
          style={{
            padding: '14px 0',
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
            padding: '14px 0',
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
              color: 'var(--chat-accent-primary-text)',
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
              color: conversationActionError ? 'var(--chat-accent-primary)' : 'var(--text-2)',
              fontSize: 12,
            }}
          >
            {conversationActionError ?? conversationActionNotice}
          </div>
        ) : null}

        {/*
          Start new chats temporary.

          Distinct from the 'rememberChats' switch noted at the top of this
          file, which was removed for lying: nothing read it. This one is
          honoured by machinery that already works, useConversations sends
          isTemporary AT CREATION and the save path already skips a temporary
          conversation, so the first message is never persisted either. It
          changes the default for NEW chats only; existing ones keep whatever
          they were, and the composer's per-chat toggle still overrides it.
        */}
        <div
          style={{
            padding: '14px 0',
            borderBottom: '1px solid var(--settings-border)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
              Start new chats as temporary
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              New conversations are not saved to your account or history. You can still turn a
              single chat back on from the composer.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={newChatsTemporary}
            aria-label="Start new chats as temporary"
            onClick={() => setNewChatsTemporary(!newChatsTemporary)}
            style={{
              flexShrink: 0,
              width: 44,
              height: 24,
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              background: newChatsTemporary
                ? 'var(--chat-accent-primary)'
                : 'var(--settings-border)',
              transition: 'background 0.15s',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'block',
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: 'var(--bg-elev)',
                transform: `translateX(${newChatsTemporary ? 23 : 3}px)`,
                transition: 'transform 0.15s',
              }}
            />
          </button>
        </div>

        {/*
          The rights surface at /privacy/requests, consent ledger and a
          rights-request form, was built and reachable only by typing the URL.
          A DPDP/GDPR rights path the data subject cannot find from their own
          privacy settings is not a rights path.
        */}
        <div
          style={{
            padding: '14px 0',
            borderBottom: '1px solid var(--settings-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
              Privacy requests
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Review your consent record, or ask us to access, correct, or erase your data.
            </div>
          </div>
          <a
            href="/privacy/requests"
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-1)',
              background: 'transparent',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius-md)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Open
          </a>
        </div>

        {/*
          Uploaded files.

          The Library at /chat/library has always listed these, uploads and
          generated media, with soft delete and permanent delete, but Privacy
          never pointed at it, so the one screen a privacy-minded user opens did
          not mention the files they had uploaded. claude.ai lists exactly this
          beside its other Manage entries.
        */}
        <div
          style={{
            padding: '14px 0',
            borderBottom: '1px solid var(--settings-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
              Uploaded files
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Files you uploaded and media generated for you. Review them, or delete individual
              items, in your Library.
            </div>
          </div>
          <a
            href="/chat/library"
            style={{
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-1)',
              background: 'transparent',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius-md)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Manage
          </a>
        </div>

        {/* Export data row */}
        <div
          id="export-data"
          style={{
            padding: '14px 0',
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
              <span style={{ fontSize: 12, color: 'var(--chat-accent-primary-text)' }}>
                {exportError}
              </span>
            )}
          </div>
        </div>

        {/* Memory preferences row */}
        <div
          style={{
            padding: '14px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
            Memory preferences
          </div>
          <SettingsSectionLink
            section="memory"
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
          </SettingsSectionLink>
        </div>
      </div>

      {/* Delete account, cross-link only. This used to be a second, independent
          delete-account implementation (its own fetch, its own hardcoded
          "within 24 hours" string, and, unlike Account settings, no sign-out
          afterward, which left a live client session against an account
          scheduled for erasure). Deletion now has exactly one implementation,
          on Account settings, via useDeleteAccount. Same pattern as
          SecuritySection's session-management cross-link: point at the owning
          surface instead of re-implementing it here. */}
      <div aria-label="Account deletion availability">
        <p
          style={{
            margin: '0 0 4px',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--chat-accent-primary-text)',
          }}
        >
          Danger zone
        </p>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--text-3)' }}>
          Permanently deleting your account, including all conversations and billing history, is
          handled from{' '}
          <SettingsSectionLink
            section="account"
            style={{ color: 'var(--text-1)', textDecoration: 'underline' }}
          >
            Account settings
          </SettingsSectionLink>
          .
        </p>
      </div>
    </div>
  );
}
