import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { mcp } from '@agiworkforce/desktop-command-client';
import { McpElicitationPrompt, toRenderablePrompt } from '../McpElicitationPrompt';
import { CloudElicitationBridge } from '@/runtime/cloudToolInput';

type PendingPrompt = mcp.McpElicitationPrompt;
type McpElicitationResolved = mcp.McpElicitationResolved;

function formPrompt(overrides: Partial<PendingPrompt> = {}): PendingPrompt {
  return {
    id: 'elicit-1',
    serverName: 'github',
    message: 'Which repository should I use?',
    mode: 'form',
    requestedSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', title: 'Repository', minLength: 3 },
        private: { type: 'boolean', title: 'Private' },
      },
      required: ['repo'],
    },
    urlHostIsPunycode: false,
    expiresAtMs: Date.now() + 60_000,
    ...overrides,
  };
}

function urlPrompt(overrides: Partial<PendingPrompt> = {}): PendingPrompt {
  return {
    id: 'elicit-2',
    serverName: 'payments',
    message: 'Add your card on the provider site.',
    mode: 'url',
    requestedSchema: { type: 'object' },
    url: 'https://pay.example.com/connect?id=2',
    urlHost: 'pay.example.com',
    urlHostIsPunycode: false,
    expiresAtMs: Date.now() + 60_000,
    ...overrides,
  };
}

function harness(pending: PendingPrompt[]) {
  const respond = vi.fn().mockResolvedValue(undefined);
  const openUrl = vi.fn().mockResolvedValue(undefined);
  let push: ((prompt: PendingPrompt) => void) | null = null;
  let resolve: ((resolved: McpElicitationResolved) => void) | null = null;
  const props = {
    isTauriHost: true,
    fetcher: vi.fn().mockResolvedValue(pending),
    subscribe: vi.fn(async (handler: (prompt: PendingPrompt) => void) => {
      push = handler;
      return () => undefined;
    }),
    subscribeResolved: vi.fn(async (handler: (resolved: McpElicitationResolved) => void) => {
      resolve = handler;
      return () => undefined;
    }),
    respond,
    openUrl,
  };
  return {
    props,
    respond,
    openUrl,
    push: (prompt: PendingPrompt) => push?.(prompt),
    resolve: (resolved: McpElicitationResolved) => resolve?.(resolved),
  };
}

describe('McpElicitationPrompt', () => {
  it('renders nothing outside the Tauri host', () => {
    const { props } = harness([formPrompt()]);
    const { container } = render(<McpElicitationPrompt {...props} isTauriHost={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(props.fetcher).not.toHaveBeenCalled();
  });

  it('names the asking server and sends a validated form answer', async () => {
    const user = userEvent.setup();
    const { props, respond } = harness([formPrompt()]);
    render(<McpElicitationPrompt {...props} />);

    expect(await screen.findByText('github needs your input')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Repository is required.')).toBeInTheDocument();
    expect(respond).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Repository/), 'agi/workforce');
    await user.click(screen.getByLabelText('Private'));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(respond).toHaveBeenCalledWith({
        id: 'elicit-1',
        action: 'accept',
        content: { repo: 'agi/workforce', private: true },
      }),
    );
  });

  it('sends decline and cancel as distinct answers', async () => {
    const user = userEvent.setup();
    const { props, respond } = harness([formPrompt(), formPrompt({ id: 'elicit-3' })]);
    render(<McpElicitationPrompt {...props} />);

    await user.click(await screen.findByRole('button', { name: 'Decline' }));
    await waitFor(() =>
      expect(respond).toHaveBeenCalledWith({ id: 'elicit-1', action: 'decline' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(respond).toHaveBeenCalledWith({ id: 'elicit-3', action: 'cancel' }));
  });

  it('requires the link to be opened through the app before continuing', async () => {
    const user = userEvent.setup();
    const { props, respond, openUrl } = harness([urlPrompt()]);
    render(<McpElicitationPrompt {...props} />);

    expect(await screen.findByText('https://pay.example.com/connect?id=2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Open the link first, then continue.')).toBeInTheDocument();
    expect(respond).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Open pay\.example\.com/ }));
    expect(openUrl).toHaveBeenCalledWith('elicit-2');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(respond).toHaveBeenCalledWith({ id: 'elicit-2', action: 'accept' }));
  });

  it('warns about a look-alike host', async () => {
    const { props } = harness([urlPrompt({ urlHostIsPunycode: true })]);
    render(<McpElicitationPrompt {...props} />);
    expect(await screen.findByText(/look-alike characters/)).toBeInTheDocument();
  });

  it('closes a prompt the server resolved or timed out', async () => {
    const view = harness([]);
    render(<McpElicitationPrompt {...view.props} />);
    await waitFor(() => expect(view.props.subscribeResolved).toHaveBeenCalled());

    act(() => view.push(formPrompt()));
    expect(await screen.findByText('github needs your input')).toBeInTheDocument();
    act(() => view.resolve({ id: 'elicit-1', serverName: 'github', outcome: 'timed_out' }));
    await waitFor(() =>
      expect(screen.queryByText('github needs your input')).not.toBeInTheDocument(),
    );
  });

  it('declines a schema the shared contract cannot render', async () => {
    const nested = formPrompt({
      requestedSchema: {
        type: 'object',
        properties: { address: { type: 'object', properties: {} } },
      },
    });
    expect(toRenderablePrompt(nested)).toBeNull();
    const { props, respond } = harness([nested]);
    render(<McpElicitationPrompt {...props} />);
    await waitFor(() =>
      expect(respond).toHaveBeenCalledWith({ id: 'elicit-1', action: 'decline' }),
    );
  });

  it('answers a Managed Cloud input request through the same card', async () => {
    const user = userEvent.setup();
    const { props } = harness([]);
    const bridge = new CloudElicitationBridge();
    const resume = vi.fn().mockResolvedValue(undefined);
    const openExternal = vi.fn().mockResolvedValue(undefined);
    bridge.publish(
      'conv',
      [
        {
          toolCallId: 'tc_cloud',
          name: 'linear',
          prompts: [
            {
              key: 'auth',
              mode: 'url',
              message: 'Connect your workspace.',
              url: 'https://xn--lnear-6qa.example/connect',
              host: 'xn--lnear-6qa.example',
            },
          ],
        },
      ],
      resume,
    );
    render(<McpElicitationPrompt {...props} cloudBridge={bridge} openExternal={openExternal} />);

    expect(await screen.findByText('linear needs your input')).toBeInTheDocument();
    expect(screen.getByText(/look-alike characters/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Open xn--lnear-6qa\.example/ }));
    expect(openExternal).toHaveBeenCalledWith('https://xn--lnear-6qa.example/connect');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(resume).toHaveBeenCalledWith('tc_cloud', { auth: { action: 'accept' } }),
    );
    await waitFor(() =>
      expect(screen.queryByText('linear needs your input')).not.toBeInTheDocument(),
    );
  });
});
