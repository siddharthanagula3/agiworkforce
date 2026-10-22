import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';
import { PRODUCT_NAMES } from '@agiworkforce/types';

import { loadThirdPartyNotices } from './load-notices';
import {
  NOTICE_SOURCE_LABEL,
  coveredSources,
  groupByLicense,
  licenseGroupKey,
  numberTexts,
  summarizeNotices,
  type NoticePackage,
  type ThirdPartyNotices,
} from './notices';

function pkg(overrides: Partial<NoticePackage>): NoticePackage {
  return {
    ecosystem: 'npm',
    name: 'pkg',
    version: '1.0.0',
    license: 'MIT',
    url: null,
    copyright: [],
    textIds: [],
    sources: ['web'],
    ...overrides,
  };
}

const NOTICES: ThirdPartyNotices = {
  texts: {
    mit: 'MIT License\n\nPermission is hereby granted.',
    apache: 'Apache License\nText',
    unused: 'x',
  },
  packages: [
    pkg({ name: 'zeta', textIds: ['mit'] }),
    pkg({ name: 'alpha', textIds: ['mit'], license: 'MIT OR Apache-2.0' }),
    pkg({ name: 'beta', textIds: ['apache', 'mit'], license: 'Apache-2.0/MIT', sources: ['cli'] }),
    pkg({
      name: 'crate',
      ecosystem: 'cargo',
      textIds: ['apache'],
      license: 'Apache-2.0',
      sources: ['cli'],
    }),
    pkg({ name: 'bare', license: 'ISC' }),
  ],
};

describe('licenseGroupKey', () => {
  it('treats every spelling of the same choice of licenses as one group', () => {
    expect(licenseGroupKey('Apache-2.0/MIT')).toBe('Apache-2.0 OR MIT');
    expect(licenseGroupKey('MIT OR Apache-2.0')).toBe('Apache-2.0 OR MIT');
    expect(licenseGroupKey('MIT')).toBe('MIT');
    expect(licenseGroupKey('(MIT OR Apache-2.0) AND BSD-3-Clause')).toBe(
      '(MIT OR Apache-2.0) AND BSD-3-Clause',
    );
  });
});

describe('groupByLicense', () => {
  it('lists every package once under its license, largest group first', () => {
    const groups = groupByLicense(NOTICES.packages);
    expect(
      groups.map((group) => [group.license, group.packages.map((entry) => entry.name)]),
    ).toEqual([
      ['Apache-2.0 OR MIT', ['alpha', 'beta']],
      ['Apache-2.0', ['crate']],
      ['ISC', ['bare']],
      ['MIT', ['zeta']],
    ]);
  });
});

describe('numberTexts', () => {
  it('numbers each referenced text once, most used first, and drops unreferenced ones', () => {
    expect(
      numberTexts(NOTICES).map((text) => [text.number, text.id, text.title, text.usedBy]),
    ).toEqual([
      [1, 'mit', 'MIT License', 3],
      [2, 'apache', 'Apache License', 2],
    ]);
  });
});

describe('coveredSources', () => {
  it('names only the products the generated notices cover, in product order', () => {
    expect(coveredSources(NOTICES)).toEqual(['web', 'cli']);
    expect(NOTICE_SOURCE_LABEL).toEqual({
      web: PRODUCT_NAMES.chat,
      desktop: PRODUCT_NAMES.desktop,
      cli: PRODUCT_NAMES.cli,
    });
  });
});

describe('summarizeNotices', () => {
  it('carries only the counts and titles the page renders before the notices load', () => {
    expect(summarizeNotices(NOTICES)).toEqual({
      products: [PRODUCT_NAMES.chat, PRODUCT_NAMES.cli],
      packageCount: 5,
      groups: [
        { license: 'Apache-2.0 OR MIT', count: 2 },
        { license: 'Apache-2.0', count: 1 },
        { license: 'ISC', count: 1 },
        { license: 'MIT', count: 1 },
      ],
      texts: [
        { number: 1, title: 'MIT License', usedBy: 3 },
        { number: 2, title: 'Apache License', usedBy: 2 },
      ],
    });
  });
});

describe('loadThirdPartyNotices', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'third-party-notices-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null when the build has not generated the notices', () => {
    expect(loadThirdPartyNotices(path.join(dir, 'missing.json'))).toBeNull();
  });

  it('reads the generated notices', () => {
    const file = path.join(dir, 'notices.json');
    writeFileSync(file, JSON.stringify(NOTICES));
    expect(loadThirdPartyNotices(file)).toEqual(NOTICES);
  });
});
