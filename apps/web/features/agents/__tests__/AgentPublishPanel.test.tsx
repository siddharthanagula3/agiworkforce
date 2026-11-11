import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { AgentPublishPanel } from '../components/AgentPublishPanel';
import { fakeApi, managedAgent } from './agent-test-api';

beforeEach(() => {
  toast.error.mockReset();
  toast.success.mockReset();
});

function renderPanel(api: ReturnType<typeof fakeApi>, onAgentChange = vi.fn()) {
  render(
    <AgentPublishPanel
      api={api}
      agent={managedAgent()}
      dirty={false}
      onAgentChange={onAgentChange}
      onVisibilityChange={vi.fn()}
      onRestored={vi.fn()}
    />,
  );
  return onAgentChange;
}

describe('AgentPublishPanel', () => {
  it('reports a published version separately from a failed history refresh', async () => {
    const versions = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('offline'));
    const onAgentChange = renderPanel(fakeApi({ versions }));
    await userEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Published version 1.'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error.mock.calls[0]?.[0]).not.toMatch(/could not be published/i);
    expect(onAgentChange).toHaveBeenCalledTimes(1);
  });

  it('reports a failed publication as not published', async () => {
    const publish = vi.fn(async () => {
      throw new Error('offline');
    });
    renderPanel(fakeApi({ publish }));
    await userEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
