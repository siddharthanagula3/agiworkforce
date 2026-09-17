'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot } from 'lucide-react';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import { TERMINAL_AGENT_TASK_STATES, agentTaskStateLabel } from '@agiworkforce/types';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { toUserMessage } from '@/lib/user-error-message';

export interface ProjectWorkPanelProps {
  projectId: string;
  projectName: string;
}

const RUN_STATES = [
  'queued',
  'running',
  'awaiting_input',
  'ready_for_review',
  'paused',
  'completed',
  'failed',
  'cancelled',
  'archived',
] as const;

function stateColour(state: CloudAgentRun['state']): string {
  if (state === 'failed' || state === 'timed_out') return 'var(--chat-destructive-text)';
  if (state === 'ready_for_review' || !TERMINAL_AGENT_TASK_STATES.has(state)) {
    return 'var(--chat-accent-primary-text)';
  }
  return 'var(--agi-ink-2)';
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface WorkState {
  runs: CloudAgentRun[];
  loaded: boolean;
  error: string | null;
}

/**
 * The AGI Work runs this project produced.
 *
 * A run stores no project of its own; the server resolves the association
 * through the conversation the run belongs to, so the list follows a chat that
 * is moved between projects instead of going stale.
 */
export function ProjectWorkPanel({ projectId, projectName }: ProjectWorkPanelProps) {
  const router = useRouter();
  const [state, setState] = useState<WorkState>({ runs: [], loaded: false, error: null });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const token = await getAuthToken();
        const params = new URLSearchParams({ projectId, limit: '50' });
        for (const runState of RUN_STATES) params.append('state', runState);
        const res = await fetch(`/api/llm/v1/chat/completions/runs?${params.toString()}`, {
          credentials: 'include',
          signal: controller.signal,
          ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
        });
        if (!res.ok) throw new Error(`Work list responded ${res.status}`);
        const body = (await res.json()) as { runs?: CloudAgentRun[] };
        if (cancelled) return;
        setState({ runs: body.runs ?? [], loaded: true, error: null });
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setState({
          runs: [],
          loaded: true,
          error: toUserMessage(error, 'Could not load this project’s work'),
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [projectId]);

  if (!state.loaded) {
    return (
      <p role="status" style={{ color: 'var(--agi-ink-2)', fontSize: 13, textAlign: 'center' }}>
        Loading work...
      </p>
    );
  }

  if (state.error) {
    return (
      <p role="alert" style={{ color: 'var(--agi-ink-2)', fontSize: 13, textAlign: 'center' }}>
        {state.error}
      </p>
    );
  }

  if (state.runs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 16px' }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--agi-ink)', margin: '0 0 6px' }}>
          No work yet
        </p>
        <p
          style={{
            fontSize: 13,
            color: 'var(--agi-ink-2)',
            margin: '0 auto',
            maxWidth: 400,
            lineHeight: 1.55,
          }}
        >
          Switch a chat in {projectName} to AGI Work and its runs will be listed here.
        </p>
      </div>
    );
  }

  return (
    <ul
      data-testid="project-work-list"
      style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 0, margin: 0 }}
    >
      {state.runs.map((run) => {
        const title = run.conversationTitle?.trim() || 'Untitled run';
        const dateLabel = formatDate(run.updatedAt);
        return (
          <li
            key={run.id}
            style={{
              listStyle: 'none',
              border: '1px solid var(--agi-rule)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              disabled={!run.conversationId}
              onClick={() => {
                if (run.conversationId) {
                  router.push(`/chat/${encodeURIComponent(run.conversationId)}`);
                }
              }}
              title={title}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                minHeight: 44,
                background: 'transparent',
                border: 0,
                padding: '10px 14px',
                textAlign: 'left',
                cursor: run.conversationId ? 'pointer' : 'default',
              }}
            >
              <Bot size={14} aria-hidden style={{ flexShrink: 0, color: 'var(--agi-ink-2)' }} />
              <span
                style={{
                  color: 'var(--text-1)',
                  fontSize: 13,
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                  flex: 1,
                }}
              >
                {title}
              </span>
              <span
                style={{
                  fontSize: 12,
                  flexShrink: 0,
                  color: stateColour(run.workState ?? run.state),
                }}
              >
                {agentTaskStateLabel(run.workState ?? run.state)}
              </span>
              {dateLabel && (
                <span style={{ color: 'var(--agi-ink-2)', fontSize: 12, flexShrink: 0 }}>
                  {dateLabel}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
