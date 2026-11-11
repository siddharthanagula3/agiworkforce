import type { AgentActivityToolEntry } from '@agiworkforce/client-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildConnectorInputForm,
  resetConnectorInputMemory,
} from '../src/features/side-panel/connectorInputForm';

const entry = {
  kind: 'tool',
  id: 'tool:call-1',
  toolCallId: 'call-1',
  name: 'mcp__github__create_issue',
  category: 'connector',
  summary: '',
  status: 'awaiting-approval',
  startedAtMs: 0,
  inputRequest: {
    connectorId: 'github',
    round: 1,
    inputRequests: {
      details: {
        method: 'elicitation/create',
        params: {
          mode: 'form',
          message: 'Choose details',
          requestedSchema: {
            type: 'object',
            properties: { repo: { type: 'string' } },
            required: ['repo'],
          },
        },
      },
    },
  },
} as unknown as AgentActivityToolEntry;

const binding = { answered: new Set<string>(), sending: false, onRespond: vi.fn() };

function repoInput(): HTMLInputElement {
  const section = buildConnectorInputForm(entry, binding);
  const input = section?.querySelector('input');
  if (!input) throw new Error('The connector form rendered no repo field.');
  return input;
}

describe('connector input draft memory', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      i18n: { getMessage: (key: string) => key, getUILanguage: () => 'en' },
    });
    resetConnectorInputMemory();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps a typed draft across a rebuild of the same request', () => {
    const first = repoInput();
    first.value = 'acme/widgets';
    first.dispatchEvent(new Event('input', { bubbles: true }));
    expect(repoInput().value).toBe('acme/widgets');
  });

  it('drops every remembered draft when the account changes', () => {
    const first = repoInput();
    first.value = 'acme/widgets';
    first.dispatchEvent(new Event('input', { bubbles: true }));
    resetConnectorInputMemory();
    expect(repoInput().value).toBe('');
  });
});
