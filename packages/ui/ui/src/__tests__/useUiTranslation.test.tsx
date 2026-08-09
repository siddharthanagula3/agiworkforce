/**
 * useUiTranslation — the contract every shared component depends on.
 *
 * The hook exists because this package is consumed by three hosts that each
 * build their own i18next instance, and a component that renders before (or
 * without) one must not degrade into raw keys or raw `{{placeholders}}`.
 *
 * The instance is supplied via `I18nextProvider`, never `initReactI18next`, so
 * these tests cannot leave a global instance behind for other suites.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';

import { useUiTranslation } from '../i18n';

afterEach(() => {
  cleanup();
});

function Probe() {
  const { t } = useUiTranslation('common');
  return (
    <div>
      <span data-testid="plain">{t('save', 'Save')}</span>
      <span data-testid="interpolated">{t('greeting', 'Hello {{name}}', { name: 'Ada' })}</span>
      <span data-testid="missing">{t('nothing.here', 'Untranslated source copy')}</span>
    </div>
  );
}

describe('useUiTranslation', () => {
  it('returns the English source copy when no i18next instance is attached', () => {
    render(<Probe />);

    expect(screen.getByTestId('plain').textContent).toBe('Save');
    expect(screen.getByTestId('interpolated').textContent).toBe('Hello Ada');
    expect(screen.getByTestId('missing').textContent).toBe('Untranslated source copy');
  });

  it('returns the host locale when an instance is attached', () => {
    const instance = createInstance();
    void instance.init({
      lng: 'de',
      fallbackLng: 'de',
      ns: ['common'],
      defaultNS: 'common',
      interpolation: { escapeValue: false },
      resources: { de: { common: { save: 'Speichern', greeting: 'Hallo {{name}}' } } },
    });

    render(
      <I18nextProvider i18n={instance}>
        <Probe />
      </I18nextProvider>,
    );

    expect(screen.getByTestId('plain').textContent).toBe('Speichern');
    expect(screen.getByTestId('interpolated').textContent).toBe('Hallo Ada');
    // A key the locale does not carry falls back to source copy, not the key.
    expect(screen.getByTestId('missing').textContent).toBe('Untranslated source copy');
  });

  it('never lets an interpolation value displace the English fallback', () => {
    function Hostile() {
      const { t } = useUiTranslation('common');
      return (
        <span data-testid="hostile">
          {t('nothing.here', 'Source copy', { defaultValue: 'injected' })}
        </span>
      );
    }

    const instance = createInstance();
    void instance.init({
      lng: 'de',
      fallbackLng: 'de',
      ns: ['common'],
      defaultNS: 'common',
      resources: { de: { common: {} } },
    });

    render(
      <I18nextProvider i18n={instance}>
        <Hostile />
      </I18nextProvider>,
    );

    expect(screen.getByTestId('hostile').textContent).toBe('Source copy');
  });
});
