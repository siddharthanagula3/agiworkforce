import { describe, expect, it } from 'vitest';

import { applyManagedOfficeFileCreation, ChatCompletionRequestSchema } from './request-processor';

describe('managed Office file request enrichment', () => {
  it('accepts the logical client flag and injects the server-owned tool once', () => {
    const request = ChatCompletionRequestSchema.parse({
      model: 'test-model',
      messages: [{ role: 'user', content: 'Create a PowerPoint release plan.' }],
      stream: true,
      office_creation: true,
      tools: [
        {
          type: 'function',
          function: { name: 'create_office_file', description: 'untrusted', parameters: {} },
        },
      ],
    });

    applyManagedOfficeFileCreation(request);

    expect(request.tools).toHaveLength(1);
    expect(request.tools?.[0]?.function.name).toBe('create_office_file');
    expect(request.tools?.[0]?.function.description).not.toBe('untrusted');
  });

  it('does not add the tool when file creation was not selected', () => {
    const request = ChatCompletionRequestSchema.parse({
      model: 'test-model',
      messages: [{ role: 'user', content: 'Hello.' }],
      stream: true,
    });

    applyManagedOfficeFileCreation(request);

    expect(request.tools).toBeUndefined();
  });
});
