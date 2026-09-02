import Link from 'next/link';
import { COMING_SOON_LABEL } from '@/lib/marketing-constants';

export type SurfaceStatusProps =
  | { state: 'live'; name: string; detail: string; action?: { label: string; href: string } }
  | { state: 'pending'; name: string; blockedOn: string }
  | { state: 'absent'; name: string; detail: string };

const STATE_MARK = {
  live: 'Live',
  pending: 'Pending',
  absent: COMING_SOON_LABEL,
} as const;

export function SurfaceStatus(props: SurfaceStatusProps) {
  return (
    <div className="agi-ds-status agi-ds-full" data-state={props.state}>
      <div className="agi-ds-status-head">
        <h3 className="agi-ds-status-name">{props.name}</h3>
        <span className="agi-ds-status-mark">{STATE_MARK[props.state]}</span>
      </div>
      <p className="agi-ds-prose" data-size="sm">
        {props.state === 'pending' ? props.blockedOn : props.detail}
      </p>
      {props.state === 'live' && props.action ? (
        <Link href={props.action.href} className="agi-ds-link">
          {props.action.label}
        </Link>
      ) : null}
    </div>
  );
}
