import { vi } from 'vitest';
import type { AgentConfig, ManagedCloudAgent } from '@agiworkforce/cloud-contracts';

import type { AgentsApi } from '../services/agents-client';

export function managedAgent(patch: Partial<ManagedCloudAgent> = {}): ManagedCloudAgent {
  return {
    id: '0190a000-0000-7000-8000-0000000000a1',
    name: 'Release notes writer',
    description: 'Turns merged pull requests into release notes',
    icon: 'file-text',
    accentColor: 'sky',
    instructions: 'Group changes by area.',
    outputExamples: '',
    conversationStarters: [],
    model: null,
    webSearch: true,
    codeExecution: true,
    imageGeneration: true,
    connectorIds: null,
    skillNames: null,
    allowedWebDomains: [],
    blockedWebDomains: [],
    dailyTurnLimit: null,
    monthlyCreditLimit: null,
    isOwner: true,
    ownerName: null,
    organizationId: '0190a000-0000-7000-8000-0000000000f1',
    status: 'active',
    visibility: 'private',
    publishedVersion: null,
    hasUnpublishedChanges: true,
    pausedAt: null,
    retiredAt: null,
    createdAt: '2026-10-19T00:00:00.000Z',
    updatedAt: '2026-10-19T00:00:00.000Z',
    ...patch,
  };
}

export function fakeApi(patch: Partial<AgentsApi> = {}): AgentsApi {
  const agent = managedAgent();
  return {
    list: vi.fn(async () => [agent]),
    get: vi.fn(async () => agent),
    create: vi.fn(async (input) => managedAgent({ ...(input as Partial<AgentConfig>) })),
    importMarkdown: vi.fn(async () => agent),
    update: vi.fn(async (_id, patchInput) =>
      managedAgent({ ...(patchInput as Partial<AgentConfig>) }),
    ),
    remove: vi.fn(async () => undefined),
    setStatus: vi.fn(async (_id, status) => managedAgent({ status })),
    publish: vi.fn(async () => managedAgent({ publishedVersion: 1, hasUnpublishedChanges: false })),
    versions: vi.fn(async () => []),
    restore: vi.fn(async () => agent),
    share: vi.fn(async () => ({
      visibility: 'private' as const,
      workspaceName: 'Acme',
      members: [],
    })),
    updateShare: vi.fn(async (_id, input) => ({
      visibility: input.visibility,
      workspaceName: 'Acme',
      members: [],
    })),
    transfer: vi.fn(async () => undefined),
    usage: vi.fn(async () => ({ windowDays: 30, conversations: 4, people: 2, turns: 9 })),
    activity: vi.fn(async () => ({ conversations: [], routines: [] })),
    files: vi.fn(async () => []),
    addFile: vi.fn(),
    removeFile: vi.fn(async () => undefined),
    startConversation: vi.fn(async () => '0190a000-0000-7000-8000-0000000000c1'),
    exportHref: vi.fn(() => '/api/custom-agents/x/export'),
    exportMarkdown: vi.fn(async () => '---\nname: x\n---\n'),
    ...patch,
  };
}
