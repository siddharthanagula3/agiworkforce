import { DEFAULT_ANTHROPIC_COLLABORATION_MODEL } from '@shared/config/supported-models';
import { getAuthToken } from '@shared/lib/get-auth-token';

// Local type definitions
interface ToolDefinition {
  id: string;
  name: string;
  type: ToolType;
  description: string;
  parameters: Record<string, unknown>;
  invocationPattern: string;
  integrationType: IntegrationType;

  config: Record<string, unknown>;
  isActive: boolean;
}

type ToolType = 'analysis' | 'generation' | 'automation' | 'search' | 'communication' | string;

type IntegrationType =
  | 'n8n_workflow'
  | 'openai_api'
  | 'anthropic_api'
  | 'cursor_agent'
  | 'replit_agent'
  | 'claude_code'
  | 'custom_api'
  | 'webhook'
  | 'database'
  | 'file_system';

// Tool Invocation Service
// Handles the execution of tools by AI employees
class ToolInvocationService {
  private toolRegistry: Map<string, ToolDefinition> = new Map();

  private integrationHandlers: Map<
    IntegrationType,
    (
      tool: ToolDefinition,
      parameters: Record<string, unknown>,
      context?: unknown,
    ) => Promise<unknown>
  > = new Map();

  constructor() {
    this.initializeIntegrationHandlers();
  }

  // Initialize integration handlers for different tool types
  private initializeIntegrationHandlers() {
    // N8N Workflow Integration
    this.integrationHandlers.set('n8n_workflow', this.executeN8NWorkflow.bind(this));

    // OpenAI API Integration
    this.integrationHandlers.set('openai_api', this.executeOpenAIAPI.bind(this));

    // Anthropic API Integration
    this.integrationHandlers.set('anthropic_api', this.executeAnthropicAPI.bind(this));

    // Cursor Agent Integration
    this.integrationHandlers.set('cursor_agent', this.executeCursorAgent.bind(this));

    // Replit Agent Integration
    this.integrationHandlers.set('replit_agent', this.executeReplitAgent.bind(this));

    // Claude Code Integration
    this.integrationHandlers.set('claude_code', this.executeClaudeCode.bind(this));

    // Custom API Integration
    this.integrationHandlers.set('custom_api', this.executeCustomAPI.bind(this));

    // Webhook Integration
    this.integrationHandlers.set('webhook', this.executeWebhook.bind(this));

    // Database Integration
    this.integrationHandlers.set('database', this.executeDatabaseOperation.bind(this));

    // File System Integration
    this.integrationHandlers.set('file_system', this.executeFileSystemOperation.bind(this));
  }

  // Register a new tool
  // TODO: Add /api/agents/tools route for tool registration persistence.
  async registerTool(tool: ToolDefinition) {
    this.toolRegistry.set(tool.id, tool);
    return { success: true, error: null };
  }

  // Execute a tool
  async executeTool(toolId: string, parameters: Record<string, unknown>, context?: unknown) {
    const tool = this.toolRegistry.get(toolId);
    if (!tool) {
      return { success: false, error: 'Tool not found', result: null };
    }

    if (!tool.isActive) {
      return { success: false, error: 'Tool is not active', result: null };
    }

    try {
      // Validate parameters
      const validationResult = this.validateParameters(tool, parameters);
      if (!validationResult.valid) {
        return { success: false, error: validationResult.error, result: null };
      }

      // Get the appropriate integration handler
      const handler = this.integrationHandlers.get(tool.integrationType);
      if (!handler) {
        return {
          success: false,
          error: 'Integration handler not found',
          result: null,
        };
      }

      // Execute the tool
      const result = await handler(tool, parameters, context);

      // Log the execution
      await this.logToolExecution(toolId, parameters, result, context);

      return { success: true, error: null, result };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        result: null,
      };
    }
  }

  // Validate tool parameters
  private validateParameters(tool: ToolDefinition, parameters: Record<string, unknown>) {
    for (const param of Object.values(tool.parameters) as Array<{
      name: string;
      required?: boolean;
      type?: string;
    }>) {
      if (param.required && !(param.name in parameters)) {
        return {
          valid: false,
          error: `Required parameter '${param.name}' is missing`,
        };
      }

      if (param.name in parameters) {
        const value = parameters[param.name];
        const type = typeof value;

        if (param.type === 'array' && !Array.isArray(value)) {
          return {
            valid: false,
            error: `Parameter '${param.name}' must be an array`,
          };
        }

        // Updated: Jan 15th 2026 - Fixed tool parameter validation to reject null objects
        // In JavaScript, typeof null === 'object', so we must explicitly check for null
        if (
          param.type === 'object' &&
          (type !== 'object' || Array.isArray(value) || value === null)
        ) {
          return {
            valid: false,
            error: `Parameter '${param.name}' must be an object`,
          };
        }

        if (param.type === 'number' && type !== 'number') {
          return {
            valid: false,
            error: `Parameter '${param.name}' must be a number`,
          };
        }

        if (param.type === 'boolean' && type !== 'boolean') {
          return {
            valid: false,
            error: `Parameter '${param.name}' must be a boolean`,
          };
        }

        if (param.type === 'string' && type !== 'string') {
          return {
            valid: false,
            error: `Parameter '${param.name}' must be a string`,
          };
        }
      }
    }

    return { valid: true, error: null };
  }

  // N8N Workflow Execution
  private async executeN8NWorkflow(
    tool: ToolDefinition,
    parameters: Record<string, unknown>,
    context?: unknown,
  ) {
    const { n8nWorkflowId, n8nApiKey, n8nBaseUrl } = tool.config as Record<string, string>;

    if (!n8nWorkflowId || !n8nApiKey || !n8nBaseUrl) {
      throw new Error('N8N configuration is incomplete');
    }

    const response = await fetch(`${n8nBaseUrl}/api/v1/workflows/${n8nWorkflowId}/execute`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${n8nApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parameters,
        context: context || {},
      }),
    });

    if (!response.ok) {
      throw new Error(`N8N workflow execution failed: ${response.statusText}`);
    }

    return await response.json();
  }

  // OpenAI API Execution
  // Updated: Jan 30th 2026 - Route through Netlify proxy to prevent API key exposure
  private async executeOpenAIAPI(
    tool: ToolDefinition,
    parameters: Record<string, unknown>,
    _context?: unknown,
  ) {
    const { model, temperature, maxTokens } = tool.config as Record<string, string>;

    // Get auth token for proxy authentication
    const token = await getAuthToken();
    if (!token) {
      throw new Error('Authentication required for OpenAI API calls');
    }

    // Route through Netlify proxy - API key is handled server-side
    const response = await fetch('/.netlify/functions/llm-proxies/openai-proxy', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'gpt-4',
        messages: parameters['messages'] || [],
        temperature: temperature || 0.7,
        max_tokens: maxTokens || 1000,
        ...parameters,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API call failed: ${errorData.error || response.statusText}`);
    }

    return await response.json();
  }

  // Anthropic API Execution
  // Updated: Jan 30th 2026 - Route through Netlify proxy to prevent API key exposure
  private async executeAnthropicAPI(
    tool: ToolDefinition,
    parameters: Record<string, unknown>,
    _context?: unknown,
  ) {
    const { model, maxTokens } = tool.config as Record<string, string>;

    // Get auth token for proxy authentication
    const token = await getAuthToken();
    if (!token) {
      throw new Error('Authentication required for Anthropic API calls');
    }

    // Route through Netlify proxy - API key is handled server-side
    const response = await fetch('/.netlify/functions/llm-proxies/anthropic-proxy', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || DEFAULT_ANTHROPIC_COLLABORATION_MODEL,
        max_tokens: maxTokens || 1000,
        ...parameters,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Anthropic API call failed: ${errorData.error || response.statusText}`);
    }

    return await response.json();
  }

  // Cursor Agent Execution
  private async executeCursorAgent(
    tool: ToolDefinition,
    parameters: Record<string, unknown>,
    context?: unknown,
  ) {
    // Cursor Agent integration - this would typically involve
    // sending requests to Cursor's API or using their SDK
    const { cursorApiKey, cursorEndpoint } = tool.config as Record<string, string>;

    if (!cursorApiKey || !cursorEndpoint) {
      throw new Error('Cursor Agent configuration is incomplete');
    }

    const response = await fetch(cursorEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cursorApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...parameters,
        context: context || {},
      }),
    });

    if (!response.ok) {
      throw new Error(`Cursor Agent execution failed: ${response.statusText}`);
    }

    return await response.json();
  }

  // Replit Agent Execution
  private async executeReplitAgent(
    tool: ToolDefinition,
    parameters: Record<string, unknown>,
    context?: unknown,
  ) {
    // Replit Agent integration
    const { replitApiKey, replitEndpoint } = tool.config as Record<string, string>;

    if (!replitApiKey || !replitEndpoint) {
      throw new Error('Replit Agent configuration is incomplete');
    }

    const response = await fetch(replitEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${replitApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...parameters,
        context: context || {},
      }),
    });

    if (!response.ok) {
      throw new Error(`Replit Agent execution failed: ${response.statusText}`);
    }

    return await response.json();
  }

  // Claude Code Execution
  private async executeClaudeCode(
    tool: ToolDefinition,
    parameters: Record<string, unknown>,
    context?: unknown,
  ) {
    // Claude Code integration - similar to Anthropic but for code-specific tasks
    return this.executeAnthropicAPI(tool, parameters, context);
  }

  // Custom API Execution
  private async executeCustomAPI(
    tool: ToolDefinition,
    parameters: Record<string, unknown>,
    context?: unknown,
  ) {
    const { apiUrl, apiKey, method = 'POST' } = tool.config as Record<string, string>;

    if (!apiUrl) {
      throw new Error('Custom API URL is required');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(apiUrl, {
      method,
      headers,
      body: JSON.stringify({
        ...parameters,
        context: context || {},
      }),
    });

    if (!response.ok) {
      throw new Error(`Custom API call failed: ${response.statusText}`);
    }

    return await response.json();
  }

  // Webhook Execution
  private async executeWebhook(
    tool: ToolDefinition,
    parameters: Record<string, unknown>,
    context?: unknown,
  ) {
    const { webhookUrl, method = 'POST' } = tool.config as Record<string, string>;

    if (!webhookUrl) {
      throw new Error('Webhook URL is required');
    }

    const response = await fetch(webhookUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...parameters,
        context: context || {},
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook execution failed: ${response.statusText}`);
    }

    return await response.json();
  }

  // Database Operation Execution
  private async executeDatabaseOperation(
    tool: ToolDefinition,
    parameters: Record<string, unknown>,
    context?: unknown,
  ) {
    const { operation, table, query } = tool.config as Record<string, string>;

    if (!operation) {
      throw new Error('Database operation is required');
    }

    // Get current user for security - all operations must be user-scoped
    const clerkUserId =
      (window as unknown as Record<string, unknown> & { Clerk?: { user?: { id?: string } } })?.Clerk
        ?.user?.id ?? null;

    if (!clerkUserId) {
      throw new Error('User authentication required for database operations');
    }

    // Extract user context from parameters or context object
    const userId = (context as { userId?: string })?.userId || clerkUserId;

    // Security: For user-specific tables, always filter by user_id
    const userScopedTables = [
      'web_conversations',
      'web_messages',
      'hired_employees',
      'user_shortcuts',
      'token_transactions',
      'token_usage',
      'workforce_executions',
      'workforce_tasks',
      'api_usage',
    ];

    const isUserScopedTable = userScopedTables.includes(table!);

    // Route database operations through the server-side API endpoint to avoid
    // direct client-side DB access (Supabase removed; Neon is server-only).
    const token = await getAuthToken();
    if (!token) {
      throw new Error('Authentication required for database operations');
    }

    const response = await fetch('/api/agents/db-operation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        operation,
        table,
        query,
        parameters,
        userId,
        isUserScopedTable,
      }),
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(`Database operation failed: ${err.error ?? response.statusText}`);
    }

    return (await response.json()) as unknown;
  }

  // File System Operation Execution
  private async executeFileSystemOperation(
    tool: ToolDefinition,
    _parameters: Record<string, unknown>,
    _context?: unknown,
  ) {
    const { operation, path } = tool.config as Record<string, string>;

    if (!operation || !path) {
      throw new Error('File system operation and path are required');
    }

    // This would typically involve server-side file operations
    // For security reasons, this should be carefully controlled
    throw new Error('File system operations are not implemented for security reasons');
  }

  // Log tool execution
  // TODO: Add /api/agents/tool-executions route for execution logging persistence.
  private async logToolExecution(
    _toolId: string,
    _parameters: Record<string, unknown>,
    _result: unknown,
    _context?: unknown,
  ) {
    // no-op: client-side tool execution logging deferred pending /api/agents/tool-executions route
  }

  // Get tool by ID
  // TODO: Add /api/agents/tools/:id route for persistent tool lookup.
  async getTool(toolId: string) {
    const tool = this.toolRegistry.get(toolId);
    if (tool) {
      return { data: tool, error: null };
    }
    return { data: null, error: 'Tool not found in registry' };
  }

  // Get all tools
  // TODO: Add /api/agents/tools route for persistent tool listing.
  async getAllTools() {
    const tools = Array.from(this.toolRegistry.values());
    return { data: tools, error: null };
  }

  // Get tools by type
  // TODO: Add /api/agents/tools?type= route for filtered tool listing.
  async getToolsByType(type: ToolType) {
    const tools = Array.from(this.toolRegistry.values()).filter((t) => t.type === type);
    return { data: tools, error: null };
  }

  // Get tools by integration type
  // TODO: Add /api/agents/tools?integrationType= route for filtered tool listing.
  async getToolsByIntegrationType(integrationType: IntegrationType) {
    const tools = Array.from(this.toolRegistry.values()).filter(
      (t) => t.integrationType === integrationType,
    );
    return { data: tools, error: null };
  }
}

export const toolInvocationService = new ToolInvocationService();
