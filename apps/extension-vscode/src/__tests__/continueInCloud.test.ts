import * as vscode from 'vscode';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { modelDisplayNameById, resolveCloudCodeAgentModel } from '@agiworkforce/types';
import {
  continueInCloud,
  describeCloudContinuationReview,
} from '../features/cloud-tasks/continueInCloud';

const source = {
  repository: 'example/workspace',
  repositoryUrl: 'https://github.com/example/workspace',
  branch: 'main',
  upstream: 'origin/main',
  unpushedCommits: 0,
  dirtyPaths: [],
};
const localDefault = 'local-fixture-model';
const chosen = resolveCloudCodeAgentModel(null, 'free');
const cloudLabel = modelDisplayNameById(chosen);

function handoff() {
  const create = vi.fn().mockResolvedValue({ session: { id: 'cloud-session' } });
  const startAgentTurn = vi.fn().mockResolvedValue({ stopReason: 'done' });
  const host = {
    readSource: async () => source,
    resolveApi: async () => ({ create, startAgentTurn }),
    configuredModel: () => ({ route: 'local' as const, model: localDefault }),
    planTier: () => 'free',
  };
  vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce('Inspect the tests');
  return { host, create, startAgentTurn };
}

afterEach(() => vi.clearAllMocks());

describe('Continue in the cloud', () => {
  it('shows both models before creating a session and sends only the approved cloud model', async () => {
    const { host, create, startAgentTurn } = handoff();
    const confirm = vi.mocked(vscode.window.showInformationMessage);
    confirm.mockResolvedValueOnce('Continue in the cloud');
    confirm.mockResolvedValueOnce(undefined);

    await continueInCloud(host);

    expect(confirm).toHaveBeenNthCalledWith(
      1,
      'Continue this work in the cloud on example/workspace?',
      {
        modal: true,
        detail: expect.stringContaining(
          `Model: ${cloudLabel}\nYour default model, ${localDefault}, is for Local sessions only.`,
        ),
      },
      'Continue in the cloud',
    );
    expect(confirm.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]!);
    expect(startAgentTurn).toHaveBeenCalledWith('cloud-session', {
      goal: 'Inspect the tests',
      model: chosen,
      idempotencyKey: expect.any(String),
    });
  });

  it('creates nothing when the confirmation is cancelled', async () => {
    const { host, create, startAgentTurn } = handoff();
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(undefined);

    await continueInCloud(host);

    expect(create).not.toHaveBeenCalled();
    expect(startAgentTurn).not.toHaveBeenCalled();
  });

  it('shows only the cloud model when the configured default is managed', () => {
    const review = describeCloudContinuationReview(source, { id: chosen });
    expect(review.detail).toContain(`Model: ${cloudLabel}\nNetwork:`);
  });
});
