import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';

export class TestDatabase {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(process.cwd(), 'e2e', '.test-data', 'test.db');
  }

  async initialize(): Promise<void> {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.dbPath)) {
        fs.unlinkSync(this.dbPath);
      }

      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');

      this.createSchema();

      await this.seedDatabase();

      console.log('[TestDB] Database initialized successfully:', this.dbPath);
    } catch (error) {
      throw new Error(
        `TestDatabase.initialize() failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private createSchema(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id INTEGER NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
          content TEXT NOT NULL,
          tokens INTEGER,
          cost REAL,
          provider TEXT,
          model TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          encrypted INTEGER NOT NULL DEFAULT 0 CHECK(encrypted IN (0, 1))
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS automation_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_type TEXT NOT NULL CHECK(task_type IN (
            'windows_automation',
            'browser_automation',
            'file_operation',
            'terminal_command',
            'code_editing',
            'database_query',
            'api_call',
            'other'
          )),
          success INTEGER NOT NULL CHECK(success IN (0, 1)),
          error TEXT,
          duration_ms INTEGER NOT NULL,
          cost REAL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS overlay_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL CHECK(event_type IN (
            'click',
            'type',
            'region_highlight',
            'screenshot_flash'
          )),
          x INTEGER NOT NULL,
          y INTEGER NOT NULL,
          data TEXT,
          timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS captures (
          id TEXT PRIMARY KEY,
          conversation_id INTEGER,
          capture_type TEXT NOT NULL CHECK(capture_type IN ('fullscreen', 'window', 'region')),
          file_path TEXT NOT NULL,
          thumbnail_path TEXT,
          ocr_text TEXT,
          ocr_confidence REAL,
          metadata TEXT,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        )
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS calendar_accounts (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          account_email TEXT,
          display_name TEXT,
          token_json TEXT NOT NULL,
          config_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_automation_history_created ON automation_history(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_automation_history_type ON automation_history(task_type, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_overlay_events_timestamp ON overlay_events(timestamp);
        CREATE INDEX IF NOT EXISTS idx_captures_conversation ON captures(conversation_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_captures_created ON captures(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_calendar_accounts_provider ON calendar_accounts(provider);
      `);

      console.log('[TestDB] Schema created successfully');
    } catch (error) {
      throw new Error(
        `Schema creation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async seedDatabase(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const now = new Date().toISOString();

      const insertConvStmt = this.db.prepare(
        'INSERT INTO conversations (title, created_at, updated_at) VALUES (?, ?, ?)',
      );

      const conv1Id = (
        insertConvStmt.run('Test Conversation 1', now, now) as { lastInsertRowid: number }
      ).lastInsertRowid as number;
      const conv2Id = (
        insertConvStmt.run('Test Conversation 2', now, now) as { lastInsertRowid: number }
      ).lastInsertRowid as number;

      const insertMsgStmt = this.db.prepare(
        'INSERT INTO messages (conversation_id, role, content, tokens, cost, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      );

      insertMsgStmt.run(conv1Id, 'user', 'Hello', 2, 0.0001, now);
      insertMsgStmt.run(conv1Id, 'assistant', 'Hi there!', 4, 0.0002, now);

      insertMsgStmt.run(conv2Id, 'user', 'What is AGI?', 4, 0.0001, now);
      insertMsgStmt.run(
        conv2Id,
        'assistant',
        'AGI stands for Artificial General Intelligence.',
        10,
        0.0005,
        now,
      );

      const insertSettingStmt = this.db.prepare(
        'INSERT INTO settings (key, value, encrypted) VALUES (?, ?, ?)',
      );

      insertSettingStmt.run('theme', 'dark', 0);
      insertSettingStmt.run('language', 'en', 0);
      insertSettingStmt.run('autonomousMode', 'false', 0);
      insertSettingStmt.run('autoApproval', 'false', 0);
      insertSettingStmt.run('provider_openai_enabled', 'true', 0);
      insertSettingStmt.run('provider_ollama_enabled', 'true', 0);
      insertSettingStmt.run('provider_openai_apiKey', 'test-key-openai', 1);

      const insertHistoryStmt = this.db.prepare(
        'INSERT INTO automation_history (task_type, success, duration_ms, cost, created_at) VALUES (?, ?, ?, ?, ?)',
      );

      insertHistoryStmt.run('windows_automation', 1, 150, 0.001, now);
      insertHistoryStmt.run('browser_automation', 1, 250, 0.002, now);
      insertHistoryStmt.run('file_operation', 1, 50, 0, now);

      console.log('[TestDB] Test data seeded successfully');
    } catch (error) {
      throw new Error(
        `Database seeding failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async insertConversation(conversation: {
    title: string;
    created_at?: string;
    updated_at?: string;
  }): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(
        'INSERT INTO conversations (title, created_at, updated_at) VALUES (?, ?, ?)',
      );

      const result = stmt.run(
        conversation.title,
        conversation.created_at || now,
        conversation.updated_at || now,
      ) as { lastInsertRowid: number };

      console.log(
        '[TestDB] Inserted conversation:',
        conversation.title,
        'ID:',
        result.lastInsertRowid,
      );
      return result.lastInsertRowid as number;
    } catch (error) {
      throw new Error(
        `Failed to insert conversation: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async insertMessage(message: {
    conversation_id: number;
    role: 'user' | 'assistant' | 'system';
    content: string;
    tokens?: number;
    cost?: number;
    provider?: string;
    model?: string;
  }): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const now = new Date().toISOString();
      const stmt = this.db.prepare(
        'INSERT INTO messages (conversation_id, role, content, tokens, cost, provider, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      );

      const result = stmt.run(
        message.conversation_id,
        message.role,
        message.content,
        message.tokens || null,
        message.cost || null,
        message.provider || null,
        message.model || null,
        now,
      ) as { lastInsertRowid: number };

      console.log('[TestDB] Inserted message:', message.role, 'ID:', result.lastInsertRowid);
      return result.lastInsertRowid as number;
    } catch (error) {
      throw new Error(
        `Failed to insert message: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async insertGoal(goal: {
    description: string;
    status: string;
    task_type?: string;
  }): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const now = new Date().toISOString();
      const taskType = goal.task_type || 'other';
      const success = goal.status === 'Completed' ? 1 : 0;

      const stmt = this.db.prepare(
        'INSERT INTO automation_history (task_type, success, duration_ms, created_at) VALUES (?, ?, ?, ?)',
      );

      const result = stmt.run(taskType, success, 0, now) as { lastInsertRowid: number };

      console.log('[TestDB] Inserted goal:', goal.description, 'ID:', result.lastInsertRowid);
      return result.lastInsertRowid as number;
    } catch (error) {
      throw new Error(
        `Failed to insert goal: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async clearAll(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      this.db.exec(`
        DELETE FROM captures;
        DELETE FROM calendar_accounts;
        DELETE FROM overlay_events;
        DELETE FROM automation_history;
        DELETE FROM messages;
        DELETE FROM conversations;
        DELETE FROM settings;
      `);

      console.log('[TestDB] All data cleared');
    } catch (error) {
      throw new Error(
        `Failed to clear all data: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getConversations(): Promise<Array<{ id: number; title: string; created_at: string }>> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(
        'SELECT id, title, created_at FROM conversations ORDER BY created_at DESC',
      );
      return stmt.all() as Array<{ id: number; title: string; created_at: string }>;
    } catch (error) {
      throw new Error(
        `Failed to get conversations: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getMessages(conversationId: number): Promise<
    Array<{
      id: number;
      conversation_id: number;
      role: string;
      content: string;
      created_at: string;
    }>
  > {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(
        'SELECT id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at',
      );
      return stmt.all(conversationId) as Array<{
        id: number;
        conversation_id: number;
        role: string;
        content: string;
        created_at: string;
      }>;
    } catch (error) {
      throw new Error(
        `Failed to get messages: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getSetting(key: string): Promise<string | null> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
      const result = stmt.get(key) as { value: string } | undefined;
      return result?.value || null;
    } catch (error) {
      throw new Error(
        `Failed to get setting: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async cleanup(): Promise<void> {
    try {
      if (this.db) {
        this.db.close();
        this.db = null;
      }

      const dir = path.dirname(this.dbPath);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log('[TestDB] Cleaned up database directory');
      }
    } catch (error) {
      console.error(
        '[TestDB] Cleanup error:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
