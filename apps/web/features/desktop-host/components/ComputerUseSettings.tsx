'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  COMPUTER_USE_STOP_SHORTCUT,
  describeAccelerator,
  permissionKey,
  type BrowserPairingState,
  type ComputerUseStatus,
  type ReviewedPermission,
} from '@agiworkforce/local-runtime-contract';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import { Switch } from '@agiworkforce/ui';
import { SettingsSectionLink } from '@/features/settings/components/SettingsSectionLink';
import { helpArticlePath } from '@/lib/support/help-paths';
import { useComputerUse } from '../hooks/use-computer-use';
import { useElectronHost } from '../lib/host';
import { readBrowserPairing } from '../lib/runtime-client';
import {
  PermissionAnswerRow,
  SystemPermissionRow,
  isApplicationAnswer,
  useDesktopPermissions,
} from './DesktopPermissionsSection';
import {
  DESKTOP_SETTINGS_BUTTON_CLASS,
  DesktopSettingsEmpty,
  DesktopSettingsGroup,
  DesktopSettingsHeading,
  DesktopSettingsRow,
} from './DesktopSettingsRow';
import { RefuseAppPicker } from './RefuseAppPicker';

const HEADING = 'Computer use';
const HEADING_HINT = 'Let AGI see your screen and use the mouse and keyboard in apps you allow.';
const CONTROL_HEADING = 'Control';
const ANY_APP_LABEL = 'Any app';
const CHROME_LABEL = 'Chrome';
const CHROME_HINT = `Lets AGI act in Chrome through the ${PRODUCT_NAMES.extension}.`;
const CHROME_CHECKING = 'Checking the browser connection…';
const CHROME_CONNECTED = 'Connected';
const CHROME_PAIRED_AWAY = 'Paired, but Chrome is not connected right now';
const CHROME_NOT_PAIRED = `${PRODUCT_NAMES.extension} not paired`;
const CHROME_UNREACHABLE = 'Chrome cannot reach this app';
const CHROME_LOAD_FAILED = 'The browser connection could not be read.';
const MANAGE_LABEL = 'Manage';
const ALLOWED_APPS_HEADING = 'Allowed apps';
const REFUSED_APPS_HEADING = 'Refused apps';
const NO_APPS = 'None yet';
const NO_REFUSED_APPS = 'None yet. AGI does not control an app you add here.';
const HELP_DOC_ID = 'computer-use';
const LEARN_MORE_LABEL = 'Learn more';
const LEARN_MORE_ARIA = 'Learn more about computer use';
const STOP_LABEL = 'Stop';
const TAKE_OVER_LABEL = 'Take over';
const HAND_BACK_LABEL = 'Hand back';
const REFUSED_LABEL = 'Refused for now';
const REFUSED_HINT =
  'You refused computer use when AGI asked. It stays off until you quit the app or ask again.';
const ASK_AGAIN_LABEL = 'Ask again';

function toggleHint(stopKey: string): string {
  const stopping = stopKey ? `${stopKey} stops it at any time` : 'Stop ends it at any time';
  return `AGI asks before it controls each app, and ${stopping}.`;
}

function phaseCopy(status: ComputerUseStatus): { label: string; hint: string } | null {
  if (status.phase === 'active') {
    return {
      label: 'AGI is using your computer',
      hint: 'Take over pauses it until you hand the screen back. Stop ends it and withdraws its permission.',
    };
  }
  if (status.phase === 'paused') {
    return {
      label: 'Paused. You have the screen.',
      hint:
        status.pausedBy === 'user-input'
          ? 'AGI paused when you moved the pointer or typed. Hand back to let it carry on.'
          : 'AGI waits until you hand the screen back.',
    };
  }
  return null;
}

type ChromeReading = { state: BrowserPairingState } | { failed: true } | null;

function chromeNote(reading: ChromeReading): { text: string; failure: boolean } {
  if (reading === null) return { text: CHROME_CHECKING, failure: false };
  if ('failed' in reading) return { text: CHROME_LOAD_FAILED, failure: true };
  const { state } = reading;
  if (!state.bridgeListening || !state.hostInstalled) {
    return { text: CHROME_UNREACHABLE, failure: true };
  }
  if (state.connected) return { text: CHROME_CONNECTED, failure: false };
  if (state.paired) return { text: CHROME_PAIRED_AWAY, failure: false };
  return { text: CHROME_NOT_PAIRED, failure: false };
}

function useChromeReading(enabled: boolean): ChromeReading {
  const host = useElectronHost();
  const [reading, setReading] = useState<ChromeReading>(null);

  const refresh = useCallback(() => {
    readBrowserPairing()
      .then((state) => setReading({ state }))
      .catch(() => setReading({ failed: true }));
  }, []);

  useEffect(() => {
    if (!host || !enabled) return undefined;
    refresh();
    return host.onRuntimeEvent((event) => {
      if (event.kind === 'browser-pairing-changed') setReading({ state: event.state });
    });
  }, [host, enabled, refresh]);

  return reading;
}

function LearnMoreLink() {
  return (
    <a
      href={helpArticlePath(HELP_DOC_ID)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={LEARN_MORE_ARIA}
      className="text-[var(--text-1)] underline underline-offset-2"
    >
      {LEARN_MORE_LABEL}
    </a>
  );
}

function AppAnswers({
  title,
  answers,
  disabled,
  empty = NO_APPS,
  action,
  onRemove,
}: {
  title: string;
  answers: ReviewedPermission[];
  disabled: boolean;
  empty?: string;
  action?: ReactNode;
  onRemove: (decision: ReviewedPermission) => void;
}) {
  return (
    <DesktopSettingsGroup title={title} {...(action === undefined ? {} : { action })}>
      {answers.length === 0 ? (
        <DesktopSettingsEmpty>{empty}</DesktopSettingsEmpty>
      ) : (
        answers.map((decision) => (
          <PermissionAnswerRow
            key={permissionKey(decision.capability, decision.scope)}
            decision={decision}
            disabled={disabled}
            onRemove={onRemove}
          />
        ))
      )}
    </DesktopSettingsGroup>
  );
}

export function ComputerUseSettings() {
  const host = useElectronHost();
  const { status, error, busy, setEnabled, stop, takeOver, handBack, askAgain } = useComputerUse();
  const permissions = useDesktopPermissions();
  const chrome = useChromeReading(host !== null);
  const refusedTargets = useMemo(
    () =>
      new Set(
        (permissions.review?.decisions ?? [])
          .filter((decision) => isApplicationAnswer(decision) && decision.state === 'denied')
          .flatMap((decision) => (decision.scope.target ? [decision.scope.target] : [])),
      ),
    [permissions.review],
  );

  if (!host) return null;

  const phase = status ? phaseCopy(status) : null;
  const stopKey = describeAccelerator(
    status?.stopShortcut ?? COMPUTER_USE_STOP_SHORTCUT,
    host.platform,
  );
  const chromeStatus = chromeNote(chrome);
  const appAnswers = permissions.review?.decisions.filter(isApplicationAnswer) ?? [];
  const refusedAnswers = appAnswers.filter((decision) => decision.state === 'denied');
  const canRefuse = status?.available === true;
  const failures = [error, permissions.error].filter((message) => message !== null);

  return (
    <section className="flex flex-col gap-6" aria-label={HEADING}>
      <DesktopSettingsHeading title={HEADING} hint={HEADING_HINT} />

      {failures.map((message) => (
        <p key={message} className="text-sm text-[var(--settings-destructive-text)]" role="alert">
          {message}
        </p>
      ))}

      <DesktopSettingsGroup title={CONTROL_HEADING}>
        <DesktopSettingsRow
          label={ANY_APP_LABEL}
          hint={
            <>
              {toggleHint(stopKey)} <LearnMoreLink />
            </>
          }
          {...(status && !status.available && status.unavailableReason
            ? { note: status.unavailableReason }
            : {})}
        >
          <Switch
            checked={status?.enabled ?? false}
            disabled={!status || busy}
            onCheckedChange={setEnabled}
            aria-label={ANY_APP_LABEL}
          />
        </DesktopSettingsRow>

        <DesktopSettingsRow
          label={CHROME_LABEL}
          hint={CHROME_HINT}
          note={chromeStatus.text}
          noteIsFailure={chromeStatus.failure}
        >
          <SettingsSectionLink
            section="capabilities"
            className={`${DESKTOP_SETTINGS_BUTTON_CLASS} inline-flex items-center`}
          >
            {MANAGE_LABEL}
          </SettingsSectionLink>
        </DesktopSettingsRow>

        {status?.enabled && status.grant === 'denied' ? (
          <DesktopSettingsRow label={REFUSED_LABEL} hint={REFUSED_HINT}>
            <button
              type="button"
              className={DESKTOP_SETTINGS_BUTTON_CLASS}
              disabled={busy}
              onClick={askAgain}
            >
              {ASK_AGAIN_LABEL}
            </button>
          </DesktopSettingsRow>
        ) : null}

        {status?.enabled ? (
          <>
            <SystemPermissionRow kind="accessibility" status={status.system.accessibility} />
            <SystemPermissionRow kind="screen-recording" status={status.system.screenRecording} />
          </>
        ) : null}

        {status && phase ? (
          <DesktopSettingsRow label={phase.label} hint={phase.hint}>
            <span className="flex shrink-0 gap-2">
              {status.phase === 'paused' ? (
                <button
                  type="button"
                  className={DESKTOP_SETTINGS_BUTTON_CLASS}
                  disabled={busy}
                  onClick={handBack}
                >
                  {HAND_BACK_LABEL}
                </button>
              ) : (
                <button
                  type="button"
                  className={DESKTOP_SETTINGS_BUTTON_CLASS}
                  disabled={busy}
                  onClick={takeOver}
                >
                  {TAKE_OVER_LABEL}
                </button>
              )}
              <button
                type="button"
                className={DESKTOP_SETTINGS_BUTTON_CLASS}
                disabled={busy}
                onClick={stop}
              >
                {STOP_LABEL}
              </button>
            </span>
          </DesktopSettingsRow>
        ) : null}
      </DesktopSettingsGroup>

      {permissions.review !== null && (
        <>
          <AppAnswers
            title={ALLOWED_APPS_HEADING}
            answers={appAnswers.filter((decision) => decision.state === 'granted')}
            disabled={permissions.removing !== null}
            onRemove={permissions.remove}
          />
          <AppAnswers
            title={REFUSED_APPS_HEADING}
            answers={refusedAnswers}
            disabled={permissions.removing !== null}
            {...(canRefuse
              ? {
                  empty: NO_REFUSED_APPS,
                  action: (
                    <RefuseAppPicker
                      refused={refusedTargets}
                      disabled={permissions.refusing}
                      onPick={(app) => permissions.refuse(app.bundleId)}
                    />
                  ),
                }
              : {})}
            onRemove={permissions.remove}
          />
        </>
      )}
    </section>
  );
}
