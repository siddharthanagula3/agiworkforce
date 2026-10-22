'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  SYSTEM_PERMISSION_KINDS,
  SYSTEM_PERMISSION_LABELS,
  SYSTEM_PERMISSION_PURPOSES,
  describeHostPlatform,
  permissionKey,
  type DesktopPermissionsReview,
  type ReviewedPermission,
  type SystemPermissionKind,
  type SystemPermissionStatus,
} from '@agiworkforce/local-runtime-contract';
import { Spinner } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import { useElectronHost } from '../lib/host';
import {
  openSystemPermissionSettings,
  readDesktopPermissions,
  revokeDesktopPermission,
} from '../lib/runtime-client';
import {
  DESKTOP_SETTINGS_BUTTON_CLASS,
  DesktopSettingsEmpty,
  DesktopSettingsGroup,
  DesktopSettingsHeading,
  DesktopSettingsRow,
} from './DesktopSettingsRow';

const HEADING = 'Permissions';
const HEADING_HINT = 'Remove an answer and AGI Desktop asks again the next time it needs it.';
const ANSWERS_HEADING = 'Your answers';
const NO_ANSWERS = 'None yet. AGI Desktop asks the first time it needs each permission.';
const SYSTEM_HINT = 'Computer use, screenshots and dictation need these.';
const REFRESH_LABEL = 'Refresh';
const OPEN_SETTINGS_LABEL = 'Open System Settings';
const LOAD_FAILED = 'Permissions could not be read from the app.';
const REMOVE_FAILED = 'That answer was not removed.';

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

export function isApplicationAnswer(decision: ReviewedPermission): boolean {
  return decision.capability === 'application.control' && decision.scope.kind === 'application';
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

export function answerLabel(decision: ReviewedPermission): string {
  const text = decision.description;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

export function answerHint(decision: ReviewedPermission): string {
  if (decision.state === 'denied') {
    return decision.duration === 'always' ? 'Always refused' : 'Refused until you quit the app';
  }
  if (decision.duration === 'always') return 'Always allowed';
  if (decision.duration === 'once') return 'Allowed once';
  return 'Allowed until you quit the app';
}

function systemHeading(platform: string): string {
  const name = describeHostPlatform(platform);
  return name ? `${name} privacy settings` : 'System privacy settings';
}

export interface DesktopPermissions {
  review: DesktopPermissionsReview | null;
  error: string | null;
  removing: string | null;
  refresh: () => void;
  remove: (decision: ReviewedPermission) => void;
}

export function useDesktopPermissions(): DesktopPermissions {
  const host = useElectronHost();
  const [review, setReview] = useState<DesktopPermissionsReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const refresh = useCallback(() => {
    readDesktopPermissions()
      .then((next) => {
        setReview(next);
        setError(null);
      })
      .catch((cause: unknown) => setError(toUserMessage(cause, LOAD_FAILED)));
  }, []);

  useEffect(() => {
    if (!host) return undefined;
    refresh();
    window.addEventListener('focus', refresh);
    const unsubscribe = host.onRuntimeEvent((event) => {
      if (event.kind === 'permission-changed' || event.kind === 'computer-use-changed') refresh();
    });
    return () => {
      window.removeEventListener('focus', refresh);
      unsubscribe();
    };
  }, [host, refresh]);

  const remove = useCallback((decision: ReviewedPermission) => {
    const key = permissionKey(decision.capability, decision.scope);
    setRemoving(key);
    revokeDesktopPermission(decision)
      .then((next) => {
        setReview(next);
        setError(null);
      })
      .catch((cause: unknown) => setError(toUserMessage(cause, REMOVE_FAILED)))
      .finally(() => setRemoving(null));
  }, []);

  return { review, error, removing, refresh, remove };
}

export function PermissionAnswerRow({
  decision,
  label = answerLabel(decision),
  disabled,
  onRemove,
}: {
  decision: ReviewedPermission;
  label?: string;
  disabled: boolean;
  onRemove: (decision: ReviewedPermission) => void;
}) {
  const action = decision.state === 'denied' ? 'Ask again' : 'Remove';
  return (
    <DesktopSettingsRow label={label} hint={answerHint(decision)}>
      <button
        type="button"
        className={DESKTOP_SETTINGS_BUTTON_CLASS}
        disabled={disabled}
        aria-label={`${action}: ${label}`}
        onClick={() => onRemove(decision)}
      >
        {action}
      </button>
    </DesktopSettingsRow>
  );
}

export function DesktopPermissionsSection() {
  const host = useElectronHost();
  const { review, error, removing, refresh, remove } = useDesktopPermissions();

  if (!host) return null;

  const answers = review?.decisions.filter((decision) => !isApplicationAnswer(decision)) ?? [];

  return (
    <section className="flex flex-col gap-4" aria-label={HEADING}>
      <DesktopSettingsHeading title={HEADING} hint={HEADING_HINT} />

      {error !== null && (
        <p className="text-sm text-[var(--settings-destructive-text)]" role="alert">
          {error}
        </p>
      )}

      {review === null ? (
        error === null ? (
          <Spinner aria-label="Loading permissions" />
        ) : null
      ) : (
        <>
          <DesktopSettingsGroup title={ANSWERS_HEADING}>
            {answers.length === 0 ? (
              <DesktopSettingsEmpty>{NO_ANSWERS}</DesktopSettingsEmpty>
            ) : (
              answers.map((decision) => (
                <PermissionAnswerRow
                  key={permissionKey(decision.capability, decision.scope)}
                  decision={decision}
                  disabled={removing !== null}
                  onRemove={remove}
                />
              ))
            )}
          </DesktopSettingsGroup>

          <DesktopSettingsGroup
            title={systemHeading(host.platform)}
            hint={SYSTEM_HINT}
            action={
              <button type="button" className={DESKTOP_SETTINGS_BUTTON_CLASS} onClick={refresh}>
                {REFRESH_LABEL}
              </button>
            }
          >
            {SYSTEM_PERMISSION_KINDS.map((kind) => (
              <SystemPermissionRow key={kind} kind={kind} status={review.system[kind]} />
            ))}
          </DesktopSettingsGroup>
        </>
      )}
    </section>
  );
}
