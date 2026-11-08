import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SlackChannelPolicies } from './SlackChannelPolicies';
import { createSlackSettingsView } from '../lib/slack-settings-owner';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<MockedModule0>()),
  getCsrfToken: vi.fn(async () => 'csrf'),
}));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const channel = (channelId = 'C111', mode: 'off' | 'task' = 'task') => ({
  channelId,
  mode,
  tools: null,
  seen: true,
  updatedAt: null,
});
const policies = (channels = [channel()], teamId = 'T123') => ({ teamId, channels });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function owner() {
  let current = true;
  const view = createSlackSettingsView(
    {
      userId: 'a',
      sessionId: 'session-a',
      isCurrent: () => current,
      getToken: async () => 'token-a',
    },
    () => current,
    null,
  );
  view.activate();
  return {
    view,
    retireSilently: () => {
      current = false;
    },
  };
}
const fetchMock = vi.fn<typeof fetch>();
const writes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async () => json(policies()));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Slack channel editor lifetime', () => {
  it('preserves failed submission text and blocks blind retries after dispatch', async () => {
    fetchMock.mockImplementation(async (_url, init) =>
      init?.method === 'PUT'
        ? json({ error: { message: 'audit failed' } }, 500)
        : json(policies([])),
    );
    const { view } = owner();
    render(
      <SlackChannelPolicies
        view={view}
        installationId="one"
        expectedTeamId="T123"
        teamName="Acme"
      />,
    );
    const input = await screen.findByLabelText('Turn it off in another channel');
    await screen.findByText(/No channels yet/);
    fireEvent.change(input, { target: { value: 'C222' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    await screen.findByText(/result could not be confirmed/);
    expect(input).toHaveValue('C222');
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeDisabled();
    expect(writes()).toHaveLength(1);
  });

  it('does not clear a newer draft when an earlier submission succeeds', async () => {
    const pending = deferred<Response>();
    fetchMock.mockImplementation(async (_url, init) =>
      init?.method === 'PUT' ? pending.promise : json(policies([])),
    );
    const { view } = owner();
    render(
      <SlackChannelPolicies
        view={view}
        installationId="one"
        expectedTeamId="T123"
        teamName="Acme"
      />,
    );
    await screen.findByText(/No channels yet/);
    const input = screen.getByLabelText('Turn it off in another channel');
    fireEvent.change(input, { target: { value: 'C222' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    fireEvent.change(input, { target: { value: 'C333' } });
    await act(async () => {
      pending.resolve(json(policies([channel('C222', 'off')])));
    });
    expect(await screen.findByRole('combobox', { name: 'What AGI may do in C222' })).toHaveValue(
      'off',
    );
    expect(input).toHaveValue('C333');
  });

  it('clears only an unchanged draft on successful submission', async () => {
    fetchMock.mockImplementation(async (_url, init) =>
      json(policies(init?.method === 'PUT' ? [channel('C222', 'off')] : [])),
    );
    const { view } = owner();
    render(
      <SlackChannelPolicies
        view={view}
        installationId="one"
        expectedTeamId="T123"
        teamName="Acme"
      />,
    );
    await screen.findByText(/No channels yet/);
    const input = screen.getByLabelText('Turn it off in another channel');
    fireEvent.change(input, { target: { value: 'C222' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it.each(['team', 'mode', 'duplicate', 'tools'])(
    'rejects a mismatched %s receipt',
    async (mismatch) => {
      const result =
        mismatch === 'team'
          ? policies([channel('C111', 'off')], 'T999')
          : mismatch === 'mode' || mismatch === 'tools'
            ? policies([channel()])
            : policies([channel('C111', 'off'), channel()]);
      fetchMock.mockImplementation(async (_url, init) =>
        json(init?.method === 'PUT' ? result : policies()),
      );
      const { view } = owner();
      render(
        <SlackChannelPolicies
          view={view}
          installationId="one"
          expectedTeamId="T123"
          teamName="Acme"
        />,
      );
      if (mismatch === 'tools')
        fireEvent.click(await screen.findByRole('checkbox', { name: 'Run code' }));
      else fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'off' } });
      await screen.findByText(/result could not be confirmed/);
      expect(view.uncertain()).toBe(true);
      expect(screen.getByRole('combobox')).toHaveValue('task');
    },
  );

  it('accepts a successful default-mode receipt when the channel row disappears', async () => {
    fetchMock.mockImplementation(async (_url, init) =>
      json(policies(init?.method === 'PUT' ? [] : [channel()])),
    );
    const { view } = owner();
    render(
      <SlackChannelPolicies
        view={view}
        installationId="one"
        expectedTeamId="T123"
        teamName="Acme"
      />,
    );
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: '' } });
    await screen.findByText(/No channels yet/);
    expect(view.uncertain()).toBe(false);
    expect(writes()).toHaveLength(1);
  });

  it('does not publish a previous installation GET body into replacement', async () => {
    const body = deferred<unknown>();
    fetchMock.mockImplementation(async (url) =>
      String(url).includes('/one/')
        ? ({ ok: true, json: () => body.promise } as Response)
        : json(policies([channel('C222')], 'T456')),
    );
    const { view } = owner();
    const { rerender } = render(
      <SlackChannelPolicies
        view={view}
        installationId="one"
        expectedTeamId="T123"
        teamName="Acme"
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText('Turn it off in another channel')).not.toBeInTheDocument();
    rerender(
      <SlackChannelPolicies
        view={view}
        installationId="two"
        expectedTeamId="T456"
        teamName="Beta"
      />,
    );
    await screen.findByRole('combobox', { name: 'What AGI may do in C222' });
    await act(async () => {
      body.resolve(policies());
    });
    expect(
      screen.queryByRole('combobox', { name: 'What AGI may do in C111' }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Turn it off in another channel')).toHaveValue('');
  });

  it('clears an editable installation draft when the installation changes', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes('/one/') ? json(policies()) : json(policies([channel('C222')], 'T456')),
    );
    const { view } = owner();
    const { rerender } = render(
      <SlackChannelPolicies
        view={view}
        installationId="one"
        expectedTeamId="T123"
        teamName="Acme"
      />,
    );
    fireEvent.change(await screen.findByLabelText('Turn it off in another channel'), {
      target: { value: 'C999' },
    });
    expect(screen.getByLabelText('Turn it off in another channel')).toHaveValue('C999');
    rerender(
      <SlackChannelPolicies
        view={view}
        installationId="two"
        expectedTeamId="T456"
        teamName="Beta"
      />,
    );
    await screen.findByRole('combobox', { name: 'What AGI may do in C222' });
    expect(screen.getByLabelText('Turn it off in another channel')).toHaveValue('');
    expect(writes()).toHaveLength(0);
  });

  it('latches shared uncertainty when a dispatched installation mutation loses its target', async () => {
    const pending = deferred<Response>();
    fetchMock.mockImplementation(async (_url, init) =>
      init?.method === 'PUT' ? pending.promise : json(policies()),
    );
    const { view } = owner();
    const { rerender } = render(
      <SlackChannelPolicies
        view={view}
        installationId="one"
        expectedTeamId="T123"
        teamName="Acme"
      />,
    );
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'off' } });
    await waitFor(() => expect(writes()).toHaveLength(1));
    rerender(
      <SlackChannelPolicies
        view={view}
        installationId="two"
        expectedTeamId="T123"
        teamName="Beta"
      />,
    );
    await act(async () => {
      pending.resolve(json(policies([channel('C111', 'off')])));
    });
    expect(view.uncertain()).toBe(true);
    expect(await screen.findByRole('combobox')).toBeDisabled();
  });

  it('shares admission across sibling installations and releases only the matching operation', async () => {
    const pending = deferred<Response>();
    fetchMock.mockImplementation(async (_url, init) =>
      init?.method === 'PUT' ? pending.promise : json(policies()),
    );
    const { view } = owner();
    render(
      <>
        <SlackChannelPolicies
          view={view}
          installationId="one"
          expectedTeamId="T123"
          teamName="Acme"
        />
        <SlackChannelPolicies
          view={view}
          installationId="two"
          expectedTeamId="T123"
          teamName="Beta"
        />
      </>,
    );
    const first = await within(screen.getByRole('region', { name: 'Channels in Acme' })).findByRole(
      'combobox',
    );
    const second = await within(
      screen.getByRole('region', { name: 'Channels in Beta' }),
    ).findByRole('combobox');
    fireEvent.change(first, { target: { value: 'off' } });
    expect(second).toBeDisabled();
    await waitFor(() => expect(writes()).toHaveLength(1));
    await act(async () => {
      pending.resolve(json(policies([channel('C111', 'off')])));
    });
    expect(second).not.toBeDisabled();
  });

  it('removes a retired draft and controls when an editor event observes silent session retirement', async () => {
    const { view, retireSilently } = owner();
    render(
      <SlackChannelPolicies
        view={view}
        installationId="one"
        expectedTeamId="T123"
        teamName="Acme"
      />,
    );
    await screen.findByRole('combobox');
    const input = screen.getByLabelText('Turn it off in another channel');
    fireEvent.change(input, { target: { value: 'C222' } });
    retireSilently();
    fireEvent.change(input, { target: { value: 'C333' } });
    expect(screen.queryByLabelText('Turn it off in another channel')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(writes()).toHaveLength(0);
  });
});

type MockedModule0 = typeof import('@/lib/client/csrf');
