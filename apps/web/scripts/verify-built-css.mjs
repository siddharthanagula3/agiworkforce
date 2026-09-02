import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const WEB_ROOT = resolve(new URL('..', import.meta.url).pathname);
const GLOBALS = join(WEB_ROOT, 'app', 'globals.css');
const STATIC_ROOT = join(WEB_ROOT, '.next', 'static');
const CLASS_SELECTOR = /^\s*(?:\[[^\]]+\]\s+)?\.(agi-[a-z0-9-]+)\b/gm;

function cssFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...cssFiles(full));
    else if (entry.endsWith('.css')) out.push(full);
  }
  return out;
}

const sentinels = [
  ...new Set([...readFileSync(GLOBALS, 'utf8').matchAll(CLASS_SELECTOR)].map((m) => m[1])),
];
const built = cssFiles(STATIC_ROOT)
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
const missing = sentinels.filter((name) => !built.includes(`.${name}`));

if (missing.length > 0) {
  console.error(
    `Built CSS is missing ${missing.length} of the ${sentinels.length} class selectors declared in globals.css: ${missing.slice(0, 12).join(', ')}`,
  );
  console.error('The build served stale stylesheet output. Clear .next/cache and rebuild.');
  process.exit(1);
}
console.log(`Built CSS carries all ${sentinels.length} class selectors declared in globals.css.`);
