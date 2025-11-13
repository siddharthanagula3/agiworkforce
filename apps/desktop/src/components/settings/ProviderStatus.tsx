import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Key,
  Server,
  Gauge,
  Settings,
} from 'lucide-react';
import { useModelStore } from '../../stores/modelStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { Provider } from '../../stores/settingsStore';
import { PROVIDER_LABELS, PROVIDERS_IN_ORDER } from '../../constants/llm';
import { cn } from '../../lib/utils';

interface ProviderStatusProps {
  onConfigure?: (provider: Provider) => void;
  className?: string;
}

export const ProviderStatus: React.FC<ProviderStatusProps> = ({ onConfigure, className }) => {
  const { providerStatuses, checkAllProviders, checkProviderStatus, loading } = useModelStore();
  const { apiKeys } = useSettingsStore();
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    // Check all providers on mount
    void checkAllProviders();
  }, [checkAllProviders]);

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    await checkAllProviders();
    setIsRefreshing(false);
  };

  const handleRefreshProvider = async (provider: Provider) => {
    await checkProviderStatus(provider);
  };

  const getStatusColor = (provider: Provider) => {
    const status = providerStatuses[provider];
    if (!status) return 'gray';
    if (!status.configured) return 'gray';
    if (status.available) return 'green';
    return 'red';
  };

  const getStatusIcon = (provider: Provider) => {
    const status = providerStatuses[provider];
    const color = getStatusColor(provider);

    if (color === 'green') {
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    }
    if (color === 'red') {
      return <XCircle className="h-5 w-5 text-red-500" />;
    }
    return <AlertCircle className="h-5 w-5 text-gray-400" />;
  };

  const getStatusText = (provider: Provider) => {
    const status = providerStatuses[provider];
    if (!status) return 'Checking...';
    if (!status.configured) return 'Not configured';
    if (status.available) return 'Available';
    return status.error || 'Unavailable';
  };

  if (loading && Object.values(providerStatuses).every((s) => s === null)) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Server className="h-5 w-5" />
            Provider Status
          </h2>
          <button
            onClick={handleRefreshAll}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg transition-colors text-sm"
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            Refresh All
          </button>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Check API connectivity and rate limits for all LLM providers
        </p>
      </div>

      {/* Provider List */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {PROVIDERS_IN_ORDER.map((provider) => {
            const status = providerStatuses[provider];
            const hasApiKey = apiKeys[provider] && apiKeys[provider].length > 0;
            const statusColor = getStatusColor(provider);

            return (
              <div
                key={provider}
                className={cn(
                  'p-4 rounded-lg border-2 transition-all',
                  statusColor === 'green' &&
                    'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20',
                  statusColor === 'red' &&
                    'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20',
                  statusColor === 'gray' &&
                    'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800',
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(provider)}
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                        {PROVIDER_LABELS[provider]}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {getStatusText(provider)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRefreshProvider(provider)}
                      className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                      title="Refresh status"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onConfigure?.(provider)}
                      className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                      title="Configure provider"
                    >
                      <Settings className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* API Key Status */}
                <div className="flex items-center gap-2 mb-2">
                  <Key className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    API Key:{' '}
                    {provider === 'ollama' ? (
                      <span className="text-blue-600 dark:text-blue-400">Not required (local)</span>
                    ) : hasApiKey ? (
                      <span className="text-green-600 dark:text-green-400">Configured</span>
                    ) : (
                      <span className="text-red-600 dark:text-red-400">Not configured</span>
                    )}
                  </span>
                </div>

                {/* Rate Limits (if available) */}
                {status?.rateLimitRemaining !== undefined && (
                  <div className="flex items-center gap-2 mb-2">
                    <Gauge className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Rate Limit:{' '}
                      <span className="font-medium">
                        {status.rateLimitRemaining.toLocaleString()} requests remaining
                      </span>
                    </span>
                  </div>
                )}

                {/* Rate Limit Reset (if available) */}
                {status?.rateLimitReset && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 ml-6">
                    Resets: {new Date(status.rateLimitReset).toLocaleString()}
                  </div>
                )}

                {/* Ollama-specific status */}
                {provider === 'ollama' && status?.ollamaRunning !== undefined && (
                  <div className="flex items-center gap-2 mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded">
                    <Server className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Ollama Server:{' '}
                      {status.ollamaRunning ? (
                        <span className="text-green-600 dark:text-green-400 font-medium">
                          Running
                        </span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400 font-medium">
                          Not running
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {/* Error Message */}
                {status?.error && statusColor === 'red' && (
                  <div className="mt-3 p-2 bg-red-100 dark:bg-red-900/30 rounded text-sm text-red-700 dark:text-red-300">
                    <strong>Error:</strong> {status.error}
                  </div>
                )}

                {/* Quick Actions */}
                {!status?.configured && provider !== 'ollama' && (
                  <button
                    onClick={() => onConfigure?.(provider)}
                    className="mt-3 w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    Configure API Key
                  </button>
                )}

                {provider === 'ollama' && !status?.ollamaRunning && (
                  <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-700 dark:text-blue-300">
                    <strong>Tip:</strong> Start Ollama with <code>ollama serve</code> to enable
                    local inference
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Overall Status Summary */}
        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Summary</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {
                  PROVIDERS_IN_ORDER.filter(
                    (p) => providerStatuses[p]?.available && providerStatuses[p]?.configured,
                  ).length
                }
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Available</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {
                  PROVIDERS_IN_ORDER.filter(
                    (p) =>
                      providerStatuses[p]?.configured &&
                      !providerStatuses[p]?.available,
                  ).length
                }
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Unavailable</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                {
                  PROVIDERS_IN_ORDER.filter(
                    (p) => !providerStatuses[p]?.configured && p !== 'ollama',
                  ).length
                }
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Not Configured</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
