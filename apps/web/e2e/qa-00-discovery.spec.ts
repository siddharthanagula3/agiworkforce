import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { signIn } from './qa-capability-harness';

const OUT_DIR = process.env['QA_OUT_DIR'] ?? path.resolve(__dirname, '../../../.qa-evidence');

function record(name: string, value: unknown): void {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, name), JSON.stringify(value, null, 2));
}

test.describe('QA phase 1 — runtime capability discovery', () => {
  test('authenticates and enumerates the real skill, connector, and plugin registries', async ({
    page,
  }) => {
    await signIn(page);

    const skills = await page.request.get('/api/skills');
    const connectors = await page.request.get('/api/connectors');
    const plugins = await page.request.get('/api/plugins');

    const skillsBody = await skills.text();
    const connectorsBody = await connectors.text();
    const pluginsBody = await plugins.text();

    record('skills.json', {
      status: skills.status(),
      body: safeParse(skillsBody),
    });
    record('connectors.json', {
      status: connectors.status(),
      body: safeParse(connectorsBody),
    });
    record('plugins.json', {
      status: plugins.status(),
      body: safeParse(pluginsBody),
    });

    console.log(
      `[qa] skills=${skills.status()} connectors=${connectors.status()} plugins=${plugins.status()}`,
    );

    expect(
      skills.status(),
      'authenticated /api/skills must not be 401 — sign-in did not take effect',
    ).not.toBe(401);
    expect(connectors.status()).not.toBe(401);
  });
});

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 2000);
  }
}
