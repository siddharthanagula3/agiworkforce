'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/lib/identity/client';
import { CheckCircle2, MailCheck, ShieldCheck, XCircle } from 'lucide-react';
import { z } from 'zod';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Button, ButtonRow, Eyebrow, Stack } from '@/features/marketing/components/system';
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
  const { isLoaded, isSignedIn } = useSession();
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
    background: 'var(--agi-card)',
    border: '1px solid var(--agi-rule-strong)',
    borderRadius: 'var(--agi-radius-frame)',
    boxShadow: '0 24px 80px var(--agi-shadow)',
    margin: '72px auto 96px',
    maxWidth: 560,
    padding: 'clamp(24px, 5vw, 42px)',
  } as const;

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section style={cardStyle} aria-labelledby="team-invitation-title">
          <Stack gap="loose">
            <div>
              <div
                aria-hidden="true"
                style={{
                  alignItems: 'center',
                  background: 'var(--agi-ground-2)',
                  border: '1px solid var(--agi-rule)',
                  borderRadius: 16,
                  color: 'var(--agi-ink)',
                  display: 'flex',
                  height: 48,
                  justifyContent: 'center',
                  marginBottom: 22,
                  width: 48,
                }}
              >
                <MailCheck size={24} />
              </div>
              <Eyebrow>AGI team invitation</Eyebrow>
              <h1 className="agi-ds-h1" id="team-invitation-title">
                Join the workspace.
              </h1>
            </div>

            {!tokenReady || !isLoaded ? (
              <p className="agi-ds-prose" data-size="sm" role="status">
                Checking your invitation…
              </p>
            ) : completion ? (
              <Stack gap="tight">
                <div style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
                  {completion.action === 'accept' ? (
                    <CheckCircle2 color="var(--agi-success)" size={22} />
                  ) : (
                    <XCircle color="var(--agi-ink-2)" size={22} />
                  )}
                  <p className="agi-ds-prose" style={{ margin: 0, fontWeight: 650 }}>
                    {completion.action === 'accept'
                      ? `Invitation accepted${completion.role ? ` as ${completion.role}` : ''}.`
                      : 'Invitation declined.'}
                  </p>
                </div>
                {completion.action === 'accept' ? (
                  <ButtonRow>
                    <a href="/settings/team" className="agi-ds-btn" data-variant="primary">
                      Open team settings
                    </a>
                  </ButtonRow>
                ) : (
                  <ButtonRow>
                    <Button href="/">Return to AGI</Button>
                  </ButtonRow>
                )}
              </Stack>
            ) : !token ? (
              <Stack gap="tight">
                <p className="agi-ds-prose" data-size="sm" role="alert">
                  This invitation link is missing or incomplete. Ask the workspace administrator for
                  a new private link.
                </p>
                <ButtonRow>
                  <Button href="/" variant="secondary">
                    Return to AGI
                  </Button>
                </ButtonRow>
              </Stack>
            ) : !isSignedIn ? (
              <Stack gap="tight">
                <p className="agi-ds-prose" data-size="sm">
                  Sign in with the exact email address that received this invitation. Your private
                  token stays in this browser tab while you authenticate.
                </p>
                <ButtonRow>
                  <Button href="/login?redirectTo=%2Finvite">Sign in to continue</Button>
                  <Button href="/signup?redirectTo=%2Finvite" variant="secondary">
                    Create account
                  </Button>
                </ButtonRow>
              </Stack>
            ) : (
              <Stack gap="tight">
                <p className="agi-ds-prose" data-size="sm">
                  Accepting adds this account to the workspace with the role chosen by its
                  administrator and makes it active. You can switch back to Personal or another
                  workspace from the account menu.
                </p>
                <div
                  style={{
                    alignItems: 'flex-start',
                    background: 'var(--agi-ground-2)',
                    border: '1px solid var(--agi-rule)',
                    borderRadius: 'var(--agi-radius-frame)',
                    color: 'var(--agi-ink-2)',
                    display: 'flex',
                    fontSize: 13,
                    gap: 10,
                    lineHeight: 1.55,
                    padding: 14,
                  }}
                >
                  <ShieldCheck size={18} style={{ flexShrink: 0 }} />
                  The invitation is bound to the invited email. A forwarded link cannot grant access
                  to a different signed-in account.
                </div>
                {error ? (
                  <p
                    className="agi-ds-prose"
                    data-size="sm"
                    role="alert"
                    style={{ color: 'var(--agi-error)' }}
                  >
                    {error}
                  </p>
                ) : null}
                <ButtonRow>
                  <button
                    type="button"
                    className="agi-ds-btn"
                    data-variant="primary"
                    disabled={pendingAction !== null}
                    onClick={() => void respond('accept')}
                  >
                    {pendingAction === 'accept' ? 'Joining…' : 'Accept invitation'}
                  </button>
                  <button
                    type="button"
                    className="agi-ds-btn"
                    data-variant="secondary"
                    disabled={pendingAction !== null}
                    onClick={() => void respond('decline')}
                  >
                    {pendingAction === 'decline' ? 'Declining…' : 'Decline'}
                  </button>
                </ButtonRow>
              </Stack>
            )}
          </Stack>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
