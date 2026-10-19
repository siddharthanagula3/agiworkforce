import { describe, expect, it, vi } from 'vitest';

import { onAppCommand, openUpgrade } from './app-commands';

describe('openUpgrade', () => {
  it('opens the in-app plan dialog where a surface hosts one and does not navigate', () => {
    const openDialog = vi.fn();
    const navigate = vi.fn();
    const stop = onAppCommand('open-upgrade', openDialog);

    openUpgrade(navigate);
    stop();

    expect(openDialog).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('goes to the plans page where nothing hosts the dialog', () => {
    const navigate = vi.fn();

    openUpgrade(navigate);

    expect(navigate).toHaveBeenCalledWith('/pricing');
  });
});
