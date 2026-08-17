import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ContentReportQueuePanel from './ContentReportQueuePanel';

const mocks = vi.hoisted(() => ({ getToken: vi.fn(), fetch: vi.fn() }));

vi.mock('@clerk/nextjs', () => ({ useAuth: () => ({ getToken: mocks.getToken }) }));

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: async () => 'csrf-token' }));

const OVERDUE_REPORT = {
  id: '11111111-1111-4111-8111-111111111111',
  clientReportId: 'rep-open',
  userId: 'user-reporter',
  messageId: 'msg-1',
  conversationId: 'conv-1',
  category: 'harmful',
  contentExcerpt: 'the answer explained how to hurt someone',
  userNote: 'this should never be answerable',
  status: 'received' as const,
  reviewerId: null,
  reviewerNote: null,
  reviewedAt: null,
  createdAt: '2026-08-10T00:00:00.000Z',
  dueAt: '2026-08-11T00:00:00.000Z',
  overdue: true,
};

const COUNTS = {
  received: 1,
  in_review: 0,
  actioned: 0,
  dismissed: 0,
  oldestOpenAt: OVERDUE_REPORT.createdAt,
  overdue: 1,
  slaHours: 24,
};

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

describe('ContentReportQueuePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue('session-token');
    mocks.fetch.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? jsonResponse({ report: { ...OVERDUE_REPORT, status: 'actioned', overdue: false } })
        : jsonResponse({ reports: [OVERDUE_REPORT], counts: COUNTS }),
    );
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('shows the operator a waiting report and that it is past the review SLA', async () => {
    render(<ContentReportQueuePanel />);

    expect(await screen.findByText(/explained how to hurt someone/)).toBeInTheDocument();
    expect(screen.getByText(/Past SLA · due/)).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/admin/content-reports?status=received%2Cin_review',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('sends the reviewer disposition to the moderation endpoint', async () => {
    render(<ContentReportQueuePanel />);
    await screen.findByText(/explained how to hurt someone/);

    fireEvent.change(screen.getByLabelText(/Reviewer decision note/), {
      target: { value: 'answer removed, guardrail filed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Actioned' }));

    await waitFor(() => {
      const call = mocks.fetch.mock.calls.find(([, init]) => init?.method === 'POST');
      expect(call).toBeDefined();
      expect(call?.[0]).toBe('/api/admin/content-reports');
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({
        reportId: OVERDUE_REPORT.id,
        status: 'actioned',
        reviewerNote: 'answer removed, guardrail filed',
      });
    });

    expect(await screen.findByText(/marked actioned/)).toBeInTheDocument();
  });

  it('refuses to resolve a report with no reviewer note', async () => {
    render(<ContentReportQueuePanel />);
    await screen.findByText(/explained how to hurt someone/);

    fireEvent.click(screen.getByRole('button', { name: 'Dismissed' }));

    await screen.findByText(/reviewer note is required/i);
    expect(mocks.fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });
});
