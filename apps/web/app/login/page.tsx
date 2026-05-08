'use client';

import { Suspense, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getSafeRedirectUrl } from '@/lib/safe-redirect';
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

function LoginForm() {
  const searchParams = useSearchParams();
  const appUrl = useMemo(() => getAppUrl(), []);
  const redirectTo = useMemo(
    () => getSafeRedirectUrl(searchParams.get('redirectTo'), appUrl, '/chat'),
    [searchParams, appUrl],
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'error' | 'info' } | null>(null);

  async function onPasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = redirectTo;
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Sign-in failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function onMagicLink() {
    setMagicLoading(true);
    setMessage(null);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${appUrl}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
        },
      });
      if (error) throw error;
      setMessage({ text: 'Check your email for a sign-in link.', type: 'info' });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Magic link failed', type: 'error' });
    } finally {
      setMagicLoading(false);
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
      <p className="agi-section-eyebrow">Sign in</p>
      <h1 className="agi-page-h1" style={{ marginBottom: 32 }}>
        Welcome back.
      </h1>

      <form
        onSubmit={onPasswordSignIn}
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
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
            autoComplete="current-password"
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
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <button
        type="button"
        onClick={onMagicLink}
        disabled={magicLoading || !email}
        className="agi-cta-ghost"
        style={{
          marginTop: 12,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          padding: 0,
        }}
      >
        {magicLoading ? 'Sending magic link...' : 'Email me a sign-in link →'}
      </button>

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

      <p style={{ marginTop: 32, fontSize: 14, color: 'var(--agi-ink-2)', textAlign: 'center' }}>
        New here?{' '}
        <Link href="/signup" style={{ color: 'var(--agi-ink)' }}>
          Create an account
        </Link>
        {' · '}
        <Link href="/forgot-password" style={{ color: 'var(--agi-ink-2)' }}>
          Forgot password?
        </Link>
      </p>
    </section>
  );
}

export default function LoginPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
        <MarketingFooter />
      </main>
    </div>
  );
}
