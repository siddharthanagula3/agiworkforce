import { open } from '@tauri-apps/plugin-shell';
import { isElectronHost, isTauri } from '../lib/runtimeEnvironment';

const PRICING_URL = 'https://www.agiworkforce.com/billing';

export async function openExternalUrl(url: string) {
  if (isTauri || isElectronHost) {
    try {
      await open(url);
    } catch (error) {
      console.error('Failed to open external URL:', error);
      if (isElectronHost) {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw error;
        window.location.href = parsed.toString();
        return;
      }
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
