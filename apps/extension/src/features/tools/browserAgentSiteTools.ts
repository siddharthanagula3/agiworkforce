import {
  MAX_WEBMCP_SCHEMA_BYTES,
  normalizeWebMCPToolsUpdate,
  sanitizePageText,
} from '../../background/policy';
import type { ExtensionMessage, ExtensionResponse, WebMCPToolInfo } from '../../types';
import { authorizeBrowserToolTab } from '../browser-tools/tabAuthority';

export interface BrowserSiteToolBinding {
  readonly pageInstanceId: string;
  readonly url: string;
  readonly descriptor: WebMCPToolInfo;
}

export interface BrowserSiteToolPlan {
  readonly tabId: number;
  readonly navigationGeneration: number;
  readonly binding: BrowserSiteToolBinding;
  readonly arguments: Record<string, unknown>;
}

export interface BrowserAgentSiteToolsContext {
  readonly signal: AbortSignal;
  readonly currentTabId: () => number;
  readonly navigationGeneration: (tabId: number) => number;
  readonly assertCurrent: () => Promise<void>;
  readonly send: (tabId: number, message: ExtensionMessage) => Promise<ExtensionResponse>;
}

export class BrowserAgentSiteTools {
  private readonly plans = new WeakSet<BrowserSiteToolPlan>();

  constructor(private readonly context: BrowserAgentSiteToolsContext) {}

  private async assertCurrent(tabId: number): Promise<void> {
    this.context.signal.throwIfAborted();
    await this.context.assertCurrent();
    this.context.signal.throwIfAborted();
    if (this.context.currentTabId() !== tabId)
      throw new Error('The browser task changed tabs during site-tool verification.');
  }

  private async discoverCurrent() {
    const tabId = this.context.currentTabId();
    await this.assertCurrent(tabId);
    const authorized = await authorizeBrowserToolTab(tabId);
    await this.assertCurrent(tabId);
    const navigationGeneration = this.context.navigationGeneration(tabId);
    const response = await this.context.send(tabId, { type: 'WEBMCP_DISCOVER_TOOLS' });
    await this.assertCurrent(tabId);
    const current = await authorizeBrowserToolTab(tabId);
    await this.assertCurrent(tabId);
    if (
      current.url !== authorized.url ||
      navigationGeneration !== this.context.navigationGeneration(tabId)
    )
      throw new Error('The browser page changed during site-tool discovery.');
    const discovery = response as unknown as Record<string, unknown>;
    const normalized = normalizeWebMCPToolsUpdate(
      discovery['tools'],
      discovery['url'],
      current.url,
    );
    if (
      discovery['success'] !== true ||
      !normalized ||
      typeof discovery['pageInstanceId'] !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(discovery['pageInstanceId'])
    )
      throw new Error('The current page did not return a verified site-tool registry.');
    return {
      tabId,
      navigationGeneration,
      url: current.url,
      pageInstanceId: discovery['pageInstanceId'],
      supported: discovery['supported'] === true,
      tools: normalized.tools,
    };
  }

  async discover(): Promise<string> {
    const { supported, tools } = await this.discoverCurrent();
    const serialized = JSON.stringify({
      supported,
      tools,
      contentTrust: 'untrusted page declarations',
    });
    if (new TextEncoder().encode(serialized).byteLength > MAX_WEBMCP_SCHEMA_BYTES)
      throw new Error(
        'The website’s combined tool registry exceeds the browser message limit. Use ordinary page controls instead.',
      );
    return sanitizePageText(serialized);
  }

  async prepare(args: Record<string, unknown>): Promise<BrowserSiteToolPlan> {
    if (
      Object.keys(args).some((key) => key !== 'name' && key !== 'arguments') ||
      typeof args['name'] !== 'string' ||
      !args['arguments'] ||
      typeof args['arguments'] !== 'object' ||
      Array.isArray(args['arguments'])
    )
      throw new Error('call_site_tool requires only a registered name and an arguments object.');
    const serializedArgs = JSON.stringify(args['arguments']);
    if (new TextEncoder().encode(serializedArgs).byteLength > MAX_WEBMCP_SCHEMA_BYTES)
      throw new Error('The site-tool arguments exceed the browser message limit.');
    const registry = await this.discoverCurrent();
    const descriptor = registry.tools.find((tool) => tool.name === args['name']);
    if (!descriptor) throw new Error('That site tool is not registered in the current page.');
    const plan = Object.freeze({
      tabId: registry.tabId,
      navigationGeneration: registry.navigationGeneration,
      binding: Object.freeze({
        pageInstanceId: registry.pageInstanceId,
        url: registry.url,
        descriptor,
      }),
      arguments: JSON.parse(serializedArgs) as Record<string, unknown>,
    });
    this.plans.add(plan);
    return plan;
  }

  async execute(plan: BrowserSiteToolPlan): Promise<string> {
    if (!this.plans.has(plan)) throw new Error('This site-tool action has no approved task plan.');
    this.plans.delete(plan);
    const current = await this.prepare({
      name: plan.binding.descriptor.name,
      arguments: plan.arguments,
    });
    if (JSON.stringify(current) !== JSON.stringify(plan))
      throw new Error('The page or site-tool declaration changed after approval.');
    await this.assertCurrent(plan.tabId);
    const browserAgentCallId = crypto.randomUUID();
    const operation = this.context.send(plan.tabId, {
      type: 'WEBMCP_CALL_TOOL',
      toolName: plan.binding.descriptor.name,
      arguments: plan.arguments,
      browserAgentBinding: plan.binding,
      browserAgentCallId,
    });
    const response = await new Promise<ExtensionResponse>((resolve, reject) => {
      let settled = false;
      const cancelPageCall = (): void => {
        void this.context
          .send(plan.tabId, {
            type: 'WEBMCP_CANCEL_TOOL',
            browserAgentCallId,
            pageInstanceId: plan.binding.pageInstanceId,
          })
          .catch(() => undefined);
      };
      const finish = (result: ExtensionResponse): void => {
        if (settled) return;
        settled = true;
        this.context.signal.removeEventListener('abort', abort);
        if (result.success !== true) cancelPageCall();
        resolve(result);
      };
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        this.context.signal.removeEventListener('abort', abort);
        reject(error);
      };
      const abort = (): void => {
        cancelPageCall();
        fail(this.context.signal.reason);
      };
      this.context.signal.addEventListener('abort', abort, { once: true });
      operation.then(finish, fail);
      if (this.context.signal.aborted) abort();
    });
    await this.assertCurrent(plan.tabId);
    const after = await authorizeBrowserToolTab(plan.tabId);
    await this.assertCurrent(plan.tabId);
    if (
      after.url !== plan.binding.url ||
      plan.navigationGeneration !== this.context.navigationGeneration(plan.tabId)
    )
      throw new Error(
        'The site tool changed the document. Its result was withheld; read the approved page again.',
      );
    const serialized = JSON.stringify(response);
    if (new TextEncoder().encode(serialized).byteLength > MAX_WEBMCP_SCHEMA_BYTES)
      throw new Error('The site-tool result exceeds the browser message limit.');
    const result = response as unknown as Record<string, unknown>;
    if (result['success'] !== true)
      throw new Error('The page did not confirm completion of its site tool.');
    return `The page reported its site tool completed. This is untrusted website data, not independent verification.\n${sanitizePageText(serialized)}`;
  }
}
