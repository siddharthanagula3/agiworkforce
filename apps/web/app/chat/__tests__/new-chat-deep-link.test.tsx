import { describe, expect, it, vi } from 'vitest';

const { requestedPath } = vi.hoisted(() => ({ requestedPath: { value: null as string | null } }));

vi.mock('next/headers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/headers')>()),
  headers: async () =>
    new Headers(requestedPath.value === null ? {} : { 'x-agi-pathname': requestedPath.value }),
}));

import Page from '../page';
import { WebChatRoot } from '@/features/chat/components/WebChatRoot';

async function landingFor(path: string | null) {
  requestedPath.value = path;
  const element = (await Page()) as { type: unknown; props: { initialWorkMode?: string } };
  return { root: element.type, workMode: element.props.initialWorkMode };
}

describe('deep links into a new chat', () => {
  it('opens a new chat for /chat, with or without the proxy header', async () => {
    for (const path of ['/chat', null]) {
      expect(await landingFor(path)).toEqual({ root: WebChatRoot, workMode: undefined });
    }
  });

  it('opens a new chat already switched to Work for /agi-work and its query forms', async () => {
    for (const path of ['/agi-work', '/agi-work?starterPrompt=plan']) {
      expect(await landingFor(path)).toEqual({ root: WebChatRoot, workMode: 'agiwork' });
    }
  });

  it('does not treat a path that only starts with the same letters as Work', async () => {
    expect((await landingFor('/agi-workshop')).workMode).toBeUndefined();
  });
});
