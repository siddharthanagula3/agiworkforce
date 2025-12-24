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

    // Example: agiworkforce://open?token=xyz
    // Example: agiworkforce://auth/callback?code=xyz

    // We can dispatch a custom event or use a store to handle this.
    // For now, let's just log it and potentially emit a window event that the Auth store listens to.

    const token = parsed.searchParams.get('token');
    const code = parsed.searchParams.get('code');

    if (token || code) {
      // Dispatch event for AuthStore or other consumers
      window.dispatchEvent(new CustomEvent('agi-deep-link', { detail: { url, token, code } }));
    }
  } catch (e) {
    console.error('[DeepLink] Invalid URL:', url, e);
  }
}
