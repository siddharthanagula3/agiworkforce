import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { PLUGIN_CATALOG } from './plugins';

/**
 * The settings modal still builds its plugin list from the offline mirror
 * (`data/plugins.ts`) because it renders synchronously in a client component,
 * while every other surface reads the hosted registry. Two hardcoded lists
 * drift silently, so this test pins the mirror to the 0096 seed: change one
 * without the other and the suite fails.
 */
const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '../../../db/neon/0096_plugin_registry.sql'),
  'utf8',
);

const seedBlock = migration.slice(migration.indexOf('insert into public.plugin_registry_entries'));

describe('offline plugin mirror matches the hosted registry seed', () => {
  it('mirrors exactly the seeded ids', () => {
    // The id is the first value of each VALUES tuple: the line right after `(`.
    const seededIds = [...seedBlock.matchAll(/\(\n\s+'([a-z0-9][a-z0-9._-]*)',/g)].map(
      (match) => match[1],
    );
    expect(seededIds.length).toBeGreaterThan(0);
    expect([...PLUGIN_CATALOG.map((plugin) => plugin.id)].sort()).toEqual([...seededIds].sort());
  });

  it('mirrors each entry name, version, and description verbatim', () => {
    for (const plugin of PLUGIN_CATALOG) {
      expect(seedBlock).toContain(`'${plugin.id}'`);
      expect(seedBlock).toContain(`'${plugin.name}'`);
      expect(seedBlock).toContain(`'${plugin.version}'`);
      expect(seedBlock).toContain(`'${plugin.description}'`);
    }
  });

  it('mirrors each declared skill and required connector', () => {
    for (const plugin of PLUGIN_CATALOG) {
      expect(seedBlock).toContain(JSON.stringify(plugin.skills).replace(/","/g, '", "'));
      expect(seedBlock).toContain(JSON.stringify(plugin.connectors).replace(/","/g, '", "'));
    }
  });

  it('claims no download count anywhere in the mirror', () => {
    for (const plugin of PLUGIN_CATALOG) {
      expect(plugin.downloadCount).toBeUndefined();
    }
  });
});
