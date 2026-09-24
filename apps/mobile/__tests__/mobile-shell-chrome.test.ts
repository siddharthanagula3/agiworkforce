import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { getColors } from '@/src/ui/theme/tokens';
import { getTabletLayout } from '@/src/shared/hooks/useTabletLayout';
import { drawerGestureOptions } from '@/src/features/shell/drawerGestures';

const MOBILE_ROOT = join(__dirname, '..');
const ROOT_LAYOUT = readFileSync(join(MOBILE_ROOT, 'app', '_layout.tsx'), 'utf8');
const APP_CONFIG = readFileSync(join(MOBILE_ROOT, 'app.config.js'), 'utf8');

// iOS reads at 11pt and no smaller; anything under it was an outlier badge
// rather than a tier of the scale.
const MINIMUM_TYPE_SIZE = 10;
const LARGEST_BODY_TYPE_SIZE = 34;
// The three surfaces that are a single piece of display type: the onboarding
// wordmark, the not-found numeral and the crash screen's mark.
const DISPLAY_TYPE_SURFACES = [
  'app/(public)/onboarding.tsx',
  'app/+not-found.tsx',
  'app/error.tsx',
];
const FONT_SIZE = /\bfontSize:\s*(\d+)\b/g;

const SAFE_AREA = /SafeAreaView|useSafeAreaInsets|SettingsScreenShell|useFullScreenChrome/;
const REDIRECT_ONLY = /<Redirect\b/;
const LOCAL_IMPORT = /from '((?:@\/|\.\/|\.\.\/)[^']+)'/g;

const MODAL = /<Modal\b/;
const TEXT_INPUT = /<TextInput|<Input\b/;
const KEYBOARD_AWARE = /KeyboardAvoidingView|keyboardVerticalOffset|useAnimatedKeyboard/;

const THEMED_BACKGROUND =
  /\b\w*[Cc]olors?\.(background|surfaceBase|surfaceElevated|surfaceOverlay)\b/;

function sourceFiles(roots: string[]): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['__tests__', '__mocks__', 'node_modules'].includes(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) continue;
      found.push({ path: relative(MOBILE_ROOT, full), text: readFileSync(full, 'utf8') });
    }
  };
  for (const root of roots) walk(join(MOBILE_ROOT, root));
  return found;
}

function resolveModule(specifier: string, fromPath: string): string | null {
  const base = specifier.startsWith('@/')
    ? specifier.slice(2)
    : normalize(join(dirname(fromPath), specifier));
  for (const suffix of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
    const candidate = `${base}${suffix}`;
    if (existsSync(join(MOBILE_ROOT, candidate))) return candidate;
  }
  return null;
}

// A route file is often four lines that render the feature screen, so the
// question is whether the tree it mounts handles the inset, not whether the
// route file mentions it.
function reaches(path: string, matcher: RegExp, depth = 0, seen = new Set<string>()): boolean {
  if (seen.has(path) || depth > 3) return false;
  seen.add(path);
  const text = readFileSync(join(MOBILE_ROOT, path), 'utf8');
  if (matcher.test(text)) return true;
  for (const match of text.matchAll(LOCAL_IMPORT)) {
    const resolved = resolveModule(match[1], path);
    if (resolved && reaches(resolved, matcher, depth + 1, seen)) return true;
  }
  return false;
}

const SCREEN_FILES = sourceFiles(['app']).filter(
  (file) => !file.path.endsWith('_layout.tsx') && file.path.endsWith('.tsx'),
);
const ALL_FILES = sourceFiles(['app', 'src', 'components', 'hooks']);

describe('the shell has surfaces to measure', () => {
  it('finds every route and a tree behind it', () => {
    expect(SCREEN_FILES.length).toBeGreaterThan(50);
    expect(ALL_FILES.length).toBeGreaterThan(200);
  });
});

describe('the system bars take the theme rather than a fixed colour', () => {
  it('derives the status bar style from the resolved theme, both ways', () => {
    expect(getColors('dark', null, false).background).not.toBe(
      getColors('light', 'light', false).background,
    );
    expect(ROOT_LAYOUT).toMatch(/<StatusBar style=\{statusBarStyle\} \/>/);
    expect(ROOT_LAYOUT).toMatch(/statusBarStyle/);
  });

  it('paints no bar a colour of its own that a theme change cannot reach', () => {
    expect(APP_CONFIG).not.toMatch(/androidNavigationBar|androidStatusBar/);

    const fixedBars = ALL_FILES.filter((file) =>
      /(barStyle|backgroundColor)=\{?['"]#[0-9a-fA-F]{3,8}['"]\}?/.test(file.text),
    ).map((file) => file.path);

    expect(fixedBars).toEqual([]);
  });

  it('lets the themed background reach the bar the system draws over', () => {
    expect(ROOT_LAYOUT).toMatch(/backgroundColor: themeColors\.background/);
  });
});

describe('type sizes sit in the band a phone can read', () => {
  const sizes = ALL_FILES.flatMap((file) =>
    Array.from(file.text.matchAll(FONT_SIZE), (match) => ({
      path: file.path,
      value: Number(match[1]),
    })),
  );

  it('finds the sizes the app actually sets', () => {
    expect(sizes.length).toBeGreaterThan(800);
  });

  it('sets no label too small for the platform to render legibly', () => {
    const tooSmall = sizes
      .filter((size) => size.value < MINIMUM_TYPE_SIZE)
      .map((size) => `${size.path}: fontSize ${size.value}`);

    expect(tooSmall).toEqual([]);
  });

  it('keeps display type to the three surfaces that are one piece of type', () => {
    const oversized = [
      ...new Set(
        sizes.filter((size) => size.value > LARGEST_BODY_TYPE_SIZE).map((size) => size.path),
      ),
    ];

    expect(oversized.sort()).toEqual([...DISPLAY_TYPE_SURFACES].sort());
  });

  it('remeasures the tree when the reader changes the system type size', () => {
    expect(ROOT_LAYOUT).toContain('<TextScaleBoundary>');
  });
});

describe('nothing the user must reach sits under a system inset', () => {
  it('gives every route a tree that accounts for the safe area', () => {
    const uncovered = SCREEN_FILES.filter(
      (file) => !REDIRECT_ONLY.test(file.text) && !reaches(file.path, SAFE_AREA),
    ).map((file) => file.path);

    expect(uncovered).toEqual([]);
  });

  it('lifts every modal that takes typing clear of the keyboard', () => {
    const covered = ALL_FILES.filter((file) => MODAL.test(file.text) && TEXT_INPUT.test(file.text));

    expect(covered.length).toBeGreaterThan(10);
    expect(covered.filter((file) => !KEYBOARD_AWARE.test(file.text)).map((f) => f.path)).toEqual(
      [],
    );
  });
});

describe('an overscroll shows the app, not whatever is behind it', () => {
  it('paints every route on the themed background a bounce reveals', () => {
    const bare = SCREEN_FILES.filter(
      (file) => !REDIRECT_ONLY.test(file.text) && !reaches(file.path, THEMED_BACKGROUND),
    ).map((file) => file.path);

    expect(bare).toEqual([]);
  });
});

describe('the mobile shell is built for a phone, not shrunk from a desktop', () => {
  it('hands the phone an overlay drawer and the tablet a permanent one', () => {
    const phone = getTabletLayout({ width: 390, height: 844 });
    const tablet = getTabletLayout({ width: 1366, height: 1024 });

    expect(phone.usesPersistentDrawer).toBe(false);
    expect(tablet.usesPersistentDrawer).toBe(true);
    expect(
      drawerGestureOptions({ usesPersistentDrawer: phone.usesPersistentDrawer }),
    ).toMatchObject({ drawerType: 'front', swipeEnabled: true });
    expect(
      drawerGestureOptions({ usesPersistentDrawer: tablet.usesPersistentDrawer }),
    ).toMatchObject({ drawerType: 'permanent', swipeEnabled: false });
  });

  it('keeps secondary controls in a sheet rather than a desktop menu', () => {
    const sheet = readFileSync(
      join(MOBILE_ROOT, 'src', 'features', 'shell', 'ShellSecondarySheet.tsx'),
      'utf8',
    );

    expect(sheet).toContain("from '@/components/ui/bottom-sheet'");
    expect(sheet).toContain('<BottomSheet');
  });

  it('gives the phone header only the actions a thumb needs', () => {
    const drawer = readFileSync(
      join(MOBILE_ROOT, 'src', 'features', 'drawer', 'components', 'DrawerContent.tsx'),
      'utf8',
    );
    const headerActions = Array.from(
      drawer.matchAll(/<HeaderIconButton\s+label="([^"]+)"/g),
      (match) => match[1],
    );

    expect(headerActions).toEqual(['Search', 'New chat', 'Open profile']);
  });

  it('leaves the platform back gesture switched on for every pushed screen', () => {
    const disabled = ALL_FILES.filter((file) =>
      /(gestureEnabled|fullScreenGestureEnabled)\s*[:=]\s*\{?\s*false/.test(file.text),
    ).map((file) => file.path);

    expect(disabled).toEqual([]);
    expect(
      ALL_FILES.filter((file) => /<Stack\b|createNativeStackNavigator/.test(file.text)).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('re-resolves the layout from the window the app was given, not the screen', () => {
    const splitView = getTabletLayout({ width: 507, height: 1024 }, { width: 1024, height: 1366 });
    const fullScreen = getTabletLayout({ width: 1024, height: 1366 });

    expect(splitView.isSplitView).toBe(true);
    expect(splitView.usesPersistentDrawer).toBe(false);
    expect(fullScreen.isSplitView).toBe(false);
    expect(fullScreen.usesPersistentDrawer).toBe(true);
    expect(fullScreen.gridColumns).toBeGreaterThan(splitView.gridColumns);
  });
});
