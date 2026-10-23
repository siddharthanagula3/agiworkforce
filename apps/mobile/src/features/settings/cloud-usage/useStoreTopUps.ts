import { useEffect, useState } from 'react';
import { fetchMobileIapCatalog } from '@/src/features/billing/mobileIapService';

export function useStoreTopUps(accountKey: string | null): boolean {
  const [offered, setOffered] = useState<{ accountKey: string; value: boolean } | null>(null);

  useEffect(() => {
    if (!accountKey) return;
    let active = true;
    fetchMobileIapCatalog()
      .then((catalog) => {
        if (!active) return;
        setOffered({
          accountKey,
          value: catalog.enabled && catalog.products.some((product) => product.kind === 'top_up'),
        });
      })
      .catch(() => {
        if (active) setOffered({ accountKey, value: false });
      });
    return () => {
      active = false;
    };
  }, [accountKey]);

  return accountKey !== null && offered?.accountKey === accountKey && offered.value;
}
