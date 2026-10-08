import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { it, vi } from 'vitest';

import { extract, plain } from './policy-archive-extract.mjs';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {},
  notFound: () => {},
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}));

const TARGETS = JSON.parse(process.env['POLICY_ARCHIVE_TARGETS'] ?? '[]');

it('renders each replaced policy version', async () => {
  for (const target of TARGETS) {
    const loaded = await import(
      /* @vite-ignore */ path.join(process.cwd(), target.page.replace(/^apps\/web\//, ''))
    );
    const Page = loaded.default;
    const props = { params: Promise.resolve({}), searchParams: Promise.resolve({}) };
    const element =
      Page.constructor.name === 'AsyncFunction' ? await Page(props) : createElement(Page, props);
    const { container } = render(
      createElement(QueryClientProvider, { client: new QueryClient() }, element),
    );
    const blocks = extract(container.querySelector('main') ?? container);
    const heading = blocks.find((block) => block.type === 'heading' && block.level === 1);
    writeFileSync(
      target.out,
      `${JSON.stringify(
        {
          key: target.key,
          route: target.route,
          date: target.date,
          replacedOn: target.replacedOn,
          commit: target.commit,
          committedAt: target.committedAt,
          title: heading ? plain(heading.content).trim() : target.route,
          blocks,
        },
        null,
        2,
      )}\n`,
    );
    cleanup();
  }
}, 300_000);
