'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '../../services/supabase';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

const getAppUrl = () =>
  process.env['NEXT_PUBLIC_APP_URL'] ||
  (typeof window !== 'undefined' ? window.location.origin : '');

export default function ForgotPasswordPage() {
  const appUrl = useMemo(() => getAppUrl(), []);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'info' } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl}/auth/update-password`,
      });
      if (error) throw error;
      setMessage({ text: 'Reset email sent. Check your inbox.', type: 'info' });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Reset failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section
          className="agi-section"
          style={{ borderBottom: 'none', maxWidth: 440, margin: '0 auto' }}
        >
          <p className="agi-section-eyebrow">Reset password</p>
          <h1 className="agi-page-h1" style={{ marginBottom: 16 }}>
            Forgot your password?
          </h1>
          <p className="agi-page-lede" style={{ marginBottom: 28 }}>
            We&rsquo;ll email you a link to reset it.{' '}
            <strong>
              Note: this resets your account password. Your local key-vault master password is
              separate and unrecoverable by design.
            </strong>
          </p>
          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--agi-ink-quiet)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{
                  background: 'var(--agi-bg-2)',
                  border: '1px solid var(--agi-rule)',
                  color: 'var(--agi-ink)',
                  padding: '10px 14px',
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: 'inherit',
                  width: '100%',
                }}
              />
            </label>
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
              disabled={loading}
              className="agi-cta-primary"
              style={{ border: 'none', cursor: 'pointer', textAlign: 'center' }}
            >
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
          <p
            style={{ marginTop: 24, fontSize: 14, color: 'var(--agi-ink-2)', textAlign: 'center' }}
          >
            <Link href="/login" style={{ color: 'var(--agi-ink)' }}>
              Back to sign in
            </Link>
          </p>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
