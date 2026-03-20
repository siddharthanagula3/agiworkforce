/**
 * Workflow Builder Store Integration — E2E Smoke Tests
 *
 * Tests the Wave 2 workflow builder wired through workflowStore:
 *  - Create workflow with nodes and edges
 *  - Update workflow name and properties
 *  - Add/remove nodes and edges (via updateWorkflow with modified definition)
 *  - Save workflow to store
 *  - Load workflow from store
 *  - Execution lifecycle: execute, pause, resume, cancel
 *  - Status retrieval and execution log fetching
 *  - Scheduling and event triggers
 *
 * All Tauri invoke() calls are mocked via the global test setup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  useWorkflowStore,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowEdge,
} from '../stores/workflowStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, type = 'llm-task'): WorkflowNode {
  return {
    id,
    type,
    position: { x: 100, y: 200 },
    data: { label: `Node ${id}` },
  };
}

function makeEdge(id: string, source: string, target: string): WorkflowEdge {
  return { id, source, target };
}

function makeDefinition(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    id: `wf-${Date.now()}`,
    userId: 'user-test',
    name: 'Test Workflow',
    description: 'A test workflow',
    nodes: [makeNode('node-1'), makeNode('node-2')],
    edges: [makeEdge('edge-1', 'node-1', 'node-2')],
    triggers: [],
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  useWorkflowStore.setState({
    workflows: [],
    activeExecution: null,
    executionLogs: [],
    isLoading: false,
    error: null,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Create workflow with nodes and edges
// ---------------------------------------------------------------------------

describe('create workflow', () => {
  it('createWorkflow invokes Tauri and returns the new workflow ID', async () => {
    const def = makeDefinition();
    vi.mocked(invoke).mockResolvedValueOnce('wf_generated_001');

    const id = await useWorkflowStore.getState().createWorkflow(def);

    expect(id).toBe('wf_generated_001');
    expect(invoke).toHaveBeenCalledWith('create_workflow', { definition: def });
  });

  it('createWorkflow passes nodes and edges to the backend', async () => {
    const nodes = [makeNode('n1'), makeNode('n2'), makeNode('n3')];
    const edges = [makeEdge('e1', 'n1', 'n2'), makeEdge('e2', 'n2', 'n3')];
    const def = makeDefinition({ nodes, edges });

    vi.mocked(invoke).mockResolvedValueOnce('wf_with_graph');

    await useWorkflowStore.getState().createWorkflow(def);

    const calledArgs = vi.mocked(invoke).mock.calls[0]?.[1] as { definition: WorkflowDefinition };
    expect(calledArgs.definition.nodes).toHaveLength(3);
    expect(calledArgs.definition.edges).toHaveLength(2);
  });

  it('createWorkflow with empty nodes and edges succeeds', async () => {
    const def = makeDefinition({ nodes: [], edges: [] });
    vi.mocked(invoke).mockResolvedValueOnce('wf_empty');

    const id = await useWorkflowStore.getState().createWorkflow(def);
    expect(id).toBe('wf_empty');
  });
});

// ---------------------------------------------------------------------------
// 2. Update workflow name and properties
// ---------------------------------------------------------------------------

describe('update workflow', () => {
  it('updateWorkflow calls Tauri and updates local state', async () => {
    const def = makeDefinition({ id: 'wf-local-1', name: 'Original Name' });
    useWorkflowStore.setState({ workflows: [def] });

    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    const updated = { ...def, name: 'Updated Name', description: 'New description' };
    await useWorkflowStore.getState().updateWorkflow('wf-local-1', updated);

    expect(invoke).toHaveBeenCalledWith('update_workflow', {
      id: 'wf-local-1',
      definition: updated,
    });

    const stored = useWorkflowStore.getState().workflows.find((w) => w.id === 'wf-local-1');
    expect(stored?.name).toBe('Updated Name');
    expect(stored?.description).toBe('New description');
  });

  it('updateWorkflow replaces the workflow in store by id', async () => {
    const def1 = makeDefinition({ id: 'wf-a', name: 'Workflow A' });
    const def2 = makeDefinition({ id: 'wf-b', name: 'Workflow B' });
    useWorkflowStore.setState({ workflows: [def1, def2] });

    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    const updated = { ...def1, name: 'Workflow A — Renamed' };
    await useWorkflowStore.getState().updateWorkflow('wf-a', updated);

    const wfA = useWorkflowStore.getState().workflows.find((w) => w.id === 'wf-a');
    const wfB = useWorkflowStore.getState().workflows.find((w) => w.id === 'wf-b');
    expect(wfA?.name).toBe('Workflow A — Renamed');
    expect(wfB?.name).toBe('Workflow B'); // untouched
  });
});

// ---------------------------------------------------------------------------
// 3. Add and remove nodes and edges
// ---------------------------------------------------------------------------

describe('add and remove nodes and edges', () => {
  it('adding a node via updateWorkflow reflects in local state', async () => {
    const def = makeDefinition({ id: 'wf-nodes', nodes: [makeNode('n1')] });
    useWorkflowStore.setState({ workflows: [def] });

    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    const newNode = makeNode('n2', 'tool-call');
    const updatedDef = { ...def, nodes: [...def.nodes, newNode] };
    await useWorkflowStore.getState().updateWorkflow('wf-nodes', updatedDef);

    const stored = useWorkflowStore.getState().workflows.find((w) => w.id === 'wf-nodes');
    expect(stored?.nodes).toHaveLength(2);
    expect(stored?.nodes.find((n) => n.id === 'n2')?.type).toBe('tool-call');
  });

  it('removing a node via updateWorkflow reflects in local state', async () => {
    const def = makeDefinition({
      id: 'wf-remove-node',
      nodes: [makeNode('n1'), makeNode('n2')],
      edges: [makeEdge('e1', 'n1', 'n2')],
    });
    useWorkflowStore.setState({ workflows: [def] });

    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    // Remove n2 and the edge that references it
    const updatedDef = { ...def, nodes: [makeNode('n1')], edges: [] };
    await useWorkflowStore.getState().updateWorkflow('wf-remove-node', updatedDef);

    const stored = useWorkflowStore.getState().workflows.find((w) => w.id === 'wf-remove-node');
    expect(stored?.nodes).toHaveLength(1);
    expect(stored?.edges).toHaveLength(0);
  });

  it('adding an edge via updateWorkflow reflects in local state', async () => {
    const def = makeDefinition({
      id: 'wf-add-edge',
      nodes: [makeNode('n1'), makeNode('n2'), makeNode('n3')],
      edges: [makeEdge('e1', 'n1', 'n2')],
    });
    useWorkflowStore.setState({ workflows: [def] });

    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    const newEdge = makeEdge('e2', 'n2', 'n3');
    const updatedDef = { ...def, edges: [...def.edges, newEdge] };
    await useWorkflowStore.getState().updateWorkflow('wf-add-edge', updatedDef);

    const stored = useWorkflowStore.getState().workflows.find((w) => w.id === 'wf-add-edge');
    expect(stored?.edges).toHaveLength(2);
    expect(stored?.edges.find((e) => e.id === 'e2')?.target).toBe('n3');
  });
});

// ---------------------------------------------------------------------------
// 4. Save workflow to store
// ---------------------------------------------------------------------------

describe('save workflow to store', () => {
  it('createWorkflow + fetchUserWorkflows round-trip populates store', async () => {
    // Step 1: create returns an ID
    vi.mocked(invoke).mockResolvedValueOnce('wf-saved-001');

    const def = makeDefinition({ id: 'wf-saved-001' });
    await useWorkflowStore.getState().createWorkflow(def);

    // Step 2: fetch returns the workflow from the backend
    vi.mocked(invoke).mockResolvedValueOnce([{ ...def, id: 'wf-saved-001' }]);

    await useWorkflowStore.getState().fetchUserWorkflows('user-test');

    const stored = useWorkflowStore.getState().workflows.find((w) => w.id === 'wf-saved-001');
    expect(stored).toBeDefined();
    expect(stored?.name).toBe('Test Workflow');
  });
});

// ---------------------------------------------------------------------------
// 5. Load workflow from store
// ---------------------------------------------------------------------------

describe('load workflow from store', () => {
  it('getWorkflow calls Tauri and returns the workflow definition', async () => {
    const def = makeDefinition({ id: 'wf-load-1' });
    vi.mocked(invoke).mockResolvedValueOnce(def);

    const result = await useWorkflowStore.getState().getWorkflow('wf-load-1');

    expect(invoke).toHaveBeenCalledWith('get_workflow', { id: 'wf-load-1' });
    expect(result.id).toBe('wf-load-1');
    expect(result.name).toBe('Test Workflow');
  });

  it('fetchUserWorkflows populates workflows in store', async () => {
    const defs = [makeDefinition({ id: 'wf-u1' }), makeDefinition({ id: 'wf-u2' })];
    vi.mocked(invoke).mockResolvedValueOnce(defs);

    await useWorkflowStore.getState().fetchUserWorkflows('user-123');

    const state = useWorkflowStore.getState();
    expect(state.workflows).toHaveLength(2);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('fetchUserWorkflows sets error state on failure', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Network error'));

    await useWorkflowStore.getState().fetchUserWorkflows('user-123');

    const state = useWorkflowStore.getState();
    expect(state.error).toBe('Network error');
    expect(state.isLoading).toBe(false);
  });

  it('fetchUserWorkflows sets loading to true during fetch', async () => {
    let wasLoading = false;

    vi.mocked(invoke).mockImplementationOnce(async () => {
      wasLoading = useWorkflowStore.getState().isLoading;
      return [];
    });

    await useWorkflowStore.getState().fetchUserWorkflows('user-123');

    expect(wasLoading).toBe(true);
    expect(useWorkflowStore.getState().isLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Delete workflow
// ---------------------------------------------------------------------------

describe('delete workflow', () => {
  it('deleteWorkflow removes the workflow from local state', async () => {
    const def1 = makeDefinition({ id: 'wf-del-1' });
    const def2 = makeDefinition({ id: 'wf-del-2' });
    useWorkflowStore.setState({ workflows: [def1, def2] });

    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await useWorkflowStore.getState().deleteWorkflow('wf-del-1');

    const state = useWorkflowStore.getState();
    expect(state.workflows).toHaveLength(1);
    expect(state.workflows[0]?.id).toBe('wf-del-2');
  });
});

// ---------------------------------------------------------------------------
// 7. Execution lifecycle
// ---------------------------------------------------------------------------

describe('execution lifecycle', () => {
  it('executeWorkflow returns an execution ID', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('exec-001');

    const execId = await useWorkflowStore.getState().executeWorkflow('wf-1', { input: 'value' });
    expect(execId).toBe('exec-001');
    expect(invoke).toHaveBeenCalledWith('execute_workflow', {
      workflowId: 'wf-1',
      inputs: { input: 'value' },
    });
  });

  it('pauseWorkflow calls Tauri with executionId', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await useWorkflowStore.getState().pauseWorkflow('exec-001');

    expect(invoke).toHaveBeenCalledWith('pause_workflow', { executionId: 'exec-001' });
  });

  it('resumeWorkflow calls Tauri with executionId', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await useWorkflowStore.getState().resumeWorkflow('exec-001');

    expect(invoke).toHaveBeenCalledWith('resume_workflow', { executionId: 'exec-001' });
  });

  it('cancelWorkflow calls Tauri with executionId', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await useWorkflowStore.getState().cancelWorkflow('exec-001');

    expect(invoke).toHaveBeenCalledWith('cancel_workflow', { executionId: 'exec-001' });
  });

  it('getWorkflowStatus updates activeExecution in store', async () => {
    const execution = {
      id: 'exec-002',
      workflowId: 'wf-1',
      status: 'running' as const,
      currentNodeId: 'node-2',
      inputs: {},
      outputs: {},
      error: null,
      startedAt: Date.now(),
      completedAt: null,
    };

    vi.mocked(invoke).mockResolvedValueOnce(execution);

    const result = await useWorkflowStore.getState().getWorkflowStatus('exec-002');

    expect(result.id).toBe('exec-002');
    expect(result.status).toBe('running');
    expect(useWorkflowStore.getState().activeExecution?.id).toBe('exec-002');
  });

  it('fetchExecutionLogs populates executionLogs', async () => {
    const logs = [
      {
        id: 'log-1',
        executionId: 'exec-003',
        nodeId: 'n1',
        eventType: 'started',
        data: null,
        timestamp: Date.now(),
      },
      {
        id: 'log-2',
        executionId: 'exec-003',
        nodeId: 'n1',
        eventType: 'completed',
        data: null,
        timestamp: Date.now(),
      },
    ];

    vi.mocked(invoke).mockResolvedValueOnce(logs);

    await useWorkflowStore.getState().fetchExecutionLogs('exec-003');

    expect(useWorkflowStore.getState().executionLogs).toHaveLength(2);
    expect(useWorkflowStore.getState().executionLogs[0]?.eventType).toBe('started');
  });
});

// ---------------------------------------------------------------------------
// 8. Scheduling and event triggers
// ---------------------------------------------------------------------------

describe('scheduling and event triggers', () => {
  it('scheduleWorkflow calls Tauri with cron expression', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await useWorkflowStore.getState().scheduleWorkflow('wf-sched', '0 9 * * 1-5');

    expect(invoke).toHaveBeenCalledWith('schedule_workflow', {
      workflowId: 'wf-sched',
      cronExpr: '0 9 * * 1-5',
      timezone: null,
    });
  });

  it('scheduleWorkflow passes timezone when provided', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await useWorkflowStore.getState().scheduleWorkflow('wf-tz', '0 9 * * *', 'America/New_York');

    expect(invoke).toHaveBeenCalledWith('schedule_workflow', {
      workflowId: 'wf-tz',
      cronExpr: '0 9 * * *',
      timezone: 'America/New_York',
    });
  });

  it('triggerWorkflowOnEvent returns execution ID', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('exec-triggered-001');

    const execId = await useWorkflowStore
      .getState()
      .triggerWorkflowOnEvent('wf-event', 'new_message', { messageId: 'msg-1' });

    expect(execId).toBe('exec-triggered-001');
    expect(invoke).toHaveBeenCalledWith('trigger_workflow_on_event', {
      workflowId: 'wf-event',
      eventType: 'new_message',
      eventData: { messageId: 'msg-1' },
    });
  });

  it('getNextExecutionTime returns a future timestamp', async () => {
    const futureMs = Date.now() + 3_600_000;
    vi.mocked(invoke).mockResolvedValueOnce(futureMs);

    const next = await useWorkflowStore.getState().getNextExecutionTime('0 9 * * *');

    expect(next).toBe(futureMs);
    expect(next).toBeGreaterThan(Date.now());
  });
});
