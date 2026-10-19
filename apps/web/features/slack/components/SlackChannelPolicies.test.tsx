import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@features/auth/step-up-fetch', () => ({ sendAuthorizedJson: vi.fn() }));

import { SlackChannelPolicies } from './SlackChannelPolicies';

const INSTALLATION = '0190a000-0000-7000-8000-0000000000b1';

function respond(channels: unknown[]) {
  return new Response(JSON.stringify({ teamId: 'T123', channels }), { status: 200 });
}

describe('SlackChannelPolicies', () => {
  it('lists channels seen and saves a mode for one', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(
        respond([{ channelId: 'C111', mode: null, seen: true, updatedAt: null }]),
      )
      .mockResolvedValueOnce(
        respond([
          { channelId: 'C111', mode: 'answer', seen: true, updatedAt: '2026-10-19T00:00:00Z' },
        ]),
      );
    render(<SlackChannelPolicies installationId={INSTALLATION} teamName="Acme" send={send} />);
    const select = await screen.findByRole('combobox', {
      name: 'What AGI Workforce may do in C111',
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
        respond([{ channelId: 'C222', mode: 'off', seen: false, updatedAt: null }]),
      );
    render(<SlackChannelPolicies installationId={INSTALLATION} teamName="Acme" send={send} />);
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
});
