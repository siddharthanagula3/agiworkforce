import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resources } from '@agiworkforce/i18n';
import { useBudgetStore } from '@agiworkforce/unified-chat';

import { CapModal } from '../CapModal';

type LocaleBundles = Record<string, { v3: { capModal: Record<string, string> } }>;

const bundles = resources as unknown as LocaleBundles;

const translate = (key: string): string => {
  const [namespace, name] = key.split('.');
  if (namespace !== 'capModal' || !name) return key;
  return bundles['en']?.v3.capModal[name] ?? key;
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => translate(key) }),
}));

describe('CapModal', () => {
  afterEach(() => {
    cleanup();
    useBudgetStore.setState({
      budget: { enabled: false, currentUsage: 0, limit: 0, periodEnd: 0 },
    });
  });

  it('offers no top-up action at cap even when a host wires one', () => {
    useBudgetStore.getState().setBudget({ enabled: true, currentUsage: 1000, limit: 1000 });
    const onBuyTopUp = vi.fn();
    const hostProps: React.ComponentProps<typeof CapModal> & { onBuyTopUp: () => void } = {
      onSwitchModel: vi.fn(),
      onBuyTopUp,
    };

    render(<CapModal {...hostProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /top[\s-]?up/i })).not.toBeInTheDocument();
    expect(onBuyTopUp).not.toHaveBeenCalled();
  });

  it('ships no cap-modal copy promising a top-up', () => {
    for (const [locale, bundle] of Object.entries(bundles)) {
      expect(Object.keys(bundle.v3.capModal), locale).not.toContain('buyTopUp');
    }
    expect(bundles['en']?.v3.capModal['subtitle']).not.toMatch(/top[\s-]?up/i);
  });
});
