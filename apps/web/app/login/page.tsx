'use client';

import { Suspense, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { getSafeRedirectUrl } from '@/lib/safe-redirect';
import {
  getEnabledOAuthProviders,
  OAuthProviderButtons,
  type OAuthProvider,
} from '../../components/auth/OAuthProviderButtons';
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

function ChatPreview() {
  const messages = [
    { role: 'user', text: 'Refactor this into a state machine' },
    {
      role: 'assistant',
      text: 'I can break that into 5 explicit states with typed transitions. Want me to show the diff first?',
    },
    { role: 'user', text: 'Show the diff' },
    {
      role: 'assistant',
      text: "Here's the state machine. Each transition is pure. I kept your error paths and added a timeout guard.",
    },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '20px 0',
      }}
    >
      {messages.map((msg, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}
        >
          <div
            style={{
              maxWidth: '80%',
              padding: '9px 13px',
              borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
              background: msg.role === 'user' ? 'var(--agi-amber-soft)' : 'var(--agi-bg-3)',
              border: '1px solid var(--agi-rule)',
              fontSize: 13,
              lineHeight: 1.5,
              color: 'var(--agi-ink)',
            }}
          >
            {msg.text}
          </div>
        </div>
      ))}
    </div>
  );
}

function LoginForm() {
  const { t } = useTranslation('auth');
  const enabledOAuthProviders = useMemo(() => getEnabledOAuthProviders(), []);
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
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
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
      setMessage({ text: t('checkEmailMagicLink'), type: 'info' });
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Magic link failed', type: 'error' });
    } finally {
      setMagicLoading(false);
    }
  }

  async function onOAuth(provider: OAuthProvider) {
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
    <div style={{ width: '100%' }}>
      {/* Split layout: marketing left, auth right */}
      <div className="agi-login-split">
        {/* Left panel: marketing copy + chat preview */}
        <div className="agi-login-left">
          <div style={{ maxWidth: 440 }}>
            <p
              style={{
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--agi-amber)',
                marginBottom: 20,
                fontFamily: 'var(--agi-font-mono)',
              }}
            >
              agi.workforce
            </p>
            <h1
              style={{
                fontSize: 'clamp(32px, 4vw, 52px)',
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '-0.03em',
                color: 'var(--agi-ink)',
                marginBottom: 20,
              }}
            >
              Think fast,
              <br />
              build faster.
            </h1>
            <p
              style={{
                fontSize: 15,
                color: 'var(--agi-ink-2)',
                lineHeight: 1.6,
                marginBottom: 32,
              }}
            >
              One workspace. Every major model. Six surfaces.
            </p>
            <div
              style={{
                background: 'var(--agi-bg-2)',
                border: '1px solid var(--agi-rule)',
                borderRadius: 10,
                padding: '4px 16px 16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 0',
                  borderBottom: '1px solid var(--agi-rule)',
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--agi-rule)',
                    display: 'inline-block',
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--agi-ink-quiet)',
                    fontFamily: 'var(--agi-font-mono)',
                  }}
                >
                  New Chat
                </span>
              </div>
              <ChatPreview />
            </div>
          </div>
        </div>

        {/* Right panel: auth card */}
        <div className="agi-login-right">
          <div style={{ maxWidth: 420, width: '100%' }}>
            <p className="agi-section-eyebrow" style={{ marginBottom: 8 }}>
              {t('signInEyebrow')}
            </p>
            <h2
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '-0.025em',
                color: 'var(--agi-ink)',
                marginBottom: 32,
              }}
            >
              {t('welcomeBackHeading')}
            </h2>

            {enabledOAuthProviders.length > 0 && (
              <>
                <OAuthProviderButtons
                  enabledProviders={enabledOAuthProviders}
                  loadingProvider={oauthLoading}
                  onOAuth={onOAuth}
                />

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
                  {t('orContinueWithEmail')}
                  <span style={{ flex: 1, height: 1, background: 'var(--agi-rule)' }} />
                </div>
              </>
            )}

            <form
              onSubmit={onPasswordSignIn}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>{t('email')}</span>
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
                <span style={labelStyle}>{t('password')}</span>
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
                    color:
                      message.type === 'error' ? 'var(--agi-error, #ff6b6b)' : 'var(--agi-amber)',
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
                {loading ? t('signingIn') : t('signIn')}
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
              {magicLoading ? t('sendingMagicLink') : `${t('emailMagicLinkCta')} →`}
            </button>

            <p
              style={{
                marginTop: 32,
                fontSize: 14,
                color: 'var(--agi-ink-2)',
                textAlign: 'center',
              }}
            >
              {t('newHere')}{' '}
              <Link href="/signup" style={{ color: 'var(--agi-ink)' }}>
                {t('createAccount')}
              </Link>
              {' · '}
              <Link href="/forgot-password" style={{ color: 'var(--agi-ink-2)' }}>
                {t('forgotPassword')}
              </Link>
            </p>

            {/* W1-08: Download desktop app CTA */}
            <div
              style={{
                marginTop: 32,
                padding: '16px 18px',
                background: 'var(--agi-bg-2)',
                border: '1px solid var(--agi-rule)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--agi-ink)',
                    margin: 0,
                    marginBottom: 3,
                  }}
                >
                  {t('downloadDesktopHeading')}
                </p>
                <p style={{ fontSize: 12, color: 'var(--agi-ink-quiet)', margin: 0 }}>
                  {t('downloadDesktopBody')}
                </p>
              </div>
              <Link
                href="/download"
                className="agi-top-cta"
                style={{
                  flexShrink: 0,
                  fontSize: 12,
                  padding: '7px 14px',
                  textDecoration: 'none',
                }}
              >
                {t('downloadCta')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
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

      <style jsx global>{`
        .agi-login-split {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 80px;
          padding: 60px 0 80px;
          min-height: 80vh;
          align-items: center;
        }
        .agi-login-left {
          display: flex;
          align-items: center;
          justify-content: flex-start;
        }
        .agi-login-right {
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 8px;
        }
        @media (max-width: 860px) {
          .agi-login-split {
            grid-template-columns: 1fr;
            gap: 40px;
            padding: 40px 0 60px;
          }
          .agi-login-left {
            display: none;
          }
          .agi-login-right {
            justify-content: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
