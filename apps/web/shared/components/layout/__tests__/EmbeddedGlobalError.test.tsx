import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMBEDDED_PAGE_PARAM, EMBEDDED_PAGE_PARAM_VALUE } from '@agiworkforce/types';

type LoggerModule = typeof import('@shared/lib/logger');

vi.mock('@shared/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import GlobalError from '@/app/global-error';

const MARKER = `${EMBEDDED_PAGE_PARAM}=${EMBEDDED_PAGE_PARAM_VALUE}`;
const MARKED_ACCOUNT = `/settings/account?${MARKER}`;
const MARKED_SIGN_IN = `/login?redirectTo=${encodeURIComponent(MARKED_ACCOUNT)}`;
const ORDINARY_PATH = window.location.pathname;

function renderAt(pathAndSearch: string) {
  window.history.replaceState(null, '', pathAndSearch);
  const container = document.createElement('div');
  document.body.appendChild(container);
  return render(<GlobalError error={new Error('boom')} reset={vi.fn()} />, {
    container,
    baseElement: document.documentElement,
  });
}

function hrefs(container: HTMLElement): string[] {
  return [...container.querySelectorAll('a')].map((link) => link.getAttribute('href') ?? '');
}

describe('a root layout crash on the pages an account link reaches', () => {
  afterEach(() => {
    window.history.replaceState(null, '', ORDINARY_PATH);
  });

  it.each([MARKED_ACCOUNT, MARKED_SIGN_IN])('offers only a retry at %s', (pathAndSearch) => {
    const { container } = renderAt(pathAndSearch);

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(hrefs(container)).toEqual([]);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders no link before it can read the address', () => {
    const html = renderToString(<GlobalError error={new Error('boom')} reset={vi.fn()} />);

    expect(html).toContain('Try again');
    expect(html).not.toContain('<a ');
  });

  it('keeps the home and contact links for an ordinary visitor', () => {
    const { container } = renderAt('/settings/account');

    expect(hrefs(container)).toEqual(['/', '/contact']);
  });
});
