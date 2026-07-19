import { describe, expect, it } from 'vitest';

import { CloudAgentOriginSurfaceSchema } from '../cloud-agent-runs';

describe('CloudAgentOriginSurfaceSchema', () => {
  it.each(['web', 'mobile', 'desktop', 'chrome', 'vscode', 'cli', 'api'])(
    'accepts the %s Managed Cloud origin',
    (surface) => {
      expect(CloudAgentOriginSurfaceSchema.parse(surface)).toBe(surface);
    },
  );

  it('fails closed for an unknown origin', () => {
    expect(CloudAgentOriginSurfaceSchema.safeParse('unknown').success).toBe(false);
  });
});
