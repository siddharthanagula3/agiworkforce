import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const MOBILE_ROOT = join(__dirname, '..');
const APP_ROOT = join(MOBILE_ROOT, 'app', '(app)');
const LAYOUT = readFileSync(join(APP_ROOT, '_layout.tsx'), 'utf8');

const DRAWER_ROUTES = new Set(
  Array.from(LAYOUT.matchAll(/<Drawer\.Screen\s+name="([^"]+)"/g), (match) => match[1]),
);

// A back control that pops lands the user where they came from; one that
// navigates to a fixed href lands them somewhere they may never have been.
const POPS = /router\.back\(\)|navigation\.goBack\(\)|\buseGoBack\(|\bSettingsScreenShell\b/;
const GUARDS_EMPTY_HISTORY = /canGoBack\(\)|\buseGoBack\(|\bSettingsScreenShell\b/;
const OPENS_DRAWER = /<DrawerButton|openNearestDrawer|openDrawer\(/;
const REDIRECT_ONLY = /<Redirect\b/;

function routeScreens(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.tsx')) continue;
      if (entry.name === '_layout.tsx' || entry.name === 'error.tsx') continue;
      found.push(full);
    }
  };
  walk(APP_ROOT);
  return found.sort();
}

function resolveModule(specifier: string, importer: string): string | null {
  const base = specifier.startsWith('@/')
    ? join(MOBILE_ROOT, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(importer), specifier)
      : null;
  if (base === null) return null;
  for (const candidate of [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, 'index.tsx'),
    join(base, 'index.ts'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** A route file is usually a re-export, so the screen it renders comes with it. */
function screenSource(file: string, depth = 0, seen = new Set<string>()): string {
  if (seen.has(file) || depth > 2) return '';
  seen.add(file);
  const text = readFileSync(file, 'utf8');
  let combined = text;
  for (const match of text.matchAll(/from '([^']+)'/g)) {
    const resolved = resolveModule(match[1], file);
    if (resolved !== null && resolved.includes('/src/features/')) {
      combined += `\n${screenSource(resolved, depth + 1, seen)}`;
    }
  }
  return combined;
}

interface Screen {
  route: string;
  isDestination: boolean;
  source: string;
}

const SCREENS: Screen[] = routeScreens().map((file) => {
  const route = relative(MOBILE_ROOT, file);
  const name = route.replace('app/(app)/', '').replace(/\.tsx$/, '');
  return {
    route,
    isDestination:
      name === 'index' ||
      name.startsWith('(tabs)/') ||
      DRAWER_ROUTES.has(name) ||
      DRAWER_ROUTES.has(name.replace(/\/index$/, '')),
    source: screenSource(file),
  };
});

describe('every authenticated screen answers back', () => {
  it('enumerates the whole route tree, so an empty sweep cannot pass', () => {
    expect(SCREENS.length).toBeGreaterThan(50);
    expect(SCREENS.filter((screen) => !screen.isDestination).length).toBeGreaterThan(10);
  });

  it('gives a pushed screen a control that pops the stack', () => {
    const stranded = SCREENS.filter(
      (screen) =>
        !screen.isDestination && !POPS.test(screen.source) && !OPENS_DRAWER.test(screen.source),
    ).map((screen) => screen.route);

    expect(stranded).toEqual([]);
  });

  it('gives a drawer destination the drawer, since there is nothing below it to pop to', () => {
    const stranded = SCREENS.filter(
      (screen) =>
        screen.isDestination &&
        !OPENS_DRAWER.test(screen.source) &&
        !POPS.test(screen.source) &&
        !REDIRECT_ONLY.test(screen.source),
    ).map((screen) => screen.route);

    expect(stranded).toEqual([]);
  });

  it('never pops a screen a deep link opened with no history behind it', () => {
    const unguarded = SCREENS.filter(
      (screen) => POPS.test(screen.source) && !GUARDS_EMPTY_HISTORY.test(screen.source),
    ).map((screen) => screen.route);

    expect(unguarded).toEqual([]);
  });
});
