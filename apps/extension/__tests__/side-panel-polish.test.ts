import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compactAge } from '../src/features/side-panel/compactAge';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string): string => readFileSync(join(APP_ROOT, relativePath), 'utf8');
const sidePanel = read('src/side_panel.ts');
const catalog = JSON.parse(read('_locales/en/messages.json')) as Record<
  string,
  { message: string; placeholders?: Record<string, { content: string }> }
>;

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

describe('compactAge', () => {
  it.each([
    [0, { unit: 'now' }],
    [59 * SECOND, { unit: 'now' }],
    [-5 * MINUTE, { unit: 'now' }],
    [MINUTE, { unit: 'minute', value: 1 }],
    [59 * MINUTE + 59 * SECOND, { unit: 'minute', value: 59 }],
    [HOUR, { unit: 'hour', value: 1 }],
    [7 * HOUR + 30 * MINUTE, { unit: 'hour', value: 7 }],
    [DAY, { unit: 'day', value: 1 }],
    [6 * DAY + 23 * HOUR, { unit: 'day', value: 6 }],
    [WEEK, { unit: 'week', value: 1 }],
    [3 * WEEK + 2 * DAY, { unit: 'week', value: 3 }],
    [4 * WEEK + 6 * DAY, { unit: 'week', value: 4 }],
    [5 * WEEK, { unit: 'date' }],
    [400 * DAY, { unit: 'date' }],
  ])('reads %i ms as %j', (elapsed, expected) => {
    expect(compactAge(elapsed)).toEqual(expected);
  });
});

describe('compact age catalog entries', () => {
  it.each([
    ['spAgeMinutes', '$COUNT$m'],
    ['spAgeHours', '$COUNT$h'],
    ['spAgeDays', '$COUNT$d'],
    ['spAgeWeeks', '$COUNT$w'],
  ])('%s carries its count into the unit suffix', (key, message) => {
    expect(catalog[key]?.message).toBe(message);
    expect(catalog[key]?.placeholders?.['count']?.content).toBe('$1');
  });

  it('keeps the long-form age in the accessible name of a recent chat', () => {
    expect(catalog['spHistoryOpenChat']?.message).toContain('$AGE$');
    expect(catalog['spHistoryOpenChat']?.placeholders?.['age']?.content).toBe('$2');
  });
});

describe('recent chat rows', () => {
  it('lay the title and the age on one line, the age never shrinking', () => {
    expect(sidePanel).toMatch(
      /\.sp-drawer-history-text \{[^}]*display: flex;[^}]*align-items: center;/,
    );
    expect(sidePanel).toMatch(/\.sp-drawer-history-title \{[^}]*flex: 1 1 auto;[^}]*min-width: 0;/);
    expect(sidePanel).toMatch(
      /\.sp-drawer-history-date \{[^}]*flex-shrink: 0;[^}]*white-space: nowrap;/,
    );
  });

  it('show the compact age and keep the long phrase for the tooltip and the accessible name', () => {
    expect(sidePanel).toContain('formatCompactHistoryAge(historyActivityAt(entry))');
    expect(sidePanel).toMatch(
      /class: 'sp-drawer-history-date',\s*title: formatHistoryDate\(historyActivityAt\(entry\)\)/,
    );
    expect(sidePanel).toMatch(
      /t\('spHistoryOpenChat', \[\s*entry\.title,\s*formatHistoryDate\(historyActivityAt\(entry\)\)/,
    );
  });
});

describe('composer attach button', () => {
  it('shows the pressed state while its menu is open', () => {
    expect(sidePanel).toMatch(
      /\.sp-attach-btn:hover,\s*\.sp-attach-btn\[aria-expanded='true'\],[^{]*\{[^}]*background: var\(--agi-ext-hover\)/,
    );
  });
});

describe('More menu rows that open a tab', () => {
  it('end with an external-link mark that assistive technology skips', () => {
    expect(sidePanel).toContain("renderIcon(ExternalLink, 14, 'sp-external-mark')");
    expect(sidePanel).toMatch(/const row = buildExternalMenuRow\(destination\.label\)/);
    expect(sidePanel).toContain('const openChatInWebItem = buildExternalMenuRow(');
    expect(sidePanel).toMatch(
      /\.sp-history-menu-item\.has-external-mark \{[^}]*justify-content: space-between;/,
    );
  });
});

describe('desktop bridge notice', () => {
  it('reads its copy from the catalog and leaves no dead offline rule behind', () => {
    expect(sidePanel).toContain("t('spBridgeNoticeText')");
    expect(sidePanel).toContain("t('spBridgeNoticeReconnect')");
    expect(sidePanel).not.toContain('Desktop tools are optional');
    expect(sidePanel).not.toContain('bridge-offline');
  });

  it('says what is wrong in one sentence', () => {
    expect(catalog['spBridgeNoticeText']?.message.match(/[.!?]/g)).toHaveLength(1);
  });
});

describe('site allowlist helper', () => {
  it('is one short sentence', () => {
    const options = read('src/options.ts');
    expect(options).toContain(
      "'Approve a site so the assistant can act on it, and remove it any time.'",
    );
    expect(options).not.toContain('Browser control requires a separate confirmation');
  });
});
