import { SignUp } from '@clerk/nextjs';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { Header } from '../../components/layout/Header';
import { getSafeRedirectUrl } from '../../lib/safe-redirect';

const getAppUrl = () => process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; next?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = getSafeRedirectUrl(params.redirectTo ?? params.next, getAppUrl(), '/chat');

  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section
          className="agi-section"
          style={{
            minHeight: 'calc(100vh - 220px)',
            display: 'grid',
            placeItems: 'center',
            borderBottom: 'none',
          }}
        >
          <SignUp
            routing="hash"
            signInUrl="/login"
            fallbackRedirectUrl={redirectTo}
            signInFallbackRedirectUrl={redirectTo}
          />
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
