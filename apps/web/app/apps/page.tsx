'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';

export default function AppsPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace(`/login?redirectTo=${encodeURIComponent('/apps')}`);
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) return null;

  return <SettingsModalRedirect section="plugins" />;
}
