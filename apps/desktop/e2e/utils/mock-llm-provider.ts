import { Page, Route } from '@playwright/test';

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
      // Shared handler — used for both `/api/chat/completions` (legacy proxy)
      // and `/api/llm/v1/chat/completions` (WebRuntime → cloudApi.sendCloudMessage,
      // the actual path the v3 ChatInterface fires from when running in browser
      // mode under Playwright). Without the second pattern, send goes to the
      // real cloud endpoint, returns 4xx, and no assistant message ever
      // renders — which broke self-healing.spec.ts after Wave 4+5's WebRuntime
      // wired through cloudApi.
      const handleChatCompletions = (route: Route) => {
        try {
          const request = route.request();
          const postData = request.postDataJSON();
          const prompt = postData?.messages?.[0]?.content || '';
          const isStreaming = postData?.stream === true;
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

          if (isStreaming) {
            // Emit OpenAI-compat SSE chunks so cloudApi's SSE parser pumps
            // content into the chat store as assistant message deltas.
            const chunkBody = JSON.stringify({
              id: 'mock-chatcmpl-' + Date.now(),
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: 'mock-model',
              choices: [
                { index: 0, delta: { role: 'assistant', content: response }, finish_reason: null },
              ],
            });
            const doneBody = JSON.stringify({
              id: 'mock-chatcmpl-' + Date.now(),
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: 'mock-model',
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            });
            route.fulfill({
              status: 200,
              contentType: 'text/event-stream',
              headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
              body: `data: ${chunkBody}\n\ndata: ${doneBody}\n\ndata: [DONE]\n\n`,
            });
            return;
          }

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
      };

      await this.page.route('**/api/chat/completions', handleChatCompletions);
      this.registeredRoutes.add('**/api/chat/completions');

      // Wave 4+5: WebRuntime → cloudApi.sendCloudMessage targets this path.
      await this.page.route('**/api/llm/v1/chat/completions', handleChatCompletions);
      this.registeredRoutes.add('**/api/llm/v1/chat/completions');

      // Cloud chat backend — useChat.sendMessage aborts at line 396 if no
      // activeConversationId is set. The desktop chat store auto-creates the
      // conversation via cloudApi.createCloudConversation → POST /api/cloud-chat.
      // Without this mock the fetch fails, conversation creation throws,
      // convId stays null, and the LLM mock above is never reached.
      await this.page.route('**/api/cloud-chat', (route) => {
        const method = route.request().method();
        if (method === 'POST') {
          let body: { title?: string; model?: string } = {};
          try {
            body = route.request().postDataJSON() ?? {};
          } catch {
            // empty body — fine
          }
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              conversation: {
                id: 'mock-conv-' + Date.now(),
                title: body.title ?? 'E2E Test',
                model: body.model ?? 'mock-model',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                user_id: 'e2e-mock-user-id',
              },
            }),
          });
          return;
        }
        // GET — list conversations
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ conversations: [] }),
        });
      });
      this.registeredRoutes.add('**/api/cloud-chat');

      // Single-conversation fetch + message-list endpoints.
      await this.page.route('**/api/cloud-chat/**', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            conversation: {
              id: 'mock-conv-existing',
              title: 'E2E Test',
              model: 'mock-model',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              user_id: 'e2e-mock-user-id',
            },
            messages: [],
          }),
        });
      });
      this.registeredRoutes.add('**/api/cloud-chat/**');

      // CSRF token endpoint — getAuthHeaders fetches this in web mode. Failure
      // is non-fatal but slow (no timeout on the fetch); mocking keeps the
      // auth path deterministic and fast.
      await this.page.route('**/api/csrf', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ token: 'mock-csrf-token' }),
        });
      });
      this.registeredRoutes.add('**/api/csrf');

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

      // Layer 4: Pre-populate the unified-chat store with an active conversation
      // so useChat.addMsg can actually append the user message. Without this,
      // hostBridge is undefined in Playwright web mode, addMsg silently no-ops
      // (line 65 if-check), convId stays null, useChat.sendMessage aborts with
      // "Failed to create conversation" toast, and no LLM call ever fires.
      // The chat store uses zustand+persist with key `unified-chat-store`.
      await this.page.addInitScript(() => {
        const conversationId = 'e2e-mock-conversation';
        const chatStoreState = {
          state: {
            activeConversationId: conversationId,
            conversations: [
              {
                id: conversationId,
                title: 'E2E Test Conversation',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
            messagesByConversation: { [conversationId]: [] },
            isStreaming: false,
            streamingContent: '',
            streamingReasoning: '',
            activeMode: 'chat',
            webSearchEnabled: false,
          },
          version: 1,
        };
        localStorage.setItem('unified-chat-store', JSON.stringify(chatStoreState));
      });

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
