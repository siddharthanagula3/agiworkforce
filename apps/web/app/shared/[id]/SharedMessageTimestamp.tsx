'use client';

/**
 * AUDIT-FIX BUG-30: a client-only boundary for one locale-dependent value.
 *
 * `page.tsx` is an async SERVER component and formatted each message time with
 * `new Date(...).toLocaleString(undefined, ...)`. On the server `undefined`
 * resolves to the DEPLOYMENT's locale and timezone, so every viewer on earth
 * read the datacenter's clock — and because React keeps the server's DOM for
 * the first paint, nothing ever corrected it.
 *
 * This component renders nothing until it has mounted (so SSR and the first
 * client render agree byte for byte), then formats in the reader's own locale
 * and timezone. The machine-readable value is always present on `dateTime`, so
 * the timestamp is never lost — only its human rendering waits for hydration.
 */

import { useEffect, useState } from 'react';

interface SharedMessageTimestampProps {
  /** ISO-8601 timestamp as persisted with the shared message. */
  isoTimestamp: string;
  className?: string;
}

export function SharedMessageTimestamp({ isoTimestamp, className }: SharedMessageTimestampProps) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    const parsed = new Date(isoTimestamp);
    if (Number.isNaN(parsed.getTime())) {
      setLabel('');
      return;
    }
    setLabel(
      parsed.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    );
  }, [isoTimestamp]);

  return (
    <time dateTime={isoTimestamp} className={className}>
      {label}
    </time>
  );
}
