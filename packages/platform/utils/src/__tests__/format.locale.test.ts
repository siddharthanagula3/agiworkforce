import { describe, it, expect } from 'vitest';

import { formatDate, formatDateTime, formatCurrency, formatNumber } from '../format';

/**
 * These formatters pinned 'en-US'. The wave-two consistency finding proposed
 * routing 40 ad-hoc `toLocaleString()` call sites through them, which would
 * have spread the pinned locale across the product rather than fixing it.
 * They now default to the viewer's locale and accept an explicit one.
 */
describe('shared formatters follow the locale they are given', () => {
  const date = new Date('2026-01-15T14:30:00Z');

  it('formatDate honours an explicit locale', () => {
    expect(formatDate(date, { month: 'long', day: 'numeric', year: 'numeric' }, 'de-DE')).toMatch(
      /Januar/,
    );
    expect(formatDate(date, { month: 'long', day: 'numeric', year: 'numeric' }, 'en-US')).toMatch(
      /January/,
    );
  });

  it('formatDateTime honours an explicit locale', () => {
    expect(formatDateTime(date, 'de-DE')).toMatch(/Januar/);
    expect(formatDateTime(date, 'en-US')).toMatch(/January/);
  });

  it('formatNumber uses that locale’s separators', () => {
    expect(formatNumber(1234567, undefined, 'de-DE')).toBe('1.234.567');
    expect(formatNumber(1234567, undefined, 'en-US')).toBe('1,234,567');
  });

  it('formatCurrency uses that locale’s conventions', () => {
    expect(formatCurrency(1234.56, 'USD', 'de-DE')).toMatch(/1\.234,56/);
    expect(formatCurrency(1234.56, 'USD', 'en-US')).toMatch(/\$1,234\.56/);
  });

  it('defaults to the runtime locale rather than a pinned one', () => {
    const runtime = new Intl.DateTimeFormat().resolvedOptions().locale;
    expect(formatDate(date)).toBe(
      new Intl.DateTimeFormat(runtime, { month: 'long', day: 'numeric', year: 'numeric' }).format(
        date,
      ),
    );
  });
});
