import React, { useState } from 'react';
import { LayoutGrid, List, Activity, Zap, Brain, Filter, RefreshCw, Settings } from 'lucide-react';
import { AgentStatusMonitor } from '../AgentStatusMonitor';
import { ResourceMonitor } from '../ResourceMonitor';
import {
  applyAgentStatusSnapshot,
  type AgentStatusPayload,
  useUnifiedChatStore,
} from '../../stores/unifiedChatStore';
import { invoke } from '@tauri-apps/api/core';

type ViewMode = 'grid' | 'list';
type FilterMode = 'all' | 'running' | 'paused' | 'completed' | 'failed';

interface MissionControlProps {
  className?: string;
  onAgentClick?: (agentId: string) => void;
}

export const MissionControl: React.FC<MissionControlProps> = ({ className = '' }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [refreshing, setRefreshing] = useState(false);

  const agents = useUnifiedChatStore((state) => state.agents);
  const backgroundTasks = useUnifiedChatStore((state) => state.backgroundTasks);

  // Filter agents based on filter mode
  const filteredAgents =
    filterMode === 'all' ? agents : agents.filter((agent) => agent.status === filterMode);

  // Count agents by status
  const statusCounts = {
    running: agents.filter((a) => a.status === 'running').length,
    paused: agents.filter((a) => a.status === 'paused').length,
    completed: agents.filter((a) => a.status === 'completed').length,
    failed: agents.filter((a) => a.status === 'failed').length,
    total: agents.length,
  };

  // Count background tasks
  const activeTasks = backgroundTasks.filter((t) => t.status === 'running').length;

  const handlePauseAgent = async (agentId: string) => {
    try {
      await invoke('pause_agent', { agentId });
    } catch (error) {
      console.error('Failed to pause agent:', error);
    }
  };

  const handleResumeAgent = async (agentId: string) => {
    try {
      await invoke('resume_agent', { agentId });
    } catch (error) {
      console.error('Failed to resume agent:', error);
    }
  };

  const handleCancelAgent = async (agentId: string) => {
    try {
      await invoke('cancel_agent', { agentId });
    } catch (error) {
      console.error('Failed to cancel agent:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const agents = await invoke<AgentStatusPayload[]>('refresh_agent_status');
      applyAgentStatusSnapshot(Array.isArray(agents) ? agents : []);
    } catch (error) {
      console.error('Failed to refresh agents:', error);
    } finally {
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  return (
    <div className={`h-full flex flex-col bg-gray-50 dark:bg-gray-950 ${className}`}>
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
              <Brain className="w-7 h-7 text-blue-500" />
              <span>Mission Control</span>
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Monitor and manage autonomous agents
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleRefresh}
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
          <StatCard
            icon={Activity}
            label="Total Agents"
            value={statusCounts.total}
            color="text-gray-600 dark:text-gray-400"
          />
          <StatCard icon={Zap} label="Running" value={statusCounts.running} color="text-blue-500" />
          <StatCard
            icon={Activity}
            label="Paused"
            value={statusCounts.paused}
            color="text-yellow-500"
          />
          <StatCard
            icon={Activity}
            label="Completed"
            value={statusCounts.completed}
            color="text-green-500"
          />
          <StatCard
            icon={Activity}
            label="Active Tasks"
            value={activeTasks}
            color="text-purple-500"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as FilterMode)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Agents ({statusCounts.total})</option>
            <option value="running">Running ({statusCounts.running})</option>
            <option value="paused">Paused ({statusCounts.paused})</option>
            <option value="completed">Completed ({statusCounts.completed})</option>
            <option value="failed">Failed ({statusCounts.failed})</option>
          </select>
        </div>

        <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-800 rounded-md p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded ${
              viewMode === 'grid'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            } transition-colors`}
            title="Grid View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded ${
              viewMode === 'list'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            } transition-colors`}
            title="List View"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6">
        <div
          className={viewMode === 'grid' ? 'grid grid-cols-1 xl:grid-cols-3 gap-6' : 'space-y-6'}
        >
          {/* Left Column: Agents */}
          <div className={viewMode === 'grid' ? 'xl:col-span-2' : ''}>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                <Activity className="w-5 h-5" />
                <span>Active Agents</span>
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  ({filteredAgents.length})
                </span>
              </h2>
            </div>
            <AgentStatusMonitor
              agents={filteredAgents}
              onPauseAgent={handlePauseAgent}
              onResumeAgent={handleResumeAgent}
              onCancelAgent={handleCancelAgent}
              compact={viewMode === 'grid'}
            />
          </div>

          {/* Right Column: System Resources */}
          <div className={viewMode === 'grid' ? 'xl:col-span-1' : 'max-w-md'}>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                <Zap className="w-5 h-5" />
                <span>System Health</span>
              </h2>
            </div>
            <ResourceMonitor compact={viewMode === 'list'} showTools={viewMode === 'grid'} />
          </div>
        </div>
      </div>
    </div>
  );
};

interface StatCardProps {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, label, value, color }) => (
  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3 border border-gray-200 dark:border-gray-700">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">{label}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      </div>
      <Icon className={`w-8 h-8 ${color} opacity-50`} />
    </div>
  </div>
);
