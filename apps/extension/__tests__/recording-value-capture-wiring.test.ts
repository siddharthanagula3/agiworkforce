import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(here, '..', rel), 'utf8');

describe('recording value-capture is wired end to end', () => {
  const shortcuts = read('src/features/options/shortcuts-section.ts');
  const background = read('src/background.ts');
  const content = read('src/content.ts');

  it('options shortcuts render a capture-values toggle that sends SET_RECORDING_VALUE_CAPTURE', () => {
    expect(shortcuts).toMatch(/opt-record-capture/);
    expect(shortcuts).toMatch(/type:\s*'SET_RECORDING_VALUE_CAPTURE',\s*enabled/);
  });

  it('does not start recording until the active tab acknowledges the capture policy', () => {
    const start = shortcuts.indexOf('if (!(await setCapture(tab.id)))');
    const end = shortcuts.indexOf("type: 'START_RECORDING'", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const admission = shortcuts.slice(start, end);
    expect(admission).toContain('return;');
  });

  it('background forwards SET_RECORDING_VALUE_CAPTURE to the content script', () => {
    expect(background).toMatch(/SET_RECORDING_VALUE_CAPTURE/);
    expect(background).toMatch(/forwardToContentScript/);
  });

  it('content script honors captureValues when recording typed input (redacted)', () => {
    expect(content).toMatch(/automationState\.captureValues\s*=\s*enabled/);
    expect(content).toMatch(/if\s*\(automationState\.captureValues\)/);
    expect(content).toMatch(/sanitizeRecordedValue/);
  });
});
