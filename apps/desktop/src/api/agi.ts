
import { toast } from 'sonner';

import { invoke, isTauri } from '../lib/tauri-mock';

export interface AGIResourceLimits {
  cpuPercent?: number;
  memoryMb?: number;
  networkMbps?: number;
  storageMb?: number;
}

export interface AGICoreConfig {
  maxConcurrentTools?: number;
  knowledgeMemoryMb?: number;
  enableLearning?: boolean;
  enableSelfImprovement?: boolean;
  resourceLimits?: AGIResourceLimits;
  maxPlanningDepth?: number;
  enableMultimodal?: boolean;
}

export interface SubmitGoalResponse {
  goalId: string;
}

export interface SwarmGoalResponse {
  success: boolean;
  goalId: string;
  succeeded: number;
  failed: number;
  wallTimeMs: number;
  speedupRatio: number;
  criticalPathLength: number;
  maxParallelism: number;
  summary: string;
}

export interface SubmitGoalRequest {
  description: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  deadline?: number;
  successCriteria?: string[];
  modelId?: string;
  provider?: string;
}

export interface KnowledgeEntry {
  id: string;
  category: string;
  content: string;
  metadata: Record<string, string>;
  timestamp: number;
  importance: number;
}

export interface SystemResources {
  cpuUsagePercent: number;
  memoryUsageMb: number;
  memoryTotalMb: number;
  networkUsageMbps: number;
  storageUsageMb: number;
  storageTotalMb: number;
  availableTools: string[];
}

export async function agiInit(config?: AGICoreConfig): Promise<void> {
  if (!isTauri) {
    console.debug('[agi] agiInit (mock)', config);
    return;
  }

  return invoke<void>('agi_init', {
    config: config ?? {},
  });
}

let _agiInitialized = false;

export async function ensureAgiInitialized(config?: AGICoreConfig): Promise<void> {
  if (_agiInitialized) return;
  if (!isTauri) {
    _agiInitialized = true;
    return;
  }
  try {
    await invoke<void>('agi_init', { config: config ?? {} });
    _agiInitialized = true;
  } catch (err) {
    console.warn('[agi] ensureAgiInitialized failed:', err);
    throw err;
  }
}

export async function agiStop(): Promise<void> {
  if (!isTauri) {
    console.debug('[agi] agiStop (mock)');
    return;
  }

  return invoke<void>('agi_stop');
}

export async function submitGoalSwarm(
  request: SubmitGoalRequest,
): Promise<SwarmGoalResponse | null> {
  if (!request.description?.trim()) {
    toast.error('Description is required');
    return null;
  }

  if (!isTauri) {
    toast.error('Agent execution requires the desktop app');
    return null;
  }

  try {
    return await invoke<SwarmGoalResponse>('agi_submit_goal_swarm', {
      request: {
        description: request.description,
        priority: request.priority,
        deadline: request.deadline,
        successCriteria: request.successCriteria,
        modelId: request.modelId,
        provider: request.provider,
      },
    });
  } catch (error) {
    console.error('[agi] submitGoalSwarm failed:', error);
    toast.error('Failed to submit swarm goal');
    return null;
  }
}

export async function submitGoalAuto(
  request: SubmitGoalRequest,
): Promise<SubmitGoalResponse | null> {
  if (!request.description?.trim()) {
    toast.error('Description is required');
    return null;
  }

  if (!isTauri) {
    toast.error('Agent execution requires the desktop app');
    return null;
  }

  try {
    return await invoke<SubmitGoalResponse>('agi_submit_goal_auto', {
      request: {
        description: request.description,
        priority: request.priority,
        deadline: request.deadline,
        successCriteria: request.successCriteria,
        modelId: request.modelId,
        provider: request.provider,
      },
    });
  } catch (error) {
    console.error('[agi] submitGoalAuto failed:', error);
    toast.error('Failed to submit goal');
    return null;
  }
}

export async function shouldUseSwarm(description: string): Promise<boolean> {
  if (!isTauri) {
    console.debug('[agi] shouldUseSwarm (mock)', description);
    return false;
  }

  return invoke<boolean>('agi_should_use_swarm', { description });
}

export async function queryKnowledge(query: string, limit: number = 10): Promise<KnowledgeEntry[]> {
  if (!isTauri) {
    console.debug('[agi] queryKnowledge (mock)', { query, limit });
    return [];
  }

  return invoke<KnowledgeEntry[]>('query_knowledge', { query, limit });
}

export async function getRecentKnowledge(limit: number = 10): Promise<KnowledgeEntry[]> {
  if (!isTauri) {
    console.debug('[agi] getRecentKnowledge (mock)', limit);
    return [];
  }

  return invoke<KnowledgeEntry[]>('get_recent_knowledge', { limit });
}

export async function getKnowledgeByCategory(
  category: string,
  limit: number = 10,
): Promise<KnowledgeEntry[]> {
  if (!isTauri) {
    console.debug('[agi] getKnowledgeByCategory (mock)', { category, limit });
    return [];
  }

  return invoke<KnowledgeEntry[]>('get_knowledge_by_category', { category, limit });
}

export async function getSystemResources(): Promise<SystemResources> {
  if (!isTauri) {
    console.debug('[agi] getSystemResources (mock)');
    return {
      cpuUsagePercent: 0,
      memoryUsageMb: 0,
      memoryTotalMb: 0,
      networkUsageMbps: 0,
      storageUsageMb: 0,
      storageTotalMb: 0,
      availableTools: [],
    };
  }

  try {
    return await invoke<SystemResources>('get_system_resources');
  } catch (error) {
    console.error('[agi] getSystemResources failed:', error);
    toast.error('Failed to get system resources');
    return {
      cpuUsagePercent: 0,
      memoryUsageMb: 0,
      memoryTotalMb: 0,
      networkUsageMbps: 0,
      storageUsageMb: 0,
      storageTotalMb: 0,
      availableTools: [],
    };
  }
}
