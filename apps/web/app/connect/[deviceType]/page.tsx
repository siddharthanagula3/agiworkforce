'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import type { CSSProperties } from 'react';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Eyebrow, Prose, Section } from '@/features/marketing/components/system';
import { friendlyDeviceName, isKnownDeviceType } from './connect-client';

const STATEMENT_MAX_WIDTH = '30rem';

const statementStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  gap: 'var(--agi-space-5)',
  maxWidth: STATEMENT_MAX_WIDTH,
  marginInline: 'auto',
};

function ConnectBody() {
  const params = useParams();

  const raw = params?.['deviceType'];
  const deviceType = (Array.isArray(raw) ? raw[0] : raw) ?? 'device';
  const name = friendlyDeviceName(deviceType);

  if (!isKnownDeviceType(deviceType)) {
    return (
      <Section id="connect-unknown" labelledBy="agi-connect-unknown-title">
        <div style={statementStyle}>
          <div>
            <Eyebrow>Device sign-in</Eyebrow>
            <h1 className="agi-ds-h1" id="agi-connect-unknown-title">
              Unrecognised device.
            </h1>
          </div>
          <Prose>
            AGI does not have a sign-in flow for this device type, so there is nothing to approve.
            Start the sign-in again from the app you are trying to connect.
          </Prose>
          <a href="/" className="agi-ds-link">
            Back to home
          </a>
        </div>
      </Section>
    );
  }

  return (
    <Section id="connect-device" labelledBy="agi-connect-device-title">
      <div style={statementStyle}>
        <div>
          <Eyebrow>Device sign-in</Eyebrow>
          <h1 className="agi-ds-h1" id="agi-connect-device-title">
            Finish signing in from {name}.
          </h1>
        </div>
        <Prose>
          {name} shows a code when you start signing in. Open the link it gives you, or go to the
          verification page and approve the code you can see on {name} itself. A page that offers to
          approve a device you cannot see the code for is not one to trust.
        </Prose>
        <a href="/verify" className="agi-ds-link">
          Enter the code from {name}
        </a>
      </div>
    </Section>
  );
}

export default function ConnectDevicePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <Suspense fallback={null}>
          <ConnectBody />
        </Suspense>
      </main>
      <MarketingFooter />
    </div>
  );
}
