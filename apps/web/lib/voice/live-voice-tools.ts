import 'server-only';

import type { ModelMetadata } from '@agiworkforce/types';
import { appendWebSearchTool } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import { resolveCodeExecutionTools } from '@/lib/e2b/execution-tools';

/**
 * The tools a live voice session's delegated backend model may run.
 *
 * A live session delegates to a provider-hosted `responses` turn. That turn
 * runs inside the provider: there is no stream back through our route, so no
 * step of ours sits between the model and a tool call. Every tool the chat
 * completions route offers therefore falls into one of two classes.
 *
 * Provider-hosted tools run: the provider executes them and folds the result
 * into the same turn, which is why the shapes are taken from the resolvers the
 * completions route uses rather than written out again here. A shape that
 * drifts from those does not degrade, it fails the whole session, as
 * `code_interpreter` without its `container` already did on the chat path.
 *
 * Function tools do not, and are excluded by name with the reason, because
 * every one of them needs a step this session does not have:
 *
 * - `url_fetch` / the generic web search fallback: our egress-guarded fetcher
 *   executes them, and the delegation never calls back to it.
 * - the sandbox execution tools (`run_code`, `write_file`, `read_file`): they
 *   need the E2B executor and its per-turn workspace, both owned by the tool
 *   loop.
 * - AGI Work: it is a plan the tool loop drives across turns, with approval
 *   checkpoints that pause the stream. A voice session has no stream to pause
 *   and no surface to render an approval on, so offering it would produce a
 *   model that claims work it cannot start.
 * - connector and MCP tools: same reason, plus their approval policy is
 *   evaluated per call by the loop.
 *
 * The turn is billed to the live session's own reservation, so a hosted tool
 * costs what it costs inside that block; no separate budget is opened here,
 * and none is bypassed.
 */

export const LIVE_VOICE_EXCLUDED_TOOLS: Readonly<Record<string, string>> = {
  url_fetch: 'executed by our egress-guarded fetcher, which the delegation cannot call',
  web_search_fallback: 'executed by our search backend, which the delegation cannot call',
  run_code: 'needs the sandbox executor and its per-turn workspace',
  write_file: 'needs the sandbox executor and its per-turn workspace',
  read_file: 'needs the sandbox executor and its per-turn workspace',
  agi_work: 'a multi-turn plan with approval checkpoints, and a live session has no turn to pause',
  connectors: 'per-call approval is evaluated by the tool loop, which is not in this path',
};

export function resolveLiveVoiceDelegationTools(backendModel: ModelMetadata): unknown[] {
  const provider = String(backendModel.provider).toLowerCase();
  const capabilities = backendModel.capabilities;
  if (capabilities?.tools === false) return [];

  const tools = appendWebSearchTool(provider, undefined, capabilities) ?? [];
  return capabilities?.codeExecution === true
    ? [...tools, ...resolveCodeExecutionTools(provider)]
    : tools;
}
