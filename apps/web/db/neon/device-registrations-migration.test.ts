import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEVICE_ARCHITECTURES,
  DEVICE_OPERATING_SYSTEMS,
  DEVICE_SURFACES,
} from '@agiworkforce/cloud-contracts';

const MIGRATION = '0207_device_registrations.sql';

const migration = fs.readFileSync(path.resolve(import.meta.dirname, MIGRATION), 'utf8');
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down', MIGRATION.replace(/\.sql$/, '.down.sql')),
  'utf8',
);

describe('device registrations migration', () => {
  it('is marked as not yet applied', () => {
    expect(migration).toContain('NOT YET APPLIED');
  });

  it('accepts exactly the vocabulary the heartbeat contract sends', () => {
    for (const value of [
      ...DEVICE_SURFACES,
      ...DEVICE_OPERATING_SYSTEMS,
      ...DEVICE_ARCHITECTURES,
    ]) {
      expect(migration).toContain(`'${value}'`);
    }
  });

  it('keeps one row per install per surface per account', () => {
    expect(migration).toContain(
      'constraint device_registrations_install_unique unique (user_id, surface, install_id)',
    );
  });

  it('records workspace, capabilities, presence input and the credential it holds', () => {
    for (const column of [
      'organization_id uuid references public.organizations(id) on delete set null',
      'browser_available boolean not null default false',
      'computer_use_available boolean not null default false',
      'local_models_available boolean not null default false',
      'local_mcp_available boolean not null default false',
      'remote_enabled boolean not null default false',
      'credential_family_id text',
      'identity_session_id text',
      'last_seen_at timestamptz not null default now()',
    ]) {
      expect(migration).toContain(column);
    }
  });

  it('isolates rows per user and cascades with the profile', () => {
    expect(migration).toContain(
      'user_id text not null references public.profiles(id) on delete cascade',
    );
    expect(migration).toContain('alter table public.device_registrations force row level security');
    expect(migration).toContain('using (user_id = (select public.current_app_user_id()))');
    expect(migration).toContain('with check (user_id = (select public.current_app_user_id()))');
  });

  it('has a reversal that drops the table and forgets the migration', () => {
    expect(reversal).toContain('drop table if exists public.device_registrations');
    expect(reversal).toContain("where filename = '0207_device_registrations.sql'");
  });
});
