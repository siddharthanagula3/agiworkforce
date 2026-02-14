import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const libRs = readFileSync(resolve(__dirname, '../../src-tauri/src/lib.rs'), 'utf8');
const registryRs = readFileSync(
  resolve(__dirname, '../../src-tauri/src/sys/commands/registry.rs'),
  'utf8',
);

describe('tauri command registration contracts', () => {
  it('keeps realtime + messaging commands registered when frontend invokes them', () => {
    const contracts = [
      {
        libPath: 'crate::sys::commands::messaging::send_message',
        registryPath: '$crate::sys::commands::messaging::send_message',
      },
      {
        libPath: 'crate::sys::commands::realtime::connect_websocket',
        registryPath: '$crate::sys::commands::realtime::connect_websocket',
      },
      {
        libPath: 'crate::sys::commands::realtime::get_team_presence',
        registryPath: '$crate::sys::commands::realtime::get_team_presence',
      },
      {
        libPath: 'crate::sys::commands::realtime::get_user_presence',
        registryPath: '$crate::sys::commands::realtime::get_user_presence',
      },
      {
        libPath: 'crate::sys::commands::realtime::set_user_online',
        registryPath: '$crate::sys::commands::realtime::set_user_online',
      },
      {
        libPath: 'crate::sys::commands::realtime::set_user_offline',
        registryPath: '$crate::sys::commands::realtime::set_user_offline',
      },
      {
        libPath: 'crate::sys::commands::realtime::update_user_activity',
        registryPath: '$crate::sys::commands::realtime::update_user_activity',
      },
    ];

    for (const contract of contracts) {
      expect(libRs).toContain(contract.libPath);
      expect(registryRs).toContain(contract.registryPath);
    }
  });
});
