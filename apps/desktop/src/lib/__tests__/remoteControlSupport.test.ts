import { describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('../runtimeEnvironment');

async function supportWhen(isTauri: boolean) {
  vi.resetModules();
  vi.doMock('../runtimeEnvironment', async (importOriginal) => ({
    ...(await importOriginal<ScanModule0>()),
    isTauri,
  }));
  return import('../remoteControlSupport');
}

describe('whether this host can actually carry Remote Control', () => {
  it('says yes on the shell that owns the dispatch commands', async () => {
    const { remoteControlSupported } = await supportWhen(true);
    expect(remoteControlSupported()).toBe(true);
  });

  it('says no where the verify command is missing, rather than pairing into a silent drop', async () => {
    // Without it every inbound message fails an unknown command, falls past
    // every named reason, and is discarded while the panel reads Connected.
    const { remoteControlSupported } = await supportWhen(false);
    expect(remoteControlSupported()).toBe(false);
  });
});
