import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(here, '..', rel), 'utf8');

describe('recording value-capture is wired end to end', () => {
  const sidePanel = read('src/side_panel.ts');
  const background = read('src/background.ts');
  const content = read('src/content.ts');

  it('side panel renders a capture-values toggle that sends SET_RECORDING_VALUE_CAPTURE', () => {
    expect(sidePanel).toMatch(/sp-wf-capture-values/);
    expect(sidePanel).toMatch(/type:\s*'SET_RECORDING_VALUE_CAPTURE',\s*enabled/);
  });

  it('does not start recording until the active tab acknowledges the capture policy', () => {
    const start = sidePanel.indexOf('// Sync the value-capture choice to the active tab');
    const end = sidePanel.indexOf("{ type: 'START_RECORDING' }", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const admission = sidePanel.slice(start, end);

    expect(sidePanel).toContain('function syncCaptureValues(): Promise<boolean>');
    expect(admission).toContain('await syncCaptureValues()');
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
