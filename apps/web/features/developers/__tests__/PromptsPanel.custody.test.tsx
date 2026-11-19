import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  DeveloperEvalCase,
  DeveloperPrompt,
  DeveloperPromptVersion,
} from '@agiworkforce/cloud-contracts';

vi.mock('../lib/run-completion', () => ({
  CHAT_COMPLETIONS_PATH: '/api/llm/v1/chat/completions',
  runGatewayCompletion: vi.fn(),
}));
vi.mock('@features/auth/step-up-fetch', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  sendAuthorizedJson: vi.fn(),
}));
vi.mock('../hooks/use-gateway-models', () => ({
  formatRetirement: (date: string) => date,
  useGatewayModels: () => ({ list: { status: 'ready', models: [] }, retry: vi.fn() }),
}));

import { PromptsPanel } from '../components/PromptsPanel';
import type { PromptsApi } from '../lib/prompts-client';

const PROMPT_ID = '0190a000-0000-7000-8000-0000000000f1';
const CREATED_AT = '2026-10-19T00:00:00.000Z';

function versionOf(number: number, template: string): DeveloperPromptVersion {
  return {
    version: number,
    systemPrompt: 'Answer with one team name.',
    template,
    model: 'auto',
    maxTokens: null,
    temperature: null,
    note: null,
    createdAt: CREATED_AT,
  };
}

function promptOf(latest: DeveloperPromptVersion, caseCount: number): DeveloperPrompt {
  return { id: PROMPT_ID, name: 'Router', latest, caseCount, updatedAt: CREATED_AT };
}

function caseOf(index: number): DeveloperEvalCase {
  return {
    id: `0190a000-0000-7000-8000-00000000000${index}`,
    position: index,
    variables: { ticket: `Ticket ${index}` },
    expectedOutput: null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fakeApi(overrides: Partial<PromptsApi>): PromptsApi {
  return {
    list: vi.fn(async () => [promptOf(versionOf(2, 'Route: {{ticket}}'), 2)]),
    create: vi.fn(),
    remove: vi.fn(),
    versions: vi.fn(async () => [versionOf(2, 'Route: {{ticket}}')]),
    saveVersion: vi.fn(),
    cases: vi.fn(async () => [caseOf(1), caseOf(2)]),
    addCases: vi.fn(),
    updateCase: vi.fn(),
    removeCase: vi.fn(),
    runs: vi.fn(async () => []),
    startRun: vi.fn(),
    run: vi.fn(),
    recordResult: vi.fn(),
    grade: vi.fn(),
    ...overrides,
  };
}

describe('PromptsPanel draft custody', () => {
  it('keeps text typed while a version save is pending', async () => {
    const pending = deferred<DeveloperPrompt>();
    const api = fakeApi({ saveVersion: vi.fn(() => pending.promise) });
    render(<PromptsPanel api={api} />);

    const template = await screen.findByLabelText('User message template');
    await userEvent.type(template, ' now');
    await userEvent.click(screen.getByRole('button', { name: 'Save as version 3' }));
    await waitFor(() => expect(api.saveVersion).toHaveBeenCalledTimes(1));

    await userEvent.type(screen.getByLabelText('System prompt'), ' Newer');
    await act(async () => {
      pending.resolve(promptOf(versionOf(3, 'Route: {{ticket}} now'), 2));
      await pending.promise;
    });

    expect(screen.getByLabelText('System prompt')).toHaveValue('Answer with one team name. Newer');
    expect(screen.getByRole('button', { name: 'Save as version 4' })).toBeEnabled();
  });

  it('resets the editor to the saved version when nothing changed during the save', async () => {
    const pending = deferred<DeveloperPrompt>();
    const api = fakeApi({ saveVersion: vi.fn(() => pending.promise) });
    render(<PromptsPanel api={api} />);

    await userEvent.type(await screen.findByLabelText('What changed (optional)'), 'tweak');
    await userEvent.type(screen.getByLabelText('User message template'), ' now');
    await userEvent.click(screen.getByRole('button', { name: 'Save as version 3' }));
    await act(async () => {
      pending.resolve(promptOf(versionOf(3, 'Route: {{ticket}} now'), 2));
      await pending.promise;
    });

    await waitFor(() => expect(screen.getByLabelText('What changed (optional)')).toHaveValue(''));
    expect(screen.getByLabelText('User message template')).toHaveValue('Route: {{ticket}} now');
  });

  it('adds a late case-count answer to the current prompt instead of restoring an older version', async () => {
    const pendingCases = deferred<DeveloperEvalCase[]>();
    const api = fakeApi({
      addCases: vi.fn(() => pendingCases.promise),
      saveVersion: vi.fn(async () => promptOf(versionOf(3, 'Route: {{ticket}} now'), 2)),
    });
    render(<PromptsPanel api={api} />);

    await userEvent.type(await screen.findByLabelText('ticket'), 'Late');
    await userEvent.click(screen.getByRole('button', { name: 'Add case' }));
    await waitFor(() => expect(api.addCases).toHaveBeenCalledTimes(1));

    await userEvent.type(screen.getByLabelText('User message template'), ' now');
    await userEvent.click(screen.getByRole('button', { name: 'Save as version 3' }));
    expect(
      await screen.findByRole('option', { name: 'Router · v3 · 2 cases' }),
    ).toBeInTheDocument();

    await act(async () => {
      pendingCases.resolve([caseOf(1), caseOf(2), caseOf(3)]);
      await pendingCases.promise;
    });

    expect(
      await screen.findByRole('option', { name: 'Router · v3 · 3 cases' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save as version 4' })).toBeInTheDocument();
  });

  it('keeps an unsaved test case while another prompt field is edited', async () => {
    const api = fakeApi({});
    render(<PromptsPanel api={api} />);

    await userEvent.type(await screen.findByLabelText('ticket'), 'Half written');
    await userEvent.type(screen.getByLabelText('System prompt'), ' More');

    expect(screen.getByLabelText('ticket')).toHaveValue('Half written');
  });
});

type ImportedModule0 = typeof import('@features/auth/step-up-fetch');
