import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReflectSection } from './ReflectSection';

const recap = {
  range: '30d',
  generatedAt: '2026-07-18T18:00:00.000Z',
  period: {
    start: '2026-06-18T18:00:00.000Z',
    end: '2026-07-18T18:00:00.000Z',
    label: 'Past 30 days',
  },
  summary: {
    headline: 'Writing led your past 30 days',
    body: 'You started 3 conversations across 2 active days.',
  },
  stats: { totalConversations: 3, activeDays: 2, mostActiveDay: '2026-07-10', peakHour: 15 },
  dailyActivity: [
    { date: '2026-07-10', conversationCount: 2 },
    { date: '2026-07-12', conversationCount: 1 },
  ],
  topics: [
    {
      id: 'writing',
      label: 'Writing',
      description: 'Drafting, editing, and summarization.',
      conversationCount: 2,
      percentage: 66.7,
    },
  ],
  insights: [
    {
      dimension: 'delegation',
      title: 'What you handed off',
      observation: 'Writing appeared in 2 conversations.',
      nextStep: 'Choose what to keep.',
      href: '/projects',
    },
  ],
  sampled: false,
  sampledConversationCount: 3,
};

function response(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('ReflectSection', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => response(recap)),
    );
  });

  it('renders real account activity, proportions, and a Time and focus path', async () => {
    render(<ReflectSection />);

    expect(await screen.findByText('Writing led your past 30 days')).toBeInTheDocument();
    expect(
      screen.getByText('3', { selector: '[data-reflect-stat="conversations"]' }),
    ).toBeVisible();
    expect(screen.getByText('66.7%')).toBeVisible();
    expect(screen.getByText('What you handed off')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Set quiet hours and breaks' })).toHaveAttribute(
      'href',
      '/settings/time-focus',
    );
  });

  it('refetches a validated range and supports an explicit refresh', async () => {
    render(<ReflectSection />);
    await screen.findByText('Writing led your past 30 days');

    fireEvent.change(screen.getByRole('combobox', { name: 'Reflect range' }), {
      target: { value: '90d' },
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toContain('range=90d');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh recap' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  });

  it('shows a real memory-required state instead of an empty fabricated recap', async () => {
    vi.mocked(fetch).mockImplementation(() =>
      response(
        {
          error: {
            code: 'memory_required',
            message: 'Turn on Memory and Generate from past chats to view Reflect.',
          },
        },
        409,
      ),
    );
    render(<ReflectSection />);

    expect(await screen.findByText('Memory is off')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Capabilities settings' })).toHaveAttribute(
      'href',
      '/settings/capabilities',
    );
    expect(screen.queryByText('Writing led your past 30 days')).toBeNull();
  });
});
