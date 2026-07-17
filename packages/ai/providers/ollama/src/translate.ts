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

function translateMessage(msg: ProviderMessage): OllamaChatMessage[] {
  const role = msg.role === 'system' ? 'system' : msg.role;
  if (typeof msg.content === 'string') {
    return [{ role, content: msg.content }];
  }
  const out: OllamaChatMessage[] = [];

  // Split tool_result blocks first: each becomes its own `role: "tool"`
  // message. Ollama's wire shape supports a flat list of tool messages
  // (one per result), and earlier versions of this translator silently
  // dropped every tool_result past the first plus any co-occurring text.
  const toolResults = msg.content.filter(
    (b): b is Extract<ContentBlock, { type: 'tool_result' }> => b.type === 'tool_result',
  );

  // The remaining (non-tool_result) blocks become the main message.
  const text = collapseTextBlocks(msg.content);
  const images = collectImageBase64s(msg.content);
  const toolCalls = msg.content
    .filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use')
    .map((tu) => ({ function: { name: tu.name, arguments: tu.input } }));

  // Emit the assistant/user/system body if it has any content. We DO emit
  // when only tool_calls are present (text is empty in that case). We
  // skip emitting an empty placeholder when the message contains *only*
  // tool_results.
  const hasNonToolResultContent = text.length > 0 || images.length > 0 || toolCalls.length > 0;
  if (hasNonToolResultContent) {
    out.push({
      role,
      content: text,
      ...(images.length > 0 ? { images } : {}),
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    });
  }

  // Now append one `role: "tool"` message per tool_result, preserving order.
  for (const tr of toolResults) {
    const content =
      typeof tr.content === 'string' ? tr.content : tr.content.map((b) => b.text).join('\n');
    out.push({ role: 'tool', content });
  }

  return out;
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
    // translateMessage returns 1+ Ollama messages (1 per tool_result split,
    // plus optionally the message body). Flat-merge so the wire stays a
    // single OllamaChatMessage[] with each tool_result as its own entry.
    const translated = translateMessage(msg);
    for (const t of translated) messages.push(t);
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
