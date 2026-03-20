/**
 * AGI Core API
 *
 * TypeScript wrappers for AGI core, swarm, and knowledge base Tauri commands.
 *
 * Covered commands (sys/commands/agi.rs):
 *   agi_init                      — initialize the AGI core engine
 *   agi_stop                      — stop the AGI core engine
 *   agi_submit_goal_swarm         — execute goal via swarm (parallel multi-agent)
 *   agi_submit_goal_auto          — auto-select best execution strategy
 *   agi_should_use_swarm          — check if swarm execution is beneficial
 *   query_knowledge               — query the knowledge base
 *   get_recent_knowledge          — get recent knowledge entries
 *   get_knowledge_by_category     — get knowledge entries by category
 *   get_system_resources          — get system resource usage
 */

import { invoke, isTauri } from '../lib/tauri-mock';

// ============================================================================
// Types
// ============================================================================

/** Configuration for the AGI core engine. */
export interface AGICoreConfig {
  maxIterations?: number;
  timeoutSecs?: number;
  enableReflection?: boolean;
  enableSwarm?: boolean;
}

/** Response from submitting a goal. */
export interface SubmitGoalResponse {
  goalId: string;
}

/** Response from swarm goal execution. */
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

/** Request payload for submitting a goal. */
export interface SubmitGoalRequest {
  description: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  deadline?: number;
  successCriteria?: string[];
}

/** Knowledge base entry. */
export interface KnowledgeEntry {
  id: string;
  category: string;
  content: string;
  metadata: Record<string, string>;
  timestamp: number;
  importance: number;
}

/** System resource usage information. */
export interface SystemResources {
  cpuUsagePercent: number;
  memoryUsageMb: number;
  memoryTotalMb: number;
  networkUsageMbps: number;
  storageUsageMb: number;
  storageTotalMb: number;
  availableTools: string[];
}

// ============================================================================
// AGI Core Lifecycle
// ============================================================================

/**
 * Initialize the AGI core engine.
 * Must be called before submitting goals or using AGI features.
 */
export async function agiInit(config?: AGICoreConfig): Promise<void> {
  if (!isTauri) {
    console.info('[agi] agiInit (mock)', config);
    return;
  }

  return invoke<void>('agi_init', {
    config: config ?? {},
  });
}

/**
 * Stop the AGI core engine.
 * Gracefully shuts down the AGI loop and all managed agents.
 */
export async function agiStop(): Promise<void> {
  if (!isTauri) {
    console.info('[agi] agiStop (mock)');
    return;
  }

  return invoke<void>('agi_stop');
}

// ============================================================================
// Goal Submission (Swarm + Auto)
// ============================================================================

/**
 * Submit a goal for swarm execution.
 * The swarm decomposes the goal into parallelizable subtasks and
 * spawns multiple agents for concurrent execution.
 */
export async function submitGoalSwarm(request: SubmitGoalRequest): Promise<SwarmGoalResponse> {
  if (!isTauri) {
    console.info('[agi] submitGoalSwarm (mock)', request);
    return {
      success: true,
      goalId: `mock_swarm_${Date.now()}`,
      succeeded: 1,
      failed: 0,
      wallTimeMs: 1000,
      speedupRatio: 1.0,
      criticalPathLength: 1,
      maxParallelism: 1,
      summary: 'Mock swarm execution',
    };
  }

  return invoke<SwarmGoalResponse>('agi_submit_goal_swarm', {
    request: {
      description: request.description,
      priority: request.priority,
      deadline: request.deadline,
      successCriteria: request.successCriteria,
    },
  });
}

/**
 * Submit a goal with automatic execution strategy selection.
 * The AGI determines whether to use sequential, parallel, or swarm execution.
 * This is the recommended entry point for goal submission.
 */
export async function submitGoalAuto(request: SubmitGoalRequest): Promise<SubmitGoalResponse> {
  if (!isTauri) {
    console.info('[agi] submitGoalAuto (mock)', request);
    return { goalId: `mock_auto_${Date.now()}` };
  }

  return invoke<SubmitGoalResponse>('agi_submit_goal_auto', {
    request: {
      description: request.description,
      priority: request.priority,
      deadline: request.deadline,
      successCriteria: request.successCriteria,
    },
  });
}

/**
 * Check if a goal would benefit from swarm execution.
 * Returns true if the goal description indicates parallelizable work.
 * Useful for UI hints before submission.
 */
export async function shouldUseSwarm(description: string): Promise<boolean> {
  if (!isTauri) {
    console.info('[agi] shouldUseSwarm (mock)', description);
    return false;
  }

  return invoke<boolean>('agi_should_use_swarm', { description });
}

// ============================================================================
// Knowledge Base
// ============================================================================

/**
 * Query the AGI knowledge base.
 * Returns matching entries sorted by relevance.
 */
export async function queryKnowledge(query: string, limit: number = 10): Promise<KnowledgeEntry[]> {
  if (!isTauri) {
    console.info('[agi] queryKnowledge (mock)', { query, limit });
    return [];
  }

  return invoke<KnowledgeEntry[]>('query_knowledge', { query, limit });
}

/**
 * Get the most recent knowledge entries.
 */
export async function getRecentKnowledge(limit: number = 10): Promise<KnowledgeEntry[]> {
  if (!isTauri) {
    console.info('[agi] getRecentKnowledge (mock)', limit);
    return [];
  }

  return invoke<KnowledgeEntry[]>('get_recent_knowledge', { limit });
}

/**
 * Get knowledge entries filtered by category.
 */
export async function getKnowledgeByCategory(
  category: string,
  limit: number = 10,
): Promise<KnowledgeEntry[]> {
  if (!isTauri) {
    console.info('[agi] getKnowledgeByCategory (mock)', { category, limit });
    return [];
  }

  return invoke<KnowledgeEntry[]>('get_knowledge_by_category', { category, limit });
}

// ============================================================================
// System Resources
// ============================================================================

/**
 * Get current system resource usage including CPU, memory, network, storage,
 * and available tools. Combines system metrics with AGI resource state when available.
 */
export async function getSystemResources(): Promise<SystemResources> {
  if (!isTauri) {
    console.info('[agi] getSystemResources (mock)');
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

  return invoke<SystemResources>('get_system_resources');
}
