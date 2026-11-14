'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { PreferenceOwner } from '@/app/settings/_lib/preferences-client';
import { createRequestAuthority, type RequestAuthority } from '@/lib/identity/request-authority';
import { usePreferenceOwner, usePreferenceView } from '../hooks/use-preference-owner';
import {
  readNotificationPreferences,
  saveNotificationPreferences,
} from '../services/notification-preferences-client';
import {
  NOTIFICATION_DEFAULTS,
  type NotifKey,
  type NotificationValues,
} from '../lib/notification-preferences';
import { Switch } from '@agiworkforce/ui';
import { BrowserNotificationStatus, useWebPushToggle } from '@/features/notifications';
import {
  isReleased,
  SURFACE_STATUS,
  type SurfaceId,
  type SurfaceStatusMap,
} from '@/lib/surface-status';
import { toUserMessage } from '@/lib/user-error-message';
import { SaveStatusLine } from '../components/SaveStatusLine';
import { SettingsPageLink } from '../components/SettingsSectionLink';
import styles from './NotificationsSection.module.css';

export type { NotifKey } from '../lib/notification-preferences';

interface ChannelSpec {
  id: NotifKey;
  channel: string;
  surface?: SurfaceId;
  browserDependent?: boolean;
}

interface EventSpec {
  heading: string;
  subheading: string;
  detail?: string;
  channels: ChannelSpec[];
  link?: { label: string; href: string };
}

const EVENTS: ReadonlyArray<EventSpec> = [
  {
    heading: 'Reply ready',
    subheading: 'When a reply finishes while this tab is in the background.',
    channels: [{ id: 'browserReplyReady', channel: 'Browser', browserDependent: true }],
  },
  {
    heading: 'Scheduled task finished',
    subheading: 'When a scheduled task completes or fails.',
    detail: 'Runs continue on the server while you are away. Results remain available in Tasks.',
    channels: [
      { id: 'emailScheduleDone', channel: 'Email' },
      {
        id: 'mobilePushScheduleDone',
        channel: 'Mobile push',
        surface: 'mobile',
      },
    ],
    link: { label: 'Manage tasks', href: '/tasks' },
  },
  {
    heading: 'Security alerts',
    subheading: 'Always shown in-app, including quiet hours.',
    detail:
      'Sign-in, password, email, two-factor and device changes. Advanced Account Security needs email.',
    channels: [{ id: 'emailSecurityAlerts', channel: 'Email' }],
  },
  {
    heading: 'Usage',
    subheading: 'Usage-limit resets on registered browsers and mobile devices.',
    channels: [{ id: 'pushUsageReset', channel: 'Push', browserDependent: true }],
  },
];

const AGENT_RUN_HEADING = 'Agent run updates';
const AGENT_RUN_SCOPE_NOTE = 'Completions, failures and approval requests. This browser only.';

const OFF_VALUE = 'off';
const CHANNEL_SEPARATOR = '+';

interface ChannelOption {
  value: string;
  label: string;
  ids: NotifKey[];
}

/**
 * Every non-empty combination of an event's channels, plus Off. An event
 * with two independently toggleable channels (Email, Mobile push) keeps
 * every state the old per-channel switches could reach, including both at
 * once, as one option in a single select instead of two switches.
 */
function channelOptions(event: EventSpec): ChannelOption[] {
  const combinations: NotifKey[][] = [];
  for (let mask = 1; mask < 1 << event.channels.length; mask++) {
    combinations.push(
      event.channels.filter((_, index) => (mask & (1 << index)) !== 0).map((c) => c.id),
    );
  }
  return [
    { value: OFF_VALUE, label: 'Off', ids: [] },
    ...combinations.map((ids) => ({
      value: ids.join(CHANNEL_SEPARATOR),
      label: ids
        .map((id) => event.channels.find((channel) => channel.id === id)?.channel ?? id)
        .join(', '),
      ids,
    })),
  ];
}

function offeredEvents(statuses: SurfaceStatusMap): EventSpec[] {
  return EVENTS.map((event) => ({
    ...event,
    channels: event.channels.filter(
      (channel) => !channel.surface || isReleased(channel.surface, statuses),
    ),
  }));
}

export function NotificationsSection({
  surfaceStatus = SURFACE_STATUS,
}: {
  surfaceStatus?: SurfaceStatusMap;
} = {}) {
  const owner = usePreferenceOwner();
  const eligibility = offeredEvents(surfaceStatus)
    .map((event) => event.channels.map((channel) => channel.id).join(','))
    .join(';');
  const observed = useRef({ eligibility, generation: 0 });
  if (observed.current.eligibility !== eligibility) {
    observed.current = { eligibility, generation: observed.current.generation + 1 };
  }
  const generation = observed.current.generation;
  const eligibilityCurrent = useCallback(
    () => observed.current.generation === generation,
    [generation],
  );
  return (
    <OwnedNotificationsSection
      owner={owner}
      eligibilityCurrent={eligibilityCurrent}
      surfaceStatus={surfaceStatus}
    />
  );
}

function OwnedNotificationsSection({
  owner,
  eligibilityCurrent,
  surfaceStatus,
}: {
  owner: PreferenceOwner | null;
  eligibilityCurrent: () => boolean;
  surfaceStatus: SurfaceStatusMap;
}) {
  const browserStatusId = useId();
  const capture = usePreferenceView(owner);
  const [state, setState] = useState<NotificationValues>({ ...NOTIFICATION_DEFAULTS });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!owner);
  const [hasChanged, setHasChanged] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const ready = useRef<object | null>(null);
  const [readySnapshot, setReadySnapshot] = useState<object | null>(null);
  const operation = useRef<RequestAuthority | null>(null);
  const recovery = useRef<object | null>(null);
  const [recoverySnapshot, setRecoverySnapshot] = useState<object | null>(null);
  const [renderedOwner, setRenderedOwner] = useState({ owner, eligibilityCurrent });
  if (renderedOwner.owner !== owner || renderedOwner.eligibilityCurrent !== eligibilityCurrent) {
    operation.current?.retire();
    operation.current = null;
    ready.current = null;
    recovery.current = null;
    setRenderedOwner({ owner, eligibilityCurrent });
    setReadySnapshot(null);
    setRecoverySnapshot(null);
    setState({ ...NOTIFICATION_DEFAULTS });
    setLoading(!!owner);
    setSaving(false);
    setSaveError(null);
    setHasChanged(false);
    setLoadError(false);
  }
  const editable =
    !!owner?.isCurrent() &&
    eligibilityCurrent() &&
    ready.current !== null &&
    ready.current === readySnapshot &&
    !loading &&
    !saving &&
    !loadError;

  useEffect(() => {
    ready.current = null;
    recovery.current = null;
    if (!owner) return;
    const viewCurrent = capture();
    const authority = createRequestAuthority(
      owner.session,
      () => viewCurrent() && eligibilityCurrent(),
    );
    operation.current = authority;
    setLoading(true);
    setSaveError(null);
    void readNotificationPreferences(authority)
      .then((snapshot) => {
        if (!authority.isCurrent()) return;
        setState({ ...NOTIFICATION_DEFAULTS, ...snapshot.stored });
        setLoadError(false);
        const snapshotIdentity = {};
        ready.current = snapshotIdentity;
        setReadySnapshot(snapshotIdentity);
      })
      .catch((error: unknown) => {
        if (!authority.isCurrent()) return;
        const recoveryIdentity = {};
        recovery.current = recoveryIdentity;
        setRecoverySnapshot(recoveryIdentity);
        setLoadError(true);
        setSaveError(toUserMessage(error, 'Could not load notification preferences'));
      })
      .finally(() => {
        if (authority.isCurrent()) {
          setLoading(false);
          if (operation.current === authority) operation.current = null;
        }
        authority.retire();
      });
    return () => {
      ready.current = null;
      authority.retire();
      operation.current?.retire();
      operation.current = null;
    };
  }, [owner, capture, eligibilityCurrent, loadAttempt]);

  async function setEventChannels(event: EventSpec, enabledIds: NotifKey[]) {
    const viewCurrent = capture();
    if (
      !owner ||
      !viewCurrent() ||
      !eligibilityCurrent() ||
      !readySnapshot ||
      ready.current !== readySnapshot ||
      operation.current
    )
      return;
    const offered = offeredEvents(surfaceStatus).find(
      (candidate) => candidate.heading === event.heading,
    );
    if (!offered || enabledIds.some((id) => !offered.channels.some((channel) => channel.id === id)))
      return;
    const patch = Object.fromEntries(
      offered.channels.map((channel) => [channel.id, enabledIds.includes(channel.id)]),
    );
    const authority = createRequestAuthority(
      owner.session,
      () => viewCurrent() && eligibilityCurrent(),
    );
    operation.current = authority;
    ready.current = null;
    setSaving(true);
    setSaveError(null);
    setHasChanged(false);
    try {
      let confirmed = false;
      try {
        await saveNotificationPreferences(authority, patch);
        if (!authority.isCurrent()) return;
        confirmed = true;
      } catch {
        if (!authority.isCurrent()) return;
      }
      try {
        const snapshot = await readNotificationPreferences(authority);
        if (!authority.isCurrent()) return;
        setState({ ...NOTIFICATION_DEFAULTS, ...snapshot.stored });
        setLoadError(false);
        setHasChanged(confirmed);
        setSaveError(
          confirmed
            ? null
            : 'Save could not be confirmed. Latest account preferences loaded; review your selection before changing it again.',
        );
        const snapshotIdentity = {};
        ready.current = snapshotIdentity;
        setReadySnapshot(snapshotIdentity);
      } catch (error) {
        if (!authority.isCurrent()) return;
        const recoveryIdentity = {};
        recovery.current = recoveryIdentity;
        setRecoverySnapshot(recoveryIdentity);
        setLoadError(true);
        setSaveError(toUserMessage(error, 'Could not refresh notification preferences'));
      }
    } finally {
      if (authority.isCurrent()) setSaving(false);
      if (operation.current === authority) operation.current = null;
      authority.retire();
    }
  }

  function retryLoad() {
    if (
      !capture()() ||
      !eligibilityCurrent() ||
      operation.current ||
      !loadError ||
      !recoverySnapshot ||
      recovery.current !== recoverySnapshot
    )
      return;
    ready.current = null;
    recovery.current = null;
    setLoading(true);
    setLoadAttempt((attempt) => attempt + 1);
  }

  return (
    <div
      data-testid="notification-preferences"
      className={styles['content']}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
    >
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
          Notifications
        </h1>
        {!owner || loading || saving || saveError || hasChanged ? (
          <SaveStatusLine
            failed={saveError !== null}
            className={styles['helper']}
            style={{ margin: 0 }}
          >
            {!owner
              ? 'Sign in to load account preferences.'
              : loading
                ? 'Loading account settings...'
                : saving
                  ? 'Saving...'
                  : saveError
                    ? saveError
                    : 'Saved'}
          </SaveStatusLine>
        ) : null}
        {loadError && !loading && !saving ? (
          <button
            type="button"
            className="text-sm underline underline-offset-4"
            onClick={retryLoad}
          >
            Retry loading
          </button>
        ) : null}
      </div>

      <BrowserNotificationStatus id={browserStatusId} />

      <div className={styles['rows']}>
        {offeredEvents(surfaceStatus).map((event, index) => {
          const options = channelOptions(event);
          const selectedIds = event.channels
            .filter((channel) => state[channel.id])
            .map((channel) => channel.id);
          const value = selectedIds.length === 0 ? OFF_VALUE : selectedIds.join(CHANNEL_SEPARATOR);

          return (
            <section key={event.heading} aria-label={event.heading} className={styles['row']}>
              <div data-testid="notification-description" className={styles['description']}>
                <div className={styles['heading']}>{event.heading}</div>
                <div id={`${browserStatusId}-description-${index}`} className={styles['helper']}>
                  {event.subheading}
                </div>
                {event.detail ? (
                  <details className={styles['details']}>
                    <summary className={styles['summary']}>Delivery details</summary>
                    <p style={{ margin: 'var(--space-1) 0 0' }}>{event.detail}</p>
                  </details>
                ) : null}
                {event.link ? (
                  <SettingsPageLink
                    href={event.link.href}
                    className="underline underline-offset-4 max-md:py-1"
                    style={{
                      display: 'inline-block',
                      fontSize: 14,
                      color: 'var(--text-1)',
                      marginTop: 'var(--space-1)',
                    }}
                  >
                    {event.link.label}
                  </SettingsPageLink>
                ) : null}
              </div>
              <select
                aria-label={event.heading}
                aria-describedby={`${browserStatusId}-description-${index}${event.channels.some((channel) => channel.browserDependent) ? ` ${browserStatusId}` : ''}`}
                className={`${styles['control']} ${styles['select']} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                data-notification-control
                disabled={!editable}
                value={value}
                onChange={(changeEvent) => {
                  const option = options.find((o) => o.value === changeEvent.target.value);
                  if (option) void setEventChannels(event, option.ids);
                }}
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </section>
          );
        })}

        <AgentRunRow browserStatusId={browserStatusId} />
      </div>
    </div>
  );
}

function AgentRunRow({ browserStatusId }: { browserStatusId: string }) {
  const { checked, disabled, unavailable, description, onCheckedChange } = useWebPushToggle();

  return (
    <section aria-label={AGENT_RUN_HEADING} className={styles['row']}>
      <div className={styles['description']}>
        <div className={styles['heading']}>{AGENT_RUN_HEADING}</div>
        <div className={styles['helper']}>{unavailable ? description : AGENT_RUN_SCOPE_NOTE}</div>
        <details className={styles['details']}>
          <summary className={styles['summary']}>Delivery details</summary>
          <p style={{ margin: 'var(--space-1) 0 0' }}>
            Enable separately in each browser. Alerts show run status, not run output.
          </p>
        </details>
      </div>
      <div className={`${styles['control']} ${styles['switchControl']}`} data-notification-control>
        <Switch
          checked={checked}
          disabled={disabled}
          onCheckedChange={onCheckedChange}
          aria-label={AGENT_RUN_HEADING}
          aria-describedby={browserStatusId}
        />
      </div>
    </section>
  );
}
