import { useId, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Spinner } from '@/ui/Spinner';
import { Textarea } from '@/ui/Textarea';
import { Wrench, ChevronDown, ChevronRight, Play } from 'lucide-react';
import { mcpCallTool } from '../../api/mcp';
import type { McpToolInfo } from '../../types/mcp';

type CallTool = (toolId: string, args: Record<string, unknown>) => Promise<unknown>;

interface MCPToolBrowserProps {
  tools: McpToolInfo[];
  callTool?: CallTool;
}

function argumentTemplate(tool: McpToolInfo): string {
  return JSON.stringify(
    Object.fromEntries((tool.parameters ?? []).map((name) => [name, ''])),
    null,
    2,
  );
}

export function parseToolArguments(text: string): Record<string, unknown> | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'Arguments must be valid JSON.';
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return 'Arguments must be a JSON object, such as {"path": "notes.txt"}.';
  }
  return parsed as Record<string, unknown>;
}

function ToolTestPanel({ tool, callTool }: { tool: McpToolInfo; callTool: CallTool }) {
  const baseId = useId();
  const [argumentsText, setArgumentsText] = useState(() => argumentTemplate(tool));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const parsed = parseToolArguments(argumentsText);
    setResult(null);
    if (typeof parsed === 'string') {
      setError(parsed);
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const output = await callTool(tool.id, parsed);
      setResult(typeof output === 'string' ? output : JSON.stringify(output, null, 2));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  };

  return (
    <form
      noValidate
      className="space-y-2 border-t pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        void run();
      }}
    >
      <label htmlFor={`${baseId}-arguments`} className="text-sm font-medium text-foreground">
        Arguments (JSON)
      </label>
      <Textarea
        id={`${baseId}-arguments`}
        className="font-mono text-sm"
        rows={4}
        spellCheck={false}
        value={argumentsText}
        disabled={running}
        aria-describedby={`${baseId}-hint`}
        onChange={(event) => setArgumentsText(event.target.value)}
      />
      <p id={`${baseId}-hint`} className="text-sm text-muted-foreground">
        This runs the tool for real on {tool.server}. You are asked to approve the call first,
        unless you have set this tool to always allow.
      </p>
      <Button type="submit" variant="outline" size="sm" disabled={running}>
        {running ? (
          <Spinner size="sm" className="mr-2" />
        ) : (
          <Play className="mr-2 h-3 w-3" aria-hidden="true" />
        )}
        {running ? 'Waiting for the result' : 'Run tool'}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      ) : null}
      {result !== null ? (
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Result</p>
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 font-mono text-sm text-foreground">
            {result}
          </pre>
        </div>
      ) : null}
    </form>
  );
}

export default function MCPToolBrowser({ tools, callTool = mcpCallTool }: MCPToolBrowserProps) {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const toggleExpanded = (toolId: string) => {
    const newExpanded = new Set(expandedTools);
    if (newExpanded.has(toolId)) {
      newExpanded.delete(toolId);
    } else {
      newExpanded.add(toolId);
    }
    setExpandedTools(newExpanded);
  };

  const toolsByServer = tools.reduce(
    (acc: Record<string, McpToolInfo[]>, tool: McpToolInfo) => {
      if (!acc[tool.server]) {
        acc[tool.server] = [];
      }
      const serverTools = acc[tool.server];
      if (serverTools) {
        serverTools.push(tool);
      }
      return acc;
    },
    {} as Record<string, McpToolInfo[]>,
  );

  const serverNames = Object.keys(toolsByServer).sort();

  if (tools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Wrench className="w-12 h-12 text-muted-foreground mb-4" />
        <h3 className="text-h3 mb-2">No tools available</h3>
        <p className="text-sm text-muted-foreground">Enable integrations to see available tools</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {serverNames.map((serverName) => {
        const serverTools = toolsByServer[serverName];
        if (!serverTools) return null;

        return (
          <div key={serverName}>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline">{serverName}</Badge>
              <span className="text-sm text-muted-foreground">
                {serverTools.length} tool
                {serverTools.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-2">
              {serverTools.map((tool: McpToolInfo) => {
                const isExpanded = expandedTools.has(tool.id);

                return (
                  <Card key={tool.id}>
                    <CardHeader>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() => toggleExpanded(tool.id)}
                        className="flex w-full items-start justify-between rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown
                              className="w-4 h-4 text-muted-foreground shrink-0"
                              aria-hidden="true"
                            />
                          ) : (
                            <ChevronRight
                              className="w-4 h-4 text-muted-foreground shrink-0"
                              aria-hidden="true"
                            />
                          )}
                          <Wrench className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-foreground">
                              {tool.name}
                            </span>
                            {tool.description && (
                              <span className="mt-1 block text-sm text-muted-foreground line-clamp-2">
                                {tool.description}
                              </span>
                            )}
                          </span>
                        </span>
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {tool.server}
                        </Badge>
                      </button>
                    </CardHeader>

                    {isExpanded && (
                      <CardContent>
                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Tool ID
                            </p>
                            <code className="text-xs bg-muted px-2 py-1 rounded block">
                              {tool.id}
                            </code>
                          </div>

                          {tool.description && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                Description
                              </p>
                              <p className="text-sm">{tool.description}</p>
                            </div>
                          )}

                          <ToolTestPanel tool={tool} callTool={callTool} />
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
