import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const LOCALES_DIR = join(__dirname, '..', '..', '..', 'packages', 'ui', 'i18n', 'locales');
const DRAWER_SOURCE = readFileSync(
  join(__dirname, '..', 'src', 'features', 'drawer', 'components', 'DrawerContent.tsx'),
  'utf8',
);

const LABEL_KEYS = [...DRAWER_SOURCE.matchAll(/labelKey: '([^']+)'/g)].map((match) => match[1]!);
const LOCALES = readdirSync(LOCALES_DIR).sort();

function lookup(catalogue: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      catalogue,
    );
}

describe('drawer rows are named in every shipped language', () => {
  it('reads the label keys of the drawer rows', () => {
    expect(LABEL_KEYS).toContain('drawer.images');
    expect(LOCALES).toContain('en');
  });

  it.each(LOCALES)('%s names every drawer row', (locale) => {
    const common = JSON.parse(readFileSync(join(LOCALES_DIR, locale, 'common.json'), 'utf8'));
    const missing = LABEL_KEYS.filter((key) => {
      const value = lookup(common, key);
      return typeof value !== 'string' || !value.trim();
    });

    expect(missing).toEqual([]);
  });

  it('names the Images row Images in English', () => {
    const common = JSON.parse(readFileSync(join(LOCALES_DIR, 'en', 'common.json'), 'utf8'));

    expect(lookup(common, 'drawer.images')).toBe('Images');
  });
});
