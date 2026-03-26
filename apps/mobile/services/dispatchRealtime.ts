/**
 * Supabase Realtime subscription service for Dispatch cloud-sync.
 *
 * Subscribes to three Postgres Changes channels so the mobile companion
 * receives live updates even when WebRTC / signaling is unavailable:
 *
 *  1. dispatch_messages INSERT  — new messages from desktop agent
 *  2. dispatch_agent_state UPDATE — live agent + approval state from desktop
 *  3. surface_heartbeats UPDATE  — desktop liveness heartbeat
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, getCurrentUser } from './supabase';
import { useDispatchStore } from '@/stores/dispatchStore';
import { useAgentStore } from '@/stores/agentStore';
import { useDesktopStatusStore } from '@/stores/desktopStatusStore';
import type { DispatchMessage, TaskStatus, TaskResult } from '@/stores/dispatchStore';
import type { Agent } from '@/stores/agentStore';
import type { ApprovalRequest } from '@/types/chat';

let messagesChannel: RealtimeChannel | null = null;
let agentStateChannel: RealtimeChannel | null = null;
let heartbeatChannel: RealtimeChannel | null = null;

/**
 * Map a dispatch_messages row to a DispatchMessage for the local store.
 */
function mapDispatchMessageRow(row: Record<string, unknown>): DispatchMessage {
  return {
    id: row.id as string,
    role: (row.role as string) === 'assistant' ? 'desktop' : 'user',
    text: (row.content as string) ?? '',
    timestamp: (row.created_at as string) ?? new Date().toISOString(),
    taskStatus: (row.task_status as TaskStatus) ?? undefined,
    statusDetail: (row.status_detail as string) ?? undefined,
    taskResult: (row.task_result as TaskResult) ?? undefined,
  };
}

/**
 * Subscribe to Supabase Realtime for dispatch-related tables.
 * Filters all channels by the current authenticated user's ID.
 *
 * @returns Cleanup function that removes all channels.
 */
export async function subscribeToDispatch(): Promise<() => void> {
  // Clean up any existing channels to prevent duplicate subscriptions
  unsubscribeFromDispatch();

  const user = await getCurrentUser();
  if (!user) {
    return () => {};
  }

  const userId = user.id;

  // -----------------------------------------------------------------------
  // 1. dispatch_messages INSERT — new messages from desktop
  // -----------------------------------------------------------------------
  messagesChannel = supabase
    .channel('dispatch-messages')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'dispatch_messages',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        // Only add messages from desktop (surface = 'desktop') to avoid
        // echoing back messages we sent ourselves from mobile.
        if (row.surface === 'mobile') return;

        const msg = mapDispatchMessageRow(row);
        const existing = useDispatchStore.getState().messages;
        if (existing.some((m) => m.id === msg.id)) return;

        useDispatchStore.getState().addMessage(msg);
      },
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.error('[DispatchRealtime] messages channel error — will auto-retry');
      } else if (status === 'TIMED_OUT') {
        console.error('[DispatchRealtime] messages channel subscription timed out');
      }
    });

  // -----------------------------------------------------------------------
  // 2. dispatch_agent_state UPDATE — live agent + approval state
  // -----------------------------------------------------------------------
  agentStateChannel = supabase
    .channel('dispatch-agent-state')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'dispatch_agent_state',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown>;

        const agents = row.agents as Agent[] | undefined;
        if (Array.isArray(agents)) {
          useAgentStore.getState().setAgents(agents);
        }

        const approvals = row.pending_approvals as ApprovalRequest[] | undefined;
        if (Array.isArray(approvals)) {
          // Replace the entire pending approvals list with the latest from desktop
          useAgentStore.setState({ pendingApprovals: approvals });
        }
      },
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.error('[DispatchRealtime] agent-state channel error — will auto-retry');
      } else if (status === 'TIMED_OUT') {
        console.error('[DispatchRealtime] agent-state channel subscription timed out');
      }
    });

  // -----------------------------------------------------------------------
  // 3. surface_heartbeats UPDATE — desktop liveness
  // -----------------------------------------------------------------------
  heartbeatChannel = supabase
    .channel('dispatch-desktop-heartbeat')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'surface_heartbeats',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        // Only react to desktop heartbeats
        if (row.surface_id !== 'desktop') return;

        const lastSeenAt = row.last_seen_at as string | undefined;
        if (lastSeenAt) {
          useDesktopStatusStore.getState().setLastSeen(lastSeenAt);
        }
      },
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.error('[DispatchRealtime] heartbeat channel error — will auto-retry');
      } else if (status === 'TIMED_OUT') {
        console.error('[DispatchRealtime] heartbeat channel subscription timed out');
      }
    });

  return () => {
    unsubscribeFromDispatch();
  };
}

/**
 * Remove all dispatch Realtime channels.
 */
export function unsubscribeFromDispatch(): void {
  if (messagesChannel) {
    supabase.removeChannel(messagesChannel);
    messagesChannel = null;
  }
  if (agentStateChannel) {
    supabase.removeChannel(agentStateChannel);
    agentStateChannel = null;
  }
  if (heartbeatChannel) {
    supabase.removeChannel(heartbeatChannel);
    heartbeatChannel = null;
  }
}
