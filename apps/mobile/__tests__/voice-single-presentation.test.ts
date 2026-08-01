/**
 * PAR-M01 — "voice mode is not at all like how i wanted".
 *
 * The root cause was structural, not cosmetic: three voice surfaces coexisted
 * and the SAME button reached two of them depending on whether the first-run
 * disclosure had been seen. A first-time user got the inline bar; every later
 * tap on that button got a full-screen purple takeover. Nobody noticed because
 * every existing test mounted one surface in isolation, and "which surface does
 * this entry point open" is a fact about the set of call sites that no single
 * render test can see.
 *
 * So this is a source-shape check, deliberately. It fails the moment a fourth
 * voice surface appears or an entry point starts routing somewhere else.
 */

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

/** Screens that own a voice entry point, i.e. wire the composer's mic button. */
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

      // Every path out of the entry point — the direct one and the first-run
      // intro → picker → start one — must set the SAME visibility flag. Two
      // flags is exactly how the same button came to open two different modes.
      const openers = [...src.matchAll(/set([A-Za-z]*Voice[A-Za-z]*)\(true\)/g)]
        .map((m) => m[1])
        .filter((name) => name !== 'VoiceIntroVisible' && name !== 'VoicePickerVisible');
      expect(new Set(openers)).toEqual(new Set(['VoiceInlineVisible']));

      // And exactly one presentation component is mounted for it.
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
  // Three orbs meant three animation treatments, and the jitter fix landed in
  // only one of them (PAR-M03). Anything that draws an orb imports the shared
  // one rather than growing a fourth copy of the maths.
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
    // An orb component that owns shared values is a second copy of the maths —
    // which is how the jitter fix came to exist in one file and not the other.
    // Wrapping the shared orb in press handling (voice.tsx's CompanionOrb) is
    // fine; that declares no animation of its own.
    const rogue = FILES.filter((f) => {
      if (f.endsWith('VoiceOrb.tsx')) return false;
      const src = read(f);
      return /function \w*Orb\b/.test(src) && /useSharedValue\s*\(/.test(src);
    });
    expect(rogue.map(relative)).toEqual([]);
  });
});

describe('voice mode wires the composer affordances it renders', () => {
  // PAR-M02: both shipped call sites passed only visible/phase/onToggleMic/
  // onExit, so the "+" never rendered and the input-shaped pill did nothing.
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
