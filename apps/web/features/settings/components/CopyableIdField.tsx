'use client';

import { useCallback, useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyableIdFieldProps {
  id: string;
  label: string;
  value: string | null;
  hint: string;
  copyLabel: string;
}

/**
 * A read-only identifier with a copy button. Extracted from the User ID row so
 * the Organization ID row beside it is the same control rather than a second
 * hand-styled copy of one.
 */
export function CopyableIdField({ id, label, value, hint, copyLabel }: CopyableIdFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused by permission or a non-secure context.
      // The value is selectable in the field either way, so failing quietly
      // beats an error about something the user can still do by hand.
    }
  }, [value]);

  return (
    <>
      <label
        htmlFor={id}
        style={{
          display: 'block',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-2)',
          marginBottom: 8,
        }}
      >
        {label}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          id={id}
          type="text"
          readOnly
          value={value ?? 'Not available'}
          style={{
            flex: 1,
            fontSize: 13,
            fontFamily: 'var(--mono)',
            padding: '8px 12px',
            background: 'var(--bg-base)',
            color: 'var(--text-3)',
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius-md)',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        />
        <button
          type="button"
          onClick={() => void handleCopy()}
          disabled={!value}
          aria-label={copyLabel}
          title="Copy"
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 34,
            height: 34,
            padding: 0,
            background: 'transparent',
            border: '1px solid var(--settings-border)',
            borderRadius: 'var(--radius-md)',
            color: copied ? 'var(--teal)' : 'var(--text-3)',
            cursor: value ? 'pointer' : 'not-allowed',
            opacity: value ? 1 : 0.4,
            transition: 'color 0.15s',
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '8px 0 0' }}>{hint}</p>
    </>
  );
}
