'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { Switch } from '@agiworkforce/ui';
import { useBillingStore } from '@shared/stores/web-auth-store';
import {
  confirmTelemetryConsent,
  hasPendingTelemetryOptOut,
  requestTelemetryOptOut,
  setTelemetryConsentCache,
} from '@/lib/sentry-shared';
import { isFreeBillingPlanTier, PRODUCT_COPYRIGHT_NAME } from '@agiworkforce/types';
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import { usePreferenceOwner, usePreferenceView } from '../hooks/use-preference-owner';
import {
  readPrivacyPreferences,
  savePrivacyPreference,
  type PrivacySnapshot,
  type PrivacyKey,
} from '../services/privacy-preferences-client';
import { SettingsPageLink, SettingsSectionLink } from '../components/SettingsSectionLink';
import { SaveStatusLine } from '../components/SaveStatusLine';
import { DataExportRow } from '../components/DataExportRow';
import { BulkConversationControls } from '../components/BulkConversationControls';
import { UsOnlyRoutingPanel } from '../components/UsOnlyRoutingPanel';
import { ProductAnalyticsConsentRow } from '../components/ProductAnalyticsConsentRow';
import { MarketingEmailConsentRow } from '../components/MarketingEmailConsentRow';
import { NamedProviderConsentRows } from '../components/NamedProviderConsentRows';
import { HelpArticleLink } from '@/features/support/components/HelpArticleLink';
import { BYOK_SURFACES } from '@/lib/marketing-constants';

// 'locationMetadata' is intentionally absent from TOGGLES: it persisted
// correctly but had zero consumers (no location collection exists to gate),
// and a switch that saves but changes nothing is a dead control. 'rememberChats' is
// also absent: it currently promises the opposite of what happens (off does NOT
// stop cloud-saving; the conversation-save path never reads this preference).
// Fixing that means gating the save path itself, not this settings screen.
// do not re-add the switch until that read is wired, or it goes back to
// actively lying to privacy-conscious users. 'improveModelTraining' is retired
// and never reused: values saved under it were given for a switch with other
// wording, so they are not consent to the model improvement choices below.
type ToggleKey = PrivacyKey;

interface ToggleSpec {
  id: ToggleKey;
  label: string;
  description: string;
  defaultValue: boolean;
  managedOnly?: boolean;
  ariaLabel?: string;
}

const TOGGLES: ReadonlyArray<ToggleSpec> = [
  {
    id: 'shareTelemetry',
    label: 'Share crash and error reports',
    description: 'Send error reports, with sensitive fields removed.',
    defaultValue: false,
  },
  {
    id: 'keepOutOfProviderTraining',
    label: 'Only use models that do not train on your chats',
    description: 'On Free, this keeps your chats off free models whose terms may allow training.',
    defaultValue: false,
  },
];

const MODEL_IMPROVEMENT_HEADING = `Help improve ${PRODUCT_COPYRIGHT_NAME} models`;

const MODEL_IMPROVEMENT_TOGGLES: ReadonlyArray<ToggleSpec> = [
  {
    id: 'allowChatsForModelImprovement',
    label: 'Use my chats',
    ariaLabel: `Use my chats to improve ${PRODUCT_COPYRIGHT_NAME} models`,
    description: `Allow ${PRODUCT_COPYRIGHT_NAME} to use your chats to improve its own models.`,
    defaultValue: false,
  },
  {
    id: 'allowVoiceForModelImprovement',
    label: 'Use my voice',
    ariaLabel: `Use my voice recordings to improve ${PRODUCT_COPYRIGHT_NAME} models`,
    description: `Allow ${PRODUCT_COPYRIGHT_NAME} to use your voice recordings to improve its own models.`,
    defaultValue: false,
  },
];

const MODEL_IMPROVEMENT_NOTE = `Both are off unless you turn them on. Nothing is used for this today. These choices apply only if ${PRODUCT_COPYRIGHT_NAME} starts improving its own models, and they don’t change which providers serve your chats.`;

function defaultPrivacyState(): Record<ToggleKey, boolean> {
  return [...TOGGLES, ...MODEL_IMPROVEMENT_TOGGLES].reduce(
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

const PROCESSING_LOCATIONS: ReadonlyArray<{ feature: string; where: string }> = [
  {
    feature: 'Chat',
    where: 'Cloud, then the AI provider that serves the model you chose.',
  },
  {
    feature: 'Files you attach',
    where: 'Stored by Cloud in Cloudflare R2 and sent with your message to the model provider.',
  },
  {
    feature: 'Memory and past-chat search',
    where: 'Stored in Cloud and added to your message before it reaches the model provider.',
  },
  {
    feature: 'Web search and Deep Research',
    where: 'Your search queries go from Cloud to Perplexity’s search service.',
  },
  {
    feature: 'Image and video generation',
    where:
      'Cloud sends your prompt to Google, OpenAI or Stability for images, and to Runway, Google or OpenRouter for video.',
  },
  {
    feature: 'Dictation',
    where: 'Your recording goes from Cloud to OpenAI for transcription.',
  },
  {
    feature: 'Voice mode',
    where:
      'Cloud sets up the call, then your audio streams directly between your device and OpenAI.',
  },
  {
    feature: 'Read aloud',
    where: 'Uses the voices built into your browser.',
  },
  {
    feature: 'Connectors',
    where:
      'Cloud calls the connected service for you, and what it returns goes to the model provider with your message.',
  },
];

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
          padding: 'var(--space-3) var(--space-5)',
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
            padding: '0 var(--space-5) var(--space-4)',
            fontSize: 14,
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

const BROWSER_SYNC_STATEMENT =
  'Artifacts you create here are synced to your account; conversations are stored in your account directly, not synced from this browser.';

type PrivacyLane = {
  active: boolean;
  ready: PrivacySnapshot | null;
  operation: RequestAuthority | null;
};

type PrivacyView = {
  lane: PrivacyLane;
  ready: PrivacySnapshot | null;
  values: Record<ToggleKey, boolean>;
  busy: boolean;
  message: string | null;
  failed: boolean;
};

export function PrivacySection() {
  const newChatsTemporary = useSettingsStore((state) => state.newChatsTemporary) ?? false;
  const setNewChatsTemporary = useSettingsStore((state) => state.setNewChatsTemporary);
  const subscription = useBillingStore((s) => s.subscription);
  const hasHostedCloud =
    subscription?.status === 'active' && !isFreeBillingPlanTier(subscription.tier);
  const owner = usePreferenceOwner();
  const capture = usePreferenceView(owner);
  const lane = useMemo<PrivacyLane>(
    () => Object.assign({ active: false, ready: null, operation: null }, { binding: { owner } }),
    [owner],
  );
  const [view, setView] = useState<PrivacyView | null>(null);
  const displayed = view?.lane === lane ? view : null;
  const ready = displayed?.ready ?? null;
  const state = displayed?.values ?? defaultPrivacyState();
  const laneCurrent = useCallback(() => lane.active && owner?.isCurrent() === true, [lane, owner]);

  const read = useCallback(
    async (
      operation: RequestAuthority,
      message: string | null = null,
      acknowledged: boolean = false,
    ) => {
      const current = () => lane.operation === operation && operation.isCurrent();
      try {
        const snapshot = await readPrivacyPreferences(operation);
        if (!current()) return;
        const values = { ...defaultPrivacyState(), ...snapshot.stored };
        setTelemetryConsentCache(values.shareTelemetry);
        if (!current()) return;
        const pendingDenial = hasPendingTelemetryOptOut();
        if (pendingDenial) values.shareTelemetry = false;
        lane.ready = snapshot;
        setView({
          lane,
          ready: snapshot,
          values,
          busy: false,
          message: pendingDenial
            ? 'Telemetry is off on this browser. Review your account setting before choosing again.'
            : message,
          failed: pendingDenial || (message !== null && !acknowledged),
        });
      } catch {
        if (!current()) return;
        lane.ready = null;
        setView((previous) => ({
          lane,
          ready: null,
          values: previous?.lane === lane ? previous.values : defaultPrivacyState(),
          busy: false,
          message: `${message ? `${message} ` : ''}The latest privacy settings could not be loaded. Retry loading them.`,
          failed: true,
        }));
      } finally {
        if (lane.operation === operation) lane.operation = null;
        operation.retire();
      }
    },
    [lane],
  );

  const load = useCallback(() => {
    const viewCurrent = capture();
    if (!owner || !laneCurrent() || !viewCurrent() || lane.operation) return;
    const operation = createRequestAuthority(owner.session, () => laneCurrent() && viewCurrent());
    lane.operation = operation;
    lane.ready = null;
    setView({
      lane,
      ready: null,
      values: defaultPrivacyState(),
      busy: true,
      message: null,
      failed: false,
    });
    void read(operation);
  }, [owner, capture, lane, laneCurrent, read]);

  useEffect(() => {
    lane.active = true;
    load();
    return () => {
      lane.active = false;
      lane.ready = null;
      lane.operation?.retire();
      lane.operation = null;
    };
  }, [lane, load]);

  async function savePrivacy(key: ToggleKey, value: boolean) {
    const viewCurrent = capture();
    if (
      !owner ||
      !laneCurrent() ||
      !viewCurrent() ||
      !ready ||
      lane.ready !== ready ||
      lane.operation
    )
      return;
    const operation = createRequestAuthority(owner.session, () => laneCurrent() && viewCurrent());
    lane.operation = operation;
    lane.ready = null;
    if (key === 'shareTelemetry' && !value) requestTelemetryOptOut();
    setView({
      lane,
      ready: null,
      values: key === 'shareTelemetry' && !value ? { ...state, shareTelemetry: false } : state,
      busy: true,
      message: null,
      failed: false,
    });
    let acknowledged = false;
    try {
      await savePrivacyPreference(operation, key, value);
      operation.assertCurrent();
      if (lane.operation !== operation) return;
      if (key === 'shareTelemetry') confirmTelemetryConsent(value);
      acknowledged = true;
    } catch {
      if (!operation.isCurrent()) return;
    } finally {
      if (!operation.isCurrent()) {
        if (lane.operation === operation) lane.operation = null;
        operation.retire();
      }
    }
    if (lane.operation !== operation || !operation.isCurrent()) return;
    await read(
      operation,
      acknowledged
        ? 'Your privacy setting was saved.'
        : 'We could not confirm whether your change was saved. Review the latest settings before choosing again.',
      acknowledged,
    );
  }

  function renderToggle(spec: ToggleSpec) {
    return (
      <div
        key={spec.id}
        style={{
          padding: 'var(--space-4) 0',
          borderBottom: '1px solid var(--settings-border)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          opacity: spec.managedOnly && !hasHostedCloud ? 0.65 : 1,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1 }}>
          <span style={{ fontSize: 14, color: 'var(--text-1)' }}>
            {spec.label}
            {spec.managedOnly ? (
              <span
                style={{
                  marginLeft: 'var(--space-2)',
                  fontSize: 14,
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
          disabled={
            !ready ||
            !laneCurrent() ||
            displayed?.busy === true ||
            (spec.managedOnly && !hasHostedCloud)
          }
          onCheckedChange={(checked) => void savePrivacy(spec.id, checked)}
          aria-label={spec.ariaLabel ?? spec.label}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div>
        <h1
          style={{
            fontFamily: 'var(--sans)',
            fontSize: 24,
            fontWeight: 500,
            color: 'var(--text-1)',
            margin: '0 0 var(--space-1)',
          }}
        >
          Privacy
        </h1>
        <div style={{ marginTop: 'var(--space-2)' }}>
          <HelpArticleLink docId="privacy-controls" label="How privacy controls work" />
        </div>
        {displayed?.busy || displayed?.message ? (
          <SaveStatusLine
            failed={displayed?.failed === true}
            style={{ margin: 'var(--space-1) 0 0', fontSize: 14, color: 'var(--text-3)' }}
          >
            {displayed?.busy ? 'Updating account settings...' : displayed?.message}
          </SaveStatusLine>
        ) : null}
        {ready &&
        !displayed?.busy &&
        hasPendingTelemetryOptOut() &&
        ready.stored.shareTelemetry === true ? (
          <button
            type="button"
            onClick={() => void savePrivacy('shareTelemetry', false)}
            className="mt-2 text-sm underline underline-offset-4"
          >
            Keep telemetry off for my account
          </button>
        ) : null}
        {displayed?.failed && !ready && !displayed.busy ? (
          <button
            type="button"
            onClick={load}
            className="mt-2 text-sm underline underline-offset-4"
          >
            Retry loading
          </button>
        ) : null}
      </div>

      {/* Privacy Policy, and the two expandable rows explaining data handling */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            padding: 'var(--space-4) 0',
            borderBottom: '1px solid var(--settings-border)',
          }}
        >
          <span style={{ fontSize: 14, color: 'var(--text-1)' }}>Privacy Policy</span>
          <SettingsPageLink
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 14,
              color: 'var(--text-2)',
              textDecoration: 'none',
              padding: 'var(--space-2) var(--space-4)',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            View
          </SettingsPageLink>
        </div>

        <ExpandableSection title="How we protect your data">
          <p style={{ margin: '0 0 var(--space-2)' }}>
            {/*
              Named by surface deliberately. Read on a WEB settings screen, the
              unqualified version implied this browser could keep a conversation
              on-device or route it with your own key. Hosted Web offers
              neither, app/settings/byok says so in as many words, and the
              three trust boundaries are the one thing that must not blur.
            */}
            Local Mode and BYOK belong to the CLI. {BYOK_SURFACES.availability} In Local Mode,
            conversations stay on your device and are never transmitted to AGI servers, and BYOK
            conversations go directly to your chosen provider using your own API key. Hosted Web and
            Desktop have neither mode: they store no provider keys of yours, so everything you send
            there is a Cloud request.
          </p>
          <p style={{ margin: 0 }}>
            Cloud conversations are encrypted in transit and at rest. We do not sell your data, and
            we do not use your prompts, responses, files or voice recordings to train or improve
            AGI-owned models. The {MODEL_IMPROVEMENT_HEADING} choices below apply only if that
            changes, and both stay off unless you turn them on. Cloud requests are routed to the
            hosted provider serving the model you selected, and provider-side handling is governed
            by that provider&rsquo;s terms, the current list is at{' '}
            <SettingsPageLink
              href="/subprocessors"
              style={{ color: 'var(--text-1)', textDecoration: 'underline' }}
            >
              /subprocessors
            </SettingsPageLink>
            . On the Free plan, AGI chooses the provider for the default model from the free
            capacity it holds, and some of those providers&rsquo; terms may allow them to train on
            what you send, unless you turn on Only use models that do not train on your chats above.
          </p>
          <p style={{ margin: 'var(--space-2) 0 0' }}>
            How long we keep it: a chat stays in your history until you delete it, and a deleted
            chat stays in Recently deleted for 30 days, then is deleted for good. A temporary chat
            and its attachments are removed after 30 days. When you delete your account, erasure
            starts 24 hours after you confirm, and you can cancel until then.
          </p>
        </ExpandableSection>

        <ExpandableSection title="Where each feature processes your data">
          <dl style={{ margin: 0, display: 'grid', gap: 'var(--space-2)' }}>
            {PROCESSING_LOCATIONS.map((entry) => (
              <div key={entry.feature}>
                <dt style={{ fontWeight: 500, color: 'var(--text-1)' }}>{entry.feature}</dt>
                <dd style={{ margin: 0 }}>{entry.where}</dd>
              </div>
            ))}
          </dl>
          <p style={{ margin: 'var(--space-2) 0 0' }}>
            Cloud runs in the United States. The providers named here, and what each one receives,
            are listed at{' '}
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
          <p style={{ margin: '0 0 var(--space-2)' }}>
            Browser crash reports help us fix bugs faster, and product analytics, when you allow it,
            shows which parts of the product work. Sensitive request fields are removed before error
            reports are sent. Neither setting controls server operational logs.
          </p>
        </ExpandableSection>

        {TOGGLES.map(renderToggle)}
        <section aria-labelledby="model-improvement-heading">
          <h2
            id="model-improvement-heading"
            style={{
              margin: 0,
              padding: 'var(--space-4) 0 0',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-1)',
            }}
          >
            {MODEL_IMPROVEMENT_HEADING}
          </h2>
          {MODEL_IMPROVEMENT_TOGGLES.map(renderToggle)}
          <p
            style={{
              margin: 0,
              padding: 'var(--space-3) 0 var(--space-4)',
              borderBottom: '1px solid var(--settings-border)',
              fontSize: 12,
              color: 'var(--text-3)',
              lineHeight: 1.5,
            }}
          >
            {MODEL_IMPROVEMENT_NOTE}
          </p>
        </section>
        <ProductAnalyticsConsentRow />
        <MarketingEmailConsentRow />
        <NamedProviderConsentRows />
      </div>

      <UsOnlyRoutingPanel />

      {/* Your data */}
      <div>
        <div
          style={{
            padding: 'var(--space-4) 0',
            borderBottom: '1px solid var(--settings-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
              Shared links
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
              Review and revoke links created from Web conversations.
            </div>
          </div>
          <SettingsSectionLink
            section="shared-links"
            style={{
              fontSize: 14,
              color: 'var(--text-2)',
              textDecoration: 'none',
              padding: 'var(--space-2) var(--space-4)',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            Manage
          </SettingsSectionLink>
        </div>

        <div
          style={{
            padding: 'var(--space-4) 0',
            borderBottom: '1px solid var(--settings-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
              Archived chats
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
              Restore archived chats or move them to Recently deleted.
            </div>
          </div>
          <SettingsSectionLink
            section="archived"
            style={{
              fontSize: 14,
              color: 'var(--text-2)',
              textDecoration: 'none',
              padding: 'var(--space-2) var(--space-4)',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            Manage
          </SettingsSectionLink>
        </div>

        <div
          style={{
            padding: 'var(--space-4) 0',
            borderTop: '1px solid var(--settings-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
              Recently deleted
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
              Put back a chat you deleted in the last 30 days.
            </div>
          </div>
          <SettingsSectionLink
            section="deleted-chats"
            style={{
              fontSize: 14,
              color: 'var(--text-2)',
              textDecoration: 'none',
              padding: 'var(--space-2) var(--space-4)',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            Manage
          </SettingsSectionLink>
        </div>

        <BulkConversationControls />

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
            padding: 'var(--space-4) 0',
            borderBottom: '1px solid var(--settings-border)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
              Start new chats as temporary
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
              Not saved to history or search, and deleted after 30 days. Project chats are saved.
            </div>
          </div>
          <Switch
            checked={newChatsTemporary}
            aria-label="Start new chats as temporary"
            onCheckedChange={setNewChatsTemporary}
          />
        </div>

        {/*
          The rights surface at /privacy/requests, consent ledger and a
          rights-request form, was built and reachable only by typing the URL.
          A DPDP/GDPR rights path the data subject cannot find from their own
          privacy settings is not a rights path.
        */}
        <div
          style={{
            padding: 'var(--space-4) 0',
            borderBottom: '1px solid var(--settings-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
              Privacy requests
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
              Review your consent record, or ask us to access, correct, or erase your data.
            </div>
          </div>
          <a
            href="/privacy/requests"
            style={{
              padding: 'var(--space-2) var(--space-4)',
              fontSize: 14,
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
            padding: 'var(--space-4) 0',
            borderBottom: '1px solid var(--settings-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
              Uploaded files
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--space-1)' }}>
              Files and generated media. Review or delete them in your Library.
            </div>
          </div>
          <a
            href="/chat/library"
            style={{
              padding: 'var(--space-2) var(--space-4)',
              fontSize: 14,
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

        <DataExportRow />

        {/* What this browser sends to the account, in one line. It replaces a
            whole Sync page that described other surfaces' behaviour and showed
            a status it had no way to observe. */}
        <p
          data-testid="browser-sync-statement"
          style={{
            margin: 0,
            padding: 'var(--space-4) 0',
            fontSize: 12,
            color: 'var(--text-3)',
            lineHeight: 1.55,
          }}
        >
          {BROWSER_SYNC_STATEMENT}
        </p>

        {/* Memory preferences row */}
        <div
          style={{
            padding: 'var(--space-4) 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
            Memory preferences
          </div>
          <SettingsSectionLink
            section="personalization"
            style={{
              fontSize: 14,
              color: 'var(--text-2)',
              textDecoration: 'none',
              padding: 'var(--space-2) var(--space-4)',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            Manage
          </SettingsSectionLink>
        </div>
      </div>

      {/* Delete account, cross-link only. Deletion has exactly one
          implementation, on Account settings, via useDeleteAccount. Same
          pattern as SecuritySection's session-management cross-link: point at
          the owning surface instead of re-implementing it here. */}
      <div aria-label="Account deletion availability">
        <p
          style={{
            margin: '0 0 var(--space-1)',
            fontSize: 14,
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
