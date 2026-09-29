import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalDeveloperSession } from '@agiworkforce/local-runtime-contract';
import { IME_PROCESSING_KEY_CODE } from '@agiworkforce/unified-chat/ime-composition';

const host = vi.hoisted(() => ({
  readDeveloperSession: vi.fn(),
  startDeveloperTurn: vi.fn(),
}));

vi.mock('@/features/desktop-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/desktop-host')>()),
  readDeveloperSession: host.readDeveloperSession,
  startDeveloperTurn: host.startDeveloperTurn,
  onDeveloperSessionEvent: () => () => undefined,
}));

import { LOCAL_CODE_COPY } from '../local-code';
import { LocalSessionPanel } from './LocalSessionPanel';

const session: LocalDeveloperSession = {
  id: 'thread-1',
  rootId: 'root-1',
  title: 'Quote the readme',
  cwd: '/work/qa-project',
  model: 'qa-provider/qa-model',
  provider: 'qa-provider',
  trustMode: 'byok',
  status: 'idle',
  createdAt: '2026-09-14T11:00:00Z',
  updatedAt: '2026-09-14T11:05:00Z',
  origin: 'desktop',
};

async function composer(): Promise<HTMLElement> {
  render(
    <LocalSessionPanel
      session={session}
      group={{ name: 'qa-project', branch: 'main', sessions: [session] }}
      runtimeModels={null}
      verbose={false}
      onClose={() => undefined}
    />,
  );
  const field = await screen.findByRole('textbox', { name: LOCAL_CODE_COPY.composerPlaceholder });
  await waitFor(() => expect(host.readDeveloperSession).toHaveBeenCalled());
  await userEvent.setup().type(field, 'テストを実行して');
  return field;
}

beforeEach(() => {
  vi.clearAllMocks();
  host.readDeveloperSession.mockResolvedValue({ session, messages: [], truncated: false });
  host.startDeveloperTurn.mockResolvedValue({ turnId: 'turn-1' });
});

describe('the local session composer during input-method composition', () => {
  it('does not send on an Enter that reports isComposing', async () => {
    const field = await composer();

    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });

    expect(host.startDeveloperTurn).not.toHaveBeenCalled();
    expect(field).toHaveValue('テストを実行して');
  });

  it('does not send on an Enter that carries the IME processing keycode', async () => {
    const field = await composer();

    fireEvent.keyDown(field, { key: 'Enter', keyCode: IME_PROCESSING_KEY_CODE });

    expect(host.startDeveloperTurn).not.toHaveBeenCalled();
    expect(field).toHaveValue('テストを実行して');
  });

  it('sends once on the Enter that follows composition', async () => {
    const field = await composer();

    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
    fireEvent.compositionEnd(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => expect(host.startDeveloperTurn).toHaveBeenCalledTimes(1));
    expect(host.startDeveloperTurn).toHaveBeenCalledWith(
      expect.objectContaining({ rootId: 'root-1', threadId: 'thread-1', text: 'テストを実行して' }),
    );
  });
});
