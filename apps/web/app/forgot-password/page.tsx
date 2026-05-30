'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSignIn } from '@clerk/nextjs';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export default function ForgotPasswordPage() {
  const { signIn } = useSignIn();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'info' } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    setLoading(true);
    setMessage(null);
    try {
      // Clerk v7 signals API: initialize sign-in with identifier, then trigger
      // the reset_password_email_code flow via the dedicated resetPasswordEmailCode
      // sub-object. The create() call pins the account; sendCode() dispatches the email.
      const { error: createError } = await signIn.create({ identifier: email });
      if (createError) {
        setMessage({ text: createError.message ?? 'Reset failed', type: 'error' });
        return;
      }
      const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();
      if (sendError) {
        setMessage({ text: sendError.message ?? 'Reset failed', type: 'error' });
        return;
      }
      setMessage({
        text: 'Reset code sent. Check your inbox, then sign in at /login to enter the code and set a new password.',
        type: 'info',
      });
    } catch (err) {
      const clerkErr = err as { errors?: Array<{ message?: string }> };
      const msg =
        clerkErr?.errors?.[0]?.message ?? (err instanceof Error ? err.message : 'Reset failed');
      setMessage({ text: msg, type: 'error' });
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
            We&rsquo;ll email you a reset code.{' '}
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
                  color: message.type === 'error' ? 'var(--agi-error)' : 'var(--agi-amber)',
                  fontSize: 13,
                  margin: 0,
                }}
              >
                {message.text}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || !signIn}
              className="agi-cta-primary"
              style={{ border: 'none', cursor: 'pointer', textAlign: 'center' }}
            >
              {loading ? 'Sending...' : 'Send reset code'}
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
