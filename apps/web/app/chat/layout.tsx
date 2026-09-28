import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AUTH_LOGIN_PATH, AUTH_SIGNUP_PATH } from '@/features/auth/authRoutes';
import { ChatStreamRuntimeProvider } from '@/features/chat/components/ChatStreamRuntimeProvider';
import { GuestChat } from '@/features/chat/guest/GuestChat';
import { getOrCreateAnonSession } from '@/lib/csrf';
import { GUEST_CHAT_CONFIG } from '@/lib/guest-chat/config';
import { isGuestChatAvailable } from '@/lib/guest-chat/guest-chat-access';
import { requireCurrentTermsAcceptance } from '@/lib/server/require-current-terms';
import { getIdentityProvider, getRequestIdentity } from '@/lib/server/identity';
import { sessionExpiredRedirect } from '@/lib/server/session-expired';
import { hasBrowserSessionCookie } from '@/lib/session-cookie';
import ProductRuntimeProviders from '../ProductRuntimeProviders';

export const dynamic = 'force-dynamic';

const GUEST_CHAT_PAGE = '/chat';

function isGuestChatPage(requestedPath: string | null): boolean {
  return (
    requestedPath === GUEST_CHAT_PAGE || Boolean(requestedPath?.startsWith(`${GUEST_CHAT_PAGE}?`))
  );
}

async function guestChatOpen(requestHeaders: Headers): Promise<boolean> {
  const request = new Request(new URL(GUEST_CHAT_PAGE, 'http://localhost'), {
    headers: requestHeaders,
  });
  const visitor = await getOrCreateAnonSession(request);
  return isGuestChatAvailable(request, visitor.id);
}

export default async function ChatLayout({ children }: { children: ReactNode }) {
  const { subject: userId } = await getRequestIdentity();
  const requestHeaders = await headers();
  const requestedPath = requestHeaders.get('x-agi-pathname');
  const redirectTo = requestedPath?.startsWith('/chat') ? requestedPath : '/chat';

  if (!userId) {
    if (isGuestChatPage(requestedPath) && !hasBrowserSessionCookie((await cookies()).getAll())) {
      if (await guestChatOpen(requestHeaders)) {
        return (
          <GuestChat
            dailyLimit={GUEST_CHAT_CONFIG.deviceMessagesPerDay}
            signInHref={AUTH_LOGIN_PATH}
            signUpHref={AUTH_SIGNUP_PATH}
          />
        );
      }
      const signIn = getIdentityProvider().middleware.signInRoute();
      return redirect(`${signIn.path}?${signIn.redirectParam}=${encodeURIComponent(redirectTo)}`);
    }
    return redirect(sessionExpiredRedirect(redirectTo));
  }

  await requireCurrentTermsAcceptance(userId, redirectTo);

  return (
    <ProductRuntimeProviders>
      <ChatStreamRuntimeProvider>{children}</ChatStreamRuntimeProvider>
    </ProductRuntimeProviders>
  );
}
