/**
 * Cross-surface contract test: dispatch payload schema.
 *
 * Mobile dispatch payloads must conform to the control-message schema enforced
 * by `apps/mobile/lib/dispatchAgentValidator.ts` (parseAgent). This is the
 * chokepoint between the desktop signer and `useAgentStore.setAgents` — a
 * compromised relay or same-LAN MITM that crafts an `agents_update` payload
 * with malformed entries gets dropped here.
 *
 * Distinct from `control-message-agent-schema.test.ts` (per-field
 * unit-tests): this file exercises the WIRE-FORMAT payload shape that flows
 * through `handleControlMessageInner` in connectionStore.ts:240-261 — i.e.
 * the `{ action: 'agents_update', agents: Agent[] }` envelope — with:
 *
 *   • happy path: well-formed envelope + valid agents → all parse
 *   • invalid 1 : agent missing a required field → that agent dropped, rest kept
 *   • invalid 2 : agent has a wrong-type field → that agent dropped
 *   • invalid 3 : oversize string (UI-DoS class) → that agent dropped
 *
 * This pins the payload generator's invariants against the receiver's
 * validator and prevents accidental schema drift across the surface boundary.
 */

import {
  parseAgent,
  MAX_AGENT_NAME_LEN,
  MAX_AGENT_STRING_LEN,
  MAX_AGENTS_PER_UPDATE,
} from '../lib/dispatchAgentValidator';

// ── Payload generator ────────────────────────────────────────────────────────

interface AgentsUpdatePayload {
  action: 'agents_update';
  agents: unknown[];
}

/** Build a single, well-formed agent object as the desktop would emit it. */
function makeValidAgent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'agent-001',
    name: 'Researcher',
    model: 'claude-opus-4-7',
    status: 'running',
    currentStep: 'Searching the web',
    progress: 42,
    startedAt: '2026-05-15T07:00:00.000Z',
    updatedAt: '2026-05-15T07:01:00.000Z',
    steps: [{ id: 's1', label: 'init' }],
    toolCalls: [],
    ...overrides,
  };
}

/** Build the agents_update envelope the dispatch handler expects. */
function makeAgentsUpdatePayload(agents: unknown[]): AgentsUpdatePayload {
  return { action: 'agents_update', agents };
}

/**
 * Runs the same validation logic as `handleControlMessageInner` in
 * connectionStore.ts:246-260 — cap to MAX_AGENTS_PER_UPDATE, then parseAgent
 * each entry, then keep only the parsed agents. Returns the array of
 * accepted agents so tests can pin the receiver's contract.
 */
function validatePayload(payload: AgentsUpdatePayload): {
  accepted: ReturnType<typeof parseAgent>[];
  droppedCount: number;
} {
  const capped = payload.agents.slice(0, MAX_AGENTS_PER_UPDATE);
  const accepted: NonNullable<ReturnType<typeof parseAgent>>[] = [];
  let droppedCount = 0;
  for (const raw of capped) {
    const parsed = parseAgent(raw);
    if (parsed) {
      accepted.push(parsed);
    } else {
      droppedCount++;
    }
  }
  return { accepted, droppedCount };
}

// ── Happy path ───────────────────────────────────────────────────────────────

describe('dispatch payload — happy path validates against schema', () => {
  it('accepts a well-formed agents_update with one agent', () => {
    const payload = makeAgentsUpdatePayload([makeValidAgent()]);
    const { accepted, droppedCount } = validatePayload(payload);

    expect(accepted).toHaveLength(1);
    expect(droppedCount).toBe(0);
    expect(accepted[0]!.id).toBe('agent-001');
    expect(accepted[0]!.status).toBe('running');
  });

  it('accepts a payload with multiple distinct agents', () => {
    const payload = makeAgentsUpdatePayload([
      makeValidAgent({ id: 'a1', name: 'Researcher' }),
      makeValidAgent({ id: 'a2', name: 'Coder', status: 'completed', progress: 100 }),
      makeValidAgent({ id: 'a3', name: 'Reviewer', status: 'waiting', progress: 0 }),
    ]);
    const { accepted, droppedCount } = validatePayload(payload);

    expect(accepted).toHaveLength(3);
    expect(droppedCount).toBe(0);
    expect(accepted.map((a) => a!.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('preserves optional fields when present', () => {
    const payload = makeAgentsUpdatePayload([
      makeValidAgent({
        currentAction: 'Running: search_files',
        totalSteps: 5,
        stepsCompleted: 2,
        artifacts: [{ id: 'a1', type: 'file_created', label: 'README.md', timestamp: '2026' }],
      }),
    ]);
    const { accepted } = validatePayload(payload);

    expect(accepted).toHaveLength(1);
    expect(accepted[0]!.currentAction).toBe('Running: search_files');
    expect(accepted[0]!.totalSteps).toBe(5);
    expect(accepted[0]!.artifacts).toHaveLength(1);
  });
});

// ── Invalid case 1: missing required field ──────────────────────────────────

describe('dispatch payload — invalid: missing required field', () => {
  it('drops an agent whose required `name` field is missing', () => {
    const malformed = makeValidAgent();
    delete (malformed as Record<string, unknown>)['name'];

    const payload = makeAgentsUpdatePayload([malformed]);
    const { accepted, droppedCount } = validatePayload(payload);

    expect(accepted).toHaveLength(0);
    expect(droppedCount).toBe(1);
  });

  it('drops malformed agent but keeps siblings with all required fields', () => {
    const good = makeValidAgent({ id: 'good-1', name: 'Good Agent' });
    const missingId = makeValidAgent();
    delete (missingId as Record<string, unknown>)['id'];
    const missingProgress = makeValidAgent({ id: 'bad-progress' });
    delete (missingProgress as Record<string, unknown>)['progress'];

    const payload = makeAgentsUpdatePayload([good, missingId, missingProgress]);
    const { accepted, droppedCount } = validatePayload(payload);

    // Critical: receiver doesn't reject the whole payload — it filters.
    expect(accepted).toHaveLength(1);
    expect(droppedCount).toBe(2);
    expect(accepted[0]!.id).toBe('good-1');
  });
});

// ── Invalid case 2: wrong type ──────────────────────────────────────────────

describe('dispatch payload — invalid: wrong type', () => {
  it('drops an agent whose `progress` is a string instead of number', () => {
    const payload = makeAgentsUpdatePayload([
      makeValidAgent({ progress: '50' }), // wrong type — schema requires number
    ]);
    const { accepted, droppedCount } = validatePayload(payload);

    expect(accepted).toHaveLength(0);
    expect(droppedCount).toBe(1);
  });

  it('drops an agent whose `status` is outside the enum', () => {
    const payload = makeAgentsUpdatePayload([
      makeValidAgent({ status: 'PWND' }), // not in VALID_AGENT_STATUSES
    ]);
    const { accepted, droppedCount } = validatePayload(payload);

    expect(accepted).toHaveLength(0);
    expect(droppedCount).toBe(1);
  });

  it('drops an agent whose `id` is a number instead of string', () => {
    const payload = makeAgentsUpdatePayload([
      makeValidAgent({ id: 42 }), // wrong type
    ]);
    const { accepted, droppedCount } = validatePayload(payload);

    expect(accepted).toHaveLength(0);
    expect(droppedCount).toBe(1);
  });
});

// ── Invalid case 3: oversize ────────────────────────────────────────────────

describe('dispatch payload — invalid: oversize fields', () => {
  it('drops an agent whose `name` exceeds MAX_AGENT_NAME_LEN (UI hijack defense)', () => {
    const payload = makeAgentsUpdatePayload([
      makeValidAgent({ name: 'A'.repeat(MAX_AGENT_NAME_LEN + 1) }),
    ]);
    const { accepted, droppedCount } = validatePayload(payload);

    expect(accepted).toHaveLength(0);
    expect(droppedCount).toBe(1);
  });

  it('drops an agent whose `currentStep` exceeds MAX_AGENT_STRING_LEN (DoS-by-overdraw)', () => {
    const payload = makeAgentsUpdatePayload([
      makeValidAgent({ currentStep: 'x'.repeat(MAX_AGENT_STRING_LEN + 1) }),
    ]);
    const { accepted, droppedCount } = validatePayload(payload);

    expect(accepted).toHaveLength(0);
    expect(droppedCount).toBe(1);
  });

  it('caps an oversize payload at MAX_AGENTS_PER_UPDATE entries', () => {
    // A hostile relay sends 60 agents — receiver must cap at 50 (the
    // MAX_AGENTS_PER_UPDATE constant from dispatchAgentValidator.ts).
    const oversizeAgents = Array.from({ length: 60 }, (_, i) =>
      makeValidAgent({ id: `agent-${i}` }),
    );
    const payload = makeAgentsUpdatePayload(oversizeAgents);
    const { accepted } = validatePayload(payload);

    expect(accepted.length).toBeLessThanOrEqual(MAX_AGENTS_PER_UPDATE);
    expect(accepted).toHaveLength(MAX_AGENTS_PER_UPDATE);
    // First MAX entries kept; trailing entries silently dropped.
    expect(accepted[0]!.id).toBe('agent-0');
    expect(accepted[MAX_AGENTS_PER_UPDATE - 1]!.id).toBe(`agent-${MAX_AGENTS_PER_UPDATE - 1}`);
  });
});
