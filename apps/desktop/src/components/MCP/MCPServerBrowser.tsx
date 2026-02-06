import { useState, useEffect } from 'react';
import { invoke } from '../../lib/tauri-mock';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs';
import { ScrollArea } from '../ui/ScrollArea';
import { Dialog } from '../ui/Dialog';
import { toast } from '@/hooks/useToast';
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
  ExternalLink,
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
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <div className="p-6 max-w-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">{server.name}</h2>
            <p className="text-gray-600">
              v{server.version} by {server.author}
            </p>
          </div>
          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
            {server.category}
          </Badge>
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
            <div className="font-semibold mt-1">{server.downloads.toLocaleString()}</div>
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
            <Button
              variant="outline"
              disabled
              className="flex items-center gap-2 bg-green-50 text-green-700"
            >
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
              <Badge
                variant="secondary"
                className="flex items-center gap-1 bg-green-100 text-green-800"
              >
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
          <Button size="sm" onClick={() => onInstall(server)} className="flex items-center gap-1">
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
  const [servers, setServers] = useState<ServerPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch MCP servers from API
  useEffect(() => {
    const fetchServers = async () => {
      try {
        setIsLoading(true);
        const data = await invoke<ServerPackage[]>('mcp_get_registry');
        setServers(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tools');
        console.error('Failed to fetch MCP servers:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchServers();
  }, []);

  const filteredServers = servers.filter((server) => {
    const matchesSearch =
      searchQuery === '' ||
      server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.tools.some((tool) => tool.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === 'all' || server.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const handleViewDetails = (server: ServerPackage) => {
    setSelectedServer(server);
    setDetailsOpen(true);
  };

  const handleInstall = async (server: ServerPackage) => {
    try {
      toast({
        title: 'Installing tool',
        description: `Installing ${server.name}...`,
      });

      await invoke('mcp_install_server', {
        serverId: server.id,
      });

      // Refresh the server list to show the newly installed server
      const updatedServers = await invoke<ServerPackage[]>('mcp_get_registry');
      setServers(updatedServers);

      toast({
        title: 'Installation complete',
        description: `${server.name} has been installed. Enable it in settings to start using it.`,
      });

      setDetailsOpen(false);
    } catch (err) {
      console.error('Failed to install server:', err);
      toast({
        title: 'Installation failed',
        description: err instanceof Error ? err.message : 'Failed to install server',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Tool Registry</h1>
        <p className="text-gray-600">
          Discover and install tools to extend AGI Workforce's capabilities
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
            const count =
              category.id === 'all'
                ? servers.length
                : servers.filter((s) => s.category === category.id).length;

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
            {isLoading ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-4 animate-pulse" />
                <p className="text-gray-600">Loading tools...</p>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2 text-red-600">Error loading servers</h3>
                <p className="text-gray-600">{error}</p>
              </div>
            ) : filteredServers.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No servers found</h3>
                <p className="text-gray-600">
                  {servers.length === 0
                    ? 'No tools available. Check back later or contact support.'
                    : 'Try adjusting your search or browse other categories'}
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
