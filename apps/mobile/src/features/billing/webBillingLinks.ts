import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { readStorefront } from './mobileIapService';

// App Review 3.1.1(a) allows links to purchasing outside in-app purchase only on
// the United States App Store storefront. Google Play allows none without an
// enrolled external-offers program, which this app is not in.
const US_APP_STORE_STOREFRONTS: ReadonlySet<string> = new Set(['USA', 'US']);

export function storefrontAllowsWebBillingLinks(
  platform: typeof Platform.OS,
  storefront: string | null,
): boolean {
  return (
    platform === 'ios' &&
    storefront !== null &&
    US_APP_STORE_STOREFRONTS.has(storefront.trim().toUpperCase())
  );
}

export function useWebBillingLinksAllowed(): boolean {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let active = true;
    void readStorefront().then((storefront) => {
      if (active) setAllowed(storefrontAllowsWebBillingLinks(Platform.OS, storefront));
    });
    return () => {
      active = false;
    };
  }, []);

  return allowed;
}
