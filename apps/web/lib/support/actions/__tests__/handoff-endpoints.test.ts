
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { SUPPORT_ACTIONS } from '../registry';
import { SUPPORT_ACTION_IDS } from '../types';

const APP_DIR = path.resolve(import.meta.dirname, '../../../../app');

describe('support actions — hand-off endpoint descriptors', () => {
  it('gives every handoff action a descriptor and no server action one', () => {
    for (const id of SUPPORT_ACTION_IDS) {
      const definition = SUPPORT_ACTIONS[id];
      if (definition.execution === 'handoff') {
        expect(definition.endpoint, `${id} must declare an endpoint`).toBeDefined();
      } else {
        expect(definition.endpoint, `${id} must not declare an endpoint`).toBeUndefined();
      }
    }
  });

  it.each([
    ['export_account_data', 'api/user/export/route.ts'] as const,
    ['open_billing_portal', 'api/portal/route.ts'] as const,
  ])('%s points at a route that exports the advertised verb', (actionId, routeFile) => {
    const definition = SUPPORT_ACTIONS[actionId];
    const endpoint = definition.endpoint!;
    const source = fs.readFileSync(path.join(APP_DIR, routeFile), 'utf8');

    expect(source).toMatch(
      new RegExp(`export\\s+(const|async function)\\s+${endpoint.method}\\b`, 'u'),
    );
    const routePath = `/${routeFile.replace(/\/route\.ts$/u, '')}`;
    expect(endpoint.path.split('?')[0]).toBe(routePath);
  });

  it('advertises only same-origin absolute paths — never a URL a client could redirect', () => {
    for (const id of SUPPORT_ACTION_IDS) {
      const endpoint = SUPPORT_ACTIONS[id].endpoint;
      if (!endpoint) continue;
      expect(endpoint.path.startsWith('/')).toBe(true);
      expect(endpoint.path.startsWith('//')).toBe(false);
      expect(endpoint.path).not.toMatch(/^[a-z]+:/iu);
    }
  });
});
