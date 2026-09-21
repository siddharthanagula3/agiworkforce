'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { canonicalRoutePath } from '@shared/components/layout/analytics-route';

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
    agiGaPending?: unknown[][];
  }
}

const GA_DISABLE_FLAG_PREFIX = 'ga-disable-';

export const ANALYTICS_PAGE_TITLE = 'AGI Workforce';

export const GA_BOOTSTRAP_SCRIPT = `
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  window.gtag = gtag;
  gtag('js', new Date());
  (window.agiGaPending || []).forEach(function (command) { gtag.apply(null, command); });
  window.agiGaPending = [];
`;

export function setGoogleAnalyticsCollection(trackingId: string, enabled: boolean): void {
  if (typeof window === 'undefined') return;
  (window as unknown as Record<string, unknown>)[`${GA_DISABLE_FLAG_PREFIX}${trackingId}`] =
    !enabled;
}

function sendToGtag(...command: unknown[]): void {
  if (window.gtag) {
    window.gtag(...command);
    return;
  }
  (window.agiGaPending ??= []).push(command);
}

function originOf(referrer: string): string {
  try {
    return referrer ? new URL(referrer).origin : '';
  } catch {
    return '';
  }
}

interface GoogleAnalyticsProps {
  trackingId: string;
  nonce?: string;
}

export function GoogleAnalytics({ trackingId, nonce }: GoogleAnalyticsProps) {
  const route = canonicalRoutePath(usePathname() ?? '/');
  const configured = useRef(false);
  const previousRoute = useRef<string | null>(null);

  useEffect(() => {
    const origin = window.location.origin;
    const page = {
      page_location: `${origin}${route}`,
      page_path: route,
      page_title: ANALYTICS_PAGE_TITLE,
      page_referrer:
        previousRoute.current === null
          ? originOf(document.referrer)
          : `${origin}${previousRoute.current}`,
    };
    if (!configured.current) {
      configured.current = true;
      sendToGtag('config', trackingId, { ...page, send_page_view: false });
    }
    sendToGtag('set', page);
    sendToGtag('event', 'page_view', { ...page, send_to: trackingId });
    previousRoute.current = route;
  }, [route, trackingId]);

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${trackingId}`}
        strategy="afterInteractive"
        nonce={nonce}
      />
      <Script id="ga4-init" strategy="afterInteractive" nonce={nonce}>
        {GA_BOOTSTRAP_SCRIPT}
      </Script>
    </>
  );
}
