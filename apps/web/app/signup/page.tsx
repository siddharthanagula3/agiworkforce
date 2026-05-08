'use client';

import { Suspense, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '../../services/supabase';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

const getAppUrl = () =>
  process.env['NEXT_PUBLIC_APP_URL'] ||
  (typeof window !== 'undefined' ? window.location.origin : '');

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

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--agi-ink-quiet)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

function SignupForm() {
  const searchParams = useSearchParams();
  const appUrl = useMemo(() => getAppUrl(), []);
  const redirectTo = searchParams.get('redirectTo') || '/chat';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'info' } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${appUrl}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
          data: { full_name: name || undefined },
        },
      });
      if (error) throw error;
      setMessage({
        text: 'Account created. Check your email to verify and sign in.',
        type: 'info',
      });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Sign-up failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function onOAuth(provider: 'google' | 'github') {
    setOauthLoading(provider);
    try {
      const supabase = getSupabaseClient();
      await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${appUrl}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
        },
      });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'OAuth failed', type: 'error' });
      setOauthLoading(null);
    }
  }

  return (
    <section
      className="agi-section"
      style={{ borderBottom: 'none', maxWidth: 440, margin: '0 auto' }}
    >
      <p className="agi-section-eyebrow">Create account</p>
      <h1 className="agi-page-h1" style={{ marginBottom: 32 }}>
        Get started.
      </h1>

      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={labelStyle}>Name (optional)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={labelStyle}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={labelStyle}>Password</span>
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
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          margin: '28px 0',
          color: 'var(--agi-ink-quiet)',
          fontSize: 12,
        }}
      >
        <span style={{ flex: 1, height: 1, background: 'var(--agi-rule)' }} />
        OR
        <span style={{ flex: 1, height: 1, background: 'var(--agi-rule)' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="button"
          onClick={() => onOAuth('google')}
          disabled={oauthLoading !== null}
          className="agi-tier-cta agi-tier-cta--ghost"
          style={{ border: '1px solid var(--agi-rule-strong)', cursor: 'pointer' }}
        >
          {oauthLoading === 'google' ? 'Redirecting...' : 'Continue with Google'}
        </button>
        <button
          type="button"
          onClick={() => onOAuth('github')}
          disabled={oauthLoading !== null}
          className="agi-tier-cta agi-tier-cta--ghost"
          style={{ border: '1px solid var(--agi-rule-strong)', cursor: 'pointer' }}
        >
          {oauthLoading === 'github' ? 'Redirecting...' : 'Continue with GitHub'}
        </button>
      </div>

      <p
        style={{ marginTop: 32, fontSize: 13, color: 'var(--agi-ink-quiet)', textAlign: 'center' }}
      >
        By creating an account you accept the{' '}
        <Link href="/terms" style={{ color: 'var(--agi-ink-2)' }}>
          terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" style={{ color: 'var(--agi-ink-2)' }}>
          privacy policy
        </Link>
        .
      </p>

      <p style={{ marginTop: 16, fontSize: 14, color: 'var(--agi-ink-2)', textAlign: 'center' }}>
        Already have an account?{' '}
        <Link href="/login" style={{ color: 'var(--agi-ink)' }}>
          Sign in
        </Link>
      </p>
    </section>
  );
}

export default function SignupPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <Suspense fallback={null}>
          <SignupForm />
        </Suspense>
        <MarketingFooter />
      </main>
    </div>
  );
}
