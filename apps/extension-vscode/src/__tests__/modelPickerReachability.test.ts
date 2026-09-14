import { describe, it, expect } from 'vitest';
import * as vscode from 'vscode';
import { getCoreManualModelOptions } from '@agiworkforce/types';
import {
  providerDisplayLabel,
  type GroupedQuickPickItem,
} from '../features/model-picker/modelConstants';
import {
  buildReachabilityQuickPickItems,
  UNREACHABLE_SECTION_LABEL,
  type HostModel,
} from '../features/model-picker/reachability';

const catalog = getCoreManualModelOptions();
const FIRST = catalog[0];
const SECOND = catalog.find((option) => String(option.provider) !== String(FIRST?.provider));

function item(modelId: string): GroupedQuickPickItem {
  return { label: modelId, modelId };
}

function reachableModel(id: string, provider: string): HostModel {
  return { id, provider, reachable: true, trustMode: 'byok' };
}

function accountModel(id: string, provider: string): HostModel {
  return {
    id,
    provider,
    reachable: false,
    trustMode: 'managed',
    unreachable: { code: 'account_signed_out', action: 'sign_in_account' },
  };
}

function planModel(id: string, provider: string): HostModel {
  return {
    id,
    provider,
    reachable: false,
    trustMode: 'managed',
    unreachable: { code: 'plan_excludes_model', action: 'upgrade_plan' },
  };
}

function unreachableModel(id: string, provider: string): HostModel {
  return {
    id,
    provider,
    reachable: false,
    trustMode: 'byok',
    unreachable: { code: 'provider_auth_missing', action: 'sign_in_provider', provider },
  };
}

describe('buildReachabilityQuickPickItems', () => {
  it('puts what the host can reach first and the rest under one section', () => {
    expect(FIRST).toBeDefined();
    expect(SECOND).toBeDefined();
    const reachable = String(SECOND!.id);
    const blocked = String(FIRST!.id);
    const built = buildReachabilityQuickPickItems({
      items: [item(blocked), item(reachable)],
      hostModels: [
        reachableModel(reachable, String(SECOND!.provider)),
        unreachableModel(blocked, String(FIRST!.provider)),
      ],
    });

    expect(built.map((entry) => entry.modelId)).toEqual([reachable, undefined, blocked]);
    expect(built[1]?.kind).toBe(vscode.QuickPickItemKind.Separator);
    expect(built[1]?.label).toBe(UNREACHABLE_SECTION_LABEL);
  });

  it('describes an unreachable model with the offer a failed turn would earn', () => {
    const blocked = String(FIRST!.id);
    const provider = String(FIRST!.provider);
    const built = buildReachabilityQuickPickItems({
      items: [item(blocked)],
      hostModels: [unreachableModel(blocked, provider)],
    });

    const picked = built.find((entry) => entry.modelId === blocked);
    expect(picked?.description).toBe(`Sign in to ${providerDisplayLabel(provider)}`);
    expect(picked?.unreachable?.action).toBe('sign_in_provider');
    expect(picked?.unreachable?.provider).toBe(provider);
  });

  it('asks for the AGI account, not a vendor, when no session can run the model', () => {
    const blocked = String(FIRST!.id);
    const built = buildReachabilityQuickPickItems({
      items: [item(blocked)],
      hostModels: [accountModel(blocked, String(FIRST!.provider))],
    });

    const picked = built.find((entry) => entry.modelId === blocked);
    expect(picked?.description).toBe('Sign in to AGI');
    expect(picked?.unreachable?.action).toBe('sign_in_account');
    expect(picked?.unreachable?.provider).toBeUndefined();
  });

  it('offers the plan when the account is signed in but excludes the model', () => {
    const blocked = String(FIRST!.id);
    const built = buildReachabilityQuickPickItems({
      items: [item(blocked)],
      hostModels: [planModel(blocked, String(FIRST!.provider))],
    });

    expect(built.find((entry) => entry.modelId === blocked)?.description).toBe('Upgrade your plan');
  });

  it('marks a reachable model the session boundary refuses', () => {
    const id = String(FIRST!.id);
    const built = buildReachabilityQuickPickItems({
      items: [item(id)],
      hostModels: [reachableModel(id, String(FIRST!.provider))],
      privacyMode: 'local',
    });

    expect(built[0]?.refusedBoundary).toBe('byok');
    expect(built[0]?.unreachable).toBeUndefined();
  });

  it('leaves a model alone when the boundary admits it', () => {
    const id = String(FIRST!.id);
    const built = buildReachabilityQuickPickItems({
      items: [item(id)],
      hostModels: [reachableModel(id, String(FIRST!.provider))],
      privacyMode: 'managed',
    });

    expect(built[0]?.refusedBoundary).toBeUndefined();
  });

  it('keeps the existing list when the host says nothing about reachability', () => {
    const items = [item(String(FIRST!.id)), item(String(SECOND!.id))];
    expect(buildReachabilityQuickPickItems({ items })).toEqual(items);
    expect(buildReachabilityQuickPickItems({ items, hostModels: [] })).toEqual(items);
  });
});
