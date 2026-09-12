/**
 * The adapter is where an unsupported attachment is classified, and where the
 * classification has to be attached to the error chunk.
 *
 * Translation raises `UnsupportedFileInputError` before any request leaves the
 * process, so this exercises the real refusal without a network stub. What
 * matters is that the chunk carries the structured answer: downstream, the only
 * other thing available is a message with the requester's filename glued into
 * it, and the filenames below are chosen to read as other failure classes.
 */
import { describe, expect, it } from 'vitest';

import type { ChatRequest, ModelInfo, StreamChunk } from '@agiworkforce/types';
import { classifyError } from '@agiworkforce/provider-runtime';

import { createOpenAICompatAdapter, type OpenAICompatAdapterSpec } from '../compat-adapter';

const TEST_MODEL_ID = 'compat-test-model';
const TEST_CATALOG: readonly ModelInfo[] = [{ id: TEST_MODEL_ID, provider: 'deepseek' }];

const SPEC: OpenAICompatAdapterSpec = {
  id: 'deepseek',
  label: 'Compat Test',
  apiKeyEnvVar: 'COMPAT_TEST_API_KEY',
  apiKeyLabel: 'Compat Test API Key',
  baseUrlEnvVar: 'COMPAT_TEST_BASE_URL',
  defaultBaseUrl: 'https://api.deepseek.com/v1',
  catalog: TEST_CATALOG,
};

function requestWithAttachment(filename: string): ChatRequest {
  return {
    model: TEST_MODEL_ID,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Summarise the attachment.' },
          {
            type: 'file',
            filename,
            source: {
              type: 'base64',
              mediaType: 'application/pdf',
              data: Buffer.from('binary', 'utf8').toString('base64'),
            },
          },
        ],
      },
    ],
  };
}

async function errorChunkFor(filename: string): Promise<Extract<StreamChunk, { type: 'error' }>> {
  const adapter = createOpenAICompatAdapter(SPEC, {
    apiKey: 'test-key',
    fetch: () => {
      throw new Error('a refused attachment must never reach the network');
    },
  });

  const chunks: StreamChunk[] = [];
  for await (const chunk of adapter.stream(
    requestWithAttachment(filename),
    new AbortController().signal,
  )) {
    chunks.push(chunk);
  }

  const error = chunks.find((chunk) => chunk.type === 'error');
  if (!error || error.type !== 'error') throw new Error('expected an error chunk');
  return error;
}

describe('an unsupported attachment leaves the adapter with its classification attached', () => {
  it.each(['brief.pdf', 'timeout.pdf', 'certificate.pdf', 'content_filter.pdf'])(
    'classifies %s as unsupported_input on the chunk itself',
    async (filename) => {
      const error = await errorChunkFor(filename);

      expect(error.classification).toMatchObject({
        category: 'unsupported_input',
        retryable: false,
        fallbackable: true,
      });
      expect(error.message).toContain(filename);
    },
  );

  it('gives a consumer the same answer for a hostile filename as for a plain one', async () => {
    const hostile = await errorChunkFor('timeout.pdf');
    const plain = await errorChunkFor('brief.pdf');

    expect(hostile.classification).toEqual(plain.classification);
  });

  it('survives the rebuild a consumer does, which the message alone would not', async () => {
    const error = await errorChunkFor('timeout.pdf');
    const rebuilt = Object.assign(new Error(`deepseek API error (unknown): ${error.message}`), {
      classification: error.classification,
    });

    expect(classifyError(rebuilt).category).toBe('unsupported_input');
  });
});
