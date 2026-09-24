'use client';

import * as React from 'react';
import { ShieldQuestion } from 'lucide-react';
import { cn } from '../cn';
import { Button } from './Button';
import { Spinner } from './Spinner';

export interface ApprovalCardRequest {
  id: string;
  name: string;
  detail?: string;
}

export interface ApprovalCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: string;
  requests: readonly ApprovalCardRequest[];
  approveLabel: string;
  denyLabel: string;
  onApprove: () => void;
  onDeny: () => void;
  pending?: boolean;
  meta?: React.ReactNode;
  children?: React.ReactNode;
}

function ApprovalCard({
  title,
  requests,
  approveLabel,
  denyLabel,
  onApprove,
  onDeny,
  pending = false,
  meta,
  children,
  className,
  ...props
}: ApprovalCardProps) {
  return (
    <div
      role="group"
      aria-label={title}
      aria-busy={pending || undefined}
      className={cn(
        'rounded-md border border-[var(--chat-warning-border)] bg-[var(--chat-warning-bg)] p-3',
        className,
      )}
      {...props}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <ShieldQuestion className="h-3.5 w-3.5 text-[var(--warning-text)]" aria-hidden />
        {title}
      </p>
      {requests.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {requests.map((request) => (
            <li key={request.id} className="min-w-0">
              <span className="block truncate text-xs font-medium text-foreground">
                {request.name}
              </span>
              {request.detail ? (
                <span className="block truncate font-mono text-caption text-muted-foreground">
                  {request.detail}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {children}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-7 px-2.5 text-xs" disabled={pending} onClick={onApprove}>
          {pending ? <Spinner size="sm" className="mr-1 h-3.5 w-3.5" aria-hidden /> : null}
          {approveLabel}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs"
          disabled={pending}
          onClick={onDeny}
        >
          {denyLabel}
        </Button>
        {meta ? <span className="text-caption text-muted-foreground">{meta}</span> : null}
      </div>
    </div>
  );
}
ApprovalCard.displayName = 'ApprovalCard';

export { ApprovalCard };
