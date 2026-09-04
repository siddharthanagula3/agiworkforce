import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * /chrome-extension used to say "Inference in Chrome: None" and "AGI in Chrome
 * never runs models", while cloudAgentClient POSTs the whole conversation.
 * base64 screenshots included, straight to the Managed Cloud gateway. The
 * sibling /agent-permissions page already described that correctly, so the two
 * public pages contradicted each other about the same boundary.
 */

const APP_ROOT = join(__dirname, '..');
const EXTENSION_CLIENT = join(
  APP_ROOT,
  '..',
  '..',
  'extension',
  'src',
  'features',
  'computer-use',
  'cloudAgentClient.ts',
);

const chromePage = readFileSync(join(APP_ROOT, 'chrome-extension', 'page.tsx'), 'utf8');
const permissionsPage = readFileSync(join(APP_ROOT, 'agent-permissions', 'page.tsx'), 'utf8');
const cloudClient = readFileSync(EXTENSION_CLIENT, 'utf8');

describe('the chrome-extension page describes the boundary the code implements', () => {
  it('still has an extension path that calls the cloud gateway directly', () => {
    // If this ever stops being true the page copy should change back, not drift.
    expect(cloudClient).toContain('/api/llm/v1/chat/completions');
    expect(cloudClient).toContain('screenshot');
  });

  it('does not claim inference never happens outside Desktop', () => {
    expect(chromePage).not.toContain('None. Execution happens on Desktop.');
    expect(chromePage).not.toMatch(/never runs models\b/);
  });

  it('names Managed Cloud as the computer-use destination, as the sibling page does', () => {
    const collapse = (source: string) => source.replace(/\s+/g, ' ');
    expect(collapse(chromePage)).toMatch(/Managed Cloud gateway directly/);
    expect(collapse(permissionsPage)).toMatch(/calls the Managed Cloud gateway directly/);
  });

  it('says screenshots leave the browser, because they do', () => {
    expect(chromePage.toLowerCase()).toContain('screenshot');
  });
});
