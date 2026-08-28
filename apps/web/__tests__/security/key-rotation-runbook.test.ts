import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const RUNBOOK_PATH = path.join(REPO_ROOT, 'docs', 'security', 'key-rotation.md');
const RUNBOOK = readFileSync(RUNBOOK_PATH, 'utf8');

const CADENCE_HEADING = '## Rotation cadence';
const RISK_HEADING = '## Accepted risk: no KMS, no escrow';

const KEY_ENVS = [
  'CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY',
  'GITHUB_TOKEN_ENCRYPTION_KEY',
  'TOTP_ENCRYPTION_KEY',
  'DEVICE_TOKEN_ENCRYPTION_KEY',
];

function section(heading: string): string {
  const start = RUNBOOK.indexOf(heading);
  expect(start, `${RUNBOOK_PATH} must contain the section "${heading}"`).toBeGreaterThan(-1);
  const after = RUNBOOK.slice(start + heading.length);
  const next = after.search(/^## /m);
  return next === -1 ? after : after.slice(0, next);
}

describe('key rotation runbook is one procedure, not three loose pieces', () => {
  it('declares a named cadence and an owner in the header block', () => {
    expect(RUNBOOK).toMatch(/^Rotation cadence: .+$/m);
    expect(RUNBOOK).toMatch(/^Owner: .+$/m);
  });

  it('gives every durable key an interval and a next-due date', () => {
    const cadence = section(CADENCE_HEADING);
    for (const env of KEY_ENVS) {
      expect(cadence, `${env} needs a row in the cadence table`).toContain(env);
    }
    expect(cadence).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('names the sweep and the runbook step each cadence entry executes', () => {
    const cadence = section(CADENCE_HEADING);
    expect(cadence).toContain('scripts/reencrypt.mjs');
    expect(cadence).toContain('## Rotating a key');
  });

  it('records the accepted risk here rather than deferring it to a plan file', () => {
    const risk = section(RISK_HEADING);
    expect(risk).toMatch(/Accepted by:/);
    expect(risk).toMatch(/Reviewed:/);
    expect(risk).toMatch(/escrow/i);
  });

  it('carries no deferral pointing at a planning document', () => {
    expect(RUNBOOK).not.toContain('ExecutionPlan.md');
    expect(RUNBOOK).not.toContain('docs/work/founder-assistance.md');
  });
});
