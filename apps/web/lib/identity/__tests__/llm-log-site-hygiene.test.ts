import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { codeOfCall, logCallSites, rawContentReferences } from '../log-hygiene';

const LLM_ROOT = path.resolve(__dirname, '../../../app/api/llm');

function productFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return /^(__tests__|__mocks__|__fixtures__)$/.test(entry.name) ? [] : productFiles(full);
    }
    if (!/\.tsx?$/.test(entry.name)) return [];
    return /\.(test|spec)\.tsx?$/.test(entry.name) ? [] : [full];
  });
}

describe('the scanner', () => {
  it('finds a log call and its whole argument list', () => {
    const sites = logCallSites(
      [
        'const x = 1;',
        'logger.warn(',
        '  { requestId, attempt: nested(1) },',
        "  'msg',",
        ');',
      ].join('\n'),
    );
    expect(sites).toHaveLength(1);
    expect(sites[0]?.line).toBe(2);
    expect(sites[0]?.text).toContain('nested(1)');
    expect(sites[0]?.text.endsWith(')')).toBe(true);
  });

  it('reads the message as prose and the interpolation as code', () => {
    expect(codeOfCall("logger.info({ id }, 'sending messages to the prompt')")).not.toMatch(
      /messages/,
    );
    expect(codeOfCall('logger.info(`turn ${messages.length}`)')).toMatch(/messages/);
  });

  it('flags a raw value and leaves a derived one alone', () => {
    expect(rawContentReferences("logger.info({ messages }, 'sent')")).toEqual(['messages']);
    expect(rawContentReferences('logger.info({ text: content })')).toEqual(['content']);
    expect(rawContentReferences('logger.info(`${systemPrompt}`)')).toEqual(['systemPrompt']);
    expect(rawContentReferences('logger.error({ error, credentials })')).toEqual(['credentials']);
    expect(
      rawContentReferences('logger.info({ contentLength, promptTokens, messageCount })'),
    ).toEqual([]);
    expect(rawContentReferences("logger.info({ requestId }, 'prompt cache miss')")).toEqual([]);
  });
});

describe('every LLM log call site', () => {
  const files = productFiles(LLM_ROOT);

  it('has log call sites to check', () => {
    expect(files.length).toBeGreaterThan(20);
    const total = files.reduce(
      (count, file) => count + logCallSites(readFileSync(file, 'utf8')).length,
      0,
    );
    expect(total).toBeGreaterThan(100);
  });

  it('names no raw prompt, tool output or credential', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const site of logCallSites(source)) {
        const hits = rawContentReferences(site.text);
        if (hits.length === 0) continue;
        offenders.push(`${path.relative(LLM_ROOT, file)}:${site.line} logs ${hits.join(', ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
