/* global console */
#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../icons/providers');
const simpleIconsDir = resolve(__dirname, '../../../node_modules/simple-icons/icons');

mkdirSync(outDir, { recursive: true });

const PROVIDER_ICONS = [
  { id: 'anthropic', simpleId: 'anthropic', color: '#D4A27F' },
  { id: 'google', simpleId: 'google', color: '#4285F4' },
  { id: 'deepseek', simpleId: 'deepseek', color: '#4D6BFE' },
  { id: 'perplexity', simpleId: 'perplexity', color: '#1FB8CD' },
  { id: 'qwen', simpleId: 'qwen', color: '#615CED' },
  { id: 'moonshot', simpleId: 'moonshotai', color: '#16A34A' },
  { id: 'ollama', simpleId: 'ollama', color: '#333333' },
  { id: 'mistral', simpleId: 'mistralai', color: '#F7A41D' },
  { id: 'openai', simpleId: null, color: '#10A37F' },
  { id: 'xai', simpleId: null, color: '#1A1A1A' },
  { id: 'zhipu', simpleId: null, color: '#3B82F6' },
  { id: 'lmstudio', simpleId: null, color: '#7C3AED' },
  { id: 'custom-openai-compatible', simpleId: null, color: '#71717A' },
  { id: 'agi-cloud', simpleId: null, color: '#F59E0B' },
  { id: 'managed_cloud', simpleId: null, color: '#F59E0B', shape: 'cloud' },
  { id: 'open_router', simpleId: null, color: '#71717A', letter: 'OR' },
  { id: 'nvidia_nim', simpleId: null, color: '#71717A', letter: 'N' },
  { id: 'runway', simpleId: null, color: '#71717A', letter: 'R' },
];

function makeCircleSvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
  <circle cx="12" cy="12" r="10" fill="${color}"/>
</svg>`;
}

function makeLetterSvg(color, letter) {
  const fontSize = letter.length > 1 ? 8.5 : 11;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
  <circle cx="12" cy="12" r="10" fill="${color}"/>
  <text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="700" fill="#FFFFFF">${letter}</text>
</svg>`;
}

function makeCloudSvg(color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
  <path fill="${color}" d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
</svg>`;
}

function wrapSimpleIconSvg(raw, color) {
  return raw
    .replace(/fill="currentColor"/g, `fill="${color}"`)
    .replace(/(<svg[^>]*?)>/, (_m, tag) => {
      const noWH = tag.replace(/\s+width="[^"]*"/, '').replace(/\s+height="[^"]*"/, '');
      return `${noWH} width="16" height="16">`;
    });
}

let copied = 0;
let generated = 0;

function makeGeneratedSvg({ color, letter, shape }) {
  if (shape === 'cloud') return makeCloudSvg(color);
  if (letter) return makeLetterSvg(color, letter);
  return makeCircleSvg(color);
}

for (const { id, simpleId, color, letter, shape } of PROVIDER_ICONS) {
  const outPath = resolve(outDir, `${id}.svg`);

  if (simpleId !== null) {
    const srcPath = resolve(simpleIconsDir, `${simpleId}.svg`);
    if (existsSync(srcPath)) {
      const raw = readFileSync(srcPath, 'utf8');
      writeFileSync(outPath, wrapSimpleIconSvg(raw, color), 'utf8');
      console.log(`[copy]    ${id}.svg  (from simple-icons/${simpleId}.svg)`);
      copied++;
    } else {
      writeFileSync(outPath, makeGeneratedSvg({ color, letter, shape }), 'utf8');
      console.log(`[fallback] ${id}.svg  (simple-icons/${simpleId}.svg not found)`);
      generated++;
    }
  } else {
    writeFileSync(outPath, makeGeneratedSvg({ color, letter, shape }), 'utf8');
    console.log(
      `[generate] ${id}.svg  (${shape ?? (letter ? `letter ${letter}` : 'circle')} ${color})`,
    );
    generated++;
  }
}

console.log(`\nDone: ${copied} copied, ${generated} generated — ${PROVIDER_ICONS.length} total`);
