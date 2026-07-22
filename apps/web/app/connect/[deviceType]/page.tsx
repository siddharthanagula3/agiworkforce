'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { ConnectDeviceClient, friendlyDeviceName } from './connect-client';

function ConnectBody() {
  const params = useParams();
  const searchParams = useSearchParams();

  const raw = params?.['deviceType'];
  const deviceType = (Array.isArray(raw) ? raw[0] : raw) ?? 'device';
  const deviceId = searchParams.get('device_id');
  const deviceFingerprint = searchParams.get('device_fingerprint');
  const name = friendlyDeviceName(deviceType);

  if (!deviceId) {
    return (
      <section
        className="agi-section"
        style={{ borderBottom: 'none', maxWidth: 440, margin: '0 auto' }}
      >
        <p className="agi-section-eyebrow">Device sign-in</p>
        <h1 className="agi-page-h1" style={{ marginBottom: 16 }}>
          This link is incomplete.
        </h1>
        <p className="agi-page-lede" style={{ marginBottom: 24 }}>
          The device sign-in link is missing its device id. Start the sign-in again from {name}.
        </p>
        <p style={{ fontSize: 14, color: 'var(--agi-ink-2)', textAlign: 'center' }}>
          <Link href="/" style={{ color: 'var(--agi-ink)' }}>
            Back to home
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section
      className="agi-section"
      style={{ borderBottom: 'none', maxWidth: 440, margin: '0 auto' }}
    >
      <p className="agi-section-eyebrow">Device sign-in</p>
      <h1 className="agi-page-h1" style={{ marginBottom: 16 }}>
        Connect {name} to AGI?
      </h1>
      <p className="agi-page-lede" style={{ marginBottom: 24 }}>
        {name} is requesting to sign in to your AGI account. Approve it only if you just started
        this sign-in from {name}.
      </p>

      <ConnectDeviceClient
        deviceId={deviceId}
        deviceFingerprint={deviceFingerprint}
        deviceType={deviceType}
      />

      <div className="agi-callout" style={{ marginTop: 24 }}>
        <h2 className="agi-callout-h">Security notice</h2>
        <p className="agi-callout-p">
          If you did not start this from {name}, choose Deny. Approving grants that device access to
          your account.
        </p>
      </div>
      <p style={{ marginTop: 24, fontSize: 14, color: 'var(--agi-ink-2)', textAlign: 'center' }}>
        <Link href="/" style={{ color: 'var(--agi-ink)' }}>
          Cancel
        </Link>
      </p>
    </section>
  );
}

export default function ConnectDevicePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <Suspense fallback={null}>
          <ConnectBody />
        </Suspense>
        <MarketingFooter />
      </main>
    </div>
  );
}
