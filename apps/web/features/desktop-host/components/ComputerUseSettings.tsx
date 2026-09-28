'use client';

import {
  COMPUTER_USE_STOP_SHORTCUT,
  SYSTEM_PERMISSION_LABELS,
  SYSTEM_PERMISSION_PURPOSES,
  describeAccelerator,
  type ComputerUseStatus,
  type SystemPermissionKind,
  type SystemPermissionStatus,
} from '@agiworkforce/local-runtime-contract';
import { Switch } from '@agiworkforce/ui';
import { useComputerUse } from '../hooks/use-computer-use';
import { useElectronHost } from '../lib/host';
import { openSystemPermissionSettings } from '../lib/runtime-client';
import {
  DESKTOP_SETTINGS_BUTTON_CLASS,
  DesktopSettingsHeading,
  DesktopSettingsRow,
} from './DesktopSettingsRow';

const HEADING = 'Computer use';
const HEADING_HINT =
  'Let AGI see your screen and use the mouse and keyboard on this computer when you ask it to. It asks before it controls each app, and your answers are listed under Permissions.';
const TOGGLE_LABEL = 'Computer use';
const OPEN_SETTINGS_LABEL = 'Open System Settings';
const STOP_LABEL = 'Stop';
const TAKE_OVER_LABEL = 'Take over';
const HAND_BACK_LABEL = 'Hand back';
const REFUSED_LABEL = 'Refused for now';
const REFUSED_HINT =
  'You refused computer use when AGI asked. It stays off until you quit the app or ask again.';
const ASK_AGAIN_LABEL = 'Ask again';

export const SYSTEM_PERMISSION_STATUS_TEXT: Readonly<Record<SystemPermissionStatus, string>> = {
  granted: 'Allowed',
  denied: 'Not allowed',
  'not-determined': 'Not asked yet',
  restricted: 'Blocked by your organization',
  'not-required': 'Not needed on this computer',
};

export function systemPermissionNeedsAction(status: SystemPermissionStatus): boolean {
  return status === 'denied' || status === 'not-determined';
}

function toggleHint(stopKey: string): string {
  const stopping = stopKey ? `${stopKey} stops it at any time` : 'Stop ends it at any time';
  return `Off until you turn it on. AGI asks before its first step each session, and ${stopping}.`;
}

export function SystemPermissionRow({
  kind,
  status,
}: {
  kind: SystemPermissionKind;
  status: SystemPermissionStatus;
}) {
  return (
    <DesktopSettingsRow
      label={SYSTEM_PERMISSION_LABELS[kind]}
      hint={SYSTEM_PERMISSION_PURPOSES[kind]}
      note={SYSTEM_PERMISSION_STATUS_TEXT[status]}
      noteIsFailure={status === 'denied' || status === 'restricted'}
    >
      {systemPermissionNeedsAction(status) ? (
        <button
          type="button"
          className={DESKTOP_SETTINGS_BUTTON_CLASS}
          aria-label={`${OPEN_SETTINGS_LABEL} for ${SYSTEM_PERMISSION_LABELS[kind]}`}
          onClick={() => void openSystemPermissionSettings(kind)}
        >
          {OPEN_SETTINGS_LABEL}
        </button>
      ) : null}
    </DesktopSettingsRow>
  );
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

export function ComputerUseSettings() {
  const host = useElectronHost();
  const { status, error, busy, setEnabled, stop, takeOver, handBack, askAgain } = useComputerUse();

  if (!host) return null;

  const phase = status ? phaseCopy(status) : null;
  const stopKey = describeAccelerator(
    status?.stopShortcut ?? COMPUTER_USE_STOP_SHORTCUT,
    host.platform,
  );

  return (
    <section className="flex flex-col gap-4" aria-label={HEADING}>
      <DesktopSettingsHeading title={HEADING} hint={HEADING_HINT} />

      {error !== null && (
        <p className="text-sm text-[var(--settings-destructive-text)]" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-col">
        <DesktopSettingsRow
          label={TOGGLE_LABEL}
          hint={toggleHint(stopKey)}
          {...(status && !status.available && status.unavailableReason
            ? { note: status.unavailableReason }
            : {})}
        >
          <Switch
            checked={status?.enabled ?? false}
            disabled={!status || busy}
            onCheckedChange={setEnabled}
            aria-label={TOGGLE_LABEL}
          />
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
      </div>
    </section>
  );
}
