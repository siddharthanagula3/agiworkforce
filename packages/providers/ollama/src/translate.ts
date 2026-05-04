/**
 * Translate `ChatRequest` → Ollama `/api/chat` request body.
 *
 * Notable shape differences from Anthropic/OpenAI:
 *   - Ollama messages are flat: { role, content, images?, tool_calls? }
 *   - Images are base64 strings inline, not nested in source.data
 *   - Tools use OpenAI-style `{ type: "function", function: {...} }`
 *   - Sampling params live under `options`, not at the top level
 *   - Reasoning effort is a single boolean `think`, not granular budget
 */

import type {
  ChatRequest,
  ContentBlock,
  ImageBlock,
  ProviderMessage,
  TextBlock,
  ToolDef,
} from '@agiworkforce/types';

import type { OllamaChatMessage, OllamaChatRequest, OllamaTool } from './types';

function isTextBlock(b: ContentBlock): b is TextBlock {
  return b.type === 'text';
}
function isImageBlock(b: ContentBlock): b is ImageBlock {
  return b.type === 'image';
}

function collapseTextBlocks(blocks: ContentBlock[]): string {
  return blocks
    .filter(isTextBlock)
    .map((b) => b.text)
    .join('\n\n');
}

function collectImageBase64s(blocks: ContentBlock[]): string[] {
  return blocks
    .filter(isImageBlock)
    .map((b) => (b.source.type === 'base64' ? b.source.data : null))
    .filter((s): s is string => s !== null);
}

function translateMessage(msg: ProviderMessage): OllamaChatMessage {
  const role = msg.role === 'system' ? 'system' : msg.role;
  if (typeof msg.content === 'string') {
    return { role, content: msg.content };
  }
  const text = collapseTextBlocks(msg.content);
  const images = collectImageBase64s(msg.content);
  const toolCalls = msg.content
    .filter((b) => b.type === 'tool_use')
    .map((b) => {
      // tool_use is narrowed by the filter
      const tu = b as Extract<ContentBlock, { type: 'tool_use' }>;
      return { function: { name: tu.name, arguments: tu.input } };
    });
  // tool_result blocks become tool-role messages in Ollama
  const toolResults = msg.content.filter((b) => b.type === 'tool_result');
  if (toolResults.length > 0) {
    // Ollama expects each tool result as a separate `role: "tool"` message;
    // caller should split before reaching here. For safety, we collapse.
    const tr = toolResults[0] as Extract<ContentBlock, { type: 'tool_result' }>;
    const content =
      typeof tr.content === 'string' ? tr.content : tr.content.map((b) => b.text).join('\n');
    return { role: 'tool', content };
  }
  return {
    role,
    content: text,
    ...(images.length > 0 ? { images } : {}),
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  };
}

function translateTool(tool: ToolDef): OllamaTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

export function translateChatRequest(req: ChatRequest): OllamaChatRequest {
  const messages: OllamaChatMessage[] = [];

  // Inject system prompt as the first message.
  if (req.system !== undefined) {
    if (typeof req.system === 'string') {
      messages.push({ role: 'system', content: req.system });
    } else {
      messages.push({ role: 'system', content: collapseTextBlocks(req.system) });
    }
  }

  for (const msg of req.messages) {
    messages.push(translateMessage(msg));
  }

  const tools = req.tools && req.tools.length > 0 ? req.tools.map(translateTool) : undefined;

  const options: NonNullable<OllamaChatRequest['options']> = {};
  if (req.temperature !== undefined) options.temperature = req.temperature;
  if (req.topP !== undefined) options.top_p = req.topP;
  if (req.topK !== undefined) options.top_k = req.topK;
  if (req.maxOutputTokens !== undefined) options.num_predict = req.maxOutputTokens;
  if (req.stopSequences) options.stop = req.stopSequences;

  return {
    model: req.model,
    messages,
    stream: true,
    ...(tools ? { tools } : {}),
    ...(req.thinking?.type === 'enabled' ? { think: true } : {}),
    ...(Object.keys(options).length > 0 ? { options } : {}),
  };
}
