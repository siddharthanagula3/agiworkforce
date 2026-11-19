import { useEffect, useState, type ComponentProps } from 'react';
import { AgentActivityTimeline } from './AgentActivityTimeline';

const CLOCK_TICK_MS = 1000;

export function useRunningClock(running: boolean): number | undefined {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(interval);
  }, [running]);
  return running ? nowMs : undefined;
}

export function RunningAgentActivityTimeline(
  props: Omit<ComponentProps<typeof AgentActivityTimeline>, 'nowMs'>,
) {
  const nowMs = useRunningClock(
    props.activity.status === 'running' && props.statusUnavailable !== true,
  );
  return <AgentActivityTimeline {...props} {...(nowMs === undefined ? {} : { nowMs })} />;
}
