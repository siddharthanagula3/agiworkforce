import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useBillingStore } from '@shared/stores/web-auth-store';
import { FREE_PLAN_TRAINING_DATA_DISCLOSURE } from '@/lib/compliance/free-plan-training-disclosure';
import {
  FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY,
  FreePlanTrainingNotice,
} from '../FreePlanTrainingNotice';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const ACCOUNT = { id: 'user_free_1' };

function signedInOn(tier: string | null, accountId: string | null = ACCOUNT.id): void {
  useBillingStore.setState({
    user: accountId ? { id: accountId } : null,
    subscription: tier
      ? {
          tier: tier as never,
          display_name: tier,
          status: 'active',
          current_period_end: null,
          plan_name: tier,
        }
      : null,
    initialized: true,
    isLoading: false,
    unauthenticated: false,
    error: null,
  });
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  useBillingStore.setState({ user: null, subscription: null, initialized: false, isLoading: true });
});

describe('the free model data notice', () => {
  it('states the same sentence the pricing comparison gives', () => {
    signedInOn('free');
    render(<FreePlanTrainingNotice />);

    expect(screen.getByTestId('free-plan-training-notice').textContent).toContain(
      FREE_PLAN_TRAINING_DATA_DISCLOSURE,
    );
  });

  it('is a note a screen reader can find, and offers the fuller explanation', () => {
    signedInOn('free');
    render(<FreePlanTrainingNotice />);

    const notice = screen.getByRole('note', { name: 'Free models and your prompts' });
    expect(notice).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/data-use');
  });

  it('is never shown to a paid plan', () => {
    signedInOn('pro');
    render(<FreePlanTrainingNotice />);

    expect(screen.queryByTestId('free-plan-training-notice')).toBeNull();
  });

  it('waits rather than guessing while the plan has not resolved', () => {
    useBillingStore.setState({
      user: ACCOUNT,
      subscription: null,
      initialized: false,
      isLoading: true,
      unauthenticated: false,
      error: null,
    });
    render(<FreePlanTrainingNotice />);

    expect(screen.queryByTestId('free-plan-training-notice')).toBeNull();
  });

  it('stays dismissed for the account that dismissed it', () => {
    signedInOn('free');
    const first = render(<FreePlanTrainingNotice />);

    fireEvent.click(screen.getByLabelText('Dismiss the free model data notice'));
    expect(screen.queryByTestId('free-plan-training-notice')).toBeNull();
    expect(window.localStorage.getItem(FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY)).toBe(ACCOUNT.id);

    first.unmount();
    render(<FreePlanTrainingNotice />);
    expect(screen.queryByTestId('free-plan-training-notice')).toBeNull();
  });

  it('is shown again to a different account on the same browser', () => {
    window.localStorage.setItem(FREE_PLAN_TRAINING_NOTICE_STORAGE_KEY, 'user_someone_else');
    signedInOn('free');
    render(<FreePlanTrainingNotice />);

    expect(screen.getByTestId('free-plan-training-notice')).toBeTruthy();
  });

  it('still shows when storage cannot be read', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage is blocked');
    });
    try {
      signedInOn('free');
      render(<FreePlanTrainingNotice />);
      expect(screen.getByTestId('free-plan-training-notice')).toBeTruthy();
    } finally {
      getItem.mockRestore();
    }
  });

  it('dismisses without throwing when storage refuses the write', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage is full');
    });
    try {
      signedInOn('free');
      render(<FreePlanTrainingNotice />);
      fireEvent.click(screen.getByLabelText('Dismiss the free model data notice'));
      expect(screen.queryByTestId('free-plan-training-notice')).toBeNull();
    } finally {
      setItem.mockRestore();
    }
  });
});

describe('where the notice is mounted', () => {
  it('is rendered by the chat page on both the empty and the active transcript', () => {
    const page = readFileSync(
      join(resolve(__dirname, '../../..'), 'chat/pages/WebChatPage.tsx'),
      'utf8',
    );
    expect(page.match(/<FreePlanTrainingNotice\s*\/>/g)).toHaveLength(2);
  });
});
