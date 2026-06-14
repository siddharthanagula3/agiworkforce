import { MIGRATION_SQL } from '@/storage/migrations';

describe('mobile storage migrations', () => {
  it('keeps local memory deletions and vector cleanup safe', () => {
    const migration = MIGRATION_SQL.find((entry) => entry.version === 3);

    expect(migration?.sql).toContain('ON DELETE SET NULL');
    expect(migration?.sql).toContain('CREATE TABLE IF NOT EXISTS memory_vectors');
    expect(migration?.sql).toContain('REFERENCES memory_facts(id) ON DELETE CASCADE');
  });

  it('runs migrations in increasing version order', () => {
    const versions = MIGRATION_SQL.map((entry) => entry.version);
    expect(versions).toEqual([...versions].sort((left, right) => left - right));
  });
});
