'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '../../../services/supabase';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

const inputStyle: React.CSSProperties = {
  background: 'var(--agi-bg-2)',
  border: '1px solid var(--agi-rule)',
  color: 'var(--agi-ink)',
  padding: '10px 14px',
  borderRadius: 6,
  fontSize: 14,
  fontFamily: 'inherit',
  width: '100%',
};

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'info' } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setMessage({ text: 'Passwords do not match.', type: 'error' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMessage({ text: 'Password updated. Sign in with the new password.', type: 'info' });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Update failed', type: 'error' });
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
          <p className="agi-section-eyebrow">Update password</p>
          <h1 className="agi-page-h1" style={{ marginBottom: 16 }}>
            New password.
          </h1>
          <p className="agi-page-lede" style={{ marginBottom: 24 }}>
            Set a new account password.{' '}
            <strong>
              This does not change your local key-vault master password — that one is unrecoverable
              by design.
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
                New password
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--agi-ink-quiet)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                Confirm password
              </span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
                style={inputStyle}
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
              {loading ? 'Updating...' : 'Update password'}
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
