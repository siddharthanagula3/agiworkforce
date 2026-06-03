import { SignIn } from '@clerk/nextjs';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { Header } from '../../components/layout/Header';
import { getSafeRedirectUrl } from '../../lib/safe-redirect';

const getAppUrl = () => process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';

export default async function LoginPage({
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
          <SignIn
            routing="hash"
            signUpUrl="/signup"
            fallbackRedirectUrl={redirectTo}
            signUpFallbackRedirectUrl={redirectTo}
            appearance={{
              variables: {
                colorPrimary: '#d4a85f',
                colorBackground: '#161713',
                colorText: '#eee7d7',
                colorTextSecondary: '#aaa395',
                colorInputBackground: '#202119',
                colorInputText: '#eee7d7',
                borderRadius: '0.875rem',
              },
              elements: {
                card: 'border border-white/10 shadow-2xl',
                headerTitle: 'text-foreground',
                headerSubtitle: 'text-muted-foreground',
                formButtonPrimary: 'font-semibold',
                footerActionLink: 'font-semibold',
              },
            }}
          />
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
