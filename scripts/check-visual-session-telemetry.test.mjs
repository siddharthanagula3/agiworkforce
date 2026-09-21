import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTRACT_PATH,
  REPO_ROOT,
  checkVisualSessionTelemetry,
  readFrameFields,
} from './check-visual-session-telemetry.mjs';

const roots = [];

function write(root, relativePath, contents) {
  const absolute = path.join(root, relativePath);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

const CONTRACT = `
export interface VisualFrameRegion {
  x: number;
  y: number;
}

export interface VisualFrame {
  frameId: string;
  capturedAtMs: number;
  hash: VisualFrameHash;
  dataUrl: string;
  region?: VisualFrameRegion;
}

export interface VisualFrameTelemetry {
  frameId: string;
  capturedAtMs: number;
  hash: string;
  cropped: boolean;
}

export function toVisualFrameTelemetry(frame: VisualFrame): VisualFrameTelemetry {
  return {
    frameId: frame.frameId,
    capturedAtMs: frame.capturedAtMs,
    hash: visualFrameHashHex(frame.hash),
    cropped: frame.region !== undefined,
  };
}
`;

const CLEAN_CONSUMER = `
import { toVisualFrameTelemetry, type VisualFrame } from '@agiworkforce/types';

export function report(frame: VisualFrame): void {
  logger.info(toVisualFrameTelemetry(frame), 'sampled');
}
`;

function makeRoot({ contract = CONTRACT, consumer = CLEAN_CONSUMER } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'visual-telemetry-'));
  roots.push(root);
  write(root, CONTRACT_PATH, contract);
  write(root, 'apps/web/lib/visual/report-frame.ts', consumer);
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('a contract whose telemetry describes the frame passes', () => {
  assert.deepEqual(checkVisualSessionTelemetry(makeRoot()), []);
});

test('telemetry that carries the encoded frame is reported', () => {
  const failures = checkVisualSessionTelemetry(
    makeRoot({
      contract: CONTRACT.replace(
        '  cropped: boolean;\n}',
        '  cropped: boolean;\n  dataUrl: string;\n}',
      ),
    }),
  );
  assert.ok(
    failures.some((failure) => failure === "VisualFrameTelemetry carries the frame's dataUrl"),
    failures.join('; '),
  );
});

test('a consumer that logs the encoded frame is reported', () => {
  const failures = checkVisualSessionTelemetry(
    makeRoot({
      consumer: `
import { type VisualFrame } from '@agiworkforce/types';

export function report(frame: VisualFrame): void {
  logger.info({ frame: frame.dataUrl }, 'sampled');
}
`,
    }),
  );
  assert.ok(
    failures.some((failure) => failure.includes('sends frame pixels to a log')),
    failures.join('; '),
  );
});

test('a consumer that parks the encoded frame in browser storage is reported', () => {
  const failures = checkVisualSessionTelemetry(
    makeRoot({
      consumer: `
import { type VisualFrame } from '@agiworkforce/types';

export function keep(frame: VisualFrame): void {
  localStorage.setItem('last-frame', frame.dataUrl);
}
`,
    }),
  );
  assert.ok(
    failures.some((failure) => failure.includes('sends frame pixels to browser storage')),
    failures.join('; '),
  );
});

test('the checked-in contract and its consumers keep the pixels in memory', () => {
  assert.deepEqual(checkVisualSessionTelemetry(REPO_ROOT), []);
  const fields = readFrameFields(REPO_ROOT);
  assert.ok(fields.pixel.length > 0);
  for (const field of fields.pixel) assert.ok(!fields.telemetry.includes(field));
});
