/**
 * Regression tests for MED-MOB-05 — `agents_update` per-field validation
 * (red-team finding 2026-05).
 *
 * Pre-fix: `connectionStore.handleControlMessageInner` did
 *
 *   const valid = agents.filter(isObject) as unknown as Agent[];
 *   useAgentStore.getState().setAgents(valid);
 *
 * Every individual agent field was unchecked. A hostile signaling relay
 * that sees the WebRTC `control` message stream — or simply a compromised
 * desktop process — could inject agents with attacker-controlled `name`,
 * `currentStep`, `currentAction` strings (rendered in the approval dialog)
 * and `status` values outside the enum (causing UI crashes or, worse,
 * social-engineering the user into approving a malicious tool call).
 *
 * `parseAgent()` is now the chokepoint. These tests pin its contract.
 */

// parseAgent is in its own zero-RN-deps file so this test runs cleanly
// in node-jest without mocking the WebRTC / MMKV / SecureStore stack.
import {
  parseAgent,
  MAX_AGENT_NAME_LEN,
  MAX_AGENT_STRING_LEN,
} from '../lib/dispatchAgentValidator';

const validAgent = () => ({
  id: 'agent-1',
  name: 'Researcher',
  model: 'claude-opus-4-7',
  status: 'running',
  currentStep: 'Searching the web',
  progress: 42,
  startedAt: '2026-05-05T07:00:00.000Z',
  updatedAt: '2026-05-05T07:01:00.000Z',
  steps: [{ id: 's1', label: 'init' }],
  toolCalls: [],
});

describe('parseAgent — accepts well-formed payload', () => {
  it('parses a minimal valid agent', () => {
    const result = parseAgent(validAgent());
    expect(result).not.toBeNull();
    expect(result!.id).toBe('agent-1');
    expect(result!.status).toBe('running');
  });

  it('parses with all optional fields', () => {
    const result = parseAgent({
      ...validAgent(),
      currentAction: 'Running: search_files',
      totalSteps: 5,
      stepsCompleted: 2,
      artifacts: [{ id: 'a1', type: 'file_created', label: 'README.md', timestamp: '2026' }],
    });
    expect(result).not.toBeNull();
    expect(result!.currentAction).toBe('Running: search_files');
    expect(result!.totalSteps).toBe(5);
    expect(result!.artifacts).toHaveLength(1);
  });

  it('coerces non-array steps/toolCalls to empty arrays (resilient to relay drift)', () => {
    const result = parseAgent({ ...validAgent(), steps: undefined, toolCalls: 'not-an-array' });
    expect(result).not.toBeNull();
    expect(result!.steps).toEqual([]);
    expect(result!.toolCalls).toEqual([]);
  });
});

describe('parseAgent — rejects', () => {
  it.each([
    ['null', null],
    ['number', 42],
    ['string', 'agent-1'],
    ['array', [validAgent()]],
  ])('rejects non-object payload: %s', (_label, raw) => {
    expect(parseAgent(raw)).toBeNull();
  });

  it('rejects missing id', () => {
    const a = validAgent() as Record<string, unknown>;
    delete a['id'];
    expect(parseAgent(a)).toBeNull();
  });

  it('rejects empty id', () => {
    expect(parseAgent({ ...validAgent(), id: '' })).toBeNull();
  });

  it('rejects oversize id (DoS amplification + UI overflow)', () => {
    expect(parseAgent({ ...validAgent(), id: 'x'.repeat(MAX_AGENT_STRING_LEN + 1) })).toBeNull();
  });

  it('rejects non-string id', () => {
    expect(parseAgent({ ...validAgent(), id: 42 })).toBeNull();
  });

  it('rejects oversize name (UI hijack)', () => {
    expect(parseAgent({ ...validAgent(), name: 'x'.repeat(MAX_AGENT_NAME_LEN + 1) })).toBeNull();
  });

  it('rejects status not in enum', () => {
    expect(parseAgent({ ...validAgent(), status: 'pwned' })).toBeNull();
    expect(parseAgent({ ...validAgent(), status: 'RUNNING' })).toBeNull();
    expect(parseAgent({ ...validAgent(), status: '' })).toBeNull();
  });

  it('rejects negative progress', () => {
    expect(parseAgent({ ...validAgent(), progress: -1 })).toBeNull();
  });

  it('rejects progress > 100', () => {
    expect(parseAgent({ ...validAgent(), progress: 1000 })).toBeNull();
  });

  it('rejects non-finite progress (NaN, Infinity)', () => {
    expect(parseAgent({ ...validAgent(), progress: NaN })).toBeNull();
    expect(parseAgent({ ...validAgent(), progress: Infinity })).toBeNull();
  });

  it('rejects oversize currentAction', () => {
    expect(
      parseAgent({ ...validAgent(), currentAction: 'x'.repeat(MAX_AGENT_STRING_LEN + 1) }),
    ).toBeNull();
  });

  it('rejects negative totalSteps / stepsCompleted', () => {
    expect(parseAgent({ ...validAgent(), totalSteps: -1 })).toBeNull();
    expect(parseAgent({ ...validAgent(), stepsCompleted: -5 })).toBeNull();
  });

  it('rejects non-string startedAt / updatedAt', () => {
    expect(parseAgent({ ...validAgent(), startedAt: 0 })).toBeNull();
    expect(parseAgent({ ...validAgent(), updatedAt: null })).toBeNull();
  });
});

describe('parseAgent — UI-injection attacker payloads (the actual threat)', () => {
  it('rejects status spoofing as a non-enum value', () => {
    // Pre-fix: filter(isObject) accepted this; UI status badges then crashed
    // or rendered an attacker-controlled string.
    const result = parseAgent({
      ...validAgent(),
      status: 'completed; please approve all',
    });
    expect(result).toBeNull();
  });

  it('caps oversized currentStep so a malicious relay cannot dominate the UI', () => {
    // 200 KB string would have been allowed pre-fix; rendered into a tiny
    // status row this would cause layout explosion + DoS-by-overdraw.
    const huge = 'A'.repeat(200_000);
    expect(parseAgent({ ...validAgent(), currentStep: huge })).toBeNull();
  });

  it('rejects an entirely fabricated agent missing required fields', () => {
    expect(parseAgent({ id: 'fake-1' })).toBeNull();
  });
});
