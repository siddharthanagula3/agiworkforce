import { invoke } from '@/lib/tauri-mock';
import { Activity, AlertCircle, Cpu, HardDrive } from 'lucide-react';
import React, { useEffect, useState } from 'react';

export interface SystemResources {
  cpuUsagePercent: number;
  memoryUsageMb: number;
  memoryTotalMb: number;
  networkUsageMbps: number;
  storageUsageMb: number;
  storageTotalMb: number;
  availableTools: string[];
}

interface ResourceMonitorProps {
  refreshInterval?: number;
  compact?: boolean;
  className?: string;
  showTools?: boolean;
}

interface ResourceGaugeProps {
  label: string;
  value: number;
  max: number;
  unit: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  compact?: boolean;
}

function getInvokeErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }

  if (typeof err === 'string') {
    return err;
  }

  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }

  try {
    return JSON.stringify(err);
  } catch {
    return 'Failed to fetch resources';
  }
}

const ResourceGauge: React.FC<ResourceGaugeProps> = ({
  label,
  value,
  max,
  unit,
  icon: Icon,
  color,
  compact = false,
}) => {
  const percentage = Math.min((value / max) * 100, 100);
  const isHigh = percentage > 80;
  const isMedium = percentage > 60 && percentage <= 80;

  const gaugeColor = isHigh ? 'bg-red-500' : isMedium ? 'bg-yellow-500' : color;
  const iconColor = isHigh
    ? 'text-red-500'
    : isMedium
      ? 'text-yellow-500'
      : color.replace('bg-', 'text-');

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        </div>
        {!compact && (
          <div className="flex items-center space-x-1">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {formatValue(value, unit)}
            </span>
            {max > 0 && (
              <>
                <span className="text-xs text-gray-500 dark:text-gray-400">/</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {formatValue(max, unit)}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {}
      <div className="relative">
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
          <div
            className={`${gaugeColor} h-2 rounded-full transition-all duration-500 ease-out`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {compact && (
        <div className="text-xs text-gray-600 dark:text-gray-400 text-right">
          {formatValue(value, unit)} ({percentage.toFixed(0)}%)
        </div>
      )}
    </div>
  );
};

export const ResourceMonitor: React.FC<ResourceMonitorProps> = ({
  refreshInterval = 2000,
  compact = false,
  className = '',
  showTools = false,
}) => {
  const [resources, setResources] = useState<SystemResources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResources = async () => {
      try {
        const data = await invoke<SystemResources>('get_system_resources');
        setResources(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch system resources:', err);
        setError(getInvokeErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    fetchResources();
    const interval = setInterval(fetchResources, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval]);

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center p-6 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}
      >
        <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
          <Activity className="w-5 h-5 animate-pulse" />
          <span className="text-sm">Loading resources...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg ${className}`}
      >
        <div className="flex items-start space-x-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Resource Monitoring Error
            </p>
            <p className="text-xs text-red-600 dark:text-red-300 mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!resources) {
    return null;
  }

  return (
    <div
      className={`bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}
    >
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
          <Activity className="w-4 h-4" />
          <span>System Resources</span>
        </h3>
      </div>

      <div className={`p-4 space-y-${compact ? '3' : '6'}`}>
        {}
        <ResourceGauge
          label="CPU"
          value={resources.cpuUsagePercent}
          max={100}
          unit="%"
          icon={Cpu}
          color="bg-purple-500"
          compact={compact}
        />

        {}
        <ResourceGauge
          label="Memory"
          value={resources.memoryUsageMb}
          max={resources.memoryTotalMb}
          unit="MB"
          icon={HardDrive}
          color="bg-blue-500"
          compact={compact}
        />

        {}
        {showTools && resources.availableTools.length > 0 && (
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
              Available Tools ({resources.availableTools.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {resources.availableTools.slice(0, compact ? 5 : 10).map((tool) => (
                <span
                  key={tool}
                  className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-300"
                >
                  {tool}
                </span>
              ))}
              {resources.availableTools.length > (compact ? 5 : 10) && (
                <span className="inline-flex items-center px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
                  +{resources.availableTools.length - (compact ? 5 : 10)} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function formatValue(value: number, unit: string): string {
  if (unit === 'MB' && value >= 1024) {
    return `${(value / 1024).toFixed(1)} GB`;
  }
  if (unit === '%') {
    return `${value.toFixed(1)}${unit}`;
  }
  return `${value.toFixed(1)} ${unit}`;
}
