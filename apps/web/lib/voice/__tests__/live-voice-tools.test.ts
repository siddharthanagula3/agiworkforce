// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { ModelMetadata } from '@agiworkforce/types';
import { getModelMetadataById, getRoutingSlotModel } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));

const {
  LIVE_VOICE_EXCLUDED_TOOLS,
  LIVE_VOICE_TOOL_REGISTRY,
  describeDelegationTools,
  describeLiveVoiceTool,
  describeLiveVoiceTools,
  resolveLiveVoiceDelegationTools,
} = await import('../live-voice-tools');
const { appendWebSearchTool } =
  await import('@/app/api/llm/v1/chat/completions/lib/request-processor');
const { resolveCodeExecutionTools } = await import('@/lib/e2b/execution-tools');

const BACKEND_MODEL = getModelMetadataById(getRoutingSlotModel('voice_live_backend'))!;

function model(overrides: Partial<ModelMetadata['capabilities']>): ModelMetadata {
  return {
    ...BACKEND_MODEL,
    capabilities: { ...BACKEND_MODEL.capabilities, ...overrides },
  } as ModelMetadata;
}

describe('live voice delegation tools', () => {
  /**
   * The delegated turn runs inside the provider, so the tool shape it is handed
   * has to be the shape that provider accepts. Writing it out here instead of
   * resolving it is how `code_interpreter` shipped without its required
   * `container` on the chat path: the toggle was lit and the turn died.
   */
  it('resolves search through the same resolver the chat completions route uses', () => {
    expect(resolveLiveVoiceDelegationTools(BACKEND_MODEL)).toEqual(
      appendWebSearchTool(
        String(BACKEND_MODEL.provider).toLowerCase(),
        undefined,
        BACKEND_MODEL.capabilities,
      ),
    );
  });

  it('adds the provider-hosted interpreter when the model has code execution', () => {
    const capable = model({ codeExecution: true });

    expect(resolveLiveVoiceDelegationTools(capable)).toEqual([
      ...(appendWebSearchTool(
        String(capable.provider).toLowerCase(),
        undefined,
        capable.capabilities,
      ) ?? []),
      ...resolveCodeExecutionTools(String(capable.provider).toLowerCase()),
    ]);
  });

  it('offers nothing to a model the catalog says cannot call tools', () => {
    expect(resolveLiveVoiceDelegationTools(model({ tools: false }))).toEqual([]);
  });

  it('offers no search to a model the catalog says cannot search', () => {
    expect(resolveLiveVoiceDelegationTools(model({ search: false }))).toEqual([]);
  });

  /**
   * These are the tools text chat runs that a live session cannot, and the
   * reason is the same for all of them: each needs a step of ours between the
   * model and the tool, and the delegation never comes back through our route.
   * Listing them is not decoration -- without it, "voice has fewer tools" reads
   * as an oversight rather than a boundary.
   */
  it('names every tool it cannot run and why', () => {
    expect(Object.keys(LIVE_VOICE_EXCLUDED_TOOLS).sort()).toEqual([
      'agi_work',
      'connectors',
      'read_file',
      'run_code',
      'url_fetch',
      'web_search_fallback',
      'write_file',
    ]);
    for (const reason of Object.values(LIVE_VOICE_EXCLUDED_TOOLS)) {
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  /**
   * The provider executes a hosted tool inside its own turn, so a hosted tool
   * is named by `type` alone. A `function` entry would be one the provider
   * hands back for a caller to run, and nothing in this path is listening.
   */
  it('offers only provider-hosted tools, never a function the delegation would hand back', () => {
    for (const tool of resolveLiveVoiceDelegationTools(model({ codeExecution: true }))) {
      const record = tool as Record<string, unknown>;
      expect(record['type']).not.toBe('function');
      expect(record['function']).toBeUndefined();
      expect(Object.keys(LIVE_VOICE_EXCLUDED_TOOLS)).not.toContain(record['name']);
    }
  });

  /**
   * The registry is the single answer to "can voice reach this, and why", so a
   * new tool that is neither offered nor refused with a reason is a gap.
   */
  it('gives every registered tool a reason and a bounded timeout', () => {
    expect(LIVE_VOICE_TOOL_REGISTRY.length).toBeGreaterThan(0);
    for (const tool of LIVE_VOICE_TOOL_REGISTRY) {
      expect(tool.reason.length).toBeGreaterThan(20);
      expect(tool.timeoutMs).toBeGreaterThan(0);
      if (!tool.reachable) expect(tool.toolClass).toBe('function');
    }
  });

  it('refuses every write-risk tool, so no voice turn reaches one without approval', () => {
    for (const tool of LIVE_VOICE_TOOL_REGISTRY) {
      if (tool.risk !== 'write') continue;
      expect(tool.reachable).toBe(false);
      expect(tool.requiresApproval).toBe(true);
    }
  });

  it('derives the exclusion list from the registry rather than repeating it', () => {
    expect(Object.keys(LIVE_VOICE_EXCLUDED_TOOLS).sort()).toEqual(
      LIVE_VOICE_TOOL_REGISTRY.filter((tool) => !tool.reachable)
        .map((tool) => tool.id)
        .sort(),
    );
  });

  it('describes the tools it actually offered, with a label the voice UI can speak', () => {
    const offered = describeDelegationTools(resolveLiveVoiceDelegationTools(BACKEND_MODEL));
    expect(offered.length).toBeGreaterThan(0);
    for (const descriptor of describeLiveVoiceTools(offered)) {
      expect(descriptor.label.length).toBeGreaterThan(0);
      expect(descriptor.timeoutMs).toBeGreaterThan(0);
    }
  });

  it('falls back to a neutral label for a tool the registry has never seen', () => {
    expect(describeLiveVoiceTool('something_new')).toMatchObject({
      id: 'something_new',
      requiresApproval: false,
    });
  });
});
