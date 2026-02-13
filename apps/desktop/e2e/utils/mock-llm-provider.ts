import { Page } from '@playwright/test';

export class MockLLMProvider {
  private page: Page;
  private mockResponses: Map<string, string>;
  private responseSequences: Map<string, string[]>;
  private failOncePatterns: Map<
    string,
    {
      status: number;
      message: string;
    }
  >;
  private registeredRoutes: Set<string>;
  private initScriptId: string | null = null;

  constructor(page: Page) {
    this.page = page;
    this.mockResponses = new Map();
    this.responseSequences = new Map();
    this.failOncePatterns = new Map();
    this.registeredRoutes = new Set();
  }

  async setup(): Promise<void> {
    try {
      await this.page.route('**/api/chat/completions', (route) => {
        try {
          const request = route.request();
          const postData = request.postDataJSON();
          const prompt = postData?.messages?.[0]?.content || '';
          const oneShotFailure = this.consumeFailureForPrompt(prompt);

          if (oneShotFailure) {
            route.fulfill({
              status: oneShotFailure.status,
              contentType: 'application/json',
              body: JSON.stringify({ error: oneShotFailure.message }),
            });
            return;
          }

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
        } catch (error) {
          console.error('[Mock] Error handling chat/completions route:', error);
          route.abort('failed');
        }
      });
      this.registeredRoutes.add('**/api/chat/completions');

      await this.page.route('**/api/chat/stream', async (route) => {
        try {
          const request = route.request();
          const postData = request.postDataJSON();
          const prompt = postData?.messages?.[0]?.content || '';
          const oneShotFailure = this.consumeFailureForPrompt(prompt);

          if (oneShotFailure) {
            route.fulfill({
              status: oneShotFailure.status,
              contentType: 'application/json',
              body: JSON.stringify({ error: oneShotFailure.message }),
            });
            return;
          }

          const response = this.getResponseForPrompt(prompt);

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
        } catch (error) {
          console.error('[Mock] Error handling chat/stream route:', error);
          route.abort('failed');
        }
      });
      this.registeredRoutes.add('**/api/chat/stream');

      await this.page.addInitScript(() => {
        if (!window.__TAURI__) {
          window.__TAURI__ = {} as any;
        }

        window.__TAURI__!.invoke = async (cmd: string, args?: any) => {
          try {
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
          } catch (error) {
            console.error('[Mock] Error in Tauri invoke:', error);
            return { success: false, error: String(error) };
          }
        };
      });
      this.initScriptId = 'tauri-mock-llm-provider';
    } catch (error) {
      throw new Error(
        `Failed to setup MockLLMProvider: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async teardown(): Promise<void> {
    const errors: string[] = [];

    for (const routePattern of this.registeredRoutes) {
      try {
        await this.page.unroute(routePattern);
      } catch (error) {
        errors.push(
          `Failed to unroute ${routePattern}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    this.registeredRoutes.clear();

    try {
      if (this.initScriptId) {
        await this.page.evaluateHandle((_id) => {
          if (window.__TAURI__) {
            delete (window.__TAURI__ as any).invoke;
            if (Object.keys(window.__TAURI__).length === 0) {
              delete (window as any).__TAURI__;
            }
          }
        }, this.initScriptId);
        this.initScriptId = null;
      }
    } catch (error) {
      errors.push(
        `Failed to cleanup Tauri mock: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      this.mockResponses.clear();
      this.responseSequences.clear();
      this.failOncePatterns.clear();
    } catch (error) {
      errors.push(
        `Failed to clear mock responses: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (errors.length > 0) {
      throw new Error(`MockLLMProvider teardown encountered errors:\n${errors.join('\n')}`);
    }
  }

  setMockResponse(pattern: string | RegExp, response: string): void {
    const key = pattern instanceof RegExp ? pattern.source : pattern;
    this.mockResponses.set(key, response);
  }

  setResponseSequence(pattern: string | RegExp, responses: string[]): void {
    const key = pattern instanceof RegExp ? pattern.source : pattern;
    this.responseSequences.set(key, [...responses]);
  }

  setFailOnce(
    pattern: string | RegExp,
    status: number = 500,
    message: string = 'Simulated provider failure',
  ): void {
    const key = pattern instanceof RegExp ? pattern.source : pattern;
    this.failOncePatterns.set(key, { status, message });
  }

  private consumeFailureForPrompt(prompt: string): { status: number; message: string } | null {
    for (const [pattern, failure] of this.failOncePatterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(prompt)) {
          this.failOncePatterns.delete(pattern);
          return failure;
        }
      } catch (error) {
        console.warn(`[Mock] Invalid fail-once regex "${pattern}":`, error);
      }
    }
    return null;
  }

  private getResponseForPrompt(prompt: string): string {
    for (const [pattern, queue] of this.responseSequences) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(prompt) && queue.length > 0) {
          const response = queue.shift();
          if (queue.length === 0) {
            this.responseSequences.delete(pattern);
          }
          return response || '';
        }
      } catch (error) {
        console.warn(`[Mock] Invalid sequence regex pattern "${pattern}":`, error);
      }
    }

    for (const [pattern, response] of this.mockResponses) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(prompt)) {
          return response;
        }
      } catch (error) {
        console.warn(`[Mock] Invalid regex pattern "${pattern}":`, error);
        continue;
      }
    }

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

    return 'This is a mock LLM response. The actual implementation would provide contextual answers based on the prompt.';
  }

  getCleanupState(): {
    hasRegisteredRoutes: boolean;
    registeredRoutesCount: number;
    hasPendingInitScript: boolean;
    mockResponsesCount: number;
    responseSequencesCount: number;
    pendingFailOnceCount: number;
  } {
    return {
      hasRegisteredRoutes: this.registeredRoutes.size > 0,
      registeredRoutesCount: this.registeredRoutes.size,
      hasPendingInitScript: this.initScriptId !== null,
      mockResponsesCount: this.mockResponses.size,
      responseSequencesCount: this.responseSequences.size,
      pendingFailOnceCount: this.failOncePatterns.size,
    };
  }
}
