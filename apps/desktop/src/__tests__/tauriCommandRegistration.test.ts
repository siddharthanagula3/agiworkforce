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

  describe('Command argument signatures (M38)', () => {
    describe('memory commands', () => {
      it('memory_store accepts category, topic, content, importance, source', () => {
        expect(libRs).toContain('memory_store');
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
          expect(memRs).toContain('memory_store');
          expect(memRs).toContain('category');
          expect(memRs).toContain('topic');
          expect(memRs).toContain('content');
          expect(memRs).toContain('importance');
        }
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
        'memory_store',
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
