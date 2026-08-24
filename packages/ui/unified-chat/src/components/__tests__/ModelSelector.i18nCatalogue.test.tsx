import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import i18next from 'i18next';
import jaModels from '../../../../i18n/locales/ja/models.json' with { type: 'json' };
import { ModelSelector } from '../ModelSelector';
import { useModelStore } from '../../stores/modelStore';

// WEB-CORE-CHAT-UI-NOT-LOCALISED-01 slice 1: selector.* keys carried an inline
// English default with no catalogue entry in any locale, so a Japanese user
// saw English chrome. This renders against the real ja/models.json bundle
// (not a synthetic fixture) to prove the catalogue entry is what resolves,
// not the inline default.
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('ModelSelector resolves selector.* keys from the real catalogue', () => {
  beforeAll(async () => {
    await i18next.init({
      lng: 'ja',
      fallbackLng: false,
      supportedLngs: ['ja'],
      nonExplicitSupportedLngs: false,
      ns: ['models'],
      defaultNS: 'models',
      interpolation: { escapeValue: false },
      resources: { ja: { models: jaModels } },
    });
  });

  it('renders the Japanese selector.noLocalModels translation, not the English default', async () => {
    await i18next.changeLanguage('ja');
    window.localStorage.setItem('app-mode-store', JSON.stringify({ state: { mode: 'local' } }));
    useModelStore.setState({
      models: [],
      selectedModelId: '',
      modelCatalogStatus: 'ready',
      modelCatalogError: null,
      recentModelIds: [],
      lastRoutingDecision: null,
    });

    render(<ModelSelector />);
    fireEvent.click(screen.getByRole('button', { name: 'モデルを選択' }));

    expect(screen.getByText('ローカルモデルが検出されません')).toBeTruthy();
    expect(screen.queryByText('No local models detected')).toBeNull();
  });
});
