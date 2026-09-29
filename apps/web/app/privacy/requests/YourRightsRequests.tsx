'use client';

import { useEffect, useState } from 'react';
import { Spinner } from '@agiworkforce/ui';

type RequestStatus = 'received' | 'in_progress' | 'resolved' | 'rejected';

interface OwnRequest {
  reference: string;
  requestType: string;
  status: RequestStatus;
  createdAt: string;
  resolvedAt: string | null;
}

const TYPE_LABEL: Readonly<Record<string, string>> = {
  access: 'Access',
  correction: 'Correction',
  erasure: 'Erasure',
  withdrawal: 'Consent withdrawal',
  nomination: 'Nomination',
  grievance: 'Grievance',
};

const STATUS_LABEL: Readonly<Record<RequestStatus, string>> = {
  received: 'Received',
  in_progress: 'In progress',
  resolved: 'Resolved',
  rejected: 'Declined',
};

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'loadError' }
  | { kind: 'ready'; requests: OwnRequest[] };

export function YourRightsRequests({ refreshKey }: { refreshKey: number }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/privacy/requests', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        if (cancelled) return;
        if (response.status === 401 || response.status === 403) {
          setState({ kind: 'signed-out' });
          return;
        }
        if (!response.ok) {
          setState({ kind: 'loadError' });
          return;
        }
        const body = (await response.json()) as { requests?: OwnRequest[] };
        if (!cancelled) setState({ kind: 'ready', requests: body.requests ?? [] });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'loadError' });
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (state.kind === 'signed-out') return null;
  if (state.kind === 'loading') {
    return (
      <p className="agi-ds-prose flex items-center gap-2" data-size="sm" role="status">
        <Spinner size="sm" />
        <span>Loading your requests</span>
      </p>
    );
  }

  return (
    <div className="agi-ds-stack" data-gap="tight">
      <h3 className="agi-ds-h3">Your requests</h3>
      {state.kind === 'loadError' ? (
        <p className="agi-ds-prose" data-size="sm" role="alert">
          Your requests could not be loaded. Reload the page to try again.
        </p>
      ) : state.requests.length === 0 ? (
        <p className="agi-ds-prose" data-size="sm">
          You have not made a request from this account.
        </p>
      ) : (
        <ul className="agi-ds-stack" data-gap="tight">
          {state.requests.map((request) => (
            <li key={request.reference} className="agi-ds-prose" data-size="sm">
              <strong>{request.reference}</strong> ·{' '}
              {TYPE_LABEL[request.requestType] ?? request.requestType} ·{' '}
              {STATUS_LABEL[request.status]} · made {formatDate(request.createdAt)}
              {request.resolvedAt ? `, closed ${formatDate(request.resolvedAt)}` : ''}
            </li>
          ))}
        </ul>
      )}
      <p className="agi-ds-prose" data-size="sm">
        Requests made while signed out are answered by email and are not listed here.
      </p>
    </div>
  );
}
