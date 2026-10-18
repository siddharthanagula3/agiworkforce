import { open } from '@tauri-apps/plugin-shell';
import { WEB_APP_URL } from '../api/config';
import { isTauri } from '../lib/runtimeEnvironment';

const PRICING_URL = `${WEB_APP_URL}/billing`;

export async function openExternalUrl(url: string) {
  if (isTauri) {
    try {
      await open(url);
    } catch (error) {
      console.error('Failed to open external URL:', error);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export async function openPricingPage(reason?: 'subscription_required' | 'upgrade_required') {
  let url = PRICING_URL;
  if (reason) {
    url += `?reason=${reason}`;
  }
  await openExternalUrl(url);
}
