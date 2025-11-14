import { Page } from '@playwright/test';

/**
 * MockLLMProvider - Manages mock LLM API responses and Tauri command handling for E2E tests
 *
 * Features:
 * - Intercepts and mocks LLM provider API calls
 * - Simulates SSE streaming responses
 * - Mocks Tauri IPC commands
 * - Comprehensive resource cleanup with error handling
 * - Pattern-based custom mock responses
 *
 * @example
 * const mockProvider = new MockLLMProvider(page);
 * await mockProvider.setup();
 * mockProvider.setMockResponse('plan', 'Custom planning response');
 * // ... run tests ...
 * await mockProvider.teardown();
 */
export class MockLLMProvider {
  private page: Page;
  private mockResponses: Map<string, string>;
  private registeredRoutes: Set<string>;
  private initScriptId: string | null = null;

  constructor(page: Page) {
    this.page = page;
    this.mockResponses = new Map();
    this.registeredRoutes = new Set();
  }

  /**
   * Sets up mock LLM provider with route interception and Tauri command mocking
   * @throws {Error} If route setup or init script injection fails
   */
  async setup(): Promise<void> {
    try {
      // Intercept API calls to LLM providers and return mock responses
      await this.page.route('**/api/chat/completions', (route) => {
        try {
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
        } catch (error) {
          console.error('[Mock] Error handling chat/completions route:', error);
          route.abort('failed');
        }
      });
      this.registeredRoutes.add('**/api/chat/completions');

      // Mock streaming responses
      await this.page.route('**/api/chat/stream', async (route) => {
        try {
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
        } catch (error) {
          console.error('[Mock] Error handling chat/stream route:', error);
          route.abort('failed');
        }
      });
      this.registeredRoutes.add('**/api/chat/stream');

      // Mock Tauri commands for LLM operations
      await this.page.addInitScript(() => {
        // Initialize Tauri mock if not already present
        if (!window.__TAURI__) {
          window.__TAURI__ = {} as any;
        }

        // Mock the invoke function
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

  /**
   * Tears down mock LLM provider, cleaning up all registered routes and scripts
   * @throws {Error} If cleanup fails after attempting all cleanup operations
   */
  async teardown(): Promise<void> {
    const errors: string[] = [];

    // Unroute all registered routes
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

    // Clean up Tauri mock injection
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

    // Clear mock responses
    try {
      this.mockResponses.clear();
    } catch (error) {
      errors.push(
        `Failed to clear mock responses: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Throw aggregated errors if any cleanup failed
    if (errors.length > 0) {
      throw new Error(`MockLLMProvider teardown encountered errors:\n${errors.join('\n')}`);
    }
  }

  /**
   * Sets a custom mock response for a specific prompt pattern
   * @param pattern - String pattern or RegExp to match against prompts
   * @param response - The mock response to return for matching prompts
   */
  setMockResponse(pattern: string | RegExp, response: string): void {
    const key = pattern instanceof RegExp ? pattern.source : pattern;
    this.mockResponses.set(key, response);
  }

  /**
   * Gets the mock response for a given prompt
   * Checks custom patterns first, then falls back to default keyword-based responses
   * @param prompt - The input prompt to match
   * @returns The appropriate mock response
   */
  private getResponseForPrompt(prompt: string): string {
    // Check for pattern matches
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

  /**
   * Returns the current cleanup state for testing/debugging purposes
   * @returns Object containing cleanup state information
   */
  getCleanupState(): {
    hasRegisteredRoutes: boolean;
    registeredRoutesCount: number;
    hasPendingInitScript: boolean;
    mockResponsesCount: number;
  } {
    return {
      hasRegisteredRoutes: this.registeredRoutes.size > 0,
      registeredRoutesCount: this.registeredRoutes.size,
      hasPendingInitScript: this.initScriptId !== null,
      mockResponsesCount: this.mockResponses.size,
    };
  }
}
