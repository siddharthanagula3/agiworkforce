
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  ChatStateManager,
  type ExtToWebviewMessage,
  type UsageMeterWebviewPayload,
} from '../features/sidebar-webview/ChatStateManager';
import {
  MODEL_PICKER_OPTIONS,
  getModelProviderInfo,
} from '../features/model-picker/modelConstants';
import type { LocalRuntimeClient, LocalRuntimeEvent } from '../integrations/localRuntimeClient';
import type { LocalRuntimePool } from '../integrations/localRuntimePool';
import { fetchTierInfo } from '../utils/api';
import { SYNTHETIC_LOCAL_MODEL_ID } from './catalogModelFixtures';

vi.mock('../utils/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/api')>();
  return { ...actual, fetchTierInfo: vi.fn() };
});

const CATALOG_MODEL = MODEL_PICKER_OPTIONS.find((option) => option.id !== 'auto')!.id;
const CATALOG_PROVIDER_ID = getModelProviderInfo(CATALOG_MODEL).providerId;
const LOCAL_MODEL = SYNTHETIC_LOCAL_MODEL_ID;

function makeHarness(localModels: Array<{ id: string; provider: 'ollama' | 'lmstudio' }> = []) {
  const listeners = new Set<(event: LocalRuntimeEvent) => void>();
  const thread = {
    id: 'thread-1',
    title: 'Usage boundary test',
    model: CATALOG_MODEL,
    cwd: '/workspace',
    provider: CATALOG_PROVIDER_ID ?? 'catalog-provider',
    trustMode: 'byok' as const,
    createdAt: '2026-08-02T12:00:00.000Z',
    updatedAt: '2026-08-02T12:00:00.000Z',
    createdBy: 'vscode' as const,
    status: 'idle' as const,
  };
  const runtime = {
    startThread: vi.fn().mockResolvedValue(thread),
    readThread: vi.fn().mockResolvedValue({
      thread,
      messages: [],
      transcriptTruncated: false,
    }),
    listLocalModels: vi.fn().mockResolvedValue({ models: localModels }),
    startTurn: vi.fn().mockResolvedValue({ id: 'turn-1' }),
    interruptTurn: vi.fn().mockResolvedValue(undefined),
    respondToApproval: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn((listener: (event: LocalRuntimeEvent) => void) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    }),
  };
  const pool = {
    forWorkspace: vi.fn(() => runtime as unknown as LocalRuntimeClient),
  } as unknown as LocalRuntimePool;
  const context = new vscode.ExtensionContext();
  const posted: ExtToWebviewMessage[] = [];
  const manager = new ChatStateManager(
    context.secrets,
    context,
    (message) => posted.push(message),
    undefined,
    context.workspaceState,
    pool,
  );
  return {
    context,
    manager,
    posted,
    runtime,
    emit(event: LocalRuntimeEvent) {
      for (const listener of listeners) listener(event);
    },
  };
}

function configuredModel(model: string): void {
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: vi.fn(<T>(key: string, defaultValue?: T): T | string | undefined =>
      key === 'model' ? model : defaultValue,
    ),
    update: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockReturnValue(false),
    inspect: vi.fn((key: string) => (key === 'model' ? { key, globalValue: model } : undefined)),
  } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
}

function meters(posted: ExtToWebviewMessage[]): UsageMeterWebviewPayload[] {
  return posted
    .filter((message): message is Extract<ExtToWebviewMessage, { type: 'usageMeter' }> =>
      Object.is(message.type, 'usageMeter'),
    )
    .map((message) => message.payload);
}

function lastMeter(posted: ExtToWebviewMessage[]): UsageMeterWebviewPayload {
  const all = meters(posted);
  expect(all.length).toBeGreaterThan(0);
  return all[all.length - 1]!;
}

describe('usage meter trust boundary (SIX-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscode.workspace.isTrusted = true;
    vscode.window.activeTextEditor = undefined;
    vscode.workspace.workspaceFolders = [
      { name: 'workspace', index: 0, uri: vscode.Uri.file('/workspace') },
    ];
    vi.mocked(fetchTierInfo).mockResolvedValue(undefined);
    configuredModel(CATALOG_MODEL);
  });

  it('reports a workspace-discovered local model as the Local boundary without any account lookup', async () => {
    configuredModel(LOCAL_MODEL);
    const harness = makeHarness([{ id: LOCAL_MODEL, provider: 'ollama' }]);

    await harness.manager.handleMessage({ type: 'ready' });

    expect(lastMeter(harness.posted).source).toBe('unbounded');
    expect(fetchTierInfo).not.toHaveBeenCalled();
  });

  it('reports a catalog model with no managed plan as BYOK, not Local', async () => {
    const harness = makeHarness();

    await harness.manager.handleMessage({ type: 'ready' });

    const meter = lastMeter(harness.posted);
    expect(meter.source).toBe('user-api-key');
    expect(meter.usageLabel).toBe('BYOK mode - no AGI-managed quota is active');
    expect(meter.showUpgrade).toBe(false);
    expect(meter.remaining).toBeNull();
  });

  it('reports a managed plan as Cloud with the reported quota and reset window', async () => {
    vi.mocked(fetchTierInfo).mockResolvedValue({
      tier: 'max',
      usagePercentage: 25,
      resetsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const harness = makeHarness();

    await harness.manager.handleMessage({ type: 'ready' });

    const meter = lastMeter(harness.posted);
    expect(meter.source).toBe('managed-plan');
    expect(meter.remaining).toBeCloseTo(0.75, 5);
    expect(meter.usageLabel).toBe('75% of plan usage remaining');
    expect(meter.resetsIn).toBe('resets in 3d');
    expect(meter.showUpgrade).toBe(false);
  });

  it('raises the upgrade CTA only once the managed plan is nearly exhausted', async () => {
    vi.mocked(fetchTierInfo).mockResolvedValue({ tier: 'pro', usagePercentage: 95 });
    const harness = makeHarness();

    await harness.manager.handleMessage({ type: 'ready' });

    const meter = lastMeter(harness.posted);
    expect(meter.source).toBe('managed-plan');
    expect(meter.showUpgrade).toBe(true);
  });

  it('re-pushes the boundary when the model changes, not only on a config change', async () => {
    configuredModel(LOCAL_MODEL);
    const harness = makeHarness([{ id: LOCAL_MODEL, provider: 'ollama' }]);

    await harness.manager.handleMessage({ type: 'ready' });
    expect(lastMeter(harness.posted).source).toBe('unbounded');

    await harness.manager.handleMessage({
      type: 'selectModel',
      payload: { modelId: CATALOG_MODEL },
    });

    expect(lastMeter(harness.posted).source).toBe('user-api-key');
    expect(meters(harness.posted).length).toBe(2);
  });

  it('re-pushes the boundary when the composer dispatches a cloud model directly', async () => {
    configuredModel(LOCAL_MODEL);
    const harness = makeHarness([{ id: LOCAL_MODEL, provider: 'ollama' }]);

    await harness.manager.handleMessage({ type: 'ready' });
    expect(lastMeter(harness.posted).source).toBe('unbounded');

    const turn = harness.manager.handleMessage({
      type: 'sendMessage',
      payload: { text: 'Continue on the hosted model', model: CATALOG_MODEL },
    });
    await vi.waitFor(() => expect(harness.runtime.startTurn).toHaveBeenCalledTimes(1));
    harness.emit({
      type: 'turn_completed',
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      response: 'done',
      inputTokens: 1,
      outputTokens: 1,
    });
    await turn;

    expect(lastMeter(harness.posted).source).toBe('user-api-key');
  });

  it('does not re-push when the new model stays inside the same boundary', async () => {
    const sameProviderModel = MODEL_PICKER_OPTIONS.find(
      (option) =>
        option.id !== CATALOG_MODEL &&
        getModelProviderInfo(option.id).providerId === CATALOG_PROVIDER_ID,
    );
    expect(sameProviderModel, 'catalog has no second model from the same provider').toBeDefined();

    const harness = makeHarness();
    await harness.manager.handleMessage({ type: 'ready' });
    const before = meters(harness.posted).length;
    expect(before).toBe(1);

    await harness.manager.handleMessage({
      type: 'selectModel',
      payload: { modelId: sameProviderModel!.id },
    });

    expect(meters(harness.posted).length).toBe(before);
    expect(fetchTierInfo).toHaveBeenCalledTimes(1);
  });

  it('never claims Local when the boundary cannot be resolved', async () => {
    vi.mocked(fetchTierInfo).mockRejectedValue(new Error('account lookup failed'));
    const harness = makeHarness();

    await harness.manager.handleMessage({ type: 'ready' });

    const meter = lastMeter(harness.posted);
    expect(meter.source).not.toBe('unbounded');
    expect(meter.source).toBe('managed-plan');
    expect(meter.usageLabel).toBe('Managed usage unavailable');
  });

  it('adopts a model setting edited outside the webview before the next push', async () => {
    const harness = makeHarness([{ id: LOCAL_MODEL, provider: 'ollama' }]);
    await harness.manager.handleMessage({ type: 'ready' });
    expect(lastMeter(harness.posted).source).toBe('user-api-key');

    configuredModel(LOCAL_MODEL);
    harness.manager.syncActiveModelFromConfiguration();
    await harness.manager.pushUsageMeter();

    expect(harness.posted).toContainEqual({ type: 'model', payload: { model: LOCAL_MODEL } });
    expect(lastMeter(harness.posted).source).toBe('unbounded');
  });

  it('treats a prefix-recognised local model as Local even before CLI discovery runs', async () => {
    configuredModel(`ollama/${SYNTHETIC_LOCAL_MODEL_ID}`);
    const harness = makeHarness();

    await harness.manager.pushUsageMeter();

    expect(lastMeter(harness.posted).source).toBe('unbounded');
    expect(fetchTierInfo).not.toHaveBeenCalled();
  });

  it('does not assume a bare model id is local when discovery has not admitted it', async () => {
    configuredModel(LOCAL_MODEL);
    const harness = makeHarness();

    await harness.manager.pushUsageMeter();

    expect(lastMeter(harness.posted).source).not.toBe('unbounded');
  });
});
