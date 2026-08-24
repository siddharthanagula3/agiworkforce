import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import i18next from 'i18next';
import ptCommon from '../../../../i18n/locales/pt/common.json' with { type: 'json' };
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious } from '../Pagination';

// WEB-CORE-CHAT-UI-NOT-LOCALISED-01 slice 2: common.* pagination keys carried
// an inline English default with no catalogue entry in any locale, so a
// Portuguese user saw English chrome. This renders against the real
// pt/common.json bundle (not a synthetic fixture) to prove the catalogue
// entry is what resolves, not the inline default.
afterEach(() => {
  cleanup();
});

describe('Pagination resolves common.* keys from the real catalogue', () => {
  beforeAll(async () => {
    await i18next.init({
      lng: 'pt',
      fallbackLng: false,
      supportedLngs: ['pt'],
      nonExplicitSupportedLngs: false,
      ns: ['common'],
      defaultNS: 'common',
      interpolation: { escapeValue: false },
      resources: { pt: { common: ptCommon } },
    });
  });

  it('renders the Portuguese pagination translations, not the English defaults', async () => {
    await i18next.changeLanguage('pt');
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );

    expect(screen.getByRole('navigation', { name: 'Paginação' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir para a página anterior' })).toBeTruthy();
    expect(screen.getByText('Anterior')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'pagination' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Go to previous page' })).toBeNull();
    expect(screen.queryByText('Previous')).toBeNull();
  });
});
