/** WebMCP tool descriptor as discovered on a web page */
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

/** Result of WebMCP tool discovery on a page */
export interface WebMCPDiscovery {
  supported: boolean;
  tools: WebMCPTool[];
  url: string;
  timestamp: number;
}

/** Result of calling a WebMCP tool */
export interface WebMCPToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

/** NLWeb endpoint information */
export interface NLWebEndpoint {
  url: string;
  type: 'ask' | 'mcp' | 'wellknown';
  status: 'available' | 'unknown';
}

/** Page AI readiness metadata */
export interface PageAIReadiness {
  webmcp: WebMCPDiscovery;
  nlweb: { supported: boolean; endpoints: NLWebEndpoint[] };
  llmsTxt: { found: boolean; url: string };
  structuredData: { jsonLd: boolean; schemaTypes: string[] };
}
