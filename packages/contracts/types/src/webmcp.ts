export interface WebMCPTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  source: 'imperative' | 'declarative';
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
    title?: string;
  };
}

export interface WebMCPDiscovery {
  supported: boolean;
  tools: WebMCPTool[];
  url: string;
  timestamp: number;
}

export interface WebMCPToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface NLWebEndpoint {
  url: string;
  type: 'ask' | 'mcp' | 'wellknown';
  status: 'available' | 'unknown';
}

export interface PageAIReadiness {
  webmcp: WebMCPDiscovery;
  nlweb: { supported: boolean; endpoints: NLWebEndpoint[] };
  llmsTxt: { found: boolean; url: string };
  structuredData: { jsonLd: boolean; schemaTypes: string[] };
}
