'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

interface GoogleAnalyticsProps {
  trackingId: string;
  nonce?: string;
}

/**
 * GoogleAnalytics - wires GA4 into the Next.js App Router.
 *
 * - Loads the gtag.js script with strategy="afterInteractive" so it never
 *   blocks page rendering.
 * - Fires a page_view event on every client-side route change via usePathname.
 * - Accepts the per-request CSP nonce so inline scripts pass the nonce-based
 *   Content-Security-Policy set by middleware.ts.
 *
 * Only rendered when NEXT_PUBLIC_GA_TRACKING_ID is set (checked in layout.tsx).
 */
export function GoogleAnalytics({ trackingId, nonce }: GoogleAnalyticsProps) {
  const pathname = usePathname();

  // Send page_view on every client-side navigation
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
