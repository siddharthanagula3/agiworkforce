'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NamedProviderNotice } from '@agiworkforce/compliance';
import { fetchPreferenceNamespace } from '@/app/settings/_lib/preferences-client';
import { NAMED_PROVIDER_CONSENT_NAMESPACE } from '@/lib/named-provider-consent';
import {
  NAMED_PROVIDER_CONSENT_CHANGED_EVENT,
  NAMED_PROVIDER_CONSENT_REQUIRED_EVENT,
  namedProviderConsentGiven,
  namedProviderConsentRecorded,
  saveNamedProviderConsent,
  type NamedProviderConsentChangedDetail,
  type NamedProviderConsentRequiredDetail,
} from '../lib/named-provider-consent-client';

/**
 * `unknown` is not a refusal: the account's answer has not been read, or could
 * not be, and the server decides the turn. Only `missing` is known to need the
 * notice.
 */
export type NamedProviderConsentStatus = 'unknown' | 'accepted' | 'missing';

interface ProviderConsent {
  status: NamedProviderConsentStatus;
  recorded: boolean;
}

type ProviderConsents = Readonly<Record<string, ProviderConsent>>;

const NOTHING_STORED: Record<string, unknown> = {};
const NOTHING_READ: ProviderConsents = {};
const UNREAD: ProviderConsent = { status: 'unknown', recorded: false };

export interface NamedProviderConsents {
  statusOf: (providerId: string) => NamedProviderConsentStatus;
  recordedFor: (providerId: string) => boolean;
  readFailed: boolean;
}

export function useNamedProviderConsents(
  notices: readonly NamedProviderNotice[],
): NamedProviderConsents {
  const [consents, setConsents] = useState<ProviderConsents>(NOTHING_READ);
  const [readFailed, setReadFailed] = useState(false);

  useEffect(() => {
    setConsents(NOTHING_READ);
    setReadFailed(false);
    if (notices.length === 0) return;
    let cancelled = false;
    const covers = (providerId: string | undefined) =>
      notices.some((notice) => notice.providerId === providerId);
    fetchPreferenceNamespace(NAMED_PROVIDER_CONSENT_NAMESPACE, NOTHING_STORED)
      .then((namespace) => {
        if (cancelled) return;
        setConsents((current) => ({
          ...Object.fromEntries(
            notices.map((notice): [string, ProviderConsent] => [
              notice.providerId,
              {
                status: namedProviderConsentGiven(namespace, notice) ? 'accepted' : 'missing',
                recorded: namedProviderConsentRecorded(namespace, notice),
              },
            ]),
          ),
          ...current,
        }));
      })
      .catch(() => {
        if (!cancelled) setReadFailed(true);
      });

    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<NamedProviderConsentChangedDetail>).detail;
      if (!covers(detail?.providerId)) return;
      setConsents((current) => ({
        ...current,
        [detail.providerId]: { status: detail.accepted ? 'accepted' : 'missing', recorded: true },
      }));
    };
    const onRequired = (event: Event) => {
      const detail = (event as CustomEvent<NamedProviderConsentRequiredDetail>).detail;
      if (!covers(detail?.providerId)) return;
      setConsents((current) => ({
        ...current,
        [detail.providerId]: {
          status: 'missing',
          recorded: current[detail.providerId]?.recorded ?? false,
        },
      }));
    };
    window.addEventListener(NAMED_PROVIDER_CONSENT_CHANGED_EVENT, onChanged);
    window.addEventListener(NAMED_PROVIDER_CONSENT_REQUIRED_EVENT, onRequired);
    return () => {
      cancelled = true;
      window.removeEventListener(NAMED_PROVIDER_CONSENT_CHANGED_EVENT, onChanged);
      window.removeEventListener(NAMED_PROVIDER_CONSENT_REQUIRED_EVENT, onRequired);
    };
  }, [notices]);

  const statusOf = useCallback(
    (providerId: string) => (consents[providerId] ?? UNREAD).status,
    [consents],
  );
  const recordedFor = useCallback(
    (providerId: string) => (consents[providerId] ?? UNREAD).recorded,
    [consents],
  );
  return useMemo(
    () => ({ statusOf, recordedFor, readFailed }),
    [statusOf, recordedFor, readFailed],
  );
}

export interface NamedProviderConsentState {
  status: NamedProviderConsentStatus;
  recorded: boolean;
  readFailed: boolean;
  accept: () => Promise<void>;
  withdraw: () => Promise<void>;
}

export function useNamedProviderConsent(notice: NamedProviderNotice): NamedProviderConsentState {
  const notices = useMemo(() => [notice], [notice]);
  const { statusOf, recordedFor, readFailed } = useNamedProviderConsents(notices);
  const accept = useCallback(() => saveNamedProviderConsent(notice, true), [notice]);
  const withdraw = useCallback(() => saveNamedProviderConsent(notice, false), [notice]);

  return {
    status: statusOf(notice.providerId),
    recorded: recordedFor(notice.providerId),
    readFailed,
    accept,
    withdraw,
  };
}
