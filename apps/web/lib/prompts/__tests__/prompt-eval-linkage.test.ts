import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { isPromptId } from '../prompt-manifest';

const DATASETS_DIR = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'tools',
  'evals',
  'datasets',
);

function declaredPromptIds(): Array<{ file: string; promptId: string }> {
  return readdirSync(DATASETS_DIR)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      const parsed = JSON.parse(readFileSync(path.join(DATASETS_DIR, file), 'utf8')) as {
        promptId?: unknown;
      };
      return typeof parsed.promptId === 'string' ? [{ file, promptId: parsed.promptId }] : [];
    });
}

describe('eval corpora and the prompt manifest', () => {
  it('has at least one corpus naming the prompt it measures', () => {
    expect(declaredPromptIds().length).toBeGreaterThan(0);
  });

  it('never names a prompt the manifest does not hold', () => {
    for (const { file, promptId } of declaredPromptIds()) {
      expect(isPromptId(promptId), `${file} declares ${promptId}`).toBe(true);
    }
  });
});
