import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('../../lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke: invokeMock,
}));

import {
  forgetCheckpointAvailability,
  resolveCheckpointAvailability,
} from '../codingCheckpointStore';

type TauriMockModule = typeof import('../../lib/tauri-mock');

function checkpoint(id: string) {
  return { id, name: id, timestamp: '2026-10-11T00:00:00Z', fileSnapshots: {}, changeIndex: 0 };
}

describe('coding checkpoint availability', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    forgetCheckpointAvailability();
  });

  it('offers undo for a checkpoint the running app still holds', async () => {
    invokeMock.mockResolvedValue([checkpoint('live-1')]);

    await expect(resolveCheckpointAvailability('live-1')).resolves.toBe('available');
    expect(invokeMock).toHaveBeenCalledWith('coding_checkpoint_list');
  });

  it('reports a checkpoint from an earlier launch as ended without asking twice', async () => {
    invokeMock.mockResolvedValue([checkpoint('live-1')]);

    await expect(resolveCheckpointAvailability('from-last-launch')).resolves.toBe('ended');
    await expect(resolveCheckpointAvailability('from-last-launch')).resolves.toBe('ended');
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('shares one listing between tool rows that mount together and rechecks only the missing one', async () => {
    invokeMock.mockResolvedValue([checkpoint('a'), checkpoint('b')]);

    const results = await Promise.all([
      resolveCheckpointAvailability('a'),
      resolveCheckpointAvailability('b'),
      resolveCheckpointAvailability('gone'),
    ]);

    expect(results).toEqual(['available', 'available', 'ended']);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it('finds a checkpoint created after an earlier listing', async () => {
    invokeMock.mockResolvedValueOnce([checkpoint('a')]);
    await resolveCheckpointAvailability('a');

    invokeMock.mockResolvedValueOnce([checkpoint('a'), checkpoint('new')]);
    await expect(resolveCheckpointAvailability('new')).resolves.toBe('available');
  });

  it('keeps undo offered when the list cannot be read', async () => {
    invokeMock.mockRejectedValue(new Error('ipc unavailable'));

    await expect(resolveCheckpointAvailability('a')).resolves.toBe('unknown');
  });
});
