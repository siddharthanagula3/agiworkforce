'use client';

/**
 * /apps — opens the settings modal at the Plugins section for authenticated
 * users. Unauthenticated visitors see a public marketing fallback.
 *
 * NOTE: The original /apps page was a marketing page (FlagshipHero + capability
 * grid for "apps & connectors"). That content has been folded into the Plugins
 * section of the settings modal. The marketing content lives at /integrations
 * for SEO; /apps now deep-links authenticated users into the modal.
 */

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';

export default function AppsPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      // Unauthenticated: redirect to the public integrations page
      router.replace('/integrations');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) return null;

  return <SettingsModalRedirect section="plugins" />;
}
