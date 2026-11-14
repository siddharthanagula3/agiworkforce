#!/usr/bin/env node
/* global console */

import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const simpleIcons = require(resolve(__dirname, '../../../node_modules/simple-icons'));

const OUT_FILE = resolve(__dirname, '../assets/provider-marks.json');
const WEB_MARK_SOURCE = resolve(__dirname, '../../../packages/ui/ui/src/ProviderMark.tsx');

const SIMPLE_ICON_BY_PROVIDER = {
  anthropic: 'siClaude',
  deepseek: 'siDeepseek',
  google: 'siGooglegemini',
  minimax: 'siMinimax',
  moonshot: 'siMoonshotai',
  perplexity: 'siPerplexity',
  qwen: 'siQwen',
  zhipu: 'siZdotai',
};

function openAiPath() {
  const source = readFileSync(WEB_MARK_SOURCE, 'utf8');
  const match = /const OPENAI_PATH =\s*'([^']+)'/u.exec(source);
  if (!match) throw new Error(`OPENAI_PATH not found in ${WEB_MARK_SOURCE}`);
  return match[1];
}

function buildMarks() {
  const paths = { openai: openAiPath() };
  for (const [provider, key] of Object.entries(SIMPLE_ICON_BY_PROVIDER)) {
    const icon = simpleIcons[key];
    if (!icon) throw new Error(`simple-icons key ${key} not found for ${provider}`);
    paths[provider] = icon.path;
  }
  const sorted = Object.fromEntries(
    Object.entries(paths).sort(([left], [right]) => left.localeCompare(right)),
  );
  return `${JSON.stringify({ viewBox: '0 0 24 24', paths: sorted }, null, 2)}\n`;
}

const check = process.argv.includes('--check');
const marks = buildMarks();

if (check) {
  if (!existsSync(OUT_FILE) || readFileSync(OUT_FILE, 'utf8') !== marks) {
    console.error('assets/provider-marks.json is outdated; run scripts/vendor-provider-marks.mjs');
    process.exitCode = 1;
  } else {
    console.log('assets/provider-marks.json is current');
  }
} else {
  writeFileSync(OUT_FILE, marks, 'utf8');
  console.log('wrote assets/provider-marks.json');
}
