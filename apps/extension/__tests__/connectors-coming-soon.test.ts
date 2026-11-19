import { describe, expect, it } from 'vitest';
import { CONNECTORS_COMING_SOON_REASON } from '@agiworkforce/types';
import { connectorsComingSoon } from '../src/features/cloud-bridge/capabilityDocument';

const sources = { model: 'models', tier: 'tier', surface: 'surface:web', settings: 'settings' };

describe('Connectors in the side panel', () => {
  it('is locked as coming soon while the server holds connectors back for everyone', () => {
    expect(
      connectorsComingSoon({
        granted: ['canChat'],
        deniedBy: { canUseConnectors: ['model'] },
        denialReasons: { canUseConnectors: CONNECTORS_COMING_SOON_REASON },
        sources,
      }),
    ).toBe(true);
  });

  it('is not shown as coming soon when the plan or a setting denies it', () => {
    expect(
      connectorsComingSoon({
        granted: ['canChat'],
        deniedBy: { canUseConnectors: ['tier'] },
        sources,
      }),
    ).toBe(false);
  });

  it('is not locked once connectors are granted', () => {
    expect(
      connectorsComingSoon({ granted: ['canChat', 'canUseConnectors'], deniedBy: {}, sources }),
    ).toBe(false);
  });

  it('is not locked without an account capability document', () => {
    expect(connectorsComingSoon(null)).toBe(false);
  });
});
