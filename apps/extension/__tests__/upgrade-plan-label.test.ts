import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  formatUsdAmount,
  getBillingPlanPricing,
  getNextUpgradeTier,
  getPlanPriceUsd,
} from '@agiworkforce/types';
import catalog from '../_locales/en/messages.json';
import { upgradeToPlanLabel } from '../src/features/side-panel/usageWindows';

beforeAll(() => {
  vi.stubGlobal('chrome', {
    i18n: {
      getMessage: (key: string, substitutions: string[] = []) => {
        const entry = (
          catalog as Record<
            string,
            { message: string; placeholders?: Record<string, { content: string }> }
          >
        )[key];
        if (!entry) return '';
        return entry.message.replace(/\$([A-Z_]+)\$/g, (_match, name: string) => {
          const content = entry.placeholders?.[name.toLowerCase()]?.content ?? '';
          const index = Number(content.replace('$', '')) - 1;
          return substitutions[index] ?? '';
        });
      },
    },
  });
});

describe('limit upgrade action', () => {
  it('names the next plan and its monthly price the way the web paywall does', () => {
    const next = getNextUpgradeTier('free')!;
    expect(next).toBeTruthy();
    const price = getPlanPriceUsd(next, 'monthly');
    expect(price).not.toBeNull();
    expect(upgradeToPlanLabel(next)).toBe(
      `Upgrade to ${getBillingPlanPricing(next).label}, ${formatUsdAmount(price!)}/mo`,
    );
  });
});
