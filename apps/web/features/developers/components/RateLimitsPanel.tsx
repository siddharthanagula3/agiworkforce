import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@agiworkforce/ui';

import type { DeveloperRateLimit } from '../types';

const WINDOW_UNITS: Readonly<Record<string, string>> = {
  s: 'second',
  m: 'minute',
  h: 'hour',
  d: 'day',
};

function windowLabel(window: string): string {
  const match = /^(\d+)\s*([smhd])$/.exec(window.trim());
  const count = match ? Number(match[1]) : Number.NaN;
  const unit = match ? WINDOW_UNITS[match[2] ?? ''] : undefined;
  if (!unit || !Number.isFinite(count)) return window;
  return count === 1 ? unit : `${count} ${unit}s`;
}

export function RateLimitsPanel({ rateLimits }: { rateLimits: readonly DeveloperRateLimit[] }) {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">Rate limits</CardTitle>
        <CardDescription>
          Every response carries <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code>{' '}
          and <code>X-RateLimit-Reset</code> for the bucket that counted it, so a client can slow
          down before it is refused.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border" aria-label="Request limits by endpoint">
          {rateLimits.map((row) => (
            <li
              key={row.endpoint}
              className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
            >
              <code className="font-mono text-sm text-foreground">{row.endpoint}</code>
              <span className="text-sm text-muted-foreground">
                {row.limit} requests per {windowLabel(row.window)},{' '}
                {row.perAccount
                  ? 'counted per account'
                  : 'counted per account, or per IP address for an API key'}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
