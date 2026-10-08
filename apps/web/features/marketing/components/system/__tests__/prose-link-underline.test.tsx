import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/components/layout/Header', () => ({ Header: () => null }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => null,
}));

import PolicyHistoryPage from '@/app/legal/archive/[policy]/page';

import { PageHero } from '../../pages/surfaces/shared';
import { Ledger } from '../Ledger';
import { Prose } from '../Prose';
import { Stack } from '../Stack';

const STYLESHEET = readFileSync(resolve(__dirname, '..', 'system.css'), 'utf8');

let sheet: HTMLStyleElement;

beforeEach(() => {
  sheet = document.createElement('style');
  sheet.textContent = STYLESHEET;
  document.head.append(sheet);
});

afterEach(() => {
  sheet.remove();
});

function restingBackgroundSize(element: Element): string | null {
  let value: string | null = null;
  for (const rule of Array.from(sheet.sheet?.cssRules ?? [])) {
    if (!(rule instanceof CSSStyleRule) || !rule.style.backgroundSize) continue;
    let matches = false;
    try {
      matches = element.matches(rule.selectorText);
    } catch {
      matches = false;
    }
    if (matches) value = rule.style.backgroundSize;
  }
  return value;
}

describe('marketing links in running text', () => {
  it('underlines a link inside prose at rest, so colour is not the only cue', () => {
    render(
      <div data-design="agi">
        <Prose>
          Read{' '}
          <a className="agi-ds-link" href="/changelog/feed.xml">
            the feed
          </a>
          .
        </Prose>
        <a className="agi-ds-link" href="/release-notes">
          Release notes
        </a>
      </div>,
    );

    expect(restingBackgroundSize(screen.getByRole('link', { name: 'the feed' }))).toBe('100% 1px');
    expect(restingBackgroundSize(screen.getByRole('link', { name: 'Release notes' }))).not.toBe(
      '100% 1px',
    );
  });

  it('underlines a link in a page hero lede at rest', () => {
    render(
      <div data-design="agi">
        <PageHero
          id="hero"
          eyebrow="Release notes"
          title="Every shipped feature is dated."
          lede={
            <>
              Releases and policy changes.{' '}
              <a className="agi-ds-link" href="/changelog/feed.xml">
                Subscribe with the Atom feed
              </a>
              .
            </>
          }
          ctas={[]}
        />
      </div>,
    );

    expect(
      restingBackgroundSize(screen.getByRole('link', { name: 'Subscribe with the Atom feed' })),
    ).toBe('100% 1px');
  });

  it('underlines the links in a version history row at rest, where they follow the summary text', async () => {
    render(await PolicyHistoryPage({ params: Promise.resolve({ policy: 'terms' }) }));

    expect(restingBackgroundSize(screen.getByRole('link', { name: 'Current version' }))).toBe(
      '100% 1px',
    );
    for (const link of screen.getAllByRole('link', { name: 'Read this version' })) {
      expect(restingBackgroundSize(link)).toBe('100% 1px');
    }
  });

  it('leaves a ledger headline link that stands on its own line to underline on hover', () => {
    render(
      <div data-design="agi">
        <Ledger
          caption="Releases"
          rows={[
            {
              label: '2026-09-21',
              value: (
                <Stack gap="tight">
                  <a className="agi-ds-link" href="/release-notes#release">
                    A release headline
                  </a>
                  <span>What shipped.</span>
                </Stack>
              ),
            },
          ]}
        />
      </div>,
    );

    expect(
      restingBackgroundSize(screen.getByRole('link', { name: 'A release headline' })),
    ).not.toBe('100% 1px');
  });
});
