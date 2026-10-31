#!/usr/bin/env node
/* global console */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '../icons/providers');
const simpleIconsDir = resolve(__dirname, '../../../node_modules/simple-icons/icons');

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
  { id: 'zhipu', simpleId: 'zdotai', color: '#3B82F6' },
  { id: 'lmstudio', simpleId: 'lmstudio', color: '#7C3AED' },
  { id: 'custom-openai-compatible', simpleId: null, color: '#71717A' },
  { id: 'managed_cloud', simpleId: null, color: '#F59E0B', shape: 'cloud' },
  { id: 'open_router', simpleId: null, color: '#71717A', letter: 'OR' },
  { id: 'nvidia_nim', simpleId: null, color: '#71717A', letter: 'N' },
  { id: 'runway', simpleId: null, color: '#71717A', letter: 'R' },
];

const args = process.argv.slice(2);
const check = args.includes('--check');
const selected = new Set(args.filter((arg) => arg !== '--check'));
for (const id of selected) {
  if (!PROVIDER_ICONS.some((provider) => provider.id === id))
    throw new Error(`Unknown provider: ${id}`);
}
if (!check) mkdirSync(outDir, { recursive: true });

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
      const fill = /\sfill=/.test(noWH) ? '' : ` fill="${color}"`;
      return `${noWH}${fill} width="16" height="16">`;
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
  if (selected.size > 0 && !selected.has(id)) continue;
  const outPath = resolve(outDir, `${id}.svg`);
  let svg;

  if (simpleId !== null) {
    const srcPath = resolve(simpleIconsDir, `${simpleId}.svg`);
    if (existsSync(srcPath)) {
      const raw = readFileSync(srcPath, 'utf8');
      svg = wrapSimpleIconSvg(raw, color);
      copied++;
    } else {
      if (selected.size > 0) {
        console.error(`simple-icons/${simpleId}.svg not found for ${id}`);
        process.exitCode = 1;
        continue;
      }
      svg = makeGeneratedSvg({ color, letter, shape });
      generated++;
    }
  } else {
    svg = makeGeneratedSvg({ color, letter, shape });
    generated++;
  }
  if (check) {
    if (!existsSync(outPath) || readFileSync(outPath, 'utf8') !== svg) {
      console.error(`[outdated] ${id}.svg`);
      process.exitCode = 1;
    } else {
      console.log(`[checked] ${id}.svg`);
    }
  } else {
    writeFileSync(outPath, svg, 'utf8');
    console.log(`[wrote] ${id}.svg`);
  }
}

console.log(`\nDone: ${copied} official, ${generated} generated, ${check ? 'checked' : 'written'}`);
