import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EFFORT_LABEL, type Effort } from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';

import {
  normalizeOpenAIReasoningEffort,
  resolveOpenAIReasoningEffortForModel,
  type OpenAIReasoningEffort,
} from '../openai-reasoning-effort';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

const THIN_CLIENT_SURFACES = ['apps/mobile', 'apps/extension', 'apps/extension-vscode'];

const WIRE_SHAPING_MARKERS = [
  'reasoning_effort',
  'reasoning.effort',
  'cache_control',
  'max_completion_tokens',
  'anthropic-version',
  'thinkingConfig',
  'generationConfig',
  'input_schema',
] as const;

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'android',
  'ios',
  '.expo',
  'e2e',
  'detox',
  '__tests__',
  '__mocks__',
  'test',
  'test-utils',
  'tests',
]);

function findWireShapingMarkers(source: string): string[] {
  return WIRE_SHAPING_MARKERS.filter((marker) => source.includes(marker));
}

function isScannableSource(name: string): boolean {
  return /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !name.endsWith('.d.ts');
}

function collectSourceFiles(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      collectSourceFiles(full, out);
      continue;
    }
    if (entry.isFile() && isScannableSource(entry.name)) out.push(full);
  }
  return out;
}

describe('provider wire-shaping marker detector', () => {
  it('flags a hand-rolled OpenAI/Anthropic request body', () => {
    const offending = `
      const body = {
        model,
        reasoning_effort: 'high',
        max_completion_tokens: 4096,
        system: [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }],
      };
    `;
    expect(findWireShapingMarkers(offending)).toEqual([
      'reasoning_effort',
      'cache_control',
      'max_completion_tokens',
    ]);
  });

  it('accepts the canonical gateway request the thin clients actually send', () => {
    const canonical = `
      const payload = { model, messages, stream: true, effort, thinking_mode: true };
    `;
    expect(findWireShapingMarkers(canonical)).toEqual([]);
  });
});

describe('thin-client surfaces do not shape provider payloads', () => {
  for (const surface of THIN_CLIENT_SURFACES) {
    it(`${surface} contains no provider wire-shaping logic`, () => {
      const root = join(REPO_ROOT, surface);
      expect(existsSync(root)).toBe(true);

      const offenders = collectSourceFiles(root, [])
        .map((file) => ({ file, markers: findWireShapingMarkers(readFileSync(file, 'utf8')) }))
        .filter(({ markers }) => markers.length > 0)
        .map(({ file, markers }) => `${relative(REPO_ROOT, file)}: ${markers.join(', ')}`);

      expect(offenders).toEqual([]);
    });
  }
});

describe('canonical effort vocabulary reaches the OpenAI shaping layer', () => {
  const OPENAI_REASONING_EFFORTS = [
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ] as const satisfies readonly OpenAIReasoningEffort[];

  it('covers every Effort the thin clients are allowed to send', () => {
    const canonical = Object.keys(EFFORT_LABEL) as Effort[];
    expect([...canonical].sort()).toEqual([...OPENAI_REASONING_EFFORTS].sort());
  });

  it('normalizes every canonical Effort without dropping to an unsupported level', () => {
    const model = {
      provider: 'openai-compatible',
      compat: { supportedReasoningEfforts: ['low', 'high'] },
    };
    for (const effort of Object.keys(EFFORT_LABEL) as Effort[]) {
      const resolved = resolveOpenAIReasoningEffortForModel({ model, effort });
      expect(resolved === undefined || ['low', 'high'].includes(resolved)).toBe(true);
      expect(normalizeOpenAIReasoningEffort(effort)).toBe(effort);
    }
  });
});
