export interface Migration {
  version: number;
  sql: string;
}

export const MIGRATION_SQL: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT 'New chat',
        default_mode TEXT NOT NULL CHECK (default_mode IN ('chat','agent','voice')),
        default_provider TEXT,
        default_model TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        archived_at INTEGER,
        pinned INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user','assistant','tool','system')),
        content TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('chat','agent','voice')),
        provider TEXT,
        model TEXT,
        runtime TEXT,
        tokens_in INTEGER,
        tokens_out INTEGER,
        duration_ms INTEGER,
        attachments TEXT,
        created_at INTEGER NOT NULL,
        parent_message_id TEXT REFERENCES messages(id)
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

      CREATE TABLE IF NOT EXISTS memory_facts (
        id TEXT PRIMARY KEY,
        fact TEXT NOT NULL,
        source_conversation_id TEXT REFERENCES conversations(id),
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS installed_models (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        runtime TEXT NOT NULL,
        format TEXT NOT NULL,
        size_bytes INTEGER,
        sha256 TEXT,
        local_path TEXT,
        installed_at INTEGER NOT NULL,
        last_used_at INTEGER,
        capabilities TEXT
      );

      CREATE TABLE IF NOT EXISTS custom_instructions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS telemetry_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        sent_at INTEGER
      );
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS doc_chunks (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        text TEXT NOT NULL,
        token_count INTEGER NOT NULL,
        doc_type TEXT NOT NULL,
        source_uri TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_doc_chunks_conv ON doc_chunks(conversation_id, chunk_index);
    `,
  },
  {
    version: 3,
    sql: `
      PRAGMA foreign_keys = OFF;

      CREATE TABLE IF NOT EXISTS memory_facts_v3 (
        id TEXT PRIMARY KEY,
        fact TEXT NOT NULL,
        source_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      INSERT OR IGNORE INTO memory_facts_v3 (id, fact, source_conversation_id, pinned, created_at)
      SELECT id, fact, source_conversation_id, pinned, created_at
      FROM memory_facts;

      DROP TABLE IF EXISTS memory_facts;
      ALTER TABLE memory_facts_v3 RENAME TO memory_facts;

      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS memory_vectors (
        fact_id TEXT PRIMARY KEY REFERENCES memory_facts(id) ON DELETE CASCADE,
        embedding BLOB NOT NULL
      );
    `,
  },
];
