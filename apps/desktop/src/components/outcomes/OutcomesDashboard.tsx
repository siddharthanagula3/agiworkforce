import { invoke } from '@/lib/tauri-mock';
import React, { useEffect, useState } from 'react';

interface ProcessStat {
  process_type: string;
  success_rate: number;
  total_executions: number;
  successful_executions: number;
  average_score: number;
}

export const OutcomesDashboard: React.FC = () => {
  const [processStats, setProcessStats] = useState<ProcessStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProcessStatistics();
  }, []);

  const loadProcessStatistics = async () => {
    try {
      setLoading(true);
      const stats = await invoke<ProcessStat[]>('get_process_statistics');
      setProcessStats(stats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load process statistics');
      console.error('[OutcomesDashboard] Error loading statistics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">{error}</p>
        <button
          onClick={loadProcessStatistics}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Process Outcomes</h2>
        <button
          onClick={loadProcessStatistics}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {processStats.map((stat) => (
          <ProcessStatCard key={stat.process_type} stat={stat} />
        ))}
      </div>

      {processStats.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No process statistics available yet. Execute some goals to see outcome tracking.
        </div>
      )}
    </div>
  );
};

const ProcessStatCard: React.FC<{ stat: ProcessStat }> = ({ stat }) => {
  const successRatePercent = (stat.success_rate * 100).toFixed(1);
  const averageScorePercent = (stat.average_score * 100).toFixed(1);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      <h3 className="font-semibold text-lg mb-3 text-gray-800">
        {formatProcessType(stat.process_type)}
      </h3>

      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Success Rate:</span>
          <span className={`font-semibold ${getSuccessRateColor(stat.success_rate)}`}>
            {successRatePercent}%
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Executions:</span>
          <span className="font-semibold text-gray-800">
            {stat.successful_executions}/{stat.total_executions}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Average Score:</span>
          <span className={`font-semibold ${getScoreColor(stat.average_score)}`}>
            {averageScorePercent}%
          </span>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${getProgressBarColor(stat.success_rate)}`}
              style={{ width: `${successRatePercent}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};

function formatProcessType(processType: string): string {
  return processType
    .split(/(?=[A-Z])/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getSuccessRateColor(rate: number): string {
  if (rate >= 0.8) return 'text-green-600';
  if (rate >= 0.6) return 'text-yellow-600';
  return 'text-red-600';
}

function getScoreColor(score: number): string {
  if (score >= 0.8) return 'text-green-600';
  if (score >= 0.6) return 'text-yellow-600';
  return 'text-red-600';
}

function getProgressBarColor(rate: number): string {
  if (rate >= 0.8) return 'bg-green-500';
  if (rate >= 0.6) return 'bg-yellow-500';
  return 'bg-red-500';
}
