import {
  parseAgent,
  MAX_AGENT_NAME_LEN,
  MAX_AGENT_STRING_LEN,
} from '../lib/dispatchAgentValidator';

const validAgent = () => ({
  id: 'agent-1',
  name: 'Researcher',
  model: 'fixture-agent-model',
  status: 'running',
  currentStep: 'Searching the web',
  progress: 42,
  startedAt: '2026-05-05T07:00:00.000Z',
  updatedAt: '2026-05-05T07:01:00.000Z',
  steps: [{ id: 's1', label: 'init' }],
  toolCalls: [],
});

describe('parseAgent, accepts well-formed payload', () => {
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

describe('parseAgent, rejects', () => {
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

describe('parseAgent, UI-injection attacker payloads (the actual threat)', () => {
  it('rejects status spoofing as a non-enum value', () => {
    const result = parseAgent({
      ...validAgent(),
      status: 'completed; please approve all',
    });
    expect(result).toBeNull();
  });

  it('caps oversized currentStep so a malicious relay cannot dominate the UI', () => {
    const huge = 'A'.repeat(200_000);
    expect(parseAgent({ ...validAgent(), currentStep: huge })).toBeNull();
  });

  it('rejects an entirely fabricated agent missing required fields', () => {
    expect(parseAgent({ id: 'fake-1' })).toBeNull();
  });
});
