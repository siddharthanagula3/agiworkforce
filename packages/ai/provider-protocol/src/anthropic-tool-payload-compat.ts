
export type AnthropicToolSchemaMode = 'openai-functions';
export type AnthropicToolChoiceMode = 'openai-string-modes';

export interface AnthropicToolPayloadCompatibilityOptions {
  toolSchemaMode?: AnthropicToolSchemaMode;
  toolChoiceMode?: AnthropicToolChoiceMode;
}

interface ModelLike {
  api?: unknown;
  compat?: unknown;
}

interface StreamOptionsLike<TPayload = unknown, TModel = ModelLike> {
  onPayload?: (payload: TPayload, model: TModel) => unknown;
  [key: string]: unknown;
}

export type GenericStreamFn<TPayload = unknown, TModel = ModelLike, TResult = unknown> = (
  model: TModel,
  context: unknown,
  streamOptions?: StreamOptionsLike<TPayload, TModel>,
) => TResult;

function hasOpenAiAnthropicToolPayloadCompatFlag(model: ModelLike): boolean {
  if (!model.compat || typeof model.compat !== 'object' || Array.isArray(model.compat)) {
    return false;
  }
  return (
    (model.compat as { requiresOpenAiAnthropicToolPayload?: unknown })
      .requiresOpenAiAnthropicToolPayload === true
  );
}

function requiresAnthropicToolPayloadCompatibilityForModel(
  model: ModelLike,
  options?: AnthropicToolPayloadCompatibilityOptions,
): boolean {
  if (model.api !== 'anthropic-messages') {
    return false;
  }
  return (
    Boolean(options?.toolSchemaMode || options?.toolChoiceMode) ||
    hasOpenAiAnthropicToolPayloadCompatFlag(model)
  );
}

function usesOpenAiFunctionAnthropicToolSchemaForModel(
  model: ModelLike,
  options?: AnthropicToolPayloadCompatibilityOptions,
): boolean {
  return (
    options?.toolSchemaMode === 'openai-functions' || hasOpenAiAnthropicToolPayloadCompatFlag(model)
  );
}

function usesOpenAiStringModeAnthropicToolChoiceForModel(
  model: ModelLike,
  options?: AnthropicToolPayloadCompatibilityOptions,
): boolean {
  return (
    options?.toolChoiceMode === 'openai-string-modes' ||
    hasOpenAiAnthropicToolPayloadCompatFlag(model)
  );
}

function normalizeOpenAiFunctionAnthropicToolDefinition(
  tool: unknown,
): Record<string, unknown> | undefined {
  if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
    return undefined;
  }

  const toolObj = tool as Record<string, unknown>;
  if (toolObj['function'] && typeof toolObj['function'] === 'object') {
    return toolObj;
  }

  const rawName = typeof toolObj['name'] === 'string' ? toolObj['name'].trim() : '';
  if (!rawName) {
    return toolObj;
  }

  const inputSchema = toolObj['input_schema'];
  const parameters = toolObj['parameters'];
  const functionSpec: Record<string, unknown> = {
    name: rawName,
    parameters:
      inputSchema && typeof inputSchema === 'object'
        ? inputSchema
        : parameters && typeof parameters === 'object'
          ? parameters
          : { type: 'object', properties: {} },
  };

  if (typeof toolObj['description'] === 'string' && toolObj['description'].trim()) {
    functionSpec['description'] = toolObj['description'];
  }
  if (typeof toolObj['strict'] === 'boolean') {
    functionSpec['strict'] = toolObj['strict'];
  }

  return {
    type: 'function',
    function: functionSpec,
  };
}

function normalizeOpenAiStringModeAnthropicToolChoice(toolChoice: unknown): unknown {
  if (!toolChoice || typeof toolChoice !== 'object' || Array.isArray(toolChoice)) {
    return toolChoice;
  }

  const choice = toolChoice as Record<string, unknown>;
  if (choice['type'] === 'auto') {
    return 'auto';
  }
  if (choice['type'] === 'none') {
    return 'none';
  }
  if (choice['type'] === 'required' || choice['type'] === 'any') {
    return 'required';
  }
  if (choice['type'] === 'tool' && typeof choice['name'] === 'string' && choice['name'].trim()) {
    return {
      type: 'function',
      function: { name: choice['name'].trim() },
    };
  }

  return toolChoice;
}

export function createAnthropicToolPayloadCompatibilityWrapper<
  TPayload = unknown,
  TModel extends ModelLike = ModelLike,
  TResult = unknown,
>(
  baseStreamFn: GenericStreamFn<TPayload, TModel, TResult>,
  options?: AnthropicToolPayloadCompatibilityOptions,
): GenericStreamFn<TPayload, TModel, TResult> {
  return (model, context, streamOptions) => {
    const originalOnPayload = streamOptions?.onPayload;
    return baseStreamFn(model, context, {
      ...streamOptions,
      onPayload: (payload: TPayload, payloadModel: TModel) => {
        if (
          payload &&
          typeof payload === 'object' &&
          requiresAnthropicToolPayloadCompatibilityForModel(payloadModel, options)
        ) {
          const payloadObj = payload as unknown as Record<string, unknown>;
          if (
            Array.isArray(payloadObj['tools']) &&
            usesOpenAiFunctionAnthropicToolSchemaForModel(payloadModel, options)
          ) {
            payloadObj['tools'] = (payloadObj['tools'] as unknown[])
              .map((tool) => normalizeOpenAiFunctionAnthropicToolDefinition(tool))
              .filter((tool): tool is Record<string, unknown> => !!tool);
          }
          if (usesOpenAiStringModeAnthropicToolChoiceForModel(payloadModel, options)) {
            payloadObj['tool_choice'] = normalizeOpenAiStringModeAnthropicToolChoice(
              payloadObj['tool_choice'],
            );
          }
        }
        return originalOnPayload?.(payload, payloadModel);
      },
    });
  };
}

export function createOpenAIAnthropicToolPayloadCompatibilityWrapper<
  TPayload = unknown,
  TModel extends ModelLike = ModelLike,
  TResult = unknown,
>(
  baseStreamFn: GenericStreamFn<TPayload, TModel, TResult>,
): GenericStreamFn<TPayload, TModel, TResult> {
  return createAnthropicToolPayloadCompatibilityWrapper<TPayload, TModel, TResult>(baseStreamFn, {
    toolSchemaMode: 'openai-functions',
    toolChoiceMode: 'openai-string-modes',
  });
}
