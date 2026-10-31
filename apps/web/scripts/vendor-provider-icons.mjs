import { createRequire } from 'module';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const si = require(path.resolve(__dirname, '../../../node_modules/simple-icons'));

const OUT_DIR = path.resolve(__dirname, '../public/providers');

function buildIconSvg(siIcon, fillColor) {
  const fill = fillColor ?? `#${siIcon.hex}`;
  return `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="${fill}"><title>${siIcon.title}</title><path d="${siIcon.path}"/></svg>`;
}

function buildDotSvg(label, hexColor) {
  return `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>${label}</title><circle cx="12" cy="12" r="10" fill="${hexColor}"/></svg>`;
}

function buildInitialSvg(label, hexColor, initial) {
  return `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none"><title>${label}</title><rect width="24" height="24" rx="6" fill="${hexColor}"/><text x="12" y="16.5" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="#ffffff">${initial}</text></svg>`;
}

const PROVIDERS = [
  { id: 'anthropic', siKey: 'siAnthropic', fill: '#D4A27F' },
  { id: 'openai', siKey: null, label: 'OpenAI', color: '#10A37F', initial: 'AI' },
  { id: 'google', siKey: 'siGoogle', fill: '#4285F4' },
  { id: 'deepseek', siKey: 'siDeepseek', fill: '#4D6BFE' },
  { id: 'perplexity', siKey: 'siPerplexity', fill: '#1FB8CD' },
  { id: 'qwen', siKey: 'siQwen', fill: '#615CED' },
  { id: 'moonshot', siKey: 'siMoonshotai', fill: '#16A34A' },
  { id: 'ollama', siKey: 'siOllama', fill: '#FFFFFF' },
  { id: 'xai', siKey: null, label: 'xAI', color: '#000000', initial: 'X' },
  { id: 'zhipu', siKey: 'siZdotai', fill: '#3B82F6' },
  { id: 'lmstudio', siKey: 'siLmstudio', fill: '#7C3AED' },
  { id: 'custom-openai-compatible', siKey: null, label: 'Custom', color: '#71717A', initial: 'C' },
  { id: 'agi-cloud', siKey: null, label: 'AGI Cloud', color: '#C8892A', initial: 'A' },
];

const args = process.argv.slice(2);
const check = args.includes('--check');
const selected = new Set(args.filter((arg) => arg !== '--check'));
for (const id of selected) {
  if (!PROVIDERS.some((provider) => provider.id === id)) throw new Error(`Unknown provider: ${id}`);
}
if (!check) mkdirSync(OUT_DIR, { recursive: true });

let written = 0;
for (const provider of PROVIDERS) {
  if (selected.size > 0 && !selected.has(provider.id)) continue;
  let svg;
  if (provider.siKey) {
    const icon = si[provider.siKey];
    if (!icon) {
      console.error(`simple-icons key ${provider.siKey} not found, skipping ${provider.id}`);
      if (check || selected.size > 0) process.exitCode = 1;
      continue;
    }
    svg = buildIconSvg(icon, provider.fill ?? null);
  } else {
    svg = buildInitialSvg(provider.label, provider.color, provider.initial);
  }

  const outPath = path.join(OUT_DIR, `${provider.id}.svg`);
  if (check) {
    if (!existsSync(outPath) || readFileSync(outPath, 'utf8') !== svg) {
      console.error(`  outdated ${provider.id}.svg`);
      process.exitCode = 1;
    } else {
      console.log(`  checked ${provider.id}.svg`);
    }
  } else {
    writeFileSync(outPath, svg, 'utf8');
    console.log(`  wrote ${provider.id}.svg`);
  }
  written++;
}

console.log(`\nDone, ${written} SVG files ${check ? 'checked' : 'written'} in public/providers/`);
