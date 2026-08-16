import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import i18next from 'i18next';

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

function UnloadedNamespaceProbe() {
  const { t } = useUiTranslation('chat');
  return <span data-testid="unloaded-namespace">{t('composer.send', 'Send')}</span>;
}

describe('useUiTranslation', () => {
  beforeAll(async () => {
    await i18next.init({
      lng: 'de',
      fallbackLng: false,
      supportedLngs: ['de', 'zz'],
      nonExplicitSupportedLngs: false,
      ns: ['common'],
      defaultNS: 'common',
      interpolation: { escapeValue: false },
      resources: {
        de: { common: { save: 'Speichern', greeting: 'Hallo {{name}}' } },
        zz: { common: {} },
      },
    });
  });

  it('returns the English source copy when the locale has no translation', async () => {
    await i18next.changeLanguage('zz');
    render(<Probe />);

    expect(screen.getByTestId('plain').textContent).toBe('Save');
    expect(screen.getByTestId('interpolated').textContent).toBe('Hello Ada');
    expect(screen.getByTestId('missing').textContent).toBe('Untranslated source copy');
  });

  it('returns the host locale from the canonical singleton', async () => {
    await i18next.changeLanguage('de');
    render(<Probe />);

    expect(screen.getByTestId('plain').textContent).toBe('Speichern');
    expect(screen.getByTestId('interpolated').textContent).toBe('Hallo Ada');
    expect(screen.getByTestId('missing').textContent).toBe('Untranslated source copy');
  });

  it('renders source copy without suspending while a namespace is unloaded', async () => {
    await i18next.changeLanguage('de');
    render(<UnloadedNamespaceProbe />);

    expect(screen.getByTestId('unloaded-namespace').textContent).toBe('Send');
  });

  it('never lets an interpolation value displace the English fallback', async () => {
    function Hostile() {
      const { t } = useUiTranslation('common');
      return (
        <span data-testid="hostile">
          {t('nothing.here', 'Source copy', { defaultValue: 'injected' })}
        </span>
      );
    }

    await i18next.changeLanguage('de');
    render(<Hostile />);

    expect(screen.getByTestId('hostile').textContent).toBe('Source copy');
  });
});
