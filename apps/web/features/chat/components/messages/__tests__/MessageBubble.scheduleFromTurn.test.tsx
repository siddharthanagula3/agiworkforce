import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
type ScanModule0 = typeof import('@agiworkforce/unified-chat');

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: vi.fn(async (base?: Record<string, string>) => base ?? {}),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ...actual,
    MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
  };
});

import { ScheduleFromTurnProvider } from '@/features/schedules/components/schedule-from-turn';
import { MessageBubble } from '../MessageBubble';

function answer(isStreaming = false) {
  return {
    id: 'msg-1',
    role: 'assistant' as const,
    content: 'Here is the finished weekly report, formatted the way you asked.',
    timestamp: new Date('2026-09-07T22:43:00.000Z'),
    sessionId: 'conv-1',
    isStreaming,
  };
}

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'More message actions' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

describe('Run this on a schedule in the message menu', () => {
  it('hands the finished answer to the schedule flow', async () => {
    const schedule = vi.fn();
    render(
      <ScheduleFromTurnProvider value={{ schedule }}>
        <MessageBubble message={answer()} onRegenerate={vi.fn()} />
      </ScheduleFromTurnProvider>,
    );

    await openMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Run this on a schedule' }));

    expect(schedule).toHaveBeenCalledWith('msg-1');
  });

  it('is absent where the account cannot schedule and while the answer streams', async () => {
    const { unmount } = render(<MessageBubble message={answer()} onRegenerate={vi.fn()} />);
    await openMenu();
    expect(screen.queryByRole('menuitem', { name: 'Run this on a schedule' })).toBeNull();
    unmount();

    render(
      <ScheduleFromTurnProvider value={{ schedule: vi.fn() }}>
        <MessageBubble message={answer(true)} onRegenerate={vi.fn()} />
      </ScheduleFromTurnProvider>,
    );
    const more = screen.queryByRole('button', { name: 'More message actions' });
    if (more) await userEvent.click(more);
    expect(screen.queryByRole('menuitem', { name: 'Run this on a schedule' })).toBeNull();
  });
});
