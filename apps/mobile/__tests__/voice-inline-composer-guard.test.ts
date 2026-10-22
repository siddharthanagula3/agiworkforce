import { readFileSync, readdirSync, statSync } from 'node:fs';
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

describe('voice replaces the composer everywhere a voice bar mounts', () => {
  const files = SEARCH_ROOTS.flatMap((r) => walk(join(MOBILE_ROOT, r)));

  const mountSites = files.filter((f) => {
    const src = readFileSync(f, 'utf8');
    return src.includes('<VoiceInlineBar') && !f.endsWith('VoiceInlineBar.tsx');
  });

  it('is mounted by at least one screen (otherwise it is dead code again)', () => {
    expect(mountSites.length).toBeGreaterThan(0);
  });

  it.each(mountSites.map((f) => [f.replace(MOBILE_ROOT + '/', ''), f]))(
    '%s hides its text composer while a voice bar is up',
    (_label: string, file: string) => {
      const src = readFileSync(file, 'utf8');

      const composer = /<(ChatInput|Composer)\b/.exec(src);
      if (!composer) return;
      const composerAt = composer.index;

      const guards = Array.from(
        src
          .slice(0, composerAt)
          .matchAll(
            /(liveVoiceVisible \|\| )?voiceInlineVisible( \|\| liveVoiceVisible)? \? null : \(/g,
          ),
      );
      const guard = guards[guards.length - 1];
      expect(guard).toBeDefined();
      // A screen that can open the live bar must hide the composer for it too,
      // otherwise two input rows stack while the session runs.
      if (src.includes('<LiveVoiceComposer')) {
        expect(guard?.[0]).toContain('liveVoiceVisible');
      }

      const guardAt = guard!.index!;

      expect(composerAt - guardAt).toBeGreaterThan(0);
      expect(composerAt - guardAt).toBeLessThan(120);
    },
  );
});
