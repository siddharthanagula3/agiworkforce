import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GreetingBanner } from '../GreetingBanner/GreetingBanner';

type ReactI18nextModule = typeof import('react-i18next');

vi.mock('react-i18next', async (importOriginal) => {
  const { createInstance } = await import('i18next');
  const { resources } = await import('@agiworkforce/i18n');
  const instance = createInstance();
  await instance.init({
    lng: 'en',
    fallbackLng: false,
    resources,
    ns: ['v3'],
    defaultNS: 'v3',
    interpolation: { escapeValue: false },
  });
  const t = instance.getFixedT('en', 'v3');
  return { ...(await importOriginal<ReactI18nextModule>()), useTranslation: () => ({ t }) };
});

vi.mock('../GreetingBanner/useGreeting', () => ({
  useGreeting: () => ({ headline: 'Good morning, Ada', firstName: 'Ada', nameResolved: true }),
}));

afterEach(cleanup);

describe('GreetingBanner in AGI Work', () => {
  it('shows the time greeting in chat', () => {
    render(<GreetingBanner />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good morning, Ada');
  });

  it('shows the Work headline instead of the time greeting in AGI Work', () => {
    render(<GreetingBanner agiWork />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('What should we get done?');
    expect(heading).not.toHaveTextContent('Good morning');
  });
});
