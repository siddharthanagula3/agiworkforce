import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relative: string) =>
  fs.readFileSync(path.resolve(import.meta.dirname, relative), 'utf8');

const migration = read('0356_custom_connector_plugin_disabled.sql');
const down = read('down/0356_custom_connector_plugin_disabled.down.sql');

describe('custom connector plugin disabled migration', () => {
  it('adds one nullable timestamp and nothing destructive', () => {
    expect(migration).toContain('add column if not exists disabled_by_plugin_at timestamptz;');
    expect(migration).not.toMatch(/drop |delete from|not null/i);
  });

  it('is reversed by dropping the column and the ledger row', () => {
    expect(down).toContain('drop column if exists disabled_by_plugin_at');
    expect(down).toContain("filename = '0356_custom_connector_plugin_disabled.sql'");
  });
});
