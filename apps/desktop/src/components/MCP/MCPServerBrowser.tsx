import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs';
import { ScrollArea } from '../ui/ScrollArea';
import { Dialog } from '../ui/Dialog';
import {
  Search,
  Download,
  Star,
  Package,
  Code,
  Database,
  Globe,
  Zap,
  FileText,
  CheckCircle,
  ExternalLink
} from 'lucide-react';

interface ServerPackage {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: 'automation' | 'data' | 'search' | 'productivity' | 'development' | 'integration';
  npm_package?: string;
  github?: string;
  tools: string[];
  rating: number;
  downloads: number;
  installed: boolean;
}

const MOCK_SERVERS: ServerPackage[] = [
  {
    id: 'playwright-mcp',
    name: 'Playwright Browser Automation',
    version: '1.0.0',
    category: 'automation',
    npm_package: '@modelcontextprotocol/server-playwright',
    github: 'https://github.com/modelcontextprotocol/servers',
    description: 'Browser automation with Playwright. Navigate, click, type, screenshot, and interact with web pages.',
    author: 'Anthropic',
    tools: ['playwright_navigate', 'playwright_click', 'playwright_screenshot', 'playwright_fill', 'playwright_evaluate'],
    rating: 4.8,
    downloads: 12543,
    installed: false
  },
  {
    id: 'github-mcp',
    name: 'GitHub Integration',
    version: '1.0.0',
    category: 'development',
    npm_package: '@modelcontextprotocol/server-github',
    github: 'https://github.com/modelcontextprotocol/servers',
    description: 'Access GitHub repositories, create issues, search code, manage pull requests, and interact with GitHub API.',
    author: 'Anthropic',
    tools: ['github_create_issue', 'github_search_code', 'github_get_file', 'github_create_pr', 'github_list_repos'],
    rating: 4.9,
    downloads: 23456,
    installed: false
  },
  {
    id: 'google-drive-mcp',
    name: 'Google Drive',
    version: '1.0.0',
    category: 'data',
    npm_package: '@modelcontextprotocol/server-gdrive',
    github: 'https://github.com/modelcontextprotocol/servers',
    description: 'Access Google Drive files and folders. Read, write, search, and manage documents.',
    author: 'Anthropic',
    tools: ['gdrive_list_files', 'gdrive_read_file', 'gdrive_create_file', 'gdrive_update_file', 'gdrive_search'],
    rating: 4.7,
    downloads: 18234,
    installed: false
  },
  {
    id: 'brave-search-mcp',
    name: 'Brave Search',
    version: '1.0.0',
    category: 'search',
    npm_package: '@modelcontextprotocol/server-brave-search',
    github: 'https://github.com/modelcontextprotocol/servers',
    description: 'Web search using Brave Search API. Get up-to-date information from the web.',
    author: 'Anthropic',
    tools: ['brave_web_search', 'brave_local_search'],
    rating: 4.6,
    downloads: 9876,
    installed: false
  },
  {
    id: 'postgres-mcp',
    name: 'PostgreSQL Database',
    version: '1.0.0',
    category: 'data',
    npm_package: '@modelcontextprotocol/server-postgres',
    github: 'https://github.com/modelcontextprotocol/servers',
    description: 'Query PostgreSQL databases. Execute SQL queries, manage schemas, and access database metadata.',
    author: 'Anthropic',
    tools: ['postgres_query', 'postgres_schema', 'postgres_execute'],
    rating: 4.5,
    downloads: 7654,
    installed: false
  },
  {
    id: 'slack-mcp',
    name: 'Slack Integration',
    version: '1.0.0',
    category: 'productivity',
    npm_package: '@modelcontextprotocol/server-slack',
    github: 'https://github.com/modelcontextprotocol/servers',
    description: 'Post messages to Slack channels, read conversations, and manage Slack workspace.',
    author: 'Anthropic',
    tools: ['slack_post_message', 'slack_list_channels', 'slack_read_messages'],
    rating: 4.4,
    downloads: 11234,
    installed: false
  },
  {
    id: 'notion-mcp',
    name: 'Notion Integration',
    version: '1.0.0',
    category: 'productivity',
    npm_package: '@modelcontextprotocol/server-notion',
    github: 'https://github.com/modelcontextprotocol/servers',
    description: 'Access Notion pages and databases. Read, create, and update notes and structured data.',
    author: 'Anthropic',
    tools: ['notion_search', 'notion_get_page', 'notion_create_page', 'notion_query_database'],
    rating: 4.7,
    downloads: 15432,
    installed: false
  },
  {
    id: 'filesystem-mcp',
    name: 'Filesystem Access',
    version: '1.0.0',
    category: 'development',
    npm_package: '@modelcontextprotocol/server-filesystem',
    github: 'https://github.com/modelcontextprotocol/servers',
    description: 'Read and write files on the local filesystem. List directories and manage file operations.',
    author: 'Anthropic',
    tools: ['read_file', 'write_file', 'list_directory', 'create_directory'],
    rating: 4.9,
    downloads: 34567,
    installed: true
  }
];

const CATEGORIES = [
  { id: 'all', name: 'All Servers', icon: Package },
  { id: 'automation', name: 'Automation', icon: Zap },
  { id: 'data', name: 'Data Access', icon: Database },
  { id: 'search', name: 'Search', icon: Globe },
  { id: 'productivity', name: 'Productivity', icon: FileText },
  { id: 'development', name: 'Development', icon: Code },
];

interface ServerDetailsDialogProps {
  server: ServerPackage | null;
  open: boolean;
  onClose: () => void;
  onInstall: (server: ServerPackage) => void;
}

function ServerDetailsDialog({ server, open, onClose, onInstall }: ServerDetailsDialogProps) {
  if (!server) return null;

  return (
    <Dialog open={open} onClose={onClose}>
      <div className="p-6 max-w-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">{server.name}</h2>
            <p className="text-gray-600">v{server.version} by {server.author}</p>
          </div>
          <Badge variant="primary">{server.category}</Badge>
        </div>

        <p className="text-gray-700 mb-6">{server.description}</p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-sm text-gray-600">Rating</div>
            <div className="flex items-center gap-1 mt-1">
              <Star className="w-4 h-4 text-yellow-500 fill-current" />
              <span className="font-semibold">{server.rating}/5.0</span>
            </div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-sm text-gray-600">Downloads</div>
            <div className="font-semibold mt-1">
              {server.downloads.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="font-semibold mb-3">Available Tools ({server.tools.length})</h3>
          <div className="flex flex-wrap gap-2">
            {server.tools.map((tool) => (
              <Badge key={tool} variant="secondary">
                {tool}
              </Badge>
            ))}
          </div>
        </div>

        {server.github && (
          <div className="mb-6">
            <a
              href={server.github}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline flex items-center gap-1"
            >
              View on GitHub <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {server.installed ? (
            <Button variant="success" disabled className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Installed
            </Button>
          ) : (
            <Button onClick={() => onInstall(server)} className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Install Server
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

interface ServerPackageCardProps {
  server: ServerPackage;
  onViewDetails: (server: ServerPackage) => void;
  onInstall: (server: ServerPackage) => void;
}

function ServerPackageCard({ server, onViewDetails, onInstall }: ServerPackageCardProps) {
  return (
    <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-lg">{server.name}</h3>
            {server.installed && (
              <Badge variant="success" className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Installed
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-600 mb-2">{server.description}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <Star className="w-4 h-4 text-yellow-500 fill-current" />
            {server.rating}
          </div>
          <div className="flex items-center gap-1">
            <Download className="w-4 h-4" />
            {(server.downloads / 1000).toFixed(1)}k
          </div>
          <Badge variant="secondary">{server.tools.length} tools</Badge>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewDetails(server)}
          className="flex-1"
        >
          View Details
        </Button>
        {!server.installed && (
          <Button
            size="sm"
            onClick={() => onInstall(server)}
            className="flex items-center gap-1"
          >
            <Download className="w-3 h-3" />
            Install
          </Button>
        )}
      </div>
    </Card>
  );
}

export function MCPServerBrowser() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedServer, setSelectedServer] = useState<ServerPackage | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const filteredServers = MOCK_SERVERS.filter((server) => {
    const matchesSearch =
      searchQuery === '' ||
      server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.tools.some(tool => tool.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory =
      selectedCategory === 'all' || server.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const handleViewDetails = (server: ServerPackage) => {
    setSelectedServer(server);
    setDetailsOpen(true);
  };

  const handleInstall = async (server: ServerPackage) => {
    console.log('Installing server:', server.id);
    // TODO: Implement actual installation
    alert(`Installing ${server.name}...`);
    setDetailsOpen(false);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">MCP Server Registry</h1>
        <p className="text-gray-600">
          Discover and install MCP servers to extend your AGI capabilities
        </p>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            type="text"
            placeholder="Search servers, tools, or categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
        <TabsList>
          {CATEGORIES.map((category) => {
            const Icon = category.icon;
            const count = category.id === 'all'
              ? MOCK_SERVERS.length
              : MOCK_SERVERS.filter(s => s.category === category.id).length;

            return (
              <TabsTrigger key={category.id} value={category.id}>
                <Icon className="w-4 h-4 mr-2" />
                {category.name} ({count})
              </TabsTrigger>
            );
          })}
        </TabsList>

        {CATEGORIES.map((category) => (
          <TabsContent key={category.id} value={category.id}>
            {filteredServers.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No servers found</h3>
                <p className="text-gray-600">
                  Try adjusting your search or browse other categories
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[600px]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredServers.map((server) => (
                    <ServerPackageCard
                      key={server.id}
                      server={server}
                      onViewDetails={handleViewDetails}
                      onInstall={handleInstall}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <ServerDetailsDialog
        server={selectedServer}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        onInstall={handleInstall}
      />
    </div>
  );
}

export default MCPServerBrowser;
