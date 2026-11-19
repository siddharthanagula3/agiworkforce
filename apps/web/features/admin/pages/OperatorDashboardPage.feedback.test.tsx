import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  addCsrfHeaders: () => ({}),
}));

import { OperatorDashboardPage } from './OperatorDashboardPage';

const FEEDBACK = [
  {
    id: 'feedback-1',
    userId: 'user-1',
    email: 'reporter@example.com',
    subject: 'AGI Work task · Web chat',
    message: 'This used the wrong source.',
    createdAt: '2026-11-08T10:00:00.000Z',
    pagePath: '/chat/conversation-2',
    screenshotKey: null,
    context: {
      source: 'web',
      feedback_context: 'task_feedback',
      run_id: 'run-9',
      message_id: 'message-4',
      conversation_id: 'conversation-2',
    },
  },
  {
    id: 'feedback-2',
    userId: null,
    email: null,
    subject: 'General feedback',
    message: 'Nice.',
    createdAt: '2026-11-08T11:00:00.000Z',
    pagePath: null,
    screenshotKey: null,
    context: {},
  },
];

beforeEach(() => {
  window.history.replaceState(null, '', '/operator#feedback');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ feedback: FEEDBACK }),
        }) as unknown as Response,
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/operator');
});

describe('operator feedback tab', () => {
  it('shows the run and message a report names beside its note', async () => {
    render(<OperatorDashboardPage />);

    const card = (await screen.findByText('This used the wrong source.')).closest(
      'li',
    ) as HTMLElement;
    const context = within(card).getByLabelText('Reporter-supplied context');
    expect(context.textContent).toContain('Run');
    expect(context.textContent).toContain('run-9');
    expect(context.textContent).toContain('message-4');
    expect(context.textContent).toContain('conversation-2');
  });

  it('shows no context block for a report that carried none', async () => {
    render(<OperatorDashboardPage />);

    const card = (await screen.findByText('Nice.')).closest('li') as HTMLElement;
    expect(within(card).queryByLabelText('Reporter-supplied context')).toBeNull();
  });
});

type ImportedModule0 = typeof import('@/lib/client/csrf');
