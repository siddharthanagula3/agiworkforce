import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CATALOG_SCOPES } from '@/lib/catalog-scopes';
import { approximateCount } from '@/lib/marketing-constants';
import Home from './page';

const PILL_ARROW = '→';
const STANDING_PILL = `New${approximateCount(CATALOG_SCOPES.byokModelEntries.value)} models across ${CATALOG_SCOPES.byokProviders.text}${PILL_ARROW}`;

function serverRender(): HTMLElement {
  const page = document.createElement('div');
  page.innerHTML = renderToStaticMarkup(Home());
  document.body.replaceChildren(page);
  return page;
}

describe('root page', () => {
  it('renders the marketing landing for the signed-out request', () => {
    const page = serverRender();

    expect(page.querySelectorAll('main#main-content')).toHaveLength(1);
    expect(page.querySelector('h1')).toHaveTextContent('AGI');
  });

  it('shows the standing announcement pill and no free image or video offer', () => {
    const page = serverRender();
    const pills = page.querySelectorAll<HTMLElement>('a.agi-fl-announce');

    expect(pills).toHaveLength(1);
    expect(pills[0]!.textContent).toBe(STANDING_PILL);
    expect(pills[0]).toHaveAttribute('href', '/providers');
    expect(page.textContent).not.toMatch(/free (image|video)/iu);
  });
});
