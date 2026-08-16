'use client';

import { useEffect, useState } from 'react';

interface SharedMessageTimestampProps {
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
