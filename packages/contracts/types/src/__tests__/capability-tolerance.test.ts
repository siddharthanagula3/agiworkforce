import { describe, expect, it } from 'vitest';

import { surfaceCapabilityGrant } from '../capabilities';

describe('surfaceCapabilityGrant', () => {
  it('reads the one platform matrix rather than restating it', () => {
    expect(surfaceCapabilityGrant('web').has('canUseTerminal')).toBe(false);
    expect(surfaceCapabilityGrant('desktop').has('canUseTerminal')).toBe(true);
    expect(surfaceCapabilityGrant('mobile').has('canUsePhotos')).toBe(true);
  });
});
