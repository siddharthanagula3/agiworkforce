import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@features/skills/services/skills-catalog', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
  loadSkillsCatalog: vi.fn(async () => []),
  skillAuthoringCapability: () => true,
}));
vi.mock('@shared/events/skill-catalog-events', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  announceSkillCatalogChanged: vi.fn(),
}));
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  getCsrfToken: vi.fn(async () => 'csrf'),
}));

import { useSkillsSettingsAdapter } from '../useSkillsSettingsAdapter';

type Deferred = {
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
};

const pending = new Map<string, Deferred>();

function bodyResponse(body: string): Response {
  return new Response(JSON.stringify({ body }), { status: 200 });
}

const authedHeaders = async (base: Record<string, string> = {}) => base;

async function renderAdapter() {
  const rendered = renderHook(() =>
    useSkillsSettingsAdapter({ open: true, activeSection: 'skills', authedHeaders }),
  );
  await flush();
  return rendered;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  pending.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.startsWith('/api/skills/'))
        return Promise.resolve(new Response('{}', { status: 404 }));
      return new Promise<Response>((resolve, reject) => {
        pending.set(decodeURIComponent(url.slice('/api/skills/'.length)), { resolve, reject });
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('opening a skill editor while an earlier body read is still pending', () => {
  it('ignores the retired skill’s body and keeps the current skill’s own', async () => {
    const { result } = await renderAdapter();

    act(() => result.current.directorySkillActions.onEditSkill?.('alpha'));
    await flush();
    act(() => result.current.skillEditorProps.onOpenChange(false));
    act(() => result.current.directorySkillActions.onEditSkill?.('beta'));
    await flush();

    await act(async () => {
      pending.get('beta')?.resolve(bodyResponse('beta instructions'));
    });
    await flush();
    expect(result.current.skillEditorProps.initialSkill?.body).toBe('beta instructions');
    expect(result.current.skillEditorProps.bodyLoading).toBe(false);

    await act(async () => {
      pending.get('alpha')?.resolve(bodyResponse('alpha instructions'));
    });
    await flush();

    expect(result.current.skillEditorProps.initialSkill?.name).toBe('beta');
    expect(result.current.skillEditorProps.initialSkill?.body).toBe('beta instructions');
  });

  it('keeps the current editor loading when the retired read finishes first', async () => {
    const { result } = await renderAdapter();

    act(() => result.current.directorySkillActions.onEditSkill?.('alpha'));
    await flush();
    act(() => result.current.skillEditorProps.onOpenChange(false));
    act(() => result.current.directorySkillActions.onEditSkill?.('beta'));
    await flush();

    await act(async () => {
      pending.get('alpha')?.resolve(bodyResponse('alpha instructions'));
    });
    await flush();

    expect(result.current.skillEditorProps.bodyLoading).toBe(true);
    expect(result.current.skillEditorProps.initialSkill?.body).toBe('');
  });

  it('does not attach a retired read’s failure to the current editor', async () => {
    const { result } = await renderAdapter();

    act(() => result.current.directorySkillActions.onEditSkill?.('alpha'));
    await flush();
    act(() => result.current.skillEditorProps.onOpenChange(false));
    act(() => result.current.directorySkillActions.onEditSkill?.('beta'));
    await flush();

    await act(async () => {
      pending.get('alpha')?.reject(new Error('network down'));
    });
    await flush();

    expect(result.current.skillEditorProps.bodyError).toBeNull();
    expect(result.current.skillEditorProps.bodyLoading).toBe(true);
  });

  it('ignores a body that arrives after the editor was closed', async () => {
    const { result } = await renderAdapter();

    act(() => result.current.directorySkillActions.onEditSkill?.('alpha'));
    await flush();
    act(() => result.current.skillEditorProps.onOpenChange(false));

    await act(async () => {
      pending.get('alpha')?.resolve(bodyResponse('alpha instructions'));
    });
    await flush();
    act(() => result.current.directorySkillActions.onCreateSkill?.());

    expect(result.current.skillEditorProps.initialSkill).toBeNull();
    expect(result.current.skillEditorProps.bodyLoading).toBe(false);
  });
});

type ImportedModule2 = typeof import('@features/skills/services/skills-catalog');
type ImportedModule1 = typeof import('@shared/events/skill-catalog-events');
type ImportedModule0 = typeof import('@/lib/client/csrf');
