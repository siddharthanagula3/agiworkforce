'use client';

/**
 * SettingsModalRedirect — mounts on any route that should open the settings
 * modal (e.g. /settings/general, /skills, /connectors, /apps) and immediately
 * fires openSettings with the correct section, then navigates back to /chat so
 * the modal floats over the app shell rather than a blank page.
 *
 * This keeps routes deep-linkable while keeping the modal-first UX.
 */

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { getGitHubCallbackNotice } from '@/features/connectors/lib/github-callback-notice';
import { useSettingsModal } from './SettingsModalProvider';

interface SettingsModalRedirectProps {
  /** The settings section to activate (e.g. 'general', 'connectors', 'skills') */
  section: string;
  /** Where to navigate after opening the modal. Defaults to '/chat'. */
  returnTo?: string;
}

export function SettingsModalRedirect({ section, returnTo = '/chat' }: SettingsModalRedirectProps) {
  const { openSettings } = useSettingsModal();
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledGitHubStatus = useRef<string | null>(null);

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
    openSettings(section);
    router.replace(returnTo);
  }, [openSettings, router, returnTo, searchParams, section]);

  // Render nothing — the modal opens globally via the provider
  return null;
}
