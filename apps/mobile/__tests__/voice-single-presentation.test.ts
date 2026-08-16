
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MOBILE_ROOT = join(__dirname, '..');
const SEARCH_ROOTS = ['app', 'src'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const FILES = SEARCH_ROOTS.flatMap((root) => walk(join(MOBILE_ROOT, root)));

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

function relative(file: string): string {
  return file.replace(MOBILE_ROOT + '/', '');
}

const ENTRY_POINT_SCREENS = FILES.filter((f) => read(f).includes('const handleOpenVoiceMode'));

describe('voice has exactly one presentation', () => {
  it('has entry points to check (the grep did not silently go stale)', () => {
    expect(ENTRY_POINT_SCREENS.length).toBeGreaterThan(0);
  });

  it('no longer ships the full-screen conversation overlay', () => {
    expect(
      existsSync(join(MOBILE_ROOT, 'src/features/voice/components/VoiceConversationScreen.tsx')),
    ).toBe(false);

    const mounts = FILES.filter((f) => read(f).includes('<VoiceConversationScreen'));
    expect(mounts.map(relative)).toEqual([]);
  });

  it.each(ENTRY_POINT_SCREENS.map((f) => [relative(f), f]))(
    '%s opens the inline bar and nothing else',
    (_label: string, file: string) => {
      const src = read(file);

      const openers = [...src.matchAll(/set([A-Za-z]*Voice[A-Za-z]*)\(true\)/g)]
        .map((m) => m[1])
        .filter((name) => name !== 'VoiceIntroVisible' && name !== 'VoicePickerVisible');
      expect(new Set(openers)).toEqual(new Set(['VoiceInlineVisible']));

      expect(src.match(/<VoiceInlineBar\b/g)).toHaveLength(1);
    },
  );

  it('mounts the inline bar from every screen that can start voice', () => {
    for (const file of ENTRY_POINT_SCREENS) {
      expect(read(file)).toContain('<VoiceInlineBar');
    }
  });
});

describe('the orb is one component', () => {
  const ORB_HOSTS = [
    'src/features/voice/components/VoiceInlineBar.tsx',
    'app/(app)/voice.tsx',
  ] as const;

  it.each(ORB_HOSTS)('%s renders the shared VoiceOrb', (relPath) => {
    const src = read(join(MOBILE_ROOT, relPath));
    expect(src).toContain('VoiceOrb');
    expect(src).toMatch(/<VoiceOrb\b/);
  });

  it('leaves no other file declaring an orb with its own animation', () => {
    const rogue = FILES.filter((f) => {
      if (f.endsWith('VoiceOrb.tsx')) return false;
      const src = read(f);
      return /function \w*Orb\b/.test(src) && /useSharedValue\s*\(/.test(src);
    });
    expect(rogue.map(relative)).toEqual([]);
  });
});

describe('voice mode wires the composer affordances it renders', () => {
  it.each(ENTRY_POINT_SCREENS.map((f) => [relative(f), f]))(
    '%s passes attach, keyboard, mute and level to the bar',
    (_label: string, file: string) => {
      const src = read(file);
      const mount = /<VoiceInlineBar[\s\S]*?\/>/.exec(src)?.[0];
      expect(mount).toBeDefined();

      for (const prop of ['onAttach=', 'onOpenKeyboard=', 'muted=', 'audioLevel=']) {
        expect(mount).toContain(prop);
      }
    },
  );
});
