import { logger } from './utils';
import { safeJsonParse, MAX_WEBMCP_SCHEMA_BYTES } from './background/policy';
import {
  describeSiteToolApproval,
  effectFromAnnotations,
  effectFromFormMethod,
  planSiteToolCall,
  type SiteToolEffect,
} from './features/tools/siteToolRegistry';
import { authorizeBrowserToolUrl } from './features/browser-tools/tabAuthority';

function escapeAttrValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const TOOL_NAME_MAX_CHARS = 64;
const TOOL_DESCRIPTION_MAX_CHARS = 500;
const TOOL_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_\-. ]{0,63}$/;

function isValidToolName(name: string): boolean {
  return name.length <= TOOL_NAME_MAX_CHARS && TOOL_NAME_PATTERN.test(name);
}

export interface WebMCPToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  source: 'imperative' | 'declarative';
  effect: SiteToolEffect;
}

export interface WebMCPDiscoveryResult {
  supported: boolean;
  tools: WebMCPToolInfo[];
  url: string;
  timestamp: number;
}

export interface WebMCPCallToolRequest {
  name: string;
  arguments?: Record<string, unknown>;
  assertCurrent?: () => void;
  source?: 'imperative' | 'declarative';
  signal?: AbortSignal;
}

export interface WebMCPCallToolResponse {
  success: boolean;
  result?: unknown;
  error?: string;
  /** Set when a failed site-tool call was completed through the page's own form. */
  fellBackToDom?: boolean;
}

export function discoverDeclarativeTools(): WebMCPToolInfo[] {
  const tools: WebMCPToolInfo[] = [];

  const forms = document.querySelectorAll('form[tool-name]');
  for (const form of forms) {
    const rawName = form.getAttribute('tool-name');
    const rawDescription = form.getAttribute('tool-description') || '';
    if (!rawName) continue;
    if (!isValidToolName(rawName)) {
      logger.debug('WebMCP: tool-name rejected (length or character class)', {
        nameSnippet: rawName.slice(0, 32),
      });
      continue;
    }
    const name = rawName;
    const description = rawDescription.slice(0, TOOL_DESCRIPTION_MAX_CHARS);

    const properties: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];

    const fields = form.querySelectorAll('input[name], select[name], textarea[name]');
    for (const field of fields) {
      const fieldName = field.getAttribute('name');
      if (!fieldName) continue;
      if (!isValidToolName(fieldName)) {
        logger.debug('WebMCP: param name rejected (length or character class)', {
          nameSnippet: fieldName.slice(0, 32),
        });
        continue;
      }

      const paramDesc = (field.getAttribute('tool-param-description') || '').slice(
        0,
        TOOL_DESCRIPTION_MAX_CHARS,
      );
      const fieldType = field.getAttribute('type') || 'text';
      const isRequired = field.hasAttribute('required');

      let schemaType = 'string';
      if (fieldType === 'number' || fieldType === 'range') schemaType = 'number';
      if (fieldType === 'checkbox') schemaType = 'boolean';

      properties[fieldName] = {
        type: schemaType,
        ...(paramDesc ? { description: paramDesc } : {}),
      };

      if (isRequired) required.push(fieldName);
    }

    tools.push({
      name,
      description,
      inputSchema: {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
      },
      source: 'declarative',
      effect: effectFromFormMethod(form.getAttribute('method')),
    });
  }

  return tools;
}

export function discoverImperativeTools(): WebMCPToolInfo[] {
  const tools: WebMCPToolInfo[] = [];

  const testing = (
    navigator as {
      modelContextTesting?: {
        listTools(): Array<{
          name: string;
          description: string;
          inputSchema?: string;
          annotations?: { readOnlyHint?: unknown };
        }>;
      };
    }
  ).modelContextTesting;

  if (testing && typeof testing.listTools === 'function') {
    try {
      const registered = testing.listTools();
      for (const tool of registered) {
        const parsedSchema = tool.inputSchema
          ? safeJsonParse<Record<string, unknown>>(tool.inputSchema, MAX_WEBMCP_SCHEMA_BYTES)
          : undefined;
        if (!isValidToolName(tool.name)) continue;
        tools.push({
          name: tool.name,
          description: (tool.description ?? '').slice(0, TOOL_DESCRIPTION_MAX_CHARS),
          inputSchema: parsedSchema,
          source: 'imperative',
          effect: effectFromAnnotations(tool.annotations),
        });
      }
      return tools;
    } catch (e) {
      logger.warn('Failed to list tools via modelContextTesting', e);
    }
  }

  const mc = (
    navigator as {
      modelContext?: {
        listTools?: () => Array<{
          name: string;
          description?: string;
          inputSchema?: Record<string, unknown>;
          annotations?: { readOnlyHint?: unknown };
        }>;
      };
    }
  ).modelContext;

  if (mc && typeof mc.listTools === 'function') {
    try {
      const registered = mc.listTools();
      for (const tool of registered) {
        if (!isValidToolName(tool.name)) continue;
        tools.push({
          name: tool.name,
          description: (tool.description || '').slice(0, TOOL_DESCRIPTION_MAX_CHARS),
          inputSchema: tool.inputSchema,
          source: 'imperative',
          effect: effectFromAnnotations(tool.annotations),
        });
      }
    } catch (e) {
      logger.warn('Failed to list tools via modelContext.listTools', e);
    }
  }

  return tools;
}

export function discoverAllTools(): WebMCPDiscoveryResult {
  const hasModelContext =
    typeof navigator !== 'undefined' &&
    ('modelContext' in navigator || 'modelContextTesting' in navigator);

  const declarativeTools = discoverDeclarativeTools();
  const imperativeTools = hasModelContext ? discoverImperativeTools() : [];

  const toolMap = new Map<string, WebMCPToolInfo>();
  for (const tool of declarativeTools) {
    toolMap.set(tool.name, tool);
  }
  for (const tool of imperativeTools) {
    toolMap.set(tool.name, tool);
  }

  return {
    supported: hasModelContext || declarativeTools.length > 0,
    tools: Array.from(toolMap.values()),
    url: window.location.href,
    timestamp: Date.now(),
  };
}

function findToolForm(name: string): HTMLFormElement | null {
  return document.querySelector(
    `form[tool-name="${escapeAttrValue(name)}"]`,
  ) as HTMLFormElement | null;
}

function declaredEffect(name: string): SiteToolEffect {
  const form = findToolForm(name);
  if (form) return effectFromFormMethod(form.getAttribute('method'));
  const declared = discoverImperativeTools().find((tool) => tool.name === name);
  return declared?.effect ?? 'write';
}

function toError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function awaitToolOperation<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (value: T): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      resolve(value);
    };
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      reject(error);
    };
    const abort = (): void => fail(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    operation.then(finish, fail);
    if (signal.aborted) abort();
  });
}

async function callToolImperative(
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<WebMCPCallToolResponse | null> {
  const testing = (
    navigator as {
      modelContextTesting?: {
        executeTool(
          name: string,
          argsJson: string,
          opts?: { signal?: AbortSignal },
        ): Promise<string | null>;
      };
    }
  ).modelContextTesting;

  if (testing && typeof testing.executeTool === 'function') {
    try {
      signal?.throwIfAborted();
      const resultJson = await awaitToolOperation(
        testing.executeTool(name, JSON.stringify(args), { signal }),
        signal,
      );
      signal?.throwIfAborted();
      const parsedResult = resultJson
        ? (safeJsonParse(resultJson, MAX_WEBMCP_SCHEMA_BYTES) ?? null)
        : null;
      return { success: true, result: parsedResult };
    } catch (e) {
      return { success: false, error: toError(e) };
    }
  }

  const mc = (
    navigator as {
      modelContext?: {
        callTool?: (params: {
          name: string;
          arguments?: Record<string, unknown>;
        }) => Promise<unknown>;
      };
    }
  ).modelContext;

  if (mc && typeof mc.callTool === 'function') {
    try {
      signal?.throwIfAborted();
      const result = await awaitToolOperation(mc.callTool({ name, arguments: args }), signal);
      signal?.throwIfAborted();
      return { success: true, result };
    } catch (e) {
      return { success: false, error: toError(e) };
    }
  }

  return null;
}

function callToolViaDom(
  name: string,
  args: Record<string, unknown>,
  assertCurrent?: () => void,
): WebMCPCallToolResponse {
  const form = findToolForm(name);
  if (!form) return { success: false, error: `Tool "${name}" not found on this page` };
  try {
    for (const [key, value] of Object.entries(args)) {
      assertCurrent?.();
      const field = form.querySelector(`[name="${escapeAttrValue(key)}"]`) as
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
      if (field) {
        field.value = String(value);
        assertCurrent?.();
        field.dispatchEvent(new Event('input', { bubbles: true }));
        assertCurrent?.();
        field.dispatchEvent(new Event('change', { bubbles: true }));
        assertCurrent?.();
      }
    }
    assertCurrent?.();
    form.requestSubmit();
    return { success: true, result: { submitted: true, toolName: name } };
  } catch (e) {
    return { success: false, error: toError(e) };
  }
}

const CANCELLED: WebMCPCallToolResponse = {
  success: false,
  error: 'User cancelled the tool invocation.',
};

/**
 * Site tools run under the same approval policy as every other browser action,
 * and a tool call that fails falls back to the page's own form rather than
 * ending the run, which is the path a site tool exists to shortcut.
 */
export async function callTool(request: WebMCPCallToolRequest): Promise<WebMCPCallToolResponse> {
  const { name, arguments: args = {} } = request;
  request.assertCurrent?.();
  const pageUrl = typeof window === 'undefined' ? null : window.location.href;
  const form = request.source === 'imperative' ? null : findToolForm(name);
  const testing = (navigator as Navigator & { modelContextTesting?: { listTools?: unknown } })
    .modelContextTesting;
  const modelContext = (navigator as Navigator & { modelContext?: { listTools?: unknown } })
    .modelContext;
  const hasToolRegistry =
    typeof testing?.listTools === 'function' || typeof modelContext?.listTools === 'function';
  const registered = hasToolRegistry
    ? discoverImperativeTools().find((tool) => tool.name === name)
    : undefined;
  const hasImperativeSurface =
    typeof (navigator as Navigator & { modelContextTesting?: { executeTool?: unknown } })
      .modelContextTesting?.executeTool === 'function' ||
    typeof (navigator as Navigator & { modelContext?: { callTool?: unknown } }).modelContext
      ?.callTool === 'function';
  if (!form && (!hasImperativeSurface || (hasToolRegistry && !registered)))
    return { success: false, error: `Tool "${name}" not found on this page` };
  const plan = planSiteToolCall(
    (form ? undefined : registered) ?? {
      name,
      effect: declaredEffect(name),
      source: form ? 'declarative' : 'imperative',
    },
    args,
    pageUrl,
  );

  let asked = false;
  const approve = (): boolean => {
    request.assertCurrent?.();
    if (asked) return true;
    asked = true;
    const allowed = window.confirm(describeSiteToolApproval(name, args, plan));
    request.assertCurrent?.();
    return allowed;
  };

  if (plan.requiresApproval && !approve()) return CANCELLED;

  request.assertCurrent?.();
  const imperative =
    request.source === 'declarative' ? null : await callToolImperative(name, args, request.signal);
  request.assertCurrent?.();
  if (imperative?.success) return imperative;

  if (request.source === 'imperative')
    return (
      imperative ?? { success: false, error: 'The approved imperative site tool is unavailable.' }
    );

  const fallbackForm = findToolForm(name);
  if (!fallbackForm)
    return imperative ?? { success: false, error: `Tool "${name}" not found on this page` };

  // Submitting the page's own form navigates, so it always asks, whatever the
  // tool declared its effect to be.
  if (!approve()) return CANCELLED;

  let assertFormCurrent: (() => void) | undefined;
  if (request.assertCurrent) {
    const destination = new URL(
      fallbackForm.getAttribute('action') || window.location.href,
      window.location.href,
    ).href;
    await authorizeBrowserToolUrl(destination);
    assertFormCurrent = (): void => {
      request.assertCurrent!();
      if (
        !fallbackForm.isConnected ||
        findToolForm(name) !== fallbackForm ||
        new URL(fallbackForm.getAttribute('action') || window.location.href, window.location.href)
          .href !== destination
      )
        throw new Error('The approved site-tool form destination changed.');
    };
    assertFormCurrent();
  }
  request.assertCurrent?.();
  const fallback = callToolViaDom(name, args, assertFormCurrent);
  if (!imperative) return fallback;
  return fallback.success
    ? { ...fallback, fellBackToDom: true }
    : { success: false, error: imperative.error };
}

let toolChangeCallback: ((tools: WebMCPToolInfo[]) => void) | null = null;
let mutationObserver: MutationObserver | null = null;
let mutationDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function watchForToolChanges(callback: (tools: WebMCPToolInfo[]) => void): void {
  toolChangeCallback = callback;

  mutationObserver = new MutationObserver(() => {
    if (!toolChangeCallback) return;
    if (mutationDebounceTimer !== null) clearTimeout(mutationDebounceTimer);
    mutationDebounceTimer = setTimeout(() => {
      mutationDebounceTimer = null;
      if (toolChangeCallback) {
        const { tools } = discoverAllTools();
        toolChangeCallback(tools);
      }
    }, 300);
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['tool-name', 'tool-description'],
  });

  const mc = (
    navigator as {
      modelContext?: {
        addEventListener?: (type: string, listener: () => void) => void;
      };
    }
  ).modelContext;

  if (mc && typeof mc.addEventListener === 'function') {
    mc.addEventListener('toolschanged', () => {
      if (toolChangeCallback) {
        const { tools } = discoverAllTools();
        toolChangeCallback(tools);
      }
    });
  }

  const testing = (
    navigator as {
      modelContextTesting?: {
        registerToolsChangedCallback?: (callback: () => void) => void;
      };
    }
  ).modelContextTesting;

  if (testing && typeof testing.registerToolsChangedCallback === 'function') {
    testing.registerToolsChangedCallback(() => {
      if (toolChangeCallback) {
        const { tools } = discoverAllTools();
        toolChangeCallback(tools);
      }
    });
  }
}

export function stopWatchingToolChanges(): void {
  if (mutationDebounceTimer !== null) {
    clearTimeout(mutationDebounceTimer);
    mutationDebounceTimer = null;
  }
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
  toolChangeCallback = null;
}

export function toolListSignature(tools: WebMCPToolInfo[]): string {
  return JSON.stringify(
    tools
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        source: tool.source,
        inputSchema: tool.inputSchema ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
}

export function startToolChangeReporting(
  initialTools: WebMCPToolInfo[],
  report: (tools: WebMCPToolInfo[]) => void,
): void {
  if (initialTools.length === 0) return;

  let lastReportedSignature = toolListSignature(initialTools);
  watchForToolChanges((tools) => {
    const signature = toolListSignature(tools);
    if (signature === lastReportedSignature) return;
    lastReportedSignature = signature;
    report(tools);
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', stopWatchingToolChanges);
  window.addEventListener('pagehide', stopWatchingToolChanges);
}
