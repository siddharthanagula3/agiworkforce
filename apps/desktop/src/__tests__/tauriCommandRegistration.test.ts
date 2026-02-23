import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// registry.rs was deleted; lib.rs generate_handler![] is now the sole source of truth.
const libRs = readFileSync(resolve(__dirname, '../../src-tauri/src/lib.rs'), 'utf8');

describe('tauri command registration contracts', () => {
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
});
