'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  SYSTEM_PERMISSION_KINDS,
  describeHostPlatform,
  permissionKey,
  type DesktopPermissionsReview,
  type ReviewedPermission,
} from '@agiworkforce/local-runtime-contract';
import { Spinner } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import { useElectronHost } from '../lib/host';
import { readDesktopPermissions, revokeDesktopPermission } from '../lib/runtime-client';
import { SystemPermissionRow } from './ComputerUseSettings';
import {
  DESKTOP_SETTINGS_BUTTON_CLASS,
  DesktopSettingsHeading,
  DesktopSettingsRow,
} from './DesktopSettingsRow';

const HEADING = 'Permissions';
const HEADING_HINT =
  'What you have allowed or refused on this computer. Remove an answer and AGI Cloud asks again the next time it needs that permission.';
const ANSWERS_HEADING = 'Your answers';
const NO_ANSWERS = 'No saved answers yet. AGI Cloud asks the first time it needs each permission.';
const LOAD_FAILED = 'Permissions could not be read from the app.';
const REMOVE_FAILED = 'That answer was not removed.';
const SUB_HEADING_CLASS = 'text-xs font-medium uppercase tracking-wider text-[var(--text-3)]';

function answerLabel(decision: ReviewedPermission): string {
  const text = decision.description;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function answerHint(decision: ReviewedPermission): string {
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

export function DesktopPermissionsSection() {
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

  const onRemove = useCallback((decision: ReviewedPermission) => {
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

  if (!host) return null;

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
          <div className="flex flex-col">
            <h3 className={SUB_HEADING_CLASS}>{ANSWERS_HEADING}</h3>
            {review.decisions.length === 0 ? (
              <p className="py-[14px] text-xs text-[var(--text-3)]">{NO_ANSWERS}</p>
            ) : (
              review.decisions.map((decision) => {
                const key = permissionKey(decision.capability, decision.scope);
                const label = answerLabel(decision);
                return (
                  <DesktopSettingsRow key={key} label={label} hint={answerHint(decision)}>
                    <button
                      type="button"
                      className={DESKTOP_SETTINGS_BUTTON_CLASS}
                      disabled={removing !== null}
                      aria-label={`${decision.state === 'denied' ? 'Ask again' : 'Remove'}: ${label}`}
                      onClick={() => onRemove(decision)}
                    >
                      {decision.state === 'denied' ? 'Ask again' : 'Remove'}
                    </button>
                  </DesktopSettingsRow>
                );
              })
            )}
          </div>

          <div className="flex flex-col">
            <h3 className={SUB_HEADING_CLASS}>{systemHeading(host.platform)}</h3>
            {SYSTEM_PERMISSION_KINDS.map((kind) => (
              <SystemPermissionRow key={kind} kind={kind} status={review.system[kind]} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
