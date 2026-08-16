
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

describe('inline voice replaces the composer everywhere it mounts', () => {
  const files = SEARCH_ROOTS.flatMap((r) => walk(join(MOBILE_ROOT, r)));

  const mountSites = files.filter((f) => {
    const src = readFileSync(f, 'utf8');
    return src.includes('<VoiceInlineBar') && !f.endsWith('VoiceInlineBar.tsx');
  });

  it('is mounted by at least one screen (otherwise it is dead code again)', () => {
    expect(mountSites.length).toBeGreaterThan(0);
  });

  it.each(mountSites.map((f) => [f.replace(MOBILE_ROOT + '/', ''), f]))(
    '%s hides its text composer while the voice bar is up',
    (_label: string, file: string) => {
      const src = readFileSync(file, 'utf8');

      const composerTag = /<(ChatInput|Composer)\b/.exec(src)?.[1];
      if (!composerTag) return;

      const guardAt = src.indexOf('voiceInlineVisible ? null : (');
      const composerAt = src.indexOf(`<${composerTag}`);

      expect(guardAt).toBeGreaterThan(-1);

      expect(composerAt - guardAt).toBeGreaterThan(0);
      expect(composerAt - guardAt).toBeLessThan(120);
    },
  );
});
