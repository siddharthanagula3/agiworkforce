import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

import {
  MOBILE_STORE_IDS,
  isStorePublished,
  type MobileStoreId,
} from '@/src/features/release-state';

const mobileRoot = join(__dirname, '..');

const SHIPPED_DIRS = ['app', 'components', 'hooks', 'lib', 'services', 'src', 'stores'];

const SKIP_DIR_NAMES = new Set(['__tests__', '__mocks__', 'node_modules', '.expo']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

const SKIP_FILE_SUFFIXES = ['.generated.ts'];

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, out);
      continue;
    }
    if (entry.includes('.test.') || entry.includes('.spec.')) continue;
    if (SKIP_FILE_SUFFIXES.some((suffix) => entry.endsWith(suffix))) continue;
    if (SOURCE_EXTENSIONS.has(extname(entry))) out.push(full);
  }
  return out;
}

const shippedSources = SHIPPED_DIRS.flatMap((dir) => collectSourceFiles(join(mobileRoot, dir)));

const UNIVERSAL_CLAIM_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'store badge / install CTA', pattern: /download on the app store/i },
  { label: 'store badge / install CTA', pattern: /get it on google play/i },
  { label: 'availability claim', pattern: /available (?:now )?(?:on|in) the app store/i },
  { label: 'availability claim', pattern: /available (?:now )?on google play/i },
  { label: 'star rating claim', pattern: /\b[0-5](?:\.\d)?\s*(?:★|stars?\b)/i },
  { label: 'rating claim', pattern: /\brated\s+[0-5](?:\.\d)?\b/i },
  { label: 'review-count claim', pattern: /\b\d[\d,]*\+?\s*(?:ratings|reviews)\b/i },
];

const STORE_CLAIM_PATTERNS: Readonly<Record<MobileStoreId, ReadonlyArray<RegExp>>> = {
  apple: [/apps\.apple\.com/i, /'the Apple App Store'/],
  google: [/play\.google\.com/i, /'Google Play'/],
};

const REGISTRY_OWNED_FILES = ['src/features/release-state/index.ts', 'lib/safeOpenURL.ts'] as const;

function isRegistryOwned(relativePath: string): boolean {
  return (REGISTRY_OWNED_FILES as readonly string[]).includes(relativePath.split('\\').join('/'));
}

describe('mobile makes no store claim the release-state registry cannot back', () => {
  it('scans the shipped mobile source tree', () => {
    expect(shippedSources.length).toBeGreaterThan(200);
    expect(
      shippedSources.some((file) => file.endsWith(join('billing', 'subscriptionSource.ts'))),
    ).toBe(true);
  });

  it.each(UNIVERSAL_CLAIM_PATTERNS)(
    'no shipped file carries a $label ($pattern)',
    ({ pattern }) => {
      const offenders = shippedSources
        .filter((file) => pattern.test(readFileSync(file, 'utf8')))
        .map((file) => relative(mobileRoot, file));
      expect(offenders).toEqual([]);
    },
  );

  it.each(MOBILE_STORE_IDS)(
    'no shipped file outside the registry links to or names %s',
    (store) => {
      if (isStorePublished(store)) {
        return;
      }
      const offenders: string[] = [];
      for (const file of shippedSources) {
        const relativePath = relative(mobileRoot, file);
        if (isRegistryOwned(relativePath)) continue;
        const source = readFileSync(file, 'utf8');
        for (const pattern of STORE_CLAIM_PATTERNS[store]) {
          if (pattern.test(source)) offenders.push(`${relativePath} :: ${pattern}`);
        }
      }
      expect(offenders).toEqual([]);
    },
  );

  it('keeps the exemption list to the registry reader and the URL allowlist', () => {
    const stillMentionsAStore = REGISTRY_OWNED_FILES.filter((relativePath) => {
      const source = readFileSync(join(mobileRoot, relativePath), 'utf8');
      return MOBILE_STORE_IDS.some((store) =>
        STORE_CLAIM_PATTERNS[store].some((pattern) => pattern.test(source)),
      );
    });
    expect(stillMentionsAStore).toEqual([...REGISTRY_OWNED_FILES]);
  });
});
