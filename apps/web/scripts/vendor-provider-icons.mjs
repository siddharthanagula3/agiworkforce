import { createRequire } from 'module';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const si = require(path.resolve(__dirname, '../../../node_modules/simple-icons'));

const OUT_DIR = path.resolve(__dirname, '../public/providers');
mkdirSync(OUT_DIR, { recursive: true });

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
  { id: 'zhipu', siKey: null, label: 'Zhipu', color: '#3B82F6', initial: 'Z' },
  { id: 'lmstudio', siKey: null, label: 'LM Studio', color: '#7C3AED', initial: 'LM' },
  { id: 'custom-openai-compatible', siKey: null, label: 'Custom', color: '#71717A', initial: 'C' },
  { id: 'agi-cloud', siKey: null, label: 'AGI Cloud', color: '#C8892A', initial: 'A' },
];

let written = 0;
for (const provider of PROVIDERS) {
  let svg;
  if (provider.siKey) {
    const icon = si[provider.siKey];
    if (!icon) {
      console.error(`simple-icons key ${provider.siKey} not found, skipping ${provider.id}`);
      continue;
    }
    svg = buildIconSvg(icon, provider.fill ?? null);
  } else {
    svg = buildInitialSvg(provider.label, provider.color, provider.initial);
  }

  const outPath = path.join(OUT_DIR, `${provider.id}.svg`);
  writeFileSync(outPath, svg, 'utf8');
  console.log(`  wrote ${provider.id}.svg`);
  written++;
}

console.log(`\nDone, ${written} SVG files written to public/providers/`);
