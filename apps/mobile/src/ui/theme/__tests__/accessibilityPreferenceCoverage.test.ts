import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const MOBILE_ROOT = join(__dirname, '..', '..', '..', '..');
const SOURCE_ROOTS = ['app', 'src', 'components', 'hooks'];

const REANIMATED_MOTION = /\bwith(Timing|Spring|Repeat|Decay|Sequence|Delay)\s*\(/;
const CORE_MOTION = /\bAnimated\.(timing|spring|loop|decay)\s*\(|\bLayoutAnimation\b/;
const READS_PREFERENCE = /\buseReduceMotion\b/;
const OPTS_OUT = /ReduceMotion\.Never/;

const THEME_SOURCES = /\buseThemeColors\b|\buseTheme\b|from '\.\/tokens'|from '@\/src\/ui\/theme'/;
// A leaf that takes its palette as a prop is still theme-driven: the caller
// resolved it, and the caller is covered by the same rule.
const THEME_BY_PROP =
  /\b(color|colors|tintColor|backgroundColor)\s*\??\s*:\s*(string|ColorScheme)\b/;
const COLOUR_PROP =
  /\b(backgroundColor|borderColor|borderTopColor|borderRightColor|borderBottomColor|borderLeftColor|tintColor|shadowColor)\s*:/;

const FONT_SIZE = /\bfontSize\s*:\s*([^,\n}]+)/g;
// A type size derived from how wide the window is grows the whole interface on
// a tablet instead of laying more of it out, which is the phone-scaled look.
const VIEWPORT_DERIVED =
  /\b(width|height|Dimensions|useWindowDimensions|viewportWidth|contentWidth|screenWidth|scale)\b/;

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === '__tests__' ||
          entry.name === '__mocks__' ||
          entry.name === 'node_modules'
        )
          continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
      found.push(full);
    }
  };
  for (const root of SOURCE_ROOTS) walk(join(MOBILE_ROOT, root));
  return found;
}

const FILES = sourceFiles().map((path) => ({
  path: relative(MOBILE_ROOT, path),
  text: readFileSync(path, 'utf8'),
}));

describe('the mobile tree', () => {
  it('has source to measure, so an empty sweep cannot pass by accident', () => {
    expect(FILES.length).toBeGreaterThan(200);
  });
});

describe('reduced motion reaches every animated surface', () => {
  const animated = FILES.filter(
    (file) => REANIMATED_MOTION.test(file.text) || CORE_MOTION.test(file.text),
  );

  it('finds the surfaces that animate at all', () => {
    expect(animated.length).toBeGreaterThan(10);
  });

  // Reanimated reads the device setting by default; React Native's own Animated
  // has no such default and has to ask.
  it('never opts an animation out of the device setting', () => {
    expect(animated.filter((file) => OPTS_OUT.test(file.text)).map((file) => file.path)).toEqual(
      [],
    );
  });

  it('makes every surface that drives core Animated read the preference itself', () => {
    const unguarded = animated
      .filter((file) => CORE_MOTION.test(file.text) && !READS_PREFERENCE.test(file.text))
      .map((file) => file.path);

    expect(unguarded).toEqual([]);
  });
});

describe('high contrast reaches every painted surface', () => {
  const painted = FILES.filter(
    (file) => COLOUR_PROP.test(file.text) && !file.path.startsWith('src/ui/theme/'),
  );

  it('finds the surfaces that paint at all', () => {
    expect(painted.length).toBeGreaterThan(50);
  });

  // getColors swaps the whole palette, so a surface that takes its colours from
  // the theme follows the device setting and one that names its own does not.
  it('makes every painted surface take its palette from the theme', () => {
    const detached = painted
      .filter((file) => !THEME_SOURCES.test(file.text) && !THEME_BY_PROP.test(file.text))
      .map((file) => file.path);

    expect(detached).toEqual([]);
  });
});

describe('type size is independent of how wide the window is', () => {
  const sized = FILES.map((file) => ({
    path: file.path,
    values: Array.from(file.text.matchAll(FONT_SIZE), (match) => match[1].trim()),
  })).filter((file) => file.values.length > 0);

  it('finds the surfaces that set a type size at all', () => {
    expect(sized.length).toBeGreaterThan(50);
    expect(sized.reduce((total, file) => total + file.values.length, 0)).toBeGreaterThan(500);
  });

  it('derives no type size from the viewport, so a tablet lays out rather than zooms', () => {
    const scaled = sized.flatMap((file) =>
      file.values
        .filter((value) => VIEWPORT_DERIVED.test(value))
        .map((value) => `${file.path}: fontSize: ${value}`),
    );

    expect(scaled).toEqual([]);
  });
});
