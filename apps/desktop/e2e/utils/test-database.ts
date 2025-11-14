import * as fs from 'fs';
import * as path from 'path';

export class TestDatabase {
  private dbPath: string;

  constructor() {
    // Use a test database in a temporary location
    this.dbPath = path.join(process.cwd(), 'e2e', '.test-data', 'test.db');
  }

  async initialize() {
    // Ensure test data directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Clean up any existing test database
    if (fs.existsSync(this.dbPath)) {
      fs.unlinkSync(this.dbPath);
    }

    // Create seed data
    await this.seedDatabase();
  }

  async seedDatabase() {
    // This would typically use SQLite to create tables and insert test data
    // For now, we'll create mock data files
    const seedData = {
      conversations: [
        {
          id: 'conv-1',
          title: 'Test Conversation 1',
          created_at: Date.now(),
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
          ],
        },
        {
          id: 'conv-2',
          title: 'Test Conversation 2',
          created_at: Date.now() - 3600000,
          messages: [
            { role: 'user', content: 'What is AGI?' },
            { role: 'assistant', content: 'AGI stands for Artificial General Intelligence.' },
          ],
        },
      ],
      goals: [
        {
          id: 'goal-1',
          description: 'Create a React component',
          status: 'Pending',
          created_at: Date.now(),
          steps: [],
        },
        {
          id: 'goal-2',
          description: 'Process customer emails',
          status: 'InProgress',
          created_at: Date.now() - 7200000,
          steps: [
            { description: 'Connect to email server', status: 'Completed' },
            { description: 'Fetch unread emails', status: 'InProgress' },
            { description: 'Generate responses', status: 'Pending' },
          ],
        },
      ],
      settings: {
        theme: 'dark',
        language: 'en',
        providers: {
          openai: { enabled: true, apiKey: 'test-key-openai' },
          anthropic: { enabled: false, apiKey: '' },
          ollama: { enabled: true, apiKey: '' },
        },
        resourceLimits: {
          cpu: 70,
          memory: 80,
        },
        autonomousMode: false,
        autoApproval: false,
      },
    };

    const seedFilePath = path.join(path.dirname(this.dbPath), 'seed-data.json');
    fs.writeFileSync(seedFilePath, JSON.stringify(seedData, null, 2));
  }

  async cleanup() {
    // Clean up test database and related files
    const dir = path.dirname(this.dbPath);
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        fs.unlinkSync(path.join(dir, file));
      }
      fs.rmdirSync(dir);
    }
  }

  async insertConversation(conversation: any) {
    // Mock implementation - would actually insert into SQLite
    console.log('[TestDB] Inserting conversation:', conversation.id);
  }

  async insertGoal(goal: any) {
    // Mock implementation - would actually insert into SQLite
    console.log('[TestDB] Inserting goal:', goal.id);
  }

  async clearAll() {
    // Mock implementation - would actually clear all tables
    console.log('[TestDB] Clearing all data');
  }
}
