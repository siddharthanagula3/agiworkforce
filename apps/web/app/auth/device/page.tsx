'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

const inputStyle: React.CSSProperties = {
  background: 'var(--agi-bg-2)',
  border: '1px solid var(--agi-rule)',
  color: 'var(--agi-ink)',
  padding: '12px 16px',
  borderRadius: 6,
  fontSize: 18,
  fontFamily: 'var(--agi-font-mono)',
  letterSpacing: '0.2em',
  textAlign: 'center',
  width: '100%',
};

function DeviceForm() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState(searchParams.get('user_code') || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'info' } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/device/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_code: code.trim().toUpperCase() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Approval failed');
      }
      setMessage({ text: 'Device approved. You can close this tab.', type: 'info' });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Approval failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="agi-section"
      style={{ borderBottom: 'none', maxWidth: 460, margin: '0 auto' }}
    >
      <p className="agi-section-eyebrow">Authorize a device</p>
      <h1 className="agi-page-h1" style={{ marginBottom: 16 }}>
        Connect a device.
      </h1>
      <p className="agi-page-lede" style={{ marginBottom: 24 }}>
        Enter the code shown on your CLI or other surface.{' '}
        <strong>
          You&rsquo;re authorizing that device to act as you. If you didn&rsquo;t initiate this,
          close the tab.
        </strong>
      </p>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
          placeholder="ABCD-1234"
          autoComplete="off"
          maxLength={12}
          style={inputStyle}
        />
        {message && (
          <p
            style={{
              color: message.type === 'error' ? '#ff6b6b' : 'var(--agi-amber)',
              fontSize: 13,
              margin: 0,
            }}
          >
            {message.text}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !code}
          className="agi-cta-primary"
          style={{ border: 'none', cursor: 'pointer', textAlign: 'center' }}
        >
          {loading ? 'Approving...' : 'Approve device'}
        </button>
      </form>
      <p style={{ marginTop: 24, fontSize: 14, color: 'var(--agi-ink-2)', textAlign: 'center' }}>
        <Link href="/" style={{ color: 'var(--agi-ink)' }}>
          Cancel
        </Link>
      </p>
    </section>
  );
}

export default function AuthDevicePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <Suspense fallback={null}>
          <DeviceForm />
        </Suspense>
        <MarketingFooter />
      </main>
    </div>
  );
}
