import { describe, expect, it } from 'vitest';

import {
  DIRECTORY_CATEGORIES,
  OTHER_CATEGORY,
  deriveDirectoryCategories,
  isDirectoryCategory,
  scoreDirectoryCategories,
} from '@/lib/connectors/directory/categorize';

describe('deriveDirectoryCategories', () => {
  it('offers eleven categories including Other', () => {
    expect(DIRECTORY_CATEGORIES).toHaveLength(11);
    expect(DIRECTORY_CATEGORIES).toContain(OTHER_CATEGORY);
  });

  it('classifies from description keywords', () => {
    expect(
      deriveDirectoryCategories({
        name: 'Acme',
        description: 'Send messages to Slack channels and read email in Gmail.',
      })[0],
    ).toBe('Communication');
  });

  it('weights a name hit above a description hit', () => {
    const categories = deriveDirectoryCategories({
      name: 'GitHub',
      description: 'Send invoices.',
    });
    expect(categories[0]).toBe('Code');
    expect(categories).toContain('Financial services');
  });

  it('counts the id leaf as name text', () => {
    expect(
      deriveDirectoryCategories({
        name: 'Foo',
        description: 'Foo.',
        id: 'io.github.acme/postgres-tools',
      })[0],
    ).toBe('Data');
  });

  it('weights a known host above keywords', () => {
    expect(
      deriveDirectoryCategories({
        name: 'Acme',
        description: 'Search issues.',
        hosts: ['mcp.stripe.com'],
      })[0],
    ).toBe('Financial services');
  });

  it('returns at most three categories', () => {
    const categories = deriveDirectoryCategories({
      name: 'Everything',
      description:
        'Git repos, Slack chat, SQL databases, Figma design, Stripe payments, clinics, contracts, genomes, calendars and CRM leads.',
    });
    expect(categories).toHaveLength(3);
  });

  it('falls back to Other when nothing matches', () => {
    expect(deriveDirectoryCategories({ name: 'Zzz', description: 'Qqq.' })).toEqual([
      OTHER_CATEGORY,
    ]);
  });

  it('keeps smart contracts out of Legal', () => {
    expect(
      scoreDirectoryCategories({ name: 'Acme', description: 'Deploy smart contracts on EVM.' }).has(
        'Legal',
      ),
    ).toBe(false);
    expect(
      scoreDirectoryCategories({ name: 'Acme', description: 'Review contracts and NDAs.' }).has(
        'Legal',
      ),
    ).toBe(true);
  });

  it('matches whole words only', () => {
    expect(
      scoreDirectoryCategories({ name: 'Acme', description: 'Scalable payload.' }).has(
        'Financial services',
      ),
    ).toBe(false);
  });
});

describe('isDirectoryCategory', () => {
  it('accepts a listed category and rejects anything else', () => {
    expect(isDirectoryCategory('Code')).toBe(true);
    expect(isDirectoryCategory('Nope')).toBe(false);
  });
});
