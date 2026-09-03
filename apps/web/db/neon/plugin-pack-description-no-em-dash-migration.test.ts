import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0158_plugin_pack_description_no_em_dash.sql'),
  'utf8',
);
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0158_plugin_pack_description_no_em_dash.down.sql'),
  'utf8',
);

const PACK_IDS = ['engineering-pack', 'writing-pack', 'data-pack'];
const UNTOUCHED_IDS = ['github-automation', 'calendar-assistant', 'crm-sync', 'research-pack'];

describe('0158 plugin pack description em dash removal', () => {
  it('touches only the three real installable packs, none of the stub packs', () => {
    for (const id of PACK_IDS) {
      expect(migration).toContain(`where id = '${id}'`);
    }
    for (const id of UNTOUCHED_IDS) {
      expect(migration).not.toContain(`where id = '${id}'`);
    }
  });

  it('carries no em dash in the forward migration', () => {
    expect(migration).not.toMatch(/—|&mdash;|&#8212;|&#x2014;/);
  });

  it('reverses to the original em-dash description so a rollback is exact', () => {
    expect(reversal).toContain('— a bundle of engineering skills');
    expect(reversal).toContain('— a bundle of writing and research skills');
    expect(reversal).toContain('— a bundle of data and reporting skills');
  });
});
