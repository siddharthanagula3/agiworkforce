import { describe, expect, it } from 'vitest';

import { findConsentPurpose } from './consent-purposes';

describe('enterprise waitlist consent purpose', () => {
  it('preserves the historical purpose id while describing current Enterprise availability', () => {
    const purpose = findConsentPurpose('enterprise_waitlist');

    expect(purpose?.description).toMatch(/already live for entitled workspaces/i);
    expect(purpose?.description).toMatch(/additional Enterprise capabilities/i);
    expect(purpose?.description).not.toMatch(/when enterprise organisation and SSO features open/i);
    expect(purpose?.label).toMatch(/contract-scoped Enterprise access/i);
    expect(purpose?.label).not.toMatch(/early-access/i);
  });
});
