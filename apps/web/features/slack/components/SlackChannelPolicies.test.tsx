import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/client/csrf')>()),
  getCsrfToken: vi.fn(async () => 'csrf'),
}));

import { SlackChannelPolicies } from './SlackChannelPolicies';
import { createSlackSettingsView } from '../lib/slack-settings-owner';

function renderPolicies(
  send: (path: string, init: { method: string; body?: unknown }) => Promise<Response>,
) {
  const view = createSlackSettingsView(
    { userId: 'a', sessionId: 'session-a', isCurrent: () => true, getToken: async () => 'token-a' },
    () => true,
    null,
  );
  view.activate();
  view.send = async (request, path, init) => {
    request.assertCurrent();
    const response = await send(path, init);
    request.assertCurrent();
    return response;
  };
  return render(
    <SlackChannelPolicies
      view={view}
      installationId={INSTALLATION}
      expectedTeamId="T123"
      teamName="Acme"
    />,
  );
}

const INSTALLATION = '0190a000-0000-7000-8000-0000000000b1';

function respond(channels: unknown[]) {
  return new Response(JSON.stringify({ teamId: 'T123', channels }), { status: 200 });
}

describe('SlackChannelPolicies', () => {
  it('lists channels seen and saves a mode for one', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(
        respond([{ channelId: 'C111', mode: null, tools: null, seen: true, updatedAt: null }]),
      )
      .mockResolvedValueOnce(
        respond([
          {
            channelId: 'C111',
            mode: 'answer',
            tools: null,
            seen: true,
            updatedAt: '2026-10-19T00:00:00Z',
          },
        ]),
      );
    renderPolicies(send);
    const select = await screen.findByRole('combobox', {
      name: 'What AGI may do in C111',
    });
    await userEvent.selectOptions(select, 'answer');
    await waitFor(() =>
      expect(send).toHaveBeenLastCalledWith(`/api/slack/installations/${INSTALLATION}/channels`, {
        method: 'PUT',
        body: { channelId: 'C111', mode: 'answer' },
      }),
    );
    expect(
      await screen.findByDisplayValue('Answers only, never starts a task'),
    ).toBeInTheDocument();
  });

  it('turns a typed channel off and refuses a value that is not a channel ID', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(respond([]))
      .mockResolvedValueOnce(
        respond([{ channelId: 'C222', mode: 'off', tools: null, seen: false, updatedAt: null }]),
      );
    renderPolicies(send);
    const input = await screen.findByLabelText('Turn it off in another channel');
    await userEvent.type(input, '#general');
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, 'c222');
    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    await waitFor(() =>
      expect(send).toHaveBeenLastCalledWith(expect.any(String), {
        method: 'PUT',
        body: { channelId: 'C222', mode: 'off' },
      }),
    );
  });

  it('shows no tool choices for a channel that is off or on the default', async () => {
    const send = vi.fn().mockResolvedValueOnce(
      respond([
        { channelId: 'C111', mode: null, tools: null, seen: true, updatedAt: null },
        { channelId: 'C222', mode: 'off', tools: null, seen: false, updatedAt: null },
      ]),
    );
    renderPolicies(send);
    await screen.findByRole('combobox', { name: 'What AGI may do in C111' });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('turns one tool off for a channel and keeps its mode', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(
        respond([
          {
            channelId: 'C111',
            mode: 'task',
            tools: null,
            seen: true,
            updatedAt: '2026-10-19T00:00:00Z',
          },
        ]),
      )
      .mockResolvedValueOnce(
        respond([
          {
            channelId: 'C111',
            mode: 'task',
            tools: ['web', 'apps'],
            seen: true,
            updatedAt: '2026-10-19T00:00:00Z',
          },
        ]),
      );
    renderPolicies(send);
    const code = await screen.findByRole('checkbox', { name: 'Run code' });
    expect(code).toBeChecked();
    await userEvent.click(code);
    await waitFor(() =>
      expect(send).toHaveBeenLastCalledWith(expect.any(String), {
        method: 'PUT',
        body: { channelId: 'C111', mode: 'task', tools: ['web', 'apps'] },
      }),
    );
    expect(await screen.findByRole('checkbox', { name: 'Run code' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Search and read the web' })).toBeChecked();
  });

  it('goes back to every tool when the last one is allowed again', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(
        respond([
          {
            channelId: 'C111',
            mode: 'answer',
            tools: ['web', 'code'],
            seen: true,
            updatedAt: null,
          },
        ]),
      )
      .mockResolvedValueOnce(
        respond([{ channelId: 'C111', mode: 'answer', tools: null, seen: true, updatedAt: null }]),
      );
    renderPolicies(send);
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Use connected apps and integrations' }),
    );
    await waitFor(() =>
      expect(send).toHaveBeenLastCalledWith(expect.any(String), {
        method: 'PUT',
        body: { channelId: 'C111', mode: 'answer', tools: null },
      }),
    );
  });
});
