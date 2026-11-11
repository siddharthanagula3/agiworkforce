import fs from 'fs';
import path from 'path';
import { NAMESPACES, baseInitOptions, resources } from '@agiworkforce/i18n';

const MOBILE_ROOT = path.resolve(__dirname, '..');
const SOURCE_DIRS = ['app', 'components', 'src', 'stores', 'lib'];
const SKIPPED_DIRS = new Set(['node_modules', '__tests__', '__mocks__', 'ios', 'android']);

type Catalog = Record<string, unknown>;

function lookup(catalog: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object' && part in (node as Catalog)) {
      return (node as Catalog)[part];
    }
    return undefined;
  }, catalog);
}

function englishValue(namespace: string, key: string): unknown {
  const english = (resources as Record<string, Record<string, Catalog>>).en;
  return lookup(english[namespace], key);
}

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function defaultNamespaceOf(source: string): string {
  const match = source.match(/useTranslation\(\s*\[?\s*['"]([A-Za-z0-9_-]+)['"]/);
  return match?.[1] ?? baseInitOptions.defaultNS;
}

function literalTranslationKeys(source: string): string[] {
  return [...source.matchAll(/\bt\(\s*['"]([A-Za-z0-9_.:-]+)['"]/g)].map((match) => match[1]);
}

describe('mobile translation keys', () => {
  it('resolves every literal t() key in the mobile app against the English locale', () => {
    const namespaces = new Set<string>(NAMESPACES);
    const missing = SOURCE_DIRS.flatMap((dir) => sourceFiles(path.join(MOBILE_ROOT, dir))).flatMap(
      (file) => {
        const source = fs.readFileSync(file, 'utf8');
        if (!source.includes('useTranslation') && !source.includes('i18n')) return [];
        const fallbackNamespace = defaultNamespaceOf(source);
        return literalTranslationKeys(source)
          .filter((raw) => {
            const [namespace, key] = raw.includes(':')
              ? (raw.split(/:(.*)/s, 2) as [string, string])
              : [fallbackNamespace, raw];
            if (!namespaces.has(namespace)) return true;
            return englishValue(namespace, key) === undefined;
          })
          .map((raw) => `${path.relative(MOBILE_ROOT, file)}: ${raw}`);
      },
    );
    expect(missing).toEqual([]);
  });
});
