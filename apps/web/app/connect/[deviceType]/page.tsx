'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Eyebrow, Prose, Section, Stack } from '@/features/marketing/components/system';
import { ConnectDeviceClient, friendlyDeviceName, isKnownDeviceType } from './connect-client';

function ConnectBody() {
  const params = useParams();
  const searchParams = useSearchParams();

  const raw = params?.['deviceType'];
  const deviceType = (Array.isArray(raw) ? raw[0] : raw) ?? 'device';
  const deviceId = searchParams.get('device_id');
  const deviceFingerprint = searchParams.get('device_fingerprint');
  const name = friendlyDeviceName(deviceType);

  if (!isKnownDeviceType(deviceType)) {
    return (
      <Section id="connect-unknown" labelledBy="agi-connect-unknown-title">
        <Stack gap="loose">
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
        </Stack>
      </Section>
    );
  }

  if (!deviceId) {
    return (
      <Section id="connect-incomplete" labelledBy="agi-connect-incomplete-title">
        <Stack gap="loose">
          <div>
            <Eyebrow>Device sign-in</Eyebrow>
            <h1 className="agi-ds-h1" id="agi-connect-incomplete-title">
              This link is incomplete.
            </h1>
          </div>
          <Prose>
            The device sign-in link is missing its device id. Start the sign-in again from {name}.
          </Prose>
          <a href="/" className="agi-ds-link">
            Back to home
          </a>
        </Stack>
      </Section>
    );
  }

  return (
    <Section id="connect-device" labelledBy="agi-connect-device-title">
      <Stack gap="loose">
        <div>
          <Eyebrow>Device sign-in</Eyebrow>
          <h1 className="agi-ds-h1" id="agi-connect-device-title">
            Connect {name} to AGI?
          </h1>
        </div>
        <Prose>
          {name} is requesting to sign in to your AGI account. Approve it only if you just started
          this sign-in from {name}.
        </Prose>

        <ConnectDeviceClient
          deviceId={deviceId}
          deviceFingerprint={deviceFingerprint}
          deviceType={deviceType}
        />

        <Stack gap="tight">
          <h2 className="agi-ds-h3">Security notice</h2>
          <Prose size="sm">
            If you did not start this from {name}, choose Deny. Approving grants that device access
            to your account.
          </Prose>
        </Stack>
        <a href="/" className="agi-ds-link">
          Cancel
        </a>
      </Stack>
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
