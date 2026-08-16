'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

interface GoogleAnalyticsProps {
  trackingId: string;
  nonce?: string;
}

export function GoogleAnalytics({ trackingId, nonce }: GoogleAnalyticsProps) {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined' || !window.gtag) return;
    window.gtag('config', trackingId, {
      page_path: pathname,
    });
  }, [pathname, trackingId]);

  return (
    <>
      {/* Load the Google Analytics library */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${trackingId}`}
        strategy="afterInteractive"
        nonce={nonce}
      />
      {/* Bootstrap gtag() and configure the measurement ID */}
      <Script id="ga4-init" strategy="afterInteractive" nonce={nonce}>
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${trackingId}', {
            page_location: window.location.href,
            send_page_view: false
          });
        `}
      </Script>
    </>
  );
}
