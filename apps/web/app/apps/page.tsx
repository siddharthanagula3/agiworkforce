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
      // Sign-in, NOT back to /integrations. The primary CTA on /integrations
      // points here, so bouncing signed-out visitors to /integrations made that
      // button a dead loop: click → /apps → /integrations, rendering `null` in
      // between. Sending them to sign-in with a return path completes the
      // journey the CTA promises.
      router.replace(`/login?redirectTo=${encodeURIComponent('/apps')}`);
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) return null;

  return <SettingsModalRedirect section="plugins" />;
}
