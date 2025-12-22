import { open } from '@tauri-apps/plugin-shell';
import { isTauri } from '../lib/tauri-mock';

const PRICING_URL = 'https://agiworkforce.com/pricing';

/**
 * Opens a URL in the default external browser
 */
export async function openExternalUrl(url: string) {
  if (isTauri) {
    try {
      await open(url);
    } catch (error) {
      console.error('Failed to open external URL:', error);
      // Fallback to window.open which Tauri might intercept or handle
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Opens the pricing page in the default external browser
 */
export async function openPricingPage(reason?: 'subscription_required' | 'upgrade_required') {
  let url = PRICING_URL;
  if (reason) {
    url += `?reason=${reason}`;
  }
  await openExternalUrl(url);
}
