import { Page } from '@playwright/test';

export class MockLLMProvider {
  private page: Page;
  private mockResponses: Map<string, string>;

  constructor(page: Page) {
    this.page = page;
    this.mockResponses = new Map();
  }

  async setup() {
    // Intercept API calls to LLM providers and return mock responses
    await this.page.route('**/api/chat/completions', (route) => {
      const request = route.request();
      const postData = request.postDataJSON();
      const prompt = postData?.messages?.[0]?.content || '';

      const response = this.getResponseForPrompt(prompt);

      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-response-' + Date.now(),
          object: 'chat.completion',
          created: Date.now(),
          model: 'mock-model',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: response,
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          },
        }),
      });
    });

    // Mock streaming responses
    await this.page.route('**/api/chat/stream', async (route) => {
      const request = route.request();
      const postData = request.postDataJSON();
      const prompt = postData?.messages?.[0]?.content || '';

      const response = this.getResponseForPrompt(prompt);

      // Simulate SSE streaming
      const chunks = response.split(' ');
      let streamContent = '';

      for (const chunk of chunks) {
        streamContent += `data: ${JSON.stringify({
          id: 'mock-stream-' + Date.now(),
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'mock-model',
          choices: [
            {
              index: 0,
              delta: { content: chunk + ' ' },
              finish_reason: null,
            },
          ],
        })}\n\n`;
      }

      streamContent += 'data: [DONE]\n\n';

      route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: streamContent,
      });
    });

    // Mock Tauri commands for LLM operations
    await this.page.addInitScript(() => {
      // @ts-ignore
      window.__TAURI__ = window.__TAURI__ || {};
      // @ts-ignore
      window.__TAURI__.invoke = async (cmd: string, args: any) => {
        console.log('[Mock] Tauri command:', cmd, args);

        if (cmd === 'send_message') {
          return {
            success: true,
            message: 'This is a mock response from the LLM provider.',
          };
        }

        if (cmd === 'get_provider_status') {
          return {
            provider: 'ollama',
            available: true,
          };
        }

        return { success: true };
      };
    });
  }

  async teardown() {
    await this.page.unroute('**/api/chat/completions');
    await this.page.unroute('**/api/chat/stream');
  }

  setMockResponse(pattern: string | RegExp, response: string) {
    const key = pattern instanceof RegExp ? pattern.source : pattern;
    this.mockResponses.set(key, response);
  }

  private getResponseForPrompt(prompt: string): string {
    // Check for pattern matches
    for (const [pattern, response] of this.mockResponses.entries()) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(prompt)) {
        return response;
      }
    }

    // Default responses based on keywords
    if (/plan|planning|strategy/i.test(prompt)) {
      return 'I will create a plan with the following steps:\n1. Analyze requirements\n2. Design solution\n3. Implement changes\n4. Test thoroughly\n5. Deploy and monitor';
    }

    if (/code|program|function/i.test(prompt)) {
      return '```typescript\nfunction example() {\n  console.log("This is mock code");\n  return true;\n}\n```';
    }

    if (/error|bug|issue/i.test(prompt)) {
      return 'The error appears to be caused by an invalid parameter. Try validating your inputs before execution.';
    }

    if (/file|read|write/i.test(prompt)) {
      return 'I will perform the file operation safely with proper validation and error handling.';
    }

    // Default response
    return 'This is a mock LLM response. The actual implementation would provide contextual answers based on the prompt.';
  }
}
