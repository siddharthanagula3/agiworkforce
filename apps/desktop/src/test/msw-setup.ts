import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';

export const handlers = [
  http.post('https://api.openai.com/v1/chat/completions', async () => {
    //api.openai.com/v1/chat/completions', async () => {//api.openai.com/v1/chat/completions', async () => {
    return HttpResponse.json({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: Date.now(),
      model: 'gpt-5.1',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is a test response from OpenAI',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    });
  }),

  http.post('https://api.openai.com/v1/chat/completions', async () => {
    //api.openai.com/v1/chat/completions', async () => {//api.openai.com/v1/chat/completions', async () => {
    return HttpResponse.json({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'This is a test response from Anthropic',
        },
      ],
      model: 'claude-opus-4-5',
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 10,
        output_tokens: 20,
      },
    });
  }),

  http.post('http://localhost:11434/api/chat', async () => {
    //localhost:11434/api/chat', async () => {
    return HttpResponse.json({
      model: 'llama3',
      created_at: new Date().toISOString(),
      message: {
        role: 'assistant',
        content: 'This is a test response from Ollama',
      },
      done: true,
    });
  }),
];

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));

afterEach(() => server.resetHandlers());

afterAll(() => server.close());
