import { logger } from './utils';

/** Escape a string for use inside a CSS attribute selector value (double-quoted). */
function escapeAttrValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export interface WebMCPToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  source: 'imperative' | 'declarative';
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
}

export interface WebMCPCallToolResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

// ─── Declarative tool detection (HTML form attributes) ────────────────────────

/**
 * Scan the DOM for forms annotated with WebMCP declarative attributes:
 *   <form tool-name="..." tool-description="...">
 *     <input name="param" tool-param-description="..." />
 *   </form>
 */
export function discoverDeclarativeTools(): WebMCPToolInfo[] {
  const tools: WebMCPToolInfo[] = [];

  const forms = document.querySelectorAll('form[tool-name]');
  for (const form of forms) {
    const name = form.getAttribute('tool-name');
    const description = form.getAttribute('tool-description') || '';
    if (!name) continue;

    // Build input schema from form fields
    const properties: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];

    const fields = form.querySelectorAll('input[name], select[name], textarea[name]');
    for (const field of fields) {
      const fieldName = field.getAttribute('name');
      if (!fieldName) continue;

      const paramDesc = field.getAttribute('tool-param-description') || '';
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
    });
  }

  return tools;
}

// ─── Imperative tool detection (navigator.modelContext) ───────────────────────

export function discoverImperativeTools(): WebMCPToolInfo[] {
  const tools: WebMCPToolInfo[] = [];

  // Try Chromium early-preview testing API
  const testing = (
    navigator as {
      modelContextTesting?: {
        listTools(): Array<{ name: string; description: string; inputSchema?: string }>;
      };
    }
  ).modelContextTesting;

  if (testing && typeof testing.listTools === 'function') {
    try {
      const registered = testing.listTools();
      for (const tool of registered) {
        let parsedSchema: Record<string, unknown> | undefined;
        if (tool.inputSchema) {
          try {
            parsedSchema = JSON.parse(tool.inputSchema);
          } catch {
            // Schema not parseable, skip
          }
        }
        tools.push({
          name: tool.name,
          description: tool.description,
          inputSchema: parsedSchema,
          source: 'imperative',
        });
      }
      return tools;
    } catch (e) {
      logger.warn('Failed to list tools via modelContextTesting', e);
    }
  }

  // Try MCPB extensions (listTools on modelContext itself)
  const mc = (
    navigator as {
      modelContext?: {
        listTools?: () => Array<{
          name: string;
          description?: string;
          inputSchema?: Record<string, unknown>;
        }>;
      };
    }
  ).modelContext;

  if (mc && typeof mc.listTools === 'function') {
    try {
      const registered = mc.listTools();
      for (const tool of registered) {
        tools.push({
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema,
          source: 'imperative',
        });
      }
    } catch (e) {
      logger.warn('Failed to list tools via modelContext.listTools', e);
    }
  }

  return tools;
}

// ─── Combined discovery ───────────────────────────────────────────────────────

export function discoverAllTools(): WebMCPDiscoveryResult {
  const hasModelContext =
    typeof navigator !== 'undefined' &&
    ('modelContext' in navigator || 'modelContextTesting' in navigator);

  const declarativeTools = discoverDeclarativeTools();
  const imperativeTools = hasModelContext ? discoverImperativeTools() : [];

  // Deduplicate by name (imperative takes precedence)
  const toolMap = new Map<string, WebMCPToolInfo>();
  for (const tool of declarativeTools) {
    toolMap.set(tool.name, tool);
  }
  for (const tool of imperativeTools) {
    toolMap.set(tool.name, tool); // overwrites declarative if same name
  }

  return {
    supported: hasModelContext || declarativeTools.length > 0,
    tools: Array.from(toolMap.values()),
    url: window.location.href,
    timestamp: Date.now(),
  };
}

// ─── Tool invocation ──────────────────────────────────────────────────────────

export async function callTool(request: WebMCPCallToolRequest): Promise<WebMCPCallToolResponse> {
  const { name, arguments: args = {} } = request;

  // Try Chromium testing API first
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
      const resultJson = await testing.executeTool(name, JSON.stringify(args));
      return {
        success: true,
        result: resultJson ? JSON.parse(resultJson) : null,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // Try MCPB extensions callTool
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
      const result = await mc.callTool({ name, arguments: args });
      return { success: true, result };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // Fallback: try declarative form submission
  const form = document.querySelector(
    `form[tool-name="${escapeAttrValue(name)}"]`,
  ) as HTMLFormElement | null;
  if (form) {
    try {
      // Fill form fields from args
      for (const [key, value] of Object.entries(args)) {
        const field = form.querySelector(`[name="${escapeAttrValue(key)}"]`) as
          | HTMLInputElement
          | HTMLSelectElement
          | HTMLTextAreaElement
          | null;
        if (field) {
          field.value = String(value);
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      // Submit
      form.requestSubmit();
      return { success: true, result: { submitted: true, toolName: name } };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return {
    success: false,
    error: `Tool "${name}" not found on this page`,
  };
}

// ─── Mutation observer for dynamic tool registration ──────────────────────────

let toolChangeCallback: ((tools: WebMCPToolInfo[]) => void) | null = null;
let mutationObserver: MutationObserver | null = null;
let mutationDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function watchForToolChanges(callback: (tools: WebMCPToolInfo[]) => void): void {
  toolChangeCallback = callback;

  // Watch for DOM changes (new declarative forms).
  // Debounce to avoid expensive discoverAllTools() on rapid SPA mutations.
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

  // Watch for imperative tool changes via toolschanged event
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

  // Also try the testing API callback
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

// Ensure the MutationObserver is disconnected when the page unloads to prevent
// stale observers from accumulating on SPA navigations or tab closures.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', stopWatchingToolChanges);
}
