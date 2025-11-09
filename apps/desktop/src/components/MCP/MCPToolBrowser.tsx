import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Wrench, ChevronDown, ChevronRight, Play } from 'lucide-react';
import type { McpToolInfo } from '../../types/mcp';

interface MCPToolBrowserProps {
  tools: McpToolInfo[];
}

export default function MCPToolBrowser({ tools }: MCPToolBrowserProps) {
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

  // Group tools by server
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
        <h3 className="text-lg font-medium mb-2">No tools available</h3>
        <p className="text-sm text-muted-foreground">
          Connect to MCP servers to see available tools
        </p>
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
                    <CardHeader className="cursor-pointer" onClick={() => toggleExpanded(tool.id)}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2 flex-1">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          )}
                          <Wrench className="w-4 h-4 text-primary flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-sm truncate">{tool.name}</CardTitle>
                            {tool.description && (
                              <CardDescription className="text-xs mt-1 line-clamp-2">
                                {tool.description}
                              </CardDescription>
                            )}
                          </div>
                        </div>
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {tool.server}
                        </Badge>
                      </div>
                    </CardHeader>

                    {isExpanded && (
                      <CardContent>
                        <div className="space-y-3">
                          {/* Tool ID */}
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">
                              Tool ID
                            </p>
                            <code className="text-xs bg-muted px-2 py-1 rounded block">
                              {tool.id}
                            </code>
                          </div>

                          {/* Description */}
                          {tool.description && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                Description
                              </p>
                              <p className="text-sm">{tool.description}</p>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="pt-2 border-t">
                            <Button variant="outline" size="sm" disabled>
                              <Play className="w-3 h-3 mr-2" />
                              Test Tool
                            </Button>
                            <p className="text-xs text-muted-foreground mt-2">
                              Tool testing will be available in a future update
                            </p>
                          </div>
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
