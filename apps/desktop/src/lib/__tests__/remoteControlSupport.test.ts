import { describe, expect, it, vi } from 'vitest';

async function supportWhen(host: { isTauri: boolean; bridgeCarriesVerify: boolean }) {
  vi.resetModules();
  vi.doMock('../runtimeEnvironment', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../runtimeEnvironment')>()),
    isTauri: host.isTauri,
  }));
  vi.doMock('../tauri-electron/bridgeContract', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../tauri-electron/bridgeContract')>()),
    isElectronBridgeCommand: (command: string) =>
      host.bridgeCarriesVerify && command === 'dispatch_hmac_verify',
  }));
  return import('../remoteControlSupport');
}

describe('whether this host can actually carry Remote Control', () => {
  it('says yes on the shell that owns the dispatch commands', async () => {
    const { remoteControlSupported } = await supportWhen({
      isTauri: true,
      bridgeCarriesVerify: false,
    });
    expect(remoteControlSupported()).toBe(true);
  });

  it('says no where the verify command is missing, rather than pairing into a silent drop', async () => {
    // Without it every inbound message fails an unknown command, falls past
    // every named reason, and is discarded while the panel reads Connected.
    const { remoteControlSupported } = await supportWhen({
      isTauri: false,
      bridgeCarriesVerify: false,
    });
    expect(remoteControlSupported()).toBe(false);
  });

  it('answers yes on its own once the bridge carries the command', async () => {
    // Asked of the bridge rather than the shell, so porting the commands is the
    // whole change and nobody has to remember this file.
    const { remoteControlSupported } = await supportWhen({
      isTauri: false,
      bridgeCarriesVerify: true,
    });
    expect(remoteControlSupported()).toBe(true);
  });
});
