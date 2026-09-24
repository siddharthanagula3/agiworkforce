import { describe, expect, it } from 'vitest';

import {
  buildApprovalCheckpointRequest,
  checkpointRequestForResume,
} from './approval-checkpoint-request';
import type { ChatCompletionRequest } from './request-processor';

const internalTool = {
  type: 'function' as const,
  function: { name: 'server_offered_skill', parameters: {} },
};
const callerTool = {
  type: 'function' as const,
  function: { name: 'caller_defined_tool', parameters: {} },
};

describe('buildApprovalCheckpointRequest', () => {
  it('does not turn server-injected tools into caller-defined tools on Free approval resume', () => {
    const request = buildApprovalCheckpointRequest(
      {
        messages: [{ role: 'user', content: 'Search the web' }],
        tools: [internalTool],
        tool_choice: { type: 'function', function: { name: internalTool.function.name } },
        web_search: true,
      } as unknown as ChatCompletionRequest,
      {},
    );

    expect(request).not.toHaveProperty('messages');
    expect(request).not.toHaveProperty('tools');
    expect(request).not.toHaveProperty('tool_choice');
    expect(request).toMatchObject({ web_search: true, stream: true });
  });

  it('preserves caller-declared tools and choice without persisting server additions', () => {
    const callerToolFields = { tools: [callerTool], tool_choice: 'auto' as const };
    const request = buildApprovalCheckpointRequest(
      {
        messages: [],
        tools: [callerTool, internalTool],
        tool_choice: 'auto',
      } as unknown as ChatCompletionRequest,
      callerToolFields,
    );

    expect(request['tools']).toEqual([callerTool]);
    expect(request['tool_choice']).toBe('auto');
  });

  it('retains an explicit caller choice to disable tools', () => {
    const request = buildApprovalCheckpointRequest(
      { messages: [], tool_choice: 'none' } as unknown as ChatCompletionRequest,
      { tool_choice: 'none' },
    );

    expect(request['tool_choice']).toBe('none');
  });
});

describe('checkpointRequestForResume', () => {
  it('drops legacy server-injected tool fields for a Free checkpoint', () => {
    const request = {
      web_search: true,
      tools: [internalTool],
      tool_choice: 'auto',
    };

    expect(checkpointRequestForResume(request, true)).toEqual({ web_search: true });
    expect(request.tools).toEqual([internalTool]);
  });

  it('retains caller tools for a paid checkpoint', () => {
    const request = { tools: [callerTool], tool_choice: 'auto' };

    expect(checkpointRequestForResume(request, false)).toBe(request);
  });
});
