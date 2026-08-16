
import type { IntentType, ToolCategory } from './intentClassifier';

export interface McpTool {
  id: string;
  name: string;
  description: string;
  serverName: string;
  category: ToolCategory;
  capabilities: string[];
  parameters?: Record<
    string,
    {
      type: string;
      description?: string;
      required?: boolean;
    }
  >;
}

export interface BuiltInTool {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  capabilities: string[];
}

export interface MatchedTool {
  tool: McpTool | BuiltInTool;
  relevance: number;
  matchReason: string;
  isMcp: boolean;
}

export interface ToolMatchResult {
  suggestedTools: MatchedTool[];
  requiredCategories: ToolCategory[];
  optionalCategories: ToolCategory[];
  autoExecute: boolean;
  reasoning: string;
}

export const BUILT_IN_TOOLS: BuiltInTool[] = [
  {
    id: 'browser_navigate',
    name: 'Navigate Browser',
    description: 'Navigate to a URL in the browser',
    category: 'browser',
    capabilities: ['web-navigation', 'page-loading'],
  },
  {
    id: 'browser_click',
    name: 'Click Element',
    description: 'Click on an element in the browser',
    category: 'browser',
    capabilities: ['interaction', 'form-filling'],
  },
  {
    id: 'browser_type',
    name: 'Type Text',
    description: 'Type text into an input field',
    category: 'browser',
    capabilities: ['input', 'form-filling'],
  },
  {
    id: 'browser_screenshot',
    name: 'Take Screenshot',
    description: 'Capture a screenshot of the current page',
    category: 'browser',
    capabilities: ['capture', 'visual'],
  },
  {
    id: 'fs_read',
    name: 'Read File',
    description: 'Read contents of a file',
    category: 'file-system',
    capabilities: ['file-read', 'text-extraction'],
  },
  {
    id: 'fs_write',
    name: 'Write File',
    description: 'Write contents to a file',
    category: 'file-system',
    capabilities: ['file-write', 'content-creation'],
  },
  {
    id: 'fs_list',
    name: 'List Directory',
    description: 'List files in a directory',
    category: 'file-system',
    capabilities: ['directory-listing', 'file-discovery'],
  },
  {
    id: 'code_run',
    name: 'Run Code',
    description: 'Execute code in a sandbox',
    category: 'code-execution',
    capabilities: ['code-execution', 'sandbox'],
  },
  {
    id: 'code_debug',
    name: 'Debug Code',
    description: 'Debug and step through code',
    category: 'code-execution',
    capabilities: ['debugging', 'breakpoints'],
  },
  {
    id: 'web_search',
    name: 'Web Search',
    description: 'Search the web for information',
    category: 'search',
    capabilities: ['web-search', 'information-retrieval'],
  },
  {
    id: 'image_generate',
    name: 'Generate Image',
    description: 'Generate an image from a text description',
    category: 'image',
    capabilities: ['image-generation', 'text-to-image'],
  },
  {
    id: 'image_analyze',
    name: 'Analyze Image',
    description: 'Analyze and describe an image',
    category: 'image',
    capabilities: ['image-analysis', 'vision'],
  },
  {
    id: 'video_generate',
    name: 'Generate Video',
    description: 'Generate a video from a text description',
    category: 'video',
    capabilities: ['video-generation', 'text-to-video'],
  },
  {
    id: 'audio_speak',
    name: 'Text to Speech',
    description: 'Convert text to speech',
    category: 'audio',
    capabilities: ['tts', 'speech-synthesis'],
  },
  {
    id: 'audio_transcribe',
    name: 'Transcribe Audio',
    description: 'Convert speech to text',
    category: 'audio',
    capabilities: ['stt', 'speech-recognition'],
  },
  {
    id: 'db_query',
    name: 'Database Query',
    description: 'Execute a database query',
    category: 'database',
    capabilities: ['sql', 'data-retrieval'],
  },
  {
    id: 'api_call',
    name: 'API Call',
    description: 'Make an HTTP API call',
    category: 'api',
    capabilities: ['http', 'rest-api'],
  },
  {
    id: 'email_send',
    name: 'Send Email',
    description: 'Send an email',
    category: 'communication',
    capabilities: ['email', 'messaging'],
  },
];

const INTENT_TOOL_REQUIREMENTS: Record<
  IntentType,
  { required: ToolCategory[]; optional: ToolCategory[] }
> = {
  chat: {
    required: [],
    optional: [],
  },
  coding: {
    required: ['code-execution', 'file-system'],
    optional: ['api', 'database'],
  },
  reasoning: {
    required: [],
    optional: ['code-execution'], // For calculations
  },
  agentic: {
    required: ['browser'],
    optional: ['file-system', 'code-execution', 'api', 'database', 'communication'],
  },
  multimodal: {
    required: ['image'],
    optional: ['video'],
  },
  'image-gen': {
    required: ['image'],
    optional: [],
  },
  'video-gen': {
    required: ['video'],
    optional: [],
  },
  search: {
    required: ['search'],
    optional: ['browser'],
  },
  'deep-research': {
    required: ['search'],
    optional: ['browser', 'file-system'],
  },
  tts: {
    required: ['audio'],
    optional: [],
  },
  stt: {
    required: ['audio'],
    optional: [],
  },
  music: {
    required: ['audio'],
    optional: [],
  },
};

const TOOL_KEYWORDS: Record<string, { toolId: string; weight: number }[]> = {
  browse: [{ toolId: 'browser_navigate', weight: 0.9 }],
  website: [{ toolId: 'browser_navigate', weight: 0.8 }],
  click: [{ toolId: 'browser_click', weight: 0.95 }],
  'fill form': [{ toolId: 'browser_type', weight: 0.9 }],
  screenshot: [{ toolId: 'browser_screenshot', weight: 0.95 }],

  'read file': [{ toolId: 'fs_read', weight: 0.95 }],
  'write file': [{ toolId: 'fs_write', weight: 0.95 }],
  'save to file': [{ toolId: 'fs_write', weight: 0.9 }],
  'list files': [{ toolId: 'fs_list', weight: 0.9 }],
  directory: [{ toolId: 'fs_list', weight: 0.7 }],

  'run code': [{ toolId: 'code_run', weight: 0.95 }],
  execute: [{ toolId: 'code_run', weight: 0.7 }],
  debug: [{ toolId: 'code_debug', weight: 0.9 }],

  search: [{ toolId: 'web_search', weight: 0.8 }],
  'look up': [{ toolId: 'web_search', weight: 0.7 }],
  find: [{ toolId: 'web_search', weight: 0.5 }],

  'generate image': [{ toolId: 'image_generate', weight: 0.95 }],
  'create image': [{ toolId: 'image_generate', weight: 0.9 }],
  draw: [{ toolId: 'image_generate', weight: 0.8 }],
  'analyze image': [{ toolId: 'image_analyze', weight: 0.9 }],

  'generate video': [{ toolId: 'video_generate', weight: 0.95 }],
  'create video': [{ toolId: 'video_generate', weight: 0.9 }],

  'read aloud': [{ toolId: 'audio_speak', weight: 0.9 }],
  'text to speech': [{ toolId: 'audio_speak', weight: 0.95 }],
  speak: [{ toolId: 'audio_speak', weight: 0.7 }],
  transcribe: [{ toolId: 'audio_transcribe', weight: 0.95 }],

  query: [{ toolId: 'db_query', weight: 0.6 }],
  database: [{ toolId: 'db_query', weight: 0.8 }],
  sql: [{ toolId: 'db_query', weight: 0.9 }],

  api: [{ toolId: 'api_call', weight: 0.8 }],
  'http request': [{ toolId: 'api_call', weight: 0.9 }],
  fetch: [{ toolId: 'api_call', weight: 0.7 }],

  email: [{ toolId: 'email_send', weight: 0.8 }],
  'send message': [{ toolId: 'email_send', weight: 0.6 }],
};

export function parseMcpToolId(toolId: string): { server: string; tool: string } | null {
  if (!toolId.startsWith('mcp__')) return null;

  const parts = toolId.split('__');
  if (parts.length < 3) return null;

  return {
    server: parts[1]!,
    tool: parts.slice(2).join('__'),
  };
}

export function inferMcpToolCategory(tool: {
  serverName: string;
  name: string;
  description: string;
}): ToolCategory {
  const serverName = tool.serverName.toLowerCase();
  const toolName = tool.name.toLowerCase();
  const description = tool.description.toLowerCase();

  if (
    serverName.includes('browser') ||
    serverName.includes('puppeteer') ||
    serverName.includes('playwright')
  ) {
    return 'browser';
  }

  if (
    serverName.includes('filesystem') ||
    serverName.includes('file') ||
    toolName.includes('read_file') ||
    toolName.includes('write_file')
  ) {
    return 'file-system';
  }

  if (
    serverName.includes('search') ||
    serverName.includes('perplexity') ||
    serverName.includes('brave')
  ) {
    return 'search';
  }

  if (
    serverName.includes('database') ||
    serverName.includes('postgres') ||
    serverName.includes('mysql') ||
    serverName.includes('sqlite')
  ) {
    return 'database';
  }

  if (
    serverName.includes('slack') ||
    serverName.includes('discord') ||
    serverName.includes('email') ||
    serverName.includes('gmail')
  ) {
    return 'communication';
  }

  if (serverName.includes('image') || serverName.includes('vision')) {
    return 'image';
  }

  if (description.includes('code') || description.includes('execute')) {
    return 'code-execution';
  }
  if (description.includes('api') || description.includes('http')) {
    return 'api';
  }

  return 'api';
}

export function convertMcpToolSchema(schema: {
  id: string;
  name: string;
  description: string;
  parameters?: Record<string, { type: string; description?: string; required?: boolean }>;
}): McpTool {
  const parsed = parseMcpToolId(schema.id);
  const serverName = parsed?.server || 'unknown';

  return {
    id: schema.id,
    name: schema.name,
    description: schema.description,
    serverName,
    category: inferMcpToolCategory({
      serverName,
      name: schema.name,
      description: schema.description,
    }),
    capabilities: extractCapabilities(schema.description),
    parameters: schema.parameters,
  };
}

function extractCapabilities(description: string): string[] {
  const capabilities: string[] = [];
  const lower = description.toLowerCase();

  if (lower.includes('read')) capabilities.push('read');
  if (lower.includes('write')) capabilities.push('write');
  if (lower.includes('create')) capabilities.push('create');
  if (lower.includes('delete')) capabilities.push('delete');
  if (lower.includes('search')) capabilities.push('search');
  if (lower.includes('navigate')) capabilities.push('navigate');
  if (lower.includes('execute')) capabilities.push('execute');

  return capabilities;
}

export function matchTools(
  intent: IntentType,
  message: string,
  availableMcpTools: McpTool[] = [],
): ToolMatchResult {
  const requirements = INTENT_TOOL_REQUIREMENTS[intent];
  const matchedTools: MatchedTool[] = [];
  const lowerMessage = message.toLowerCase();

  for (const tool of BUILT_IN_TOOLS) {
    let relevance = 0;
    let matchReason = '';

    if (requirements.required.includes(tool.category)) {
      relevance = 0.8;
      matchReason = `Required for ${intent} intent`;
    } else if (requirements.optional.includes(tool.category)) {
      relevance = 0.4;
      matchReason = `Optional for ${intent} intent`;
    }

    for (const [keyword, toolMatches] of Object.entries(TOOL_KEYWORDS)) {
      if (lowerMessage.includes(keyword)) {
        const match = toolMatches.find((m) => m.toolId === tool.id);
        if (match && match.weight > relevance) {
          relevance = match.weight;
          matchReason = `Keyword match: "${keyword}"`;
        }
      }
    }

    if (relevance > 0) {
      matchedTools.push({
        tool,
        relevance,
        matchReason,
        isMcp: false,
      });
    }
  }

  for (const mcpTool of availableMcpTools) {
    let relevance = 0;
    let matchReason = '';

    if (requirements.required.includes(mcpTool.category)) {
      relevance = 0.85;
      matchReason = `Required for ${intent} intent (MCP)`;
    } else if (requirements.optional.includes(mcpTool.category)) {
      relevance = 0.45;
      matchReason = `Optional for ${intent} intent (MCP)`;
    }

    const toolTerms = [mcpTool.name.toLowerCase(), ...mcpTool.description.toLowerCase().split(' ')];

    for (const term of toolTerms) {
      if (term.length > 3 && lowerMessage.includes(term)) {
        relevance = Math.max(relevance, 0.6);
        matchReason = matchReason || `Description match: "${term}"`;
      }
    }

    if (relevance > 0) {
      matchedTools.push({
        tool: mcpTool,
        relevance,
        matchReason,
        isMcp: true,
      });
    }
  }

  matchedTools.sort((a, b) => b.relevance - a.relevance);

  const autoExecute =
    requirements.required.length > 0 &&
    matchedTools.some((m) => requirements.required.includes(m.tool.category) && m.relevance > 0.7);

  return {
    suggestedTools: matchedTools.slice(0, 5), // Top 5 tools
    requiredCategories: requirements.required,
    optionalCategories: requirements.optional,
    autoExecute,
    reasoning: generateMatchReasoning(intent, matchedTools),
  };
}

function generateMatchReasoning(intent: IntentType, tools: MatchedTool[]): string {
  if (tools.length === 0) {
    return `No specific tools needed for ${intent} intent.`;
  }

  const topTool = tools[0]!;
  const toolCount = tools.length;

  if (intent === 'agentic') {
    return `Agentic task detected. Primary tool: ${topTool.tool.name}. ${toolCount - 1} additional tools available for automation.`;
  }

  if (intent === 'coding') {
    return `Coding task detected. Will use ${topTool.tool.name} for code operations.`;
  }

  if (intent === 'image-gen') {
    return `Image generation requested. Using ${topTool.tool.name}.`;
  }

  if (intent === 'search' || intent === 'deep-research') {
    return `Research task detected. Will search using ${topTool.tool.name}.`;
  }

  return `${intent} task. Suggested tool: ${topTool.tool.name} (${(topTool.relevance * 100).toFixed(0)}% match).`;
}

export function getBuiltInToolsByCategory(category: ToolCategory): BuiltInTool[] {
  return BUILT_IN_TOOLS.filter((t) => t.category === category);
}

export function hasRequiredTools(intent: IntentType, availableMcpTools: McpTool[] = []): boolean {
  const requirements = INTENT_TOOL_REQUIREMENTS[intent];

  if (requirements.required.length === 0) return true;

  for (const category of requirements.required) {
    const hasBuiltIn = BUILT_IN_TOOLS.some((t) => t.category === category);
    const hasMcp = availableMcpTools.some((t) => t.category === category);

    if (hasBuiltIn || hasMcp) return true;
  }

  return false;
}

export function getMissingToolCategories(
  intent: IntentType,
  availableMcpTools: McpTool[] = [],
): ToolCategory[] {
  const requirements = INTENT_TOOL_REQUIREMENTS[intent];
  const missing: ToolCategory[] = [];

  for (const category of requirements.required) {
    const hasBuiltIn = BUILT_IN_TOOLS.some((t) => t.category === category);
    const hasMcp = availableMcpTools.some((t) => t.category === category);

    if (!hasBuiltIn && !hasMcp) {
      missing.push(category);
    }
  }

  return missing;
}
