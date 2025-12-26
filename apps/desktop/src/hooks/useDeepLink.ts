import { useEffect } from 'react';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { isTauri } from '../lib/tauri-mock';

export function useDeepLink() {
  useEffect(() => {
    if (!isTauri) return;

    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        console.log('[DeepLink] Setting up listener...');
        unlisten = await onOpenUrl((urls) => {
          console.log('[DeepLink] Received URLs:', urls);
          for (const url of urls) {
            handleDeepLink(url);
          }
        });
        console.log('[DeepLink] Listener setup success');
      } catch (error) {
        console.error('[DeepLink] Failed to setup listener:', error);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        console.log('[DeepLink] Cleaning up listener');
        unlisten();
      }
    };
  }, []);
}

function handleDeepLink(url: string) {
  try {
    const parsed = new URL(url);
    console.log('[DeepLink] Parsing URL:', parsed.href);

    // Extract params from query string
    const queryParams = Object.fromEntries(parsed.searchParams.entries());

    // Extract params from hash fragment (Supabase often puts them here for implicit flow)
    // format: #access_token=...&refresh_token=...
    let hashParams: Record<string, string> = {};
    if (parsed.hash) {
      const hashStr = parsed.hash.substring(1); // remove #
      const hashSearchParams = new URLSearchParams(hashStr);
      hashParams = Object.fromEntries(hashSearchParams.entries());
    }

    const allParams = { ...queryParams, ...hashParams };

    // Check for common auth tokens
    const access_token = allParams['access_token'];
    const refresh_token = allParams['refresh_token'];
    const type = allParams['type'];
    const code = allParams['code'];

    if (access_token || code || type || refresh_token) {
      console.log('[DeepLink] Dispatched agi-deep-link event');
      window.dispatchEvent(
        new CustomEvent('agi-deep-link', {
          detail: {
            url,
            ...allParams,
          },
        }),
      );
    }
  } catch (e) {
    console.error('[DeepLink] Invalid URL:', url, e);
  }
}
