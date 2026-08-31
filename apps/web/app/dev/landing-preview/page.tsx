import { MarketingLanding } from '@/features/marketing/components/MarketingLanding';

/**
 * The marketing landing, rendered without the auth branch that hides it.
 *
 * `/` returns the chat app to anyone signed in, so the landing page - the one
 * surface the marketing work most needs to see - is invisible to a signed-in
 * developer. Signing out to look at it costs the session; this route costs
 * nothing and is unreachable in production, because the /dev layout calls
 * notFound() there.
 *
 * It renders the same component `/` does, so what appears here is what a
 * signed-out visitor gets, not an approximation of it.
 */
export const dynamic = 'force-dynamic';

export default function LandingPreviewRoute() {
  return <MarketingLanding />;
}
