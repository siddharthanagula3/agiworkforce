import fs from 'node:fs';
import path from 'node:path';
import { CONNECTOR_DIRECTORY_PATH } from '@agiworkforce/cloud-contracts';

const MOBILE_ROOT = path.resolve(__dirname, '..');
const LIST_SCREEN = 'src/features/settings/cloud-connectors/index.tsx';
const DETAIL_SCREEN = 'src/features/settings/cloud-connectors/ConnectorDetailScreen.tsx';
const CONNECTOR_SERVICE = 'services/connectors.ts';

const CATALOG_DECLARATION = /\bconst\s+(?:CATALOG|CONNECTOR_[A-Z_]*(?:CATALOG|SEEDS))\b/;
const FLAT_OBJECT_LITERAL = /\{[^{}]*\}/g;
const STRING_ID_FIELD = /\bid:\s*(['"`])[^'"`]+\1/;
const STRING_CATEGORY_FIELD = /\bcategory:\s*(['"`])[^'"`]+\1/;

function catalogShapedEntries(source: string): string[] {
  return (source.match(FLAT_OBJECT_LITERAL) ?? []).filter(
    (literal) => STRING_ID_FIELD.test(literal) && STRING_CATEGORY_FIELD.test(literal),
  );
}

function declaresConnectorCatalog(source: string): boolean {
  return CATALOG_DECLARATION.test(source) || catalogShapedEntries(source).length > 0;
}

function readMobile(relativePath: string): string {
  return fs.readFileSync(path.join(MOBILE_ROOT, relativePath), 'utf8');
}

function mobileSourceFiles(): string[] {
  const roots = ['app', 'src', 'components', 'lib', 'services', 'stores', 'types'];
  const files: string[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(full);
    }
  };

  for (const root of roots) {
    const full = path.join(MOBILE_ROOT, root);
    if (fs.existsSync(full)) walk(full);
  }
  return files;
}

describe('mobile connector registry ownership', () => {
  const files = mobileSourceFiles();
  const relativeFiles = files.map((file) => path.relative(MOBILE_ROOT, file));

  it('scans the real Mobile source tree, including every connector screen', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(relativeFiles).toEqual(
      expect.arrayContaining([
        LIST_SCREEN,
        DETAIL_SCREEN,
        CONNECTOR_SERVICE,
        'src/features/settings/cloud-connectors/ConnectorLogo.tsx',
      ]),
    );
  });

  it('flags a hand-coded catalog and leaves a logo lookup table alone', () => {
    expect(
      declaresConnectorCatalog(
        "const CATALOG: ConnectorEntry[] = [{ id: 'notion', name: 'Notion', category: 'Productivity' }];",
      ),
    ).toBe(true);
    expect(
      declaresConnectorCatalog(
        "export const entries = [\n  {\n    id: 'slack',\n    name: 'Slack',\n    category: 'Communication',\n  },\n];",
      ),
    ).toBe(true);
    expect(
      declaresConnectorCatalog(
        "const SI: Record<string, { path: string; hex: string }> = { notion: { hex: '000000', path: 'M0 0' } };",
      ),
    ).toBe(false);
  });

  it('keeps every connector list on the registry instead of a hand-coded Mobile catalog', () => {
    const declaring = files.filter((file) =>
      declaresConnectorCatalog(fs.readFileSync(file, 'utf8')),
    );

    expect(declaring.map((file) => path.relative(MOBILE_ROOT, file))).toEqual([]);
  });

  it('browses connectors from the registry directory endpoint', () => {
    const listScreen = readMobile(LIST_SCREEN);
    const detailScreen = readMobile(DETAIL_SCREEN);
    const service = readMobile(CONNECTOR_SERVICE);

    expect(CONNECTOR_DIRECTORY_PATH).toBe('/api/connectors/directory');
    expect(service).toMatch(/function listingHref[\s\S]*\$\{CONNECTOR_DIRECTORY_PATH\}\?/);
    expect(service).toMatch(
      /export async function browseConnectorListings[\s\S]*?api\.get<unknown>\(listingHref\(filter\)\)/,
    );
    expect(listScreen).toMatch(
      /import \{[^}]*\bbrowseConnectorListings\b[^}]*\} from '@\/services\/connectors'/,
    );
    expect(listScreen).toMatch(/await browseConnectorListings\(\{/);
    expect(detailScreen).toMatch(/fetchConnectorListing\(validConnectorId\)/);
  });

  it('keeps the chat-facing /(app)/connectors route a delegating wrapper', () => {
    const wrapper = readMobile('app/(app)/connectors/index.tsx');

    expect(wrapper).toContain("from '@/src/features/settings/cloud-connectors'");
    expect(wrapper).not.toMatch(/description:\s*'/);
    expect(wrapper).not.toMatch(/category:\s*'/);
  });
});
