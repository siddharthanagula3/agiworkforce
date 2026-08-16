import fs from 'node:fs';
import path from 'node:path';

const MOBILE_ROOT = path.resolve(__dirname, '..');
const CANONICAL_MOBILE_CATALOG = 'src/features/settings/cloud-connectors/index.tsx';
const WEB_CATALOG = path.resolve(MOBILE_ROOT, '../web/features/connectors/data/connectors.ts');

interface CatalogEntry {
  id: string;
  name: string;
}

function readCatalog(file: string, marker: string): CatalogEntry[] {
  const source = fs.readFileSync(file, 'utf8');
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`${file}: could not find "${marker}" — has the catalog been renamed or moved?`);
  }

  const rest = source.slice(markerIndex);
  const open = rest.indexOf('= [') + 2;
  let depth = 0;
  let close = -1;
  for (let i = open; i < rest.length; i += 1) {
    if (rest[i] === '[') depth += 1;
    else if (rest[i] === ']') {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0) throw new Error(`${file}: unterminated array after "${marker}"`);

  return rest
    .slice(open, close + 1)
    .split('{')
    .slice(1)
    .map((entry) => ({
      id: (entry.match(/id: '([^']+)'/) ?? [])[1],
      name: (entry.match(/name: '([^']*)'/) ?? [])[1],
    }))
    .filter((entry): entry is CatalogEntry => Boolean(entry.id));
}

function mobileSourceFiles(): string[] {
  const roots = ['app', 'src', 'components', 'lib', 'services', 'stores', 'types'];
  const files: string[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) files.push(full);
    }
  };

  for (const root of roots) {
    const full = path.join(MOBILE_ROOT, root);
    if (fs.existsSync(full)) walk(full);
  }
  return files;
}

describe('mobile connector catalog ownership', () => {
  const catalog = readCatalog(
    path.join(MOBILE_ROOT, CANONICAL_MOBILE_CATALOG),
    'const CATALOG: ConnectorEntry[]',
  );

  it('reads a non-empty catalog from the one API-backed screen', () => {
    expect(catalog.length).toBeGreaterThan(10);
  });

  it('has exactly one Mobile file that enumerates connector ids', () => {
    const ids = catalog.map((entry) => entry.id);
    const enumerating = mobileSourceFiles().filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return (
        ids.filter((id) => source.includes(`'${id}'`) || source.includes(`"${id}"`)).length >= 3
      );
    });

    expect(enumerating.map((file) => path.relative(MOBILE_ROOT, file))).toEqual([
      CANONICAL_MOBILE_CATALOG,
    ]);
  });

  it('keeps the chat-facing /(app)/connectors route a delegating wrapper', () => {
    const wrapper = fs.readFileSync(
      path.join(MOBILE_ROOT, 'app/(app)/connectors/index.tsx'),
      'utf8',
    );

    expect(wrapper).toContain("from '@/src/features/settings/cloud-connectors'");
    expect(wrapper).not.toMatch(/description:\s*'/);
    expect(wrapper).not.toMatch(/category:\s*'/);
  });

  it('matches the canonical web catalog on every id and display name', () => {
    const canonical = new Map(
      readCatalog(WEB_CATALOG, 'const CONNECTOR_SEEDS: ConnectorSeed[]').map((entry) => [
        entry.id,
        entry.name,
      ]),
    );
    expect(canonical.size).toBeGreaterThan(catalog.length);

    const drifted = catalog.filter(
      (entry) => !canonical.has(entry.id) || canonical.get(entry.id) !== entry.name,
    );

    expect(drifted).toEqual([]);
  });
});
