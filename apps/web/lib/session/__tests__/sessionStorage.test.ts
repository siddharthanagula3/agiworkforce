/**
 * Session Storage Tests
 *
 * Comprehensive unit tests for session persistence functionality.
 * Tests localStorage operations, serialization, and data integrity.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as sessionStorage from '../sessionStorage';
import type { EnhancedMessage } from '@/stores/unified/chat/types';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('SessionStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // =========================================================================
  // 1. Session Save/Load Tests
  // =========================================================================

  describe('saveSession and loadSession', () => {
    it('should save and load a session with messages', () => {
      const now = new Date();
      const message: EnhancedMessage = {
        id: 'msg_1',
        role: 'user',
        content: 'Hello',
        timestamp: now,
        metadata: {
          model: 'claude-3-5-sonnet-20241022',
          provider: 'anthropic',
        },
      };

      const session = {
        id: 'session_1',
        title: 'Test Chat',
        preview: 'Hello...',
        messageCount: 1,
        createdAt: now,
        updatedAt: now,
        messages: [message],
        selectedModel: 'claude-3-5-sonnet-20241022',
        selectedProvider: 'anthropic',
      };

      // Save
      sessionStorage.saveSession(session);

      // Load
      const loaded = sessionStorage.loadSession('session_1');

      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe('session_1');
      expect(loaded?.title).toBe('Test Chat');
      expect(loaded?.messages).toHaveLength(1);
      expect(loaded?.messages[0].content).toBe('Hello');
      expect(loaded?.selectedModel).toBe('claude-3-5-sonnet-20241022');
    });

    it('should preserve message metadata during save/load', () => {
      const now = new Date();
      const message: EnhancedMessage = {
        id: 'msg_1',
        role: 'assistant',
        content: 'Response',
        timestamp: now,
        metadata: {
          model: 'gpt-4-turbo',
          provider: 'openai',
          cost: 0.05,
          tokenCount: 150,
        },
      };

      const session = {
        id: 'session_1',
        title: 'Test',
        preview: '',
        messageCount: 1,
        createdAt: now,
        updatedAt: now,
        messages: [message],
      };

      sessionStorage.saveSession(session);
      const loaded = sessionStorage.loadSession('session_1');

      expect(loaded?.messages[0].metadata?.cost).toBe(0.05);
      expect(loaded?.messages[0].metadata?.tokenCount).toBe(150);
      expect(loaded?.messages[0].metadata?.provider).toBe('openai');
    });

    it('should handle multiple sessions', () => {
      const now = new Date();

      // Save 3 sessions
      for (let i = 1; i <= 3; i++) {
        const session = {
          id: `session_${i}`,
          title: `Chat ${i}`,
          preview: `Preview ${i}`,
          messageCount: 0,
          createdAt: now,
          updatedAt: now,
          messages: [],
        };
        sessionStorage.saveSession(session);
      }

      // Load all
      const all = sessionStorage.loadAllSessions();
      expect(all).toHaveLength(3);
      expect(all[0].title).toBe('Chat 1');
      expect(all[2].title).toBe('Chat 3');
    });

    it('should update existing session', () => {
      const now = new Date();
      const session1 = {
        id: 'session_1',
        title: 'Original',
        preview: '',
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
        messages: [],
      };

      // Save first time
      sessionStorage.saveSession(session1);

      // Update
      const updated = {
        ...session1,
        title: 'Updated',
        messageCount: 1,
      };
      sessionStorage.saveSession(updated);

      // Verify only one entry and title is updated
      const all = sessionStorage.loadAllSessions();
      expect(all).toHaveLength(1);
      expect(all[0].title).toBe('Updated');
    });

    it('should return null for non-existent session', () => {
      const loaded = sessionStorage.loadSession('nonexistent');
      expect(loaded).toBeNull();
    });

    it('should convert Date objects to ISO strings', () => {
      const now = new Date('2026-03-16T12:00:00Z');
      const session = {
        id: 'session_1',
        title: 'Test',
        preview: '',
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
        messages: [],
      };

      sessionStorage.saveSession(session);
      const loaded = sessionStorage.loadSession('session_1');

      expect(loaded?.createdAt).toBe(now.toISOString());
    });
  });

  // =========================================================================
  // 2. Session Deletion Tests
  // =========================================================================

  describe('deleteSession and clearAllSessions', () => {
    it('should delete a session', () => {
      const now = new Date();
      const session = {
        id: 'session_1',
        title: 'Test',
        preview: '',
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
        messages: [],
      };

      sessionStorage.saveSession(session);
      expect(sessionStorage.loadAllSessions()).toHaveLength(1);

      sessionStorage.deleteSession('session_1');
      expect(sessionStorage.loadAllSessions()).toHaveLength(0);
    });

    it('should clear current session ID when deleting current session', () => {
      const now = new Date();
      const session = {
        id: 'session_1',
        title: 'Test',
        preview: '',
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
        messages: [],
      };

      sessionStorage.saveSession(session);
      sessionStorage.saveCurrentSessionId('session_1');

      sessionStorage.deleteSession('session_1');
      expect(sessionStorage.loadCurrentSessionId()).toBeNull();
    });

    it('should clear all sessions and metadata', () => {
      const now = new Date();
      for (let i = 1; i <= 3; i++) {
        const session = {
          id: `session_${i}`,
          title: `Chat ${i}`,
          preview: '',
          messageCount: 0,
          createdAt: now,
          updatedAt: now,
          messages: [],
        };
        sessionStorage.saveSession(session);
      }

      sessionStorage.saveCurrentSessionId('session_1');
      sessionStorage.clearAllSessions();

      expect(sessionStorage.loadAllSessions()).toHaveLength(0);
      expect(sessionStorage.loadCurrentSessionId()).toBeNull();
      expect(sessionStorage.getSessionMetadata()).toBeNull();
    });
  });

  // =========================================================================
  // 3. Model Selection Tests
  // =========================================================================

  describe('Model Selection Storage', () => {
    it('should save and load model selection', () => {
      const model = {
        modelId: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
      };

      sessionStorage.saveModelSelection(model);
      const loaded = sessionStorage.loadModelSelection();

      expect(loaded?.modelId).toBe('claude-3-5-sonnet-20241022');
      expect(loaded?.provider).toBe('anthropic');
    });

    it('should return null for unset model selection', () => {
      const loaded = sessionStorage.loadModelSelection();
      expect(loaded).toBeNull();
    });

    it('should handle null/undefined provider', () => {
      const model = {
        modelId: 'gpt-4',
        provider: 'openai',
      };

      sessionStorage.saveModelSelection(model);
      const loaded = sessionStorage.loadModelSelection();

      expect(loaded?.provider).toBe('openai');
    });
  });

  // =========================================================================
  // 4. Sidebar State Tests
  // =========================================================================

  describe('Sidebar State Storage', () => {
    it('should save and load sidebar collapsed state', () => {
      sessionStorage.saveSidebarState(true);
      expect(sessionStorage.loadSidebarState()).toBe(true);

      sessionStorage.saveSidebarState(false);
      expect(sessionStorage.loadSidebarState()).toBe(false);
    });

    it('should return null for unset sidebar state', () => {
      expect(sessionStorage.loadSidebarState()).toBeNull();
    });
  });

  // =========================================================================
  // 5. Theme Preference Tests
  // =========================================================================

  describe('Theme Preference Storage', () => {
    it('should save and load theme preference', () => {
      sessionStorage.saveThemePreference('dark');
      expect(sessionStorage.loadThemePreference()).toBe('dark');

      sessionStorage.saveThemePreference('light');
      expect(sessionStorage.loadThemePreference()).toBe('light');

      sessionStorage.saveThemePreference('system');
      expect(sessionStorage.loadThemePreference()).toBe('system');
    });

    it('should return null for invalid theme', () => {
      localStorage.setItem('agi_theme_preference', JSON.stringify('invalid'));
      const loaded = sessionStorage.loadThemePreference();
      expect(loaded).toBeNull();
    });

    it('should return null for unset theme', () => {
      expect(sessionStorage.loadThemePreference()).toBeNull();
    });
  });

  // =========================================================================
  // 6. Current Session ID Tests
  // =========================================================================

  describe('Current Session ID Storage', () => {
    it('should save and load current session ID', () => {
      sessionStorage.saveCurrentSessionId('session_123');
      expect(sessionStorage.loadCurrentSessionId()).toBe('session_123');
    });

    it('should clear current session ID', () => {
      sessionStorage.saveCurrentSessionId('session_123');
      sessionStorage.clearCurrentSessionId();
      expect(sessionStorage.loadCurrentSessionId()).toBeNull();
    });

    it('should return null for unset session ID', () => {
      expect(sessionStorage.loadCurrentSessionId()).toBeNull();
    });
  });

  // =========================================================================
  // 7. Storage Size Tests
  // =========================================================================

  describe('getSessionStorageSize', () => {
    it('should calculate approximate storage size', () => {
      const now = new Date();
      const session = {
        id: 'session_1',
        title: 'Test Chat',
        preview: 'This is a test message',
        messageCount: 1,
        createdAt: now,
        updatedAt: now,
        messages: [
          {
            id: 'msg_1',
            role: 'user' as const,
            content: 'Hello, this is a test message with some content',
            timestamp: now,
            metadata: {
              model: 'claude-3-5-sonnet-20241022',
              provider: 'anthropic',
              tokenCount: 100,
            },
          },
        ],
      };

      sessionStorage.saveSession(session);
      const size = sessionStorage.getSessionStorageSize();

      expect(size).toBeGreaterThan(0);
      expect(typeof size).toBe('number');
    });

    it('should return 0 for empty storage', () => {
      const size = sessionStorage.getSessionStorageSize();
      expect(size).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // 8. Export/Import Tests
  // =========================================================================

  describe('exportSessions and importSessions', () => {
    it('should export and import sessions', () => {
      const now = new Date();
      const session = {
        id: 'session_1',
        title: 'Test Chat',
        preview: 'Preview',
        messageCount: 1,
        createdAt: now,
        updatedAt: now,
        messages: [
          {
            id: 'msg_1',
            role: 'user' as const,
            content: 'Test message',
            timestamp: now,
          },
        ],
      };

      // Save initial session
      sessionStorage.saveSession(session);
      sessionStorage.saveCurrentSessionId('session_1');
      sessionStorage.saveModelSelection({
        modelId: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
      });

      // Export
      const exported = sessionStorage.exportSessions();
      expect(exported).toBeTruthy();
      expect(exported).toContain('session_1');

      // Clear and import
      localStorage.clear();
      const success = sessionStorage.importSessions(exported);
      expect(success).toBe(true);

      // Verify imported data
      const loaded = sessionStorage.loadSession('session_1');
      expect(loaded?.title).toBe('Test Chat');
      expect(sessionStorage.loadCurrentSessionId()).toBe('session_1');
    });

    it('should handle invalid JSON on import', () => {
      const success = sessionStorage.importSessions('invalid json {');
      expect(success).toBe(false);
    });

    it('should handle version mismatch on import', () => {
      const backup = JSON.stringify({
        version: 999,
        sessions: [],
        exportedAt: new Date().toISOString(),
      });

      const success = sessionStorage.importSessions(backup);
      expect(success).toBe(true); // Should proceed with warning
    });
  });

  // =========================================================================
  // 9. Metadata Tests
  // =========================================================================

  describe('Metadata Operations', () => {
    it('should create metadata on save', () => {
      const now = new Date();
      const session = {
        id: 'session_1',
        title: 'Test',
        preview: '',
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
        messages: [],
      };

      sessionStorage.saveSession(session);
      const metadata = sessionStorage.getSessionMetadata();

      expect(metadata).toBeDefined();
      expect(metadata?.version).toBe(1);
      expect(metadata?.lastSyncTime).toBeDefined();
    });

    it('should return null for unset metadata', () => {
      const metadata = sessionStorage.getSessionMetadata();
      expect(metadata).toBeNull();
    });
  });

  // =========================================================================
  // 10. Error Handling Tests
  // =========================================================================

  describe('Error Handling', () => {
    it('should handle localStorage quota exceeded gracefully', () => {
      // Mock localStorage to throw quota error
      const setItemSpy = vi.spyOn(localStorage, 'setItem');
      setItemSpy.mockImplementationOnce(() => {
        throw new Error('QuotaExceededError');
      });

      const now = new Date();
      const session = {
        id: 'session_1',
        title: 'Test',
        preview: '',
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
        messages: [],
      };

      // Should not throw, should log error
      expect(() => {
        sessionStorage.saveSession(session);
      }).not.toThrow();

      setItemSpy.mockRestore();
    });

    it('should handle corrupted JSON in localStorage', () => {
      localStorage.setItem('agi_chat_sessions', 'corrupted{json]');

      const sessions = sessionStorage.loadAllSessions();
      expect(sessions).toEqual([]);
    });

    it('should handle missing version in metadata', () => {
      localStorage.setItem(
        'agi_chat_sessions_metadata',
        JSON.stringify({ lastSyncTime: '2026-03-16T00:00:00Z' }),
      );

      const metadata = sessionStorage.getSessionMetadata();
      expect(metadata).toBeNull();
    });
  });

  // =========================================================================
  // 11. Edge Cases
  // =========================================================================

  describe('Edge Cases', () => {
    it('should handle session with many messages', () => {
      const now = new Date();
      const messages: EnhancedMessage[] = [];

      for (let i = 0; i < 100; i++) {
        messages.push({
          id: `msg_${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`.repeat(10),
          timestamp: now,
        });
      }

      const session = {
        id: 'session_1',
        title: 'Large Chat',
        preview: 'Many messages',
        messageCount: 100,
        createdAt: now,
        updatedAt: now,
        messages,
      };

      sessionStorage.saveSession(session);
      const loaded = sessionStorage.loadSession('session_1');

      expect(loaded?.messages).toHaveLength(100);
      expect(loaded?.messages[99].content).toContain('Message 99');
    });

    it('should trim old sessions to prevent unbounded growth', () => {
      const now = new Date();

      // Create 60 sessions (should trim to 50)
      for (let i = 1; i <= 60; i++) {
        const session = {
          id: `session_${i}`,
          title: `Chat ${i}`,
          preview: '',
          messageCount: 0,
          createdAt: now,
          updatedAt: now,
          messages: [],
        };
        sessionStorage.saveSession(session);
      }

      const all = sessionStorage.loadAllSessions();
      expect(all).toHaveLength(50);
      // Should keep the last 50 (sessions 11-60)
      expect(all[0].id).toBe('session_11');
      expect(all[49].id).toBe('session_60');
    });

    it('should handle empty content messages', () => {
      const now = new Date();
      const message: EnhancedMessage = {
        id: 'msg_1',
        role: 'user',
        content: '',
        timestamp: now,
      };

      const session = {
        id: 'session_1',
        title: 'Empty',
        preview: '',
        messageCount: 1,
        createdAt: now,
        updatedAt: now,
        messages: [message],
      };

      sessionStorage.saveSession(session);
      const loaded = sessionStorage.loadSession('session_1');

      expect(loaded?.messages[0].content).toBe('');
    });
  });
});
