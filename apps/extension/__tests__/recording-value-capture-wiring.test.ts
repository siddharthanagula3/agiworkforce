/**
 * recording-value-capture-wiring.test.ts
 *
 * Regression for EXT-RECORDING-VALUE-CAPTURE-DEAD: the content script fully
 * supported recording typed values (SET_RECORDING_VALUE_CAPTURE flips
 * automationState.captureValues; sanitizeRecordedValue redacts password/cc/OTP
 * fields — C-05), but the side panel never sent the message, so captureValues
 * was permanently false and replayed shortcuts typed '' into every input.
 *
 * The wiring crosses side-panel -> background -> content-script contexts (the
 * side_panel.ts entry module is not unit-importable), so — matching the
 * established source-level invariant pattern (computer-use-usage-meter,
 * computer-use-default-ask) — assert the toggle + message exist end to end.
 */
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
