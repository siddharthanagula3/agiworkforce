'use client';

import { useMemo, useState } from 'react';
import type { NamedProviderNotice } from '@agiworkforce/compliance';
import { Switch } from '@agiworkforce/ui';
import { NamedProviderNoticeDialog } from '@/features/models/components/NamedProviderNoticeDialog';
import { useNamedProviderConsent } from '@/features/models/hooks/use-named-provider-consent';
import { freeModelNotices } from '@/features/models/lib/named-provider-consent-client';

const SAVE_FAILED = 'That change was not saved. Try again.';
const READ_FAILED =
  'This setting could not be loaded, so it is not shown as on or off. Reload the page to see or change it.';

function NamedProviderConsentRow({ notice }: { notice: NamedProviderNotice }) {
  const consent = useNamedProviderConsent(notice);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setSaving(true);
    setError(null);
    try {
      await consent.withdraw();
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setSaving(false);
    }
  }

  if (consent.readFailed) {
    return (
      <div
        role="status"
        data-testid={`named-provider-consent-unread-${notice.providerId}`}
        style={{
          padding: 'var(--space-4) 0',
          borderBottom: '1px solid var(--settings-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
        }}
      >
        <span style={{ fontSize: 14, color: 'var(--text-1)' }}>{notice.settingLabel}</span>
        <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>{READ_FAILED}</span>
      </div>
    );
  }
  if (!consent.recorded) return null;

  return (
    <div
      data-testid={`named-provider-consent-${notice.providerId}`}
      style={{
        padding: 'var(--space-4) 0',
        borderBottom: '1px solid var(--settings-border)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', flex: 1 }}>
        <span style={{ fontSize: 14, color: 'var(--text-1)' }}>{notice.settingLabel}</span>
        <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
          {notice.settingDescription}
        </span>
        {error ? (
          <span role="alert" style={{ fontSize: 12, color: 'var(--settings-destructive-text)' }}>
            {error}
          </span>
        ) : null}
      </div>
      <Switch
        checked={consent.status === 'accepted'}
        disabled={saving}
        onCheckedChange={(next) => {
          if (next) setReviewing(true);
          else void withdraw();
        }}
        aria-label={notice.settingLabel}
      />
      <NamedProviderNoticeDialog
        notice={reviewing ? notice : null}
        onAccept={async () => {
          await consent.accept();
          setReviewing(false);
        }}
        onClose={() => setReviewing(false)}
      />
    </div>
  );
}

export function NamedProviderConsentRows() {
  const notices = useMemo(() => freeModelNotices(), []);
  return (
    <>
      {notices.map((notice) => (
        <NamedProviderConsentRow key={notice.providerId} notice={notice} />
      ))}
    </>
  );
}
