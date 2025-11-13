import React, { useEffect, useState } from 'react';
import { useMcpStore } from '../../stores/mcpStore';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Dialog } from '../ui/Dialog';
import { ScrollArea } from '../ui/ScrollArea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs';
import { Alert } from '../ui/Alert';
import {
  Search,
  Tool,
  Play,
  Star,
  StarOff,
  Code,
  Server,
  AlertCircle,
  CheckCircle,
  Copy,
  TrendingUp
} from 'lucide-react';
import type { McpToolInfo } from '../../types/mcp';

interface ToolTestDialogProps {
  tool: McpToolInfo | null;
  open: boolean;
  onClose: () => void;
  onExecute: (toolId: string, args: Record<string, unknown>) => Promise<void>;
}

function ToolTestDialog({ tool, open, onClose, onExecute }: ToolTestDialogProps) {
  const [args, setArgs] = useState('{}');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    if (tool) {
      // Create template arguments based on parameters
      const template: Record<string, string> = {};
      tool.parameters.forEach(param => {
        template[param] = `<${param}>`;
      });
      setArgs(JSON.stringify(template, null, 2));
    }
    setResult(null);
    setError(null);
  }, [tool]);

  const handleExecute = async () => {
    if (!tool) return;

    setIsExecuting(true);
    setError(null);
    setResult(null);

    try {
      const parsedArgs = JSON.parse(args);
      const response = await onExecute(tool.id, parsedArgs);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    }

    setIsExecuting(false);
  };

  const copyResult = () => {
    if (result) {
      navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    }
  };

  if (!tool) return null;

  return (
    <Dialog open={open} onClose={onClose}>
      <div className="p-6 max-w-3xl">
        <h2 className="text-xl font-bold mb-4">Test Tool: {tool.name}</h2>

        <div className="mb-4">
          <p className="text-gray-600 mb-2">{tool.description}</p>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary">
              <Server className="w-3 h-3 mr-1" />
              {tool.server}
            </Badge>
            <span className="text-gray-500">
              {tool.parameters.length} parameter{tool.parameters.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Arguments (JSON)</label>
          <Textarea
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            rows={8}
            className="font-mono text-sm"
            placeholder='{"param": "value"}'
          />
        </div>

        <Button
          onClick={handleExecute}
          disabled={isExecuting}
          className="w-full mb-4 flex items-center justify-center gap-2"
        >
          <Play className="w-4 h-4" />
          {isExecuting ? 'Executing...' : 'Execute Tool'}
        </Button>

        {error && (
          <Alert variant="error" className="mb-4">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </Alert>
        )}

        {result && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-green-600 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                Result
              </label>
              <Button
                size="sm"
                variant="outline"
                onClick={copyResult}
                className="flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />
                Copy
              </Button>
            </div>
            <pre className="bg-gray-50 p-3 rounded text-sm overflow-auto max-h-60">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

interface ToolCardProps {
  tool: McpToolInfo;
  isFavorite: boolean;
  onToggleFavorite: (toolId: string) => void;
  onTest: (tool: McpToolInfo) => void;
  usageCount?: number;
}

function ToolCard({ tool, isFavorite, onToggleFavorite, onTest, usageCount = 0 }: ToolCardProps) {
  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Tool className="w-4 h-4 text-blue-500" />
            <h3 className="font-semibold">{tool.name}</h3>
          </div>
          <p className="text-sm text-gray-600 mb-2">{tool.description}</p>
        </div>
        <button
          onClick={() => onToggleFavorite(tool.id)}
          className="text-yellow-500 hover:scale-110 transition-transform"
        >
          {isFavorite ? (
            <Star className="w-5 h-5 fill-current" />
          ) : (
            <StarOff className="w-5 h-5" />
          )}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <Badge variant="secondary">
          <Server className="w-3 h-3 mr-1" />
          {tool.server}
        </Badge>
        <Badge variant="secondary">
          {tool.parameters.length} param{tool.parameters.length !== 1 ? 's' : ''}
        </Badge>
        {usageCount > 0 && (
          <Badge variant="primary">
            <TrendingUp className="w-3 h-3 mr-1" />
            {usageCount} uses
          </Badge>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onTest(tool)}
          className="flex items-center gap-1"
        >
          <Play className="w-3 h-3" />
          Test Tool
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex items-center gap-1"
        >
          <Code className="w-3 h-3" />
          View Schema
        </Button>
      </div>
    </Card>
  );
}

export function MCPToolExplorer() {
  const {
    tools,
    stats,
    searchQuery,
    setSearchQuery,
    searchTools,
    refreshTools,
    initialize,
  } = useMcpStore();

  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [selectedTool, setSelectedTool] = useState<McpToolInfo | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<'server' | 'all'>('all');

  useEffect(() => {
    initialize();
    refreshTools();
  }, [initialize, refreshTools]);

  useEffect(() => {
    // Load favorites from localStorage
    const saved = localStorage.getItem('mcp-favorites');
    if (saved) {
      setFavorites(new Set(JSON.parse(saved)));
    }
  }, []);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      await searchTools(query);
    } else {
      await refreshTools();
    }
  };

  const handleToggleFavorite = (toolId: string) => {
    const newFavorites = new Set(favorites);
    if (newFavorites.has(toolId)) {
      newFavorites.delete(toolId);
    } else {
      newFavorites.add(toolId);
    }
    setFavorites(newFavorites);
    localStorage.setItem('mcp-favorites', JSON.stringify([...newFavorites]));
  };

  const handleTestTool = (tool: McpToolInfo) => {
    setSelectedTool(tool);
    setTestDialogOpen(true);
  };

  const handleExecuteTool = async (toolId: string, args: Record<string, unknown>) => {
    const { McpClient } = await import('../../api/mcp');
    return await McpClient.callTool(toolId, args);
  };

  const favoriteTools = tools.filter(tool => favorites.has(tool.id));
  const allTools = tools;

  // Group tools by server
  const toolsByServer = tools.reduce((acc, tool) => {
    if (!acc[tool.server]) {
      acc[tool.server] = [];
    }
    acc[tool.server].push(tool);
    return acc;
  }, {} as Record<string, McpToolInfo[]>);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">MCP Tool Explorer</h1>
        <p className="text-gray-600">
          Browse, search, and test tools from all connected MCP servers
        </p>
      </div>

      <div className="mb-6">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            type="text"
            placeholder="Search tools by name or description..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant={groupBy === 'all' ? 'primary' : 'outline'}
            onClick={() => setGroupBy('all')}
          >
            All Tools ({allTools.length})
          </Button>
          <Button
            size="sm"
            variant={groupBy === 'server' ? 'primary' : 'outline'}
            onClick={() => setGroupBy('server')}
          >
            By Server ({Object.keys(toolsByServer).length})
          </Button>
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">
            All Tools ({allTools.length})
          </TabsTrigger>
          <TabsTrigger value="favorites">
            Favorites ({favoriteTools.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          {groupBy === 'all' ? (
            <ScrollArea className="h-[600px]">
              {allTools.length === 0 ? (
                <div className="text-center py-12">
                  <Tool className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No tools available</h3>
                  <p className="text-gray-600">
                    Connect to MCP servers to access their tools
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {allTools.map((tool) => (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      isFavorite={favorites.has(tool.id)}
                      onToggleFavorite={handleToggleFavorite}
                      onTest={handleTestTool}
                      usageCount={stats[tool.server] || 0}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-6">
                {Object.entries(toolsByServer).map(([serverName, serverTools]) => (
                  <div key={serverName}>
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <Server className="w-5 h-5" />
                      {serverName}
                      <Badge variant="secondary">{serverTools.length} tools</Badge>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {serverTools.map((tool) => (
                        <ToolCard
                          key={tool.id}
                          tool={tool}
                          isFavorite={favorites.has(tool.id)}
                          onToggleFavorite={handleToggleFavorite}
                          onTest={handleTestTool}
                          usageCount={stats[serverName] || 0}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="favorites">
          <ScrollArea className="h-[600px]">
            {favoriteTools.length === 0 ? (
              <div className="text-center py-12">
                <StarOff className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No favorite tools</h3>
                <p className="text-gray-600">
                  Click the star icon on any tool to add it to favorites
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {favoriteTools.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    isFavorite={true}
                    onToggleFavorite={handleToggleFavorite}
                    onTest={handleTestTool}
                    usageCount={stats[tool.server] || 0}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <ToolTestDialog
        tool={selectedTool}
        open={testDialogOpen}
        onClose={() => setTestDialogOpen(false)}
        onExecute={handleExecuteTool}
      />
    </div>
  );
}

export default MCPToolExplorer;
