const MAX_FRAME_CHARACTERS = 262_144;

type StreamFailure =
  'empty' | 'interrupted' | 'invalid' | 'provider' | 'output_limit' | 'filtered' | 'unsupported';

const FAILURE_COPY: Readonly<Record<StreamFailure, { code: string; message: string }>> = {
  empty: {
    code: 'free_model_empty_response',
    message:
      'This free model returned no answer. Try again or choose another free model. No paid model was used.',
  },
  interrupted: {
    code: 'free_model_stream_interrupted',
    message:
      'This free model stopped before its answer was complete. Try again or choose another free model.',
  },
  invalid: {
    code: 'free_model_stream_invalid',
    message:
      'This free model returned an unreadable response. Try again or choose another free model.',
  },
  provider: {
    code: 'free_model_stream_failed',
    message:
      'The free provider could not complete this answer. Try again or choose another free model.',
  },
  output_limit: {
    code: 'free_model_output_limit',
    message:
      'This free model reached its answer limit. Ask for a shorter response or choose another free model.',
  },
  filtered: {
    code: 'free_model_content_filtered',
    message:
      'This free model could not complete the request under its safety rules. Try rephrasing.',
  },
  unsupported: {
    code: 'free_model_tool_call_unsupported',
    message:
      'This promotional model tried to call a tool it cannot use here. Choose Free Auto and try again.',
  },
};

function dataFrame(value: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`);
}

function errorFrame(reason: StreamFailure): Uint8Array {
  const failure = FAILURE_COPY[reason];
  return dataFrame({
    choices: [
      {
        index: 0,
        delta: { x_stream_error: { ...failure, retryable: false } },
        finish_reason: null,
      },
    ],
  });
}

const DONE_FRAME = new TextEncoder().encode('data: [DONE]\n\n');

export function validatePromotionalChatStream(
  source: ReadableStream<Uint8Array>,
  options: { trustedErrorFrames?: boolean; onFailure?: (reason: StreamFailure) => void } = {},
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let hasVisibleContent = false;
  let hasFinishReason = false;
  let hasError = false;
  let hasDoneFrame = false;
  let terminalFailure: StreamFailure | null = null;
  let stopped = false;

  function fail(controller: ReadableStreamDefaultController<Uint8Array>, reason: StreamFailure) {
    if (stopped) return;
    stopped = true;
    controller.enqueue(errorFrame(reason));
    controller.enqueue(DONE_FRAME);
    options.onFailure?.(reason);
  }

  function handleFrame(
    controller: ReadableStreamDefaultController<Uint8Array>,
    raw: string,
  ): boolean {
    if (raw.length > MAX_FRAME_CHARACTERS) {
      fail(controller, 'invalid');
      return true;
    }
    const lines = raw.split('\n');
    const event = lines
      .find((line) => line.startsWith('event:'))
      ?.slice(6)
      .trim();
    const payload = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (event === 'error') {
      fail(controller, 'provider');
      return true;
    }
    if (!payload) return false;
    if (payload === '[DONE]') {
      if (terminalFailure) {
        fail(controller, terminalFailure);
        return true;
      }
      if (!hasVisibleContent && !hasError) {
        fail(controller, 'empty');
        return true;
      }
      hasDoneFrame = true;
      controller.enqueue(DONE_FRAME);
      return true;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      fail(controller, 'invalid');
      return true;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      fail(controller, 'invalid');
      return true;
    }
    const record = parsed as Record<string, unknown>;
    if (record['error'] !== undefined || typeof record['code'] === 'string') {
      fail(controller, 'provider');
      return true;
    }
    if (!Array.isArray(record['choices'])) {
      fail(controller, 'invalid');
      return true;
    }
    for (const choice of record['choices']) {
      if (!choice || typeof choice !== 'object') {
        fail(controller, 'invalid');
        return true;
      }
      const item = choice as Record<string, unknown>;
      const delta = item['delta'];
      if (delta && typeof delta === 'object') {
        const values = delta as Record<string, unknown>;
        if (values['tool_calls'] !== undefined || values['function_call'] !== undefined) {
          fail(controller, 'unsupported');
          return true;
        }
        if (values['x_stream_error'] !== undefined) {
          if (!options.trustedErrorFrames) {
            fail(controller, 'provider');
            return true;
          }
          hasError = true;
        }
        if (typeof values['content'] === 'string' && values['content'].trim()) {
          hasVisibleContent = true;
        }
      }
      if (typeof item['finish_reason'] === 'string') {
        const finishReason = item['finish_reason'];
        if (finishReason === 'stop') hasFinishReason = true;
        else if (finishReason === 'length') terminalFailure = 'output_limit';
        else if (finishReason === 'content_filter') terminalFailure = 'filtered';
        else if (finishReason === 'tool_calls' || finishReason === 'function_call') {
          fail(controller, 'unsupported');
          return true;
        } else terminalFailure = 'invalid';
      }
    }
    controller.enqueue(dataFrame(record));
    return true;
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (!stopped && !hasDoneFrame) {
          let emitted = false;
          let boundary = pending.indexOf('\n\n');
          while (boundary !== -1 && !stopped && !hasDoneFrame) {
            const frame = pending.slice(0, boundary);
            pending = pending.slice(boundary + 2);
            emitted = handleFrame(controller, frame) || emitted;
            boundary = pending.indexOf('\n\n');
          }
          if (stopped || hasDoneFrame) break;
          if (pending.length > MAX_FRAME_CHARACTERS) {
            fail(controller, 'invalid');
            break;
          }
          if (emitted) return;

          const { done, value } = await reader.read();
          if (done) {
            pending += decoder.decode();
            if (pending.trim()) handleFrame(controller, pending.trim());
            if (!stopped && !hasDoneFrame) {
              if (terminalFailure) {
                fail(controller, terminalFailure);
              } else if (hasVisibleContent && hasFinishReason) {
                controller.enqueue(DONE_FRAME);
              } else {
                fail(controller, hasVisibleContent ? 'interrupted' : 'empty');
              }
            }
            controller.close();
            return;
          }
          pending = (pending + decoder.decode(value, { stream: true })).replaceAll('\r\n', '\n');
        }
        await reader.cancel().catch(() => undefined);
        controller.close();
      } catch {
        fail(controller, 'interrupted');
        await reader.cancel().catch(() => undefined);
        controller.close();
      }
    },
    async cancel(reason) {
      stopped = true;
      await reader.cancel(reason).catch(() => undefined);
    },
  });
}
