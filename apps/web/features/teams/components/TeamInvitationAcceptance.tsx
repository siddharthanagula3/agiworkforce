'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { CheckCircle2, MailCheck, ShieldCheck, XCircle } from 'lucide-react';
import { z } from 'zod';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { getAuthToken } from '@shared/lib/get-auth-token';
import { getCsrfToken } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

const INVITATION_TOKEN_STORAGE_KEY = 'agi.team.invitation-token';

type Completion = { action: 'accept' | 'decline'; role?: string } | null;

const InvitationResponseSchema = z.object({
  membership: z.object({ role: z.enum(['owner', 'admin', 'member', 'viewer']) }).optional(),
});

function readErrorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback;
  const error = (value as { error?: unknown }).error;
  if (typeof error === 'string' && error) return error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

export function TeamInvitationAcceptance() {
  const { isLoaded, isSignedIn } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);
  const [pendingAction, setPendingAction] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<Completion>(null);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const fragmentToken = fragment.get('token');
    if (fragmentToken && fragmentToken.length >= 20 && fragmentToken.length <= 512) {
      window.sessionStorage.setItem(INVITATION_TOKEN_STORAGE_KEY, fragmentToken);
      window.history.replaceState(null, '', '/invite');
    }

    setToken(window.sessionStorage.getItem(INVITATION_TOKEN_STORAGE_KEY));
    setTokenReady(true);
  }, []);

  async function respond(action: 'accept' | 'decline') {
    if (!token) return;
    setPendingAction(action);
    setError(null);

    try {
      const authToken = await getAuthToken();
      if (!authToken) throw new Error('Sign in with the invited email address to continue.');
      const csrfToken = await getCsrfToken();
      const response = await fetch('/api/settings/team/invitations/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ token, action }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(readErrorMessage(body, `The invitation could not be ${action}ed.`));
      }

      const parsedBody = InvitationResponseSchema.safeParse(body);
      if (!parsedBody.success) {
        throw new Error('The server returned an invalid invitation response. Please try again.');
      }

      window.sessionStorage.removeItem(INVITATION_TOKEN_STORAGE_KEY);
      setToken(null);
      setCompletion({ action, role: parsedBody.data.membership?.role });
    } catch (caught) {
      setError(toUserMessage(caught, 'The invitation could not be updated.'));
    } finally {
      setPendingAction(null);
    }
  }

  const cardStyle = {
    background: 'var(--bg-elev)',
    border: '1px solid var(--settings-border, var(--border))',
    borderRadius: 'var(--radius-xl)',
    boxShadow: '0 24px 80px color-mix(in srgb, #000 24%, transparent)',
    margin: '72px auto 96px',
    maxWidth: 560,
    padding: 'clamp(24px, 5vw, 42px)',
  } as const;

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section style={cardStyle} aria-labelledby="team-invitation-title">
          <div
            aria-hidden="true"
            style={{
              alignItems: 'center',
              background:
                'color-mix(in srgb, var(--chat-accent-primary, #c8892a) 14%, transparent)',
              borderRadius: 16,
              color: 'var(--chat-accent-primary-text)',
              display: 'flex',
              height: 48,
              justifyContent: 'center',
              marginBottom: 22,
              width: 48,
            }}
          >
            <MailCheck size={24} />
          </div>
          <p className="agi-fl-eyebrow" style={{ marginBottom: 10 }}>
            AGI Team invitation
          </p>
          <h1
            id="team-invitation-title"
            style={{
              color: 'var(--text-1)',
              fontFamily: 'var(--serif)',
              fontSize: 'clamp(30px, 5vw, 44px)',
              fontWeight: 500,
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
              margin: 0,
            }}
          >
            Join the workspace
          </h1>

          {!tokenReady || !isLoaded ? (
            <p role="status" style={{ color: 'var(--text-3)', lineHeight: 1.6, marginTop: 20 }}>
              Checking your invitation…
            </p>
          ) : completion ? (
            <div style={{ marginTop: 24 }}>
              <div style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
                {completion.action === 'accept' ? (
                  <CheckCircle2 color="var(--success, #22c55e)" size={22} />
                ) : (
                  <XCircle color="var(--text-3)" size={22} />
                )}
                <p style={{ color: 'var(--text-1)', fontSize: 16, fontWeight: 650, margin: 0 }}>
                  {completion.action === 'accept'
                    ? `Invitation accepted${completion.role ? ` as ${completion.role}` : ''}.`
                    : 'Invitation declined.'}
                </p>
              </div>
              {completion.action === 'accept' ? (
                <a
                  href="/settings/team"
                  className="agi-fl-cta agi-fl-cta--primary"
                  style={{ display: 'inline-flex', marginTop: 22 }}
                >
                  Open Team settings
                </a>
              ) : (
                <Link
                  href="/"
                  className="agi-fl-cta agi-fl-cta--primary"
                  style={{ display: 'inline-flex', marginTop: 22 }}
                >
                  Return to AGI
                </Link>
              )}
            </div>
          ) : !token ? (
            <div style={{ marginTop: 22 }}>
              <p role="alert" style={{ color: 'var(--text-2)', lineHeight: 1.6 }}>
                This invitation link is missing or incomplete. Ask the workspace administrator for a
                new private link.
              </p>
              <Link href="/" className="agi-fl-cta agi-fl-cta--secondary">
                Return to AGI
              </Link>
            </div>
          ) : !isSignedIn ? (
            <div style={{ marginTop: 22 }}>
              <p style={{ color: 'var(--text-2)', lineHeight: 1.6 }}>
                Sign in with the exact email address that received this invitation. Your private
                token stays in this browser tab while you authenticate.
              </p>
              <div className="agi-fl-cta-row">
                <Link href="/login?redirectTo=%2Finvite" className="agi-fl-cta agi-fl-cta--primary">
                  Sign in to continue
                </Link>
                <Link
                  href="/signup?redirectTo=%2Finvite"
                  className="agi-fl-cta agi-fl-cta--secondary"
                >
                  Create account
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 22 }}>
              <p style={{ color: 'var(--text-2)', lineHeight: 1.6 }}>
                Accepting adds this account to the workspace with the role chosen by its
                administrator and makes it active. You can switch back to Personal or another
                workspace from the account menu.
              </p>
              <div
                style={{
                  alignItems: 'flex-start',
                  background: 'var(--bg-base)',
                  border: '1px solid var(--settings-border, var(--border))',
                  borderRadius: 'var(--radius-lg)',
                  color: 'var(--text-3)',
                  display: 'flex',
                  fontSize: 13,
                  gap: 10,
                  lineHeight: 1.55,
                  margin: '20px 0',
                  padding: 14,
                }}
              >
                <ShieldCheck size={18} style={{ flexShrink: 0 }} />
                The invitation is bound to the invited email. A forwarded link cannot grant access
                to a different signed-in account.
              </div>
              {error ? (
                <p role="alert" style={{ color: 'var(--settings-destructive-text)' }}>
                  {error}
                </p>
              ) : null}
              <div className="agi-fl-cta-row">
                <button
                  type="button"
                  className="agi-fl-cta agi-fl-cta--primary"
                  disabled={pendingAction !== null}
                  onClick={() => void respond('accept')}
                >
                  {pendingAction === 'accept' ? 'Joining…' : 'Accept invitation'}
                </button>
                <button
                  type="button"
                  className="agi-fl-cta agi-fl-cta--secondary"
                  disabled={pendingAction !== null}
                  onClick={() => void respond('decline')}
                >
                  {pendingAction === 'decline' ? 'Declining…' : 'Decline'}
                </button>
              </div>
            </div>
          )}
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
