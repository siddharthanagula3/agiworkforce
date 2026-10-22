import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReflectSection } from './ReflectSection';
import { SettingsSectionNavigationProvider } from '../components/SettingsSectionLink';
import { WEB_SETTINGS_NAV_GROUPS } from '../components/web-settings-navigation';

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
      href: '/chat/projects',
    },
  ],
  sampled: false,
  sampledConversationCount: 3,
};

const memoryRequired = {
  error: {
    code: 'memory_required',
    message: 'Turn on Memory and Save memories from chats to view Reflect.',
  },
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
    const onNavigate = vi.fn();
    vi.mocked(fetch).mockImplementation(() => response(memoryRequired, 409));
    render(
      <SettingsSectionNavigationProvider onNavigate={onNavigate}>
        <ReflectSection />
      </SettingsSectionNavigationProvider>,
    );

    expect(await screen.findByText('Memory is off')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Personalization settings' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('personalization');
    expect(screen.queryByText('Writing led your past 30 days')).toBeNull();
  });

  it('sends the memory-required setup link to the settings tab its label names', async () => {
    const onNavigate = vi.fn();
    vi.mocked(fetch).mockImplementation(() => response(memoryRequired, 409));
    render(
      <SettingsSectionNavigationProvider onNavigate={onNavigate}>
        <ReflectSection />
      </SettingsSectionNavigationProvider>,
    );

    const setupLink = await screen.findByRole('button', { name: /^Open .+ settings$/ });
    fireEvent.click(setupLink);

    const section = onNavigate.mock.calls[0]?.[0] as string;
    const navItem = WEB_SETTINGS_NAV_GROUPS.flatMap((group) => group.items).find(
      (item) => item.key === section,
    );
    expect(navItem?.label).toBe('Personalization');
    expect(setupLink).toHaveAccessibleName(`Open ${navItem?.label} settings`);
    expect(screen.queryByText(/capabilities/i)).toBeNull();
  });

  it('links the memory-required state straight to the Personalization page outside the modal', async () => {
    vi.mocked(fetch).mockImplementation(() => response(memoryRequired, 409));
    render(<ReflectSection />);

    expect(
      await screen.findByRole('link', { name: 'Open Personalization settings' }),
    ).toHaveAttribute('href', '/settings/personalization');
  });

  it('leaves memory preferences untouched when the setup link is followed', async () => {
    const onNavigate = vi.fn();
    vi.mocked(fetch).mockImplementation(() => response(memoryRequired, 409));
    render(
      <SettingsSectionNavigationProvider onNavigate={onNavigate}>
        <ReflectSection />
      </SettingsSectionNavigationProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open Personalization settings' }));

    const requests = vi.mocked(fetch).mock.calls;
    expect(requests).toHaveLength(1);
    expect(String(requests[0]?.[0])).toContain('/api/reflect');
    expect(requests[0]?.[1]?.method ?? 'GET').toBe('GET');
  });
});

describe('ReflectSection activity chart accessibility', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => response(recap)),
    );
  });

  it('exposes the chart as one image and the daily figures as text', async () => {
    render(<ReflectSection />);

    const chart = await screen.findByRole('img', { name: /conversation activity across/i });
    expect(chart).toBeInTheDocument();

    // A bare div is role=generic, which prohibits aria-label: every bar used to
    // carry one and was dropped entirely by assistive tech.
    for (const bar of Array.from(chart.querySelectorAll('div'))) {
      expect(bar.getAttribute('aria-label')).toBeNull();
      expect(bar.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

describe('ReflectSection topic share bar', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        response({
          ...recap,
          topics: [
            {
              id: 'coding',
              label: 'Coding',
              description: 'Writing and reviewing code.',
              conversationCount: 1,
              percentage: 20,
            },
            {
              id: 'writing',
              label: 'Writing',
              description: 'Drafting, editing, and summarization.',
              conversationCount: 3,
              percentage: 60,
            },
            {
              id: 'research',
              label: 'Research',
              description: 'Finding and comparing sources.',
              conversationCount: 1,
              percentage: 20,
            },
          ],
        }),
      ),
    );
  });

  it('draws one stacked bar sized by share, largest first, with a matching legend', async () => {
    render(<ReflectSection />);

    const bar = await screen.findByRole('img', { name: /share of conversations by topic/i });
    expect(bar).toHaveAccessibleName(
      'Share of conversations by topic: Writing 60%, Coding 20%, Research 20%',
    );
    const segments = Array.from(bar.querySelectorAll('[data-reflect-topic-segment]'));
    expect(segments.map((segment) => segment.getAttribute('data-reflect-topic-segment'))).toEqual([
      'writing',
      'coding',
      'research',
    ]);
    expect(segments.map((segment) => (segment as HTMLElement).style.flexGrow)).toEqual([
      '60',
      '20',
      '20',
    ]);

    const legend = screen.getByRole('list', { name: 'Topics by share' });
    const rows = within(legend).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('h3')?.textContent)).toEqual([
      'Writing',
      'Coding',
      'Research',
    ]);
    expect(within(rows[0]!).getByText('60%')).toBeVisible();
    expect(rows[0]!.querySelector('[aria-hidden="true"]')?.className).toContain('bg-foreground');
  });
});
