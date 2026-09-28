import type { Metadata } from 'next';

import { WebAppShell } from '@shared/components/layout/WebAppShell';
import { DeveloperConsolePage } from '@/features/developers';
import { developerRateLimits } from '@/lib/developer-api/rate-limit-summary';

export const metadata: Metadata = {
  title: 'Developer console',
  description: 'API keys, rate limits and a place to try requests against the gateway.',
  robots: { index: false, follow: false },
};

export default function DevelopersRoute() {
  return (
    <WebAppShell>
      <DeveloperConsolePage rateLimits={developerRateLimits()} />
    </WebAppShell>
  );
}
