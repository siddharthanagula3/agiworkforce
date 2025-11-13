import React from 'react';
import type { TeamActivity, ActivityType } from '../../types/teams';
import { Activity, User, FileText, Settings, CreditCard } from 'lucide-react';

interface TeamActivityLogProps {
  activities: TeamActivity[];
}

export const TeamActivityLog: React.FC<TeamActivityLogProps> = ({ activities }) => {
  const getActivityIcon = (action: ActivityType) => {
    if (action.includes('member')) return User;
    if (action.includes('resource') || action.includes('workflow') || action.includes('automation'))
      return FileText;
    if (action.includes('settings')) return Settings;
    if (action.includes('billing')) return CreditCard;
    return Activity;
  };

  const getActivityColor = (action: ActivityType) => {
    if (action.includes('deleted') || action.includes('removed'))
      return 'text-red-600 bg-red-100 dark:bg-red-900/20';
    if (action.includes('created') || action.includes('joined') || action.includes('shared'))
      return 'text-green-600 bg-green-100 dark:bg-green-900/20';
    if (action.includes('modified') || action.includes('changed'))
      return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20';
    return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20';
  };

  const formatActivityMessage = (activity: TeamActivity) => {
    const action = activity.action.replace(/_/g, ' ');
    const userId = activity.userId || 'System';
    const resourceInfo = activity.resourceType
      ? ` ${activity.resourceType}: ${activity.resourceId}`
      : '';
    return `${userId} ${action}${resourceInfo}`;
  };

  if (activities.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center">
        <Activity className="h-12 w-12 mx-auto mb-3 text-gray-400" />
        <p className="text-gray-600 dark:text-gray-400">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {activities.map((activity) => {
            const Icon = getActivityIcon(activity.action);
            const colorClass = getActivityColor(activity.action);

            return (
              <div key={activity.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-750">
                <div className="flex items-start space-x-3">
                  <div className={`p-2 rounded-lg ${colorClass}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-white">
                      {formatActivityMessage(activity)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {new Date(activity.timestamp).toLocaleString()}
                    </p>
                    {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer">
                          View details
                        </summary>
                        <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto">
                          {JSON.stringify(activity.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
