import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mobileRoot = join(__dirname, '..');
const readSource = (...segments: string[]) => readFileSync(join(mobileRoot, ...segments), 'utf8');

describe('responsive layout production wiring', () => {
  it('drives the authenticated drawer from the shared responsive policy', () => {
    const source = readSource('app', '(app)', '_layout.tsx');

    expect(source).toContain('useResponsiveLayout()');
    expect(source).toContain("drawerType: usesPersistentDrawer ? 'permanent' : 'front'");
    expect(source).toContain('width: drawerWidth');
    expect(source).toContain('swipeEnabled: !usesPersistentDrawer');
    expect(source).not.toContain('width >= 768');
  });

  it.each([
    { label: 'artifacts', segments: ['src', 'features', 'artifacts', 'index.tsx'] },
    { label: 'library', segments: ['src', 'features', 'library', 'index.tsx'] },
  ])('remounts the $label grid when its responsive column count changes', ({ segments }) => {
    const source = readSource(...segments);

    expect(source).toContain('useResponsiveLayout()');
    expect(source).toMatch(/key=\{`(?:artifacts|library)-\$\{gridColumns\}`\}/);
    expect(source).toContain('numColumns={gridColumns}');
  });
});
