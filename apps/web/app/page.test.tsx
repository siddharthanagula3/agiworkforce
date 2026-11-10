import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Home from './page';

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

  it('offers no free image or video anywhere on the landing', () => {
    const page = serverRender();

    expect(page.textContent).not.toMatch(/free (image|video)/iu);
  });
});
