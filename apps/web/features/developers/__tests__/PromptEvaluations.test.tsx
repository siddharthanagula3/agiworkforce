import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeveloperPrompt, DeveloperPromptVersion } from '@agiworkforce/cloud-contracts';

const { runGatewayCompletion } = vi.hoisted(() => ({ runGatewayCompletion: vi.fn() }));
vi.mock('../lib/run-completion', () => ({
  CHAT_COMPLETIONS_PATH: '/api/llm/v1/chat/completions',
  runGatewayCompletion,
}));
vi.mock('@features/auth/step-up-fetch', () => ({ sendAuthorizedJson: vi.fn() }));

import { PromptEvaluations } from '../components/PromptEvaluations';
import type { PromptsApi } from '../lib/prompts-client';

const PROMPT_ID = '0190a000-0000-7000-8000-0000000000f1';
const RUN_ID = '0190a000-0000-7000-8000-0000000000f2';
const version: DeveloperPromptVersion = {
  version: 2,
  systemPrompt: 'Answer with one team name.',
  template: 'Route: {{ticket}}',
  model: 'auto',
  maxTokens: null,
  temperature: null,
  note: null,
  createdAt: '2026-10-19T00:00:00.000Z',
};
const prompt: DeveloperPrompt = {
  id: PROMPT_ID,
  name: 'Router',
  latest: version,
  caseCount: 2,
  updatedAt: '2026-10-19T00:00:00.000Z',
};
const cases = [
  {
    id: '0190a000-0000-7000-8000-0000000000c1',
    position: 0,
    variables: { ticket: 'Refund' },
    expectedOutput: 'Billing',
  },
  {
    id: '0190a000-0000-7000-8000-0000000000c2',
    position: 1,
    variables: { ticket: 'Crash' },
    expectedOutput: 'Support',
  },
];

function fakeApi(): PromptsApi {
  let resultIndex = 0;
  return {
    list: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    versions: vi.fn(),
    saveVersion: vi.fn(),
    cases: vi.fn(async () => cases),
    addCases: vi.fn(),
    updateCase: vi.fn(),
    removeCase: vi.fn(),
    runs: vi.fn(async () => []),
    startRun: vi.fn(async () => ({
      id: RUN_ID,
      version: 2,
      checkKind: 'contains' as const,
      caseCount: 2,
      createdAt: '2026-10-19T00:00:00.000Z',
      results: [],
    })),
    run: vi.fn(),
    recordResult: vi.fn(async (_p, _r, input) => {
      resultIndex += 1;
      return {
        ...input,
        id: `0190a000-0000-7000-8000-0000000000d${resultIndex}`,
        passed: input.output?.includes('Billing') ? true : input.output ? false : null,
        grade: null,
      };
    }),
    grade: vi.fn(async (_p, _r, resultId, grade) => ({
      id: resultId,
      caseId: cases[0]!.id,
      renderedInput: 'Route: Refund',
      output: 'Billing',
      error: null,
      latencyMs: 10,
      inputTokens: 5,
      outputTokens: 1,
      passed: true,
      grade,
    })),
  };
}

beforeEach(() => {
  runGatewayCompletion.mockReset();
});

describe('PromptEvaluations', () => {
  it('runs every case through the gateway with its variables and records each result', async () => {
    runGatewayCompletion.mockImplementation(async ({ message }: { message: string }) => ({
      content: message.includes('Refund') ? 'Billing' : 'Engineering',
      latencyMs: 12,
      inputTokens: 8,
      outputTokens: 1,
    }));
    const api = fakeApi();
    render(
      <PromptEvaluations
        api={api}
        prompt={prompt}
        versions={[version]}
        variables={['ticket']}
        onCasesChange={vi.fn()}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Run all cases' }));
    await waitFor(() => expect(api.recordResult).toHaveBeenCalledTimes(2));
    expect(api.startRun).toHaveBeenCalledWith(PROMPT_ID, 2, 'contains');
    expect(runGatewayCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ system: 'Answer with one team name.', message: 'Route: Refund' }),
    );
    const results = await screen.findByRole('region', { name: 'Run results' });
    await waitFor(() => expect(within(results).getByText('Pass')).toBeInTheDocument());
    expect(within(results).getByText('Fail')).toBeInTheDocument();
  });

  it('records a gateway failure as an error result instead of dropping the case', async () => {
    runGatewayCompletion.mockRejectedValue(new Error('The gateway answered 429.'));
    const api = fakeApi();
    render(
      <PromptEvaluations
        api={api}
        prompt={prompt}
        versions={[version]}
        variables={['ticket']}
        onCasesChange={vi.fn()}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Run all cases' }));
    await waitFor(() => expect(api.recordResult).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.recordResult).mock.calls[0]?.[2]).toMatchObject({
      output: null,
      error: expect.stringContaining('429'),
    });
  });

  it('asks before deleting a test case', async () => {
    const api = fakeApi();
    render(
      <PromptEvaluations
        api={api}
        prompt={prompt}
        versions={[version]}
        variables={['ticket']}
        onCasesChange={vi.fn()}
      />,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Delete case 1' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('cannot be recovered');
    expect(api.removeCase).not.toHaveBeenCalled();
  });
});
