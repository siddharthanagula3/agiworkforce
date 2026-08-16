import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

export const E2E_LOCAL_MODEL_ID = 'agi-e2e-local-fixture';
export const E2E_PROMPT_MARKER = 'VSCODE_E2E_STREAM_1';
export const E2E_FIRST_DELTA = 'installed-vsix-stream-a';
export const E2E_SECOND_DELTA = '-b';
export const E2E_COMPLETE_RESPONSE = `${E2E_FIRST_DELTA}${E2E_SECOND_DELTA}`;

const MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const MAX_FIRST_DELTA_HOLD_MS = 30_000;

interface CapturedChatRequest {
  authorizationHeaderPresent: boolean;
  contentType: string;
  includeUsage: unknown;
  messageCount: number;
  model: unknown;
  promptMarkerFound: boolean;
  remoteAddress: string;
  stream: unknown;
}

export interface LocalModelFixtureState {
  chatRequests: number;
  controlReleaseRequests: number;
  doneSent: boolean;
  errors: string[];
  firstDeltaSent: boolean;
  holdAfterFirstDeltaMs: number;
  holdReleased: boolean;
  lastChatRequest: CapturedChatRequest | null;
  modelId: string;
  modelRequests: number;
  ollamaProbeRequests: number;
  responseClosed: boolean;
  secondDeltaSent: boolean;
  streamCompleted: boolean;
}

export interface LocalModelFixture {
  baseUrl: string;
  close(): Promise<void>;
  configToml: string;
  controlToken: string;
  holdAfterFirstDeltaMs: number;
  modelId: string;
  releaseUrl: string;
  stateUrl: string;
}

export function parseFirstDeltaHoldMs(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return 0;
  if (!/^\d+$/u.test(value)) {
    throw new Error('AGI_VSCODE_E2E_FIRST_DELTA_HOLD_MS must be an integer');
  }
  const holdMs = Number(value);
  if (!Number.isSafeInteger(holdMs) || holdMs < 0 || holdMs > MAX_FIRST_DELTA_HOLD_MS) {
    throw new Error(
      `AGI_VSCODE_E2E_FIRST_DELTA_HOLD_MS must be between 0 and ${MAX_FIRST_DELTA_HOLD_MS}`,
    );
  }
  return holdMs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function headerValue(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name];
  if (Array.isArray(value)) return value.join(', ');
  return value ?? '';
}

function tokenMatches(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return (
    actualBytes.byteLength === expectedBytes.byteLength &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

function respondJson(response: ServerResponse, status: number, value: unknown): void {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(body);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > MAX_REQUEST_BODY_BYTES) {
      request.resume();
      throw new Error(`request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes`);
    }
    chunks.push(bytes);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`request body is not valid JSON: ${String(error)}`);
  }
}

function snapshotState(state: LocalModelFixtureState): LocalModelFixtureState {
  return {
    ...state,
    errors: [...state.errors],
    lastChatRequest: state.lastChatRequest === null ? null : { ...state.lastChatRequest },
  };
}

function listen(server: Server): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('LM Studio fixture did not receive a TCP address'));
        return;
      }
      resolve(address);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
    server.closeAllConnections();
  });
}

export async function startLocalModelFixture(
  holdAfterFirstDeltaMs: number,
): Promise<LocalModelFixture> {
  if (
    !Number.isSafeInteger(holdAfterFirstDeltaMs) ||
    holdAfterFirstDeltaMs < 0 ||
    holdAfterFirstDeltaMs > MAX_FIRST_DELTA_HOLD_MS
  ) {
    throw new Error(`Invalid first-delta hold: ${holdAfterFirstDeltaMs}`);
  }

  const controlToken = randomBytes(24).toString('hex');
  const state: LocalModelFixtureState = {
    chatRequests: 0,
    controlReleaseRequests: 0,
    doneSent: false,
    errors: [],
    firstDeltaSent: false,
    holdAfterFirstDeltaMs,
    holdReleased: holdAfterFirstDeltaMs === 0,
    lastChatRequest: null,
    modelId: E2E_LOCAL_MODEL_ID,
    modelRequests: 0,
    ollamaProbeRequests: 0,
    responseClosed: false,
    secondDeltaSent: false,
    streamCompleted: false,
  };
  let releaseRequested = false;
  let releaseCurrentHold: (() => void) | undefined;
  let baseUrl = '';

  const waitAfterFirstDelta = async (): Promise<void> => {
    if (holdAfterFirstDeltaMs === 0 || releaseRequested) {
      state.holdReleased = true;
      return;
    }
    await Promise.race([
      new Promise<void>((resolve) => {
        releaseCurrentHold = resolve;
      }),
      new Promise<void>((resolve) => setTimeout(resolve, holdAfterFirstDeltaMs)),
    ]);
    releaseCurrentHold = undefined;
    state.holdReleased = true;
  };

  const server = createServer((request, response) => {
    void (async () => {
      const requestUrl = new URL(request.url ?? '/', baseUrl);
      const isControlRoute = requestUrl.pathname.startsWith('/__agi_e2e/');
      if (
        isControlRoute &&
        !tokenMatches(headerValue(request.headers, 'x-agi-e2e-token'), controlToken)
      ) {
        respondJson(response, 403, { error: 'invalid fixture control token' });
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/__agi_e2e/state') {
        respondJson(response, 200, snapshotState(state));
        return;
      }
      if (request.method === 'POST' && requestUrl.pathname === '/__agi_e2e/release') {
        state.controlReleaseRequests += 1;
        releaseRequested = true;
        releaseCurrentHold?.();
        respondJson(response, 200, { released: true });
        return;
      }
      if (request.method === 'GET' && requestUrl.pathname === '/v1/models') {
        state.modelRequests += 1;
        respondJson(response, 200, {
          data: [{ id: E2E_LOCAL_MODEL_ID, object: 'model', owned_by: 'agi-e2e' }],
          object: 'list',
        });
        return;
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/tags') {
        state.ollamaProbeRequests += 1;
        respondJson(response, 200, { models: [] });
        return;
      }
      if (request.method === 'POST' && requestUrl.pathname === '/v1/chat/completions') {
        state.chatRequests += 1;
        const body = await readJsonBody(request);
        const serializedBody = JSON.stringify(body);
        const contentType = headerValue(request.headers, 'content-type');
        const model = isRecord(body) ? body.model : undefined;
        const stream = isRecord(body) ? body.stream : undefined;
        const streamOptions =
          isRecord(body) && isRecord(body.stream_options) ? body.stream_options : undefined;
        const includeUsage = streamOptions?.include_usage;
        const messages = isRecord(body) && Array.isArray(body.messages) ? body.messages : [];
        const promptMarkerFound = serializedBody.includes(E2E_PROMPT_MARKER);
        state.lastChatRequest = {
          authorizationHeaderPresent: headerValue(request.headers, 'authorization') !== '',
          contentType,
          includeUsage,
          messageCount: messages.length,
          model,
          promptMarkerFound,
          remoteAddress: request.socket.remoteAddress ?? '',
          stream,
        };

        const validationErrors: string[] = [];
        if (!isRecord(body)) validationErrors.push('chat body must be a JSON object');
        if (model !== E2E_LOCAL_MODEL_ID) {
          validationErrors.push(`chat model must be ${E2E_LOCAL_MODEL_ID}`);
        }
        if (stream !== true) validationErrors.push('chat request must enable streaming');
        if (includeUsage !== true) {
          validationErrors.push('chat request must request streamed usage');
        }
        if (messages.length === 0) validationErrors.push('chat request must include messages');
        if (!promptMarkerFound) {
          validationErrors.push(`chat request must contain ${E2E_PROMPT_MARKER}`);
        }
        if (!contentType.toLowerCase().startsWith('application/json')) {
          validationErrors.push('chat request must use application/json');
        }
        if (validationErrors.length > 0) {
          state.errors.push(...validationErrors);
          respondJson(response, 400, { errors: validationErrors });
          return;
        }

        response.once('close', () => {
          state.responseClosed = true;
        });
        response.writeHead(200, {
          'cache-control': 'no-cache, no-store',
          connection: 'keep-alive',
          'content-type': 'text/event-stream; charset=utf-8',
        });
        response.write(
          `data: ${JSON.stringify({
            choices: [
              {
                delta: { content: E2E_FIRST_DELTA },
                finish_reason: null,
                index: 0,
              },
            ],
          })}\n\n`,
        );
        state.firstDeltaSent = true;
        await waitAfterFirstDelta();
        response.write(
          `data: ${JSON.stringify({
            choices: [
              {
                delta: { content: E2E_SECOND_DELTA },
                finish_reason: null,
                index: 0,
              },
            ],
          })}\n\n`,
        );
        state.secondDeltaSent = true;
        response.write(
          `data: ${JSON.stringify({
            choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
            usage: { completion_tokens: 2, prompt_tokens: 1 },
          })}\n\n`,
        );
        response.write('data: [DONE]\n\n');
        state.doneSent = true;
        state.streamCompleted = true;
        response.end();
        return;
      }

      respondJson(response, 404, { error: 'unknown fixture route' });
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      state.errors.push(`fixture handler failed: ${message}`);
      if (response.headersSent) response.destroy(error instanceof Error ? error : undefined);
      else respondJson(response, 500, { error: message });
    });
  });

  const address = await listen(server);
  baseUrl = `http://127.0.0.1:${address.port}`;
  const providerBaseUrl = `${baseUrl}/v1`;
  const stateUrl = `${baseUrl}/__agi_e2e/state`;
  const releaseUrl = `${baseUrl}/__agi_e2e/release`;
  const configToml = `[default]\nmodel = ${JSON.stringify(E2E_LOCAL_MODEL_ID)}\nprovider = "lmstudio"\nstream = true\nmax_tokens = 256\napproval_mode = "suggest"\n\n[ui]\nprivacy_mode = "local"\n\n[providers.lmstudio]\nbase_url = ${JSON.stringify(providerBaseUrl)}\n\n[providers.ollama]\nbase_url = ${JSON.stringify(baseUrl)}\n`;

  return {
    baseUrl: providerBaseUrl,
    close: async () => {
      releaseRequested = true;
      releaseCurrentHold?.();
      await closeServer(server);
    },
    configToml,
    controlToken,
    holdAfterFirstDeltaMs,
    modelId: E2E_LOCAL_MODEL_ID,
    releaseUrl,
    stateUrl,
  };
}
