import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const historicalMigration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0081_media_assets_conversation_provenance.sql'),
  'utf8',
);
const forwardMigration = fs.readFileSync(
  path.resolve(import.meta.dirname, '0107_media_assets_web_conversation_owner.sql'),
  'utf8',
);
const downMigration = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down/0107_media_assets_web_conversation_owner.down.sql'),
  'utf8',
);
const normalizedForwardMigration = forwardMigration.replace(/\s+/g, ' ');

describe('media asset conversation provenance migration', () => {
  it('keeps the historical migration immutable and repairs ownership forward', () => {
    expect(historicalMigration).toContain('references public.conversations(id)');
    expect(normalizedForwardMigration).toContain(
      'references public.web_conversations(id) on delete set null;',
    );
    expect(forwardMigration).toContain('media_assets_conversation_id_web_conversations_fkey');
    expect(forwardMigration).toContain("to_regclass('public.web_conversations')");
    expect(forwardMigration).toContain("target_column.attname = 'id'");
    expect(forwardMigration).toContain('constraint_row.convalidated');
  });

  it('preserves one already-canonical single-column owner without touching composites', () => {
    expect(forwardMigration).toContain('canonical_constraint_name');
    expect(forwardMigration).toContain(
      'constraint_row.conname IS DISTINCT FROM canonical_constraint_name',
    );
    expect(forwardMigration).toContain('array_length(constraint_row.conkey, 1) = 1');
    expect(forwardMigration).not.toContain("confrelid = 'public.conversations'::regclass");
  });

  it('keeps generated assets after their source conversation is deleted', () => {
    expect(historicalMigration).toContain('add column if not exists conversation_id uuid');
    expect(historicalMigration).toContain('idx_media_assets_conversation');
    expect(historicalMigration).toContain(
      'where conversation_id is not null and deleted_at is null',
    );
    expect(forwardMigration).toContain('on delete set null');
  });

  it('refuses an unsafe rollback after Web provenance has been written', () => {
    expect(downMigration).toContain(
      'Cannot restore media_assets conversation ownership: Web conversation provenance exists',
    );
    expect(downMigration).toContain('references public.conversations(id)');
    expect(downMigration).toContain("filename = '0107_media_assets_web_conversation_owner.sql'");
  });
});
