import { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Badge } from '@/ui/Badge';
import { Input } from '@/ui/Input';
import { ScrollArea } from '@/ui/ScrollArea';
import { useConfirm } from '@/ui/ConfirmDialog';
import {
  Search,
  Download,
  Package,
  Code,
  Database,
  Globe,
  Zap,
  FileText,
  CheckCircle,
  ExternalLink,
  Loader2,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  Trash2,
  MessageSquare,
  Brain,
  Cloud,
  Key,
  X,
} from 'lucide-react';
import {
  useMcpbStore,
  selectFilteredBundles,
  selectBundlesWithUpdates,
} from '../../stores/mcpbStore';
import type { McpBundle, McpBundleCategory, BundleInstallProgress } from '../../types/mcp';

const CATEGORY_CONFIG: Record<
  McpBundleCategory | 'all',
  { name: string; icon: React.ElementType }
> = {
  all: { name: 'All Bundles', icon: Package },
  search: { name: 'Search', icon: Globe },
  automation: { name: 'Automation', icon: Zap },
  data: { name: 'Data', icon: Database },
  productivity: { name: 'Productivity', icon: FileText },
  development: { name: 'Development', icon: Code },
  communication: { name: 'Communication', icon: MessageSquare },
  ai: { name: 'AI & ML', icon: Brain },
  analytics: { name: 'Analytics', icon: TrendingUp },
  other: { name: 'Other', icon: Package },
};

const OFFICIAL_REGISTRY_BUNDLE_PREFIX = 'mcp-registry-';

function isOfficialRegistryEntry(bundle: McpBundle) {
  return bundle.id.startsWith(OFFICIAL_REGISTRY_BUNDLE_PREFIX);
}

function InstallProgressModal({
  progress,
  onClose,
  onConfigureServer,
}: {
  progress: BundleInstallProgress;
  onClose: () => void;
  onConfigureServer?: () => void;
}) {
  const isComplete = progress.status === 'completed';
  const isFailed = progress.status === 'failed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs">
      <Card className="w-full max-w-md p-6 bg-surface-elevated shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {isFailed ? (
              <div className="p-2 rounded-full bg-red-500/10">
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
            ) : isComplete ? (
              <div className="p-2 rounded-full bg-green-500/10">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
            ) : (
              <div className="p-2 rounded-full bg-blue-500/10">
                <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
              </div>
            )}
            <div>
              <h3 className="font-semibold text-foreground">
                {isFailed
                  ? 'Installation Failed'
                  : isComplete
                    ? 'Installation Complete'
                    : 'Installing Bundle'}
              </h3>
              <p className="text-sm text-muted-foreground">{progress.bundleId}</p>
            </div>
          </div>
          {(isComplete || isFailed) && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">{progress.message}</span>
            <span className="text-foreground font-medium">{progress.progress}%</span>
          </div>
          <div className="h-2 bg-surface-base rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isFailed ? 'bg-red-500' : isComplete ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>

        {/* Status Steps */}
        <div className="space-y-2 text-sm">
          <StatusStep
            label="Downloading package"
            active={progress.status === 'downloading'}
            complete={['installing', 'configuring', 'completed'].includes(progress.status)}
            failed={isFailed && progress.status === 'downloading'}
          />
          <StatusStep
            label="Installing dependencies"
            active={progress.status === 'installing'}
            complete={['configuring', 'completed'].includes(progress.status)}
            failed={isFailed && progress.status === 'installing'}
          />
          <StatusStep
            label="Configuring server"
            active={progress.status === 'configuring'}
            complete={progress.status === 'completed'}
            failed={isFailed && progress.status === 'configuring'}
          />
        </div>

        {/* Error Message */}
        {isFailed && progress.error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">{progress.error}</p>
          </div>
        )}

        {/* Success Actions */}
        {isComplete && (
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Close
            </Button>
            {onConfigureServer && (
              <Button
                className="flex-1"
                onClick={() => {
                  onClose();
                  onConfigureServer();
                }}
              >
                Configure Server
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatusStep({
  label,
  active,
  complete,
  failed,
}: {
  label: string;
  active: boolean;
  complete: boolean;
  failed: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 ${
        complete
          ? 'text-green-400'
          : active
            ? 'text-blue-400'
            : failed
              ? 'text-red-400'
              : 'text-muted-foreground'
      }`}
    >
      {complete ? (
        <CheckCircle className="w-4 h-4" />
      ) : active ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : failed ? (
        <AlertCircle className="w-4 h-4" />
      ) : (
        <div className="w-4 h-4 rounded-full border border-current" />
      )}
      <span>{label}</span>
    </div>
  );
}

function BundleDetailsModal({
  bundle,
  onClose,
  onInstall,
  onUninstall,
  isInstalling,
}: {
  bundle: McpBundle;
  onClose: () => void;
  onInstall: (bundleId: string) => void;
  onUninstall: (bundleId: string) => void;
  isInstalling: boolean;
}) {
  const canInstall = Boolean(bundle.npmPackage);
  const comesFromOfficialRegistry = isOfficialRegistryEntry(bundle);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden bg-surface-elevated shadow-2xl">
        <ScrollArea className="max-h-[90vh]">
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-start gap-4">
                {bundle.iconUrl ? (
                  <img src={bundle.iconUrl} alt="" className="w-12 h-12 rounded-lg" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <Package className="w-6 h-6 text-white" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-foreground">{bundle.name}</h2>
                    {bundle.verified && (
                      <span title="Verified">
                        <ShieldCheck className="w-5 h-5 text-blue-400" />
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    v{bundle.version} by {bundle.author}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="secondary" className="bg-surface-base">
                {CATEGORY_CONFIG[bundle.category]?.name || bundle.category}
              </Badge>
              {comesFromOfficialRegistry && (
                <Badge variant="secondary" className="bg-blue-500/10 text-blue-300">
                  Official MCP Registry
                </Badge>
              )}
              {bundle.featured && (
                <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                  Featured
                </Badge>
              )}
              {bundle.installed && (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Installed
                </Badge>
              )}
              {bundle.updateAvailable && (
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Update Available
                </Badge>
              )}
            </div>

            {/* Description */}
            <p className="text-foreground mb-6">{bundle.description}</p>

            {!bundle.verified && (
              <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-sm font-medium text-amber-300">Unverified registry entry</p>
                <p className="mt-1 text-xs text-amber-200/80">
                  Review the publisher, package, source, requested credentials, and tools before
                  installing. This package has not been verified by AGI Workforce.
                </p>
              </div>
            )}

            {/* Details */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-surface-base p-3 rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Tools</div>
                <div className="font-semibold text-foreground">
                  {comesFromOfficialRegistry && bundle.tools.length === 0
                    ? 'Not listed'
                    : bundle.tools.length}
                </div>
              </div>
              <div className="bg-surface-base p-3 rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Package</div>
                <div className="font-semibold text-foreground truncate">
                  {bundle.npmPackage ?? bundle.configTemplate.command}
                </div>
              </div>
            </div>

            {/* Tools */}
            {bundle.tools.length > 0 ? (
              <div className="mb-6">
                <h3 className="font-semibold text-foreground mb-3">Available Tools</h3>
                <div className="space-y-2">
                  {bundle.tools.map((tool) => (
                    <div key={tool.name} className="bg-surface-base p-3 rounded-lg">
                      <div className="font-medium text-foreground text-sm">{tool.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">{tool.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : comesFromOfficialRegistry ? (
              <div className="mb-6 rounded-lg border border-border bg-surface-base p-3">
                <p className="text-sm font-medium text-foreground">
                  Tool metadata is not published in the directory
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Review the publisher documentation and source before installing.
                </p>
              </div>
            ) : null}

            {/* Required Credentials */}
            {bundle.requiredCredentials.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  Required Credentials
                </h3>
                <div className="space-y-2">
                  {bundle.requiredCredentials.map((cred) => (
                    <div
                      key={cred.key ?? cred.envVar ?? cred.displayName}
                      className="bg-surface-base p-3 rounded-lg"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground text-sm">
                          {cred.displayName}
                        </span>
                        {cred.required && (
                          <Badge variant="secondary" className="text-xs">
                            Required
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{cred.description}</p>
                      {cred.envVar && (
                        <code className="text-xs text-blue-400 mt-1 block">
                          Environment: {cred.envVar}
                        </code>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Links */}
            <div className="flex flex-wrap gap-3 mb-6">
              {bundle.githubUrl && (
                <a
                  href={bundle.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <Code className="w-4 h-4" />
                  GitHub
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {bundle.documentationUrl && (
                <a
                  href={bundle.documentationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <FileText className="w-4 h-4" />
                  Documentation
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {bundle.npmPackage && (
                <a
                  href={`https://www.npmjs.com/package/${bundle.npmPackage}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <Package className="w-4 h-4" />
                  NPM
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* Tags */}
            {bundle.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {bundle.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Close
              </Button>
              {bundle.installed ? (
                <>
                  {bundle.updateAvailable && (
                    <Button
                      onClick={() => onInstall(bundle.id)}
                      disabled={isInstalling}
                      className="flex-1 flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Update
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    onClick={() => onUninstall(bundle.id)}
                    disabled={isInstalling}
                    className="flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Uninstall
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => onInstall(bundle.id)}
                  disabled={isInstalling || !canInstall}
                  className="flex-1 flex items-center gap-2"
                >
                  {!canInstall ? (
                    <ExternalLink className="w-4 h-4" />
                  ) : isInstalling ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {canInstall ? 'Install Bundle' : 'Manual setup required'}
                </Button>
              )}
            </div>
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}

function BundleCard({
  bundle,
  onViewDetails,
  onInstall,
  isInstalling,
}: {
  bundle: McpBundle;
  onViewDetails: (bundle: McpBundle) => void;
  onInstall: (bundleId: string) => void;
  isInstalling: boolean;
}) {
  const canInstall = Boolean(bundle.npmPackage);
  const comesFromOfficialRegistry = isOfficialRegistryEntry(bundle);

  return (
    <Card className="p-4 hover:border-blue-500/50 transition-all duration-200 bg-surface-elevated">
      <div className="flex items-start gap-3 mb-3">
        {bundle.iconUrl ? (
          <img src={bundle.iconUrl} alt="" className="w-10 h-10 rounded-lg" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
            <Package className="w-5 h-5 text-blue-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground truncate">{bundle.name}</h3>
            {bundle.verified && <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />}
          </div>
          <p className="text-xs text-muted-foreground">v{bundle.version}</p>
        </div>
        {bundle.featured && (
          <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs shrink-0">
            Featured
          </Badge>
        )}
      </div>

      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{bundle.description}</p>

      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
        <Badge variant="secondary" className="text-xs">
          {comesFromOfficialRegistry && bundle.tools.length === 0
            ? 'Tools not listed'
            : `${bundle.tools.length} tools`}
        </Badge>
        {comesFromOfficialRegistry && <span>Official registry</span>}
        <span>{CATEGORY_CONFIG[bundle.category]?.name || bundle.category}</span>
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewDetails(bundle)}
          className="flex-1"
        >
          Details
        </Button>
        {bundle.installed ? (
          bundle.updateAvailable ? (
            <Button
              size="sm"
              onClick={() => onInstall(bundle.id)}
              disabled={isInstalling}
              className="flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Update
            </Button>
          ) : (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 px-3">
              <CheckCircle className="w-3 h-3 mr-1" />
              Installed
            </Badge>
          )
        ) : (
          <Button
            size="sm"
            onClick={() => onInstall(bundle.id)}
            disabled={isInstalling || !canInstall}
            className="flex items-center gap-1"
          >
            {canInstall && <Download className="w-3 h-3" />}
            {canInstall ? 'Install' : 'Manual'}
          </Button>
        )}
      </div>
    </Card>
  );
}

export interface MCPBundleBrowserProps {
  onConfigureServer?: () => void;
}

export function MCPBundleBrowser({ onConfigureServer }: MCPBundleBrowserProps) {
  const {
    bundles,
    featuredBundles,
    categories,
    selectedCategory,
    searchQuery,
    isLoading,
    isInstalling,
    installProgress,
    error,
    fetchRegistry,
    searchBundles,
    filterByCategory,
    installBundle,
    updateBundle,
    uninstallBundle,
    clearError,
    setInstallProgress,
  } = useMcpbStore(
    useShallow((state) => ({
      bundles: state.bundles,
      featuredBundles: state.featuredBundles,
      categories: state.categories,
      selectedCategory: state.selectedCategory,
      searchQuery: state.searchQuery,
      isLoading: state.isLoading,
      isInstalling: state.isInstalling,
      installProgress: state.installProgress,
      error: state.error,
      fetchRegistry: state.fetchRegistry,
      searchBundles: state.searchBundles,
      filterByCategory: state.filterByCategory,
      installBundle: state.installBundle,
      updateBundle: state.updateBundle,
      uninstallBundle: state.uninstallBundle,
      clearError: state.clearError,
      setInstallProgress: state.setInstallProgress,
    })),
  );

  const filteredBundles = useMcpbStore(useShallow(selectFilteredBundles));
  const bundlesWithUpdates = useMcpbStore(useShallow(selectBundlesWithUpdates));
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [selectedBundle, setSelectedBundle] = useState<McpBundle | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(searchQuery);

  useEffect(() => {
    fetchRegistry();
  }, [fetchRegistry]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (searchInput !== searchQuery) {
        searchBundles(searchInput);
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [searchBundles, searchInput, searchQuery]);

  const handleViewDetails = useCallback((bundle: McpBundle) => {
    setSelectedBundle(bundle);
    setDetailsOpen(true);
  }, []);

  const handleInstall = useCallback(
    async (bundleId: string) => {
      const bundle =
        bundles.find((candidate) => candidate.id === bundleId) ??
        featuredBundles.find((candidate) => candidate.id === bundleId);
      if (!bundle?.npmPackage) return;

      if (!bundle.verified) {
        const accepted = await confirm({
          title: `Install unverified bundle “${bundle.name}”?`,
          description: `This runs npm install -g for ${bundle.npmPackage} and adds a disabled MCP server configuration on this device. Review the publisher, source, tools, and requested credentials before continuing.`,
          confirmText: 'Install unverified bundle',
          cancelText: 'Cancel',
          variant: 'destructive',
        });
        if (!accepted) return;
      }

      if (bundle.installed) {
        await updateBundle(bundleId);
      } else {
        await installBundle(bundleId);
      }
    },
    [bundles, confirm, featuredBundles, installBundle, updateBundle],
  );

  const handleUninstall = useCallback(
    async (bundleId: string) => {
      const bundle =
        bundles.find((candidate) => candidate.id === bundleId) ??
        featuredBundles.find((candidate) => candidate.id === bundleId);
      const accepted = await confirm({
        title: `Remove ${bundle?.name ?? 'this MCP bundle'}?`,
        description:
          'This removes the MCP server from AGI Workforce configuration. The globally installed npm package is retained so other applications are not broken.',
        confirmText: 'Remove bundle',
        cancelText: 'Cancel',
        variant: 'destructive',
      });
      if (!accepted) return;

      await uninstallBundle(bundleId);
      setDetailsOpen(false);
      setSelectedBundle(null);
    },
    [bundles, confirm, featuredBundles, uninstallBundle],
  );

  const handleCloseProgress = useCallback(() => {
    setInstallProgress(null);
  }, [setInstallProgress]);

  return (
    <div className="h-full flex flex-col bg-surface-base">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Cloud className="w-7 h-7 text-blue-400" />
              Tool Registry
            </h1>
            <p className="text-muted-foreground mt-1">
              Browse reviewed bundles and search the live official MCP Registry
            </p>
          </div>
          <div className="flex items-center gap-2">
            {bundlesWithUpdates.length > 0 && (
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                {bundlesWithUpdates.length} updates available
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchRegistry()}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
          <Input
            type="text"
            placeholder="Search official servers, packages, or publishers..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="pl-10 bg-surface-elevated"
          />
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedCategory === null ? 'default' : 'ghost'}
            size="sm"
            onClick={() => filterByCategory(null)}
            className="flex items-center gap-1.5"
          >
            <Package className="w-4 h-4" />
            All ({bundles.length})
          </Button>
          {categories.map((cat) => {
            const config = CATEGORY_CONFIG[cat];
            const Icon = config?.icon || Package;
            const count = bundles.filter((b) => b.category === cat).length;

            return (
              <Button
                key={cat}
                variant={selectedCategory === cat ? 'default' : 'ghost'}
                size="sm"
                onClick={() => filterByCategory(cat)}
                className="flex items-center gap-1.5"
              >
                <Icon className="w-4 h-4" />
                {config?.name || cat} ({count})
              </Button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          {/* Error State */}
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-400 font-medium">Failed to load bundles</p>
                <p className="text-red-400/80 text-sm mt-1">{error}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={clearError}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Featured Section */}
          {!searchQuery && selectedCategory === null && featuredBundles.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-amber-400" />
                Featured Bundles
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {featuredBundles.slice(0, 3).map((bundle) => (
                  <BundleCard
                    key={bundle.id}
                    bundle={bundle}
                    onViewDetails={handleViewDetails}
                    onInstall={handleInstall}
                    isInstalling={isInstalling}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && bundles.length === 0 ? (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 text-blue-400 mx-auto mb-4 animate-spin" />
              <p className="text-muted-foreground">Loading bundles...</p>
            </div>
          ) : filteredBundles.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No bundles found</h3>
              <p className="text-muted-foreground">
                {searchQuery
                  ? 'Try adjusting your search terms'
                  : 'No bundles available in this category'}
              </p>
            </div>
          ) : (
            <>
              {/* All Bundles */}
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-4">
                  {selectedCategory
                    ? `${CATEGORY_CONFIG[selectedCategory]?.name || selectedCategory} Bundles`
                    : searchQuery
                      ? 'Search Results'
                      : 'All Bundles'}
                  <span className="text-muted-foreground font-normal ml-2">
                    ({filteredBundles.length})
                  </span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredBundles.map((bundle) => (
                    <BundleCard
                      key={bundle.id}
                      bundle={bundle}
                      onViewDetails={handleViewDetails}
                      onInstall={handleInstall}
                      isInstalling={isInstalling}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Details Modal */}
      {detailsOpen && selectedBundle && (
        <BundleDetailsModal
          bundle={selectedBundle}
          onClose={() => {
            setDetailsOpen(false);
            setSelectedBundle(null);
          }}
          onInstall={handleInstall}
          onUninstall={handleUninstall}
          isInstalling={isInstalling}
        />
      )}

      {/* Install Progress Modal */}
      {installProgress && (
        <InstallProgressModal
          progress={installProgress}
          onClose={handleCloseProgress}
          onConfigureServer={onConfigureServer}
        />
      )}
      {confirmDialog}
    </div>
  );
}

export default MCPBundleBrowser;
