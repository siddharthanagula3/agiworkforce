import { invoke } from '@/lib/tauri-mock';
import React, { useCallback, useEffect, useState } from 'react';

interface TrackedOutcome {
  id: string;
  goal_id: string;
  process_type: string;
  metric_name: string;
  target_value: number;
  actual_value: number;
  achieved: boolean;
  tracked_at: number;
}

interface GoalOutcomesProps {
  goalId: string;
}

export const GoalOutcomes: React.FC<GoalOutcomesProps> = ({ goalId }) => {
  const [outcomes, setOutcomes] = useState<TrackedOutcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOutcomes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await invoke<TrackedOutcome[]>('get_outcome_tracking', { goalId });
      setOutcomes(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load outcomes');
      console.error('[GoalOutcomes] Error loading outcomes:', err);
    } finally {
      setLoading(false);
    }
  }, [goalId]);

  useEffect(() => {
    loadOutcomes();
  }, [loadOutcomes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 bg-red-50 border border-red-200 rounded text-sm">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (outcomes.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        No outcomes tracked for this goal yet.
      </div>
    );
  }

  const achievedCount = outcomes.filter((o) => o.achieved).length;
  const overallSuccess = achievedCount === outcomes.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Outcome Tracking</h3>
        <div
          className={`px-3 py-1 rounded-full text-sm font-medium ${
            overallSuccess ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          }`}
        >
          {achievedCount}/{outcomes.length} achieved
        </div>
      </div>

      <div className="space-y-2">
        {outcomes.map((outcome) => (
          <OutcomeCard key={outcome.id} outcome={outcome} />
        ))}
      </div>
    </div>
  );
};

const OutcomeCard: React.FC<{ outcome: TrackedOutcome }> = ({ outcome }) => {
  const achievement =
    outcome.target_value !== 0
      ? (outcome.actual_value / outcome.target_value) * 100
      : outcome.actual_value * 100;

  return (
    <div
      className={`p-3 border rounded-lg ${
        outcome.achieved ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="font-medium text-sm text-gray-900">
            {formatMetricName(outcome.metric_name)}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            {formatProcessType(outcome.process_type)}
          </div>
        </div>
        <div
          className={`flex items-center ${outcome.achieved ? 'text-green-600' : 'text-yellow-600'}`}
        >
          {outcome.achieved ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Target:</span>
          <span className="font-medium">
            {formatValue(outcome.target_value, outcome.metric_name)}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Actual:</span>
          <span className="font-medium">
            {formatValue(outcome.actual_value, outcome.metric_name)}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Achievement:</span>
          <span
            className={`font-medium ${achievement >= 100 ? 'text-green-600' : 'text-yellow-600'}`}
          >
            {achievement.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="mt-2">
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full ${outcome.achieved ? 'bg-green-500' : 'bg-yellow-500'}`}
            style={{ width: `${Math.min(achievement, 100)}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
};

function formatMetricName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatProcessType(processType: string): string {
  return processType
    .split(/(?=[A-Z])/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatValue(value: number, metricName: string): string {
  // Format based on metric type
  if (metricName.includes('time')) {
    return `${value.toFixed(1)}s`;
  } else if (
    metricName.includes('rate') ||
    metricName.includes('accuracy') ||
    metricName.includes('coverage')
  ) {
    return `${(value * 100).toFixed(1)}%`;
  } else if (metricName.includes('count') || metricName.includes('processed')) {
    return value.toFixed(0);
  } else {
    return value.toFixed(2);
  }
}
