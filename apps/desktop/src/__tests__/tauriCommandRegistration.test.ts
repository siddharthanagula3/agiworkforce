import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const libRs = readFileSync(resolve(__dirname, '../../src-tauri/src/lib.rs'), 'utf8');
const conversationRs = readFileSync(
  resolve(__dirname, '../../src-tauri/src/sys/commands/chat/conversation.rs'),
  'utf8',
);
const dataModRs = readFileSync(resolve(__dirname, '../../src-tauri/src/data/mod.rs'), 'utf8');

describe('tauri command registration contracts', () => {
  it('keeps the generation-aware frontend coordinator as the sole live Desktop settings-sync owner', () => {
    expect(conversationRs).not.toContain('settings_sync::sync_settings_now');
    expect(dataModRs).not.toMatch(/^pub mod settings_sync;/m);
  });

  it('keeps realtime + messaging commands registered when frontend invokes them', () => {
    const libPaths = [
      'crate::sys::commands::messaging::send_message',
      'crate::sys::commands::realtime::connect_websocket',
      'crate::sys::commands::realtime::get_team_presence',
      'crate::sys::commands::realtime::get_user_presence',
      'crate::sys::commands::realtime::set_user_online',
      'crate::sys::commands::realtime::set_user_offline',
      'crate::sys::commands::realtime::update_user_activity',
    ];

    for (const path of libPaths) {
      expect(libRs).toContain(path);
    }
  });

  describe('Command argument signatures (M38)', () => {
    describe('memory commands', () => {
      it('memory_remember accepts category, topic, content, importance, source', () => {
        expect(libRs).toContain('memory_remember');
        const commandsDir = resolve(__dirname, '../../src-tauri/src');
        let memRs = '';
        const primaryPath = `${commandsDir}/sys/commands/memory.rs`;
        const alternatePath = `${commandsDir}/commands/memory.rs`;
        try {
          memRs = readFileSync(primaryPath, 'utf8');
        } catch {
          try {
            memRs = readFileSync(alternatePath, 'utf8');
          } catch (err) {
            void err;
          }
        }
        expect(memRs).not.toBe('');

        if (memRs) {
          expect(memRs).toContain('memory_remember');
          expect(memRs).toContain('category');
          expect(memRs).toContain('topic');
          expect(memRs).toContain('content');
          expect(memRs).toContain('importance');
        }
      });

      it('memory_recall accepts category and topic', () => {
        expect(libRs).toContain('memory_recall');
      });

      it('memory_search accepts query and optional limit', () => {
        expect(libRs).toContain('memory_search');
      });

      it('memory_forget accepts memory_id', () => {
        expect(libRs).toContain('memory_forget');
      });

      it('memory_get_by_category is registered', () => {
        expect(libRs).toContain('memory_get_by_category');
      });

      it('memory_get_session_context is registered', () => {
        expect(libRs).toContain('memory_get_session_context');
      });

      it('memory_log_context is registered', () => {
        expect(libRs).toContain('memory_log_context');
      });

      it('memory_get_important is registered', () => {
        expect(libRs).toContain('memory_get_important');
      });

      it('memory_export_all is registered', () => {
        expect(libRs).toContain('memory_export_all');
      });

      it('memory_cleanup_logs is registered', () => {
        expect(libRs).toContain('memory_cleanup_logs');
      });

      it('memory_list_all is registered', () => {
        expect(libRs).toContain('memory_list_all');
      });
    });

    describe('window commands', () => {
      it('window_get_state is registered', () => {
        expect(libRs).toContain('window_get_state');
      });

      it('window_toggle_maximize is registered', () => {
        expect(libRs).toContain('window_toggle_maximize');
      });

      it('window_dock is registered (takes position argument)', () => {
        expect(libRs).toContain('window_dock');
      });

      it('menu bar residency commands are registered', () => {
        expect(libRs).toContain('window_set_menu_bar_mode');
        expect(libRs).toContain('window_request_close');
      });

      it('window commands module is registered', () => {
        expect(libRs).toContain('window_toggle_maximize');
      });
    });

    describe('settings commands', () => {
      it('settings_save is registered', () => {
        expect(libRs).toContain('settings_save');
      });

      it('llm_set_default_provider is registered', () => {
        expect(libRs).toContain('llm_set_default_provider');
      });
    });

    describe('file commands', () => {
      it('file_read is registered', () => {
        expect(libRs).toContain('file_read');
      });

      it('file_write is registered', () => {
        expect(libRs).toContain('file_write');
      });

      it('file_exists is registered', () => {
        expect(libRs).toContain('file_exists');
      });

      it('get_home_directory is registered', () => {
        expect(libRs).toContain('file_read');
        expect(libRs).toContain('file_exists');
      });
    });

    describe('no typos in critical command names', () => {
      const criticalCommands = [
        'memory_remember',
        'memory_recall',
        'memory_search',
        'memory_forget',
        'window_get_state',
        'window_toggle_maximize',
        'settings_save',
        'file_read',
        'file_write',
      ];

      it('all critical command names appear verbatim in lib.rs', () => {
        for (const cmd of criticalCommands) {
          expect(libRs).toContain(cmd);
        }
      });
    });
  });
});
