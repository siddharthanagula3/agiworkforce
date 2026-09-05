'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { getGitHubCallbackNotice } from '@/features/connectors/lib/github-callback-notice';
import { SETTINGS_DEEP_LINK_QUERY_KEY } from '@/features/settings/lib/web-settings-sections';

interface SettingsModalRedirectProps {
  section: string;
  returnTo?: string;
}

export function SettingsModalRedirect({ section, returnTo = '/chat' }: SettingsModalRedirectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledGitHubStatus = useRef<string | null>(null);
  const handledTopUpStatus = useRef<string | null>(null);

  useEffect(() => {
    const githubStatus = section === 'connectors' ? searchParams.get('github') : null;
    if (githubStatus && handledGitHubStatus.current !== githubStatus) {
      handledGitHubStatus.current = githubStatus;
      const notice = getGitHubCallbackNotice(githubStatus);
      if (notice?.kind === 'success') {
        toast.success(notice.message);
      } else if (notice) {
        toast.error(notice.message);
      }
    }
    const topUpStatus = section === 'billing' ? searchParams.get('topup') : null;
    if (topUpStatus && handledTopUpStatus.current !== topUpStatus) {
      handledTopUpStatus.current = topUpStatus;
      if (topUpStatus === 'success') {
        toast.success('Top-up payment received. Your balance updates after payment confirmation.');
      } else if (topUpStatus === 'cancelled') {
        toast.error('Top-up checkout was canceled. No balance was added.');
      }
    }
    const destination = new URLSearchParams();
    destination.set(SETTINGS_DEEP_LINK_QUERY_KEY, section);
    router.replace(`${returnTo}?${destination.toString()}`);
  }, [router, returnTo, searchParams, section]);

  return null;
}
