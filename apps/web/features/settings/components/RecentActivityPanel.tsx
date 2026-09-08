'use client';

import { useMemo } from 'react';
import { useUserActivity, type UserActivity } from '@features/settings/hooks/use-settings-queries';

const ACTIVITY_LIMIT = 50;
const PANEL_TITLE = 'Recent activity';
const PANEL_EXPLANATION =
  'What has happened on your account recently, newest first. Anything you do not recognise is worth revoking a session for above.';

interface ActivityGroup {
  id: string;
  sentence: string;
  device: string | null;
  createdAt: string;
  count: number;
}

/**
 * Consecutive identical events are one line with a count. Opening a pane that
 * reads the same sentence eleven times tells the reader nothing eleven times.
 */
export function groupConsecutiveActivity(
  activities: readonly UserActivity[],
): readonly ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  for (const activity of activities) {
    const last = groups.at(-1);
    if (last && last.sentence === activity.sentence && last.device === activity.device) {
      last.count += 1;
      continue;
    }
    groups.push({
      id: activity.id,
      sentence: activity.sentence,
      device: activity.device,
      createdAt: activity.createdAt,
      count: 1,
    });
  }
  return groups;
}

const headingStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: 'var(--text-1)',
  margin: '0 0 12px',
};

function formatWhen(createdAt: string): string {
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleString();
}

/**
 * The account's own security activity, from the record the server already keeps.
 * It sits under Active sessions because it answers the question a reader has
 * once they have looked at that list: what happened on this account, not just
 * what is signed in right now.
 */
export function RecentActivityPanel() {
  const { data, isPending, error, refetch } = useUserActivity(undefined, ACTIVITY_LIMIT);
  const groups = useMemo(() => groupConsecutiveActivity(data ?? []), [data]);

  return (
    <div data-testid="recent-activity-panel">
      <h2 style={headingStyle}>{PANEL_TITLE}</h2>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.55 }}>
        {PANEL_EXPLANATION}
      </p>

      {isPending ? (
        <div role="status" style={{ padding: '8px 0', fontSize: 13, color: 'var(--text-3)' }}>
          Loading recent activity…
        </div>
      ) : error ? (
        <div>
          <p
            role="alert"
            style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--chat-destructive-text)' }}
          >
            Recent activity could not be loaded.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            style={{
              minHeight: 32,
              padding: '0 12px',
              fontSize: 13,
              color: 'var(--text-1)',
              background: 'transparent',
              border: '1px solid var(--settings-border)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      ) : groups.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-3)' }}>
          Nothing recorded on this account yet.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {groups.map((group) => (
            <li
              key={group.id}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 16,
                padding: '10px 0',
                borderTop: '1px solid var(--settings-border)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 13,
                    color: 'var(--text-1)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {group.sentence}
                  {group.count > 1 ? (
                    <span style={{ color: 'var(--text-3)' }}>{` \u00d7${group.count}`}</span>
                  ) : null}
                </span>
                {group.device ? (
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text-3)' }}>
                    {group.device}
                  </span>
                ) : null}
              </div>
              <span style={{ flexShrink: 0, fontSize: 12, color: 'var(--text-3)' }}>
                {formatWhen(group.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
