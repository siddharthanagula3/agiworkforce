import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { submitGoalAuto, submitGoalSwarm } from './agi';
import { toast } from 'sonner';

describe('AGI native execution boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fabricate a swarm result outside the native desktop runtime', async () => {
    await expect(submitGoalSwarm({ description: 'Analyze all files' })).resolves.toBeNull();
    expect(toast.error).toHaveBeenCalledWith('Agent execution requires the desktop app');
  });

  it('does not fabricate an automatic goal id outside the native desktop runtime', async () => {
    await expect(submitGoalAuto({ description: 'Prepare a release' })).resolves.toBeNull();
    expect(toast.error).toHaveBeenCalledWith('Agent execution requires the desktop app');
  });
});
