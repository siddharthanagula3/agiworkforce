import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const MOBILE_ROOT = join(__dirname, '..');
const SOURCE_ROOTS = ['app', 'src', 'components', 'hooks', 'lib', 'stores', 'services'];
const THEME_MODULE = /(^|\/)ui\/theme(\/tokens)?$/;
const NAMED_IMPORT = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;

const STATIC_DARK_PALETTE_IMPORTERS: Record<string, string> = {
  'app/(app)/voice.tsx':
    'always dark: its root and gradient paint voiceCompanionBg behind everything; the voice-off notice uses the theme',
  'src/features/voice/components/VoiceOnboardingSheet.tsx':
    'always dark: the sheet paints its own surfaceElevated from the same palette',
  'src/features/chat/components/MessageContentRenderer.tsx':
    'default parameter only: every caller passes the theme palette',
  'src/features/chat/components/MarkdownInline.tsx':
    'default parameter only: every caller passes the theme palette',
  'src/features/chat/components/MathBlock.tsx': 'transparent, which is the same in every palette',
};

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['__tests__', '__mocks__', 'node_modules'].includes(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) continue;
      found.push(full);
    }
  };
  for (const root of SOURCE_ROOTS) {
    const full = join(MOBILE_ROOT, root);
    if (existsSync(full)) walk(full);
  }
  return found;
}

function importsStaticPalette(source: string): boolean {
  for (const match of source.matchAll(NAMED_IMPORT)) {
    if (!THEME_MODULE.test(match[2])) continue;
    const names = match[1].split(',').map((name) => name.trim().split(/\s+as\s+/)[0]);
    if (names.includes('colors')) return true;
  }
  return false;
}

const FILES = sourceFiles().map((path) => ({
  path: relative(MOBILE_ROOT, path),
  text: readFileSync(path, 'utf8'),
}));

describe('the static dark palette', () => {
  it('has source to scan, so an empty sweep cannot pass by accident', () => {
    expect(FILES.length).toBeGreaterThan(200);
  });

  it('is imported only by surfaces that stay correct in light appearance', () => {
    const importers = FILES.filter(
      (file) => !file.path.startsWith('src/ui/theme/') && importsStaticPalette(file.text),
    ).map((file) => file.path);

    expect(importers.sort()).toEqual(Object.keys(STATIC_DARK_PALETTE_IMPORTERS).sort());
  });
});
