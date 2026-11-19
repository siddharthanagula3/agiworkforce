import { describe, expect, it } from 'vitest';

import { summarizeDescription } from '@/lib/connectors/directory/summary';

const HOSTILE_BUDGET_MS = 2000;
const HOSTILE_TEST_TIMEOUT_MS = 30_000;
const EM_DASH = String.fromCodePoint(0x2014);

function summarizeTimed(raw: string): { text: string; ms: number } {
  const started = performance.now();
  const text = summarizeDescription(raw, 'Weather', 'Data');
  return { text, ms: performance.now() - started };
}

describe('summarizeDescription on a hostile registry description', () => {
  it.each([
    ['unterminated html tags', '<a'.repeat(150_000)],
    ['unterminated markdown images', '!['.repeat(150_000)],
    ['unterminated markdown links', '['.repeat(100_000)],
    ['unterminated autolinks', '<http://'.repeat(50_000)],
    ['unterminated emphasis', '*a'.repeat(60_000)],
    ['sentence terminators', '.'.repeat(100_000)],
    ['one whitespace run with no dash', `${' '.repeat(99_999)}a`],
    ['whitespace runs around dashes', `${' '.repeat(5_000)}${EM_DASH}`.repeat(19)],
    ['blank lines', '\n'.repeat(100_000)],
    ['blank windows lines', '\r\n'.repeat(50_000)],
  ])(
    'summarizes %s in linear time',
    (_label, raw) => {
      const { ms } = summarizeTimed(raw);
      expect(ms).toBeLessThan(HOSTILE_BUDGET_MS);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );

  it(
    'trims trailing dots in linear time when a long run of dots is followed by a letter',
    () => {
      const raw = `Weather lookups ${'.'.repeat(46)}x`;
      const { text, ms } = summarizeTimed(raw);
      expect(ms).toBeLessThan(HOSTILE_BUDGET_MS);
      expect(text).toBe(`${raw}.`);
    },
    HOSTILE_TEST_TIMEOUT_MS,
  );

  it('keeps the first sentence of a long description unchanged', () => {
    const raw = `Search issues in Linear, filter by assignee and cycle. ${'Create tickets from chat. '.repeat(400)}`;
    expect(summarizeDescription(raw, 'Linear', 'Productivity')).toBe(
      'Search issues in Linear, filter by assignee and cycle.',
    );
  });

  it('finds the first sentence behind more than 2,000 characters of HTML badges', () => {
    const badges =
      '<img src="https://img.shields.io/badge/weather-forecast-blue" alt="badge">'.repeat(30);
    const raw = `<p align="center">${badges}</p>\n\nWeather lookups for any city with hourly forecasts. More.`;
    expect(raw.length).toBeGreaterThan(2_000);
    expect(summarizeDescription(raw, 'Weather', 'Data')).toBe(
      'Weather lookups for any city with hourly forecasts.',
    );
  });

  it.each([
    ['bare urls', 'https://img.shields.io/badge/weather-forecast-blue-long-label '.repeat(40)],
    ['blank lines', '\n'.repeat(2_100)],
    ['empty list items', '- \n'.repeat(800)],
  ])('finds the first sentence behind more than 2,000 characters of %s', (_label, prefix) => {
    const raw = `${prefix}\n\nWeather lookups for any city with hourly forecasts. More.`;
    expect(raw.length).toBeGreaterThan(2_000);
    expect(summarizeDescription(raw, 'Weather', 'Data')).toBe(
      'Weather lookups for any city with hourly forecasts.',
    );
  });

  it('finds the first sentence behind more than 2,000 characters of markdown badges', () => {
    const badges =
      '![badge](https://img.shields.io/badge/weather-forecast-blue-long-label-here) '.repeat(30);
    const raw = `${badges}\n\nWeather lookups for any city with hourly forecasts. More.`;
    expect(raw.length).toBeGreaterThan(2_000);
    expect(summarizeDescription(raw, 'Weather', 'Data')).toBe(
      'Weather lookups for any city with hourly forecasts.',
    );
  });

  it('finds the first sentence behind a code fence longer than 2,000 characters', () => {
    const raw = `\`\`\`\n${'x = 1\n'.repeat(400)}\`\`\`\nWeather lookups for any city with hourly forecasts. More.`;
    expect(raw.length).toBeGreaterThan(2_000);
    expect(summarizeDescription(raw, 'Weather', 'Data')).toBe(
      'Weather lookups for any city with hourly forecasts.',
    );
  });

  it('removes a code fence before treating a less-than sign inside it as a tag', () => {
    const raw =
      '```\nif a <b then\n```\nUse this > that. Weather lookups for any city with hourly forecasts.';
    expect(summarizeDescription(raw, 'Weather', 'Data')).toBe(
      'Use this > that. Weather lookups for any city with hourly forecasts.',
    );
  });

  it('removes markdown links and images before treating a less-than sign in a target as a tag', () => {
    expect(
      summarizeDescription(
        'Read the [docs](https://x.com/<b) and use this > that. Weather lookups for any city.',
        'Weather',
        'Data',
      ),
    ).toBe('Read the docs and use this > that.');
    expect(
      summarizeDescription(
        'Read ![logo](https://x.com/<img.png) the docs, use this > that. Weather lookups for any city.',
        'Weather',
        'Data',
      ),
    ).toBe('Read the docs, use this > that.');
  });

  it('strips markup from a long description the same way', () => {
    const raw = `<b>Manage</b> [your calendar](https://example.com) and ![logo](x.png) events. ${'More text. '.repeat(300)}`;
    expect(summarizeDescription(raw, 'Cal', 'Productivity')).toBe(
      'Manage your calendar and events.',
    );
  });
});
