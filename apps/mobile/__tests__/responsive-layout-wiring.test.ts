import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mobileRoot = join(__dirname, '..');
const readSource = (...segments: string[]) => readFileSync(join(mobileRoot, ...segments), 'utf8');

describe('responsive layout production wiring', () => {
  it('drives the authenticated drawer from the shared responsive policy', () => {
    const source = readSource('app', '(app)', '_layout.tsx');

    expect(source).toContain('useTabletLayout()');
    expect(source).toContain('drawerGestureOptions({ usesPersistentDrawer })');
    expect(source).toContain('drawerType: gestures.drawerType');
    expect(source).toContain('width: drawerWidth');
    expect(source).toContain('swipeEnabled: gestures.swipeEnabled');
    expect(source).toContain('swipeEdgeWidth: gestures.swipeEdgeWidth');
    expect(source).toContain('swipeMinDistance: gestures.swipeMinDistance');
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
