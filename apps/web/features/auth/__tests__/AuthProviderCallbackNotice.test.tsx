import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { TERMS_GATE_STORAGE_KEY } from '@/app/signup/TermsGate';
import { AuthProviderCallbackNotice } from '../AuthProviderCallbackNotice';

describe('provider callback notice', () => {
  it('clears an abandoned signup agreement marker after OAuth fails', () => {
    window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.terms);

    render(<AuthProviderCallbackNotice notice="provider_cancelled" retryHref="/login" />);

    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull();
  });
});
