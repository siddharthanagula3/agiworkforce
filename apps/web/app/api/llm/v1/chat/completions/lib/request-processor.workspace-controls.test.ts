import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKSPACE_CONTROLS, type ResolvedWorkspaceControls } from '@agiworkforce/types';
import {
  applyWorkspaceDefaultModel,
  withoutWorkspaceDisabledDeviceCapabilities,
  workspaceFeaturesForChatRequest,
} from './request-processor';

function controls(overrides: Partial<ResolvedWorkspaceControls> = {}): ResolvedWorkspaceControls {
  return { ...DEFAULT_WORKSPACE_CONTROLS, appliedOverrideIds: [], ...overrides };
}

const DEVICE_HOST = {
  deviceId: 'device-1',
  deviceName: 'Laptop',
  platform: 'darwin',
  appVersion: '1.0.0',
  capabilities: ['filesystem.read', 'computer.use'] as const,
  roots: [],
};

describe('workspaceFeaturesForChatRequest', () => {
  it('names the governed features a chat turn reaches', () => {
    expect(
      workspaceFeaturesForChatRequest(
        { work_mode: 'agiwork', research: true, skill_name: 'release-notes', tools: undefined },
        'web',
      ),
    ).toEqual(['work', 'research', 'skills']);
  });

  it('treats client tools from the Chrome extension as the Browser feature', () => {
    expect(
      workspaceFeaturesForChatRequest(
        { tools: [{ type: 'function', function: { name: 'click' } }] } as never,
        'chrome',
      ),
    ).toEqual(['browser']);
    expect(workspaceFeaturesForChatRequest({ tools: [] } as never, 'chrome')).toEqual([]);
  });

  it('asks for nothing on a plain chat turn', () => {
    expect(workspaceFeaturesForChatRequest({} as never, 'web')).toEqual([]);
  });
});

describe('applyWorkspaceDefaultModel', () => {
  it('replaces Auto with the workspace default model', () => {
    const request = { model: 'auto' };
    applyWorkspaceDefaultModel(request, controls({ defaultModelId: 'workspace-default-model' }));
    expect(request.model).toBe('workspace-default-model');
  });

  it('leaves a model the member chose alone', () => {
    const request = { model: 'member-choice' };
    applyWorkspaceDefaultModel(request, controls({ defaultModelId: 'workspace-default-model' }));
    expect(request.model).toBe('member-choice');
  });

  it('does nothing outside a governed workspace', () => {
    const request = { model: 'auto' };
    applyWorkspaceDefaultModel(request, null);
    expect(request.model).toBe('auto');
  });
});

describe('withoutWorkspaceDisabledDeviceCapabilities', () => {
  it('withdraws computer use from the desktop declaration when the workspace turned it off', () => {
    const host = withoutWorkspaceDisabledDeviceCapabilities(
      { ...DEVICE_HOST, capabilities: [...DEVICE_HOST.capabilities] },
      controls({
        featureAccess: { ...DEFAULT_WORKSPACE_CONTROLS.featureAccess, computer_use: false },
      }),
    );
    expect(host?.capabilities).toEqual(['filesystem.read']);
  });

  it('keeps the declaration untouched when computer use is allowed', () => {
    const declared = { ...DEVICE_HOST, capabilities: [...DEVICE_HOST.capabilities] };
    expect(withoutWorkspaceDisabledDeviceCapabilities(declared, controls())).toBe(declared);
  });
});
