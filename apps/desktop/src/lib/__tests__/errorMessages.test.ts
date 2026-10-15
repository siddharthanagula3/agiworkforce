import { describe, expect, it } from 'vitest';
import { SETTINGS_NAV } from '@agiworkforce/ui';
import {
  CONNECTION_FAILED_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  INVALID_API_KEY_MESSAGE,
  REQUEST_REFUSED_MESSAGE,
  SERVER_ERROR_MESSAGE,
  STREAM_STALLED_MESSAGE,
  TOOK_TOO_LONG_MESSAGE,
  TOO_MANY_REQUESTS_MESSAGE,
  getSimpleErrorMessage,
} from '../errorMessages';

describe('what a native command says reaches the person', () => {
  it.each([
    'Web search is turned off in Settings, Capabilities. Turn it on there to use this tool.',
    'You declined this a moment ago. Try again in 30 seconds.',
    'Another confirmation is already open. Answer it first, then try again.',
    'Unlock your saved keys first',
    'Pick a time in the future for a task that runs once.',
    'Terminal is held off until you turn it on again.',
  ])('shows %j unchanged', (reason) => {
    expect(getSimpleErrorMessage(reason)).toBe(reason);
    expect(getSimpleErrorMessage(new Error(reason))).toBe(reason);
    expect(getSimpleErrorMessage({ message: reason })).toBe(reason);
  });

  it('reads the sentence out of a serialised native error', () => {
    expect(getSimpleErrorMessage({ type: 'Generic', details: 'This task has finished.' })).toBe(
      'This task has finished.',
    );
    expect(
      getSimpleErrorMessage({
        type: 'ToolError',
        details: { tool_type: 'NotFound', message: 'No tool is named open_door.' },
      }),
    ).toBe('No tool is named open_door.');
  });

  it.each([
    'Add an API key for OpenAI before choosing this model.',
    'This API key is already saved for another provider.',
    'The network folder is outside the folders you allowed.',
    'Private network addresses are turned off for Ollama.',
    'Failed to fetch remote state: the branch has no upstream.',
    'Model load failed: not enough memory.',
    'Failed to connect to Ollama: error sending request for url (http://localhost:11434/api/tags)',
    'The task stopped after its 500 steps.',
    '401 files were skipped.',
    'The schedule timed out after 30 minutes and was stopped.',
    'A timeout of 0 turns the limit off.',
    'The server error log is kept for 7 days.',
    'This folder is unauthorized for writes.',
    'Rate limits are set per provider in Settings.',
    'The watchdog interval must be at least 5 seconds.',
  ])('does not rewrite %j', (sentence) => {
    expect(getSimpleErrorMessage(sentence)).toBe(sentence);
  });

  it('shows the first two lines, with control characters removed', () => {
    expect(
      getSimpleErrorMessage('Could not save the schedule.\r\n\n  The disk is full.\nat line 3'),
    ).toBe('Could not save the schedule. The disk is full.');
    expect(getSimpleErrorMessage('Could not\u0007 open\u001b[31m the\u0000 file.')).toBe(
      'Could not  open [31m the  file.',
    );
  });

  it('bounds a long reason', () => {
    const shown = getSimpleErrorMessage(`Could not read ${'the file '.repeat(80)}`);
    expect(Array.from(shown)).toHaveLength(300);
    expect(shown.endsWith('…')).toBe(true);
    expect(shown.startsWith('Could not read the file')).toBe(true);
  });
});

describe('the generic sentence', () => {
  it.each([
    ['an empty string', ''],
    ['whitespace', ' \n\t '],
    ['undefined', undefined],
    ['null', null],
    ['a number', 500],
    ['an object without words', { ok: false }],
    ['an error without a message', new Error('')],
    ['a native error with empty details', { type: 'Generic', details: '' }],
    ['a message that is not a string', { message: 429 }],
  ])('stands in for %s', (_label, error) => {
    expect(getSimpleErrorMessage(error)).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("stands in for the runtime's own wording", () => {
    expect(
      getSimpleErrorMessage(new TypeError("Cannot read properties of undefined (reading 'id')")),
    ).toBe(GENERIC_ERROR_MESSAGE);
    expect(getSimpleErrorMessage(new SyntaxError('Unexpected token < in JSON'))).toBe(
      GENERIC_ERROR_MESSAGE,
    );
    expect(getSimpleErrorMessage(new DOMException('The operation is insecure.'))).toBe(
      GENERIC_ERROR_MESSAGE,
    );
  });
});

describe('a transport or provider failure, recognised by its shape', () => {
  it.each([
    ['401'],
    ['401 Unauthorized'],
    ['HTTP 401'],
    ['HTTP status client error (401 Unauthorized) for url (https://api.example.com/v1)'],
    ['openai API error 401: Unauthorized'],
    ['Anthropic API error (authentication_error): '],
    ['{"error":{"code":"invalid_api_key"}}'],
    ['Unauthorized'],
    ['Request failed (HTTP 401)'],
  ])('reads %j as a rejected key', (raw) => {
    expect(getSimpleErrorMessage(raw)).toBe(INVALID_API_KEY_MESSAGE);
  });

  it.each([
    ['429'],
    ['HTTP 429'],
    ['openai API error 429: Too Many Requests'],
    ['Anthropic API error (rate_limit_error): {"type":"error"}'],
    ['Too Many Requests'],
    ['You exceeded the rate limit for this model.'],
    ['RESOURCE_EXHAUSTED: quota'],
  ])('reads %j as too many requests', (raw) => {
    expect(getSimpleErrorMessage(raw)).toBe(TOO_MANY_REQUESTS_MESSAGE);
  });

  it.each([
    ['500'],
    ['500 Internal Server Error'],
    ['HTTP/1.1 503 Service Unavailable'],
    ['HTTP status server error (502 Bad Gateway) for url (https://api.example.com/v1)'],
    ['Ollama API error 500: Internal Server Error'],
    ['Ollama API error 500: '],
    ['Ollama API error 500: {"truncated":'],
    ['status code: 504'],
    ['Anthropic API error (overloaded_error):'],
    ['Internal server error'],
  ])('reads %j as a server error', (raw) => {
    expect(getSimpleErrorMessage(raw)).toBe(SERVER_ERROR_MESSAGE);
  });

  it.each([
    ['Failed to fetch'],
    ['TypeError: Failed to fetch'],
    ['Load failed'],
    ['NetworkError when attempting to fetch resource.'],
    ['Network request failed'],
    ['fetch failed'],
    ['The Internet connection appears to be offline.'],
    ['error sending request for url (https://api.example.com/v1): error trying to connect'],
    ['connect ECONNREFUSED 127.0.0.1:443'],
    ['net::ERR_INTERNET_DISCONNECTED'],
  ])('reads %j as a failed connection', (raw) => {
    expect(getSimpleErrorMessage(raw)).toBe(CONNECTION_FAILED_MESSAGE);
    expect(getSimpleErrorMessage(new TypeError(raw))).toBe(CONNECTION_FAILED_MESSAGE);
  });

  it.each([
    ['Request timed out'],
    ['timeout'],
    ['operation timed out'],
    ['deadline has elapsed'],
    ['timeout of 30000ms exceeded'],
    ['error sending request for url (https://api.example.com/v1): operation timed out'],
    ['connect ETIMEDOUT 10.0.0.1:443'],
    ['HTTP 408'],
  ])('reads %j as taking too long', (raw) => {
    expect(getSimpleErrorMessage(raw)).toBe(TOOK_TOO_LONG_MESSAGE);
  });

  it('reads the stream watchdog marker', () => {
    expect(getSimpleErrorMessage('STREAM_WATCHDOG_TIMEOUT')).toBe(STREAM_STALLED_MESSAGE);
  });

  it('reads a structured code or status ahead of the words', () => {
    const coded = (llm_error_type: string) => ({
      type: 'LLMError',
      details: { llm_error_type, message: 'provider said something' },
    });
    expect(getSimpleErrorMessage(coded('RateLimitError'))).toBe(TOO_MANY_REQUESTS_MESSAGE);
    expect(getSimpleErrorMessage(coded('AuthenticationError'))).toBe(INVALID_API_KEY_MESSAGE);
    expect(getSimpleErrorMessage(coded('NetworkError'))).toBe(CONNECTION_FAILED_MESSAGE);
    expect(getSimpleErrorMessage(coded('Timeout'))).toBe(TOOK_TOO_LONG_MESSAGE);
    expect(getSimpleErrorMessage(coded('ContentFilterError'))).toBe('provider said something');
    expect(getSimpleErrorMessage(coded('constructor'))).toBe('provider said something');

    expect(getSimpleErrorMessage({ message: 'Too Many Requests', status: 429 })).toBe(
      TOO_MANY_REQUESTS_MESSAGE,
    );
    expect(getSimpleErrorMessage({ message: '', statusCode: 503 })).toBe(SERVER_ERROR_MESSAGE);
    expect(getSimpleErrorMessage({ message: 'HTTP 403', status: 403 })).toBe(
      REQUEST_REFUSED_MESSAGE,
    );
    expect(getSimpleErrorMessage({ message: 'No such schedule.', status: 404 })).toBe(
      'No such schedule.',
    );
    expect(
      getSimpleErrorMessage(Object.assign(new Error('connect failed'), { code: 'ECONNRESET' })),
    ).toBe(CONNECTION_FAILED_MESSAGE);
    expect(
      getSimpleErrorMessage(new DOMException('The operation timed out.', 'TimeoutError')),
    ).toBe(TOOK_TOO_LONG_MESSAGE);
  });

  it.each([
    [
      'Ollama API error 500: model requires more system memory (8.4 GiB) than is available (5.1 GiB)',
      'The model server reported an error: model requires more system memory (8.4 GiB) than is available (5.1 GiB)',
    ],
    [
      'Ollama API error 500: {"error":"model requires more memory"}',
      'The model server reported an error: model requires more memory',
    ],
    [
      'Anthropic API error (overloaded_error): Overloaded',
      'The model server reported an error: Overloaded',
    ],
    ['HTTP 503: the index is rebuilding', 'The server reported an error: the index is rebuilding'],
    ['502 Bad Gateway - upstream closed', 'The server reported an error: upstream closed'],
    ['status code: 500: disk quota reached', 'The server reported an error: disk quota reached'],
    [
      'openai API error 401: {"error":{"message":"Incorrect API key provided: sk-ab...yz","code":"invalid_api_key"}}',
      `${INVALID_API_KEY_MESSAGE} The model server said: Incorrect API key provided: sk-ab...yz`,
    ],
    [
      'Anthropic API error (authentication_error): invalid x-api-key',
      `${INVALID_API_KEY_MESSAGE} The model server said: invalid x-api-key`,
    ],
    ['HTTP 401: key rejected', `${INVALID_API_KEY_MESSAGE} The server said: key rejected`],
    [
      'openai API error 429: Rate limit exceeded. Retry after 60 seconds.',
      `${TOO_MANY_REQUESTS_MESSAGE} The model server said: Rate limit exceeded. Retry after 60 seconds.`,
    ],
    [
      'Anthropic API error (rate_limit_error): slow down',
      `${TOO_MANY_REQUESTS_MESSAGE} The model server said: slow down`,
    ],
    [
      'LM Studio API error 403: this model is not licensed for this machine',
      'The model server refused this request: this model is not licensed for this machine',
    ],
    [
      '403: the token lacks the files scope',
      'The server refused this request: the token lacks the files scope',
    ],
    ['403 Forbidden', REQUEST_REFUSED_MESSAGE],
    ['HTTP 408: upstream idle', `${TOOK_TOO_LONG_MESSAGE} The server said: upstream idle`],
  ])('keeps the detail a server sent after its status: %j', (raw, shown) => {
    expect(getSimpleErrorMessage(raw)).toBe(shown);
    expect(getSimpleErrorMessage(shown)).toBe(shown);
  });

  it('keeps the detail of a structured status', () => {
    expect(getSimpleErrorMessage({ message: 'The index is rebuilding.', status: 503 })).toBe(
      'The server reported an error: The index is rebuilding.',
    );
    expect(
      getSimpleErrorMessage(Object.assign(new Error('HTTP 429: slow down'), { status: 429 })),
    ).toBe(`${TOO_MANY_REQUESTS_MESSAGE} The server said: slow down`);
  });

  it('cleans and bounds the detail by the rule for a native reason', () => {
    const shown = getSimpleErrorMessage(
      `Ollama API error 500: out of\u0007 memory\nsecond line\nthird line ${'x'.repeat(400)}`,
    );
    expect(shown).toBe('The model server reported an error: out of  memory second line');

    const long = getSimpleErrorMessage(`Ollama API error 500: ${'no room '.repeat(80)}`);
    const detail = long.replace('The model server reported an error: ', '');
    expect(Array.from(detail).length).toBeGreaterThan(290);
    expect(Array.from(detail).length).toBeLessThanOrEqual(300);
    expect(detail.endsWith('\u2026')).toBe(true);
  });

  it('keeps a rollback note written after one of its own sentences', () => {
    const composed = `${TOO_MANY_REQUESTS_MESSAGE.replace(/\.$/, '')}. Previous live settings could not be fully restored: provider keys`;
    expect(getSimpleErrorMessage(new Error(composed))).toBe(composed);
  });

  it('leaves its own sentences as they are', () => {
    for (const sentence of [
      REQUEST_REFUSED_MESSAGE,
      CONNECTION_FAILED_MESSAGE,
      INVALID_API_KEY_MESSAGE,
      SERVER_ERROR_MESSAGE,
      STREAM_STALLED_MESSAGE,
      TOOK_TOO_LONG_MESSAGE,
      TOO_MANY_REQUESTS_MESSAGE,
      GENERIC_ERROR_MESSAGE,
    ]) {
      expect(getSimpleErrorMessage(sentence)).toBe(sentence);
    }
  });

  it('names the settings tab that holds the keys', () => {
    const tab = SETTINGS_NAV.find((entry) => entry.key === 'models-keys');
    expect(tab).toBeDefined();
    expect(INVALID_API_KEY_MESSAGE).toContain(`under ${tab?.label}.`);
  });
});
