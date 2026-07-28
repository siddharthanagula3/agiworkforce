/**
 * VoiceInlineBar replaces the composer; it does not sit beside it.
 *
 * Its own docstring says "the only thing that changes is the composer", but the
 * guard that hides the text composer was applied to only ONE of the two screens
 * that mount the bar. The other kept rendering both, so a user saw two input
 * rows stacked and the bar's exit control was pushed off the bottom of the
 * screen. Four simulator rounds ran before that was noticed, and it was found by
 * reading code rather than by any test.
 *
 * A source-shape check rather than a render test because the defect is
 * "somebody added a third mount site and forgot the guard" — that is a fact
 * about the set of call sites, which no single component test can see. Mounting
 * one screen and asserting it looks right is exactly what let this through.
 */

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
    // The component's own definition is not a mount site.
    return src.includes('<VoiceInlineBar') && !f.endsWith('VoiceInlineBar.tsx');
  });

  it('is mounted by at least one screen (otherwise it is dead code again)', () => {
    // It WAS dead code once — exported, tested, and rendered by nothing.
    expect(mountSites.length).toBeGreaterThan(0);
  });

  it.each(mountSites.map((f) => [f.replace(MOBILE_ROOT + '/', ''), f]))(
    '%s hides its text composer while the voice bar is up',
    (_label: string, file: string) => {
      const src = readFileSync(file, 'utf8');

      // Whatever the composer is called on this screen, it must sit inside the
      // same visibility guard the bar is. Checked by position rather than one
      // regex spanning both, because the two screens indent differently and a
      // regex that quietly stops matching is worse than no guard at all.
      const composerTag = /<(ChatInput|Composer)\b/.exec(src)?.[1];
      if (!composerTag) return; // a mount site with no composer has nothing to hide

      const guardAt = src.indexOf('voiceInlineVisible ? null : (');
      const composerAt = src.indexOf(`<${composerTag}`);

      // No guard means two input rows stack and the bar's exit control gets
      // pushed off the bottom of the screen.
      expect(guardAt).toBeGreaterThan(-1);

      // The composer must be the thing the guard wraps, not something further
      // down the file that merely happens to follow it.
      expect(composerAt - guardAt).toBeGreaterThan(0);
      expect(composerAt - guardAt).toBeLessThan(120);
    },
  );
});
